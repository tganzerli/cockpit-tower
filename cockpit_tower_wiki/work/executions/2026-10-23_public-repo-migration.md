---
title: 2026-10-23 — Migrar o tower para um repositório público, sem vazar dados pessoais
type: execution
work_id: 2026-10-23_public-repo-migration
scope:
  area: [repo]
status: in_progress
updated: 2026-10-23
summary: Em curso — dev sanitizada (nome do Mac, projetos, caminhos); publicação em tganzerli/cockpit-tower a seguir.
topic: [tooling]
related: []
---

# Execution Log — 2026-10-23_public-repo-migration

## Metadata

- **Task:** [[work/tasks/2026-10-23_public-repo-migration]]
- **Plan:** [[work/plans/2026-10-23_public-repo-migration]]
- **Status:** `in_progress`
- **Branch:** `chore/2026-10-23_public-repo-migration__repo` (base `dev` @ `c2aa4d5`)
- **Risk tier:** `high`

## Checklist (espelha o plano §4.5)

- [x] (1) Branch.
- [x] (2) Trocas aplicadas; `npm test` verde.
- [x] (3) Varredura vazia; commit.
- [x] (4) Portão: o dono lê o diff e a lista de padrões.
- [ ] (5) PR e merge na `dev` do repositório atual.
- [ ] (6) Exportar, commit inicial, varredura de novo.
- [ ] (7) Portão: OK do dono para publicar.
- [ ] (8) Renomear, criar o público, enviar, trocar os remotes.
- [ ] (9) Conferir visibilidade e CI; memória; fechar o trio.

## Activity

### `2026-10-23` — limpeza
- **A varredura do plano estava incompleta.** O `git grep -E` deste Mac não entende `\b`, então nomes curtos de projetos (e as formas em minúsculas) passavam despercebidos. A varredura e as trocas passaram para um script em Python (no scratchpad da sessão, fora do repositório), com `\b` de verdade e sem diferença entre maiúsculas e minúsculas:

  A lista de padrões (nome do Mac na tailnet, nomes de projetos, caminho com o usuário, e-mail pessoal) fica fora do repositório público; a cópia literal está no repositório arquivado.

- **Mapa de trocas:** nome do Mac na tailnet → `<your-mac>.<tailnet>.ts.net`; cada workspace ou projeto do dono → `project-a` a `project-d` (e worktrees → `project-a/wt-feature`, `project-a/mobile`); caminho absoluto com o usuário → `~/`.
- 9 arquivos, 49 linhas.

## Divergences from the plan

- **Mais arquivos que o §4.2:** `test/cockpit-state.test.ts` e `cockpit_tower_wiki/work/executions/2026-10-22_session-identity-cockpit-look.md` também tinham nomes de projetos. A varredura do plano não os pegou pelo problema do `\b`.
- **Links `/pull/N`:** não havia nenhum no conteúdo; nada a trocar.

## Validations

- Varredura depois das trocas: `hits 0`.
- `npm test` → `ℹ tests 114` / `ℹ pass 114` / `ℹ fail 0`.
