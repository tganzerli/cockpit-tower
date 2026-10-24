# Cockpit Tower

Watch your [Remote Pi Cockpit](https://github.com/jacobaraujo7/remote_pi) terminal tabs from a phone browser,
over your Tailscale network, only when you turn it on.

Cockpit runs coding agents (Claude Code, Codex, Antigravity CLI, …) in real terminal tabs on your Mac.
Tower is a small gateway that connects to Cockpit's local server as an extra client, lists the
terminal sessions and streams the one you pick to an xterm.js page. The page opens **read-only**. Tapping
**Command** lets the Mac's owner type text and special keys (Enter, Esc, Ctrl-C, arrows, Tab) into the
session being watched, and sizes that session to the phone until command mode ends; it never kills anything.

```
iPhone Safari ──HTTPS (tailnet only)──▶ tailscale serve :8443
                                              │
                                   gateway 127.0.0.1:7681  (this repo)
                                              │  JSONL over a Unix socket
                                   ~/.cockpit/cockpit-server.sock  (Cockpit's sidecar)
```

## Requirements

- macOS with **Cockpit open**: its terminals live in the sidecar server that Tower reads.
- **Node ≥ 23.6**: Tower runs its TypeScript directly, with no build step.
- **Tailscale** on the Mac and on the phone, with **Serve enabled** on your tailnet. The first
  `tower on` prints the consent link if Serve is off.

## Usage

```bash
npm install
bin/tower on       # start the gateway, keep the Mac awake, publish on the tailnet; prints the URL
bin/tower status   # what is running (--json for scripts)
bin/tower off      # unpublish, stop the gateway; the Mac can sleep again
bin/tower qr       # the viewer URL as an SVG QR code
```

### From Cockpit

Open `panel/tower.panel` in Cockpit (`cockpit open panel/tower.panel`). It shows what is running,
refreshes every 5 s, and has Turn on / Turn off buttons, the viewer URL with a Copy button, and a QR code
to scan with the iPhone. It only runs `bin/tower`, so the terminal and the panel always agree.
The gateway and `caffeinate` start in their own session, so they keep running after the panel tab
closes and do not depend on the Cockpit app's process group.

Open the printed `https://<your-mac>.<tailnet>.ts.net:8443/<token>/` on the phone. The token is a random
secret created on the first `tower on` and kept in `~/.cockpit-tower/token` (mode 0600); delete that file and run `tower on` again to rotate it (a running gateway is restarted with the new token). Sessions appear as tabs
(`zsh · s3 · 117×54`). While reading, the terminal keeps the Mac's width and lines wrap on the phone; in
command mode it takes the phone's width.

Local testing without Tailscale or token: `npm start -- --dev` and open `http://127.0.0.1:7681/`
(read-only; add `TOWER_INPUT_LOG=$HOME/.cockpit-tower/dev-input.log` to try command mode, which then only
accepts a page opened at exactly that address, and no Tailscale login check).

### Typing from the phone

Tap **Command** in the top bar. A text box with a key bar opens, and only then does the gateway accept
input, only for the session on screen. Switching session, the session ending, the page reconnecting or the
gateway losing Cockpit turns it off.
- **Drag a finger on the terminal to scroll the agent.** For full-screen agents (Claude Code in fullscreen,
  for example) the drag is sent as the Mac's mouse wheel would be (or as arrows on an alternate screen
  without mouse), so their history scrolls on the phone and on the Mac. Finger down shows older content.
  On a plain shell, or outside command mode, the drag scrolls the page as before and nothing is sent.
- **The session takes the phone's size** while command mode is on: the program redraws for the phone's
  columns and rows (measured without the keyboard; A−/A+ resize again). The Mac's tab shows that size too.
  When command mode ends, the Mac gets its size back, unless the Mac's layout changed in the meantime
  (then the Mac's own size stands). A second page on the same session can type but not resize it.
- Only the Tailscale login that owns the Mac (read by `tower on` from `tailscale status --json`, or
  `TOWER_OWNER`) gets the button, and the WebSocket only opens from the page's own origin.
- **Send** sends the text as typed (line breaks become Enter, unless the program enabled bracketed
  paste); ⏎ and the other keys go one by one. Up to 16 KiB per send.
- Everything sent is appended first to `~/.cockpit-tower/input.log` (mode 0600), **including the text
  in full** — do not type secrets you do not want on the Mac's disk. If it cannot be written, nothing is sent.
- If the Tailscale identity is unavailable when `tower on` runs, the page stays read-only.

| Variable | Default | Meaning |
|---|---|---|
| `TOWER_PORT` | `7681` | loopback port of the gateway |
| `TOWER_HTTPS_PORT` | `8443` | tailnet HTTPS port used by `tailscale serve` |
| `TOWER_SOCKET` | `~/.cockpit/cockpit-server.sock` | Cockpit's server socket (`cockpit-server-debug.sock` for a dev build of Cockpit) |
| `TOWER_STATE` | `~/.cockpit-tower` | pid files, token, logs |
| `TOWER_TOKEN` | generated by `bin/tower` | secret path prefix; required by `src/main.ts` outside `--dev` |
| `TOWER_ORIGIN` | set by `bin/tower` | exact `Origin` the WebSocket must come from |
| `TOWER_OWNER` | set by `bin/tower` (your `LoginName`) | the only Tailscale login allowed to type; set it yourself to override |
| `TOWER_INPUT_LOG` | set by `bin/tower` (`~/.cockpit-tower/input.log`) | record of everything typed; without it the page is read-only |

## What it never does

- Kill a terminal, open one, acknowledge flow credit or run commands. Only `hello`, `pty.list`,
  `pty.attach`, `pty.detach`, `pty.input` and `pty.resize` can be encoded, the two writes are built in one
  place only, and a test fails if any other type appears in the code.
- Type or resize without command mode, into a session other than the one on screen, or for anyone but the owner.
- Start, replace or stop Cockpit's server. It only connects to an existing socket.
- Listen beyond `127.0.0.1`. The only way in is `tailscale serve`. Every route lives under the secret
  `/<token>/` prefix **and** requires the Tailscale identity header, so another local user or daemon
  that can reach the loopback port still gets a 404. `tailscale funnel`, which would expose it to the
  internet, is never used.
- Trust a stale pid file: `bin/tower` checks that a recorded pid is still its own process before
  reusing or stopping it, and refuses to start if its port is taken by something else.

## Known limitations

- **Typing on the Mac and the phone at the same time interleaves.** Cockpit's server has no input lock.
- **Closing the tab on the Mac drops the session** from the list, for the phone too (the tab's shell has
  been seen to stay alive in Cockpit until SIGHUP, an upstream issue). Tower attaches only while a page is
  open, and drops a page after 10 minutes without activity. It never sends flow-control acks: through
  Cockpit's server the flow-control window is not applied, so an unacknowledged session does not pause.
- **`cockpit …` CLI commands** run outside a Cockpit tab can fail with "more than one Cockpit is
  attached" while a Tower page is open, because Tower is a second client.
- **Tab names are not shown.** The protocol does not link a session to its tab yet.
- **If the gateway is killed hard** (SIGKILL) while a phone commands, the Mac keeps the phone's size until
  its window or split changes.
- **A closed MacBook lid** without an external display still sleeps, even with `tower on`.
- Supports Cockpit protocol **v2**. Another version shows a clear error instead of a blank page.

## Development

```bash
npm test   # node --test against a fake Cockpit server (no Cockpit needed)
```

This repository follows the agent methodology in `.agents/` (`AGENTS.md` is the entry point).
