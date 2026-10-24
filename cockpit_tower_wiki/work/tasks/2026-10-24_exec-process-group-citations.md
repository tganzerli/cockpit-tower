---
title: 2026-10-24 — Corrigir as citações do bin/tower na página do grupo de processos
type: task
work_id: 2026-10-24_exec-process-group-citations
scope:
  area: [wiki]
status: done
updated: 2026-10-24
summary: Atualizar as três citações de bin/tower em cross-cutting/cockpit-exec-process-group, que mudaram de linha na fase 1 e deixavam o wiki-lint com um aviso stale.
topic: [wiki]
related:
  - cross-cutting/cockpit-exec-process-group
---

# Corrigir as citações do bin/tower na página do grupo de processos

## Contexto

O `wiki-lint` marcava `cross-cutting/cockpit-exec-process-group.md` como `stale`: o `bin/tower` mudou em 2026-10-23 (fase 1, identidade do Tailscale e `gateway.config`), e a página era de 2026-10-22. A lição continua certa; só as linhas citadas saíram do lugar. O dono pediu a correção num PR pequeno (2026-10-24).

## Critérios de aceite

- [x] As citações apontam para o `DETACH`, a subida do gateway e a do `caffeinate` no `bin/tower` atual.
- [x] O `wiki-lint` não mostra mais o aviso `stale` dessa página.
