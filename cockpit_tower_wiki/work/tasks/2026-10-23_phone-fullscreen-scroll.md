---
title: 2026-10-23 — Comandos pelo celular, fase 3: rolar o histórico dos agentes em tela cheia
type: task
work_id: 2026-10-23_phone-fullscreen-scroll
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-23
summary: Em modo de comando, arrastar o dedo no terminal rola o histórico dos agentes em tela cheia, mandando a roda do mouse ao programa como o Mac faz.
topic: [contract, ui]
related:
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-23_phone-pty-resize
  - services/gateway
---

# Comandos pelo celular, fase 3: rolar o histórico dos agentes em tela cheia

## Contexto

Cartão k3 do quadro. Os agentes em tela cheia (o Claude Code com `"tui": "fullscreen"`, e provavelmente Codex e Antigravity) desenham na tela alternativa: o histórico não fica no terminal, e o iPhone só vê a tela atual. No Mac, rolar manda a roda do mouse ao programa, que se redesenha. O dono não quer resolver mudando a configuração das CLIs.

**O que já se sabe (2026-10-23):**
- **Sessões reais.** As duas sessões do Claude Code ligaram o rastreamento de mouse completo (DECSET 1000, 1002, 1003) com codificação SGR (1006). Os shells comuns não ligam modo de mouse. Fonte: leitura do replay, só leitura.
- **O app do Cockpit (flterm):**
  - **com o mouse ligado pelo programa,** cada linha de rolagem vira um evento da roda: botão 64 (sobe) ou 65 (desce), no formato que o programa pediu, na célula sob o ponteiro;
  - **um movimento da roda do mouse** gera cerca de 3 eventos;
  - **sem mouse, na tela alternativa,** manda setas (modo 1007, ligado por padrão);
  - **na tela normal,** não manda nada (`flterm: controller/terminal_input.dart:63-92`).
- **O xterm.js do viewer** expõe `term.modes.mouseTrackingMode` e `term.buffer.active.type`, mas não a codificação nem o modo 1007. O viewer precisa acompanhá-los com `term.parser.registerCsiHandler`.

**Decisões do dono (2026-10-23):**
- A rolagem que vai para o agente **só funciona em modo de comando**.
- **Gesto:** arrastar o dedo no terminal. Quando o programa usa mouse ou a tela alternativa, o arrasto vira rolagem do agente, uma linha por altura de linha arrastada. Na tela normal, o arrasto continua rolando a visão como hoje.
- **ADR nova** que refina a de digitação. Continua só `pty.input`, e a roda vira mais um tipo de entrada com bytes montados no gateway.
- **Registro:** uma linha `wheel` por mensagem, com direção e quantidade, gravada antes do envio (falha fechado).

## Critérios de aceite

- [x] Uma ADR nova, aprovada pelo dono, define a roda como entrada: bytes no gateway, formatos aceitos, limites e as regras do app (mouse → botões 64/65; sem mouse na tela alternativa → setas; tela normal → nada).
- [x] Em modo de comando, arrastar o dedo sobre o Claude Code em tela cheia rola o histórico dele no celular, e a aba do Mac rola junto.
- [x] Fora do modo de comando, ou na tela normal, o arrasto rola a visão como hoje, e nada é enviado.
- [x] O gateway só aceita formatos conhecidos, limita a quantidade por mensagem e a posição ao tamanho da PTY, e grava no registro antes de enviar.
- [x] Os testes cobrem os bytes de cada caso e as recusas. `npm test` passa.
- [x] Teste no iPhone, pelo dono, com o Claude Code em tela cheia.

## Escopo declarado

**Áreas:** `[gateway, viewer]`.

## Restrições

- Não mudar a configuração das CLIs.
- Nenhuma mensagem nova para o Cockpit: só `pty.input`.
