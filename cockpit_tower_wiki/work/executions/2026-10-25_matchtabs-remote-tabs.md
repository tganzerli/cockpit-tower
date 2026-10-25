---
title: 2026-10-25 — O matchTabs conta as abas remotas
type: execution
work_id: 2026-10-25_matchtabs-remote-tabs
scope:
  area: [gateway]
status: done
updated: 2026-10-25
summary: O matchTabs passou a usar só as abas de terminal locais (localTabs), e uma aba remota mais uma tarefa sem aba deixaram de dar a uma sessão o título de outra aba.
topic: [bugfix, service]
related:
  - work/tasks/2026-10-25_matchtabs-remote-tabs
  - work/plans/2026-10-25_matchtabs-remote-tabs
  - services/gateway
---

# Log de execução — 2026-10-25_matchtabs-remote-tabs

## Metadados

- **ID:** `2026-10-25_matchtabs-remote-tabs`
- **Tarefa:** [[work/tasks/2026-10-25_matchtabs-remote-tabs]]
- **Plano:** [[work/plans/2026-10-25_matchtabs-remote-tabs]]
- **Status:** `done`
- **Início:** `2026-10-25 10:40`
- **Fim:** `2026-10-25 11:10`
- **Escopo:** área `[gateway]`
- **Branch:** `fix/2026-10-25_matchtabs-remote-tabs__gateway`, a partir de `origin/dev` `44eeed1`, num worktree próprio.

## Checklist (espelha o plano §4.5)

- [x] (1) Branch criado no worktree, a partir de `origin/dev`.
- [x] (2) Teste novo escrito e visto falhando no código atual.
- [x] (3) `matchTabs` corrigido; `REMOTE_PREFIX`/`localTabs` movidos.
- [x] (4) Fixture `REMOTE` → `IDLE` nos testes de `pairTabs`.
- [x] (5) `npm test`, probe e mutações.
- [x] (6) Commit; revisão do `reviewer`; achados tratados.
- [x] (7) Trailers, wiki-lint e `npm test` à mão; portão humano.

## Atividade

### `2026-10-25 10:40` — passos 1 e 2
- Plano aprovado pelo dono, com risco `medium`. Branch criado com `git checkout -b` no worktree; `HEAD` = `origin/dev` = `44eeed1`.
- Teste `remote tabs never even the counts, …` (`test/session-info.test.ts:92`). No código antigo, `fail 1`, com `actual: { s2: 't2', s3: 't3' }` e `expected: {}`.

### `2026-10-25 10:43` — passos 3 e 4
- `matchTabs` usa `localTabs(tabs)` para as contagens, a ordem e as pastas da aba sem pasta (`src/session-info.ts:191`). `REMOTE_PREFIX` e `localTabs` subiram para antes dele (`:170`, `:173`) sem mudar o corpo. O comentário ganhou a linha do k28.
- Com a correção, 3 testes de `pairTabs` falharam, como o plano previa (§4.0): as duas abas remotas do fixture deixaram de manter as contagens diferentes. O fixture virou `IDLE`, duas abas locais sem pasta que nenhum shell ocupa (`test/session-info.test.ts:442`).

### `2026-10-25 10:45` — passo 5
- Ver Validações.

### `2026-10-25 10:50` — passo 6
- Commits `cd7373c` (tarefa, plano e quadro) e `ed711fe` (fix). Revisor em contexto limpo sobre `cd7373c..ed711fe`: nenhum achado.
- O wiki-lint acusou `catalog-drift` pelo trio novo fora do índice; `generate.py --root .` regenerou `work/_index.md` (`trios=22 active=22`), e o lint voltou a `exit 0`.

### `2026-10-25 11:10` — passo 7: portão humano
- O dono leu o log e o resultado da revisão (tier `medium`) e aprovou. Execução fechada; `/wiki-sync` fica para o dono chamar.

## Commits

- `cd7373c` docs(work): open the matchtabs-remote-tabs task and plan, move k28 to in progress
- `ed711fe` fix(gateway): leave remote tabs out of the creation-order match
- `93a6720` docs(work): log the matchtabs-remote-tabs execution and regenerate the work index

## Divergências do plano

- **Nenhuma.**

## Validações

- [x] Teste novo no código antigo: `node --test test/session-info.test.ts` → `ℹ fail 1`. Só o teste novo falhou, com `actual: { s2: 't2', s3: 't3' }`.
- [x] Suíte completa: `npm test`
  ```
  ℹ tests 208
  ℹ pass 208
  ℹ fail 0
  ```
- [x] Probe do plano §4.0: `node scratchpad/k28-probe.ts` → `{}` (antes: `{ s2: 't2', s3: 't3' }`).
- [x] Mutações, uma por vez, cada uma com `node --test test/session-info.test.ts`, e o arquivo restaurado depois (`cmp` igual):
  - filtro de `localTabs` desfeito no `matchTabs` → `ℹ fail 1`;
  - confirmação do nascimento (`if (c && !fresh.some(…))` → `if (c)`) → `ℹ fail 1`;
  - janela (`seen && now() - seen.at <= birthWindowMs ?` → `seen ?`) → `ℹ fail 1`;
  - poda (`if (!bornTab(…)) born.delete(id)` → no-op) → `ℹ fail 1`.

  Os testes de `pairTabs` continuam pegando as guardas do nascimento depois da troca do fixture.
- [x] Trailers (CI fora do ar): `python3 scripts/ci/check_commit_trailers.py origin/dev` → exit 0
  ```
  ok — 2 new commit(s) in origin/dev..HEAD, no LLM attribution
  ```
- [x] Wiki-lint: `python3 .claude/skills/wiki-lint/lint.py --root .` → exit 0, depois de regenerar o índice (antes: `✗ catalog-drift: 1`).

## Revisão do agente

Tier `medium`: uma passada.

| Rodada | Faixa revisada | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `cd7373c..ed711fe` (diff inteiro do trabalho) | 0 | 0 | 0 |

### Achados e resultado

| # | Rodada | Tag | `file:line` | Resultado | Promovido para |
|---|---|---|---|---|---|
| — | 1 | — | — | sem achados | — |

## Páginas da wiki afetadas

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — "Casamento aba ↔ sessão", item 1: a ordem de criação conta só as abas locais; linhas de `src/session-info.ts` que mudaram.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada do wiki-sync.

## Notas em aberto

—
