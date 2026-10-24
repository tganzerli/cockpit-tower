import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inputBytes, KEYS, ptySize, WHEEL_MAX, wheelBytes } from '../src/input.ts';
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

const S80 = { cols: 80, rows: 24 };
const hex = (w: ReturnType<typeof wheelBytes>) => w?.bytes.toString('hex');

test('wheel in SGR is buttons 64/65 at the cell, repeated', () => {
  const one = '1b5b3c36343b31303b354d'; // ESC[<64;10;5M
  assert.equal(hex(wheelBytes({ dir: 'up', count: 3, mode: 'sgr', col: 10, row: 5 }, S80)), one.repeat(3));
  assert.equal(hex(wheelBytes({ dir: 'down', count: 1, mode: 'sgr', col: 10, row: 5 }, S80)), '1b5b3c36353b31303b354d');
});

test('wheel in X10 is raw bytes, up to cell 223', () => {
  assert.equal(hex(wheelBytes({ dir: 'up', count: 1, mode: 'x10', col: 10, row: 5 }, S80)), '1b5b4d602a25');
  const big = { cols: 300, rows: 300 };
  assert.equal(wheelBytes({ dir: 'up', count: 1, mode: 'x10', col: 223, row: 1 }, big)?.bytes.at(4), 0xff);
  assert.equal(wheelBytes({ dir: 'up', count: 1, mode: 'x10', col: 224, row: 1 }, big), null);
});

test('wheel as arrows on the alternate screen, CSI or application mode, without a cell', () => {
  assert.equal(hex(wheelBytes({ dir: 'up', count: 2, mode: 'arrows' }, S80)), '1b5b411b5b41');
  assert.equal(hex(wheelBytes({ dir: 'up', count: 1, mode: 'arrows', app: true }, S80)), '1b4f41');
  assert.equal(hex(wheelBytes({ dir: 'down', count: 1, mode: 'arrows' }, S80)), '1b5b42');
  assert.equal(wheelBytes({ dir: 'down', count: 1, mode: 'arrows' }, S80)?.col, undefined);
});

test('wheel count and cell are clamped, not refused', () => {
  const w = wheelBytes({ dir: 'up', count: 100, mode: 'sgr', col: 999, row: 999 }, S80)!;
  assert.equal(w.count, WHEEL_MAX);
  assert.deepEqual([w.col, w.row], [80, 24]);
  assert.equal(wheelBytes({ dir: 'up', count: 1, mode: 'sgr', col: 0, row: 0 }, S80)?.col, 1);
});

test('wheel with an unknown direction, format, count or cell type is refused', () => {
  const bad = [
    { dir: 'left', count: 1, mode: 'sgr', col: 1, row: 1 },
    { dir: 'up', count: 1, mode: 'utf8', col: 1, row: 1 },
    { dir: 'up', count: 1, mode: 'urxvt', col: 1, row: 1 },
    { dir: 'up', count: 1, col: 1, row: 1 },
    { dir: 'up', count: 0, mode: 'sgr', col: 1, row: 1 },
    { dir: 'up', count: -1, mode: 'sgr', col: 1, row: 1 },
    { dir: 'up', count: 1.5, mode: 'sgr', col: 1, row: 1 },
    { dir: 'up', count: '3', mode: 'sgr', col: 1, row: 1 },
    { dir: 'up', count: 1, mode: 'sgr', col: '10', row: 1 },
  ];
  for (const m of bad) assert.equal(wheelBytes(m as never, S80), null, JSON.stringify(m));
});
