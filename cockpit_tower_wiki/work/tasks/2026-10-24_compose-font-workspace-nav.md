---
title: 2026-10-24 — Fonte da caixa de texto e gaveta por workspace no viewer
type: task
work_id: 2026-10-24_compose-font-workspace-nav
scope:
  area: [viewer]
status: in_progress
updated: 2026-10-24
summary: A caixa de texto do modo de comando usa o tamanho de fonte do terminal, e a gaveta navega por workspace (como a lateral do Cockpit), deixando as abas para escolher o terminal.
topic: [ui]
related:
  - services/gateway
  - work/executions/2026-10-22_cockpit-state-theme
---

# Fonte da caixa de texto e gaveta por workspace no viewer

## Contexto

Dois ajustes na página do iPhone, pedidos pelo dono em 2026-10-24:

1. **Fonte da caixa de texto.** O texto digitado na caixa do modo de comando deveria ter o mesmo tamanho do texto do terminal. Hoje a caixa usa 16 px fixos (para o iOS não dar zoom ao focar), enquanto o terminal usa 12 px por padrão, ajustável com A−/A+.
2. **Gaveta por workspace.** O viewer já tem a faixa de abas com os terminais do workspace na tela. Então, na gaveta lateral, o botão de navegação deveria ser o **nome do workspace** (e de cada worktree), e não cada terminal — igual à lateral do Cockpit. O terminal se escolhe pelas abas.

## Critérios de aceite

- [ ] O texto da caixa de texto tem o mesmo tamanho da fonte do terminal e acompanha A−/A+.
- [ ] Focar a caixa de texto no iPhone não dá zoom na página.
- [ ] Na gaveta, tocar no nome de um workspace (ou de um worktree) abre aquele workspace; os terminais dele aparecem na faixa de abas.
- [ ] A gaveta não lista mais um botão por terminal dentro de cada workspace.
- [ ] O workspace na tela fica destacado na gaveta, e o indicador de agente trabalhando aparece na linha do workspace.

## Escopo declarado

**Área(s) afetada(s):** `[viewer]`

## Fontes relacionadas

### Internas
- `web/style.css` — `#compose` com `font: 16px` e a gaveta (`.ws`, `.row`).
- `web/app.js` — `applyFont` e `renderGroups`.
- [[work/executions/2026-10-22_cockpit-state-theme]] — de onde vieram a ordem, as cores e os worktrees da gaveta.
