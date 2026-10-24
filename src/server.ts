import { readFile } from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { CockpitClient, ProtocolMismatch } from './cockpit-client.ts';
import { inputBytes, ptySize, wheelBytes } from './input.ts';
import type { InputLog, InputLogEntry } from './input-log.ts';
import type { CloseTab, CloseTarget } from './close-tab.ts';
import type { NewTab } from './new-tab.ts';
import { EMPTY_RESULT } from './session-info.ts';
import type { SessionInfoSource } from './session-info.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Fixed route table (relative to the token prefix): nothing outside it is served. */
const STATIC: Record<string, { file: string; type: string }> = {
  '/': { file: 'web/index.html', type: 'text/html; charset=utf-8' },
  '/app.js': { file: 'web/app.js', type: 'text/javascript; charset=utf-8' },
  '/style.css': { file: 'web/style.css', type: 'text/css; charset=utf-8' },
  '/vendor/xterm.js': { file: 'node_modules/@xterm/xterm/lib/xterm.js', type: 'text/javascript; charset=utf-8' },
  '/vendor/xterm.css': { file: 'node_modules/@xterm/xterm/css/xterm.css', type: 'text/css; charset=utf-8' },
};

/** Lets `bin/tower` tell this gateway apart from any other process on the port. Reveals nothing else. */
export const HEALTH_BODY = 'cockpit-tower';

export interface TowerServerOptions {
  socketPath: string;
  port: number;
  /**
   * Secret path prefix. Every route lives under `/<token>/`, so a local process (any user) that can
   * reach the loopback port still cannot read terminals without it. Required unless `dev`.
   */
  token?: string;
  /** Skips the Tailscale identity header check, for local testing only. */
  dev?: boolean;
  /**
   * Exact Origin of the page (https://<mac>.<tailnet>.ts.net:8443); a WebSocket from any other origin gets 404.
   * In dev with `input` and no origin, it becomes http://127.0.0.1:<bound port>.
   */
  origin?: string;
  /**
   * Lets the owner type into the watched session once command mode is on (ADR 2026-10-23_phone-input-client).
   * Absent = read-only. Outside dev it needs `origin` and `owner`: only that Tailscale login may type.
   */
  input?: { owner: string | null; log: InputLog };
  /**
   * Opens a terminal in the watched session's workspace once command mode is on (ADR 2026-10-24_phone-new-tab).
   * Only used with `input`; absent = no new tab from the phone.
   */
  newTab?: NewTab;
  /**
   * Closes the watched session's Cockpit tab, in two steps, once command mode is on (ADR 2026-10-24_phone-close-tab).
   * Only used with `input`; absent = no closing from the phone.
   */
  closeTab?: CloseTab;
  /** How long a prepared close waits for its confirmation. */
  closeConfirmMs?: number;
  /** A viewer that sends nothing for this long is disconnected, which releases its session (plan D2). */
  idleMs?: number;
  /** While Cockpit is closed, a connected viewer retries this often. */
  retryMs?: number;
  /** A viewer that cannot keep up (phone on a weak link) is dropped past this many buffered bytes. */
  maxBufferedBytes?: number;
  handshakeTimeoutMs?: number;
  clientName?: string;
  /** Adds project, tab and process context to each listed session; without it sessions go out as Cockpit lists them. */
  sessionInfo?: SessionInfoSource;
  /** While a viewer is connected, the session list (and its context) is re-sent this often. */
  sessionsRefreshMs?: number;
  /** A session list request that Cockpit does not answer in this long is given up. */
  listTimeoutMs?: number;
}

export interface TowerServer {
  address(): { address: string; port: number };
  close(): Promise<void>;
}

const HOST = '127.0.0.1';

/** Never throws: a malformed request target becomes null instead of an exception that kills the process. */
function pathnameOf(req: http.IncomingMessage): string | null {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname;
  } catch {
    return null;
  }
}

export async function startTowerServer(opts: TowerServerOptions): Promise<TowerServer> {
  if (!opts.dev && !opts.token) throw new Error('a token is required outside --dev');
  if (opts.input && !opts.dev && (!opts.origin || !opts.input.owner)) throw new Error('input needs origin and owner outside --dev');
  // Typing always needs the page's origin, in dev too: without it any page in the Mac's browser could open the
  // socket and type. In dev it is the loopback address, set once the port is bound.
  let allowedOrigin = opts.origin;
  const prefix = opts.token ? `/${opts.token}` : '';
  const hasIdentity = (req: http.IncomingMessage) =>
    opts.dev === true || typeof req.headers['tailscale-user-login'] === 'string';
  // Browsers always send Origin on a WebSocket; another site's page cannot fake ours.
  const originOk = (req: http.IncomingMessage) => !allowedOrigin || req.headers.origin === allowedOrigin;

  /** Maps a raw pathname to a route inside the prefix, or null when it is outside it. */
  const routeOf = (pathname: string | null): string | null => {
    if (pathname === null) return null;
    if (prefix === '') return pathname;
    if (pathname === prefix) return '/';
    return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : null;
  };

  const httpServer = http.createServer((req, res) => {
    void handleHttp(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });

  async function handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const pathname = pathnameOf(req);
    if (pathname === '/healthz') {
      res.writeHead(200, { 'content-type': 'text/plain' }).end(HEALTH_BODY);
      return;
    }
    const route = routeOf(pathname);
    if (route === null || !hasIdentity(req)) {
      res.writeHead(404).end();
      return;
    }
    if (prefix !== '' && pathname === prefix) {
      // The page uses relative asset URLs, so it must be served from `/<token>/`.
      res.writeHead(301, { location: `${prefix}/` }).end();
      return;
    }
    const entry = STATIC[route];
    if (!entry) {
      res.writeHead(404).end();
      return;
    }
    const body = await readFile(path.join(ROOT, entry.file));
    res.writeHead(200, { 'content-type': entry.type, 'cache-control': 'no-store' }).end(body);
  }

  const shared: Shared = { sizedBy: new Map(), givebacks: new Set(), closing: false };

  // Viewer messages are small JSON commands; the largest is composer text (MAX_INPUT_BYTES plus JSON escaping).
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
  httpServer.on('upgrade', (req, socket, head) => {
    socket.on('error', () => socket.destroy());
    if (routeOf(pathnameOf(req)) !== '/ws' || !hasIdentity(req) || !originOk(req)) {
      socket.end('HTTP/1.1 404 Not Found\r\n\r\n');
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => serveViewer(ws, req, opts, shared));
  });
  httpServer.on('clientError', (_err, socket) => socket.destroy());

  await new Promise<void>((resolve) => httpServer.listen(opts.port, HOST, resolve));
  if (opts.input && !allowedOrigin) allowedOrigin = `http://${HOST}:${(httpServer.address() as { port: number }).port}`;

  return {
    address: () => httpServer.address() as { address: string; port: number },
    close: async () => {
      // A stop must not leave a Mac tab at the phone's size: turn command mode off everywhere (nothing new can
      // be sized), give sizes back, then drop the viewers. Bounded so main.ts's 3 s stop is never the cutoff.
      shared.closing = true;
      const stops = Promise.allSettled([...shared.givebacks].map((stop) => stop()));
      await Promise.race([stops, new Promise((r) => setTimeout(r, CLOSE_GIVEBACK_MS))]);
      for (const ws of wss.clients) ws.terminate();
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    },
  };
}

/** State every viewer of this gateway sees (ADR 2026-10-23_phone-pty-resize). */
interface Shared {
  /** Session id → the viewer holding its size; a second viewer cannot size it (its "original" would be a phone size). */
  sizedBy: Map<string, object>;
  /** Each viewer's stop: command mode off, then its give-back; close() runs them before terminating. */
  givebacks: Set<() => Promise<void>>;
  /** Set by close(): no viewer may turn command mode on or size a session any more. */
  closing: boolean;
}

type Size = { cols: number; rows: number };

/** How long a resize or a give-back waits for a fresh list. */
const SIZE_LIST_MS = 1000;
/** How long close() waits for give-backs: one resize ahead in the queue plus the give-back, inside main.ts's 3 s stop. */
const CLOSE_GIVEBACK_MS = 2500;

/**
 * One viewer = one Cockpit connection, opened when the page connects and closed when it leaves
 * (plan D3). Each viewer gets its own replay; closing the page detaches implicitly (plan D2).
 */
function serveViewer(ws: WebSocket, req: http.IncomingMessage, opts: TowerServerOptions, shared: Shared): void {
  const idleMs = opts.idleMs ?? 10 * 60 * 1000;
  const retryMs = opts.retryMs ?? 3000;
  const closeConfirmMs = opts.closeConfirmMs ?? 30_000;
  const maxBuffered = opts.maxBufferedBytes ?? 8 * 1024 * 1024;
  const client = new CockpitClient({
    socketPath: opts.socketPath,
    clientName: opts.clientName ?? 'cockpit-tower',
    ...(opts.handshakeTimeoutMs !== undefined ? { handshakeTimeoutMs: opts.handshakeTimeoutMs } : {}),
  });
  let open = true;
  let watching: string | null = null;
  const loginHeader = req.headers['tailscale-user-login'];
  const login = typeof loginHeader === 'string' ? loginHeader : null;
  // Exact match: a repeated header arrives joined and fails closed.
  const mayCommand = opts.input !== undefined && (opts.dev === true || (login !== null && login === opts.input.owner));
  /** Session that command mode is on for, or null. Only ever the watched one; a new connection starts off. */
  let commanding: string | null = null;
  /** Live sessions from the last list, with their current size: command mode only turns on for one of them,
   * and a wheel's cell is clamped to that size. */
  let listed = new Map<string, Size>();
  /** Each listed session's workspace folder, from the last list: the only source for where a new tab opens. */
  let folders = new Map<string, string>();
  /** A new-tab request is running for this connection. */
  let opening = false;
  /** A close-tab step is running for this connection. */
  let closingTab = false;
  /** The close step 1 found, waiting for the page's confirmation; dropped whenever command mode changes. */
  let pendingClose: { session: string; target: CloseTarget; at: number } | null = null;
  /** The phone size this viewer put on a session and the size it owes back. Null = nothing owed. */
  let hold: { id: string; original: Size; applied: Size } | null = null;
  /** Bumped on every size this viewer announces: a list started before it is stale for that session. */
  let sizeEpoch = 0;
  /** Per session, the last size announced and when: a stale list must not undo it in the page's emulator. */
  const announced = new Map<string, Size & { epoch: number }>();
  const announceSize = (size: { id: string; cols: number; rows: number; by: 'phone' | 'mac' }) => {
    sizeEpoch++;
    announced.set(size.id, { cols: size.cols, rows: size.rows, epoch: sizeEpoch });
    if (listed.has(size.id)) listed.set(size.id, { cols: size.cols, rows: size.rows });
    post({ type: 'size', ...size });
  };
  const me = {};
  let chain: Promise<void> = Promise.resolve();
  /** Resizes and give-backs run one at a time, in order: an off-then-on never gives back after the new size. */
  const serial = (fn: () => Promise<void>) => (chain = chain.then(fn).catch(() => {}));
  let retryTimer: NodeJS.Timeout | undefined;

  const post = (msg: object) => {
    if (!open || ws.readyState !== ws.OPEN) return;
    if (ws.bufferedAmount > maxBuffered) {
      ws.close(4413, 'viewer too slow');
      return;
    }
    ws.send(JSON.stringify(msg));
  };

  let idleTimer = setTimeout(() => ws.close(4408, 'idle'), idleMs);
  const touch = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => ws.close(4408, 'idle'), idleMs);
  };

  client.on('output', (id: string, off: number, bytes: Buffer) => {
    if (id === watching) post({ type: 'output', id, off, data: bytes.toString('base64') });
  });
  const liveSize = async (id: string, ms?: number): Promise<Size | null> => {
    const s = (await client.list(ms)).find((x) => x.id === id && x.exit === undefined);
    return s ? { cols: s.cols, rows: s.rows } : null;
  };
  const release = () => {
    if (hold && shared.sizedBy.get(hold.id) === me) shared.sizedBy.delete(hold.id);
    hold = null;
  };

  /** Gives the Mac its size back, once per command cycle, and only if the PTY still has the size we set. */
  const giveBack = () =>
    serial(async () => {
      if (!hold) return;
      if (!client.isConnected) {
        if (!open) release(); // the page is gone: nobody left to retry on reconnect
        return; // owed: retried on 'reconnected'
      }
      const h = hold;
      let now: Size | null;
      try {
        now = await liveSize(h.id, SIZE_LIST_MS);
      } catch {
        if (open && !client.isConnected) return; // Cockpit dropped mid-list: still owed, retried on 'reconnected'
        now = null;
      }
      // The lock is held until here, so no other viewer can take this phone size for the Mac's.
      release(); // exactly once per cycle
      if (!now || now.cols !== h.applied.cols || now.rows !== h.applied.rows) return; // gone, or the Mac set its own
      // Best effort: giving the size back is the safe direction and must not depend on the log.
      opts.input?.log.append({ login, session: h.id, kind: 'restore', ...h.original });
      if (client.resize(h.id, h.original.cols, h.original.rows)) announceSize({ id: h.id, ...h.original, by: 'mac' });
    });
  /** close()'s hook: command mode off (which queues the give-back), then wait for the queue. */
  const stop = () => {
    if (commanding !== null) setCommand(null);
    return giveBack();
  };
  shared.givebacks.add(stop);

  const setCommand = (id: string | null) => {
    commanding = id;
    pendingClose = null;
    post({ type: 'command', on: id !== null, ...(id !== null ? { id } : {}) });
    if (id === null && hold !== null) void giveBack();
  };

  client.on('exited', (id: string, code: number) => {
    post({ type: 'exited', id, code });
    if (id === commanding) setCommand(null);
  });
  client.on('session-error', (code: string, detail?: string) => post({ type: 'error', code, detail }));
  client.on('disconnected', () => {
    post({ type: 'status', state: 'unavailable', detail: 'Cockpit connection lost; retrying' });
    // The session may end, or its id be reused by a restarted Cockpit, while we are away.
    listed = new Map();
    folders = new Map();
    pendingClose = null;
    if (commanding !== null) setCommand(null);
  });
  client.on('reconnected', () => {
    post({ type: 'status', state: 'connected' });
    void sendSessions();
    if (hold !== null && commanding === null) void giveBack(); // owed since Cockpit dropped
  });

  let listing = false;
  let listAgain = false;
  const sendSessions = async () => {
    if (listing) {
      listAgain = true; // one more list after the one in flight, instead of piling up or dropping it
      return;
    }
    listing = true;
    const epoch = sizeEpoch;
    try {
      const sessions = await client.list(opts.listTimeoutMs);
      // A size announced since this list was taken is newer than the list: the page's emulator keeps it.
      const fresh = (s: (typeof sessions)[number]) => {
        const a = announced.get(s.id);
        return a && a.epoch > epoch ? { ...s, cols: a.cols, rows: a.rows } : s;
      };
      listed = new Map(
        sessions.filter((s) => s.exit === undefined).map((s) => [s.id, { cols: fresh(s).cols, rows: fresh(s).rows }]),
      );
      if (commanding !== null && !listed.has(commanding)) setCommand(null);
      // The Mac re-laid out while the phone commands: it owns the size now; do not fight it or give back over it.
      const mine = hold && commanding === hold.id && epoch === sizeEpoch ? sessions.find((s) => s.id === hold!.id) : undefined;
      if (hold && mine && (mine.cols !== hold.applied.cols || mine.rows !== hold.applied.rows)) {
        release();
        announceSize({ id: mine.id, cols: mine.cols, rows: mine.rows, by: 'mac' });
      }
      const { info, theme } = opts.sessionInfo ? await opts.sessionInfo(sessions).catch(() => EMPTY_RESULT) : EMPTY_RESULT;
      folders = new Map(Object.entries(info).flatMap(([id, i]) => (i.workspace?.path ? [[id, i.workspace.path] as const] : [])));
      post({ type: 'sessions', sessions: sessions.map((s) => (info[s.id] ? { ...fresh(s), info: info[s.id] } : fresh(s))), theme });
    } catch {
      // Connection dropped mid-request; the reconnect path sends a fresh list.
    } finally {
      listing = false;
      if (listAgain && open) {
        listAgain = false;
        void sendSessions();
      }
    }
  };
  // Keeps "working" and activity current; a failed list (Cockpit away) is simply skipped.
  const refreshTimer = setInterval(() => void sendSessions(), opts.sessionsRefreshMs ?? 5000);

  const connect = async () => {
    try {
      const { server } = await client.connect();
      if (!open) return client.close();
      post({ type: 'status', state: 'connected', server });
      await sendSessions();
    } catch (err) {
      if (!open) return;
      const mismatch = err instanceof ProtocolMismatch;
      post({ type: 'status', state: mismatch ? 'mismatch' : 'unavailable', detail: (err as Error).message });
      // Cockpit may simply not be open yet; a protocol mismatch will not fix itself.
      if (!mismatch) retryTimer = setTimeout(() => void connect(), retryMs);
    }
  };
  post({ type: 'access', input: mayCommand });
  void connect();

  const handleInput = (msg: { key?: unknown; text?: unknown; paste?: unknown }) => {
    const target = watching; // never an id from the browser
    const refuse = (reason: string) => post({ type: 'input', ok: false, reason });
    if (!mayCommand || target === null || commanding !== target) return refuse('command_off');
    const bytes = inputBytes(msg);
    if (!bytes) return refuse('invalid');
    if (!client.isConnected) return refuse('cockpit_unavailable');
    const entry: InputLogEntry =
      typeof msg.key === 'string'
        ? { login, session: target, kind: 'key', key: msg.key, bytes: bytes.length }
        : { login, session: target, kind: 'text', text: String(msg.text), bytes: bytes.length };
    if (!opts.input!.log.append(entry)) return refuse('log_failed');
    if (!client.input(target, bytes)) return refuse('cockpit_unavailable');
    post({ type: 'input', ok: true, bytes: bytes.length });
  };

  /** A drag on the phone, sent as the Mac's wheel would be (ADR 2026-10-23_phone-fullscreen-scroll). */
  const handleWheel = (msg: Parameters<typeof wheelBytes>[0]) => {
    const target = watching; // never an id from the browser
    const refuse = (reason: string) => post({ type: 'wheel', ok: false, reason });
    if (!mayCommand || target === null || commanding !== target) return refuse('command_off');
    const size = listed.get(target);
    const wheel = size ? wheelBytes(msg, size) : null;
    if (!wheel) return refuse('invalid');
    if (!client.isConnected) return refuse('cockpit_unavailable');
    const { bytes, ...what } = wheel;
    if (!opts.input!.log.append({ login, session: target, kind: 'wheel', ...what, bytes: bytes.length })) return refuse('log_failed');
    if (!client.input(target, bytes)) return refuse('cockpit_unavailable');
    // No ok echo: a drag sends up to one message per frame.
  };

  /** The (+) on the phone: a terminal in the watched session's workspace (ADR 2026-10-24_phone-new-tab). */
  const handleNewTab = async () => {
    const target = watching; // never an id from the browser
    const refuse = (reason: string) => post({ type: 'new-tab', ok: false, reason });
    if (shared.closing || !mayCommand || !opts.newTab || target === null || commanding !== target) return refuse('command_off');
    const folder = folders.get(target); // never a folder from the browser
    if (!folder) return refuse('no_workspace');
    if (opening) return refuse('opening');
    if (!opts.input!.log.append({ login, session: target, kind: 'new-tab', folder })) return refuse('log_failed');
    opening = true;
    try {
      // A rejection would otherwise go unhandled and stop the gateway.
      const result = await opts.newTab(folder).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!open) return;
      if (!result.ok) return refuse(result.reason);
      post({ type: 'new-tab', ok: true, folder });
      void sendSessions(); // the page picks the new session from this list
    } finally {
      opening = false;
    }
  };

  /**
   * The (x) on the phone: closes the watched session's tab (ADR 2026-10-24_phone-close-tab). Step 1 (no `confirm`)
   * finds the tab and answers with its Cockpit title; step 2 (`confirm: true`) acts only if a second fresh look
   * finds the same tab and the same session and tab ids. Nothing but `confirm` is read from the browser.
   */
  const handleCloseTab = async (msg: { confirm?: unknown }) => {
    const target = watching; // never an id from the browser
    const refuse = (reason: string) => {
      pendingClose = null;
      post({ type: 'close-tab', ok: false, reason });
    };
    if (shared.closing || !mayCommand || !opts.closeTab || target === null || commanding !== target) return refuse('command_off');
    if (closingTab) return post({ type: 'close-tab', ok: false, reason: 'closing' }); // the running step keeps its state
    const confirming = msg.confirm === true;
    const prepared = pendingClose;
    if (confirming && (!prepared || prepared.session !== target || Date.now() - prepared.at > closeConfirmMs)) return refuse('expired');
    closingTab = true;
    try {
      let sessions;
      try {
        sessions = await client.list(SIZE_LIST_MS);
      } catch {
        return refuse('cockpit_unavailable');
      }
      // A rejection would otherwise go unhandled and stop the gateway.
      const found = await opts.closeTab.resolve(sessions, target).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!open) return;
      if (shared.closing || commanding !== target || watching !== target) return refuse('command_off'); // changed meanwhile
      if (confirming && pendingClose !== prepared) return refuse('expired'); // command mode cycled meanwhile
      if (!found.ok) return refuse(found.reason);
      if (!confirming) {
        pendingClose = { session: target, target: found.target, at: Date.now() };
        return post({ type: 'close-tab', stage: 'confirm', title: found.target.title });
      }
      pendingClose = null;
      if (found.target.tabId !== prepared!.target.tabId || found.target.ids !== prepared!.target.ids) return refuse('changed');
      const { tabId, title } = prepared!.target;
      if (!opts.input!.log.append({ login, session: target, kind: 'close-tab', tab: tabId, title })) return refuse('log_failed');
      const done = await opts.closeTab.close(tabId).catch(() => ({ ok: false, reason: 'failed' }) as const);
      if (!open) return;
      if (!done.ok) return refuse(done.reason);
      if (commanding === target) setCommand(null);
      if (watching === target) {
        client.detach(target);
        watching = null;
      }
      post({ type: 'close-tab', ok: true, id: target });
      void sendSessions(); // the page moves to a neighbouring tab from this list
    } finally {
      closingTab = false;
    }
  };

  const applySize = (msg: { cols?: unknown; rows?: unknown }) =>
    serial(async () => {
      const target = watching; // never an id from the browser
      const refuse = (reason: string) => post({ type: 'resize', ok: false, reason });
      if (shared.closing || !mayCommand || target === null || commanding !== target) return refuse('command_off');
      const size = ptySize(msg);
      if (!size) return refuse('invalid');
      const holder = shared.sizedBy.get(target);
      if (holder !== undefined && holder !== me) return refuse('busy');
      if (!client.isConnected) return refuse('cockpit_unavailable');
      let now: Size | null;
      try {
        now = await liveSize(target, SIZE_LIST_MS);
      } catch {
        return refuse('cockpit_unavailable');
      }
      if (shared.closing || commanding !== target) return refuse('command_off'); // turned off while listing
      if (!now) return refuse('gone');
      const original = hold?.id === target ? hold.original : now; // a font change keeps the Mac's size as the one owed
      if (!opts.input!.log.append({ login, session: target, kind: 'resize', ...size, from: original })) return refuse('log_failed');
      if (!client.resize(target, size.cols, size.rows)) return refuse('cockpit_unavailable');
      hold = { id: target, original, applied: size };
      shared.sizedBy.set(target, me);
      announceSize({ id: target, ...size, by: 'phone' });
    });

  ws.on('message', (raw) => {
    touch();
    let msg: {
      type?: unknown;
      id?: unknown;
      on?: unknown;
      key?: unknown;
      text?: unknown;
      paste?: unknown;
      cols?: unknown;
      rows?: unknown;
      dir?: unknown;
      count?: unknown;
      mode?: unknown;
      col?: unknown;
      row?: unknown;
      app?: unknown;
      confirm?: unknown;
    };
    try {
      msg = JSON.parse(String(raw));
    } catch {
      return;
    }
    if (msg.type === 'ping') return;
    if (msg.type === 'list') return void sendSessions();
    if (msg.type === 'select' && typeof msg.id === 'string') {
      if (msg.id === watching) return; // a repeated select would only force another full replay
      if (commanding !== null) setCommand(null); // command mode never follows the viewer to another session
      if (watching) client.detach(watching);
      watching = msg.id;
      client.attach(msg.id, 0);
      return;
    }
    if (msg.type === 'command') {
      const on = msg.on === true && !shared.closing && mayCommand && watching !== null && listed.has(watching);
      return setCommand(on ? watching : null);
    }
    if (msg.type === 'input') return handleInput(msg);
    if (msg.type === 'resize') return void applySize(msg);
    if (msg.type === 'wheel') return handleWheel(msg);
    if (msg.type === 'new-tab') return void handleNewTab();
    if (msg.type === 'close-tab') return void handleCloseTab(msg);
    // Anything else, including kill attempts, is dropped.
    console.warn(`cockpit-tower: ignored viewer message of type ${String(msg.type)}`);
  });

  // A malformed frame emits 'error'; without a listener it would crash the whole gateway.
  ws.on('error', () => ws.terminate());

  ws.on('close', () => {
    open = false;
    clearTimeout(idleTimer);
    clearTimeout(retryTimer);
    clearInterval(refreshTimer);
    shared.givebacks.delete(stop);
    void giveBack().finally(() => client.close());
  });
}
