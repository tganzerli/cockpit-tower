---
title: 2026-10-23 — Migrar o tower para um repositório público, sem vazar dados pessoais
type: execution
work_id: 2026-10-23_public-repo-migration
scope:
  area: [repo]
status: done
updated: 2026-10-23
summary: tganzerli/cockpit-tower publicado a partir de um commit inicial sanitizado; o histórico antigo ficou em tganzerli/cockpit-tower-archive, privado.
topic: [tooling]
related: []
---

# Execution Log — 2026-10-23_public-repo-migration

## Metadata

- **Task:** [[work/tasks/2026-10-23_public-repo-migration]]
- **Plan:** [[work/plans/2026-10-23_public-repo-migration]]
- **Status:** `done`
- **Branch:** `chore/2026-10-23_public-repo-migration__repo` (base `dev` @ `c2aa4d5`)
- **Risk tier:** `high`

## Checklist (espelha o plano §4.5)

- [x] (1) Branch.
- [x] (2) Trocas aplicadas; `npm test` verde.
- [x] (3) Varredura vazia; commit.
- [x] (4) Portão: o dono lê o diff e a lista de padrões.
- [x] (5) PR e merge na `dev` do repositório atual.
- [x] (6) Exportar, commit inicial, varredura de novo.
- [x] (7) Portão: OK do dono para publicar.
- [x] (8) Renomear, criar o público, enviar, trocar os remotes.
- [x] (9) Conferir visibilidade e CI; memória; fechar o trio.

## Activity

### `2026-10-23` — limpeza
- **A varredura do plano estava incompleta.** O `git grep -E` deste Mac não entende `\b`, então nomes curtos de projetos (e as formas em minúsculas) passavam despercebidos. A varredura e as trocas passaram para um script em Python (no scratchpad da sessão, fora do repositório), com `\b` de verdade e sem diferença entre maiúsculas e minúsculas:

  A lista de padrões (nome do Mac na tailnet, nomes de projetos, caminho com o usuário, e-mail pessoal) fica fora do repositório público; a cópia literal está no repositório arquivado.

- **Mapa de trocas:** nome do Mac na tailnet → `<your-mac>.<tailnet>.ts.net`; cada workspace ou projeto do dono → `project-a` a `project-d` (e worktrees → `project-a/wt-feature`, `project-a/mobile`); caminho absoluto com o usuário → `~/`.
- 9 arquivos, 49 linhas.

### `2026-10-23` — publicação
- PR #22 (repositório arquivado) levou a limpeza para a `dev`.
- **Export:** `git archive dev` numa pasta nova, `git init -b main` e commit `Initial public release` como `Thiago Ganzerli <96201486+tganzerli@users.noreply.github.com>`; `dev` aponta para o mesmo commit.
- **A segunda varredura achou o próprio trio:** a tarefa, o plano e esta execução citavam os valores literais (a lista de padrões e o mapa de trocas). Na versão pública, esses trechos descrevem só as categorias; a cópia literal ficou no arquivo.
- **Publicação (com o OK do dono):**
  - `gh repo rename cockpit-tower-archive` → `cockpit-tower-archive PRIVATE`;
  - `gh repo create tganzerli/cockpit-tower --public` → `PUBLIC default=main`, branches `dev` e `main`.
- **Pasta local:**
  - `origin` aponta para o público, e `archive` para o arquivado;
  - `dev` e `main` seguem o público;
  - `user.email` local é o noreply.

  Entre a `dev` antiga e a pública, só os 2 arquivos do trio mudaram, então o tower em execução não foi afetado.
- **CI:** o push inicial não disparou o `methodology-checks.yml`, embora o Actions esteja habilitado (`{"enabled":true}`) e o workflow `active`. Ver o PR deste fechamento.

## Divergences from the plan

- **Mais arquivos que o §4.2:** `test/cockpit-state.test.ts` e `cockpit_tower_wiki/work/executions/2026-10-22_session-identity-cockpit-look.md` também tinham nomes de projetos. A varredura do plano não os pegou pelo problema do `\b`.
- **Links `/pull/N`:** não havia nenhum no conteúdo; nada a trocar.
- **O trio desta tarefa foi sanitizado no export**, e não na `dev` do arquivo; a versão do arquivo mantém a lista literal.

## Validations

- Varredura depois das trocas: `hits 0`.
- `npm test` → `ℹ tests 114` / `ℹ pass 114` / `ℹ fail 0`.
- Varredura sem exceções na árvore exportada: `hits 0`; o token real: 0 arquivos.
- `gh repo view` → `tganzerli/cockpit-tower` `PUBLIC`; `tganzerli/cockpit-tower-archive` `PRIVATE`.
