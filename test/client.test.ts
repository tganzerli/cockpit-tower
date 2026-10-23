import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { CockpitClient, CockpitUnavailable, ProtocolMismatch } from '../src/cockpit-client.ts';
import { ALLOWED_OUTBOUND } from '../src/protocol.ts';
import { FakeCockpitServer } from './fake-cockpit-server.ts';

async function waitFor(cond: () => boolean, timeoutMs = 2000): Promise<void> {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 5));
  }
}

const client = (socketPath: string, reconnect = false) =>
  new CockpitClient({ socketPath, clientName: 'tower-test', reconnect, reconnectDelayMs: 20 });

test('missing socket is reported as Cockpit not running, without creating anything', async () => {
  await assert.rejects(client('/tmp/does-not-exist/cockpit-server.sock').connect(), CockpitUnavailable);
});

test('version mismatch becomes a ProtocolMismatch error', async () => {
  const fake = new FakeCockpitServer();
  fake.protocolVersion = 3;
  await fake.listen();
  await assert.rejects(client(fake.socketPath).connect(), ProtocolMismatch);
  await fake.close();
});

test('handshake, list, attach with replay then live output', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'history-');
  await fake.listen();
  const c = client(fake.socketPath);
  assert.equal((await c.connect()).server, 'fake-0.0.0');

  const sessions = await c.list();
  assert.deepEqual(sessions.map((s) => [s.id, s.len]), [['s1', 8]]);

  const chunks: string[] = [];
  c.on('output', (_id: string, _off: number, bytes: Buffer) => chunks.push(bytes.toString()));
  c.attach('s1', 0);
  await once(c, 'output');
  fake.write('s1', 'live');
  await once(c, 'output');
  assert.equal(chunks.join(''), 'history-live');

  c.close();
  await fake.close();
});

test('server noise (turn.status, cli.cmd rpc, unknown types) is ignored and never answered', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'x');
  await fake.listen();
  const c = client(fake.socketPath);
  await c.connect();
  fake.broadcastNoise();
  await c.list(); // a round trip after the noise proves the client is still healthy
  assert.ok(fake.received.every((m) => ALLOWED_OUTBOUND.has(m.t)), JSON.stringify(fake.received));
  c.close();
  await fake.close();
});

test('after a drop the client reconnects and resumes from the last offset', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'abc');
  await fake.listen();
  const c = client(fake.socketPath, true);
  await c.connect();
  c.attach('s1', 0);
  await once(c, 'output');

  try {
    fake.dropClients();
    await once(c, 'reconnected');
    const attaches = () => fake.received.filter((m) => m.t === 'pty.attach');
    await waitFor(() => attaches().length === 2);
    assert.equal(attaches().at(-1)?.from, 3);
  } finally {
    c.close();
    await fake.close();
  }
});

test('without input() or resize() the client sends only read types', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'y');
  await fake.listen();
  const c = client(fake.socketPath);
  await c.connect();
  await c.list();
  c.attach('s1');
  await once(c, 'output');
  c.detach('s1');
  await c.list();
  assert.deepEqual([...new Set(fake.received.map((m) => m.t))].sort(), ['hello', 'pty.attach', 'pty.detach', 'pty.list']);
  c.close();
  await fake.close();
});

test('input() sends pty.input with the bytes in base64, and nothing while disconnected', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1');
  await fake.listen();
  const c = client(fake.socketPath);
  assert.equal(c.input('s1', Buffer.from('x')), false);
  await c.connect();
  assert.equal(c.input('s1', Buffer.from('ls\r')), true);
  await waitFor(() => fake.received.some((m) => m.t === 'pty.input'));
  assert.deepEqual(fake.received.filter((m) => m.t === 'pty.input'), [{ t: 'pty.input', id: 's1', d: 'bHMN' }]);
  assert.ok(fake.received.every((m) => ALLOWED_OUTBOUND.has(m.t)));
  c.close();
  await fake.close();
});

test('resize() sends pty.resize with rows and cols, and nothing while disconnected', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1');
  await fake.listen();
  const c = client(fake.socketPath);
  assert.equal(c.resize('s1', 45, 40), false);
  await c.connect();
  assert.equal(c.resize('s1', 45, 40), true);
  await waitFor(() => fake.received.some((m) => m.t === 'pty.resize'));
  assert.deepEqual(fake.received.filter((m) => m.t === 'pty.resize'), [{ t: 'pty.resize', id: 's1', rows: 40, cols: 45 }]);
  assert.deepEqual((await c.list()).map((s) => [s.cols, s.rows]), [[45, 40]]);
  c.close();
  await fake.close();
});

test('a select made while disconnected is the one re-attached on reconnect', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1', 'one');
  fake.addSession('s2', 'two');
  await fake.listen();
  const c = new CockpitClient({ socketPath: fake.socketPath, clientName: 't', reconnect: true, reconnectDelayMs: 50 });
  try {
    await c.connect();
    c.attach('s1', 0);
    await once(c, 'output');
    fake.dropClients();
    await once(c, 'disconnected');
    c.detach('s1');
    c.attach('s2', 0);
    await once(c, 'reconnected');
    const attaches = () => fake.received.filter((m) => m.t === 'pty.attach').map((m) => m.id);
    await waitFor(() => attaches().length === 2);
    assert.deepEqual(attaches(), ['s1', 's2']);
  } finally {
    c.close();
    await fake.close();
  }
});

test('a socket that never answers the handshake fails with a clear error', async () => {
  const fake = new FakeCockpitServer();
  fake.silent = true;
  await fake.listen();
  const c = new CockpitClient({ socketPath: fake.socketPath, clientName: 't', reconnect: false, handshakeTimeoutMs: 100 });
  await assert.rejects(c.connect(), /did not answer/);
  await fake.close();
});

test('list() rejects instead of hanging when the connection drops', async () => {
  const fake = new FakeCockpitServer();
  fake.addSession('s1');
  await fake.listen();
  const c = client(fake.socketPath);
  await c.connect();
  fake.silent = true;
  const pending = c.list();
  fake.dropClients();
  await assert.rejects(pending);
  c.close();
  await fake.close();
});
