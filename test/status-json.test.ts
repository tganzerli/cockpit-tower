import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildStatus } from '../src/status-json.ts';

const SOCK = '/Users/me/.cockpit/cockpit-server.sock';
const URL = 'https://mac.tail.ts.net:8443/tok/';

test('everything off', () => {
  assert.deepEqual(buildStatus(['', '', '0', '7681', '8443', '0', SOCK], ''), {
    on: false,
    gateway: { running: false, pid: null, port: 7681 },
    awake: { running: false, pid: null },
    tailnet: { published: false, port: 8443, url: null },
    cockpit: { socket: false, path: SOCK },
  });
});

test('on with URL', () => {
  const s = buildStatus(['123', '124', '1', '7681', '8443', '1', SOCK], `${URL}\n`);
  assert.equal(s.on, true);
  assert.deepEqual(s.gateway, { running: true, pid: 123, port: 7681 });
  assert.deepEqual(s.awake, { running: true, pid: 124 });
  assert.equal(s.tailnet.url, URL);
});

test('gateway up but not published is not on, and never reports a URL', () => {
  const s = buildStatus(['123', '124', '0', '7681', '8443', '1', SOCK], URL);
  assert.equal(s.on, false);
  assert.equal(s.tailnet.url, null);
});

test('published without a gateway is not on; a placeholder name is not a URL', () => {
  const s = buildStatus(['', '', '1', '7681', '8443', '1', SOCK], '(tailscale name unavailable)');
  assert.equal(s.on, false);
  assert.equal(s.tailnet.url, null);
});

test('non-numeric pids are treated as not running', () => {
  assert.equal(buildStatus(['abc', '1 2', '1', '7681', '8443', '1', SOCK], URL).gateway.pid, null);
});
