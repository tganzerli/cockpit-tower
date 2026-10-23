// Local record of everything the phone typed or sized (ADRs 2026-10-23_phone-input-client and _phone-pty-resize).
import fs from 'node:fs';

export interface InputLogEntry {
  login: string | null;
  session: string;
  kind: 'text' | 'key' | 'resize' | 'restore';
  key?: string;
  text?: string;
  /** Text and key: bytes written. */
  bytes?: number;
  /** Resize and restore: the size sent. */
  cols?: number;
  rows?: number;
  /** Resize: the size it will be given back to. */
  from?: { cols: number; rows: number };
}

export interface InputLog {
  /** Writes one line before the input is sent; false means the write failed and the input must not go out. */
  append(entry: InputLogEntry): boolean;
}

/** Append-only JSONL, owner-only: opened with O_APPEND and mode 0600, and re-chmodded in case the file pre-existed. */
export function openInputLog(file: string): InputLog {
  const fd = fs.openSync(file, 'a', 0o600);
  fs.fchmodSync(fd, 0o600);
  return {
    append(entry) {
      try {
        // Synchronous on purpose: a handful of hand-typed writes, each on disk before it reaches the PTY.
        fs.writeSync(fd, JSON.stringify({ ts: new Date().toISOString(), ...entry }) + '\n');
        return true;
      } catch {
        return false;
      }
    },
  };
}
