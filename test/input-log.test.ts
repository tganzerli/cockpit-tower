import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openInputLog } from '../src/input-log.ts';

const tmp = () => mkdtempSync(path.join(os.tmpdir(), 'tower-log-'));
const mode = (file: string) => statSync(file).mode & 0o777;

test('a new log is created owner-only and gets one JSON line per entry', () => {
  const file = path.join(tmp(), 'input.log');
  const log = openInputLog(file);
  assert.equal(mode(file), 0o600);
  assert.equal(log.append({ login: 'me@example.com', session: 's1', kind: 'text', text: 'ls', bytes: 2 }), true);
  assert.equal(log.append({ login: 'me@example.com', session: 's1', kind: 'key', key: 'enter', bytes: 1 }), true);
  const lines = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.equal(lines.length, 2);
  assert.match(lines[0].ts, /^\d{4}-\d\d-\d\dT/);
  assert.deepEqual({ ...lines[0], ts: undefined }, { ts: undefined, login: 'me@example.com', session: 's1', kind: 'text', text: 'ls', bytes: 2 });
  assert.equal(lines[1].key, 'enter');
});

test('an existing world-readable log is tightened to 0600 and appended to, not truncated', () => {
  const file = path.join(tmp(), 'input.log');
  writeFileSync(file, '{"old":true}\n', { mode: 0o644 });
  openInputLog(file).append({ login: null, session: 's2', kind: 'key', key: 'esc', bytes: 1 });
  assert.equal(mode(file), 0o600);
  assert.deepEqual(readFileSync(file, 'utf8').trim().split('\n').length, 2);
});

test('a resize entry keeps its size and the size it will be restored to', () => {
  const file = path.join(tmp(), 'input.log');
  openInputLog(file).append({ login: 'me@example.com', session: 's1', kind: 'resize', cols: 45, rows: 40, from: { cols: 143, rows: 60 } });
  const line = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual({ ...line, ts: undefined }, { ts: undefined, login: 'me@example.com', session: 's1', kind: 'resize', cols: 45, rows: 40, from: { cols: 143, rows: 60 } });
});

test('a wheel entry keeps direction, count, format, cell and bytes', () => {
  const file = path.join(tmp(), 'input.log');
  openInputLog(file).append({ login: null, session: 's1', kind: 'wheel', dir: 'up', count: 3, mode: 'sgr', col: 10, row: 5, bytes: 33 });
  const line = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual([line.kind, line.dir, line.count, line.mode, line.col, line.row, line.bytes], ['wheel', 'up', 3, 'sgr', 10, 5, 33]);
});

test('a new-tab entry keeps the workspace folder', () => {
  const file = path.join(tmp(), 'input.log');
  openInputLog(file).append({ login: 'me@example.com', session: 's1', kind: 'new-tab', folder: '/Users/me/app/w' });
  const line = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual({ ...line, ts: undefined }, { ts: undefined, login: 'me@example.com', session: 's1', kind: 'new-tab', folder: '/Users/me/app/w' });
});

test('a close-tab entry keeps the tab id and the title the confirmation showed', () => {
  const file = path.join(tmp(), 'input.log');
  openInputLog(file).append({ login: 'me@example.com', session: 's8', kind: 'close-tab', tab: 't7', title: '✳ second' });
  const line = JSON.parse(readFileSync(file, 'utf8'));
  assert.deepEqual({ ...line, ts: undefined }, { ts: undefined, login: 'me@example.com', session: 's8', kind: 'close-tab', tab: 't7', title: '✳ second' });
});
