// Viewer: it renders terminal bytes, and only in command mode sends text, named keys, its own size and the
// agent scroll (mouse wheel or arrows) for the watched session (ADRs 2026-10-23_phone-input-client,
// _phone-pty-resize and _phone-fullscreen-scroll).
//
// xterm is only the emulator: it parses the bytes at the PTY's exact size and is never opened on screen.
// What the phone shows is an HTML view built from xterm's buffer, so lines can wrap to the phone's width
// and the scrollback scrolls natively. Outside command mode the PTY keeps the Mac's size and lines wrap
// here; in command mode the PTY takes the phone's size, so they fit.
(() => {
  const statusEl = document.getElementById('status');
  const dotEl = document.getElementById('dot');
  const bannerEl = document.getElementById('banner');
  const tabsEl = document.getElementById('tabs');
  const groupsEl = document.getElementById('groups');
  const drawerEl = document.getElementById('drawer');
  const curAvatarEl = document.getElementById('cur-avatar');
  const curTitleEl = document.getElementById('cur-title');
  const curSubEl = document.getElementById('cur-sub');
  const viewEl = document.getElementById('view');
  const toEndEl = document.getElementById('to-end');
  const commandEl = document.getElementById('command');
  const composerEl = document.getElementById('composer');
  const composeEl = document.getElementById('compose');
  const sendEl = document.getElementById('send');
  const noteEl = document.getElementById('compose-note');
  const modeEl = document.getElementById('mode');

  const term = new Terminal({ disableStdin: true, convertEol: false, scrollback: 10000 });

  // What the program asked of the mouse that xterm does not expose: the report encoding and alternate scroll (1007).
  const mouseModes = { sgr: false, other: false, altScroll: true };
  function resetMouseModes() {
    mouseModes.sgr = false;
    mouseModes.other = false;
    mouseModes.altScroll = true;
  }
  const trackModes = (set) => (params) => {
    for (const p of params) {
      if (p === 1006) mouseModes.sgr = set;
      else if (p === 1005 || p === 1015 || p === 1016) mouseModes.other = set; // encodings the gateway does not build
      else if (p === 1007) mouseModes.altScroll = set;
    }
    return false; // xterm still applies the mode
  };
  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, trackModes(true));
  term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, trackModes(false));
  term.parser.registerEscHandler({ final: 'c' }, () => {
    resetMouseModes(); // RIS
    return false;
  });

  /** What a drag sends, by Cockpit's own rules (flterm terminal_input.dart); null = the drag scrolls the view. */
  function wheelMode() {
    const tracking = term.modes.mouseTrackingMode;
    if (tracking === 'x10') return null; // DECSET 9: not what the agents use; not sent
    if (tracking !== 'none') return mouseModes.other ? null : mouseModes.sgr ? 'sgr' : 'x10';
    return term.buffer.active.type === 'alternate' && mouseModes.altScroll ? 'arrows' : null;
  }

  let ws = null;
  let sessions = [];
  let current = null;
  let pingTimer = null;
  let needsReselect = false;
  // Typing state mirrors the gateway, which owns it: the page never assumes command mode is on.
  let mayCommand = false;
  let commandOn = false;
  // The (+) request waiting for its session to show up in a list: { ws, before, at }, or null.
  let newTab = null;
  // The agent scroll in progress (a one-finger drag in command mode) and the lines not yet sent.
  let drag = null;
  let pendingWheel = 0;
  let wheelFrame = false;
  let wheelAt = null; // last touch point of the drag; outlives the finger so its last lines still go out
  let pendingText = null; // text sent and not yet confirmed; cleared from the box only on ok
  // The view's text box without the keyboard, taken when command mode turns on; a font change reuses it.
  let restBox = null;

  // ANSI 0-15 are CSS variables holding Cockpit's terminal palette for the current theme, so switching
  // light/dark needs no redraw; then the standard xterm 256 cube and gray ramp.
  const PALETTE = Array.from({ length: 16 }, (_, i) => `var(--ansi-${i})`);
  const hex = (n) => n.toString(16).padStart(2, '0');
  for (let i = 0; i < 216; i++) {
    const level = (v) => (v === 0 ? 0 : 55 + v * 40);
    PALETTE.push(`#${hex(level(Math.floor(i / 36)))}${hex(level(Math.floor(i / 6) % 6))}${hex(level(i % 6))}`);
  }
  for (let i = 0; i < 24; i++) PALETTE.push(`#${hex(8 + i * 10).repeat(3)}`);
  const DEFAULT_FG = 'var(--term-fg)';
  const DEFAULT_BG = 'var(--term-bg)';

  // The full text lives in the drawer; the top bar shows a dot, plus a banner while something is wrong.
  function setStatus(text, kind) {
    statusEl.textContent = text;
    statusEl.className = `status ${kind || ''}`;
    dotEl.className = `status-dot ${kind || ''}`;
    dotEl.setAttribute('aria-label', text);
    bannerEl.hidden = kind === 'ok' || !kind;
    bannerEl.textContent = text;
    bannerEl.className = `banner ${kind || ''}`;
  }

  // ---- buffer → HTML -------------------------------------------------------

  const cell = term.buffer.active.getNullCell();
  const RULE = /^[─━═╌╍┄┅]{8,}$/;

  function color(isRGB, isPalette, value) {
    if (isRGB) return `#${value.toString(16).padStart(6, '0')}`;
    if (isPalette) return PALETTE[value];
    return null;
  }

  function cellStyle(c) {
    if (c.isAttributeDefault()) return '';
    let fg = color(c.isFgRGB(), c.isFgPalette(), c.getFgColor());
    let bg = color(c.isBgRGB(), c.isBgPalette(), c.getBgColor());
    if (c.isInverse()) [fg, bg] = [bg || DEFAULT_BG, fg || DEFAULT_FG];
    let css = '';
    if (fg) css += `color:${fg};`;
    if (bg) css += `background:${bg};`;
    if (c.isBold()) css += 'font-weight:600;';
    if (c.isItalic()) css += 'font-style:italic;';
    if (c.isDim()) css += 'opacity:.6;';
    if (c.isInvisible()) css += 'color:transparent;';
    const lines = [c.isUnderline() && 'underline', c.isStrikethrough() && 'line-through'].filter(Boolean);
    if (lines.length) css += `text-decoration:${lines.join(' ')};`;
    return css;
  }

  // One physical row becomes one <span>. A row that continues the previous one (isWrapped) gets no
  // line break, so the browser re-wraps the whole logical line at the phone's width. Trailing blanks
  // are dropped, and a row that is only a horizontal rule becomes a full-width CSS line.
  function rowElement(line, first) {
    const row = document.createElement('span');
    if (!first && !line.isWrapped) row.append('\n');
    const text = line.translateToString(true);
    if (RULE.test(text)) {
      const rule = document.createElement('span');
      rule.className = 'rule';
      row.append(rule);
      return row;
    }
    let last = -1;
    for (let x = line.length - 1; x >= 0; x--) {
      const chars = line.getCell(x, cell).getChars();
      if (chars && chars !== ' ') { last = x; break; }
    }
    let runText = '';
    let runStyle = '';
    const flush = () => {
      if (!runText) return;
      if (runStyle) {
        const s = document.createElement('span');
        s.style.cssText = runStyle;
        s.textContent = runText;
        row.append(s);
      } else {
        row.append(runText);
      }
      runText = '';
    };
    for (let x = 0; x <= last; x++) {
      line.getCell(x, cell);
      if (cell.getWidth() === 0) continue; // second half of a wide character
      const style = cellStyle(cell);
      if (style !== runStyle) {
        flush();
        runStyle = style;
      }
      runText += cell.getChars() || ' ';
    }
    flush();
    return row;
  }

  // ---- incremental view ----------------------------------------------------
  //
  // Rows above baseY are scrollback and never change, so they are appended once to histEl.
  // Rows from baseY down are the live screen and are redrawn on every frame into liveEl.
  // A marker on the newest scrollback row tracks how many rows xterm dropped from the top of a full
  // scrollback; when it is disposed (clear, reset, buffer switch) the view is rebuilt from scratch.

  const histEl = document.createElement('span');
  const liveEl = document.createElement('span');
  viewEl.append(histEl, liveEl);

  let renderedBase = 0; // rows [0, renderedBase) of the normal buffer are in histEl
  let marker = null;
  let markerLine = 0;
  let renderPending = false;
  let following = true;

  function resetView() {
    histEl.replaceChildren();
    liveEl.replaceChildren();
    renderedBase = 0;
    if (marker) marker.dispose();
    marker = null;
  }

  function scheduleRender() {
    if (renderPending) return;
    renderPending = true;
    requestAnimationFrame(() => {
      renderPending = false;
      render();
    });
  }

  function render() {
    const buf = term.buffer.active;
    if (buf.type === 'alternate') return renderScreen(buf);

    if (renderedBase > 0) {
      if (!marker || marker.isDisposed) {
        resetView();
      } else {
        const trimmed = markerLine - marker.line;
        if (trimmed > 0) dropTop(Math.min(trimmed, renderedBase));
      }
    }
    if (buf.baseY < renderedBase) resetView(); // the scrollback shrank without disposing the marker

    if (buf.baseY > renderedBase) {
      const frag = document.createDocumentFragment();
      for (let y = renderedBase; y < buf.baseY; y++) frag.append(rowElement(buf.getLine(y), y === 0));
      histEl.append(frag);
      renderedBase = buf.baseY;
    }

    liveEl.replaceChildren(screenRows(buf, buf.baseY, buf.baseY === 0));

    // Anchor on the newest scrollback row: insert/delete line only touch screen rows, so this marker
    // moves only when xterm trims the top (a marker on the cursor row would also move with IL/DL).
    if (marker) marker.dispose();
    marker = renderedBase > 0 ? term.registerMarker(-(buf.cursorY + 1)) : null;
    if (marker) markerLine = marker.line;
    if (following) viewEl.scrollTop = viewEl.scrollHeight;
  }

  // Remove rows xterm dropped off the top, keeping the reader's place when they are scrolled up.
  function dropTop(count) {
    const before = viewEl.scrollHeight;
    for (let i = 0; i < count && histEl.firstChild; i++) histEl.firstChild.remove();
    renderedBase -= count;
    // The new first row must not start with a line break.
    const first = histEl.firstChild;
    if (first && first.firstChild && first.firstChild.nodeType === Node.TEXT_NODE && first.firstChild.data === '\n') {
      first.firstChild.remove();
    }
    if (!following) viewEl.scrollTop -= before - viewEl.scrollHeight;
  }

  // The visible screen, from row `from` to the end of the buffer. Agent CLIs pin their input box to the
  // bottom and leave blank rows above it, so runs of blank rows collapse into one and trailing blank rows
  // are dropped: the text uses the phone's height instead of the Mac's.
  // Buffer row of each drawn screen line, so a touch maps back to a PTY row despite the collapsed blanks.
  let liveRows = [];
  let liveFrom = 0;
  function screenRows(buf, from, first) {
    const frag = document.createDocumentFragment();
    liveRows = [];
    liveFrom = from;
    let end = buf.length - 1;
    while (end >= from && buf.getLine(end).translateToString(true) === '') end--;
    let prevBlank = false;
    for (let y = from; y <= end; y++) {
      const line = buf.getLine(y);
      const blank = !line.isWrapped && line.translateToString(true) === '';
      if (blank && prevBlank) continue;
      prevBlank = blank;
      liveRows.push(y);
      frag.append(rowElement(line, first));
      first = false;
    }
    return frag;
  }

  // A full-screen program (alternate screen, e.g. an agent CLI in fullscreen mode) has no scrollback:
  // show its current screen, wrapped like everything else.
  function renderScreen(buf) {
    if (histEl.firstChild) resetView();
    liveEl.replaceChildren(screenRows(buf, 0, true));
    if (following) viewEl.scrollTop = viewEl.scrollHeight;
  }

  term.onWriteParsed(scheduleRender);
  term.buffer.onBufferChange(() => {
    resetView();
    scheduleRender();
  });

  // Follow live output only while the reader is at the end; scrolling up pauses it.
  viewEl.addEventListener('scroll', () => {
    const slack = parseFloat(getComputedStyle(viewEl).fontSize) * 2;
    following = viewEl.scrollHeight - viewEl.scrollTop - viewEl.clientHeight < slack;
    toEndEl.hidden = following;
  });
  toEndEl.onclick = () => {
    following = true;
    toEndEl.hidden = true;
    viewEl.scrollTop = viewEl.scrollHeight;
  };
  // The view shrinks when the composer or the keyboard opens; a reader at the end stays at the end.
  new ResizeObserver(() => {
    if (following) viewEl.scrollTop = viewEl.scrollHeight;
  }).observe(viewEl);

  // ---- font size -----------------------------------------------------------

  const FONT_KEY = 'tower.fontSize';
  const FONT_MIN = 11;
  const FONT_MAX = 18;
  let fontSize = 12;
  try {
    const saved = Number(localStorage.getItem(FONT_KEY));
    if (saved >= FONT_MIN && saved <= FONT_MAX) fontSize = saved;
  } catch {}

  function applyFont(size) {
    fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, size));
    viewEl.style.fontSize = `${fontSize}px`;
    document.documentElement.style.setProperty('--term-font', `${fontSize}px`); // the compose box types at the terminal's size
    try {
      localStorage.setItem(FONT_KEY, String(fontSize));
    } catch {}
    if (following) viewEl.scrollTop = viewEl.scrollHeight;
    sendSize(); // in command mode the PTY follows the new number of columns
  }
  document.getElementById('font-down').onclick = () => applyFont(fontSize - 1);
  document.getElementById('font-up').onclick = () => applyFont(fontSize + 1);
  applyFont(fontSize);

  // ---- sessions and connection ---------------------------------------------

  // Sessions carry `info` from the gateway: workspace, Cockpit tab (only when the match is certain),
  // foreground process, branch and recent activity. Without it a session still shows as its command.

  const AVATAR_COLORS = ['#64b670', '#8d8e95', '#416ee8', '#4da29f', '#6a57c8', '#d35353'];
  const BRANCH_ICON =
    '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="5" r="2"/><circle cx="6" cy="19" r="2"/><circle cx="18" cy="8" r="2"/><path d="M6 7v10M18 10c0 4-6 3-11 7"/></svg>';

  const CHEVRON_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>';
  const worktreeToggles = new Map(); // group key → expanded, set by a tap on this phone
  const lastByWs = new Map(); // workspace path → id of the session last shown from it on this phone

  function avatarColor(name) {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return AVATAR_COLORS[h % AVATAR_COLORS.length];
  }

  // Cockpit's saved color for the workspace when the gateway could read it, else one derived from the name.
  function avatar(name, color) {
    const el = document.createElement('span');
    el.className = 'avatar';
    el.textContent = (name.trim()[0] || '?').toUpperCase();
    el.style.background = color || avatarColor(name);
    return el;
  }

  // Cockpit prefixes agent tab titles with its own status glyph; the viewer draws its own indicator.
  const cleanTitle = (title) => title.replace(/^[◐◑◒◓✳⠀-⣿●○·\s]+/u, '').trim();

  // A plain terminal's tab is titled after its workspace; the process says more than repeating that name.
  function label(s) {
    const i = s.info || {};
    const title = i.tab && cleanTitle(i.tab.title);
    const named = title && !(i.workspace && title === i.workspace.name);
    return (named && title) || i.process || s.cmd.split('/').pop();
  }

  function detail(s) {
    const i = s.info || {};
    const parts = [];
    if (i.tab && i.process && i.process !== label(s)) parts.push(i.process);
    if (i.cwd) parts.push(i.cwd);
    if (s.exit !== undefined) parts.push('exited');
    return parts.join(' · ');
  }

  /** Top-level group (a worktree joins its main repository) and the exact workspace key. */
  function groupOf(s) {
    const w = s.info && s.info.workspace;
    if (!w) return { key: '', name: '', ws: '' };
    return { key: w.parent || w.name, name: w.parent || w.name, ws: w.path };
  }

  function indicator(s) {
    const i = s.info || {};
    if (i.tab && i.tab.working) {
      const el = document.createElement('span');
      el.className = 'working';
      el.title = 'agent working';
      return el;
    }
    if (i.active) {
      const el = document.createElement('span');
      el.className = 'activity';
      el.title = 'new output';
      return el;
    }
    return null;
  }

  // A workspace's indicator: an agent at work in any of its sessions, else fresh output in one.
  function groupIndicator(list) {
    const s = list.find((x) => x.info && x.info.tab && x.info.tab.working) || list.find((x) => x.info && x.info.active);
    return s ? indicator(s) : null;
  }

  function sessionRow(s) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `row${current && current.id === s.id ? ' active' : ''}`;
    const text = document.createElement('span');
    text.className = 'row-text';
    const title = document.createElement('span');
    title.className = 'row-title';
    title.textContent = label(s);
    const sub = document.createElement('span');
    sub.className = 'row-sub';
    sub.textContent = detail(s);
    text.append(title, sub);
    b.append(text);
    const ind = indicator(s);
    if (ind) b.append(ind);
    b.onclick = () => {
      closeDrawer();
      select(s);
    };
    return b;
  }

  function renderHeader() {
    if (!current) {
      curAvatarEl.replaceChildren();
      curAvatarEl.style.background = '';
      curTitleEl.textContent = 'Cockpit Tower';
      curSubEl.textContent = sessions.length ? '' : 'No terminal sessions open in Cockpit';
      return;
    }
    const w = current.info && current.info.workspace;
    const name = w ? w.parent || w.name : label(current);
    curAvatarEl.textContent = (name.trim()[0] || '?').toUpperCase();
    curAvatarEl.style.background = (w && w.color) || avatarColor(name);
    curTitleEl.textContent = w && w.parent ? `${w.parent} › ${w.name}` : name;
    const ind = current.info && current.info.tab && current.info.tab.working ? ' · working' : '';
    curSubEl.textContent = `${label(current)}${ind}`;
  }

  // Like Cockpit's tab strip: the sessions of the workspace on screen.
  function renderTabs() {
    const ws = current ? groupOf(current).ws : null;
    const same = current ? sessions.filter((s) => groupOf(s).ws === ws && (ws !== '' || s.id === current.id)) : [];
    tabsEl.replaceChildren(
      ...same.map((s) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `tab${current && current.id === s.id ? ' active' : ''}`;
        const ind = indicator(s);
        if (ind) b.append(ind);
        const t = document.createElement('span');
        t.textContent = label(s);
        b.append(t);
        b.onclick = () => select(s);
        return b;
      }),
      ...(current && ws !== '' && mayCommand ? [newTabButton(ws)] : []),
    );
  }

  // The (+) at the end of the strip, as on the Mac: a terminal in this workspace, opened by the gateway in command
  // mode (ADR 2026-10-24_phone-new-tab). The page sends no folder; the gateway uses the watched session's.
  function newTabButton(ws) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'tab-add';
    add.textContent = '+';
    add.setAttribute('aria-label', 'New terminal');
    add.disabled = !commandOn || newTab !== null;
    add.onclick = () => {
      if (!send({ type: 'new-tab' })) return note('not sent: no connection', 'bad');
      newTab = { ws, before: new Set(sessions.map((s) => s.id)), at: Date.now() };
      renderTabs();
    };
    return add;
  }

  /** Selects the session the (+) opened once a list has it: a new id in the same workspace. Gives up after 15 s. */
  function pickNewTab() {
    if (!newTab) return false;
    const opened = sessions.find((s) => !newTab.before.has(s.id) && groupOf(s).ws === newTab.ws);
    if (opened) {
      newTab = null;
      select(opened);
      return true;
    }
    if (Date.now() - newTab.at > 15000) {
      newTab = null;
      note('terminal opened on the Mac; pick it in the tabs');
      renderTabs();
    }
    return false;
  }

  // Opening a workspace lands where this phone last was in it, else on Cockpit's focused tab there, else on
  // an agent at work, else on its first tab; the tab strip then picks the terminal.
  function openWorkspace(path) {
    const inWs = sessions.filter((s) => groupOf(s).ws === path);
    const tab = (s) => (s.info && s.info.tab) || {};
    const pick =
      inWs.find((s) => s.id === lastByWs.get(path)) ||
      inWs.find((s) => tab(s).focused) ||
      inWs.find((s) => tab(s).working) ||
      inWs[0];
    closeDrawer();
    if (pick) select(pick);
  }

  // A workspace or worktree of the rail; a tap opens it.
  function workspaceButton(className, path, list) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `${className}${current && groupOf(current).ws === path ? ' active' : ''}`;
    b.disabled = list.length === 0;
    b.onclick = () => openWorkspace(path);
    return b;
  }

  // Like Cockpit's workspace rail: each workspace and worktree is a row to open; its tabs pick the terminal.
  function renderGroups() {
    const nodes = [];
    if (sessions.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'No terminal sessions open in Cockpit.';
      groupsEl.replaceChildren(empty);
      return;
    }
    const groups = new Map();
    for (const s of sessions) {
      const g = groupOf(s);
      const w = s.info && s.info.workspace;
      if (!groups.has(g.key)) {
        groups.set(g.key, { key: g.key, name: g.name, main: [], worktrees: new Map(), order: undefined, color: undefined, expanded: undefined });
      }
      const entry = groups.get(g.key);
      // Any session of the group can carry its root workspace's Cockpit order, color and worktree state.
      if (w && entry.order === undefined && w.order !== undefined) entry.order = w.order;
      if (w && !entry.color && w.color) entry.color = w.color;
      if (w && entry.expanded === undefined && typeof w.worktreesExpanded === 'boolean') entry.expanded = w.worktreesExpanded;
      if (w && w.parent) {
        if (!entry.worktrees.has(w.path)) entry.worktrees.set(w.path, { path: w.path, name: w.name, branch: s.info.branch, rank: w.rank, sessions: [] });
        entry.worktrees.get(w.path).sessions.push(s);
      } else {
        entry.main.push(s);
      }
    }
    const label2 = document.createElement('div');
    label2.className = 'section-label';
    label2.textContent = 'Workspaces';
    nodes.push(label2);
    const others = groups.get('');
    groups.delete('');
    // The rail's order from Cockpit's saved state; workspaces it does not know keep their place at the end.
    const ordered = [...groups.values()].sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
    for (const g of ordered) {
      const box = document.createElement('div');
      box.className = 'ws';
      // The rail row and the worktree toggle are sibling buttons: a button cannot hold another.
      const head = document.createElement('div');
      head.className = 'ws-head';
      // Without a terminal in the main repository (only in its worktrees) the row has nothing to open.
      const open = workspaceButton('ws-open', g.main.length ? groupOf(g.main[0]).ws : null, g.main);
      const text = document.createElement('span');
      text.className = 'ws-text';
      const name = document.createElement('span');
      name.className = 'ws-name';
      name.textContent = g.name;
      text.append(name);
      const branch = g.main.map((s) => s.info && s.info.branch).find(Boolean);
      if (branch) {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.innerHTML = BRANCH_ICON;
        chip.append(branch);
        text.append(chip);
      }
      open.append(avatar(g.name, g.color), text);
      const ind = groupIndicator(g.main);
      if (ind) open.append(ind);
      head.append(open);
      box.append(head);
      if (g.worktrees.size === 0) {
        nodes.push(box);
        continue;
      }
      // Like Cockpit's rail: a chevron and the worktree count; the list starts as Cockpit has it and a tap
      // here toggles it on this phone only.
      const expanded = worktreeToggles.has(g.key) ? worktreeToggles.get(g.key) : g.expanded !== false;
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = `wt-toggle${expanded ? ' expanded' : ''}`;
      toggle.dataset.wtKey = g.key;
      toggle.setAttribute('aria-expanded', String(expanded));
      const busy = [...g.worktrees.values()].some((wt) => wt.sessions.some((s) => s.info && s.info.tab && s.info.tab.working));
      toggle.setAttribute('aria-label', `${expanded ? 'Collapse' : 'Expand'} ${g.worktrees.size} worktrees${!expanded && busy ? ', agent working' : ''}`);
      if (!expanded && busy) {
        const spin = document.createElement('span');
        spin.className = 'working';
        toggle.append(spin);
      }
      const count = document.createElement('span');
      count.textContent = String(g.worktrees.size);
      toggle.append(count);
      toggle.insertAdjacentHTML('beforeend', CHEVRON_ICON);
      toggle.onclick = () => {
        worktreeToggles.set(g.key, !expanded);
        renderGroups();
      };
      head.append(toggle);
      if (!expanded) {
        nodes.push(box);
        continue;
      }
      for (const wt of [...g.worktrees.values()].sort((a, b) => a.rank - b.rank)) {
        const wh = workspaceButton('wt-row', wt.path, wt.sessions);
        wh.innerHTML = BRANCH_ICON;
        const wn = document.createElement('span');
        wn.className = 'wt-name';
        wn.textContent = wt.branch && wt.branch !== wt.name ? `${wt.name} · ${wt.branch}` : wt.name;
        wh.append(wn);
        const wi = groupIndicator(wt.sessions);
        if (wi) wh.append(wi);
        box.append(wh);
      }
      nodes.push(box);
    }
    if (others) {
      const h = document.createElement('div');
      h.className = 'section-label';
      h.textContent = 'Other terminals';
      nodes.push(h, ...others.main.map((s) => sessionRow(s)));
    }
    // Re-rendering replaces the buttons; keep keyboard and screen reader focus on the same toggle.
    const focusedKey = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.wtKey : undefined;
    groupsEl.replaceChildren(...nodes);
    if (focusedKey !== undefined) {
      const again = [...groupsEl.querySelectorAll('.wt-toggle')].find((b) => b.dataset.wtKey === focusedKey);
      if (again) again.focus();
    }
  }

  function renderSessions() {
    renderHeader();
    renderTabs();
    renderGroups();
    const active = tabsEl.querySelector('.tab.active');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function openDrawer() {
    drawerEl.hidden = false;
    groupsEl.scrollTop = 0; // start at the top of the rail
  }
  function closeDrawer() {
    drawerEl.hidden = true;
  }
  document.getElementById('menu').onclick = openDrawer;
  document.getElementById('current').onclick = openDrawer;
  document.getElementById('close').onclick = closeDrawer;
  document.getElementById('scrim').onclick = closeDrawer;

  // Follows Cockpit's themeMode; "system" lets the phone's light/dark setting decide.
  const themeColorEl = document.querySelector('meta[name="theme-color"]');
  const phoneDark = matchMedia('(prefers-color-scheme: dark)');
  let theme = 'system';
  function applyTheme(mode) {
    theme = mode === 'light' || mode === 'dark' ? mode : 'system';
    document.documentElement.dataset.theme = theme === 'system' ? (phoneDark.matches ? 'dark' : 'light') : theme;
    themeColorEl.content = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim();
  }
  phoneDark.addEventListener('change', () => applyTheme(theme));
  applyTheme('system');

  // The session Cockpit has in focus, else an agent at work, else the first one.
  function preferred() {
    return (
      sessions.find((s) => s.info && s.info.tab && s.info.tab.focused) ||
      sessions.find((s) => s.info && s.info.tab && s.info.tab.working) ||
      sessions[0]
    );
  }

  // The first pick may come before the gateway could tie sessions to tabs; it is redone once that arrives,
  // unless the reader already chose.
  let autoPicked = false;

  function select(session) {
    autoPicked = false;
    if (current && current.id === session.id) return; // already showing it; the gateway would not replay again
    current = session;
    lastByWs.set(groupOf(session).ws, session.id);
    setCommand(false); // the gateway turns command mode off on a session switch too
    term.reset();
    resetMouseModes();
    term.resize(session.cols, session.rows); // local emulator: follows the PTY's size
    resetView();
    following = true;
    toEndEl.hidden = true;
    scheduleRender();
    renderSessions();
    send({ type: 'select', id: session.id });
  }

  function send(msg) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    ws.send(JSON.stringify(msg));
    return true;
  }

  // ---- command mode --------------------------------------------------------

  const MAX_INPUT_BYTES = 16 * 1024; // the gateway's limit (src/protocol.ts)
  const REASONS = {
    command_off: 'command mode is off',
    invalid: 'not sent: control characters or too long',
    cockpit_unavailable: 'not sent: Cockpit unavailable',
    log_failed: 'not sent: the Mac could not record it',
    busy: 'another viewer sized this session; lines wrap',
    gone: 'session ended',
  };
  const NEW_TAB_REASONS = {
    ...REASONS,
    no_workspace: 'no workspace for this terminal',
    no_anchor: 'open a terminal in this workspace on the Mac first',
    gone: 'workspace not open in Cockpit',
    remote: 'remote workspaces are not supported',
    failed: 'Cockpit did not open the terminal',
    opening: 'already opening a terminal',
  };

  function note(text, kind) {
    noteEl.textContent = text || '';
    noteEl.className = `compose-note ${kind || ''}`;
  }

  function setCommand(on) {
    commandOn = on && mayCommand;
    commandEl.hidden = !mayCommand;
    commandEl.setAttribute('aria-pressed', String(commandOn));
    commandEl.classList.toggle('on', commandOn);
    composerEl.hidden = !commandOn;
    modeEl.textContent = commandOn ? 'command' : 'read-only';
    modeEl.classList.toggle('on', commandOn);
    if (!commandOn) {
      pendingText = null;
      restBox = null;
      drag = null;
      pendingWheel = 0;
      wheelAt = null;
      note('');
      composeEl.blur();
    }
    renderTabs(); // the (+) follows command mode
    fitViewport();
  }

  // ---- PTY size from the phone ----------------------------------------------

  function cellSize() {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0';
    probe.textContent = 'M'.repeat(100);
    viewEl.append(probe);
    const r = probe.getBoundingClientRect();
    probe.remove();
    return { w: r.width / 100, h: r.height };
  }

  function sendSize() {
    if (!commandOn || !restBox) return;
    const c = cellSize();
    send({ type: 'resize', cols: Math.floor(restBox.w / c.w), rows: Math.floor(restBox.h / c.h) });
  }

  // Measured once the composer is laid out and before any keyboard: the keyboard never resizes the PTY.
  function measureRestBox() {
    requestAnimationFrame(() => {
      if (!commandOn) return;
      const cs = getComputedStyle(viewEl);
      restBox = {
        w: viewEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
        h: viewEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
      };
      sendSize();
    });
  }

  // The gateway reports every size it applies or gives back; the emulator takes it before the program redraws.
  function onSize(msg) {
    if (!current || msg.id !== current.id) return;
    if (msg.cols !== current.cols || msg.rows !== current.rows) {
      current = { ...current, cols: msg.cols, rows: msg.rows };
      term.resize(msg.cols, msg.rows); // local emulator: follows the PTY's size
      resetView();
      scheduleRender();
    }
    if (msg.by === 'mac' && commandOn) note('the Mac changed the size; lines wrap again', 'warn');
  }

  // ---- agent scroll (command mode) -------------------------------------------
  // A one-finger drag scrolls the program like the Mac's trackpad: one event per line height, finger down = older.

  const WHEEL_MAX = 20; // the gateway's limit (src/input.ts)

  // The cell under the finger, 1-based on the PTY's screen. Blank runs are collapsed in the view (screenRows),
  // so the visual line maps back through liveRows; the gateway clamps whatever this gets wrong.
  function cellAt(p, cell) {
    const rects = liveEl.getClientRects();
    if (!rects.length || !liveRows.length) return { col: 1, row: 1 };
    const fromBottom = Math.floor((rects[rects.length - 1].bottom - p.y) / cell.h);
    const i = liveRows.length - 1 - fromBottom;
    const y = i < 0 ? liveFrom : i < liveRows.length ? liveRows[i] : liveRows[liveRows.length - 1] + (i - liveRows.length + 1);
    const left = viewEl.getBoundingClientRect().left + parseFloat(getComputedStyle(viewEl).paddingLeft);
    return { col: Math.floor((p.x - left) / cell.w) + 1, row: y - liveFrom + 1 };
  }

  viewEl.addEventListener(
    'touchstart',
    (e) => {
      drag =
        commandOn && e.touches.length === 1 && wheelMode()
          ? { y: e.touches[0].clientY, acc: 0, cell: cellSize(), at: null }
          : null;
    },
    { passive: true },
  );
  viewEl.addEventListener(
    'touchmove',
    (e) => {
      if (!drag) return;
      e.preventDefault(); // the drag scrolls the program, not the page
      const t = e.touches[0];
      drag.acc += t.clientY - drag.y;
      drag.y = t.clientY;
      const n = Math.trunc(drag.acc / drag.cell.h);
      if (n === 0) return;
      drag.acc -= n * drag.cell.h;
      pendingWheel += n;
      wheelAt = { x: t.clientX, y: t.clientY, cell: drag.cell };
      if (!wheelFrame) {
        wheelFrame = true;
        requestAnimationFrame(flushWheel);
      }
    },
    { passive: false },
  );
  const endDrag = () => {
    drag = null;
  };
  viewEl.addEventListener('touchend', endDrag);
  viewEl.addEventListener('touchcancel', endDrag);

  // One message per frame at most: the pending lines of the drag, finger down (positive) = wheel up = older.
  function flushWheel() {
    wheelFrame = false;
    const mode = commandOn ? wheelMode() : null;
    if (!mode || pendingWheel === 0 || !wheelAt) {
      pendingWheel = 0;
      return;
    }
    const count = Math.min(Math.abs(pendingWheel), WHEEL_MAX);
    const dir = pendingWheel > 0 ? 'up' : 'down';
    pendingWheel -= Math.sign(pendingWheel) * count;
    const cell = mode === 'arrows' ? {} : cellAt(wheelAt, wheelAt.cell);
    send({ type: 'wheel', dir, count, mode, app: term.modes.applicationCursorKeysMode, ...cell });
    if (pendingWheel !== 0) {
      wheelFrame = true;
      requestAnimationFrame(flushWheel);
    }
  }

  // iOS keeps the layout viewport under the keyboard and scrolls the visible part down to the field. While
  // the composer is open, the page is pinned to exactly the visible part (height and offset), so the
  // composer sits on the keyboard and the terminal ends right above it.
  function fitViewport() {
    const vv = window.visualViewport;
    const fit = commandOn && vv;
    document.body.classList.toggle('fitted', Boolean(fit));
    document.body.classList.toggle('keyboard', Boolean(fit && vv.height < window.innerHeight - 100));
    document.body.style.height = fit ? `${vv.height}px` : '';
    document.body.style.top = fit ? `${vv.offsetTop}px` : '';
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', fitViewport);
    window.visualViewport.addEventListener('scroll', fitViewport);
  }

  commandEl.addEventListener('click', () => {
    if (!send({ type: 'command', on: !commandOn })) note('not sent: no connection', 'bad');
  });

  // pointerdown + preventDefault keeps the focus (and the keyboard) on the text box while tapping keys.
  composerEl.querySelectorAll('[data-key]').forEach((btn) => {
    btn.addEventListener('pointerdown', (e) => e.preventDefault());
    btn.addEventListener('click', () => {
      if (!send({ type: 'input', key: btn.dataset.key })) note('not sent: no connection', 'bad');
    });
  });

  sendEl.addEventListener('pointerdown', (e) => e.preventDefault());
  sendEl.addEventListener('click', () => {
    const text = composeEl.value;
    if (text === '') return;
    const paste = term.modes.bracketedPasteMode;
    const lines = text.split(/\r\n|\r|\n/).length;
    const markers = paste && lines > 1 ? 12 : 0; // ESC[200~ and ESC[201~, added by the gateway
    if (new TextEncoder().encode(text).length + markers > MAX_INPUT_BYTES) return note('too long: 16 KiB at most', 'bad');
    // Without bracketed paste each line break is an Enter press, so a multi-line text would run line by line.
    if (lines > 1 && !paste && !confirm(`${lines} lines will run as separate Enter presses. Send?`)) return;
    if (!send({ type: 'input', text, paste })) return note('not sent: no connection', 'bad');
    pendingText = text;
  });

  function onInputResult(msg) {
    if (msg.ok) {
      if (pendingText !== null && composeEl.value === pendingText) composeEl.value = '';
      pendingText = null;
      note('');
    } else {
      pendingText = null;
      note(REASONS[msg.reason] || `not sent: ${msg.reason}`, 'bad');
    }
  }

  function decode(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  }

  function connect() {
    setStatus('connecting…');
    const base = location.pathname.replace(/\/$/, '');
    ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${base}/ws`);
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'status') {
        if (msg.state === 'connected') setStatus(`connected to Cockpit${msg.server ? ` ${msg.server}` : ''}`, 'ok');
        else if (msg.state === 'mismatch') setStatus(msg.detail, 'bad');
        else setStatus(msg.detail || 'Cockpit unavailable', 'warn');
      } else if (msg.type === 'sessions') {
        applyTheme(msg.theme);
        sessions = msg.sessions;
        const fresh = current && sessions.find((s) => s.id === current.id);
        if (fresh && !needsReselect) {
          // Periodic refresh: keep the same session, with its new context. A Mac-side resize reflows the emulator.
          const resized = fresh.cols !== current.cols || fresh.rows !== current.rows;
          current = fresh;
          if (resized) {
            term.resize(fresh.cols, fresh.rows); // local emulator: follows the PTY's size
            resetView();
            scheduleRender();
          }
        }
        if (needsReselect) {
          // A fresh gateway connection has no attachment yet: re-select what was on screen.
          needsReselect = false;
          const again = current && sessions.find((s) => s.id === current.id);
          current = null;
          if (again) return select(again);
        }
        renderSessions();
        if (pickNewTab()) return;
        const hasTabs = sessions.some((s) => s.info && s.info.tab);
        if (!current && sessions.length > 0) {
          select(preferred());
          autoPicked = !hasTabs;
        } else if (autoPicked && hasTabs) {
          autoPicked = false;
          const better = preferred();
          if (better && current && better.id !== current.id) select(better);
        }
      } else if (msg.type === 'output' && current && msg.id === current.id) {
        term.write(decode(msg.data));
      } else if (msg.type === 'exited' && current && msg.id === current.id) {
        setStatus(`session ${msg.id} exited (${msg.code})`, 'warn');
      } else if (msg.type === 'access') {
        mayCommand = msg.input === true;
        setCommand(false);
      } else if (msg.type === 'command') {
        const was = commandOn;
        setCommand(msg.on === true && current !== null && msg.id === current.id);
        if (commandOn && !was) measureRestBox();
      } else if (msg.type === 'input') {
        onInputResult(msg);
      } else if (msg.type === 'size') {
        onSize(msg);
      } else if (msg.type === 'resize' && msg.ok === false) {
        note(REASONS[msg.reason] || `size not set: ${msg.reason}`, 'bad');
      } else if (msg.type === 'new-tab' && msg.ok === false) {
        if (msg.reason === 'opening') return; // the first request is still running: keep waiting for its session
        newTab = null;
        note(NEW_TAB_REASONS[msg.reason] || `terminal not opened: ${msg.reason}`, 'bad');
        renderTabs();
      } else if (msg.type === 'wheel' && msg.ok === false) {
        note(msg.reason === 'invalid' ? 'scroll not sent' : REASONS[msg.reason] || `scroll not sent: ${msg.reason}`, 'bad');
      } else if (msg.type === 'error') {
        setStatus(`${msg.code}${msg.detail ? `: ${msg.detail}` : ''}`, 'bad');
      }
    };
    ws.onclose = (event) => {
      clearInterval(pingTimer);
      newTab = null; // a request on the old connection gets no answer
      setCommand(false); // a new connection starts with command mode off
      if (event.code === 4408) {
        setStatus('disconnected after inactivity, tap to reconnect', 'warn');
        bannerEl.onclick = () => {
          bannerEl.onclick = null;
          current = null;
          connect();
        };
        return;
      }
      setStatus('connection lost, retrying…', 'warn');
      needsReselect = true;
      setTimeout(connect, 2000);
    };
    // Activity keeps the viewer attached; a hidden page stops pinging and is released after the idle timeout.
    pingTimer = setInterval(() => {
      if (document.visibilityState === 'visible') send({ type: 'ping' });
    }, 60000);
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') send({ type: 'list' });
    // Locking the phone or leaving the page ends command mode, even when iOS keeps the socket open.
    else if (commandOn) {
      send({ type: 'command', on: false });
      setCommand(false);
    }
  });

  connect();
})();
