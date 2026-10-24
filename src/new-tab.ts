// Opens a Cockpit terminal tab for the phone (ADR 2026-10-24_phone-new-tab): the gateway's only action that is
// not a protocol message. The folder and the anchor tab come from Cockpit's own listing, never from the browser.
import { execFile } from 'node:child_process';
import { cockpitList } from './session-info.ts';
import type { Runner } from './session-info.ts';

export type NewTabResult = { ok: true; tabId: string } | { ok: false; reason: 'gone' | 'no_anchor' | 'remote' | 'cockpit_unavailable' | 'failed' };
/** Opens a terminal in the workspace whose folder is `workspacePath`, next to one of its open tabs. */
export type NewTab = (workspacePath: string) => Promise<NewTabResult>;

const REMOTE_PREFIX = '__remote__'; // Cockpit's id prefix for an SSH workspace, whose PTYs the tower cannot see
// A tab id becomes an argument: one that starts with '-' would read as a flag.
const TAB_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/;

// The CLI waits up to 10 s for the app; a little more here so its own error is the one reported.
const execRunner: Runner = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 12_000, maxBuffer: 1 << 20 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }));
  });

export function createNewTab(opts: { cockpitBin: string; run?: Runner }): NewTab {
  const run = opts.run ?? execRunner;
  return async (workspacePath) => {
    const listing = await cockpitList(opts.cockpitBin, run);
    if (!listing) return { ok: false, reason: 'cockpit_unavailable' };
    const ws = listing.workspaces.find((w) => w.path !== '' && w.path === workspacePath);
    if (!ws) return { ok: false, reason: 'gone' };
    if (ws.id.startsWith(REMOTE_PREFIX)) return { ok: false, reason: 'remote' };
    const tabs = listing.tabs.filter((t) => t.workspaceId === ws.id && TAB_ID.test(t.id));
    // `focused` is app-wide: only the selected workspace has one, so the first tab is the usual anchor.
    const anchor = tabs.find((t) => t.focused) ?? tabs[0];
    if (!anchor) return { ok: false, reason: 'no_anchor' };
    // --tab-id opens the tab in the anchor's workspace and pane (and wins over an inherited COCKPIT_TAB_ID).
    const out = await run(opts.cockpitBin, ['new-tab', '--tab-id', anchor.id, '--cwd', ws.path, '--json']);
    if (!out.ok) return { ok: false, reason: 'failed' };
    try {
      const tabId: unknown = JSON.parse(out.stdout).tabId;
      return typeof tabId === 'string' && tabId !== '' ? { ok: true, tabId } : { ok: false, reason: 'failed' };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  };
}
