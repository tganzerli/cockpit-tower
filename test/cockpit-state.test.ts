import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cockpitStateDir, readCockpitState } from '../src/cockpit-state.ts';

const H = '/Users/me';
const files = (map: Record<string, string>) => async (f: string) => {
  if (f in map) return map[f]!;
  throw new Error('ENOENT');
};

test('the state lives under ~/Documents unless ~/.cockpit/storage_root points elsewhere', async () => {
  assert.equal(await cockpitStateDir(H, files({})), `${H}/Documents/cockpit/state`);
  assert.equal(await cockpitStateDir(H, files({ [`${H}/.cockpit/storage_root`]: ' /Volumes/sync/ \n' })), '/Volumes/sync/cockpit/state');
  // A relative or empty pointer is ignored, like Cockpit falls back to the default.
  assert.equal(await cockpitStateDir(H, files({ [`${H}/.cockpit/storage_root`]: 'relative/dir' })), `${H}/Documents/cockpit/state`);
  assert.equal(await cockpitStateDir(H, files({ [`${H}/.cockpit/storage_root`]: '' })), `${H}/Documents/cockpit/state`);
});

test('projects give each root workspace its name, color and rail order; theme mode comes from settings', async () => {
  const dir = `${H}/Documents/cockpit/state`;
  const state = await readCockpitState(
    H,
    files({
      [`${dir}/projects.json`]: JSON.stringify({
        version: 1,
        data: {
          'a-1': { id: 'a-1', name: 'cockpit-tower', path: '/x', color: 4285421263, order: 4, image: null },
          '__last_selected__::default': 'a-1',
          'b-2': { id: 'b-2', name: 'project-a', color: 4282366056, order: 0 },
          'c-3': { id: 'c-3', name: 'odd', color: 'red', order: 'first' }, // wrong types: kept, without them
          'd-4': { id: 'not-d-4', name: 'mismatched id' },
          'e-5': 'garbage',
        },
      }),
      [`${dir}/settings.json`]: JSON.stringify({ version: 1, data: { app: { themeMode: 'dark' } } }),
      [`${dir}/layouts.json`]: JSON.stringify({
        version: 1,
        data: {
          'a-1': JSON.stringify({ v: 1, worktreesExpanded: true }),
          'b-2': JSON.stringify({ v: 1, worktreesExpanded: false }),
          'c-3': '{broken', // an unreadable layout leaves the state unknown
          'b-2::/wt': JSON.stringify({ worktreesExpanded: true }),
        },
      }),
    }),
  );
  assert.deepEqual([...state.projects.values()], [
    { id: 'a-1', name: 'cockpit-tower', color: '#6e56cf', order: 4, worktreesExpanded: true },
    { id: 'b-2', name: 'project-a', color: '#3fb868', order: 0, worktreesExpanded: false },
    { id: 'c-3', name: 'odd', color: null, order: null, worktreesExpanded: null },
  ]);
  assert.equal(state.theme, 'dark');
});

test('missing or malformed state files give an empty state and the system theme', async () => {
  const dir = `${H}/Documents/cockpit/state`;
  assert.deepEqual(await readCockpitState(H, files({})), { projects: new Map(), theme: 'system' });
  const broken = await readCockpitState(
    H,
    files({ [`${dir}/projects.json`]: '{not json', [`${dir}/settings.json`]: JSON.stringify({ data: { app: { themeMode: 'neon' } } }) }),
  );
  assert.equal(broken.projects.size, 0);
  assert.equal(broken.theme, 'system');
});
