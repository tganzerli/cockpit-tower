---
title: 2026-10-24 — Botão (x) na aba do viewer para fechar o terminal assistido
type: task
work_id: 2026-10-24_viewer-close-tab-button
scope:
  area: [viewer, gateway]
status: in_progress
updated: 2026-10-24
summary: Em modo de comando, um (x) na aba da sessão assistida fecha, depois de confirmar, o terminal e a aba no Cockpit, como o (x) da aba no Mac, recusando quando um agente está trabalhando.
topic: [ui]
related:
  - decisions/2026-10-24_phone-new-tab
  - decisions/2026-10-23_phone-input-client
  - services/gateway
  - contracts/cockpit-protocol-v2
  - work/tasks/2026-10-24_viewer-new-tab-button
---

# Botão (x) na aba do viewer para fechar o terminal assistido

## Contexto

Cartão k24 do `board.kanban`. O dono quer fechar pelo iPhone o terminal que está vendo, com um (x) na aba da faixa, como o (x) da aba no Mac. É o par do (+) da tarefa [[work/tasks/2026-10-24_viewer-new-tab-button]] (k23).

O caminho técnico provável é `cockpit close-tab`, com a mesma estrutura do `new-tab` (`src/new-tab.ts`). A ADR [[decisions/2026-10-24_phone-new-tab]] diz que qualquer outro verbo de escrita da CLI do Cockpit exige uma ADR nova. O `pty.kill` continua proibido.

**É destrutivo:** mata o processo da aba, que pode ser um agente no meio do trabalho. **Achar a aba certa é o ponto delicado:** o casamento sessão ↔ aba é só por ordem de criação (`matchTabs` em `src/session-info.ts`, k5). Fechar a aba errada é bem pior do que abrir na pane errada.

**k21:** o `close-tab` deixa o shell vivo (reproduzido em 2026-10-24, pid 82275, execução [[work/executions/2026-10-24_viewer-new-tab-button]], passo 1). O plano decide se o tower convive com isso ou depende da correção upstream.

**Decisões do dono (2026-10-24):**

- **D1.** Sempre confirmar antes de fechar, numa confirmação dentro da página (não um `alert` do navegador), mostrando qual terminal será fechado.
- **D2.** Só a sessão assistida tem (x); as outras abas da faixa não.
- **D3.** Recusar quando um agente está trabalhando na aba (`tab.working`).
- **D4.** Só em modo de comando, com as mesmas cercas da digitação e do (+).

## Critérios de aceite

- [ ] Em modo de comando, a aba da sessão assistida mostra um (x), no estilo do (x) da aba do Cockpit; fora do modo de comando e nas outras abas, não há (x).
- [ ] Tocar no (x) abre uma confirmação na página com o terminal que será fechado; só a confirmação dispara o fechamento.
- [ ] Confirmado, o terminal e a aba fecham no Cockpit do Mac, e a faixa do viewer deixa de mostrá-la.
- [ ] O gateway só fecha quando consegue provar, com uma listagem fresca do Cockpit, qual aba é a sessão assistida; em qualquer ambiguidade, recusa e a página explica.
- [ ] Com um agente trabalhando na aba, o fechamento é recusado e a página explica.
- [ ] As mesmas garantias da digitação valem (modo de comando, `Origin`, dono do Tailscale, registro local antes de agir); fora delas, recusa.
- [ ] A capacidade nova está registrada numa ADR e em [[services/gateway]] / [[contracts/cockpit-protocol-v2]], incluindo o que acontece com o processo da aba (k21).
- [ ] `npm test` cobre a ação nova do gateway, incluindo cada recusa.

## Escopo declarado

**Área(s) afetada(s):** `[viewer, gateway]`

## Fontes relacionadas

### Externas
- `~/app/remote_pi` — o verbo `close-tab` da CLI e o fechamento da aba no app.

### Internas (já no repo)
- `src/new-tab.ts`, `src/server.ts`, `web/app.js` — o caminho do (+), que este trabalho espelha.
- `src/session-info.ts` — `matchTabs`, o casamento sessão ↔ aba.
- [[decisions/2026-10-24_phone-new-tab]] — a regra de uma ADR por verbo de escrita.

## Restrições / disciplina

- Risco alto: ação destrutiva no Cockpit a partir do celular (`REVIEW.md`, "Always high risk"). Nada de código antes do plano `approved`.
- Não mudar configurações das CLIs nem do Cockpit para fazer funcionar.
- Nunca abrir o Cockpit pelo Bash do Claude para testar; testar só em abas descartáveis criadas para isso.
- `pty.kill` continua proibido.
