---
title: 2026-10-22 — Quadro de próximas tarefas no wiki
type: plan
work_id: 2026-10-22_backlog-board
scope:
  area: [wiki]
status: executed
risk: low
updated: 2026-10-22
summary: Mover o board.kanban para cockpit_tower_wiki/ e apontá-lo no overview e no índice.
topic: [tooling]
related:
  - work/tasks/2026-10-22_backlog-board
  - overview
---

# Plano — Quadro de próximas tarefas no wiki

> Cobre [[work/tasks/2026-10-22_backlog-board]].

## §4.0. Análises pré-plano

analyses: not needed — mover um arquivo e acrescentar dois apontadores; nenhum código muda.

## §4.1. Resumo e entendimento

O `board.kanban` (raiz, não versionado) passa a morar em `cockpit_tower_wiki/board.kanban`, versionado como conhecimento. O `overview.md` ("How to navigate") e o `_meta/index.md` ganham um apontador, para que uma sessão nova, que já lê o overview por regra, encontre o quadro.

## §4.2. Arquivos afetados

- `board.kanban` → `cockpit_tower_wiki/board.kanban` (MOVE) — o quadro, sem mudança de conteúdo.
- `cockpit_tower_wiki/overview.md` (UPDATE) — linha em "How to navigate".
- `cockpit_tower_wiki/_meta/index.md` (UPDATE) — entrada na seção "Overview".

## §4.3. Mudanças e justificativa

```markdown
- Próximas tarefas: `board.kanban` (quadro do Cockpit; cada cartão traz nas notas o contexto para começar a análise).
```

O quadro não vira página `.md`: é um arquivo `.kanban`, que o Cockpit abre como colunas e cartões. Fica fora das regras de frontmatter das páginas.

## §4.4. Riscos e impacto

1. **O quadro desatualizar.** Mitigação: mover o cartão ao abrir e ao fechar uma task faz parte do fechamento.
2. **O wiki-lint tratar o `.kanban` como página.** Mitigação: rodar o wiki-lint; se reclamar, registrar e ajustar antes do commit.

**Risk tier:** `low` — só documentação, nenhum código e nenhum caminho do "Always high risk".

**Verification:** `python3 .claude/skills/wiki-lint/lint.py --root .` com exit 0, e `git status` mostrando o quadro movido.

**Revert:** `git revert` do commit.

## §4.5. Passos de execução

- [x] (1) Criar a branch `docs/2026-10-22_backlog-board__wiki` a partir de `dev`.
- [x] (2) Mover o quadro e acrescentar os dois apontadores.
- [x] (3) Wiki-lint; commit; PR para `dev` e merge.

## §4.6. Escopo

**Área(s) afetada(s):** `[wiki]`

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/overview.md` (UPDATE) — apontador para o quadro.
- `cockpit_tower_wiki/_meta/index.md` (UPDATE) — entrada do quadro.
