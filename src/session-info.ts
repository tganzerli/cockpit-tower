// Per-session context for the viewer: which project, Cockpit tab and process each PTY session belongs to.
//
// Everything here only reads: `lsof` and `ps` for the shell's cwd and foreground process, the repository's
// HEAD file for the branch, and the Cockpit CLI's listing verbs for tabs and workspaces. The protocol's
// `pty.sessions` carries no tab id, so tabs are matched to sessions by creation order, by a birth seen here or
// by being a folder's sole terminal, and a match that is not certain is left out rather than risk showing
// another tab's name.
import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { EMPTY_STATE, readCockpitState } from './cockpit-state.ts';
import type { CockpitState, ThemeMode } from './cockpit-state.ts';
import type { Session } from './protocol.ts';

export interface SessionInfo {
  /**
   * The Cockpit workspace whose folder holds the shell's cwd; `parent` names the main repo of a worktree.
   * `color` and `order` come from Cockpit's saved state for the root workspace (the rail's color and
   * position, and whether its worktree list is expanded); `rank` is the position in `cockpit list-workspaces`,
   * which keeps worktrees in git order.
   */
  workspace: {
    name: string;
    path: string;
    parent?: string;
    color?: string;
    order?: number;
    worktreesExpanded?: boolean;
    rank: number;
  } | null;
  /** Null whenever the session cannot be tied to exactly one tab. */
  tab: { title: string; working: boolean; focused: boolean } | null;
  /** The shell's current folder, with the home folder shown as `~`. */
  cwd: string | null;
  /** Foreground process on the session's terminal, e.g. `claude`, `node` or `zsh`. */
  process: string | null;
  branch: string | null;
  /** The session printed something since the previous collection. */
  active: boolean;
}

export interface Tab {
  id: string;
  title: string;
  working: boolean;
  focused: boolean;
  workspaceId: string;
  workspacePath: string;
}

export interface Workspace {
  id: string;
  name: string;
  path: string;
}

/** Resolves even on a non-zero exit: `lsof` exits 1 when one of several pids is gone but still prints the rest. */
export type Runner = (file: string, args: string[]) => Promise<{ ok: boolean; stdout: string }>;

const execRunner: Runner = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 2000, maxBuffer: 1 << 20 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }));
  });

// Absolute paths: the gateway must not run whatever an inherited PATH puts first.
const LSOF = '/usr/sbin/lsof';
const PS = '/bin/ps';

const isPid = (n: unknown): n is number => Number.isInteger(n) && (n as number) > 0;

/** `lsof -Fpn` prints `p<pid>` then `n<path>` lines. */
export function parseLsofCwd(stdout: string): Map<number, string> {
  const out = new Map<number, string>();
  let pid = 0;
  for (const line of stdout.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    else if (line.startsWith('n') && pid > 0) out.set(pid, line.slice(1));
  }
  return out;
}

/**
 * From `ps -A -o pid=,ppid=,tty=,stat=,comm=`: for each shell, the process in the foreground of its terminal.
 * The foreground group's members have `+` in their state; the one whose parent is outside the group is the
 * command the user started (claude rather than the caffeinate it spawned). An idle shell is its own foreground.
 */
export function parseForeground(stdout: string, shellPids: number[]): Map<number, string> {
  const procs = stdout
    .split('\n')
    .map((line) => line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(.+)$/))
    .filter((m): m is RegExpMatchArray => m !== null)
    .map((m) => ({ pid: Number(m[1]), ppid: Number(m[2]), tty: m[3]!, fg: m[4]!.includes('+'), comm: m[5]! }));
  const byPid = new Map(procs.map((p) => [p.pid, p]));
  const out = new Map<number, string>();
  for (const shellPid of shellPids) {
    const shell = byPid.get(shellPid);
    if (!shell || shell.tty === '??') continue;
    const group = procs.filter((p) => p.tty === shell.tty && p.fg);
    const groupPids = new Set(group.map((p) => p.pid));
    const top = group.filter((p) => !groupPids.has(p.ppid)).sort((a, b) => a.pid - b.pid)[0] ?? shell;
    out.set(shellPid, path.basename(top.comm).replace(/^-/, ''));
  }
  return out;
}

/** Branch from the repository's HEAD file, without running git (a repo's config can make git run programs). */
export async function branchOf(cwd: string, read: (file: string) => Promise<string> = (f) => readFile(f, 'utf8')): Promise<string | null> {
  let dir = cwd;
  for (let depth = 0; depth < 64; depth++) {
    const dotGit = path.join(dir, '.git');
    let head: string | null = null;
    try {
      head = await read(path.join(dotGit, 'HEAD'));
    } catch {
      try {
        // A worktree's (or submodule's) .git is a file pointing at its git dir; follow it only into one.
        const pointer = (await read(dotGit)).match(/^gitdir:\s*(.+)$/m);
        const gitDir = pointer ? path.resolve(dir, pointer[1]!.trim()) : null;
        const inGitDir = (kind: string) => gitDir !== null && gitDir.includes(`${path.sep}.git${path.sep}${kind}${path.sep}`);
        if (gitDir && (inGitDir('worktrees') || inGitDir('modules'))) head = await read(path.join(gitDir, 'HEAD'));
      } catch {}
    }
    if (head !== null) {
      const ref = head.match(/^ref:\s*refs\/heads\/(.+)$/m);
      if (ref) return ref[1]!.trim();
      const sha = head.trim();
      return /^[0-9a-f]{7,}$/.test(sha) ? sha.slice(0, 7) : null;
    }
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}

/** Tabs and workspaces from the Cockpit CLI's read-only listing verbs; null when the CLI is unavailable. */
export async function cockpitList(bin: string, run: Runner): Promise<{ tabs: Tab[]; workspaces: Workspace[] } | null> {
  const [tabsOut, wsOut] = await Promise.all([run(bin, ['list-tabs', '--json']), run(bin, ['list-workspaces', '--json'])]);
  if (!tabsOut.ok || !wsOut.ok) return null;
  try {
    const rawTabs: unknown = JSON.parse(tabsOut.stdout);
    const rawWs: unknown = JSON.parse(wsOut.stdout);
    if (!Array.isArray(rawTabs) || !Array.isArray(rawWs)) return null;
    const str = (v: unknown) => (typeof v === 'string' ? v : '');
    const tabs = rawTabs
      .filter((t) => t && t.kind === 'terminal' && typeof t.id === 'string')
      .map((t) => ({
        id: t.id as string,
        title: str(t.title),
        working: t.working === true,
        focused: t.focused === true,
        workspaceId: str(t.workspaceId),
        workspacePath: str(t.workspacePath),
      }));
    const workspaces = rawWs
      .filter((w) => w && typeof w.id === 'string')
      .map((w) => ({ id: w.id as string, name: str(w.name), path: str(w.path) }));
    return { tabs, workspaces };
  } catch {
    return null;
  }
}

/** `cwd` is `folder` or inside it. */
const within = (cwd: string, folder: string) => cwd === folder || cwd.startsWith(folder.endsWith('/') ? folder : `${folder}/`);
const NUMERIC_ID = /^\D*\d+$/;
const idNumber = (id: string) => Number(id.replace(/^\D+/, ''));

/**
 * Ties sessions to terminal tabs by creation order, the only link Cockpit leaves: session and tab ids both grow
 * as tabs open, one PTY per tab. The order is trusted only when nothing can have shifted it:
 * - both id lists are numeric and of equal length, and `stable` says the caller saw these same ids on its
 *   previous look (a tab closed and another opened between the two listings keeps the counts but shifts pairs);
 * - each pair's cwd agrees: inside the tab's workspace or, for a tab with no folder, outside every tab's
 *   workspace. One disagreeing pair (a shell that cd'd away) is left out; more than one puts the order itself
 *   in doubt, and nothing is matched.
 * cwd alone never decides: a shell can leave its tab's folder while another one enters it.
 */
export function matchTabs(sessions: { id: string; cwd: string | null }[], tabs: Tab[], stable: boolean): Map<string, Tab> {
  const out = new Map<string, Tab>();
  if (!stable || sessions.length === 0 || sessions.length !== tabs.length) return out;
  if (![...sessions, ...tabs].every((x) => NUMERIC_ID.test(x.id))) return out;
  const s = [...sessions].sort((a, b) => idNumber(a.id) - idNumber(b.id));
  const t = [...tabs].sort((a, b) => idNumber(a.id) - idNumber(b.id));
  const folders = t.map((tab) => tab.workspacePath).filter((p) => p !== '');
  const fits = (cwd: string | null, tab: Tab) =>
    cwd !== null && (tab.workspacePath === '' ? !folders.some((f) => within(cwd, f)) : within(cwd, tab.workspacePath));
  const misfits = s.filter((x, i) => !fits(x.cwd, t[i]!)).length;
  if (misfits > 1) return out;
  s.forEach((x, i) => {
    if (fits(x.cwd, t[i]!)) out.set(x.id, t[i]!);
  });
  return out;
}

/** Both id lists, sorted: equal fingerprints mean no session or tab opened or closed in between. */
const idsOf = (sessions: { id: string }[], tabs: Tab[]) =>
  `${sessions.map((s) => s.id).sort().join(',')}|${tabs.map((t) => t.id).sort().join(',')}`;

export interface FreshTabs {
  /** Each session's cwd, null when `lsof` could not tell. */
  cwds: Map<string, string | null>;
  tabs: Tab[];
  /** Fingerprint of both id lists: equal on two looks means no session or tab opened or closed in between. */
  ids: string;
}

/**
 * One fresh look for an action (ADR 2026-10-24_phone-close-tab), outside the viewers' shared cache and their
 * `stable` history: the action compares two of these itself. Null when the Cockpit CLI is unavailable.
 */
export async function freshTabs(sessions: Session[], opts: { cockpitBin: string; run?: Runner }): Promise<FreshTabs | null> {
  const run = opts.run ?? execRunner;
  const pids = sessions.map((s) => s.pid).filter(isPid);
  const [lsof, cockpit] = await Promise.all([
    pids.length ? run(LSOF, ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]) : Promise.resolve({ ok: true, stdout: '' }),
    cockpitList(opts.cockpitBin, run),
  ]);
  if (!cockpit) return null;
  const byPid = parseLsofCwd(lsof.stdout);
  const cwds = new Map(sessions.map((s) => [s.id, isPid(s.pid) ? byPid.get(s.pid) ?? null : null] as const));
  return { cwds, tabs: cockpit.tabs, ids: idsOf(sessions, cockpit.tabs) };
}

export const REMOTE_PREFIX = '__remote__'; // Cockpit's id prefix for an SSH workspace: its tabs have no local PTY

/** Terminal tabs with a local PTY, and their distinct folders. */
function localTabs(tabs: Tab[]): { local: Tab[]; folders: string[] } {
  const local = tabs.filter((t) => !t.workspaceId.startsWith(REMOTE_PREFIX));
  return { local, folders: [...new Set(local.map((t) => t.workspacePath).filter((p) => p !== ''))] };
}

/** The most specific of `folders` holding `cwd`; undefined when cwd is unknown or outside them all. */
const folderOf = (cwd: string | null, folders: string[]) =>
  cwd === null ? undefined : folders.filter((f) => within(cwd, f)).sort((a, b) => b.length - a.length)[0];

/**
 * The session's tab when nothing else can be it, without trusting creation order (which a Cockpit restart breaks:
 * tab ids are restored, session ids are new). Each shell's cwd picks the most specific folder of a local terminal
 * tab. Every shell must be in one (a shell whose cwd is unknown or outside them all could be any tab's), every
 * folder must hold as many shells as terminal tabs (a shell that moved to another tab's folder unbalances both),
 * and the session's folder must hold exactly one of each. Null otherwise. Shells that swapped folders in a cycle
 * still look balanced; the title in the confirmation is the last check for that.
 */
export function soleTab(cwds: Map<string, string | null>, tabs: Tab[], session: string): Tab | null {
  const { local, folders } = localTabs(tabs);
  const shells = new Map<string, string>();
  for (const [id, cwd] of cwds) {
    const folder = folderOf(cwd, folders);
    if (folder === undefined) return null;
    shells.set(id, folder);
  }
  const count = <T>(items: T[], folder: string, of: (x: T) => string) => items.filter((x) => of(x) === folder).length;
  for (const folder of folders) {
    if (count(local, folder, (t) => t.workspacePath) !== count([...shells.values()], folder, (f) => f)) return null;
  }
  const folder = shells.get(session);
  if (folder === undefined) return null;
  const inFolder = local.filter((t) => t.workspacePath === folder);
  return inFolder.length === 1 && count([...shells.values()], folder, (f) => f) === 1 ? inFolder[0]! : null;
}

export type Birth = { session: string; pid: number; tabId: string; folder: string };

/**
 * A tab and a session born together (k27): since the previous look, exactly one session and exactly one local
 * terminal tab appeared, and the shell sits in that tab's folder (the most specific one). Null otherwise. The
 * caller trusts it only after one more look, since a tabless session (a task) can be born beside a tab whose own
 * session has not appeared yet.
 */
export function birthPair(
  before: { sessions: Set<string>; tabs: Set<string> },
  sessions: { id: string; pid: number; cwd: string | null }[],
  tabs: Tab[],
): Birth | null {
  const { local, folders } = localTabs(tabs);
  const newSessions = sessions.filter((s) => !before.sessions.has(s.id));
  const newTabs = local.filter((t) => !before.tabs.has(t.id));
  if (newSessions.length !== 1 || newTabs.length !== 1) return null;
  const s = newSessions[0]!;
  const t = newTabs[0]!;
  if (!isPid(s.pid) || t.workspacePath === '' || folderOf(s.cwd, folders) !== t.workspacePath) return null;
  return { session: s.id, pid: s.pid, tabId: t.id, folder: t.workspacePath };
}

/** The birth's tab while its session keeps the pid and the tab is still a local terminal in the same folder. */
function bornTab(birth: Birth, pids: Map<string, number>, tabs: Tab[]): Tab | null {
  if (pids.get(birth.session) !== birth.pid) return null;
  const tab = tabs.find((t) => t.id === birth.tabId);
  return tab && !tab.workspaceId.startsWith(REMOTE_PREFIX) && tab.workspacePath === birth.folder ? tab : null;
}

/** A session keeps a tab only when every source that names one names the same, and no other session got it. */
export function agreeTabs(ids: string[], sources: Map<string, Tab>[]): Map<string, Tab> {
  const out = new Map<string, Tab>();
  for (const id of ids) {
    const found = sources.map((m) => m.get(id)).filter((t): t is Tab => t !== undefined);
    if (found.length > 0 && found.every((t) => t.id === found[0]!.id)) out.set(id, found[0]!);
  }
  const owners = new Map<string, number>();
  for (const t of out.values()) owners.set(t.id, (owners.get(t.id) ?? 0) + 1);
  for (const [id, t] of out) if (owners.get(t.id)! > 1) out.delete(id);
  return out;
}

/** The workspace for a session: its tab's workspace when matched, else the most specific folder holding its cwd. */
function workspaceFor(cwd: string | null, tab: Tab | undefined, workspaces: Workspace[], state: CockpitState): SessionInfo['workspace'] {
  let ws = tab ? workspaces.find((w) => w.id === tab.workspaceId) : undefined;
  if (!ws && cwd !== null) {
    ws = workspaces
      .filter((w) => w.path !== '' && within(cwd, w.path))
      .sort((a, b) => b.path.length - a.path.length)[0];
  }
  if (!ws) return null;
  const sep = ws.id.indexOf('::');
  const rootId = sep > 0 ? ws.id.slice(0, sep) : ws.id;
  const parent = sep > 0 ? workspaces.find((w) => w.id === rootId)?.name : undefined;
  const project = state.projects.get(rootId);
  // Cockpit's own "Cockpit" workspace is not a saved project and sits at the top of the rail.
  const order = rootId === '__cockpit__' ? -1 : project?.order ?? undefined;
  return {
    name: ws.name,
    path: ws.path,
    rank: workspaces.indexOf(ws),
    ...(parent ? { parent } : {}),
    ...(project?.color ? { color: project.color } : {}),
    ...(order !== undefined ? { order } : {}),
    ...(typeof project?.worktreesExpanded === 'boolean' ? { worktreesExpanded: project.worktreesExpanded } : {}),
  };
}

export interface SessionInfoOptions {
  cockpitBin: string;
  run?: Runner;
  readFile?: (file: string) => Promise<string>;
  home?: string;
  /** Results are shared for this long, so several open viewers do not multiply the `lsof`/`ps` calls. */
  ttlMs?: number;
  now?: () => number;
  /** Cockpit's saved workspace order, colors and theme; defaults to reading its state files. */
  readState?: () => Promise<CockpitState>;
  /** A session and a tab are born together only between two looks at most this far apart (default 15 s). */
  birthWindowMs?: number;
}

export interface SessionInfoResult {
  info: Record<string, SessionInfo>;
  /** Cockpit's theme mode, for the viewer to follow. */
  theme: ThemeMode;
}

export const EMPTY_RESULT: SessionInfoResult = { info: {}, theme: 'system' };

export type SessionInfoSource = (sessions: Session[]) => Promise<SessionInfoResult>;

export function createSessionInfo(opts: SessionInfoOptions): SessionInfoSource {
  const run = opts.run ?? execRunner;
  const home = opts.home ?? os.homedir();
  const ttlMs = opts.ttlMs ?? 3000;
  const now = opts.now ?? Date.now;
  const lastLen = new Map<string, number>();
  let lastIds: string | null = null; // session and tab ids seen by the previous collection
  const readState = opts.readState ?? (() => readCockpitState(home));
  let cached: { at: number; key: string; value: Promise<SessionInfoResult> } | null = null;
  const birthWindowMs = opts.birthWindowMs ?? 15_000;
  let seen: { sessions: Set<string>; tabs: Set<string>; at: number } | null = null; // the previous look, for births
  let candidate: Birth | null = null; // a birth waits one more look before it is trusted
  const born = new Map<string, Birth>();

  /**
   * Three sources tie a session to its tab (k27): creation order (`matchTabs`, broken by a Cockpit restart), a
   * birth seen by this gateway, and the sole terminal of a folder (`soleTab`). They must agree. A birth is kept
   * once confirmed by the next look, when no other session was born into its folder.
   */
  const pairTabs = (sessions: Session[], all: Tab[], cwdOf: (s: Session) => string | null, stable: boolean) => {
    const live = sessions.filter((s) => s.exit === undefined).map((s) => ({ id: s.id, pid: s.pid, cwd: cwdOf(s) }));
    const pids = new Map(live.map((s) => [s.id, s.pid]));
    const { folders } = localTabs(all);
    const fresh = seen ? live.filter((s) => !seen!.sessions.has(s.id)) : [];
    const c = candidate;
    if (c && !fresh.some((s) => s.id !== c.session && folderOf(s.cwd, folders) === c.folder)) born.set(c.session, c);
    candidate = seen && now() - seen.at <= birthWindowMs ? birthPair(seen, live, all) : null;
    for (const [id, b] of born) if (!bornTab(b, pids, all)) born.delete(id); // also drops a candidate that died
    seen = { sessions: new Set(live.map((s) => s.id)), tabs: new Set(all.map((t) => t.id)), at: now() };

    const order = matchTabs(sessions.map((s) => ({ id: s.id, cwd: cwdOf(s) })), all, stable);
    const births = new Map<string, Tab>();
    for (const [id, b] of born) births.set(id, bornTab(b, pids, all)!);
    const cwds = new Map(live.map((s) => [s.id, s.cwd]));
    const sole = new Map<string, Tab>();
    for (const s of live) {
      const tab = soleTab(cwds, all, s.id);
      if (tab) sole.set(s.id, tab);
    }
    return agreeTabs(sessions.map((s) => s.id), [order, births, sole]);
  };

  const collect = async (sessions: Session[]): Promise<SessionInfoResult> => {
    const pids = sessions.map((s) => s.pid).filter(isPid);
    const [lsof, ps, cockpit, state] = await Promise.all([
      pids.length ? run(LSOF, ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]) : Promise.resolve({ ok: true, stdout: '' }),
      run(PS, ['-A', '-o', 'pid=,ppid=,tty=,stat=,comm=']),
      cockpitList(opts.cockpitBin, run),
      readState().catch(() => EMPTY_STATE),
    ]);
    const cwds = parseLsofCwd(lsof.stdout);
    const fg = parseForeground(ps.stdout, pids);
    const cwdOf = (s: Session) => (isPid(s.pid) ? cwds.get(s.pid) ?? null : null);
    const ids = cockpit ? idsOf(sessions, cockpit.tabs) : null;
    const stable = ids !== null && ids === lastIds;
    lastIds = ids;
    const tabs = cockpit ? pairTabs(sessions, cockpit.tabs, cwdOf, stable) : new Map<string, Tab>();
    const branches = new Map<string, Promise<string | null>>();
    const out: Record<string, SessionInfo> = {};
    for (const s of sessions) {
      const cwd = cwdOf(s);
      if (cwd !== null && !branches.has(cwd)) branches.set(cwd, branchOf(cwd, opts.readFile).catch(() => null));
      const tab = tabs.get(s.id);
      const prev = lastLen.get(s.id);
      lastLen.set(s.id, s.len);
      out[s.id] = {
        workspace: cockpit ? workspaceFor(cwd, tab, cockpit.workspaces, state) : null,
        tab: tab ? { title: tab.title, working: tab.working, focused: tab.focused } : null,
        cwd: cwd === null ? null : within(cwd, home) ? `~${cwd.slice(home.length)}` : cwd,
        process: (isPid(s.pid) && fg.get(s.pid)) || null,
        branch: cwd === null ? null : await branches.get(cwd)!,
        active: prev !== undefined && s.len > prev,
      };
    }
    for (const id of lastLen.keys()) if (!sessions.some((s) => s.id === id)) lastLen.delete(id);
    return { info: out, theme: state.theme };
  };

  return (sessions) => {
    const key = sessions.map((s) => `${s.id}:${s.pid}`).join(',');
    if (!cached || cached.key !== key || now() - cached.at >= ttlMs) {
      cached = { at: now(), key, value: collect(sessions).catch(() => EMPTY_RESULT) };
    }
    return cached.value;
  };
}
