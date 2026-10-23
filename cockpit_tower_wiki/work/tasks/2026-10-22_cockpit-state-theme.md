---
title: 2026-10-22 — Ordem, cores e tema do Cockpit no viewer (parte 3 da tela do iPhone)
type: task
work_id: 2026-10-22_cockpit-state-theme
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-22
summary: Ordenar e colorir os workspaces como na lateral do Cockpit e seguir o tema claro/escuro do Cockpit, com as paletas exatas do código dele.
topic: [ui]
related:
  - work/executions/2026-10-22_session-identity-cockpit-look
  - services/gateway
---

# Ordem, cores e tema do Cockpit no viewer (parte 3 da tela do iPhone)

## Contexto

Ajustes visuais depois da parte 2 ([[work/executions/2026-10-22_session-identity-cockpit-look]]).
O humano quer:
- os workspaces na **mesma ordem** da lateral do Cockpit;
- os **nomes e as cores** que o Cockpit atribui a cada workspace;
- um **modo escuro**.

A parte 2 não achou de onde vinham a ordem e as cores. Lendo o código do Cockpit
(`github.com/jacobaraujo7/remote_pi`, pasta `cockpit/`), o estado fica em JSONs:

- `~/Documents/cockpit/state/projects.json` (a pasta pode ser relocada por `~/.cockpit/storage_root`).
  Cada workspace raiz tem `name`, `path`, `color` (ARGB), `order` e `image`.
- `settings.json` traz `themeMode` (`system`, `light` ou `dark`). O do humano é `system`.
- As cores da interface (`AppColors.light`/`AppColors.dark`) e as paletas do terminal
  (`terminal_theme.dart`) estão no código.

## Critérios de aceite

- [x] Os workspaces aparecem na ordem da lateral do Cockpit, com os worktrees embaixo do workspace raiz.
- [x] *(Acréscimo)* Os worktrees recolhem e expandem como no Cockpit, começando no estado salvo por ele.
- [x] O avatar de cada workspace usa a cor que o Cockpit atribuiu; os nomes são os do Cockpit.
- [x] O viewer segue o `themeMode` do Cockpit: `system` acompanha o tema do iPhone; `light`/`dark` fixam.
- [x] Interface e terminal usam as cores exatas do Cockpit nos dois temas.
- [x] Sem o estado do Cockpit (arquivo ausente ou inválido), o viewer continua funcionando como hoje.
- [x] O viewer continua somente leitura.

## Restrições

- Não alterar o Cockpit nem os arquivos de estado dele (somente leitura).
- Imagem de avatar escolhida no Cockpit fica fora: servir um arquivo de caminho arbitrário exigiria uma rota nova.
