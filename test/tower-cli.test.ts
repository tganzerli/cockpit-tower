// bin/tower with one state dir shared by two checkouts (k25): the real script, a fake gateway and fake
// tailscale/caffeinate, so nothing here touches the tailnet or the real tower.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

const REPO = path.resolve(import.meta.dirname, '..');
// Answers /healthz like the real gateway, on TOWER_PORT. With FAKE_NOT_TOWER=1 (by env, so its command is still
// exactly `node <root>/src/main.ts`) it answers anything else.
const FAKE_GATEWAY = `import http from 'node:http';
const tower = process.env.FAKE_NOT_TOWER !== '1';
http.createServer((req, res) => res.end(tower && req.url === '/healthz' ? 'cockpit-tower' : 'x'))
  .listen(Number(process.env.TOWER_PORT), '127.0.0.1');
`;
const hasLsof = spawnSync('bash', ['-c', 'command -v lsof']).status === 0;

async function freePort(): Promise<number> {
  const srv = net.createServer().listen(0, '127.0.0.1');
  await new Promise((r) => srv.once('listening', r));
  const { port } = srv.address() as net.AddressInfo;
  await new Promise((r) => srv.close(r));
  return port;
}

/** Two fake checkouts, A and B, sharing one state dir and one port. */
async function world(opts: { lsof?: boolean } = {}) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'tower-cli-'));
  const stubs = path.join(root, 'stubs');
  mkdirSync(stubs);
  writeFileSync(path.join(stubs, 'tailscale'), '#!/bin/bash\n[[ "$1 $2" == "status --json" ]] && echo "{}"\nexit 0\n');
  writeFileSync(path.join(stubs, 'caffeinate'), '#!/bin/bash\nwhile kill -0 "$3" 2>/dev/null; do sleep 0.2; done\n');
  // `ps -p <pid>` with nothing else is the script's liveness check: STUCK_PID makes that pid look alive forever.
  const realPs = spawnSync('bash', ['-c', 'command -v ps'], { encoding: 'utf8' }).stdout.trim();
  writeFileSync(
    path.join(stubs, 'ps'),
    `#!/bin/bash\n[[ -n "$STUCK_PID" && $# -eq 2 && "$1" == "-p" && "$2" == "$STUCK_PID" ]] && exit 0\nexec ${realPs} "$@"\n`,
  );
  for (const f of ['tailscale', 'caffeinate', 'ps']) chmodSync(path.join(stubs, f), 0o755);
  const checkout = (name: string) => {
    const dir = path.join(root, name);
    for (const d of ['bin', 'src', 'node_modules/ws']) mkdirSync(path.join(dir, d), { recursive: true });
    copyFileSync(path.join(REPO, 'bin/tower'), path.join(dir, 'bin/tower'));
    copyFileSync(path.join(REPO, 'src/status-json.ts'), path.join(dir, 'src/status-json.ts'));
    writeFileSync(path.join(dir, 'src/main.ts'), FAKE_GATEWAY);
    writeFileSync(path.join(dir, 'src/serve-status.ts'), 'process.exit(0);\n');
    writeFileSync(path.join(dir, 'src/tailnet-identity.ts'), '');
    return dir;
  };
  const A = checkout('A');
  const B = checkout('B');
  // Without lsof: a PATH of links to the tools the script needs, and nothing else.
  let toolPath = process.env.PATH ?? '';
  if (opts.lsof === false) {
    const tools = path.join(root, 'tools');
    mkdirSync(tools);
    for (const t of ['bash', 'node', 'curl', 'perl', 'ps', 'cat', 'sed', 'seq', 'sleep', 'mkdir', 'chmod', 'rm', 'nohup', 'dirname', 'kill']) {
      const where = spawnSync('bash', ['-c', `command -v ${t}`], { encoding: 'utf8' }).stdout.trim();
      if (where.startsWith('/')) execFileSync('ln', ['-s', where, path.join(tools, t)]);
    }
    toolPath = tools;
  }
  const env = {
    PATH: `${stubs}:${toolPath}`,
    HOME: root,
    TOWER_STATE: path.join(root, 'state'),
    TOWER_PORT: String(await freePort()),
    TOWER_HTTPS_PORT: '18443',
    TOWER_OWNER: 'me',
  };
  const tower = (dir: string, ...args: string[]) => towerWith({}, dir, ...args);
  const towerWith = (extra: Record<string, string>, dir: string, ...args: string[]) => {
    const r = spawnSync('bash', [path.join(dir, 'bin/tower'), ...args], { env: { ...env, ...extra }, encoding: 'utf8', timeout: 30_000 });
    return { status: r.status, out: `${r.stdout}${r.stderr}` };
  };
  const pidfile = path.join(env.TOWER_STATE, 'gateway.pid');
  /** Live processes started from this world, by pid. */
  const running = () =>
    execFileSync('ps', ['-A', '-o', 'pid=,command='], { encoding: 'utf8' })
      .split('\n')
      .filter((l) => l.includes(root))
      .map((l) => ({ pid: Number(l.trim().split(/\s+/)[0]), cmd: l.trim().replace(/^\d+\s+/, '') }));
  const gateways = () => running().filter((p) => p.cmd.endsWith('/src/main.ts') || p.cmd.includes('/src/main.ts '));
  const cleanup = () => {
    for (const p of running()) {
      try {
        process.kill(p.pid, 'SIGKILL');
      } catch {}
    }
    rmSync(root, { recursive: true, force: true });
  };
  /** Starts a fake gateway by hand (not through bin/tower), from `dir`; returns its pid once it listens. */
  const spawnFake = async (dir: string, extra: Record<string, string> = {}) => {
    const r = spawnSync('bash', ['-c', `nohup node ${dir}/src/main.ts >/dev/null 2>&1 & echo $!`], { env: { ...env, ...extra }, encoding: 'utf8' });
    await new Promise((res) => setTimeout(res, 500));
    return Number(r.stdout.trim());
  };
  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };
  return { root, A, B, env, tower, towerWith, pidfile, gateways, spawnFake, alive, cleanup };
}

test("B off stops the gateway A started, says where it came from, and leaves no pid file", async () => {
  const w = await world();
  try {
    assert.equal(w.tower(w.A, 'on').status, 0);
    assert.equal(w.gateways().length, 1);
    const off = w.tower(w.B, 'off');
    assert.equal(off.status, 0);
    assert.match(off.out, new RegExp(`gateway stopped \\(started from ${w.A}\\)`));
    assert.deepEqual(w.gateways(), []);
    assert.equal(existsSync(w.pidfile), false);
  } finally {
    w.cleanup();
  }
});

test("B on switches from A's gateway to B's", async () => {
  const w = await world();
  try {
    w.tower(w.A, 'on');
    const on = w.tower(w.B, 'on');
    assert.equal(on.status, 0, on.out);
    assert.match(on.out, new RegExp(`a gateway from ${w.A} is running; switching to ${w.B}`));
    const live = w.gateways();
    assert.equal(live.length, 1);
    assert.ok(live[0]!.cmd.includes(`${w.B}/src/main.ts`));
    assert.equal(Number(readFileSync(w.pidfile, 'utf8')), live[0]!.pid);
  } finally {
    w.cleanup();
  }
});

test('off finds a tower gateway that lost its pid file through the port', { skip: !hasLsof && 'needs lsof' }, async () => {
  const w = await world();
  try {
    w.tower(w.A, 'on');
    const pid = Number(readFileSync(w.pidfile, 'utf8'));
    rmSync(w.pidfile);
    const on = w.tower(w.A, 'on'); // found through the port: the pid file comes back
    assert.match(on.out, /gateway already running/);
    assert.equal(Number(readFileSync(w.pidfile, 'utf8')), pid);
    rmSync(w.pidfile);
    const off = w.tower(w.A, 'off');
    assert.match(off.out, /tower: gateway stopped\n/);
    assert.deepEqual(w.gateways(), []);
  } finally {
    w.cleanup();
  }
});

test('a `node <checkout>/src/main.ts` on the port that does not answer cockpit-tower is named by on and never stopped by off', async () => {
  const w = await world();
  try {
    const pid = await w.spawnFake(w.A, { FAKE_NOT_TOWER: '1' }); // same command as a gateway; only /healthz differs
    const on = w.tower(w.B, 'on');
    assert.notEqual(on.status, 0);
    assert.match(on.out, hasLsof ? new RegExp(`port ${w.env.TOWER_PORT} is already in use by pid ${pid} `) : /already in use by another process/);
    assert.equal(w.tower(w.B, 'off').status, 0);
    assert.ok(w.alive(pid), 'the other server must still be alive');
  } finally {
    w.cleanup();
  }
});

test('a pid file naming a reused pid that is another project\'s `node …/src/main.ts` is not stopped', async () => {
  const w = await world();
  try {
    // Another project: same command shape, but its root has no bin/tower. Not on our port.
    const other = path.join(w.root, 'other-project');
    mkdirSync(path.join(other, 'src'), { recursive: true });
    copyFileSync(path.join(w.A, 'src/main.ts'), path.join(other, 'src/main.ts'));
    const pid = await w.spawnFake(other, { TOWER_PORT: String(await freePort()) });
    mkdirSync(w.env.TOWER_STATE, { recursive: true });
    writeFileSync(w.pidfile, `${pid}\n`);
    const off = w.tower(w.A, 'off');
    assert.equal(off.status, 0);
    assert.doesNotMatch(off.out, /gateway stopped/);
    assert.ok(w.alive(pid), 'the other project must still be alive');
  } finally {
    w.cleanup();
  }
});

test('a gateway that does not exit keeps its pid file, and off fails saying so', async () => {
  const w = await world();
  try {
    w.tower(w.A, 'on');
    const pid = Number(readFileSync(w.pidfile, 'utf8'));
    const off = w.towerWith({ STUCK_PID: String(pid) }, w.A, 'off');
    assert.notEqual(off.status, 0);
    assert.match(off.out, new RegExp(`could not stop the gateway \\(pid ${pid}, started from ${w.A}\\); its pid file is kept`));
    assert.doesNotMatch(off.out, /tower: off/);
    assert.equal(Number(readFileSync(w.pidfile, 'utf8')), pid);
  } finally {
    w.cleanup();
  }
});

test("B status shows A's gateway as on, with its checkout, in text and JSON", async () => {
  const w = await world();
  try {
    w.tower(w.A, 'on');
    const pid = Number(readFileSync(w.pidfile, 'utf8'));
    assert.match(w.tower(w.B, 'status').out, new RegExp(`gateway: +on \\(pid ${pid}, http://127\\.0\\.0\\.1:${w.env.TOWER_PORT}, from ${w.A}\\)`));
    assert.match(w.tower(w.A, 'status').out, new RegExp(`gateway: +on \\(pid ${pid}, http://127\\.0\\.0\\.1:${w.env.TOWER_PORT}\\)\\n`));
    const json = JSON.parse(w.tower(w.B, 'status', '--json').out);
    assert.deepEqual(json.gateway, { running: true, pid, port: Number(w.env.TOWER_PORT) });
  } finally {
    w.cleanup();
  }
});

test('without lsof, the pid file alone still lets B stop or replace A', async () => {
  const w = await world({ lsof: false });
  try {
    assert.equal(w.tower(w.A, 'on').status, 0);
    assert.match(w.tower(w.B, 'on').out, /switching to/);
    assert.match(w.tower(w.A, 'off').out, new RegExp(`gateway stopped \\(started from ${w.B}\\)`));
    assert.deepEqual(w.gateways(), []);
  } finally {
    w.cleanup();
  }
});
