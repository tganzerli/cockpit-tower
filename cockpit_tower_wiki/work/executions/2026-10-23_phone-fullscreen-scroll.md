---
title: 2026-10-23 — Comandos pelo celular, fase 3: rolar o histórico dos agentes em tela cheia
type: execution
work_id: 2026-10-23_phone-fullscreen-scroll
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-23
summary: Em modo de comando, arrastar o dedo rola o histórico dos agentes em tela cheia, mandando a roda do mouse (ou setas) por pty.input com bytes montados no gateway.
topic: [contract, ui]
related:
  - decisions/2026-10-23_phone-fullscreen-scroll
  - "[[decisions/2026-10-23_phone-fullscreen-scroll]]"
  - "[[decisions/2026-10-23_phone-input-client]]"
  - "[[decisions/2026-10-23_phone-pty-resize]]"
  - "[[services/gateway]]"
  - "[[contracts/cockpit-protocol-v2]]"
  - "[[overview]]"
---

# Execution Log — 2026-10-23_phone-fullscreen-scroll

## Metadata

- **Task:** [[work/tasks/2026-10-23_phone-fullscreen-scroll]]
- **Plan:** [[work/plans/2026-10-23_phone-fullscreen-scroll]]
- **Status:** `done`
- **Branch:** `feat/2026-10-23_phone-fullscreen-scroll__tower` (base `dev` @ `d190054`)
- **Risk tier:** `high`

## Checklist (espelha o plano §4.5)

- [x] (1) Branch; k3 em "Em curso".
- [x] (2) ADR nova escrita como `proposed`.
- [x] (2a) Portão da ADR; notas nas ADRs das fases 1 e 2.
- [x] (3) `src/input.ts`, `src/input-log.ts` e testes.
- [x] (4) `src/server.ts` e testes.
- [x] (5) Portão do gateway.
- [x] (6) `web/app.js`.
- [x] (7) README e REVIEW.md.
- [x] (8) Testes, trailers e wiki-lint à mão.
- [x] (9) Conferência controlada no Mac.
- [x] (10) Revisão pelo `reviewer`.
- [x] (11) Smoke no iPhone.
- [ ] (12) Fechamento, `/wiki-sync`, k3 → Done.

## Activity

### `2026-10-23` — início
- Plano aprovado. ADR escrita como `proposed`; as notas nas ADRs das fases 1 e 2 entram no portão 2a.

### `2026-10-23` — portão da ADR e código
- Dono aprovou a ADR: `accepted`; notas de refinamento na ADR da fase 1 e ajuste do `revisit_when`/"Abre" na da fase 2.
- Passos 3–5: `wheelBytes` e `WHEEL_MAX` em `src/input.ts`; tipo `wheel` no registro; `listed` como `Map` de tamanhos (atualizado pelo `announceSize`), `handleWheel` e a rota `wheel` em `src/server.ts`; 13 testes novos.
- Passos 6–7: viewer (modos de mouse pelo parser, `wheelMode`, `liveRows`/`cellAt`, gesto, recusas); README e `REVIEW.md` (linha do caminho de digitação e rolagem).

## Commits

- `e8b78df` docs(work): open phone-fullscreen-scroll trio, propose the wheel ADR, move k3 to in progress
- `d310d2c` feat(gateway): send the phone's drag to the agent as the Mac's mouse wheel would
- viewer, README e REVIEW.md: feat(viewer): turn a one-finger drag into agent scroll in command mode
- `794b03d` docs(wiki): shorten the scroll plan summary and regenerate the indexes
- `2d8c745` docs(work): log phone-fullscreen-scroll steps 2a-9 and validations
- `4c5a355` fix(viewer): send the drag's last lines after the finger lifts; tests for the wheel bounds

## Divergences from the plan

- **Viewer:** o estado do arrasto (`drag`, `pendingWheel`, `wheelFrame`) foi declarado junto do `commandOn`, e não na seção do gesto, porque o `setCommand` o zera.
- **Wiki-lint:** o `summary` do plano tinha 313 caracteres (limite 250); encurtado.
- **Passo 2:** as notas nas ADRs das fases 1 e 2 entram no portão 2a, como nas fases anteriores.

## Validations

- **Portão do gateway (passo 5) e final (passo 8):** `npm test` → `ℹ tests 128` / `ℹ pass 128` / `ℹ fail 0`.
- **Trailers:** `ok — 3 new commit(s) in origin/dev..HEAD, no LLM attribution`. **Wiki-lint:** exit `0` depois de encurtar o `summary`.
- **Conferência controlada no Mac (passo 9)**, Cockpit real, aba descartável com `stty -icanon -echo; printf '\e[?1049h\e[?1000h\e[?1006h'; cat -v`, gateway de teste na porta 7699 e um script que manda `wheel`:
  - sem modo de comando → `{"type":"wheel","ok":false,"reason":"command_off"}`;
  - a aba mostrou `^[[<64;10;5M^[[<64;10;5M^[[<64;10;5M^[[<65;10;5M^[[M`*%^[[A^[OB`: SGR ×3 para cima, ×1 para baixo, X10, seta CSI e seta em modo de aplicação;
  - formato `urxvt` → `invalid`;
  - registro: 5 linhas `wheel`, uma por mensagem aceita, com `bytes` 33/11/6/3/3;
  - nenhuma resposta para as mensagens aceitas.
  - O gesto do viewer (arrasto, célula sob o dedo) fica para o smoke no iPhone. Gateway parado e aba fechada no fim.

- **Smoke no iPhone pelo dono (passo 11), 2026-10-23**, depois de `tower off` / `tower on` com esta branch: os 6 itens passaram ("os testes passaram"):
  - o Claude Code em tela cheia rola o histórico pelo arrasto, e a aba do Mac rola junto;
  - dedo para baixo mostra o conteúdo mais antigo;
  - fora do modo, o arrasto rola a página sem registro;
  - num shell comum, rola a página;
  - com o teclado aberto, rola o agente;
  - digitação e tamanho seguem iguais.

  Isso confirma no aparelho que o Safari deixa a página segurar o gesto e que a célula sob o dedo serve, dois pontos que o plano marcava como não verificados.

## Agent review

Tier `high`, modo profundo, `reviewer` em contexto limpo. Rodada 1: `d190054..2d8c745`. Rodada 2: `2d8c745..4c5a355` → `Nothing to fix.`; `npm test` → `ℹ tests 130` / `ℹ pass 130` / `ℹ fail 0`.

| Rodada | Achado | Tag | Resultado | Promovido para |
|---|---|---|---|---|
| 1 | (a) nenhum teste de célula limitada por um tamanho vindo da lista do Mac | Important | fixed (`4c5a355`): teste "a Mac-side size change seen in a list re-bounds the wheel cell" | — |
| 1 | (a) corrida "lista iniciada antes do `announceSize`" no `listed` | Important | intentional: usa o mesmo `fresh()` da mensagem `sessions`, coberto pelo teste da lista velha da fase 2 | — |
| 1 | (b) recusa depois de `select` de outra sessão sem teste | Important | fixed (`4c5a355`) | — |
| 1 | (b) recusa `cockpit_unavailable` sem teste | Important | intentional: inalcançável na prática; a queda do Cockpit desliga o modo antes (`disconnected` → `setCommand(null)`), e a roda recebe `command_off` | — |
| 1 | (c) `trackModes`, `wheelMode`, `cellAt` e o lote sem teste automatizado | Important | intentional: risco aceito, coberto pela conferência controlada e pelo smoke; acompanhado pelo cartão k6 (teste automatizado da visão) | k6 |
| 1 | O fim do arrasto se perdia quando o dedo saía antes do quadro seguinte | Nit | fixed (`4c5a355`): `wheelAt` sobrevive ao dedo | — |
| 1 | Nota de refinamento na ADR da fase 1 contradizia a anterior | Nit | fixed (`4c5a355`) | — |

**Promoção (§5.6):** nenhum achado repetido de trabalhos anteriores.

## Affected wiki pages

- Ver plano §4.7.
