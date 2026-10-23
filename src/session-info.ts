// Per-session context for the viewer: which project, Cockpit tab and process each PTY session belongs to.
//
// Everything here only reads: `lsof` and `ps` for the shell's cwd and foreground process, the repository's
// HEAD file for the branch, and the Cockpit CLI's listing verbs for tabs and workspaces. The protocol's
// `pty.sessions` carries no tab id, so tabs are matched to sessions by creation order and cwd, and a match
// that is not certain is left out rather than risk showing another tab's name.
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
    const ids = cockpit ? `${sessions.map((s) => s.id).sort().join(',')}|${cockpit.tabs.map((t) => t.id).sort().join(',')}` : null;
    const stable = ids !== null && ids === lastIds;
    lastIds = ids;
    const tabs = cockpit ? matchTabs(sessions.map((s) => ({ id: s.id, cwd: cwdOf(s) })), cockpit.tabs, stable) : new Map<string, Tab>();
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
