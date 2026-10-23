---
title: 2026-10-23 — Comandos pelo celular, fase 2: a PTY no tamanho do celular
type: task
work_id: 2026-10-23_phone-pty-resize
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-23
summary: Enquanto o iPhone está em modo de comando, a PTY assume o tamanho do celular e o programa se redesenha nele; ao sair do modo, o tamanho do Mac volta.
topic: [contract, ui]
related:
  - decisions/2026-10-23_phone-input-client
  - contracts/cockpit-protocol-v2
  - services/gateway
---

# Comandos pelo celular, fase 2: a PTY no tamanho do celular

## Contexto

Cartão k2 do quadro. Com a fase 1 ([[work/executions/2026-10-23_phone-terminal-input]]), o iPhone digita na sessão, mas a PTY continua no tamanho do Mac. O programa desenha em 140 colunas e a visão HTML quebra as linhas na largura do celular. As TUIs dos agentes ficam com parágrafos irregulares. O antigo fluxo com tmux (`window-size latest`) resolvia fazendo a janela assumir o tamanho de quem estava comandando.

**O que já se sabe (2026-10-23):**
- **Teste prático.** Um `pty.resize` enviado por um segundo cliente muda o tamanho de verdade (`stty -f /dev/ttys007 size` → `40 45`). O tamanho ficou valendo por 20 s, sem o app reaplicar o dele.
- **Código do app.** O app só manda o tamanho quando a grade dele muda: janela, divisória, painel ou fonte. Ele não reenvia o tamanho por foco nem de tempos em tempos (`flterm terminal_session.dart:460-469`). Só abrir arquivo em aba Neovim também reenvia (`remote_pi cockpit_viewmodel.dart:1469,1537`).
- **Consequência.** O app nunca devolve o tamanho do Mac sozinho. O tower precisa guardar o tamanho original e restaurá-lo.

**Decisões do dono (2026-10-23):**
- A PTY assume o tamanho do celular **junto com o modo de comando**. Tudo que desliga o modo devolve o tamanho do Mac: trocar de sessão, travar o telefone, a sessão terminar, perder o Cockpit ou a página reconectar.
- **Linhas:** a altura da visão sem teclado, calculada ao ligar o modo. Abrir ou fechar o teclado não redimensiona de novo.
- **Decisão escrita:** uma **ADR nova** que refina [[decisions/2026-10-23_phone-input-client]] e libera `pty.resize` só em modo de comando.
- **Achado do teste:** o vazamento do shell ao fechar uma aba vira um cartão upstream (k21).

## Critérios de aceite

- [x] Uma ADR nova, aprovada pelo dono, libera `pty.resize` só em modo de comando, com tamanho limitado e restauração obrigatória. `pty.kill`, `pty.open`, `pty.ack` e `rpc` continuam proibidos.
- [x] Ao ligar o modo de comando, a PTY da sessão assistida assume as colunas e linhas que cabem na visão do celular. O programa se redesenha nesse tamanho.
- [x] Ao desligar o modo, por qualquer gatilho, o gateway devolve o tamanho que a PTY tinha antes. Isso vale também quando a página fecha ou a conexão cai.
- [x] O tamanho vem do navegador, mas o gateway o limita a uma faixa segura e só o aplica à sessão em modo de comando.
- [x] Os testes cobrem o resize, a restauração em cada gatilho e as proibições que continuam. `npm test` passa.
- [x] Teste no iPhone: o Claude Code se redesenha na largura do celular e o Mac volta ao tamanho dele depois.
- [x] Cartão k21 no quadro, para o vazamento do shell ao fechar uma aba. A frase do contrato sobre fechar a aba é corrigida no wiki.

## Escopo declarado

**Áreas:** `[gateway, viewer]`.

## Fontes relacionadas

- [[decisions/2026-10-23_phone-input-client]]: a decisão que esta tarefa refina.
- [[contracts/cockpit-protocol-v2]]: `pty.resize` é global e o servidor não avisa ninguém da mudança.
- Código do Cockpit: `~/app/remote_pi` no commit `7d923ab`, e o flterm no `pubspec.lock` dele.

## Restrições

- Nada de rolagem em tela cheia (fase 3, k3).
- Não mudar a configuração das CLIs.
- Nunca redimensionar uma sessão fora do modo de comando.
