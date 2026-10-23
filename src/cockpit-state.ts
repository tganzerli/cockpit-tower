// Cockpit's own saved state, read-only: workspace order and colors (projects.json), whether each
// workspace's worktree list is expanded in the rail (layouts.json) and the theme mode (settings.json).
// Located the way Cockpit's StorageLocation does it (remote_pi cockpit/lib/app/core/data/setup/
// storage_location.dart): the folder named in ~/.cockpit/storage_root, else ~/Documents, then
// cockpit/state. Missing or malformed files give an empty state, never an error.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export type ThemeMode = 'system' | 'light' | 'dark';

export interface CockpitProject {
  id: string;
  name: string;
  /** `#rrggbb` from Cockpit's ARGB integer, or null when absent. */
  color: string | null;
  order: number | null;
  /** Whether the rail shows this workspace's worktrees expanded; null when Cockpit has not saved it. */
  worktreesExpanded: boolean | null;
}

export interface CockpitState {
  /** Root workspaces by id; the id is the same `workspaceId` the Cockpit CLI lists. */
  projects: Map<string, CockpitProject>;
  theme: ThemeMode;
}

export type ReadText = (file: string) => Promise<string>;
const readText: ReadText = (file) => readFile(file, 'utf8');

export const EMPTY_STATE: CockpitState = { projects: new Map(), theme: 'system' };

export async function cockpitStateDir(home: string, read: ReadText = readText): Promise<string> {
  let root = path.join(home, 'Documents');
  try {
    const pointer = (await read(path.join(home, '.cockpit', 'storage_root'))).trim();
    if (pointer && path.isAbsolute(pointer)) root = path.normalize(pointer);
  } catch {}
  return path.join(root, 'cockpit', 'state');
}

async function readJson(file: string, read: ReadText): Promise<unknown> {
  try {
    return JSON.parse(await read(file));
  } catch {
    return null;
  }
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export async function readCockpitState(home: string, read: ReadText = readText): Promise<CockpitState> {
  const dir = await cockpitStateDir(home, read);
  const [projectsJson, settingsJson, layoutsJson] = await Promise.all([
    readJson(path.join(dir, 'projects.json'), read),
    readJson(path.join(dir, 'settings.json'), read),
    readJson(path.join(dir, 'layouts.json'), read),
  ]);
  // layouts.json keeps each workspace's layout as a JSON string under its id.
  const layouts = isObject(layoutsJson) && isObject(layoutsJson.data) ? layoutsJson.data : {};
  const expandedOf = (id: string): boolean | null => {
    const raw = layouts[id];
    if (typeof raw !== 'string') return null;
    try {
      const layout: unknown = JSON.parse(raw);
      return isObject(layout) && typeof layout.worktreesExpanded === 'boolean' ? layout.worktreesExpanded : null;
    } catch {
      return null;
    }
  };

  const projects = new Map<string, CockpitProject>();
  const data = isObject(projectsJson) && isObject(projectsJson.data) ? projectsJson.data : {};
  for (const [key, p] of Object.entries(data)) {
    if (key.startsWith('__') || !isObject(p) || typeof p.id !== 'string' || p.id !== key) continue;
    const color = Number.isInteger(p.color) ? `#${((p.color as number) & 0xffffff).toString(16).padStart(6, '0')}` : null;
    const order = typeof p.order === 'number' && Number.isFinite(p.order) ? p.order : null;
    projects.set(p.id, { id: p.id, name: typeof p.name === 'string' ? p.name : '', color, order, worktreesExpanded: expandedOf(p.id) });
  }

  const app = isObject(settingsJson) && isObject(settingsJson.data) && isObject(settingsJson.data.app) ? settingsJson.data.app : {};
  const mode = app.themeMode;
  const theme: ThemeMode = mode === 'light' || mode === 'dark' ? mode : 'system';
  return { projects, theme };
}
