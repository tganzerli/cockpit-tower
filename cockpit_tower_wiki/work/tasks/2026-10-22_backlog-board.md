---
title: 2026-10-22 — Quadro de próximas tarefas no wiki
type: task
work_id: 2026-10-22_backlog-board
scope:
  area: [wiki]
status: done
updated: 2026-10-22
summary: Versionar o board.kanban de próximas tarefas dentro do wiki, como ponto de partida para sessões novas.
topic: [tooling]
related:
  - overview
---

# Quadro de próximas tarefas no wiki

## Contexto

Depois da release v0.1.0, o humano pediu um levantamento das próximas tarefas num `board.kanban`
(formato de quadro do Cockpit), com o contexto de partida de cada uma nas notas do cartão, para
facilitar começar tarefas em sessões novas. O quadro foi montado na raiz do repositório, sem
versionar. O humano decidiu levá-lo para o repositório **como conhecimento**, junto do wiki.

## Critérios de aceite

- [x] O quadro fica em `cockpit_tower_wiki/board.kanban`, versionado.
- [x] O `overview.md` e o `_meta/index.md` apontam para ele, para uma sessão nova encontrá-lo.
- [x] O wiki-lint continua passando.
