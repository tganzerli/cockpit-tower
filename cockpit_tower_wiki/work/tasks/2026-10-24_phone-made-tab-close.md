---
title: 2026-10-24 — Fechar pelo celular o terminal que o próprio celular abriu
type: task
work_id: 2026-10-24_phone-made-tab-close
scope:
  area: [gateway, viewer]
status: open
updated: 2026-10-24
summary: O gateway lembra qual sessão nasceu de cada (+) do celular e deixa o (x) fechar essa aba mesmo quando o workspace tem outros terminais.
topic: [ui]
related:
  - decisions/2026-10-24_phone-close-tab
  - decisions/2026-10-24_phone-new-tab
  - services/gateway
  - work/tasks/2026-10-24_viewer-close-tab-button
  - work/tasks/2026-10-24_viewer-new-tab-button
---

# Fechar pelo celular o terminal que o próprio celular abriu

## Contexto

Cartão k26 do `board.kanban`. No teste do k24 no iPhone (2026-10-24), o dono abriu um terminal pelo (+) e não conseguiu fechá-lo pelo (x). O (+) abre a aba nova no workspace da sessão assistida ([[decisions/2026-10-24_phone-new-tab]]), e então o workspace passa a ter dois terminais. Mas o (x) só fecha o **único** terminal de um workspace ([[decisions/2026-10-24_phone-close-tab]], regra `soleTab`), e por isso responde `no_tab`. No `~/.cockpit-tower/input.log`, os `new-tab` de 21:29 e 21:30 em cockpit-tower não têm `close-tab` depois. Os fechamentos de agent-dev-methodology (`t44`, `t161`), que era terminal único, funcionaram.

A regra é rígida porque o tower não consegue provar qual sessão é qual aba ([[decisions/2026-10-24_phone-close-tab]], Contexto). Para uma aba aberta pelo próprio celular, o gateway sabe mais:
- o `new-tab` devolve o id da aba;
- a sessão que aparece no `pty.list` logo depois é a dela.

**Abordagem aprovada pelo dono (2026-10-24):** o gateway guarda o par sessão → aba de cada (+). O (x) fecha pelo par, mesmo com outros terminais no workspace, e mantém as demais cercas do k24. Sem par, vale a regra do terminal único.

## Critérios de aceite

- [ ] Um terminal aberto pelo (+) do celular fecha pelo (x), com a confirmação mostrando o título dele, mesmo com outros terminais no mesmo workspace.
- [ ] O par só é gravado quando exatamente uma sessão nova aparece depois do `new-tab`. Se aparecer nenhuma ou mais de uma, não há par, e o (x) segue a regra do terminal único.
- [ ] O par vale só enquanto a sessão tem o mesmo pid e a aba ainda existe como terminal local no mesmo workspace. Um reinício do Cockpit ou do gateway desfaz o par.
- [ ] As cercas do k24 continuam:
  - modo de comando;
  - só a sessão assistida;
  - dois passos com a mesma aba e a mesma assinatura;
  - recusa com agente trabalhando;
  - registro antes de rodar.
- [ ] Dois (+) ao mesmo tempo, de viewers diferentes, nunca geram um par trocado.
- [ ] Testes cobrem o par, a queda para a regra do terminal único e as recusas.
- [ ] Teste real: abrir pelo (+) num workspace que já tem um terminal e fechar o novo pelo (x).

## Fontes

- `~/app/remote_pi` `177aea97`: `cockpit/lib/app/cockpit/ui/viewmodels/cockpit_cli_handler.dart:286-333` (o `new-tab` devolve só `{tabId}`).
- [[decisions/2026-10-24_phone-close-tab]], [[decisions/2026-10-24_phone-new-tab]].
