---
title: 2026-10-25 — Títulos das abas depois de um reinício do Cockpit
type: execution
work_id: 2026-10-25_restart-tab-titles
scope:
  area: [gateway]
status: done
updated: 2026-10-25
summary: O collect do gateway soma ao casamento por ordem a regra do terminal único e o par visto no nascimento, e só mostra o título quando as fontes concordam.
topic: [bugfix, service]
related:
  - work/tasks/2026-10-25_restart-tab-titles
  - work/plans/2026-10-25_restart-tab-titles
  - "[[services/gateway]]"
  - "[[decisions/2026-10-24_phone-close-tab]]"
  - "[[contracts/cockpit-protocol-v2]]"
---

# Execução — 2026-10-25_restart-tab-titles

> **Log vivo.** Atualizado a cada passo concluído.

## Metadados

- **ID:** `2026-10-25_restart-tab-titles`
- **Tarefa:** [[work/tasks/2026-10-25_restart-tab-titles]]
- **Plano:** [[work/plans/2026-10-25_restart-tab-titles]] (aprovado pelo dono em 2026-10-25, tier `medium`)
- **Status:** `done`
- **Início:** `2026-10-25 09:58`
- **Fim:** `2026-10-25 10:24`
- **Escopo:** área `[gateway]`
- **Branch:** `fix/2026-10-25_restart-tab-titles__gateway`, de `origin/dev` `071da1e`, num worktree próprio.

## Checklist (espelha o plano §4.5)

- [x] Passo 1 — branch, execução aberta, cartão atualizado
- [x] Passo 2 — `folderOf` extraído, sem mudança de comportamento
- [x] Passo 3 — `birthPair` e `agreeTabs` com testes puros
- [x] Passo 4 — nascimento e combinação no `collect`, com testes e os dois ajustes
- [x] Passo 5 — linha do `REVIEW.md`
- [x] Passo 6 — verificação (`npm test`, probe no layout real, nascimento ao vivo com o dono)
- [x] Passo 7 — commits e revisão do agente
- [x] Passo 8 — gate humano
- [x] Passo 9 — `/wiki-sync`, cartão em *Done*, PRs

## Atividade (cronológica)

### `2026-10-25 09:58` — início
- Plano aprovado pelo dono ("aprovado, pode continuar"). Plano em `approved`, tarefa em `in_progress`.
- `git merge-base --is-ancestor origin/dev HEAD` → exit 0; `git log origin/dev..HEAD` → vazio. Branch criada com `git checkout -b fix/2026-10-25_restart-tab-titles__gateway`.
- Cartão k27 atualizado no checkout principal e no worktree (escolha do dono).

### `2026-10-25 10:00` — linha de base
- `npm ci` no worktree (a primeira rodada falhou só por falta de `node_modules`). `npm test` → `ℹ tests 198 · pass 198 · fail 0`.

### `2026-10-25 10:01` — passo 2
- `localTabs` e `folderOf` saem de dentro do `soleTab` (`src/session-info.ts`). `node --test test/session-info.test.ts test/close-tab.test.ts` → `pass 41 · fail 0`.

### `2026-10-25 10:02` — passos 3 e 4
- `birthPair`, `bornTab` e `agreeTabs` (`src/session-info.ts`). Estado `seen`/`candidate`/`born` e `pairTabs` em `createSessionInfo`, opção `birthWindowMs` (15 s). O comentário do topo do arquivo cita as três fontes.
- Falharam só os dois testes previstos no plano. Ajustes:
  - `collected info…` passa a esperar a aba já na primeira olhada;
  - `a fresh look…` usa o novo `fakeMac({ sameFolder: true })`, em que só a ordem responde.
- Testes novos: 3 de `birthPair`, 1 de `agreeTabs` e 5 do `collect` (reinício, nascimento, confirmação derrubada, janela, fim do par).
- Na primeira rodada dos testes novos, falharam dois:
  - uma expectativa errada no teste do `agreeTabs`;
  - o fixture do nascimento com uma aba remota só. Com 3 sessões, as contagens se igualam e o `matchTabs` pareia pela ordem (ver Notas em aberto). Passou a usar duas abas remotas.
- **Mutação das guardas** (cada uma virada no-op, um `node --test` por vez):
  - `confirmation`, `window`, `prune`, `agree`, `unique`, `counts`, `folder` → `fail 1`;
  - `remote` → `fail 3`;
  - `bornTab` antes de gravar o par confirmado → `fail 0`. Redundante: a poda logo depois já tira o par morto. **Removido.**

### `2026-10-25 10:03` — passo 5
- Linha "Título da aba" no `REVIEW.md`.

### `2026-10-25 10:05` — passo 6 (parte 1)
- `npm test` e probe no layout real (ver Validações).

### `2026-10-25 10:10` — passo 6 (parte 2): nascimento ao vivo
- Probe em laço (`k27-collect.ts <worktree> 200 3000`) enquanto o dono abria dois terminais no Mac. Ver Validações.

### `2026-10-25 10:15` — passo 7: commits e revisão
- Três commits (abaixo). `python3 .claude/skills/work-index/generate.py --root .` → `trios=21 active=21`.
- `wiki-lint` apontou `summary-too-long` no plano (256 > 250). Encurtado; nova rodada com exit 0.
- Revisor de contexto limpo, rodada 1, sobre `origin/dev..b0cf8d8 -- src test REVIEW.md`: **Nothing to fix.** Ele rodou o `npm test` (207/207) e seguiu `collect` → `pairTabs` → `agreeTabs`. O (x) não muda e não usa o par do nascimento.

### `2026-10-25 10:22` — passo 8: gate humano
- O dono leu o log e aprovou ("pode continuar"). Push de `fix/2026-10-25_restart-tab-titles__gateway`.

### `2026-10-25 10:24` — passo 9: `/wiki-sync`
- Branch `docs/2026-10-25_restart-tab-titles__wiki`, a partir da branch de código. Páginas abaixo; as citações do `remote_pi` foram conferidas por amostragem (o título restaurado está em `cockpit_viewmodel.dart:6424`, não em `:6425-6428` como o plano dizia).
- Cartão k27 em *Done*; cartão k28 criado para o achado das abas remotas no `matchTabs`.

## Commits

- `3558275` docs(work): open the restart-tab-titles task and plan, move k27 to in progress
- `b0cf8d8` fix(gateway): show tab titles after a Cockpit restart
- este commit: docs(work): log the restart-tab-titles execution and regenerate the work index

## Divergências do plano

- **Nenhuma.**

## Validações

- [x] `npm test` → exit 0
  ```
  ℹ tests 207
  ℹ pass 207
  ℹ fail 0
  ```
- [x] Probe no layout real: `node scratchpad/k27-collect.ts <worktree> 2 3000` (só `pty.list`, `lsof`, `ps` e `list-tabs`)
  ```
  look 1 10:04:50: s1[cockpit-tower]="✳ Tarefa K27 no kanban"  s2[TCC]=null  s4[ATM]="✳ K25 no Kanban"  s8[gtecq]="✳ Pendências FDS em Word"  s25[agent-dev-methodology]="agent-dev-methodology"  s31[TCC]=null  s32[TCC]=null
  look 2 10:04:53: (igual)
  ```
  Como o plano previa: 4 títulos já na primeira olhada, e as três do TCC sem título.
- [x] Nascimento ao vivo: `node scratchpad/k27-collect.ts <worktree> 200 3000`, só as linhas em que algo mudou (títulos encurtados)
  ```
  10:08:41  s1[cockpit-tower]="✳ Tarefa K27…"  … s2/s31/s32[TCC]=null
  10:09:30  s1[cockpit-tower]=null … s33[cockpit-tower]=null
  10:09:33  … s33[cockpit-tower]="cockpit-tower"
  10:10:25  … s33="cockpit-tower"  s34[TCC]=null
  10:10:28  … s34[TCC]="TCC"   (s2, s31, s32 seguem null)
  ```
  - `cockpit list-tabs` depois: as únicas abas novas são `t179` ('cockpit-tower') e `t180` ('TCC').
  - O título apareceu uma olhada depois do nascimento (3 s), e as outras abas do workspace continuaram sem título. Ressalva: a `t177` também se chama 'TCC'; o probe imprime só o título, e a aba `t180` vem da construção (a única aba nova).
  - Efeito previsto: com o segundo terminal no cockpit-tower, o `s1` perdeu o título (o terminal único deixou de valer ali).
- [x] `python3 scripts/ci/check_commit_trailers.py origin/dev` → `ok — 3 new commit(s) in origin/dev..HEAD, no LLM attribution`
- [x] `python3 .claude/skills/wiki-lint/lint.py --root .` → exit 0 (depois de encurtar o resumo do plano)

## Revisão do agente

| Rodada | Intervalo | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `origin/dev..b0cf8d8` (`src`, `test`, `REVIEW.md`) | 0 | 0 | 0 |

### Achados e resultado

| # | Rodada | Tag | `file:line` | Resultado | Promovido para |
|---|---|---|---|---|---|
| — | 1 | — | — | sem achados | — |

## Páginas do wiki afetadas

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — "Contexto das sessões" (três fontes, concordância, par do nascimento) e "Limitações conhecidas".
- `cockpit_tower_wiki/decisions/2026-10-24_phone-close-tab.md` (UPDATE) — nota: o `soleTab` também serve à exibição; o par do nascimento não entra no (x).
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE, se couber) — o título restaurado é o salvo.
- `cockpit_tower_wiki/board.kanban` (UPDATE) — k27 para *Done*.

## Notas em aberto

- **Achado pré-existente (fora do escopo):** o `matchTabs` conta as abas remotas, que não têm PTY local. Uma aba remota mais uma sessão sem aba igualam as contagens, e a ordem pode parear errado, com a aba remota como o único par discordante permitido. Visto num fixture deste trabalho, não no Mac. Proposta: cartão novo, que exclua as abas remotas do `matchTabs`.
