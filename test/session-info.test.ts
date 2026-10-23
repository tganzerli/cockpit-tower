import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchOf, cockpitList, createSessionInfo, matchTabs, parseForeground, parseLsofCwd } from '../src/session-info.ts';
import type { Runner, Tab } from '../src/session-info.ts';
import type { CockpitState } from '../src/cockpit-state.ts';
import type { Session } from '../src/protocol.ts';

const H = '/Users/me';
const tab = (id: string, workspacePath: string, extra: Partial<Tab> = {}): Tab => ({
  id,
  title: id,
  working: false,
  focused: false,
  workspaceId: workspacePath || '__cockpit__',
  workspacePath,
  ...extra,
});

// The live layout observed on 2026-10-22: 15 sessions, 15 terminal tabs, ids with gaps on both sides.
const LIVE: Array<[string, string, string, string]> = [
  ['s3', `${H}/app/cockpit-tower`, 't8', `${H}/app/cockpit-tower`],
  ['s4', H, 't10', ''],
  ['s6', `${H}/app/project-d`, 't16', `${H}/app/project-d`],
  ['s8', `${H}/app/project-a/mobile`, 't29', `${H}/app/project-a/mobile`],
  ['s10', `${H}/app/project-c/v6`, 't38', `${H}/app/project-c/v6`],
  ['s12', `${H}/app/adm`, 't44', `${H}/app/adm`],
  ['s14', `${H}/app/adm/.claude/worktrees/agent-a9`, 't50', `${H}/app/adm/.claude/worktrees/agent-a9`],
  ['s15', `${H}/app/adm/.claude/worktrees/agent-ab`, 't53', `${H}/app/adm/.claude/worktrees/agent-ab`],
  ['s16', `${H}/app/project-c/wt-2e-be`, 't56', `${H}/app/project-c/wt-2e-be`],
  ['s17', `${H}/app/project-c/wt-2e-mg`, 't59', `${H}/app/project-c/wt-2e-mg`],
  ['s18', `${H}/app/project-c/wt-2e-ui`, 't62', `${H}/app/project-c/wt-2e-ui`],
  ['s20', `${H}/app/project-b`, 't75', `${H}/app/project-b`],
  ['s21', `${H}/app/project-c/wt-2e-cl`, 't78', `${H}/app/project-c/wt-2e-cl`],
  ['s24', `${H}/app/adm/.claude/worktrees/agent-ae`, 't87', `${H}/app/adm/.claude/worktrees/agent-ae`],
  ['s25', `${H}/app/adm/.claude/worktrees/agent-a8`, 't95', `${H}/app/adm/.claude/worktrees/agent-a8`],
];

const pairs = (m: Map<string, Tab>) => Object.fromEntries([...m].map(([s, t]) => [s, t.id]));

test('the live layout matches one to one by creation order and cwd', () => {
  const sessions = LIVE.map(([id, cwd]) => ({ id, cwd }));
  const tabs = LIVE.map(([, , id, p]) => tab(id, p)).reverse(); // input order must not matter
  assert.deepEqual(pairs(matchTabs(sessions, tabs, true)), Object.fromEntries(LIVE.map(([s, , t]) => [s, t])));
});

test('nothing is matched until the same ids were seen on the previous look', () => {
  const sessions = LIVE.map(([id, cwd]) => ({ id, cwd }));
  const tabs = LIVE.map(([, , id, p]) => tab(id, p));
  assert.deepEqual(pairs(matchTabs(sessions, tabs, false)), {});
});

test('a user cd into a subfolder still fits the tab at the same position', () => {
  const sessions = [{ id: 's1', cwd: `${H}/app/project-b/lib/src` }, { id: 's2', cwd: `${H}/app/project-c/v6` }];
  const tabs = [tab('t1', `${H}/app/project-b`), tab('t2', `${H}/app/project-c/v6`)];
  assert.deepEqual(pairs(matchTabs(sessions, tabs, true)), { s1: 't1', s2: 't2' });
});

test('one shell that left its workspace loses its tab; the others keep theirs', () => {
  const sessions = [{ id: 's1', cwd: `${H}/app/project-b` }, { id: 's2', cwd: '/tmp' }, { id: 's3', cwd: `${H}/app/project-c/v6` }];
  const tabs = [tab('t1', `${H}/app/project-b`), tab('t2', `${H}/app/project-d`), tab('t3', `${H}/app/project-c/v6`)];
  assert.deepEqual(pairs(matchTabs(sessions, tabs, true)), { s1: 't1', s3: 't3' });
});

test('a tab’s shell that left and another shell that entered its folder never swap tabs', () => {
  // s1 belongs to t1 but cd'd away; s2 is the folderless tab's shell, now inside t1's folder.
  const sessions = [{ id: 's1', cwd: '/elsewhere' }, { id: 's2', cwd: '/W' }];
  const tabs = [tab('t1', '/W'), tab('t2', '')];
  assert.deepEqual(pairs(matchTabs(sessions, tabs, true)), {});
});

test('a folderless tab only fits a shell outside every workspace', () => {
  const tabs = [tab('t1', `${H}/app/project-b`), tab('t2', '')];
  assert.deepEqual(pairs(matchTabs([{ id: 's1', cwd: `${H}/app/project-b` }, { id: 's2', cwd: H }], tabs, true)), { s1: 't1', s2: 't2' });
  // Inside project-b, s2 no longer fits t2: a single misfit, so only s1 keeps its tab.
  assert.deepEqual(pairs(matchTabs([{ id: 's1', cwd: `${H}/app/project-b` }, { id: 's2', cwd: `${H}/app/project-b/x` }], tabs, true)), { s1: 't1' });
});

test('different counts, several misfits or non-numeric ids match nothing', () => {
  const extra = [{ id: 's1', cwd: `${H}/app/project-b` }, { id: 's2', cwd: `${H}/app/project-b` }, { id: 's3', cwd: `${H}/app/project-c/v6` }];
  assert.deepEqual(pairs(matchTabs(extra, [tab('t1', `${H}/app/project-b`), tab('t2', `${H}/app/project-c/v6`)], true)), {});
  const shifted = [{ id: 's1', cwd: '/a' }, { id: 's2', cwd: '/b' }, { id: 's3', cwd: '/c' }];
  assert.deepEqual(pairs(matchTabs(shifted, [tab('t1', '/b'), tab('t2', '/c'), tab('t3', '/a')], true)), {});
  assert.deepEqual(pairs(matchTabs([{ id: 'x', cwd: '/a' }], [tab('y', '/a')], true)), {});
});

test('a folder that only shares a name prefix is not inside the workspace', () => {
  const sessions = [{ id: 's1', cwd: `${H}/app/project-b-old` }, { id: 's2', cwd: `${H}/app/b` }, { id: 's3', cwd: `${H}/app/c` }];
  const tabs = [tab('t1', `${H}/app/project-b`), tab('t2', `${H}/app/b`), tab('t3', `${H}/app/c`)];
  assert.deepEqual(pairs(matchTabs(sessions, tabs, true)), { s2: 't2', s3: 't3' });
});

test('no tabs or no sessions match nothing', () => {
  assert.deepEqual(pairs(matchTabs([], [tab('t1', '')], true)), {});
  assert.deepEqual(pairs(matchTabs([{ id: 's1', cwd: H }], [], true)), {});
});

test('lsof field output becomes a pid → cwd map', () => {
  const out = parseLsofCwd(`p123\nfcwd\nn${H}/app/project-b\np456\nfcwd\nn/tmp/a b\n`);
  assert.deepEqual([...out], [[123, `${H}/app/project-b`], [456, '/tmp/a b']]);
});

test('the foreground command is the top of the terminal’s foreground group', () => {
  const ps = [
    '  100     1 ttys014  Ss     /bin/zsh', // shell running claude: not in the foreground group
    '  200   100 ttys014  S+     claude',
    '  300   200 ttys014  S+     caffeinate', // spawned by claude, same group
    '  400     1 ttys015  Ss+    -zsh', // idle login shell
    '  500     1 ??       Ss     /usr/sbin/something',
    '  600     1 ttys016  Ss     /bin/zsh',
    '  700   600 ttys016  S+     /Users/me/fvm/versions/3.44.0/bin/cache/dart-sdk/bin/dart',
  ].join('\n');
  const out = parseForeground(ps, [100, 400, 600, 999]);
  assert.deepEqual(Object.fromEntries(out), { 100: 'claude', 400: 'zsh', 600: 'dart' });
});

test('the branch comes from HEAD, following worktree pointers and walking up from subfolders', async () => {
  const files: Record<string, string> = {
    '/r/.git/HEAD': 'ref: refs/heads/dev\n',
    '/w/.git': 'gitdir: ../r/.git/worktrees/w\n',
    '/r/.git/worktrees/w/HEAD': 'ref: refs/heads/feat/x__y\n',
    '/d/.git/HEAD': 'a315260b8852e5e560203c09a61770442a55d67e\n',
    '/evil/.git': 'gitdir: /etc\n', // a pointer outside a git dir is not followed
    '/etc/HEAD': 'ref: refs/heads/leaked\n',
  };
  const read = async (f: string) => {
    if (f in files) return files[f]!;
    throw new Error('ENOENT');
  };
  assert.equal(await branchOf('/r/src/deep', read), 'dev');
  assert.equal(await branchOf('/w', read), 'feat/x__y');
  assert.equal(await branchOf('/d', read), 'a315260');
  assert.equal(await branchOf('/nowhere', read), null);
  assert.equal(await branchOf('/evil', read), null);
});

const cliRunner =
  (tabs: unknown, workspaces: unknown, ok = true): Runner =>
  async (_file, args) => ({ ok, stdout: JSON.stringify(args[0] === 'list-tabs' ? tabs : workspaces) });

test('the Cockpit CLI is only asked to list, and only terminal tabs are kept', async () => {
  const calls: string[][] = [];
  const run: Runner = async (file, args) => {
    calls.push([file, ...args]);
    return cliRunner(
      [
        { id: 't1', kind: 'terminal', title: '◑ Task', working: true, focused: false, workspaceId: 'w1', workspacePath: '/r' },
        { id: 'v2', kind: 'file', title: 'README.md', workspaceId: 'w1', workspacePath: '/r' },
      ],
      [{ id: 'w1', name: 'repo', path: '/r', tabs: 2 }],
    )(file, args);
  };
  const out = await cockpitList('/bin/cockpit', run);
  assert.deepEqual(calls, [['/bin/cockpit', 'list-tabs', '--json'], ['/bin/cockpit', 'list-workspaces', '--json']]);
  assert.deepEqual(out?.tabs.map((t) => t.id), ['t1']);
  assert.equal(out?.tabs[0]?.working, true);
  assert.deepEqual(out?.workspaces, [{ id: 'w1', name: 'repo', path: '/r' }]);
});

test('a failing or garbled Cockpit CLI yields no tabs instead of an error', async () => {
  assert.equal(await cockpitList('/bin/cockpit', cliRunner([], [], false)), null);
  assert.equal(await cockpitList('/bin/cockpit', async () => ({ ok: true, stdout: 'not json' })), null);
  assert.equal(await cockpitList('/bin/cockpit', cliRunner({ not: 'a list' }, [])), null);
});

function fakeMac(opts: { cockpitOk?: boolean } = {}) {
  const calls: string[] = [];
  const run: Runner = async (file, args) => {
    calls.push(file);
    if (file === '/usr/sbin/lsof') return { ok: true, stdout: `p11\nfcwd\nn${H}/app/project-b\np22\nfcwd\nn${H}/app/project-c/wt-2e-be/lib\n` };
    if (file === '/bin/ps') return { ok: true, stdout: '11 1 ttys001 Ss /bin/zsh\n12 11 ttys001 S+ claude\n22 1 ttys002 Ss+ -zsh\n' };
    return cliRunner(
      [
        { id: 't5', kind: 'terminal', title: '✳ Fix overflow', working: true, focused: true, workspaceId: 'project-b', workspacePath: `${H}/app/project-b` },
        { id: 't9', kind: 'terminal', title: 'wt', working: false, focused: false, workspaceId: 'project-c::wt', workspacePath: `${H}/app/project-c/wt-2e-be` },
      ],
      [
        { id: 'project-b', name: 'project-b', path: `${H}/app/project-b` },
        { id: 'project-c', name: 'project-c', path: `${H}/app/project-c/v6` },
        { id: 'project-c::wt', name: '04840e5', path: `${H}/app/project-c/wt-2e-be` },
      ],
      opts.cockpitOk ?? true,
    )(file, args);
  };
  const read = async (f: string) => {
    if (f === `${H}/app/project-b/.git/HEAD`) return 'ref: refs/heads/main\n';
    throw new Error('ENOENT');
  };
  const state: CockpitState = {
    projects: new Map([
      ['project-b', { id: 'project-b', name: 'project-b', color: '#8e8e96', order: 1, worktreesExpanded: null }],
      ['project-c', { id: 'project-c', name: 'project-c', color: '#2f6ff0', order: 2, worktreesExpanded: false }],
    ]),
    theme: 'dark',
  };
  return { run, read, calls, readState: async () => state };
}

const session = (id: string, pid: number, len = 100): Session => ({ id, pid, cmd: '/bin/zsh', rows: 40, cols: 120, len });

test('collected info ties each session to its project, tab, process and branch', async () => {
  const mac = fakeMac();
  let clock = 0;
  const info = createSessionInfo({ cockpitBin: '/bin/cockpit', run: mac.run, readFile: mac.read, readState: mac.readState, home: H, now: () => clock });
  const first = (await info([session('s1', 11), session('s2', 22)])).info;
  assert.equal(first.s1?.tab, null, 'tabs wait for a second look with the same ids');
  assert.equal(first.s1?.workspace?.name, 'project-b', 'the workspace comes from the cwd meanwhile');
  clock = 3000;
  const result = await info([session('s1', 11), session('s2', 22)]);
  assert.equal(result.theme, 'dark');
  const out = result.info;
  assert.deepEqual(out.s1, {
    workspace: { name: 'project-b', path: `${H}/app/project-b`, rank: 0, color: '#8e8e96', order: 1 },
    tab: { title: '✳ Fix overflow', working: true, focused: true },
    cwd: '~/app/project-b',
    process: 'claude',
    branch: 'main',
    active: false,
  });
  // A worktree takes its root workspace's color and order; its rank keeps the CLI's (git) order.
  assert.deepEqual(out.s2?.workspace, {
    name: '04840e5',
    path: `${H}/app/project-c/wt-2e-be`,
    parent: 'project-c',
    rank: 2,
    color: '#2f6ff0',
    order: 2,
    worktreesExpanded: false,
  });
  assert.equal(out.s2?.tab?.title, 'wt');
  assert.equal(out.s2?.process, 'zsh');
  assert.equal(out.s2?.cwd, '~/app/project-c/wt-2e-be/lib');
});

test('Cockpit’s own folderless workspace sorts first, like the top of its rail', async () => {
  const run: Runner = async (file, args) => {
    if (file === '/usr/sbin/lsof') return { ok: true, stdout: `p33\nfcwd\nn${H}\n` };
    if (file === '/bin/ps') return { ok: true, stdout: '33 1 ttys009 Ss+ -zsh\n' };
    return cliRunner(
      [{ id: 't10', kind: 'terminal', title: 'Terminal', working: false, focused: false, workspaceId: '__cockpit__', workspacePath: '' }],
      [{ id: '__cockpit__', name: 'Cockpit', path: '' }],
    )(file, args);
  };
  let clock = 0;
  const info = createSessionInfo({ cockpitBin: '/bin/cockpit', run, home: H, now: () => clock, readState: async () => ({ projects: new Map(), theme: 'system' }) });
  await info([session('s4', 33)]);
  clock = 3000; // the tab is tied on the second look with the same ids
  const out = (await info([session('s4', 33)])).info;
  assert.deepEqual(out.s4?.workspace, { name: 'Cockpit', path: '', rank: 0, order: -1 });
});

test('without the Cockpit CLI sessions still get cwd, process and branch', async () => {
  const mac = fakeMac({ cockpitOk: false });
  const info = createSessionInfo({ cockpitBin: '/bin/cockpit', run: mac.run, readFile: mac.read, readState: mac.readState, home: H });
  const out = (await info([session('s1', 11)])).info;
  assert.equal(out.s1?.tab, null);
  assert.equal(out.s1?.workspace, null);
  assert.equal(out.s1?.process, 'claude');
  assert.equal(out.s1?.branch, 'main');
});

test('results are shared for the TTL and activity reflects output growth between collections', async () => {
  const mac = fakeMac();
  let clock = 0;
  const info = createSessionInfo({ cockpitBin: '/bin/cockpit', run: mac.run, readFile: mac.read, readState: mac.readState, home: H, ttlMs: 3000, now: () => clock });
  await info([session('s1', 11, 100)]);
  await info([session('s1', 11, 500)]); // within the TTL: no new subprocess calls
  assert.equal(mac.calls.filter((c) => c === '/bin/ps').length, 1);
  clock = 3000;
  const out = (await info([session('s1', 11, 500)])).info;
  assert.equal(mac.calls.filter((c) => c === '/bin/ps').length, 2);
  assert.equal(out.s1?.active, true);
  clock = 6000;
  assert.equal((await info([session('s1', 11, 500)])).info.s1?.active, false);
});

test('pids that are not positive integers never reach a command line', async () => {
  const seen: string[][] = [];
  const run: Runner = async (file, args) => {
    seen.push([file, ...args]);
    return { ok: false, stdout: '' };
  };
  const info = createSessionInfo({ cockpitBin: '/bin/cockpit', run, home: H, readState: async () => ({ projects: new Map(), theme: 'system' }) });
  await info([{ ...session('s1', 11), pid: '11;rm' as unknown as number }, session('s2', -3)]);
  assert.ok(!seen.some(([file]) => file === '/usr/sbin/lsof'), 'no valid pid, so lsof is not run');
});
