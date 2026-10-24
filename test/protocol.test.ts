import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { encode, ForbiddenMessage, inputMessage, LineDecoder, MAX_INPUT_BYTES, resizeMessage } from '../src/protocol.ts';

// ADRs 2026-10-23_phone-input-client and _phone-pty-resize: pty.input and pty.resize are the only writes.
const FORBIDDEN_TYPES = ['pty.kill', 'pty.open', 'pty.ack', 'rpc', 'rpc.res'];

test('encode allows the read types, pty.input and pty.resize, and refuses every other write', () => {
  assert.equal(encode({ t: 'pty.list' }), '{"t":"pty.list"}\n');
  assert.equal(encode({ t: 'pty.attach', id: 's1', from: 0 }), '{"t":"pty.attach","id":"s1","from":0}\n');
  assert.equal(encode(inputMessage('s1', Buffer.from('ls\r'))), '{"t":"pty.input","id":"s1","d":"bHMN"}\n');
  assert.equal(encode(resizeMessage('s1', 45, 40)), '{"t":"pty.resize","id":"s1","rows":40,"cols":45}\n');
  for (const t of FORBIDDEN_TYPES) {
    assert.throws(() => encode({ t } as never), ForbiddenMessage, `${t} must be refused`);
  }
});

test('inputMessage refuses empty and oversized writes', () => {
  assert.throws(() => inputMessage('s1', Buffer.alloc(0)), ForbiddenMessage);
  assert.throws(() => inputMessage('s1', Buffer.alloc(MAX_INPUT_BYTES + 1)), ForbiddenMessage);
  assert.doesNotThrow(() => inputMessage('s1', Buffer.alloc(MAX_INPUT_BYTES)));
});

test('resizeMessage refuses sizes outside the allowed range and non-integers', () => {
  for (const [cols, rows] of [[19, 40], [501, 40], [45, 4], [45, 301], [45.5, 40], [45, NaN]]) {
    assert.throws(() => resizeMessage('s1', cols!, rows!), ForbiddenMessage, `${cols}x${rows}`);
  }
  assert.doesNotThrow(() => resizeMessage('s1', 20, 5));
  assert.doesNotThrow(() => resizeMessage('s1', 500, 300));
});

test('no source file outside protocol.ts names a write message type, pty.input and pty.resize included', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  for (const dir of ['src', 'web'].filter((d) => existsSync(d))) walk(dir);
  const forbidden = /pty\.(kill|open|ack)\b|['"`]rpc(\.res)?['"`]/; // never sent at all
  const writes = /pty\.(input|resize)\b/; // only inputMessage and resizeMessage build them
  const offenders = files
    .filter((f) => !f.endsWith('protocol.ts'))
    .filter((f) => {
      const text = readFileSync(f, 'utf8');
      return forbidden.test(text) || writes.test(text);
    });
  assert.deepEqual(offenders, []);
});

test('only session-info.ts (listing) and new-tab.ts run commands: no other file imports node:child_process', () => {
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else files.push(full);
    }
  };
  for (const dir of ['src', 'web'].filter((d) => existsSync(d))) walk(dir);
  const runners = files.filter((f) => /['"](node:)?child_process['"]/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(runners.map((f) => f.replace(/\\/g, '/')).sort(), ['src/new-tab.ts', 'src/session-info.ts']);
});

test('LineDecoder splits JSONL across chunk boundaries and skips blank lines', () => {
  const d = new LineDecoder();
  assert.deepEqual(d.push('{"t":"hello.ack","v":2,'), []);
  const msgs = d.push('"server":"0.1.0"}\n\n{"t":"pty.exited","id":"s1","code":0}\n');
  assert.deepEqual(msgs.map((m) => m.t), ['hello.ack', 'pty.exited']);
});

test('LineDecoder handles a multi-megabyte line', () => {
  const d = new LineDecoder();
  const big = 'A'.repeat(5 * 1024 * 1024);
  const msgs = d.push(JSON.stringify({ t: 'pty.output', id: 's1', off: 0, d: big }) + '\n');
  assert.equal(msgs.length, 1);
  assert.equal((msgs[0] as { d: string }).d.length, big.length);
});
