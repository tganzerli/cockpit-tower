import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isPublished } from '../src/serve-status.ts';

const TARGET = 'http://127.0.0.1:7681';
const cfg = (port: string, proxy: string, host = 'mac.tail.ts.net') =>
  JSON.stringify({ TCP: { [port]: { HTTPS: true } }, Web: { [`${host}:${port}`]: { Handlers: { '/': { Proxy: proxy } } } } });

test('empty or unreadable status is not published', () => {
  assert.equal(isPublished('{}', '8443', TARGET), false);
  assert.equal(isPublished('', '8443', TARGET), false);
  assert.equal(isPublished('not json', '8443', TARGET), false);
});

test('our proxy on the port is published, including 443', () => {
  assert.equal(isPublished(cfg('8443', TARGET), '8443', TARGET), true);
  assert.equal(isPublished(cfg('443', TARGET), '443', TARGET), true);
});

test('another service on the port, or a port that only shares a prefix, is not ours', () => {
  assert.equal(isPublished(cfg('8443', 'http://127.0.0.1:9999'), '8443', TARGET), false);
  assert.equal(isPublished(cfg('84430', TARGET), '8443', TARGET), false);
});
