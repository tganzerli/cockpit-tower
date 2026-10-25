---
title: 2026-10-25 — Páginas da wiki marcadas stale
type: execution
work_id: 2026-10-25_wiki-stale-pages
scope:
  area: [wiki]
status: done
updated: 2026-10-25
summary: As cinco páginas stale foram reconferidas contra o código; o overview e as pendências upstream ganham correções, a ADR substituída uma nota de citações históricas e as duas ADRs de 2026-10-23 uma linha de reverificação, aplicadas pelo wiki-sync.
topic: [wiki, knowledge]
related:
  - work/tasks/2026-10-25_wiki-stale-pages
  - work/plans/2026-10-25_wiki-stale-pages
  - "[[overview]]"
  - "[[cross-cutting/upstream-contributions]]"
  - "[[decisions/2026-10-22_read-only-client]]"
  - "[[decisions/2026-10-23_phone-pty-resize]]"
  - "[[decisions/2026-10-23_phone-fullscreen-scroll]]"
---

# Log de execução — 2026-10-25_wiki-stale-pages

## Metadados

- **ID:** `2026-10-25_wiki-stale-pages`
- **Tarefa:** [[work/tasks/2026-10-25_wiki-stale-pages]]
- **Plano:** [[work/plans/2026-10-25_wiki-stale-pages]]
- **Status:** `done`
- **Início:** `2026-10-25 11:37`
- **Fim:** `2026-10-25 11:41`
- **Escopo:** área `[wiki]`
- **Branch:** `docs/2026-10-25_wiki-stale-pages__wiki`, a partir de `origin/dev` `f7d3d19`, num worktree próprio.

## Checklist (espelha o plano §4.5)

- [x] (1) Branch criado no worktree, a partir de `origin/dev`.
- [x] (2) Cartão k29 e contador do quadro (`hoje: k30`).
- [x] (3) Log com as conferências e os textos; revisão `skipped — low`; `work-index`, wiki-lint e trailers.
- [x] (4) Portão humano e `/wiki-sync` pelo dono.
- [ ] (5) PR para `dev` e merge.

## Atividade

### `2026-10-25 11:37` — passos 1 e 2
- Plano aprovado pelo dono, com risco `low`. Branch `docs/2026-10-25_wiki-stale-pages__wiki`, `HEAD` = `origin/dev` = `f7d3d19`.
- Cartão k29 criado em *Em curso*, espelhado no main checkout.

### `2026-10-25 11:40` — passo 3: conferências
As conferências estão no plano (§4.0) e foram refeitas no fio principal antes de entrar aqui:
- `src/close-tab.ts:1-3` diz que a aba fechada é "the one a (+) opened for this session (its pair) or else the only terminal in the session's folder". `:15` lista `'no_tab' | 'working' | 'cockpit_unavailable'`. O `overview.md:36` ainda fala em "o único do workspace".
- `web/app.js:482` (`function newTabButton`), `:499` (`function closeButton`) e `:593` (`function openWorkspace`) conferem. A sugestão de mudar as duas primeiras foi descartada.
- `git show 9d52541:src/server.ts | sed -n 141p` → `wss.handleUpgrade(…)`; `git show 9d52541:src/session-info.ts | sed -n 51p` → `export interface Workspace {`; `git show 9d52541:web/app.js | sed -n 284p` → `}`. Nenhuma das citações da ADR substituída bate com o primeiro commit do repositório.
- `gh pr view 263 -R jacobaraujo7/remote_pi --json state` → `OPEN`; `264` → `OPEN`.

### `2026-10-25 11:41` — passo 4: portão humano e wiki-sync
- O dono aprovou e chamou `/wiki-sync 2026-10-25_wiki-stale-pages`. As cinco páginas receberam os textos de "Páginas da wiki afetadas"; `sync_bookkeeping.py` marcou o plano `executed` e escreveu no `_meta/log.md`.

## Commits

- Ver `git log` do branch `docs/2026-10-25_wiki-stale-pages__wiki`: um commit do trio e um da wiki com o quadro.

## Divergências do plano

- **Linha de reverificação das duas ADRs de 2026-10-23.** O texto do plano listava só o (+), o (x) e a fonte da caixa de texto. Na aplicação, `git log --format='%h %ci' -- src/server.ts web/app.js` mostrou que o `78b22ad` (2026-10-24 09:55, a fonte e a gaveta por workspace) também entrou. A linha passou a citar a gaveta e os quatro commits. O `--since=2026-10-24` não o mostrava por causa do fuso horário.
- **Quadro apagado por engano e reconstruído.** A atualização do progresso do k29 (passo 3) usou uma regex com `re.S` cujo `.*` final foi até o fim do arquivo e apagou a coluna *Done* nas duas cópias do `board.kanban`, a do main checkout e a do worktree. Visto no fechamento, quando a troca do cartão não achou o `## Done`. Correção: as duas cópias foram refeitas a partir do `board.kanban` de `origin/dev`, só com o contador `k30` e o cartão k29 em *Done*. `git diff origin/dev -- cockpit_tower_wiki/board.kanban` mostra só essas duas mudanças, e os 29 cartões de antes continuam lá. Os dois commits do branch, ainda não enviados, foram refeitos sem o quadro quebrado.

## Validações

- [x] Antes: `python3 .claude/skills/wiki-lint/lint.py --root .` → `exit 0`, com `⚠ stale: 5`. A verificação do plano (zerar o `stale`) só fecha depois do `/wiki-sync`, que muda as páginas; registrar lá.

## Revisão do agente

`skipped — low` (só wiki e quadro).

## Páginas da wiki afetadas

Textos do plano §4.3, a aplicar pelo `/wiki-sync`:

- `cockpit_tower_wiki/overview.md` (UPDATE) — linha 36, trocar "um (x) que fecha o terminal depois de uma confirmação, se ele for o único do workspace 📎 [`web/app.js:499`](../web/app.js))" por "um (x) que, depois de uma confirmação, fecha o terminal que o (+) abriu para ela ou o único da pasta da sessão, e nunca com agente trabalhando 📎 [`web/app.js:499`](../web/app.js), [`src/close-tab.ts:1-3`](../src/close-tab.ts))"; `updated: 2026-10-25`.
- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (UPDATE) — "Estado em 2026-10-24" → "Estado em 2026-10-25"; nas Pendências, k11 com "espera o mantenedor", e dois itens novos, k21 (fechar uma aba deixa o shell vivo; causa provável no cartão k21 do quadro; falta abrir a issue) e k5 (id da aba no `pty.sessions`; falta abrir a issue ou o PR); `updated: 2026-10-25`.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — sob o aviso de substituição, a nota "Citações de código (nota de 2026-10-25)" do plano §4.3, com as citações `⚠ unverified`; `updated: 2026-10-25`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE) — no fim de "Revisão prevista", "**Reverificada em 2026-10-25:**" (caminho de tamanho e devolução sem mudança, gatilho não disparado); `updated: 2026-10-25`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md` (UPDATE) — idem, com o caminho da roda (`handleWheel`) e `src/input.ts` sem mudança; `updated: 2026-10-25`.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada do wiki-sync.

## Notas em aberto

- `overview.md` (`code_refs: src/`) e `upstream-contributions.md` (`board.kanban`) voltam a ficar `stale` a cada trio que mexe nesses caminhos. Ficam assim: desta vez o aviso pegou um erro real.
