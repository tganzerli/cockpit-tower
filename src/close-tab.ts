// Closes the watched session's Cockpit tab for the phone (ADR 2026-10-24_phone-close-tab): the gateway's second
// CLI write. The tab is the only terminal in the session's folder, found in a fresh look once to ask and once to
// act, and its id never comes from the browser.
import { execFile } from 'node:child_process';
import { freshTabs, soleTab } from './session-info.ts';
import type { Runner } from './session-info.ts';
import type { Session } from './protocol.ts';

/** What step 1 found; step 2 acts only if a second look finds the same tab and the same id lists. */
export type CloseTarget = { tabId: string; title: string; ids: string };
export type CloseRefusal = 'no_tab' | 'working' | 'cockpit_unavailable';
export interface CloseTab {
  /** Which tab the session is, or why it may not be closed. */
  resolve(sessions: Session[], session: string): Promise<{ ok: true; target: CloseTarget } | { ok: false; reason: CloseRefusal }>;
  /** Runs `close-tab` on a tab id that a resolve just returned. */
  close(tabId: string): Promise<{ ok: true } | { ok: false; reason: 'failed' }>;
}

// The id is a positional argument: one that starts with '-' would read as a flag, and an empty one would close
// the tab the gateway itself was started from.
const TAB_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/;

// The CLI waits up to 10 s for the app; a little more here so its own error is the one reported.
const execRunner: Runner = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 12_000, maxBuffer: 1 << 20 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }));
  });

export function createCloseTab(opts: { cockpitBin: string; run?: Runner }): CloseTab {
  const run = opts.run ?? execRunner;
  return {
    async resolve(sessions, session) {
      const live = sessions.filter((s) => s.exit === undefined);
      const fresh = await freshTabs(live, { cockpitBin: opts.cockpitBin, run });
      if (!fresh) return { ok: false, reason: 'cockpit_unavailable' };
      const tab = soleTab(fresh.cwds, fresh.tabs, session);
      if (!tab || !TAB_ID.test(tab.id)) return { ok: false, reason: 'no_tab' };
      if (tab.working) return { ok: false, reason: 'working' };
      return { ok: true, target: { tabId: tab.id, title: tab.title, ids: fresh.ids } };
    },
    async close(tabId) {
      if (!TAB_ID.test(tabId)) return { ok: false, reason: 'failed' };
      const out = await run(opts.cockpitBin, ['close-tab', tabId, '--json']);
      if (!out.ok) return { ok: false, reason: 'failed' };
      try {
        // The CLI falls back to a tab label when the id is gone: another id back means another tab was closed.
        return JSON.parse(out.stdout).tabId === tabId ? { ok: true } : { ok: false, reason: 'failed' };
      } catch {
        return { ok: false, reason: 'failed' };
      }
    },
  };
}
