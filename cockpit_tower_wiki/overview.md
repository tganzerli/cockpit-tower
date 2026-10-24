---
title: Overview — Cockpit Tower
type: overview
scope:
  area: []
status: draft
updated: 2026-10-24
code_refs:
  - src/
  - web/
  - bin/tower
  - panel/
---

# Overview — Cockpit Tower

> High-level map of the product. This is the first page a new agent reads to understand what exists before drilling into `_meta/index.md`. Fill it in during the first real work cycle — do not leave it a stub past the initial bootstrap.

## Product summary

Visualizador web das abas de terminal do Remote Pi Cockpit rodando no Mac. Serve para acompanhar e continuar o trabalho dos agentes (Claude Code, Antigravity CLI) pelo Safari do iPhone, via Tailscale, **sob demanda** (`tower on/off`). A página **abre em leitura**; o dono do Mac pode **digitar na sessão assistida** ligando o modo de comando (texto, Enter, Esc, Ctrl-C, setas, Tab, Shift-Tab), e nesse modo a sessão assume o tamanho do celular (devolvendo o do Mac ao sair) e arrastar o dedo rola o histórico dos agentes em tela cheia 📎 [`src/server.ts:359-414`](../src/server.ts). É um cliente do protocolo do Cockpit, não um fork. Maturidade: v0.1; leitura validada em aparelho real em 2026-10-22 e digitação em 2026-10-23.

## Areas

<!--
Single-repo default: list the functional areas/modules of the codebase.

| Area | Where it lives | Description |
|---|---|---|
| {area} | `{path/}` | {one-line description} |
-->

| Área | Onde fica | Descrição |
|---|---|---|
| gateway | `src/` | Cliente do `cockpit-server` + ponte HTTP/WebSocket em loopback — [[services/gateway]], [[contracts/cockpit-protocol-v2]] |
| viewer | `web/` | Página para o iPhone, em leitura até o dono tocar em "Command", que abre caixa de texto e barra de teclas especiais 📎 [`web/index.html:23,32`](../web/index.html), com o texto digitado no tamanho da fonte do terminal (sem zoom do iOS ao focar, pela `maximum-scale=1` da página) 📎 [`web/style.css:298`](../web/style.css), [`web/index.html:5`](../web/index.html): o xterm.js só emula no tamanho da PTY e uma visão HTML mostra o texto quebrado na largura do celular, com histórico rolável e as cores do Cockpit no tema claro ou escuro, seguindo o tema do Cockpit 📎 [`web/app.js:1-5`](../web/app.js); navegação como a do Cockpit (ordem, cores e worktrees recolhíveis da lateral; na gaveta se toca no workspace ou worktree, e o terminal se escolhe pela faixa de abas 📎 [`web/app.js:472`](../web/app.js)), com cada sessão identificada por projeto, aba, processo e branch ([[services/gateway]]) |
| tower-cli | `bin/tower` | Liga/desliga gateway, `caffeinate` e `tailscale serve` — [[flows/tower-on-off]] |
| panel | `panel/` | Painel do Cockpit (`tower.panel`) que liga/desliga o tower e mostra estado, URL e QR — [[flows/tower-on-off]] |
| upstream-cockpit | fora do repo (fork `tganzerli/remote_pi`) | Contribuições ao Cockpit (`remote_pi`) feitas a partir do tower; o código fica no fork, aqui ficam o trio e o conhecimento |

Repositório público: `github.com/tganzerli/cockpit-tower`, desde 2026-10-23, a partir de um commit inicial sanitizado. O histórico anterior (PRs #1–#22) está num arquivo privado ([[work/executions/2026-10-23_public-repo-migration]]).

Decisão central: [[decisions/2026-10-23_phone-input-client]] — libera só `pty.input`, por conexão em modo de comando e para a sessão assistida, com `Origin`, dono do Tailscale e registro local. Ela substituiu [[decisions/2026-10-22_read-only-client]] e foi refinada por [[decisions/2026-10-23_phone-pty-resize]], que libera `pty.resize` só em modo de comando, com o tamanho do Mac devolvido, e por [[decisions/2026-10-23_phone-fullscreen-scroll]], que manda a roda do mouse do arrasto por `pty.input`.

<!--
Monorepo module only (see modules/monorepo/): replace the "Areas" section
above with an Apps × Packages matrix instead, e.g.:

## Apps

| App | Description |
|---|---|
| [[apps/{app}]] | {one-line description} |

## Packages

| Package | Responsibility | Key external deps |
|---|---|---|
| [[packages/{pkg}]] | {responsibility} | {deps} |

### Cross-dependencies

- `{app}` depends on `{package}` 📎 [`path:NN`](path).
-->

## Key domains

| Domain | Where it lives | State | Page |
|---|---|---|---|
| {domain name} | `{path/}` | {e.g. implemented / in progress / planned} | [[domains/{domain}]] |

_(none documented yet)_

## External partners

> Only relevant if the cross-team module is installed (`modules/cross-team/`) — partner teams collaborating through their own LLM, or external specs this project consumes/produces.

_(none yet)_

## How to navigate

- By scope: start at `[[{area-or-app-or-package}]]`.
- By domain: see the table above.
- By type (all entities, all services): use `grep` or the Obsidian graph.
- History: see [[_meta/log]].
- Próximas tarefas: `board.kanban` (quadro do Cockpit; cada cartão traz nas notas o contexto para começar a análise).
- Conventions: see [[_meta/conventions]].
