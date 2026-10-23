import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import net from 'node:net';
import { encode, inputMessage, LineDecoder, PROTOCOL_VERSION, resizeMessage } from './protocol.ts';
import type { Inbound, Outbound, Session } from './protocol.ts';

export class CockpitUnavailable extends Error {}
export class ProtocolMismatch extends Error {}

export interface CockpitClientOptions {
  socketPath: string;
  clientName: string;
  /** Reconnect and re-attach after the socket drops. Off in tests that assert a single connection. */
  reconnect?: boolean;
  reconnectDelayMs?: number;
  /** A socket that accepts but never answers `hello` (a stuck sidecar) fails after this long. */
  handshakeTimeoutMs?: number;
}

/**
 * Client of the Cockpit sidecar server: it lists, watches, types into (`input`) and sizes (`resize`)
 * sessions, and never kills one. It only ever connects to an existing socket: it never starts,
 * replaces or kills the server (the desktop app evicts servers it does not own).
 *
 * Events: 'output' (id, offset, bytes), 'exited' (id, code), 'session-error' (code, detail),
 * 'disconnected' (), 'reconnected' ().
 */
export class CockpitClient extends EventEmitter {
  private socket: net.Socket | null = null;
  private decoder = new LineDecoder();
  private nextRid = 1;
  private pendingLists = new Map<number, { resolve: (sessions: Session[]) => void; reject: (err: Error) => void }>();
  /** Next byte offset expected per attached session; used to resume after a reconnect. */
  private attached = new Map<string, number>();
  private closing = false;
  private readonly opts: Required<CockpitClientOptions>;

  constructor(opts: CockpitClientOptions) {
    super();
    this.opts = { reconnect: true, reconnectDelayMs: 1000, handshakeTimeoutMs: 5000, ...opts };
  }

  get isConnected(): boolean {
    return this.socket !== null && !this.socket.destroyed;
  }

  async connect(): Promise<{ server: string }> {
    if (!existsSync(this.opts.socketPath)) {
      throw new CockpitUnavailable(`Cockpit is not running (no socket at ${this.opts.socketPath})`);
    }
    this.closing = false;
    this.decoder = new LineDecoder();
    const socket = net.createConnection(this.opts.socketPath);
    socket.setEncoding('utf8');
    this.socket = socket;

    return new Promise((resolve, reject) => {
      let handshaken = false;
      const timer = setTimeout(() => {
        reject(new CockpitUnavailable('Cockpit did not answer the handshake'));
        socket.destroy();
      }, this.opts.handshakeTimeoutMs);
      socket.on('error', (err: NodeJS.ErrnoException) => {
        if (!handshaken) reject(new CockpitUnavailable(`cannot reach Cockpit: ${err.code ?? err.message}`));
      });
      socket.on('connect', () => this.send({ t: 'hello', v: PROTOCOL_VERSION, client: this.opts.clientName }));
      socket.on('data', (chunk: string) => {
        for (const msg of this.decoder.push(chunk)) {
          if (!handshaken) {
            if (msg.t === 'hello.ack') {
              handshaken = true;
              clearTimeout(timer);
              resolve({ server: String((msg as { server?: unknown }).server ?? '?') });
            } else if (msg.t === 'err') {
              clearTimeout(timer);
              const err = msg as { code: string; detail?: string };
              reject(
                err.code === 'version_mismatch'
                  ? new ProtocolMismatch(`Cockpit protocol differs (${err.detail ?? '?'}); cockpit-tower supports v${PROTOCOL_VERSION}`)
                  : new CockpitUnavailable(`handshake refused: ${err.code}`),
              );
            }
            continue;
          }
          this.dispatch(msg);
        }
      });
      socket.on('close', () => {
        clearTimeout(timer);
        if (this.socket === socket) this.socket = null;
        this.failPendingLists(new CockpitUnavailable('Cockpit connection closed'));
        if (!handshaken) return reject(new CockpitUnavailable('Cockpit closed the connection during the handshake'));
        if (this.closing) return;
        this.emit('disconnected');
        if (this.opts.reconnect) void this.reconnectLoop();
      });
    });
  }

  /** A list Cockpit does not answer within `timeoutMs` is rejected and forgotten. */
  list(timeoutMs = 10000): Promise<Session[]> {
    if (!this.isConnected) return Promise.reject(new CockpitUnavailable('not connected to Cockpit'));
    const rid = this.nextRid++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingLists.delete(rid);
        reject(new CockpitUnavailable('Cockpit did not answer pty.list'));
      }, timeoutMs);
      const done = <T>(fn: (v: T) => void) => (v: T) => {
        clearTimeout(timer);
        fn(v);
      };
      this.pendingLists.set(rid, { resolve: done(resolve), reject: done(reject) });
      this.send({ t: 'pty.list', rid });
    });
  }

  /** Records the attachment and sends it now if connected; a reconnect replays whatever is recorded then. */
  attach(id: string, from = 0): void {
    this.attached.set(id, from);
    this.send({ t: 'pty.attach', id, from });
  }

  detach(id: string): void {
    if (!this.attached.delete(id)) return;
    this.send({ t: 'pty.detach', id });
  }

  /** Writes bytes to a session's PTY. Returns false, with nothing sent, while disconnected. */
  input(id: string, bytes: Uint8Array): boolean {
    if (!this.isConnected) return false;
    this.send(inputMessage(id, bytes));
    return true;
  }

  /** Sets a session's PTY size, for every client. Returns false, with nothing sent, while disconnected. */
  resize(id: string, cols: number, rows: number): boolean {
    if (!this.isConnected) return false;
    this.send(resizeMessage(id, cols, rows));
    return true;
  }

  close(): void {
    this.closing = true;
    this.attached.clear();
    this.failPendingLists(new CockpitUnavailable('client closed'));
    this.socket?.end();
    this.socket = null;
  }

  private failPendingLists(err: Error): void {
    for (const { reject } of this.pendingLists.values()) reject(err);
    this.pendingLists.clear();
  }

  private send(msg: Outbound): void {
    if (this.socket && !this.socket.destroyed) this.socket.write(encode(msg));
  }

  private dispatch(msg: Inbound): void {
    switch (msg.t) {
      case 'pty.sessions': {
        const m = msg as { sessions: Session[]; rid?: number };
        const pending = m.rid !== undefined ? this.pendingLists.get(m.rid) : undefined;
        if (pending && m.rid !== undefined) {
          this.pendingLists.delete(m.rid);
          pending.resolve(m.sessions);
        }
        return;
      }
      case 'pty.output': {
        const m = msg as { id: string; off: number; d: string };
        if (!this.attached.has(m.id)) return;
        const bytes = Buffer.from(m.d, 'base64');
        this.attached.set(m.id, m.off + bytes.length);
        this.emit('output', m.id, m.off, bytes);
        return;
      }
      case 'pty.exited': {
        const m = msg as { id: string; code: number };
        this.emit('exited', m.id, m.code);
        return;
      }
      case 'err': {
        const m = msg as { code: string; detail?: string; rid?: number };
        const pending = m.rid !== undefined ? this.pendingLists.get(m.rid) : undefined;
        if (pending && m.rid !== undefined) {
          this.pendingLists.delete(m.rid);
          pending.reject(new Error(`pty.list failed: ${m.code}`));
          return;
        }
        this.emit('session-error', m.code, m.detail);
        return;
      }
      default:
        // turn.status broadcasts, cli.cmd forwards and unknown types are ignored, never answered.
        return;
    }
  }

  private async reconnectLoop(): Promise<void> {
    while (!this.closing) {
      await new Promise((r) => setTimeout(r, this.opts.reconnectDelayMs));
      if (this.closing) return;
      try {
        await this.connect();
        // Re-attach what is recorded NOW, not at drop time: a select made while disconnected must win.
        for (const [id, from] of this.attached) this.send({ t: 'pty.attach', id, from });
        this.emit('reconnected');
        return;
      } catch {
        // Cockpit still down; keep trying while someone is watching.
      }
    }
  }
}
