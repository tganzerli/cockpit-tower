import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCloseTab } from '../src/close-tab.ts';
import type { Runner } from '../src/session-info.ts';
import type { Session } from '../src/protocol.ts';

const BIN = '/fake/cockpit';
const LSOF = '/usr/sbin/lsof';
const W = '/Users/me/app/w';
const R = '/Users/me/app/r';

const WORKSPACES = [
  { id: 'w1', name: 'w', path: W },
  { id: 'r1', name: 'r', path: R },
];
// One terminal per workspace, with tab ids out of the sessions' order (as after a Cockpit restart).
const TABS = [
  { id: 't3', kind: 'terminal', title: 'other', working: false, workspaceId: 'r1', workspacePath: R },
  { id: 't7', kind: 'terminal', title: '✳ second', working: false, workspaceId: 'w1', workspacePath: W },
  { id: 'v2', kind: 'file', title: 'README.md', workspaceId: 'w1', workspacePath: W },
];
const session = (id: string, pid: number, exit?: number): Session => ({ id, pid, cmd: '/bin/zsh', rows: 40, cols: 120, len: 0, ...(exit !== undefined ? { exit } : {}) });
const SESSIONS = [session('s8', 80), session('s11', 110)];
const CWDS: Record<number, string> = { 80: `${W}/lib`, 110: R };

/** A runner that answers lsof and the listing verbs and records every call. */
function fake(opts: { tabs?: unknown[]; cwds?: Record<number, string>; list?: boolean; out?: { ok: boolean; stdout: string } } = {}) {
  const calls: string[][] = [];
  const run: Runner = async (file, args) => {
    calls.push([file, ...args]);
    if (file === LSOF) {
      const cwds = opts.cwds ?? CWDS;
      return { ok: true, stdout: Object.entries(cwds).map(([pid, cwd]) => `p${pid}\nfcwd\nn${cwd}\n`).join('') };
    }
    assert.equal(file, BIN);
    if (args[0] === 'list-tabs') return { ok: opts.list !== false, stdout: JSON.stringify(opts.tabs ?? TABS) };
    if (args[0] === 'list-workspaces') return { ok: opts.list !== false, stdout: JSON.stringify(WORKSPACES) };
    return opts.out ?? { ok: true, stdout: `{"tabId":"${args[1]}"}\n` };
  };
  return { run, calls, closeTab: createCloseTab({ cockpitBin: BIN, run }) };
}
const closed = (calls: string[][]) => calls.filter((c) => c[0] === BIN && c[1] === 'close-tab');

test('the watched session’s tab is the only terminal in its folder, with its Cockpit title and the id fingerprint', async () => {
  const f = fake();
  assert.deepEqual(await f.closeTab.resolve(SESSIONS, 's8'), {
    ok: true,
    target: { tabId: 't7', title: '✳ second', ids: 's11,s8|t3,t7' },
  });
  assert.deepEqual(closed(f.calls), [], 'resolving never closes');
});

test('close runs exactly close-tab <id> --json and checks the id that comes back', async () => {
  const f = fake();
  assert.deepEqual(await f.closeTab.close('t7'), { ok: true });
  assert.deepEqual(closed(f.calls), [[BIN, 'close-tab', 't7', '--json']]);
});

test('a second terminal or a second shell in the folder is no tab, and nothing closes', async () => {
  const twoTabs = fake({ tabs: [...TABS, { id: 't12', kind: 'terminal', title: 'zsh', working: false, workspaceId: 'w1', workspacePath: W }] });
  assert.deepEqual(await twoTabs.closeTab.resolve(SESSIONS, 's8'), { ok: false, reason: 'no_tab' });
  const twoShells = fake({ cwds: { ...CWDS, 110: W } });
  assert.deepEqual(await twoShells.closeTab.resolve(SESSIONS, 's8'), { ok: false, reason: 'no_tab' });
  assert.deepEqual([...closed(twoTabs.calls), ...closed(twoShells.calls)], []);
});

test('a shell whose cwd lsof cannot tell, or a session with no tab, means no tab', async () => {
  assert.deepEqual(await fake().closeTab.resolve([...SESSIONS, session('s12', 120)], 's8'), { ok: false, reason: 'no_tab' });
  assert.deepEqual(await fake().closeTab.resolve(SESSIONS, 's99'), { ok: false, reason: 'no_tab' });
});

test('exited sessions are left out of the look', async () => {
  const f = fake();
  const out = await f.closeTab.resolve([...SESSIONS, session('s2', 20, 0)], 's8');
  assert.equal(out.ok, true);
  assert.ok(!f.calls.some((c) => c[0] === LSOF && c.at(-1)!.split(',').includes('20')), 'no cwd asked for an exited pid');
});

test('an agent at work in the tab refuses, and nothing closes', async () => {
  const f = fake({ tabs: TABS.map((t) => (t.id === 't7' ? { ...t, working: true } : t)) });
  assert.deepEqual(await f.closeTab.resolve(SESSIONS, 's8'), { ok: false, reason: 'working' });
  assert.deepEqual(closed(f.calls), []);
});

test('a remote workspace\'s tab is never a target', async () => {
  const f = fake({ tabs: TABS.map((t) => (t.id === 't3' ? { ...t, workspaceId: '__remote__pin1' } : t)) });
  assert.deepEqual(await f.closeTab.resolve(SESSIONS, 's11'), { ok: false, reason: 'no_tab' });
});

test('a tab id that would read as a flag, or an empty one, never reaches the command line', async () => {
  const f = fake({ tabs: TABS.map((t) => (t.id === 't7' ? { ...t, id: '-7' } : t)) });
  assert.deepEqual(await f.closeTab.resolve(SESSIONS, 's8'), { ok: false, reason: 'no_tab' });
  assert.deepEqual(await f.closeTab.close('-7'), { ok: false, reason: 'failed' });
  assert.deepEqual(await f.closeTab.close(''), { ok: false, reason: 'failed' });
  assert.deepEqual(closed(f.calls), []);
});

test('a listing that fails is cockpit_unavailable', async () => {
  assert.deepEqual(await fake({ list: false }).closeTab.resolve(SESSIONS, 's8'), { ok: false, reason: 'cockpit_unavailable' });
});

test('a failing CLI, garbled output or another tab id back is failed', async () => {
  assert.deepEqual(await fake({ out: { ok: false, stdout: '' } }).closeTab.close('t7'), { ok: false, reason: 'failed' });
  assert.deepEqual(await fake({ out: { ok: true, stdout: 'nope' } }).closeTab.close('t7'), { ok: false, reason: 'failed' });
  assert.deepEqual(await fake({ out: { ok: true, stdout: '{"tabId":"t3"}' } }).closeTab.close('t7'), { ok: false, reason: 'failed' });
});

test('only lsof, the listing verbs and close-tab are ever run', async () => {
  const f = fake();
  await f.closeTab.resolve(SESSIONS, 's8');
  await f.closeTab.close('t7');
  const verbs = f.calls.map((c) => (c[0] === LSOF ? 'lsof' : c[1]));
  assert.deepEqual([...new Set(verbs)].sort(), ['close-tab', 'list-tabs', 'list-workspaces', 'lsof']);
});

// --- A tab the phone's (+) opened (k26) ---

// A second terminal in w, opened by the (+): the folder alone can no longer tell the two apart.
const MADE_TABS = [...TABS, { id: 't12', kind: 'terminal', title: 'w', working: false, workspaceId: 'w1', workspacePath: W }];
const MADE_SESSIONS = [...SESSIONS, session('s13', 130)];
const MADE_CWDS = { ...CWDS, 130: W };
const PAIR = { pid: 130, tabId: 't12', folder: W };

test('the (+) pair finds its tab even with another terminal in the workspace', async () => {
  const f = fake({ tabs: MADE_TABS, cwds: MADE_CWDS });
  assert.deepEqual(await f.closeTab.resolve(MADE_SESSIONS, 's13', PAIR), {
    ok: true,
    target: { tabId: 't12', title: 'w', ids: 's11,s13,s8|t12,t3,t7' },
  });
  assert.deepEqual(await f.closeTab.resolve(MADE_SESSIONS, 's13'), { ok: false, reason: 'no_tab' }, 'no pair: the sole-terminal rule refuses');
  assert.deepEqual(closed(f.calls), []);
});

test('a pair whose pid, tab or folder no longer holds falls back to the sole-terminal rule', async () => {
  const cases: Array<[string, unknown[], typeof PAIR]> = [
    ['another pid (a Cockpit restart)', MADE_TABS, { ...PAIR, pid: 999 }],
    ['the tab is gone', TABS.concat({ id: 't14', kind: 'terminal', title: 'w', working: false, workspaceId: 'w1', workspacePath: W }), PAIR],
    ['the tab is in another folder', MADE_TABS.map((t) => (t.id === 't12' ? { ...t, workspaceId: 'r1', workspacePath: R } : t)), PAIR],
    ['the tab is remote', MADE_TABS.map((t) => (t.id === 't12' ? { ...t, workspaceId: '__remote__pin1' } : t)), PAIR],
    ['the tab is not a terminal', MADE_TABS.map((t) => (t.id === 't12' ? { ...t, kind: 'file' } : t)), PAIR],
  ];
  for (const [why, tabs, pair] of cases) {
    const f = fake({ tabs, cwds: MADE_CWDS });
    assert.deepEqual(await f.closeTab.resolve(MADE_SESSIONS, 's13', pair), { ok: false, reason: 'no_tab' }, why);
  }
});

test('an agent at work in the paired tab refuses', async () => {
  const f = fake({ tabs: MADE_TABS.map((t) => (t.id === 't12' ? { ...t, working: true } : t)), cwds: MADE_CWDS });
  assert.deepEqual(await f.closeTab.resolve(MADE_SESSIONS, 's13', PAIR), { ok: false, reason: 'working' });
});
