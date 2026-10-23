// A minimal stand-in for the Cockpit sidecar server (protocol v2) over a Unix socket.
// It records every message it receives so tests can assert what the client sent, and never more.
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { mkdtempSync } from 'node:fs';
import { LineDecoder } from '../src/protocol.ts';
import type { Session } from '../src/protocol.ts';

interface FakeSession extends Session {
  data: Buffer;
}

export class FakeCockpitServer {
  readonly socketPath: string;
  readonly received: Array<{ t: string; [k: string]: unknown }> = [];
  protocolVersion = 2;
  /** Accept connections but never answer, like a stuck sidecar. */
  silent = false;
  /** Answer everything except pty.list, like a sidecar that stopped listing. */
  ignoreList = false;
  private server: net.Server;
  private sessions = new Map<string, FakeSession>();
  private attachments = new Map<net.Socket, Set<string>>();

  constructor() {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'tower-'));
    this.socketPath = path.join(dir, 'cockpit-server.sock');
    this.server = net.createServer((socket) => this.onConnection(socket));
  }

  listen(): Promise<void> {
    return new Promise((resolve) => this.server.listen(this.socketPath, resolve));
  }

  close(): Promise<void> {
    for (const socket of this.attachments.keys()) socket.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  /** Drops every client connection, as a Cockpit restart would. */
  dropClients(): void {
    for (const socket of this.attachments.keys()) socket.destroy();
  }

  get connectionCount(): number {
    return this.attachments.size;
  }

  addSession(id: string, initial = '', cmd = '/bin/zsh'): void {
    this.sessions.set(id, { id, pid: 1000 + this.sessions.size, cmd, rows: 24, cols: 80, len: 0, data: Buffer.from(initial) });
  }

  /** Appends output to a session and streams it to every attached client. */
  write(id: string, text: string): void {
    const s = this.sessions.get(id)!;
    const off = s.data.length;
    const bytes = Buffer.from(text);
    s.data = Buffer.concat([s.data, bytes]);
    for (const [socket, ids] of this.attachments) {
      if (ids.has(id)) this.sendTo(socket, { t: 'pty.output', id, off, d: bytes.toString('base64') });
    }
  }

  /** Ends a session: it is listed with an exit code and every attached client gets pty.exited. */
  exit(id: string, code = 0): void {
    const s = this.sessions.get(id)!;
    s.exit = code;
    for (const [socket, ids] of this.attachments) if (ids.has(id)) this.sendTo(socket, { t: 'pty.exited', id, code });
  }

  /** Sets a session's size from the Mac side (a layout change in the app), telling no one, like the real app. */
  setSize(id: string, cols: number, rows: number): void {
    Object.assign(this.sessions.get(id)!, { cols, rows });
  }

  /** Forgets a session without telling anyone, as after a Cockpit restart. */
  removeSession(id: string): void {
    this.sessions.delete(id);
  }

  broadcastNoise(): void {
    for (const socket of this.attachments.keys()) {
      this.sendTo(socket, { t: 'turn.status', pane: 'tab-1', st: 'working' });
      this.sendTo(socket, { t: 'rpc', id: 9, m: 'cli.cmd', p: { cmd: 'list-panes' } });
      this.sendTo(socket, { t: 'something.new', x: 1 });
    }
  }

  private onConnection(socket: net.Socket): void {
    socket.setEncoding('utf8');
    const decoder = new LineDecoder();
    let handshaken = false;
    this.attachments.set(socket, new Set());
    socket.on('close', () => this.attachments.delete(socket));
    socket.on('error', () => this.attachments.delete(socket));
    socket.on('data', (chunk: string) => {
      for (const msg of decoder.push(chunk) as Array<{ t: string; [k: string]: unknown }>) {
        this.received.push(msg);
        if (this.silent) continue;
        if (!handshaken) {
          if (msg.t !== 'hello') return this.fail(socket, 'handshake_required');
          if (msg.v !== this.protocolVersion) {
            return this.fail(socket, 'version_mismatch', `server=${this.protocolVersion} client=${String(msg.v)}`);
          }
          handshaken = true;
          this.sendTo(socket, { t: 'hello.ack', v: this.protocolVersion, server: 'fake-0.0.0' });
          continue;
        }
        this.handle(socket, msg);
      }
    });
  }

  private handle(socket: net.Socket, msg: { t: string; [k: string]: unknown }): void {
    switch (msg.t) {
      case 'pty.list': {
        if (this.ignoreList) return;
        const sessions = [...this.sessions.values()].map(({ data, ...s }) => ({ ...s, len: data.length }));
        this.sendTo(socket, { t: 'pty.sessions', sessions, ...(msg.rid !== undefined ? { rid: msg.rid } : {}) });
        return;
      }
      case 'pty.attach': {
        const id = String(msg.id);
        const s = this.sessions.get(id);
        if (!s) return this.sendTo(socket, { t: 'err', code: 'session_not_found', detail: id });
        const from = Math.max(Number(msg.from ?? 0), 0);
        this.attachments.get(socket)!.add(id);
        const replay = s.data.subarray(from);
        if (replay.length > 0) this.sendTo(socket, { t: 'pty.output', id, off: from, d: replay.toString('base64') });
        return;
      }
      case 'pty.detach':
        this.attachments.get(socket)?.delete(String(msg.id));
        return;
      case 'pty.input':
        return; // recorded above; like the real server, no reply on success
      case 'pty.resize': {
        const s = this.sessions.get(String(msg.id));
        if (s) Object.assign(s, { rows: Number(msg.rows), cols: Number(msg.cols) }); // global, no reply, like the real server
        return;
      }

      default:
        this.sendTo(socket, { t: 'err', code: 'bad_message', detail: msg.t });
    }
  }

  private fail(socket: net.Socket, code: string, detail?: string): void {
    this.sendTo(socket, { t: 'err', code, ...(detail ? { detail } : {}) });
    socket.end();
  }

  private sendTo(socket: net.Socket, msg: object): void {
    if (!socket.destroyed) socket.write(JSON.stringify(msg) + '\n');
  }
}
