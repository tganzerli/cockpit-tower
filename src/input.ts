// Turns a viewer `input` message into the bytes written to the PTY (ADR 2026-10-23_phone-input-client).
// The bytes are built here, never by the browser, so this table is the whole of what the phone can type.
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
