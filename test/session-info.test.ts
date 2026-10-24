import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchOf, cockpitList, createSessionInfo, freshTabs, matchTabs, soleTab, parseForeground, parseLsofCwd } from '../src/session-info.ts';
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

test('a fresh look reads each session\'s cwd and the tabs, and fingerprints both id lists', async () => {
  const mac = fakeMac();
  const out = await freshTabs([session('s1', 11), session('s2', 22), session('s3', 33)], { cockpitBin: '/bin/cockpit', run: mac.run });
  assert.deepEqual(out && [...out.cwds], [['s1', `${H}/app/project-b`], ['s2', `${H}/app/project-c/wt-2e-be/lib`], ['s3', null]]);
  assert.deepEqual(out?.tabs.map((t) => t.id), ['t5', 't9']);
  assert.equal(out?.ids, 's1,s2,s3|t5,t9');
  assert.ok(!mac.calls.includes('/bin/ps'), 'an action reads only cwds and the listing');
  assert.equal(await freshTabs([session('s1', 11)], { cockpitBin: '/bin/cockpit', run: fakeMac({ cockpitOk: false }).run }), null);
});

test('a fresh look leaves the viewers\' stable history alone', async () => {
  const mac = fakeMac();
  const opts = { cockpitBin: '/bin/cockpit', run: mac.run, readFile: mac.read, readState: mac.readState, home: H, ttlMs: 0 };
  const info = createSessionInfo(opts);
  const sessions = [session('s1', 11), session('s2', 22)];
  await freshTabs(sessions, opts);
  // The viewers' first look is still a first look: no tab until the same ids are seen twice.
  assert.equal((await info(sessions)).info.s1?.tab, null);
  assert.ok((await info(sessions)).info.s1?.tab);
});

const cwdMap = (entries: Array<[string, string | null]>) => new Map(entries);
// The live layout of 2026-10-24 after a Cockpit restart: restored tab ids no longer follow the new session ids.
const RESTARTED = [tab('t16', `${H}/app/gtecq`), tab('t29', `${H}/app/condor`), tab('t38', `${H}/app/atm`), tab('t133', `${H}/app/cockpit-tower`)];
const RESTARTED_CWDS = cwdMap([['s1', `${H}/app/cockpit-tower`], ['s2', `${H}/app/atm/lib`], ['s4', `${H}/app/condor`], ['s8', `${H}/app/gtecq`]]);

test('the only terminal in the session\'s folder is its tab, whatever the id order', () => {
  assert.deepEqual(matchTabs([...RESTARTED_CWDS].map(([id, cwd]) => ({ id, cwd })), RESTARTED, true).size, 0, 'creation order fails here');
  assert.equal(soleTab(RESTARTED_CWDS, RESTARTED, 's1')?.id, 't133');
  assert.equal(soleTab(RESTARTED_CWDS, RESTARTED, 's2')?.id, 't38', 'a cd into a subfolder still counts');
});

test('two terminals, or two shells, in the folder are no tab', () => {
  const twoTabs = [...RESTARTED, tab('t140', `${H}/app/cockpit-tower`)];
  assert.equal(soleTab(RESTARTED_CWDS, twoTabs, 's1'), null);
  // s8's shell cd'd into cockpit-tower: two shells there, so neither can be told apart.
  const twoShells = cwdMap([...RESTARTED_CWDS].map(([id, c]) => [id, id === 's8' ? `${H}/app/cockpit-tower/src` : c]));
  assert.equal(soleTab(twoShells, RESTARTED, 's1'), null);
  assert.equal(soleTab(twoShells, RESTARTED, 's8'), null);
});

test('a shell outside every folder, or one that moved to another tab\'s folder, leaves no tab to prove', () => {
  // s1 (tab t133) cd'd into atm while atm's own shell s2 left every workspace: atm holds one tab and one shell,
  // but that shell is s1. Any shell outside the folders refuses.
  const moved = cwdMap([...RESTARTED_CWDS].map(([id, c]) => [id, id === 's1' ? `${H}/app/atm` : id === 's2' ? '/tmp' : c]));
  assert.equal(soleTab(moved, RESTARTED, 's1'), null);
  assert.equal(soleTab(moved, RESTARTED, 's4'), null);
  // s1 cd'd into atm and s2 into condor: atm and condor hold two shells, cockpit-tower none; unbalanced, so no tab.
  const shifted = cwdMap([...RESTARTED_CWDS].map(([id, c]) => [id, id === 's1' ? `${H}/app/atm` : id === 's2' ? `${H}/app/condor/x` : c]));
  for (const id of ['s1', 's2', 's4', 's8']) assert.equal(soleTab(shifted, RESTARTED, id), null, id);
  // A folder that is only a symlink of the shell's real cwd leaves the shell outside every folder.
  assert.equal(soleTab(cwdMap([['s1', '/private/tmp/w']]), [tab('t1', '/tmp/w')], 's1'), null);
});

test('remote tabs have no local shell and do not unbalance the local folders', () => {
  const tabs = [...RESTARTED, tab('t200', '/srv/app', { workspaceId: '__remote__pin1' })];
  assert.equal(soleTab(RESTARTED_CWDS, tabs, 's1')?.id, 't133');
  assert.equal(soleTab(cwdMap([...RESTARTED_CWDS, ['s9', '/srv/app']]), tabs, 's1'), null, 'a local shell in a remote-only path is outside');
});

test('a nested workspace is the most specific folder, so the parent keeps its own tab', () => {
  const tabs = [tab('t3', `${H}/app/adm`), tab('t5', `${H}/app/adm/.claude/worktrees/agent-a9`)];
  const cwds = cwdMap([['s1', `${H}/app/adm`], ['s2', `${H}/app/adm/.claude/worktrees/agent-a9/src`]]);
  assert.equal(soleTab(cwds, tabs, 's1')?.id, 't3');
  assert.equal(soleTab(cwds, tabs, 's2')?.id, 't5');
});

test('an unknown cwd anywhere, a cwd outside every folder, or a folderless tab gives no tab', () => {
  assert.equal(soleTab(cwdMap([...RESTARTED_CWDS, ['s9', null]]), RESTARTED, 's1'), null);
  assert.equal(soleTab(cwdMap([['s1', '/tmp']]), RESTARTED, 's1'), null);
  assert.equal(soleTab(cwdMap([['s1', H]]), [tab('t10', '')], 's1'), null);
  assert.equal(soleTab(RESTARTED_CWDS, RESTARTED, 's99'), null);
});
