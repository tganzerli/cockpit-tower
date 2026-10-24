import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createNewTab } from '../src/new-tab.ts';
import type { Runner } from '../src/session-info.ts';

const BIN = '/fake/cockpit';
const W = '/Users/me/app/w';

const WORKSPACES = [
  { id: 'w1', name: 'w', path: W, tabs: 2 },
  { id: 'w1::/Users/me/app/wt-x', name: 'x', path: '/Users/me/app/wt-x', tabs: 0 },
  { id: '__remote__pin1', name: 'host', path: '/srv/app', tabs: 1 },
  { id: '__cockpit__', name: 'Cockpit', path: '', tabs: 0 },
];
const TABS = [
  { id: 't3', kind: 'terminal', workspaceId: 'w1', workspacePath: W, focused: false },
  { id: 't7', kind: 'terminal', workspaceId: 'w1', workspacePath: W, focused: true },
  { id: 'v2', kind: 'file', workspaceId: 'w1', workspacePath: W, focused: false },
  { id: 't9', kind: 'terminal', workspaceId: '__remote__pin1', workspacePath: '/srv/app', focused: false },
];

/** A runner that answers the listing verbs and records every call. */
function fake(opts: { tabs?: unknown[]; list?: boolean; out?: { ok: boolean; stdout: string } } = {}) {
  const calls: string[][] = [];
  const run: Runner = async (file, args) => {
    assert.equal(file, BIN);
    calls.push(args);
    if (args[0] === 'list-tabs') return { ok: opts.list !== false, stdout: JSON.stringify(opts.tabs ?? TABS) };
    if (args[0] === 'list-workspaces') return { ok: opts.list !== false, stdout: JSON.stringify(WORKSPACES) };
    return opts.out ?? { ok: true, stdout: '{"tabId":"t12"}\n' };
  };
  return { run, calls, newTab: createNewTab({ cockpitBin: BIN, run }) };
}
const opened = (calls: string[][]) => calls.filter((a) => a[0] === 'new-tab');

test('opens next to the focused tab of the workspace, with exactly these arguments', async () => {
  const f = fake();
  assert.deepEqual(await f.newTab(W), { ok: true, tabId: 't12' });
  assert.deepEqual(opened(f.calls), [['new-tab', '--tab-id', 't7', '--cwd', W, '--json']]);
});

test('without a focused tab, the first terminal tab is the anchor', async () => {
  const f = fake({ tabs: TABS.map((t) => ({ ...t, focused: false })) });
  await f.newTab(W);
  assert.deepEqual(opened(f.calls), [['new-tab', '--tab-id', 't3', '--cwd', W, '--json']]);
});

test('only the listing verbs and new-tab are ever run', async () => {
  const f = fake();
  await f.newTab(W);
  await f.newTab('/elsewhere');
  await f.newTab('/srv/app');
  assert.deepEqual([...new Set(f.calls.map((a) => a[0]))].sort(), ['list-tabs', 'list-workspaces', 'new-tab']);
  assert.deepEqual(f.calls.filter((a) => a[0] === 'list-tabs'), Array(3).fill(['list-tabs', '--json']));
});

test('a folder that is not a listed workspace, or the folderless Cockpit one, is gone and nothing opens', async () => {
  const f = fake();
  assert.deepEqual(await f.newTab('/elsewhere'), { ok: false, reason: 'gone' });
  assert.deepEqual(await f.newTab(''), { ok: false, reason: 'gone' });
  assert.deepEqual(await f.newTab(`${W}/sub`), { ok: false, reason: 'gone' });
  assert.deepEqual(opened(f.calls), []);
});

test('a remote workspace is refused and nothing opens', async () => {
  const f = fake();
  assert.deepEqual(await f.newTab('/srv/app'), { ok: false, reason: 'remote' });
  assert.deepEqual(opened(f.calls), []);
});

test('a workspace with no open terminal tab has no anchor', async () => {
  const f = fake();
  assert.deepEqual(await f.newTab('/Users/me/app/wt-x'), { ok: false, reason: 'no_anchor' });
  assert.deepEqual(opened(f.calls), []);
});

test('a tab id that could read as a flag is never an anchor', async () => {
  const f = fake({ tabs: [{ id: '-x', kind: 'terminal', workspaceId: 'w1', workspacePath: W, focused: true }, ...TABS.slice(0, 1)] });
  await f.newTab(W);
  assert.deepEqual(opened(f.calls), [['new-tab', '--tab-id', 't3', '--cwd', W, '--json']]);
  const g = fake({ tabs: [{ id: '--split', kind: 'terminal', workspaceId: 'w1', workspacePath: W, focused: true }] });
  assert.deepEqual(await g.newTab(W), { ok: false, reason: 'no_anchor' });
  assert.deepEqual(opened(g.calls), []);
});

test('a listing that fails means Cockpit is unavailable', async () => {
  const f = fake({ list: false });
  assert.deepEqual(await f.newTab(W), { ok: false, reason: 'cockpit_unavailable' });
  assert.deepEqual(opened(f.calls), []);
});

test('a CLI error or an answer without a tab id is a failure', async () => {
  assert.deepEqual(await fake({ out: { ok: false, stdout: '' } }).newTab(W), { ok: false, reason: 'failed' });
  assert.deepEqual(await fake({ out: { ok: true, stdout: 'not json' } }).newTab(W), { ok: false, reason: 'failed' });
  assert.deepEqual(await fake({ out: { ok: true, stdout: '{}' } }).newTab(W), { ok: false, reason: 'failed' });
});
