import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputBytes, KEYS, ptySize } from '../src/input.ts';
import { MAX_INPUT_BYTES } from '../src/protocol.ts';

test('each named key is the byte sequence Cockpit itself sends', () => {
  const expected: Record<string, string> = {
    enter: '0d', esc: '1b', tab: '09', 'shift-tab': '1b5b5a', 'ctrl-c': '03',
    up: '1b5b41', down: '1b5b42', right: '1b5b43', left: '1b5b44',
  };
  assert.deepEqual(Object.keys(KEYS).sort(), Object.keys(expected).sort());
  for (const [key, hex] of Object.entries(expected)) assert.equal(inputBytes({ key })?.toString('hex'), hex, key);
});

test('unknown keys are refused, prototype names included', () => {
  for (const key of ['f1', 'ctrl-d', '__proto__', 'constructor', 'toString', '']) assert.equal(inputBytes({ key }), null, key);
});

test('text passes as UTF-8, with line breaks sent as CR', () => {
  assert.equal(inputBytes({ text: 'olá ✓' })?.toString('utf8'), 'olá ✓');
  assert.equal(inputBytes({ text: 'a\nb\r\nc\rd' })?.toString('utf8'), 'a\rb\rc\rd');
  assert.equal(inputBytes({ text: 'a\tb' })?.toString('utf8'), 'a\tb');
});

test('text carrying ESC, other C0, DEL or C1 is refused', () => {
  for (const text of ['\x1b[A', 'x\x03', '\x00', '\x7f', 'a\x9bb', '\x1b[201~', '\x0b', '\x0c']) {
    assert.equal(inputBytes({ text }), null, JSON.stringify(text));
  }
});

test('bracketed-paste markers wrap only multi-line text sent with paste', () => {
  assert.equal(inputBytes({ text: 'a\nb', paste: true })?.toString('utf8'), '\x1b[200~a\rb\x1b[201~');
  assert.equal(inputBytes({ text: 'one line', paste: true })?.toString('utf8'), 'one line');
  assert.equal(inputBytes({ text: 'a\nb', paste: false })?.toString('utf8'), 'a\rb');
});

test('empty, non-string and oversized text is refused, counting UTF-8 bytes', () => {
  assert.equal(inputBytes({ text: '' }), null);
  assert.equal(inputBytes({ text: 42 }), null);
  assert.equal(inputBytes({}), null);
  assert.ok(inputBytes({ text: 'a'.repeat(MAX_INPUT_BYTES) }));
  assert.equal(inputBytes({ text: 'é'.repeat(MAX_INPUT_BYTES / 2 + 1) }), null);
});

test('ptySize clamps integers to the allowed range and refuses anything else', () => {
  assert.deepEqual(ptySize({ cols: 45, rows: 40 }), { cols: 45, rows: 40 });
  assert.deepEqual(ptySize({ cols: 5, rows: 1000 }), { cols: 20, rows: 300 });
  for (const bad of [{ cols: '45', rows: 40 }, { cols: NaN, rows: 40 }, { cols: 45.5, rows: 40 }, { cols: null, rows: 40 }, { cols: 45 }, {}]) {
    assert.equal(ptySize(bad as never), null, JSON.stringify(bad));
  }
});
