---
title: "2026-10-25 — PRs #263 e #264 mergeados no remote_pi"
type: task
work_id: 2026-10-25_upstream-prs-merged
scope:
  area: [wiki]
status: done
updated: 2026-10-25
summary: "Registrar na wiki, nos trios do soft wrap e do ícone e no quadro que o mantenedor mergeou os PRs #263 e #264 do remote_pi, e repassar o k11 ao dono."
topic: [wiki, knowledge]
related:
  - cross-cutting/upstream-contributions
  - sources/external/2026-10-23_cockpit-code-editor
  - work/tasks/2026-10-23_cockpit-editor-soft-wrap
  - work/tasks/2026-10-23_cockpit-macos-icon-shape
---

# PRs #263 e #264 mergeados no remote_pi

## Contexto

Aviso do dono em 2026-10-25: "as pr no cockpit foram aceitas". Pedido: "pode atualizar a wiki e as tarefas, além do kanban".

Conferido com `gh pr view -R jacobaraujo7/remote_pi`:
- #263 (ícone do macOS) mergeado por `jacobaraujo7` em 2026-10-25 18:51 UTC, merge `6321d5d`; a issue #262 fechou junto.
- #264 (soft wrap) mergeado por `jacobaraujo7` em 2026-10-25 19:02 UTC, merge `8138e03`, com a ponta `177aea97`, o mesmo commit que a página do CodeEditor cita; a issue #261 fechou junto.
- No #264 não há comentário do mantenedor. A oferta do k11 ("happy to send it separately") ficou sem resposta.

Hoje a wiki e o quadro ainda dizem "PR aberto" e "esperando o merge".

## Critérios de aceite

- [x] `cross-cutting/upstream-contributions.md`: os dois PRs como mergeados, com data e commit; pendência do k11 atualizada.
- [x] `sources/external/2026-10-23_cockpit-code-editor.md`: nota datada de que o código citado entrou no upstream, sem reescrever o aviso de ponto no tempo.
- [x] Trios `2026-10-23_cockpit-editor-soft-wrap` e `2026-10-23_cockpit-macos-icon-shape`: desfecho registrado na tarefa e na execução; o resumo da execução do ícone deixa de dizer "esperando o OK do dono no Dock".
- [x] Quadro: k10 e k20 mergeados; k11 passa a esperar o dono; cartão novo desta tarefa em Done.
- [x] `wiki-lint`, `work-index --check` e trailers com `exit 0`.

## Fontes

- `gh pr view 263|264 -R jacobaraujo7/remote_pi --json state,mergedAt,mergeCommit,headRefOid,comments`.
- `gh issue view 261|262 -R jacobaraujo7/remote_pi --json state,closedAt`.
