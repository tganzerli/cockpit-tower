// Turns viewer `input` and `wheel` messages into the bytes written to the PTY (ADRs 2026-10-23_phone-input-client
// and _phone-fullscreen-scroll). The bytes are built here, never by the browser, so these tables are the whole of
// what the phone can type or scroll.
import { MAX_INPUT_BYTES, PTY_COLS, PTY_ROWS } from './protocol.ts';

/** Same bytes Cockpit's own terminal emits (remote_pi keytab_default.dart); arrows always CSI, as the app sends them. */
export const KEYS: Readonly<Record<string, string>> = {
  enter: '\r',
  esc: '\x1b',
  tab: '\t',
  'shift-tab': '\x1b[Z',
  'ctrl-c': '\x03',
  up: '\x1b[A',
  down: '\x1b[B',
  right: '\x1b[C',
  left: '\x1b[D',
};

// ESC, the other C0 controls (Tab and line breaks aside), DEL and C1.
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/;

/**
 * A named key, or composer text: printable only, line breaks sent as CR like a terminal does.
 * `paste` wraps multi-line text in bracketed-paste markers (the program turned ?2004h on). Null = refuse.
 */
export function inputBytes(msg: { key?: unknown; text?: unknown; paste?: unknown }): Buffer | null {
  if (typeof msg.key === 'string') return Object.hasOwn(KEYS, msg.key) ? Buffer.from(KEYS[msg.key]!) : null;
  if (typeof msg.text !== 'string' || msg.text === '') return null;
  const text = msg.text.replace(/\r\n?|\n/g, '\r');
  // No ESC: text can neither smuggle a key sequence nor close a bracketed paste early.
  if (CONTROL.test(text)) return null;
  const out = msg.paste === true && text.includes('\r') ? `\x1b[200~${text}\x1b[201~` : text;
  const bytes = Buffer.from(out, 'utf8');
  return bytes.length <= MAX_INPUT_BYTES ? bytes : null;
}

/** A viewer `resize` message → the PTY size to apply: integers only, clamped to the range the gateway allows. Null = refuse. */
export function ptySize(msg: { cols?: unknown; rows?: unknown }): { cols: number; rows: number } | null {
  const { cols, rows } = msg;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null;
  const clamp = (n: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, n));
  return { cols: clamp(cols as number, PTY_COLS), rows: clamp(rows as number, PTY_ROWS) };
}

/** Largest wheel batch per message: about seven mouse-wheel notches on the Mac (3 events each). */
export const WHEEL_MAX = 20;
/** X10 puts 32 + n in one byte: coordinates above 223 cannot be encoded. */
const X10_MAX = 223;

export interface Wheel {
  dir: 'up' | 'down';
  count: number;
  mode: 'sgr' | 'x10' | 'arrows';
  col?: number;
  row?: number;
  bytes: Buffer;
}

/**
 * A viewer `wheel` message → the bytes Cockpit's own terminal sends for the same scroll (flterm terminal_input.dart):
 * mouse buttons 64/65 in the encoding the program enabled, or arrows on the alternate screen. Null = refuse.
 */
export function wheelBytes(
  msg: { dir?: unknown; count?: unknown; mode?: unknown; col?: unknown; row?: unknown; app?: unknown },
  size: { cols: number; rows: number },
): Wheel | null {
  const { dir, count, mode } = msg;
  if (dir !== 'up' && dir !== 'down') return null;
  if (!Number.isInteger(count) || (count as number) < 1) return null;
  if (mode !== 'sgr' && mode !== 'x10' && mode !== 'arrows') return null;
  const n = Math.min(count as number, WHEEL_MAX);
  if (mode === 'arrows') {
    const one = (msg.app === true ? '\x1bO' : '\x1b[') + (dir === 'up' ? 'A' : 'B');
    return { dir, count: n, mode, bytes: Buffer.from(one.repeat(n), 'latin1') };
  }
  if (!Number.isInteger(msg.col) || !Number.isInteger(msg.row)) return null;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(1, v));
  const col = clamp(msg.col as number, size.cols);
  const row = clamp(msg.row as number, size.rows);
  const button = dir === 'up' ? 64 : 65;
  let one: Buffer;
  if (mode === 'sgr') one = Buffer.from(`\x1b[<${button};${col};${row}M`, 'latin1');
  else if (col > X10_MAX || row > X10_MAX) return null;
  else one = Buffer.from([0x1b, 0x5b, 0x4d, 32 + button, 32 + col, 32 + row]); // raw bytes, not UTF-8
  return { dir, count: n, mode, col, row, bytes: Buffer.concat(Array<Buffer>(n).fill(one)) };
}
