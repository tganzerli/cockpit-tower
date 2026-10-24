import { test } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import WebSocket from 'ws';
import { startTowerServer } from '../src/server.ts';
import type { TowerServerOptions } from '../src/server.ts';
import { mkdtempSync, readFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openInputLog } from '../src/input-log.ts';
import type { InputLog } from '../src/input-log.ts';
import { ALLOWED_OUTBOUND } from '../src/protocol.ts';
import { FakeCockpitServer } from './fake-cockpit-server.ts';

const TOKEN = 'test-token-123';
const TAILNET = { 'tailscale-user-login': 'me@example.com' };

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const ORIGIN = 'https://mac.tailnet.ts.net:8443';

function viewer(
  port: number,
  { headers = TAILNET, token = TOKEN, origin }: { headers?: Record<string, string>; token?: string; origin?: string } = {},
) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}${token ? `/${token}` : ''}/ws`, { headers, ...(origin ? { origin } : {}) });
  const inbox: Array<Record<string, unknown>> = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(String(raw))));
  ws.on('error', () => {});
  return { ws, inbox };
}

async function setup(opts: Partial<TowerServerOptions> = {}, initial = 'hello from zsh') {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', initial);
  await fake.listen();
  const tower = await startTowerServer({ socketPath: fake.socketPath, port: 0, token: TOKEN, ...opts });
  return { fake, tower, port: tower.address().port };
}

/** Raw request, so tests can send what a real HTTP client refuses to (malformed targets). */
function rawRequest(port: number, text: string): Promise<string> {
  return new Promise((resolve) => {
    const s = net.createConnection(port, '127.0.0.1', () => s.write(text));
    let out = '';
    s.on('data', (d) => (out += d));
    s.on('close', () => resolve(out));
    s.on('error', () => resolve(out));
    setTimeout(() => s.destroy(), 300);
  });
}

test('a token is required outside dev mode', async () => {
  await assert.rejects(startTowerServer({ socketPath: '/tmp/x.sock', port: 0 }), /token is required/);
});

test('listens on loopback only', async () => {
  const { fake, tower } = await setup();
  assert.equal(tower.address().address, '127.0.0.1');
  await tower.close();
  await fake.close();
});

test('without the token or the Tailscale header nothing is served (HTTP and WebSocket)', async () => {
  const { fake, tower, port } = await setup();
  assert.equal((await fetch(`http://127.0.0.1:${port}/`, { headers: TAILNET })).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/wrong-token/`, { headers: TAILNET })).status, 404);
  assert.equal((await fetch(`http://127.0.0.1:${port}/${TOKEN}/`)).status, 404);
  for (const v of [viewer(port, { headers: {} }), viewer(port, { token: 'wrong' })]) {
    const status = await new Promise<number | undefined>((resolve) =>
      v.ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)),
    );
    assert.equal(status, 404);
  }
  assert.equal(fake.connectionCount, 0);
  await tower.close();
  await fake.close();
});

test('static routes are a fixed table under the token; the bare prefix redirects', async () => {
  const { fake, tower, port } = await setup();
  const get = (p: string) => fetch(`http://127.0.0.1:${port}${p}`, { headers: TAILNET, redirect: 'manual' });
  assert.equal((await get(`/${TOKEN}/`)).status, 200);
  assert.equal((await get(`/${TOKEN}/vendor/xterm.js`)).status, 200);
  assert.equal((await get(`/${TOKEN}`)).headers.get('location'), `/${TOKEN}/`);
  assert.equal((await get(`/${TOKEN}/vendor/../package.json`)).status, 404);
  assert.equal((await get(`/${TOKEN}/package.json`)).status, 404);
  assert.equal(await (await fetch(`http://127.0.0.1:${port}/healthz`)).text(), 'cockpit-tower');
  await tower.close();
  await fake.close();
});

test('malformed requests and frames do not crash the gateway', async () => {
  const { fake, tower, port } = await setup();
  await rawRequest(port, 'GET http://[/ HTTP/1.1\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n');
  await rawRequest(port, 'GET http://[/ HTTP/1.1\r\nTailscale-User-Login: x\r\n\r\n');
  await rawRequest(port, 'NOT HTTP AT ALL\r\n\r\n');

  // An unmasked client frame is a protocol violation that makes `ws` emit 'error'.
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  (ws as unknown as { _socket: net.Socket })._socket.write(Buffer.from([0x81, 0x02, 0x68, 0x69]));
  await new Promise((r) => ws.on('close', r));

  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200, 'gateway still alive');
  await tower.close();
  await fake.close();
});

test('oversized viewer messages are rejected without affecting the gateway', async () => {
  const { fake, tower, port } = await setup();
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.send('x'.repeat(70_000)); // past the 64 KiB frame limit
  await new Promise((r) => ws.on('close', r));
  assert.equal((await fetch(`http://127.0.0.1:${port}/healthz`)).status, 200);
  await tower.close();
  await fake.close();
});

test('Cockpit is only connected while a viewer is open (lazy connection)', async () => {
  const { fake, tower, port } = await setup();
  assert.equal(fake.connectionCount, 0);
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  assert.equal(fake.connectionCount, 1);
  ws.close();
  await waitFor(() => fake.connectionCount === 0);
  await tower.close();
  await fake.close();
});

test('sessions carry their context and are re-sent while the viewer stays', async () => {
  let calls = 0;
  const sessionInfo = async (sessions: Array<{ id: string }>) => {
    calls++;
    if (calls === 2) throw new Error('lsof exploded'); // a failed collection must not drop the list
    return { info: Object.fromEntries(sessions.map((s) => [s.id, { process: 'claude', calls }])), theme: 'dark' };
  };
  const { fake, tower, port } = await setup({ sessionInfo: sessionInfo as unknown as TowerServerOptions['sessionInfo'], sessionsRefreshMs: 30 });
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.filter((m) => m.type === 'sessions').length >= 3);
  const lists = inbox.filter((m) => m.type === 'sessions').map((m) => (m.sessions as Array<Record<string, unknown>>)[0]!);
  assert.deepEqual(lists[0]!.info, { process: 'claude', calls: 1 });
  assert.equal(inbox.find((m) => m.type === 'sessions')!.theme, 'dark'); // Cockpit's theme rides along
  assert.equal(lists[1]!.info, undefined); // collection failed: the session still goes out, without context
  assert.equal(lists[1]!.id, 's1');
  assert.deepEqual(lists[2]!.info, { process: 'claude', calls: 3 });
  assert.ok(fake.received.every((m) => ALLOWED_OUTBOUND.has(m.t)));
  ws.close();
  await waitFor(() => fake.connectionCount === 0);
  const after = calls;
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(calls, after, 'the refresh timer stops with the viewer');
  await tower.close();
  await fake.close();
});

test('a list asked while another is in flight is answered after it, not dropped', async () => {
  let release: (() => void) | undefined;
  let calls = 0;
  const sessionInfo = async () => {
    calls++;
    if (calls === 1) await new Promise<void>((r) => (release = r)); // first collection hangs until released
    return { info: {}, theme: 'system' };
  };
  const { fake, tower, port } = await setup({ sessionInfo: sessionInfo as unknown as TowerServerOptions['sessionInfo'], sessionsRefreshMs: 60000 });
  const { ws, inbox } = viewer(port);
  await waitFor(() => release !== undefined);
  ws.send(JSON.stringify({ type: 'list' })); // arrives while the first list is in flight
  release!();
  await waitFor(() => inbox.filter((m) => m.type === 'sessions').length === 2);
  ws.close();
  await tower.close();
  await fake.close();
});

test('an unanswered list is given up so later lists still go out', async () => {
  const { fake, tower, port } = await setup({ listTimeoutMs: 50, sessionsRefreshMs: 60000 });
  fake.ignoreList = true;
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'status' && m.state === 'connected'));
  await new Promise((r) => setTimeout(r, 120)); // the first list times out
  fake.ignoreList = false;
  ws.send(JSON.stringify({ type: 'list' }));
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.close();
  await tower.close();
  await fake.close();
});

test('selecting a session streams replay and live output; typing and resize without command mode, and kill, are dropped', async () => {
  const { fake, tower, port } = await setup();
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));

  ws.send(JSON.stringify({ type: 'select', id: 's1' }));
  ws.send(JSON.stringify({ type: 'select', id: 's1' })); // repeated select must not force a second replay
  ws.send(JSON.stringify({ type: 'input', id: 's1', data: 'rm -rf ~\r' }));
  ws.send(JSON.stringify({ type: 'resize', id: 's1', cols: 10, rows: 5 }));
  ws.send(JSON.stringify({ type: 'kill', id: 's1' }));
  ws.send(JSON.stringify({ type: 'wheel', dir: 'up', count: 3, mode: 'sgr', col: 1, row: 1 }));
  await waitFor(() => inbox.some((m) => m.type === 'output'));
  fake.write('s1', ' + live');
  await waitFor(() => inbox.filter((m) => m.type === 'output').length === 2);

  const text = inbox
    .filter((m) => m.type === 'output')
    .map((m) => Buffer.from(String(m.data), 'base64').toString())
    .join('');
  assert.equal(text, 'hello from zsh + live');
  assert.equal(fake.received.filter((m) => m.t === 'pty.attach').length, 1);
  assert.ok(fake.received.every((m) => ALLOWED_OUTBOUND.has(m.t)), JSON.stringify(fake.received.map((m) => m.t)));
  assert.ok(!fake.received.some((m) => m.t === 'pty.input' || m.t === 'pty.resize'), 'no write without command mode');

  ws.close();
  await tower.close();
  await fake.close();
});

test('an idle viewer watching a session is dropped and its Cockpit attachment released', async () => {
  const { fake, tower, port } = await setup({ idleMs: 100 });
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.send(JSON.stringify({ type: 'select', id: 's1' }));
  await waitFor(() => inbox.some((m) => m.type === 'output'));
  const code = await new Promise<number>((resolve) => ws.on('close', (c) => resolve(c)));
  assert.equal(code, 4408);
  // Closing the Cockpit connection is the protocol's implicit detach for every attachment.
  await waitFor(() => fake.connectionCount === 0);
  await tower.close();
  await fake.close();
});

test('a viewer that opens before Cockpit starts connects once Cockpit appears', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'late');
  const tower = await startTowerServer({ socketPath: fake.socketPath, port: 0, token: TOKEN, retryMs: 50 });
  const { ws, inbox } = viewer(tower.address().port);
  await waitFor(() => inbox.some((m) => m.type === 'status' && m.state === 'unavailable'));
  await fake.listen();
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.close();
  await tower.close();
  await fake.close();
});

test('a stuck Cockpit (no handshake answer) is reported instead of hanging', async () => {
  const fake = new FakeCockpitServer();
  fake.silent = true;
  await fake.listen();
  const tower = await startTowerServer({ socketPath: fake.socketPath, port: 0, token: TOKEN, handshakeTimeoutMs: 100, retryMs: 10_000 });
  const { ws, inbox } = viewer(tower.address().port);
  await waitFor(() => inbox.some((m) => m.type === 'status' && /did not answer/.test(String(m.detail))));
  ws.close();
  await tower.close();
  await fake.close();
});

test('Cockpit on another protocol version is reported to the viewer', async () => {
  const fake = new FakeCockpitServer();
  fake.protocolVersion = 3;
  await fake.listen();
  const tower = await startTowerServer({ socketPath: fake.socketPath, port: 0, token: TOKEN });
  const { ws, inbox } = viewer(tower.address().port);
  await waitFor(() => inbox.some((m) => m.type === 'status'));
  assert.equal(inbox.find((m) => m.type === 'status')?.state, 'mismatch');
  ws.close();
  await tower.close();
  await fake.close();
});

// --- Typing from the phone (ADR 2026-10-23_phone-input-client) ---

function tempLog(): { file: string; log: InputLog } {
  const file = path.join(mkdtempSync(path.join(os.tmpdir(), 'tower-input-')), 'input.log');
  return { file, log: openInputLog(file) };
}

/** A tower that lets me@example.com type, with the page origin enforced and a real log in a temp dir. */
async function inputSetup(log = tempLog().log, extra: Partial<TowerServerOptions> = {}) {
  const ctx = await setup({ origin: ORIGIN, input: { owner: 'me@example.com', log }, ...extra });
  ctx.fake.addSession('s2', 'other');
  return ctx;
}

/** Connects, selects s1 and waits for its replay. */
async function watching(port: number, opts: Parameters<typeof viewer>[1] = {}) {
  const v = viewer(port, { origin: ORIGIN, ...opts });
  await waitFor(() => v.inbox.some((m) => m.type === 'sessions'));
  v.ws.send(JSON.stringify({ type: 'select', id: 's1' }));
  await waitFor(() => v.inbox.some((m) => m.type === 'output'));
  return v;
}

const inputs = (fake: FakeCockpitServer) =>
  fake.received.filter((m) => m.t === 'pty.input').map((m) => ({ id: m.id, bytes: Buffer.from(String(m.d), 'base64').toString('hex') }));
const last = (inbox: Array<Record<string, unknown>>, type: string) => inbox.filter((m) => m.type === type).at(-1);

test('input outside command mode is refused and nothing reaches Cockpit', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = await watching(port);
  assert.deepEqual(inbox.find((m) => m.type === 'access'), { type: 'access', input: true });
  ws.send(JSON.stringify({ type: 'input', text: 'ls' }));
  await waitFor(() => inbox.some((m) => m.type === 'input'));
  assert.deepEqual(last(inbox, 'input'), { type: 'input', ok: false, reason: 'command_off' });
  assert.deepEqual(inputs(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('another Tailscale login cannot turn command mode on or type', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = await watching(port, { headers: { 'tailscale-user-login': 'someone@else.com' } });
  assert.deepEqual(inbox.find((m) => m.type === 'access'), { type: 'access', input: false });
  ws.send(JSON.stringify({ type: 'command', on: true }));
  ws.send(JSON.stringify({ type: 'input', key: 'enter' }));
  await waitFor(() => inbox.some((m) => m.type === 'input'));
  assert.equal(last(inbox, 'command')?.on, false);
  assert.equal(last(inbox, 'input')?.reason, 'command_off');
  assert.deepEqual(inputs(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('a WebSocket from another origin, or with none, gets 404 once an origin is set', async () => {
  const { fake, tower, port } = await inputSetup();
  for (const v of [viewer(port, { origin: 'https://evil.example' }), viewer(port)]) {
    const status = await new Promise<number | undefined>((resolve) => v.ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)));
    assert.equal(status, 404);
  }
  assert.equal(fake.connectionCount, 0);
  await tower.close();
  await fake.close();
});

test('in command mode text and keys reach the watched session as exact bytes, whatever id the message names', async () => {
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log);
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => inbox.some((m) => m.type === 'command'));
  assert.deepEqual(last(inbox, 'command'), { type: 'command', on: true, id: 's1' });
  ws.send(JSON.stringify({ type: 'input', id: 's2', text: 'ls -la' }));
  ws.send(JSON.stringify({ type: 'input', id: 's2', key: 'enter' }));
  ws.send(JSON.stringify({ type: 'input', key: 'ctrl-c' }));
  await waitFor(() => inputs(fake).length === 3);
  assert.deepEqual(inputs(fake), [
    { id: 's1', bytes: Buffer.from('ls -la').toString('hex') },
    { id: 's1', bytes: '0d' },
    { id: 's1', bytes: '03' },
  ]);
  await waitFor(() => inbox.filter((m) => m.type === 'input').length === 3);
  assert.ok(inbox.filter((m) => m.type === 'input').every((m) => m.ok === true));
  const logged = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  assert.deepEqual(
    logged.map(({ login, session, kind, key, text, bytes }) => ({ login, session, kind, key, text, bytes })),
    [
      { login: 'me@example.com', session: 's1', kind: 'text', key: undefined, text: 'ls -la', bytes: 6 },
      { login: 'me@example.com', session: 's1', kind: 'key', key: 'enter', text: undefined, bytes: 1 },
      { login: 'me@example.com', session: 's1', kind: 'key', key: 'ctrl-c', text: undefined, bytes: 1 },
    ],
  );
  assert.ok(fake.received.every((m) => ALLOWED_OUTBOUND.has(m.t)));
  ws.close();
  await tower.close();
  await fake.close();
});

test('invalid input in command mode is refused before anything is logged or sent', async () => {
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log);
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  ws.send(JSON.stringify({ type: 'input', text: '\x1b[201~rm -rf ~' }));
  ws.send(JSON.stringify({ type: 'input', key: 'f12' }));
  await waitFor(() => inbox.filter((m) => m.type === 'input').length === 2);
  assert.ok(inbox.filter((m) => m.type === 'input').every((m) => m.reason === 'invalid'));
  assert.deepEqual(inputs(fake), []);
  assert.equal(readFileSync(file, 'utf8'), '');
  ws.close();
  await tower.close();
  await fake.close();
});

test('selecting another session turns command mode off', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(inbox, 'command')?.on === true);
  ws.send(JSON.stringify({ type: 'select', id: 's2' }));
  await waitFor(() => last(inbox, 'command')?.on === false);
  ws.send(JSON.stringify({ type: 'input', text: 'ls' }));
  await waitFor(() => inbox.some((m) => m.type === 'input'));
  assert.equal(last(inbox, 'input')?.reason, 'command_off');
  assert.deepEqual(inputs(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('command mode does not survive a reconnect: a new connection starts off', async () => {
  const { fake, tower, port } = await inputSetup();
  const first = await watching(port);
  first.ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(first.inbox, 'command')?.on === true);
  first.ws.close();
  const second = await watching(port);
  second.ws.send(JSON.stringify({ type: 'input', text: 'ls' }));
  await waitFor(() => second.inbox.some((m) => m.type === 'input'));
  assert.equal(last(second.inbox, 'input')?.reason, 'command_off');
  assert.deepEqual(inputs(fake), []);
  second.ws.close();
  await tower.close();
  await fake.close();
});

test('command mode needs a listed session: a select of an unknown id cannot be commanded', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = viewer(port, { origin: ORIGIN });
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.send(JSON.stringify({ type: 'select', id: 'ghost' }));
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => inbox.some((m) => m.type === 'command'));
  assert.equal(last(inbox, 'command')?.on, false);
  ws.close();
  await tower.close();
  await fake.close();
});

test('a log that cannot be written refuses the input instead of sending it unrecorded', async () => {
  const failing: InputLog = { append: () => false };
  const { fake, tower, port } = await inputSetup(failing);
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  ws.send(JSON.stringify({ type: 'input', text: 'ls' }));
  await waitFor(() => inbox.some((m) => m.type === 'input'));
  assert.equal(last(inbox, 'input')?.reason, 'log_failed');
  assert.deepEqual(inputs(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('the session ending turns command mode off', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(inbox, 'command')?.on === true);
  fake.exit('s1', 0);
  await waitFor(() => last(inbox, 'command')?.on === false);
  ws.send(JSON.stringify({ type: 'input', key: 'enter' }));
  await waitFor(() => inbox.some((m) => m.type === 'input'));
  assert.equal(last(inbox, 'input')?.reason, 'command_off');
  assert.deepEqual(inputs(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('losing Cockpit turns command mode off, and it stays off after the reconnect', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(inbox, 'command')?.on === true);
  fake.dropClients();
  await waitFor(() => last(inbox, 'command')?.on === false);
  await waitFor(() => last(inbox, 'status')?.state === 'connected', 5000);
  ws.send(JSON.stringify({ type: 'input', key: 'ctrl-c' }));
  await waitFor(() => inbox.some((m) => m.type === 'input'));
  assert.equal(last(inbox, 'input')?.reason, 'command_off');
  assert.deepEqual(inputs(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('a commanded session that drops out of the list turns command mode off', async () => {
  const { fake, tower, port } = await inputSetup();
  const { ws, inbox } = await watching(port);
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(inbox, 'command')?.on === true);
  fake.removeSession('s1');
  ws.send(JSON.stringify({ type: 'list' }));
  await waitFor(() => last(inbox, 'command')?.on === false);
  ws.close();
  await tower.close();
  await fake.close();
});

test('in dev with input, only a page opened at the bound loopback address can open the socket', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'x');
  await fake.listen();
  const tower = await startTowerServer({ socketPath: fake.socketPath, port: 0, dev: true, input: { owner: null, log: tempLog().log } });
  const port = tower.address().port;
  for (const origin of ['https://evil.example', undefined]) {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { origin } : {});
    ws.on('error', () => {});
    const status = await new Promise<number | undefined>((resolve) => ws.on('unexpected-response', (_req, res) => resolve(res.statusCode)));
    assert.equal(status, 404, String(origin));
  }
  const { ws, inbox } = viewer(port, { token: '', headers: {}, origin: `http://127.0.0.1:${port}` });
  await waitFor(() => inbox.some((m) => m.type === 'access'));
  assert.deepEqual(inbox.find((m) => m.type === 'access'), { type: 'access', input: true });
  ws.close();
  await tower.close();
  await fake.close();
});

test('in dev without input any origin may read, as before', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'x');
  await fake.listen();
  const tower = await startTowerServer({ socketPath: fake.socketPath, port: 0, dev: true });
  const { ws, inbox } = viewer(tower.address().port, { token: '', headers: {}, origin: 'http://localhost:7681' });
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.close();
  await tower.close();
  await fake.close();
});

test('input outside dev needs both an origin and an owner', async () => {
  const log = tempLog().log;
  await assert.rejects(startTowerServer({ socketPath: '/tmp/x.sock', port: 0, token: TOKEN, input: { owner: 'me@example.com', log } }), /origin and owner/);
  await assert.rejects(startTowerServer({ socketPath: '/tmp/x.sock', port: 0, token: TOKEN, origin: ORIGIN, input: { owner: null, log } }), /origin and owner/);
});

test('without the input option the page is told it is read-only, as before', async () => {
  const { fake, tower, port } = await setup();
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  assert.deepEqual(inbox.find((m) => m.type === 'access'), { type: 'access', input: false });
  ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => inbox.some((m) => m.type === 'command'));
  assert.equal(last(inbox, 'command')?.on, false);
  ws.close();
  await tower.close();
  await fake.close();
});

// --- Sizing the PTY to the phone (ADR 2026-10-23_phone-pty-resize). s1 starts at 80x24. ---

const resizes = (fake: FakeCockpitServer) =>
  fake.received.filter((m) => m.t === 'pty.resize').map((m) => ({ id: m.id, cols: m.cols, rows: m.rows }));

/** Watching s1 with command mode on. */
async function commanding(port: number, opts: Parameters<typeof viewer>[1] = {}) {
  const v = await watching(port, opts);
  v.ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(v.inbox, 'command')?.on === true);
  return v;
}

/** Sends a resize and waits for the gateway's answer (a size, or a refusal). */
async function sizeTo(v: { ws: WebSocket; inbox: Array<Record<string, unknown>> }, msg: object) {
  const n = v.inbox.filter((m) => m.type === 'size' || m.type === 'resize').length;
  v.ws.send(JSON.stringify({ type: 'resize', ...msg }));
  await waitFor(() => v.inbox.filter((m) => m.type === 'size' || m.type === 'resize').length > n);
}

test('resize outside command mode is refused and nothing reaches Cockpit', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await watching(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  assert.deepEqual(last(v.inbox, 'resize'), { type: 'resize', ok: false, reason: 'command_off' });
  assert.deepEqual(resizes(fake), []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('in command mode the watched session takes the phone size, whatever id the message names, logged first', async () => {
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log);
  const v = await commanding(port);
  await sizeTo(v, { id: 's2', cols: 45, rows: 40 });
  assert.deepEqual(resizes(fake), [{ id: 's1', cols: 45, rows: 40 }]);
  assert.deepEqual(last(v.inbox, 'size'), { type: 'size', id: 's1', cols: 45, rows: 40, by: 'phone' });
  const entry = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').at(-1)!);
  assert.deepEqual([entry.kind, entry.session, entry.cols, entry.rows, entry.from], ['resize', 's1', 45, 40, { cols: 80, rows: 24 }]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('sizes are clamped to the allowed range, and non-integers are refused', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 5, rows: 1000 });
  assert.deepEqual(resizes(fake), [{ id: 's1', cols: 20, rows: 300 }]);
  await sizeTo(v, { cols: '45', rows: 40 });
  assert.equal(last(v.inbox, 'resize')?.reason, 'invalid');
  assert.equal(resizes(fake).length, 1);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('command off gives the Mac its size back, once', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  v.ws.send(JSON.stringify({ type: 'command', on: false }));
  await waitFor(() => resizes(fake).length === 2);
  assert.deepEqual(resizes(fake)[1], { id: 's1', cols: 80, rows: 24 });
  await waitFor(() => last(v.inbox, 'size')?.by === 'mac');
  v.ws.send(JSON.stringify({ type: 'command', on: false }));
  v.ws.send(JSON.stringify({ type: 'list' }));
  await waitFor(() => v.inbox.filter((m) => m.type === 'command').length >= 3);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(resizes(fake).length, 2);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('selecting another session gives the size back', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  v.ws.send(JSON.stringify({ type: 'select', id: 's2' }));
  await waitFor(() => resizes(fake).length === 2);
  assert.deepEqual(resizes(fake)[1], { id: 's1', cols: 80, rows: 24 });
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('closing the page gives the size back before the Cockpit connection goes', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  v.ws.close();
  await waitFor(() => resizes(fake).length === 2);
  assert.deepEqual(resizes(fake)[1], { id: 's1', cols: 80, rows: 24 });
  await tower.close();
  await fake.close();
});

test('a session that ends or leaves the list is not resized back', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  fake.exit('s1', 0);
  await waitFor(() => last(v.inbox, 'command')?.on === false);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(resizes(fake).length, 1);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('losing Cockpit leaves the size owed and gives it back after the reconnect', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  fake.dropClients();
  await waitFor(() => last(v.inbox, 'command')?.on === false);
  await waitFor(() => resizes(fake).length === 2, 5000);
  assert.deepEqual(resizes(fake)[1], { id: 's1', cols: 80, rows: 24 });
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('if the Mac changed the size while Cockpit was away, nothing is given back', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  fake.dropClients();
  fake.setSize('s1', 100, 30);
  await waitFor(() => last(v.inbox, 'status')?.state === 'connected' && last(v.inbox, 'command')?.on === false, 5000);
  await new Promise((r) => setTimeout(r, 200));
  assert.equal(resizes(fake).length, 1);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('the Mac re-laying out during command mode takes the size back; the tower does not fight it', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  fake.setSize('s1', 100, 30);
  v.ws.send(JSON.stringify({ type: 'list' }));
  await waitFor(() => last(v.inbox, 'size')?.by === 'mac');
  assert.deepEqual(last(v.inbox, 'size'), { type: 'size', id: 's1', cols: 100, rows: 30, by: 'mac' });
  v.ws.send(JSON.stringify({ type: 'command', on: false }));
  await waitFor(() => last(v.inbox, 'command')?.on === false);
  await new Promise((r) => setTimeout(r, 100));
  assert.equal(resizes(fake).length, 1);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a second resize (font change) still gives back the original Mac size', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  await sizeTo(v, { cols: 38, rows: 40 });
  v.ws.send(JSON.stringify({ type: 'command', on: false }));
  await waitFor(() => resizes(fake).length === 3);
  assert.deepEqual(resizes(fake), [
    { id: 's1', cols: 45, rows: 40 },
    { id: 's1', cols: 38, rows: 40 },
    { id: 's1', cols: 80, rows: 24 },
  ]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a second viewer cannot size a session another viewer sized', async () => {
  const { fake, tower, port } = await inputSetup();
  const first = await commanding(port);
  await sizeTo(first, { cols: 45, rows: 40 });
  const second = await commanding(port);
  await sizeTo(second, { cols: 30, rows: 20 });
  assert.equal(last(second.inbox, 'resize')?.reason, 'busy');
  assert.deepEqual(resizes(fake), [{ id: 's1', cols: 45, rows: 40 }]);
  first.ws.close();
  second.ws.close();
  await tower.close();
  await fake.close();
});

test('a resize that cannot be logged is refused and not sent', async () => {
  const failing: InputLog = { append: () => false };
  const { fake, tower, port } = await inputSetup(failing);
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  assert.equal(last(v.inbox, 'resize')?.reason, 'log_failed');
  assert.deepEqual(resizes(fake), []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('stopping the gateway gives the size back before close() resolves', async () => {
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log);
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  await tower.close();
  // Logged right before the resize is written, so it is on disk by the time close() resolves.
  assert.ok(readFileSync(file, 'utf8').includes('"kind":"restore"'), 'give-back done by close()');
  v.ws.close();
  await waitFor(() => resizes(fake).length === 2);
  assert.deepEqual(resizes(fake)[1], { id: 's1', cols: 80, rows: 24 });
  await fake.close();
});

test('without the input option, resize is refused as before', async () => {
  const { fake, tower, port } = await setup();
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.send(JSON.stringify({ type: 'select', id: 's1' }));
  ws.send(JSON.stringify({ type: 'resize', cols: 45, rows: 40 }));
  await waitFor(() => inbox.some((m) => m.type === 'resize'));
  assert.equal(last(inbox, 'resize')?.reason, 'command_off');
  assert.deepEqual(resizes(fake), []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('a resize arriving while the gateway stops is refused, and the Mac ends at its own size', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  const closing = tower.close();
  v.ws.send(JSON.stringify({ type: 'resize', cols: 30, rows: 20 }));
  await closing;
  await waitFor(() => resizes(fake).length >= 2);
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(resizes(fake), [
    { id: 's1', cols: 45, rows: 40 },
    { id: 's1', cols: 80, rows: 24 },
  ]);
  assert.ok(v.inbox.some((m) => m.type === 'command' && m.on === false), 'command mode turned off by the stop');
  v.ws.close();
  await fake.close();
});

test('off, on and a new size in quick succession run in order: the give-back never lands after the new size', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  v.ws.send(JSON.stringify({ type: 'command', on: false }));
  v.ws.send(JSON.stringify({ type: 'command', on: true }));
  v.ws.send(JSON.stringify({ type: 'resize', cols: 30, rows: 20 }));
  await waitFor(() => resizes(fake).length === 3);
  assert.deepEqual(resizes(fake), [
    { id: 's1', cols: 45, rows: 40 },
    { id: 's1', cols: 80, rows: 24 },
    { id: 's1', cols: 30, rows: 20 },
  ]);
  v.ws.send(JSON.stringify({ type: 'command', on: false }));
  await waitFor(() => resizes(fake).length === 4);
  assert.deepEqual(resizes(fake)[3], { id: 's1', cols: 80, rows: 24 });
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('once the first viewer gives the size back, a second viewer may size the session', async () => {
  const { fake, tower, port } = await inputSetup();
  const first = await commanding(port);
  await sizeTo(first, { cols: 45, rows: 40 });
  first.ws.send(JSON.stringify({ type: 'command', on: false }));
  await waitFor(() => resizes(fake).length === 2);
  const second = await commanding(port);
  await sizeTo(second, { cols: 30, rows: 20 });
  assert.deepEqual(last(second.inbox, 'size'), { type: 'size', id: 's1', cols: 30, rows: 20, by: 'phone' });
  first.ws.close();
  second.ws.close();
  await waitFor(() => resizes(fake).length === 4);
  assert.deepEqual(resizes(fake)[3], { id: 's1', cols: 80, rows: 24 });
  await tower.close();
  await fake.close();
});

test('an idle viewer in command mode is dropped and gives the size back', async () => {
  const { fake, tower, port } = await inputSetup(tempLog().log, { idleMs: 400 });
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  const code = await new Promise<number>((resolve) => v.ws.on('close', (c) => resolve(c)));
  assert.equal(code, 4408);
  await waitFor(() => resizes(fake).length === 2);
  assert.deepEqual(resizes(fake)[1], { id: 's1', cols: 80, rows: 24 });
  await tower.close();
  await fake.close();
});

test('a session list taken before a size change carries the new size, so the page never undoes it', async () => {
  const slowInfo = async () => {
    await new Promise((r) => setTimeout(r, 300));
    return { info: {}, theme: 'system' as const };
  };
  const { fake, tower, port } = await inputSetup(tempLog().log, { sessionInfo: slowInfo as never });
  const v = await commanding(port);
  v.ws.send(JSON.stringify({ type: 'list' })); // its list is taken now, at 80x24, and posted 300 ms later
  await new Promise((r) => setTimeout(r, 50));
  await sizeTo(v, { cols: 45, rows: 40 });
  const sinceSize = () => v.inbox.slice(v.inbox.findIndex((m) => m.type === 'size')).filter((m) => m.type === 'sessions');
  await waitFor(() => sinceSize().length >= 1);
  const afterSize = sinceSize();
  for (const m of afterSize) {
    const s1 = (m.sessions as Array<{ id: string; cols: number; rows: number }>).find((s) => s.id === 's1')!;
    assert.deepEqual([s1.cols, s1.rows], [45, 40]);
  }
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('command mode cannot be turned back on while the gateway stops', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  const closing = tower.close();
  v.ws.send(JSON.stringify({ type: 'command', on: true }));
  v.ws.send(JSON.stringify({ type: 'resize', cols: 30, rows: 20 }));
  await closing;
  await waitFor(() => resizes(fake).length >= 2);
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(resizes(fake).at(-1), { id: 's1', cols: 80, rows: 24 });
  assert.ok(!resizes(fake).some((r) => r.cols === 30), 'no resize after the stop began');
  v.ws.close();
  await fake.close();
});

// --- Scrolling the agent from the phone (ADR 2026-10-23_phone-fullscreen-scroll). s1 is 80x24. ---

/** Sends a wheel and waits for a new pty.input in the fake or a wheel refusal. */
async function wheelTo(fake: FakeCockpitServer, v: { ws: WebSocket; inbox: Array<Record<string, unknown>> }, msg: object) {
  const sent = inputs(fake).length;
  const refused = v.inbox.filter((m) => m.type === 'wheel').length;
  v.ws.send(JSON.stringify({ type: 'wheel', ...msg }));
  await waitFor(() => inputs(fake).length > sent || v.inbox.filter((m) => m.type === 'wheel').length > refused);
}
const SGR_UP_10_5 = '1b5b3c36343b31303b354d';

test('wheel outside command mode is refused and nothing reaches Cockpit', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await watching(port);
  await wheelTo(fake, v, { dir: 'up', count: 3, mode: 'sgr', col: 10, row: 5 });
  assert.deepEqual(last(v.inbox, 'wheel'), { type: 'wheel', ok: false, reason: 'command_off' });
  assert.deepEqual(inputs(fake), []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('in command mode a wheel reaches the watched session as exact bytes, logged first, with no ok echo', async () => {
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log);
  const v = await commanding(port);
  await wheelTo(fake, v, { id: 's2', dir: 'up', count: 3, mode: 'sgr', col: 10, row: 5 });
  assert.deepEqual(inputs(fake), [{ id: 's1', bytes: SGR_UP_10_5.repeat(3) }]);
  const entry = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').at(-1)!);
  assert.deepEqual([entry.kind, entry.dir, entry.count, entry.mode, entry.col, entry.row, entry.bytes], ['wheel', 'up', 3, 'sgr', 10, 5, 33]);
  await new Promise((r) => setTimeout(r, 50));
  assert.ok(!v.inbox.some((m) => m.type === 'wheel' || m.type === 'input'), 'no reply for an accepted wheel');
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('wheel count and cell are clamped to the limit and the PTY size', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await wheelTo(fake, v, { dir: 'up', count: 50, mode: 'sgr', col: 500, row: 500 });
  assert.deepEqual(inputs(fake), [{ id: 's1', bytes: Buffer.from('\x1b[<64;80;24M'.repeat(20), 'latin1').toString('hex') }]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('after the phone sizes the session, the wheel cell is clamped to the new size', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await sizeTo(v, { cols: 45, rows: 40 });
  await wheelTo(fake, v, { dir: 'down', count: 1, mode: 'sgr', col: 80, row: 40 });
  assert.deepEqual(inputs(fake), [{ id: 's1', bytes: Buffer.from('\x1b[<65;45;40M', 'latin1').toString('hex') }]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('wheel in X10 and as application-mode arrows has the exact bytes', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  await wheelTo(fake, v, { dir: 'up', count: 1, mode: 'x10', col: 10, row: 5 });
  await wheelTo(fake, v, { dir: 'down', count: 2, mode: 'arrows', app: true });
  assert.deepEqual(inputs(fake), [
    { id: 's1', bytes: '1b5b4d602a25' },
    { id: 's1', bytes: '1b4f421b4f42' },
  ]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('an invalid wheel is refused before anything is logged or sent', async () => {
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log);
  const v = await commanding(port);
  for (const bad of [{ dir: 'left', count: 1, mode: 'sgr', col: 1, row: 1 }, { dir: 'up', count: 1, mode: 'urxvt', col: 1, row: 1 }, { dir: 'up', count: 0, mode: 'arrows' }]) {
    await wheelTo(fake, v, bad);
    assert.equal(last(v.inbox, 'wheel')?.reason, 'invalid');
  }
  assert.deepEqual(inputs(fake), []);
  assert.equal(readFileSync(file, 'utf8'), '');
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a wheel that cannot be logged is refused and not sent', async () => {
  const failing: InputLog = { append: () => false };
  const { fake, tower, port } = await inputSetup(failing);
  const v = await commanding(port);
  await wheelTo(fake, v, { dir: 'up', count: 1, mode: 'sgr', col: 1, row: 1 });
  assert.equal(last(v.inbox, 'wheel')?.reason, 'log_failed');
  assert.deepEqual(inputs(fake), []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('without the input option, wheel is refused as before', async () => {
  const { fake, tower, port } = await setup();
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.send(JSON.stringify({ type: 'select', id: 's1' }));
  ws.send(JSON.stringify({ type: 'wheel', dir: 'up', count: 1, mode: 'sgr', col: 1, row: 1 }));
  await waitFor(() => inbox.some((m) => m.type === 'wheel'));
  assert.equal(last(inbox, 'wheel')?.reason, 'command_off');
  assert.ok(!fake.received.some((m) => m.t === 'pty.input'));
  ws.close();
  await tower.close();
  await fake.close();
});

test('a Mac-side size change seen in a list re-bounds the wheel cell', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  fake.setSize('s1', 100, 30);
  v.ws.send(JSON.stringify({ type: 'list' }));
  await waitFor(() => v.inbox.some((m) => m.type === 'sessions' && (m.sessions as Array<{ id: string; cols: number }>).some((s) => s.id === 's1' && s.cols === 100)));
  await wheelTo(fake, v, { dir: 'up', count: 1, mode: 'sgr', col: 999, row: 999 });
  assert.deepEqual(inputs(fake), [{ id: 's1', bytes: Buffer.from('\x1b[<64;100;30M', 'latin1').toString('hex') }]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a wheel after selecting another session is refused: command mode does not follow the viewer', async () => {
  const { fake, tower, port } = await inputSetup();
  const v = await commanding(port);
  v.ws.send(JSON.stringify({ type: 'select', id: 's2' }));
  await waitFor(() => last(v.inbox, 'command')?.on === false);
  await wheelTo(fake, v, { dir: 'up', count: 1, mode: 'sgr', col: 1, row: 1 });
  assert.equal(last(v.inbox, 'wheel')?.reason, 'command_off');
  assert.deepEqual(inputs(fake), []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

// --- A new terminal from the phone (ADR 2026-10-24_phone-new-tab) ---

const W = '/Users/me/app/w';
/** s1 lives in workspace W; s2 has no workspace. */
const workspaceInfo = (async (sessions: Array<{ id: string }>) => ({
  info: Object.fromEntries(sessions.map((s) => [s.id, { workspace: s.id === 's1' ? { name: 'w', path: W, rank: 0 } : null }])),
  theme: 'system',
})) as unknown as TowerServerOptions['sessionInfo'];

/** A newTab that records the folders it was asked for; `hold` keeps it running until released. */
function fakeNewTab(result: Awaited<ReturnType<NonNullable<TowerServerOptions['newTab']>>> = { ok: true, tabId: 't12' }) {
  const folders: string[] = [];
  let release: (() => void) | undefined;
  let hold = false;
  const newTab: NonNullable<TowerServerOptions['newTab']> = async (folder) => {
    folders.push(folder);
    if (hold) await new Promise<void>((r) => (release = r));
    return result;
  };
  return { newTab, folders, holdNext: () => (hold = true), release: () => release?.() };
}

async function newTabTo(v: { ws: WebSocket; inbox: Array<Record<string, unknown>> }, msg: object = {}) {
  const before = v.inbox.filter((m) => m.type === 'new-tab').length;
  v.ws.send(JSON.stringify({ type: 'new-tab', ...msg }));
  await waitFor(() => v.inbox.filter((m) => m.type === 'new-tab').length > before);
  return last(v.inbox, 'new-tab');
}

test('new-tab outside command mode is refused and nothing opens', async () => {
  const nt = fakeNewTab();
  const { fake, tower, port } = await inputSetup(undefined, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await watching(port);
  assert.deepEqual(await newTabTo(v), { type: 'new-tab', ok: false, reason: 'command_off' });
  assert.deepEqual(nt.folders, []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('another Tailscale login cannot open a terminal', async () => {
  const nt = fakeNewTab();
  const { fake, tower, port } = await inputSetup(undefined, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await watching(port, { headers: { 'tailscale-user-login': 'someone@else.com' } });
  v.ws.send(JSON.stringify({ type: 'command', on: true }));
  assert.equal((await newTabTo(v))?.reason, 'command_off');
  assert.deepEqual(nt.folders, []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('without the input option, new-tab is refused even if a newTab is given', async () => {
  const nt = fakeNewTab();
  const { fake, tower, port } = await setup({ sessionInfo: workspaceInfo, newTab: nt.newTab });
  const { ws, inbox } = viewer(port);
  await waitFor(() => inbox.some((m) => m.type === 'sessions'));
  ws.send(JSON.stringify({ type: 'select', id: 's1' }));
  assert.equal((await newTabTo({ ws, inbox }))?.reason, 'command_off');
  assert.deepEqual(nt.folders, []);
  ws.close();
  await tower.close();
  await fake.close();
});

test('new-tab opens in the watched session\'s workspace, logged first, ignoring anything the browser sends', async () => {
  const nt = fakeNewTab();
  const { file, log } = tempLog();
  const { fake, tower, port } = await inputSetup(log, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await commanding(port);
  const lists = v.inbox.filter((m) => m.type === 'sessions').length;
  const answer = await newTabTo(v, { folder: '/etc', cwd: '/tmp', dir: '/', id: 's2' });
  assert.deepEqual(answer, { type: 'new-tab', ok: true, folder: W });
  assert.deepEqual(nt.folders, [W]);
  const line = JSON.parse(readFileSync(file, 'utf8').trim().split('\n').at(-1)!);
  assert.deepEqual([line.kind, line.session, line.folder, line.login], ['new-tab', 's1', W, 'me@example.com']);
  await waitFor(() => v.inbox.filter((m) => m.type === 'sessions').length > lists); // a fresh list for the page to pick from
  assert.ok(fake.received.every((m) => ALLOWED_OUTBOUND.has(m.t)));
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a watched session with no workspace has nowhere to open', async () => {
  const nt = fakeNewTab();
  const { fake, tower, port } = await inputSetup(undefined, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await watching(port);
  v.ws.send(JSON.stringify({ type: 'select', id: 's2' }));
  await waitFor(() => fake.received.some((m) => m.t === 'pty.attach' && m.id === 's2'));
  v.ws.send(JSON.stringify({ type: 'command', on: true }));
  await waitFor(() => last(v.inbox, 'command')?.on === true);
  assert.equal((await newTabTo(v))?.reason, 'no_workspace');
  assert.deepEqual(nt.folders, []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a log that cannot be written refuses new-tab', async () => {
  const nt = fakeNewTab();
  const failing: InputLog = { append: () => false };
  const { fake, tower, port } = await inputSetup(failing, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await commanding(port);
  assert.equal((await newTabTo(v))?.reason, 'log_failed');
  assert.deepEqual(nt.folders, []);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a second new-tab while one is running is refused', async () => {
  const nt = fakeNewTab();
  nt.holdNext();
  const { fake, tower, port } = await inputSetup(undefined, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await commanding(port);
  v.ws.send(JSON.stringify({ type: 'new-tab' }));
  await waitFor(() => nt.folders.length === 1);
  assert.equal((await newTabTo(v))?.reason, 'opening');
  nt.release();
  await waitFor(() => last(v.inbox, 'new-tab')?.ok === true);
  assert.deepEqual(nt.folders, [W]);
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a newTab that throws is a failure, not a crash', async () => {
  const newTab: NonNullable<TowerServerOptions['newTab']> = async () => {
    throw new Error('boom');
  };
  const { fake, tower, port } = await inputSetup(undefined, { sessionInfo: workspaceInfo, newTab });
  const v = await commanding(port);
  assert.deepEqual(await newTabTo(v), { type: 'new-tab', ok: false, reason: 'failed' });
  v.ws.close();
  await tower.close();
  await fake.close();
});

test('a failure from Cockpit comes back as the refusal reason', async () => {
  const nt = fakeNewTab({ ok: false, reason: 'remote' });
  const { fake, tower, port } = await inputSetup(undefined, { sessionInfo: workspaceInfo, newTab: nt.newTab });
  const v = await commanding(port);
  assert.deepEqual(await newTabTo(v), { type: 'new-tab', ok: false, reason: 'remote' });
  v.ws.close();
  await tower.close();
  await fake.close();
});
