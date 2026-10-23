---
title: ADR — O tower é um cliente somente leitura do Cockpit
type: adr
scope:
  area: [gateway]
status: superseded
updated: 2026-10-23
superseded_by: decisions/2026-10-23_phone-input-client
summary: Só hello/list/attach/detach; nunca pty.ack; uma conexão por espectador; acesso por token + header do Tailscale.
revisit_when: o tower passar a aceitar digitação, ou o protocolo do Cockpit trouxer o id da aba nas sessões
sources: []
code_refs:
  - src/protocol.ts
  - src/server.ts
  - web/app.js
  - src/session-info.ts
related:
  - contracts/cockpit-protocol-v2
  - services/gateway
  - work/plans/2026-10-22_read-only-viewer
---

# ADR — O tower é um cliente somente leitura do Cockpit

> **Substituída em 2026-10-23** por [[decisions/2026-10-23_phone-input-client]]: o tower passa a enviar `pty.input`, só com o modo de comando ligado. O corpo abaixo fica como histórico.

## Contexto

O tower se conecta ao `cockpit-server` como um cliente extra, para mostrar terminais no iPhone. O protocolo permite escrever na PTY, matar processos e rodar comandos (ver [[contracts/cockpit-protocol-v2]]). O app também depende de crédito de fluxo e da CLI `cockpit`, e as duas coisas podem ser afetadas por um segundo cliente.

## Decisão

1. **Somente leitura em duas camadas.**
   - Para o Cockpit, só são enviados `hello`, `pty.list`, `pty.attach` e `pty.detach`, com lista branca no `encode` (`src/protocol.ts:7,36`).
   - Do navegador, só são aceitas as mensagens `list`, `select` e `ping`.
2. **Nunca enviar `pty.ack`.** O tower anexa só enquanto uma página assiste, e fecha a página após 10 min sem atividade. Assim ele raramente é o único consumidor de uma sessão.
3. **Uma conexão com o Cockpit por espectador**, aberta e fechada com a página (`src/server.ts:132`).
4. **Acesso** por prefixo secreto `/<token>/` + header `Tailscale-User-Login`, com listener só em `127.0.0.1` e exposição apenas via `tailscale serve`. O `funnel` nunca é usado.

## Alternativas descartadas

- **Enviar `pty.ack` para evitar o travamento:** é uma escrita e reduz o crédito do próprio app.
- **Uma conexão compartilhada com contagem de espectadores:** um segundo espectador não receberia o replay.
- **Só o header do Tailscale:** a revisão mostrou que qualquer processo local do Mac o forja.

## Consequências

- **Risco residual:** se a aba for fechada no Mac enquanto alguém assiste pelo iPhone, uma saída muito grande pode travar aquele shell até a página sair.
- **CLI `cockpit`:** comandos `cockpit …` fora de uma aba podem falhar enquanto uma página do tower está aberta.
- **Quebra de linha só na exibição:** a PTY continua no tamanho do Mac. O xterm do viewer emula nesse tamanho (`web/app.js:282`), e a visão HTML quebra as linhas na largura do iPhone 📎 [`web/app.js:1-5`](../../web/app.js). Por isso, as CLIs em tela cheia (tela alternativa, como os agentes) aparecem só com a tela atual, sem histórico ([[work/executions/2026-10-22_terminal-text-cockpit-style]]).
- **Leituras no Mac:** para mostrar projeto, aba e processo de cada sessão, o gateway roda `/usr/sbin/lsof`, `/bin/ps` e só os verbos de listagem da CLI `cockpit` (`list-tabs`, `list-workspaces`), por `execFile` sem shell e com argumentos fixos 📎 [`src/session-info.ts:51`](../../src/session-info.ts). A CLI também tem verbos de escrita (`send`, `send-key`), que o tower nunca usa ([[services/gateway]]).

## Revisão planejada

Reavaliar quando o tower passar a aceitar digitação, porque aí `pty.input` deixa de ser proibido e a decisão 1 muda. Essa é a próxima fase planejada pelo humano (2026-10-22): comandar os agentes pelo celular. Ela deve incluir o `pty.resize` para o tamanho do celular e o repasse da rolagem, como fazia o antigo fluxo com tmux, para trazer o histórico das CLIs em tela cheia. Reavaliar também se o protocolo do Cockpit passar a trazer o id da aba nas sessões.
