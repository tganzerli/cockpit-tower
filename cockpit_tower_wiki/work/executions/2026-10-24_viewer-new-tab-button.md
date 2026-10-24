---
title: 2026-10-24 — Execução: botão (+) na faixa de abas do viewer para abrir um terminal novo
type: execution
work_id: 2026-10-24_viewer-new-tab-button
scope:
  area: [gateway, viewer]
status: in_progress
updated: 2026-10-24
summary: Em andamento — botão (+) no viewer que abre, em modo de comando, um terminal no workspace assistido pela CLI do Cockpit.
topic: [contract, ui]
related: []
---

# Execução — 2026-10-24_viewer-new-tab-button

## Metadados

- **ID:** `2026-10-24_viewer-new-tab-button`
- **Tarefa:** [[work/tasks/2026-10-24_viewer-new-tab-button]]
- **Plano:** [[work/plans/2026-10-24_viewer-new-tab-button]]
- **Status:** `in_progress`
- **Início:** `2026-10-24 13:18`
- **Fim:** `—`
- **Escopo:** áreas `[gateway, viewer]`
- **Branch:** `feat/2026-10-24_viewer-new-tab-button__tower`. A branch foi criada como `wip/…` num worktree próprio e renomeada após a aprovação; a base `origin/dev` `b351182` foi conferida.

## Checklist (espelha o plano §4.5)

- [x] 1 — Teste prático da CLI numa aba descartável.
- [x] 2 — ADR nova e ADR de digitação.
- [x] 3 — `src/input-log.ts` + teste.
- [x] 4 — `src/new-tab.ts` + teste.
- [x] 5 — `src/server.ts` + teste.
- [x] 6 — `src/main.ts`.
- [x] 7 — Varredura do `child_process`.
- [x] 8 — `web/app.js` + `web/style.css`.
- [x] 9 — `REVIEW.md`.
- [x] 10 — `npm test`, trailers e wiki-lint.
- [ ] 11 — Teste real no iPhone com o dono.
- [x] 12 — Revisão por agente com contexto limpo (profunda).
- [ ] 13 — Sinalizar o dono.

## Atividade (cronológica)

### `2026-10-24 13:18` — passo 1: teste prático da CLI

- **Antes:**
  - `list-tabs --json`: só uma aba do app inteiro tem `focused: true` (a `t29`, do Condor).
  - `list-workspaces --json`: os worktrees aparecem com `id` `<raiz>::<pasta>`, inclusive este worktree temporário do tower, com `tabs: 0`.
- **Comando:** `env -u COCKPIT_TAB_ID -u COCKPIT_PANE_ID -u COCKPIT_STATUS_SOCK ~/.cockpit/bin/cockpit new-tab --tab-id t16 --cwd /Users/thiagoganzerli/app/gtecq --json`. O `gtecq` não estava selecionado, e a âncora `t16` é a aba dele.
  ```
  {"tabId":"t139"}
  exit=0
  ```
- **Depois:**
  - `list-tabs`: `t139 8e6f4c24 True gtecq`, ou seja, a aba nasceu no workspace gtecq e o Mac trocou para ele (a `t29` passou a `False`);
  - título igual ao nome da pasta.
  - A PTY nova é `zsh` 82275, filha do `cockpit-server` 42994, com cwd `/Users/thiagoganzerli/app/gtecq`. Por isso aparece no `pty.list`.
- **Fechamento:** `cockpit close-tab t139` respondeu `t139 exit=0`. Dois segundos depois, `ps -p 82275` ainda mostrava `Ss+ /bin/zsh`. **O k21 se reproduziu.** O `kill -HUP 82275` foi bloqueado pelo modo automático do Claude Code; o dono o rodou, e `ps -p 82275` confirmou que o processo saiu.
- Confirma §4.0 A: sem as variáveis `COCKPIT_*`, `--tab-id` ancora a aba e troca o workspace; a saída é `{"tabId"}`.

### `2026-10-24` — passos 2–10: ADR, gateway, viewer, `REVIEW.md` e validações

- **Passo 2:** ADR `decisions/2026-10-24_phone-new-tab.md` criada. A ADR de digitação ganhou a terceira nota de refinamento, o `summary` e o `related`.
- **Passo 3:** `src/input-log.ts` ganhou `kind: 'new-tab'` e o campo `folder` (ver divergência), com teste em `test/input-log.test.ts`.
- **Passo 4:** `src/new-tab.ts` (`createNewTab`) e `test/new-tab.test.ts`, com 9 casos e `Runner` falso.
- **Passo 5:** `src/server.ts` ganhou a opção `newTab`, o mapa `folders` (preenchido em `sendSessions` e zerado no `disconnected`), `handleNewTab` e o despacho. Mais 8 casos em `test/server.test.ts`.
- **Passo 6:** `src/main.ts` só cria o `newTab` quando a digitação está ligada.
- **Passo 7:** varredura em `test/protocol.test.ts`: `child_process` só em `src/new-tab.ts` e `src/session-info.ts`.
- **Passo 8:** em `web/app.js`:
  - `newTabButton` no fim de `renderTabs`;
  - `pickNewTab` na mensagem `sessions`;
  - `NEW_TAB_REASONS`;
  - `setCommand` redesenha a faixa;
  - o `onclose` zera o pedido.

  Em `web/style.css`, o `.tab-add`.
- **Passo 9:** o `REVIEW.md` ganhou o contexto, a linha "Terminal novo" e o item em "Always high risk".
- **Passo 10:** validações abaixo. `decisions/_index.md` e `work/_index.md` foram regenerados (`/wiki-index decisions`, `/work-index`).

## Commits

- `67fd368` docs(work): open the viewer-new-tab-button task and plan
- `0d38c6b` docs(adr): let the phone open a terminal through Cockpit's new-tab CLI verb
- `9ff4e81` feat: open a terminal from the phone's tab strip, as Cockpit's (+) does
- docs(work): log the viewer-new-tab-button execution (este registro; o hash muda a cada emenda)

## Divergências do plano

- **Campo do registro:** `folder` em vez de `dir`, porque `InputLogEntry.dir` já existe para a direção da roda (`'up' | 'down'`, `src/input-log.ts:11`). A resposta `new-tab ok:true` também leva `folder`.
- **Ordem dos passos 11 e 12:** a revisão por agente rodou antes do teste no iPhone, porque o teste precisa do dono e do tower ligado a partir desta branch.
- **(+) fixo à direita (pedido do dono no teste do iPhone):** o `.tab-add` ganhou `margin-left: auto` e `position: sticky; right: 0`, com o fundo da faixa e uma borda à esquerda. Fica na borda direita como no Cockpit, e não logo depois da última aba, e continua visível quando a faixa rola.
- **Âncora:** o `focused` do `list-tabs` é global, não por workspace. Na prática, a âncora é a primeira aba do workspace, o fallback que o plano já previa. Para um workspace não selecionado, não há aba focada. O código fica como no plano.

## Validações

- [x] `npm test` → exit 0
  ```
  ℹ tests 149
  ℹ pass 149
  ℹ fail 0
  ```
- [x] `python3 scripts/ci/check_commit_trailers.py origin/dev` → exit 0
  ```
  ok — 4 new commit(s) in origin/dev..HEAD, no LLM attribution
  ```
- [x] `python3 .claude/skills/wiki-lint/lint.py --root .` → nenhuma linha `✗`
  ```
    ✔ stalled: 0
    ✔ yaml-comment: 0
  ```
- [ ] Verificação §4.4 (teste real)

## Revisão por agente

Tier `high`.

| Rodada | Intervalo revisado | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `b351182..b6f9320` (diff do trabalho; antes do fixup) | 0 | 3 | 0 |

Sem `Important`, então não houve rodada 2. Os três Nits foram corrigidos de passagem, num fixup juntado ao commit `feat`, com `npm test` → `ℹ tests 150 · ℹ pass 150 · ℹ fail 0`.

### Achados e resultado

| # | Rodada | Tag | `file:line` | Resultado | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Nit | `web/app.js:1003`: uma recusa `opening` zerava o pedido em andamento | fixed (ignora `opening`) | — |
| 2 | 1 | Nit | `src/server.ts:491`: `void handleNewTab()` sem tratar rejeição do `newTab` | fixed (`.catch` → `failed`, com teste) | — |
| 3 | 1 | Nit | `src/new-tab.ts:34`: workspace sem aba de terminal virava `gone` ("workspace not open") | fixed (motivo `no_anchor`, com texto próprio) | — |

## Páginas do wiki afetadas

Do plano §4.7:
- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — seção "Terminal novo pelo celular", "Peças", "Contexto das sessões" e "Limites".
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — abrir terminal passa pela CLI, não por `pty.open`.
- `cockpit_tower_wiki/overview.md` (UPDATE) — o (+) na linha do viewer e a ADR nova.
- `cockpit_tower_wiki/decisions/_index.md` (UPDATE) — regenerado.

## Notas em aberto

- O k21 continua valendo e também afeta o (+): um terminal aberto pelo celular e fechado no Mac deixa o shell vivo. Não é deste trio.
