---
title: 2026-10-22 — Painel do Cockpit para ligar e desligar o Tower
type: task
work_id: 2026-10-22_tower-cockpit-panel
scope:
  area: [tower-cli, panel]
status: done
updated: 2026-10-22
summary: Ligar, desligar e acompanhar o Tower por um painel .panel dentro do Cockpit, sem abrir terminal.
topic: [tooling, ui]
related:
  - flows/tower-on-off
---

# Painel do Cockpit para ligar e desligar o Tower

## Contexto

Hoje o Tower só liga e desliga pelo terminal (`tower on`, `tower off` e `tower status`).
Quero controlá-lo pela interface do Cockpit. O Cockpit abre arquivos `.panel`, que
são páginas HTML com uma ponte `cockpit("exec ...")` para rodar comandos no Mac.
Com isso dá para fazer um painel com estado e botões, sem mexer no código do Cockpit.
O Tower continua sendo um cliente separado ([[decisions/2026-10-22_read-only-client]]).

## Critérios de aceite

- [x] `tower status --json` imprime o estado de forma estruturada: gateway, caffeinate,
      publicação na tailnet, socket do Cockpit e URL. O `tower status` em texto continua igual.
- [x] Um `tower.panel` mostra o estado ao vivo, com atualização periódica.
- [x] O painel tem os botões Ligar e Desligar, que ficam desabilitados enquanto um comando roda.
- [x] Com o Tower ligado, o painel mostra a URL da tailnet com um botão de copiar e um QR code
      para abrir no iPhone.
- [x] Quando algo falha, o painel mostra a mensagem de erro, por exemplo o link de
      consentimento do Tailscale Serve, a porta ocupada ou o Node antigo.
- [x] O gateway iniciado pelo painel continua vivo depois que o `exec` termina e depois que a
      aba do painel é fechada. Isso precisa ser verificado na prática. Se ele cair,
      o `tower on` passa a se desligar do processo que o chamou.
- [x] O `tower on`, o `tower off` e o `tower status` pelo terminal continuam funcionando como hoje.

## Restrições

- Não alterar o Cockpit nem o `cockpit-server`.
- O botão de manter acordado (raio) do Cockpit continua independente do Tower.
- O token só aparece dentro da URL e nunca vai para log nem para console.
