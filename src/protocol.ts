// Subset of the Cockpit remote protocol (v2) that cockpit-tower needs: read sessions, type into one, and size it to the phone.
// Source of truth: remote_pi cockpit/packages/cockpit_protocol/lib/src/messages.dart.

export const PROTOCOL_VERSION = 2;

/**
 * The only message types this client may ever send. pty.input and pty.resize are the writes, built only by
 * inputMessage and resizeMessage; everything else (kill, open, ack, rpc) kills, spawns, touches credit or runs code.
 */
export const ALLOWED_OUTBOUND: ReadonlySet<string> = new Set(['hello', 'pty.list', 'pty.attach', 'pty.detach', 'pty.input', 'pty.resize']);

/** Largest single write to a PTY; the Cockpit protocol sets no limit of its own. */
export const MAX_INPUT_BYTES = 16 * 1024;

/** Sizes the gateway may give a PTY (ADR 2026-10-23_phone-pty-resize). */
export const PTY_COLS = { min: 20, max: 500 } as const;
export const PTY_ROWS = { min: 5, max: 300 } as const;

export type Outbound =
  | { t: 'hello'; v: number; client: string }
  | { t: 'pty.list'; rid?: number }
  | { t: 'pty.attach'; id: string; from: number }
  | { t: 'pty.detach'; id: string }
  | { t: 'pty.input'; id: string; d: string }
  | { t: 'pty.resize'; id: string; rows: number; cols: number };

export interface Session {
  id: string;
  pid: number;
  cmd: string;
  rows: number;
  cols: number;
  len: number;
  exit?: number;
}

export type Inbound =
  | { t: 'hello.ack'; v: number; server: string }
  | { t: 'pty.sessions'; sessions: Session[]; rid?: number }
  | { t: 'pty.output'; id: string; off: number; d: string }
  | { t: 'pty.exited'; id: string; code: number }
  | { t: 'err'; code: string; detail?: string; id?: string; rid?: number }
  | { t: string; [key: string]: unknown };

export class ForbiddenMessage extends Error {}

/** Serializes one outbound message as a JSONL line, refusing anything outside the allow-list. */
export function encode(msg: Outbound): string {
  const t = (msg as { t?: unknown }).t;
  if (typeof t !== 'string' || !ALLOWED_OUTBOUND.has(t)) {
    throw new ForbiddenMessage(
      `refusing to send '${String(t)}': cockpit-tower only sends hello, pty.list, pty.attach, pty.detach, pty.input and pty.resize`,
    );
  }
  return JSON.stringify(msg) + '\n';
}

/** The only constructor of a PTY write in the codebase (a source-scan test enforces it). */
export function inputMessage(id: string, bytes: Uint8Array): Outbound {
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) throw new ForbiddenMessage(`input of ${bytes.length} bytes refused`);
  return { t: 'pty.input', id, d: Buffer.from(bytes).toString('base64') };
}

/** The only constructor of a PTY resize in the codebase (a source-scan test enforces it). */
export function resizeMessage(id: string, cols: number, rows: number): Outbound {
  const fits = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max;
  if (!fits(cols, PTY_COLS) || !fits(rows, PTY_ROWS)) throw new ForbiddenMessage(`resize to ${cols}x${rows} refused`);
  return { t: 'pty.resize', id, rows, cols };
}

/** Splits a byte stream into JSONL messages. Lines can be several MB (a 4 MiB replay arrives as one line). */
export class LineDecoder {
  private buffer = '';

  push(chunk: string): Inbound[] {
    this.buffer += chunk;
    const out: Inbound[] = [];
    let newline: number;
    while ((newline = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      if (line.trim() === '') continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed && typeof parsed.t === 'string') out.push(parsed as Inbound);
      } catch {
        // A malformed line is dropped; the server never sends one in practice.
      }
    }
    return out;
  }
}
