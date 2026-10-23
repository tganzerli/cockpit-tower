---
title: 2026-10-23 — Comandos pelo celular, fase 1: digitar na sessão aberta
type: task
work_id: 2026-10-23_phone-terminal-input
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-23
summary: Reabrir o somente leitura com uma ADR nova e deixar o iPhone mandar texto e teclas especiais para a sessão selecionada, com o pty.ack decidido junto.
topic: [contract, ui]
related:
  - decisions/2026-10-22_read-only-client
  - contracts/cockpit-protocol-v2
  - services/gateway
---

# Comandos pelo celular, fase 1: digitar na sessão aberta

## Contexto

O humano quer ler e continuar pelo iPhone a tarefa que um agente está fazendo: mandar texto e teclas (Enter, Esc, Ctrl-C, setas, Tab) para a sessão aberta. É o cartão k1 do quadro (`cockpit_tower_wiki/board.kanban`).

Hoje o tower é somente leitura por decisão ([[decisions/2026-10-22_read-only-client]]). A "Revisão planejada" daquela ADR já prevê reabrir quando o tower aceitar digitação. Este trabalho começa por uma ADR nova que substitui ou emenda aquela, e só depois vem o código. A decisão sobre o `pty.ack` (cartão k4) entra junto.

**Decisões do dono (2026-10-23), que a ADR registra:**
- A página abre em leitura. Um botão "Comandar" mostra a caixa de texto e libera o envio só naquela conexão. Antes disso, o gateway recusa a digitação.
- Reforços de acesso que entram com a escrita:
  - checar o `Origin` do WebSocket;
  - aceitar digitação só do usuário do Tailscale gravado no `tower on`;
  - registro local do que foi enviado.
- O tower continua sem nunca enviar `pty.ack`.
- Só o `pty.input` é liberado. `pty.resize`, `pty.kill`, `pty.open`, `pty.ack` e `rpc` continuam proibidos.
- No celular, uma caixa de texto com barra de teclas especiais, em vez de capturar o teclado do xterm.

## Critérios de aceite

- [x] Uma ADR nova, aprovada pelo dono, define:
  - o que muda nas duas camadas de bloqueio (lista do `encode` e mensagens aceitas do navegador);
  - o acesso e o `pty.ack`.
- [x] A ADR antiga fica marcada como substituída ou emendada.
- [x] Pelo iPhone, depois de tocar em "Comandar", envio texto para a sessão selecionada, além de Enter, Esc, Ctrl-C, setas e Tab. O agente recebe como se fosse no Mac.
- [x] O gateway só envia `pty.input` para a sessão que a própria conexão selecionou, nunca para um id vindo do navegador. Também recusa digitação com o modo de comando desligado, de outra origem ou de outro usuário do Tailscale.
- [x] `pty.resize`, `pty.kill`, `pty.open`, `pty.ack` e `rpc` continuam recusados, com teste.
- [x] Cada envio fica registrado localmente, só legível pelo dono.
- [x] Os testes cobrem o caminho novo e as proibições que continuam. `npm test` passa.
- [x] `REVIEW.md`, `README.md`, o contrato do protocolo, o overview e as páginas do gateway deixam de dizer "somente leitura" onde isso ficar falso.

## Escopo declarado

**Áreas:** `[gateway, viewer]` (mais `bin/tower` para gravar o usuário do Tailscale, se o plano confirmar).

## Fontes relacionadas

### Internas
- [[decisions/2026-10-22_read-only-client]]: a decisão que esta tarefa revê.
- [[contracts/cockpit-protocol-v2]]: o subconjunto do protocolo e os riscos de ser um segundo cliente.
- `REVIEW.md`, "Always high risk": enviar entrada a um terminal é tier `high`.
- Código do Cockpit: `~/app/remote_pi`, commit `7d923ab` (= `upstream/main`).

## Restrições

- Nada de `pty.resize` (fase 2, k2) nem repasse de rolagem (fase 3, k3).
- Não resolver nada mudando a configuração das CLIs.
- O listener continua só em loopback e exposto só por `tailscale serve`.
