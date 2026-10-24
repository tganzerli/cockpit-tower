---
title: 2026-10-23 — Em modo de comando, arrastar o dedo manda a roda do mouse ao agente, com bytes montados no gateway
type: adr
work_id: 2026-10-23_phone-fullscreen-scroll
scope:
  area: [gateway, viewer]
status: accepted
updated: 2026-10-23
summary: A roda do mouse vira entrada nomeada (wheel), só em modo de comando; o gateway monta os bytes por três moldes (SGR, X10, setas), limita quantidade e posição e registra antes de enviar por pty.input, seguindo as regras do app do Mac.
revisit_when: "o app do Cockpit mudar as regras da roda (flterm terminal_input.dart), um agente usar a codificação 1005/1015/1016, ou for pedida a rolagem horizontal"
supersedes: []
superseded_by: ""
sources:
  - https://github.com/jacobaraujo7/remote_pi (commit 7d923ab)
code_refs:
  - src/input.ts
  - src/server.ts
  - web/app.js
related:
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-23_phone-pty-resize
  - services/gateway
  - work/plans/2026-10-23_phone-fullscreen-scroll
---

# 2026-10-23 — Em modo de comando, arrastar o dedo manda a roda do mouse ao agente

## Contexto

Os agentes em tela cheia (Claude Code com `"tui": "fullscreen"`) desenham na tela alternativa: o histórico mora no programa, e o iPhone só vê a tela atual. No Mac, rolar manda a roda do mouse ao programa, que se redesenha. O dono não quer mudar a configuração das CLIs.

O que pesa (plano [[work/plans/2026-10-23_phone-fullscreen-scroll]], §4.0):
- **Sessões reais.** As sessões do Claude Code ligam o mouse com rastreamento completo e codificação SGR (`1000h 1002h 1003h 1006h`). Os shells comuns não ligam mouse.
- **O app do Mac.** Com o mouse ligado, cada linha de rolagem vira o botão 64 (sobe) ou 65 (desce), no formato que o programa pediu. Sem mouse, na tela alternativa com 1007, vira setas. Na tela normal, nada é enviado (`flterm: controller/terminal_input.dart:63-92`).
- **O xterm do viewer** sabe se o mouse está ligado e qual tela está ativa, mas não expõe a codificação nem o 1007. O viewer acompanha esses modos pelo parser dele.

## Decisão

1. **A roda é mais uma entrada nomeada.** Para o Cockpit nada muda: os bytes vão por `pty.input`, montado só por `inputMessage`. Nenhuma mensagem nova para o Cockpit.
2. **Do navegador:** `wheel {dir:'up'|'down', count, mode:'sgr'|'x10'|'arrows', col, row, app}`, numa mensagem própria.
   - O gateway **não confirma** envios aceitos: um arrasto manda até uma mensagem por quadro. Só as recusas voltam: `wheel {ok:false, reason}`.
3. **O viewer escolhe o formato, e o gateway monta os bytes** a partir de três moldes:
   - `sgr`: `ESC[<64;c;rM` ou `ESC[<65;c;rM`;
   - `x10`: `ESC[M` seguido de três bytes crus, com 32 somado ao botão, à coluna e à linha. É recusado se a coluna ou a linha passar de 223;
   - `arrows`: `ESC[A`/`ESC[B`, ou `ESC OA`/`ESC OB` com `app:true`.

   Nenhum outro byte sai por esse caminho.
4. **As regras do Mac:**
   - mouse ligado (1000/1002/1003) → botões 64/65, em SGR se 1006 estiver ligado, senão em X10;
   - codificação 1005/1015/1016, ou DECSET 9 → nada;
   - tela alternativa sem mouse, com 1007 ligado → setas;
   - tela normal sem mouse → nada.

   Quando nada é enviado, o arrasto rola a visão como hoje.
5. **Só em modo de comando, para a sessão assistida.** Um id vindo do navegador é ignorado.
6. **Limites.**
   - A quantidade é um inteiro de 1 a 20 por mensagem. Um valor maior é preso em 20.
   - A coluna e a linha são presas ao tamanho atual da PTY: o da última lista, ou o último anunciado.
   - Tipo errado, direção ou formato desconhecido → `invalid`.
7. **Direção natural do iOS:** dedo para baixo mostra o conteúdo mais antigo (roda para cima). Um evento por altura de linha arrastada.
8. **Registro:** uma linha `wheel` por mensagem (direção, quantidade, formato, célula, bytes), gravada **antes** do envio. Se a gravação falhar, o envio é recusado.

## Alternativas descartadas

| Alternativa | Por que foi descartada | O que a traria de volta |
|---|---|---|
| Bytes montados no navegador | Quebra a regra da fase 1: o navegador nunca escolhe bytes | — |
| O gateway acompanhar os modos no fluxo de saída | Seria um segundo parser de terminal no gateway, com o mesmo limite do replay | O replay passar a trazer o estado dos modos |
| Reaproveitar `input {wheel…}` | A resposta `input` mexe no compositor, e um eco a 60 por segundo seria ruído | — |
| Mudar a configuração das CLIs | Decisão do dono | — |
| Botões ou dois dedos para rolar | Decisão do dono: arrastar um dedo | O gesto se mostrar ruim no uso |
| Mandar SGR sempre que houver mouse | Um programa em X10 leria lixo | — |

## Consequências

- **Positivas:** o histórico dos agentes em tela cheia fica acessível pelo celular, e a aba do Mac rola junto, porque o estado é do programa.
- **Custos aceitos:**
  - **Replay de 4 MiB.** Se o programa ligou o mouse antes dessa janela, o viewer pode errar o formato. No pior caso, alguns caracteres chegam ao agente como texto, sem Enter, e ficam registrados.
  - **Teclado aberto.** O arrasto rola o agente, e o alto da tela só aparece com o teclado fechado.
  - **Sem inércia e sem rolagem horizontal.**
  - **Registro maior.** Até umas 60 linhas por segundo durante o arrasto.
- **Novas restrições:** um formato novo de roda exige mudar esta ADR e os moldes do gateway.

## Como esta decisão é policiada

- Testes com os bytes exatos de cada molde, os limites e as recusas.
- Testes do servidor:
  - recusa fora do modo de comando;
  - alvo sempre a sessão assistida;
  - registro antes do envio;
  - recusa quando o registro falha.
- A varredura do código-fonte continua: `pty.input` só no arquivo do protocolo.
- `REVIEW.md`: o caminho de digitação inclui a roda.

## Revisão prevista

**Gatilho:** o app do Cockpit mudar as regras da roda; um agente usar a codificação 1005/1015/1016; ou for pedida a rolagem horizontal.

**O que a implementação deve ensinar:**
- se o gesto de um dedo é bom no uso;
- se o formato errado depois de um replay aparece na prática;
- se a célula calculada no Safari bate com a do toque.

**O que se espera:** confirmar.

## Decisões que esta abre ou fecha

- **Fecha:** a rolagem do histórico dos agentes em tela cheia (k3), a última fase dos comandos pelo celular.
- **Abre:** nada novo.

## Referências

- Plano: [[work/plans/2026-10-23_phone-fullscreen-scroll]] (§4.0, com as citações).
