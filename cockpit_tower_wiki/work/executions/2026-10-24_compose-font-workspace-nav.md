---
title: 2026-10-24 — Execução: fonte da caixa de texto e gaveta por workspace no viewer
type: execution
work_id: 2026-10-24_compose-font-workspace-nav
scope:
  area: [viewer]
status: done
updated: 2026-10-24
summary: A caixa de texto do modo de comando usa a fonte do terminal sem zoom do iOS, e a gaveta navega por workspace e worktree, como a lateral do Cockpit.
topic: [ui]
related: ["[[services/gateway]]", "[[overview]]"]
---

# Execução — 2026-10-24_compose-font-workspace-nav

## Metadados

- **ID:** `2026-10-24_compose-font-workspace-nav`
- **Tarefa:** [[work/tasks/2026-10-24_compose-font-workspace-nav]]
- **Plano:** [[work/plans/2026-10-24_compose-font-workspace-nav]]
- **Status:** `done`
- **Início:** `2026-10-24`
- **Fim:** `2026-10-24`
- **Escopo:** área `[viewer]`

## Checklist (espelha o plano §4.5)

- [x] 1 — Branch `feat/2026-10-24_compose-font-workspace-nav__tower` a partir da `dev`.
- [x] 2 — `web/index.html`: `maximum-scale=1` na meta viewport.
- [x] 3 — `--term-font` em `applyFont` e no `#compose`.
- [x] 4 — `lastByWs`, `openWorkspace()`, `renderGroups()` por workspace, sem "Working now".
- [x] 5 — Estilos da gaveta.
- [x] 6 — Validações e teste no iPhone.
- [x] 7 — Revisão de agente (rodada 1) e gate humano (dono aprovou em 2026-10-24).

## Atividade (cronológica)

### `2026-10-24` — início
- Plano aprovado pelo dono, que confirmou a remoção da seção "Working now". Branch criada a partir da `dev` (`c550e5a`).

### `2026-10-24` — passos 2 a 5
- `web/index.html`: `maximum-scale=1` na meta viewport.
- `web/app.js`: `applyFont` publica `--term-font`; `lastByWs` gravado em `select()`; `openWorkspace(path)` (última sessão vista → aba em foco → agente trabalhando → primeira); `workspaceButton()`; `groupIndicator()`; `renderGroups()` sem "Working now", com o workspace (`.ws-open`) e cada worktree (`.wt-row`) como botões; "Other terminals" mantido; `sessionRow` perdeu o parâmetro `kind`, que só servia aos recuos removidos.
- `web/style.css`: `#compose` com `var(--term-font, 12px) / 1.3`; estilos `.ws-open`/`.wt-row` (destaque `.active`, desabilitado sem esmaecer); saíram `.row.nested`, `.row.flat`, `.wt-head` e o recuo de 50 px de `.row`.
- Verificação local em Chrome headless (roteiro fora do repo, no scratchpad: página com `WebSocket` falso e 5 sessões em 2 workspaces, 1 worktree e 1 sessão sem workspace). Captura da gaveta conferida a olho: workspaces e worktree como linhas, destaque no workspace da tela, indicadores na linha, "Other terminals" no fim.

### `2026-10-24` — gate humano
- O dono testou no iPhone e aprovou os dois ajustes. O commit do nit da revisão foi incorporado ao commit do viewer antes do PR.

## Commits

- `3167d7b` docs(work): open the compose-font-workspace-nav task and plan
- `78b22ad` feat(viewer): type at the terminal's font size and navigate the drawer by workspace
- `60009a7` docs(work): log the compose-font-workspace-nav execution
- `bcc60f2` docs(work): record the owner's iPhone check
- `ac54476` docs(wiki): sync compose-font-workspace-nav to the knowledge pages and close the trio
- `e27e4c5` merge do PR #4 na `dev` (2026-10-24), sem CI (fora até 2026-11-01): `npm test` rodado de novo na `dev` após o merge → `ℹ pass 130` / `ℹ fail 0`

## Divergências do plano

- **Nenhuma.**

## Validações

- [x] `node --check web/app.js` → código 0, sem saída.
- [x] `npm test` → código 0
  ```
  ℹ pass 130
  ℹ fail 0
  ```
- [x] Toques simulados em Chrome headless (`--dump-dom`, resultado no `<title>`):
  ```
  wt->Agent wt · working tabs=Agent wt ; remote->remote_pi/build ; tower->Claude main ;
  tower again (last seen)->zsh active=1 ; font=12px ; font+=13px view=13px ; sends=7
  ```
  Worktree abre o agente trabalhando e as abas mostram só os terminais dele; voltar ao workspace volta à última aba vista; um só workspace destacado; a caixa acompanha o A+ junto com o terminal.
- [x] Verificação do plano §4.4 — teste no iPhone feito pelo dono em 2026-10-24: os dois ajustes aprovados (caixa na fonte do terminal sem zoom ao focar; gaveta por workspace).

## Revisão de agente

Tier `medium`.

| Rodada | Intervalo revisado | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `3167d7b..9f121dd` (diff inteiro do trabalho, antes de incorporar o nit) | 0 | 1 | 0 |

### Achados e resultado

| # | Rodada | Tag | `file:line` | Resultado | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Nit | `web/app.js:628` — comentário `"Working now" leads` ficou sem sentido após remover a seção | fixed (incorporado a `78b22ad`) | — |

Sem `Important`: não abre rodada 2.

## Páginas do wiki afetadas

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — linha de `web/app.js`: gaveta por workspace e worktree.
- `cockpit_tower_wiki/overview.md` (UPDATE) — área `viewer`: caixa de texto na fonte do terminal; gaveta por workspace.

## Notas em aberto

—
