---
title: 2026-10-25 — O matchTabs conta as abas remotas
type: task
work_id: 2026-10-25_matchtabs-remote-tabs
scope:
  area: [gateway]
status: in_progress
updated: 2026-10-25
summary: O casamento por ordem de criação (matchTabs) passa a ignorar as abas de workspace remoto (SSH), que não têm PTY local, para que elas não igualem as contagens nem deslizem os pares.
topic: [bugfix, service]
related:
  - services/gateway
  - work/executions/2026-10-25_restart-tab-titles
---

# O `matchTabs` conta as abas remotas

## Contexto

Cartão k28 do `board.kanban`. O casamento por ordem de criação (`matchTabs`, `src/session-info.ts:180`) conta as abas de workspace remoto (SSH, `workspaceId` começando em `__remote__`), que não têm PTY local. Uma aba remota mais uma sessão sem aba (ex.: uma tarefa) igualam as contagens, e a ordem pode parear errado: a aba remota vira o único par discordante permitido, e os outros pares deslizam uma posição.

Achado num fixture de teste do k27 ([[work/executions/2026-10-25_restart-tab-titles]], "Notas em aberto"), não visto no Mac. O `soleTab` e o par do nascimento já excluem as abas remotas (`localTabs`, `src/session-info.ts:229`).

## Critérios de aceite

- [ ] O `matchTabs` ignora as abas com `workspaceId` começando em `__remote__`, tanto nas contagens e na ordem quanto nas pastas usadas para a aba sem pasta.
- [ ] Um teste cobre a aba remota mais a sessão sem aba: antes da correção, a ordem dá a aba de outra sessão; depois, nada é pareado.
- [ ] `npm test` verde.

## Fontes

- [[work/executions/2026-10-25_restart-tab-titles]] — "Notas em aberto".
- [[services/gateway]] — "Casamento aba ↔ sessão".
