---
title: 2026-10-23 — Comandos pelo celular, fase 2: a PTY no tamanho do celular
type: execution
work_id: 2026-10-23_phone-pty-resize
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-23
summary: Em modo de comando a PTY assume o tamanho do celular; o tower guarda o tamanho do Mac e o devolve uma vez por ciclo, se a PTY ainda estiver no tamanho que ele pôs.
topic: [contract, ui]
related:
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-input-client
  - "[[decisions/2026-10-23_phone-pty-resize]]"
  - "[[decisions/2026-10-23_phone-input-client]]"
  - "[[contracts/cockpit-protocol-v2]]"
  - "[[services/gateway]]"
  - "[[overview]]"
---

# Execution Log — 2026-10-23_phone-pty-resize

> **Live log.** Atualizado a cada passo concluído.

## Metadata

- **ID:** `2026-10-23_phone-pty-resize`
- **Task:** [[work/tasks/2026-10-23_phone-pty-resize]]
- **Plan:** [[work/plans/2026-10-23_phone-pty-resize]]
- **Status:** `done`
- **Start:** `2026-10-23`
- **Finish:** `2026-10-23`
- **Branch:** `feat/2026-10-23_phone-pty-resize__tower` (base `dev` @ `3ad4037`)
- **Scope:** `[gateway, viewer]`
- **Risk tier:** `high`

## Checklist (espelha o plano §4.5)

- [x] (1) Criar a branch e mover o k2 para "Em curso".
- [x] (2) Escrever `decisions/2026-10-23_phone-pty-resize.md` (`status: proposed`).
- [x] (2a) Portão da ADR: o dono aprova; a ADR vira `accepted` e a da fase 1 recebe a nota de refinamento.
- [x] (3) `src/protocol.ts` + `test/protocol.test.ts`.
- [x] (4) `src/cockpit-client.ts`, `test/fake-cockpit-server.ts`, `test/client.test.ts`.
- [x] (5) `src/input.ts`, `src/input-log.ts` e testes.
- [x] (6) `src/server.ts` + `test/server.test.ts`.
- [x] (7) Portão do gateway: `npm test` verde.
- [x] (8) `web/app.js`.
- [x] (9) README, REVIEW.md; grep de "never resiz".
- [x] (10) `npm test`, trailers e wiki-lint à mão.
- [x] (11) Conferência controlada no Mac.
- [x] (12) Revisão pelo `reviewer`, tier `high`.
- [x] (13) Smoke no iPhone pelo dono.
- [ ] (14) Fechar a execução, `/wiki-sync`, quadro (k2, k21).

## Activity (chronological)

### `2026-10-23` — início
- Plano aprovado pelo dono. Branch criada a partir de `dev` @ `3ad4037`.
- Cartão k2 em "Em curso".
- ADR escrita como `proposed`. A nota de refinamento na ADR da fase 1 entra no portão 2a, como na fase 1.

### `2026-10-23` — portão da ADR e código
- Dono aprovou a ADR: nova `accepted`; a da fase 1 ganhou a nota "refinada por", `revisit_when` sem o k2 e a linha em "Revisão prevista".
- Passos 3–6: `resizeMessage` e faixa em `src/protocol.ts`; `CockpitClient.resize`; `ptySize`; tipos `resize`/`restore` no registro; `applySize`/`giveBack`/`sizedBy` em `src/server.ts`; 14 testes novos no servidor, mais os de protocolo, cliente, entrada e registro.
- Um teste travou o `npm test` inteiro: o "stopping the gateway" afirmava a devolução logo depois do `tower.close()`, antes de o fake ler o socket; a falha deixava o fake aberto e o processo não terminava. Isolado com `--test-name-pattern` e `perl -e 'alarm 20'`, corrigido com `waitFor`.
- Passos 8–9: viewer (medição sem teclado, `size`, recusas `busy`/`gone`), README e `REVIEW.md` (linha nova "Caminho de tamanho").

## Commits

- `0ce9058` docs(work): open phone-pty-resize trio, propose the phone-resize ADR, move k2 to in progress
- `a4e19c6` feat(gateway): size the commanded session to the phone and give the Mac its size back
- `5ffc190` feat(viewer): measure the phone's columns and rows and follow the PTY's size in command mode
- `971508c` docs(wiki): regenerate the work and decisions indexes

## Divergences from the plan

- **CSS:** o plano previa `web/style.css` sem mudança; entrou uma linha, `.compose-note.warn`, para o aviso "the Mac changed the size".
- **README:** além do plano, entrou o caso "gateway morto com SIGKILL deixa o Mac no tamanho do celular", que a ADR lista como custo aceito.
- **Conferência controlada (passo 11):** feita com um gateway de teste na porta 7699 e um script, como na fase 1, não com o celular. Ficaram para o smoke no iPhone: travar o telefone, A−/A+, a medida no Safari e o layout do Mac mudando durante o modo (este último coberto por teste com o fake).
- **Passo 2:** a nota de refinamento na ADR da fase 1 é feita no portão 2a, junto com a aceitação da ADR nova, e não na escrita dela.

## Validations

- **Portão do gateway (passo 7) e final (passo 10):** `npm test` → `ℹ tests 108` / `ℹ pass 108` / `ℹ fail 0`.
- **Trailers:** `python3 scripts/ci/check_commit_trailers.py origin/dev` → `ok — 3 new commit(s) in origin/dev..HEAD, no LLM attribution`.
- **Wiki-lint:** primeiro `✗ catalog-drift: 2`; depois de `/work-index` e `/wiki-index decisions`, exit `0`.
- **Conferência controlada no Mac (passo 11)**, Cockpit real, aba descartável `tower-resize-check` (shell pid 98056, `ttys008`, tamanho do Mac `60 143`), gateway de teste na porta 7699, script que liga o modo e manda `resize {cols:45, rows:40}`:
  - em todo ciclo, `size msg: {"type":"size","id":"s7","cols":45,"rows":40,"by":"phone"}` e `during: 40 45`;
  - `command off` → `after off: 60 143`;
  - troca de sessão → `after select: 60 143`;
  - fechar a página → `after close: 60 143`;
  - parar o gateway (SIGTERM) com o modo ligado → `before stop: 40 45`, `after gateway stop: 60 143`;
  - `exit` na aba com o modo ligado → `shell exited`, nenhuma devolução nova e nenhum erro no log do gateway;
  - registro: 4 linhas `resize` e 4 `restore`.
  - Gateway de teste parado e aba fechada no fim.

- **Smoke no iPhone pelo dono (passo 13), 2026-10-23**, depois de `tower off` / `tower on` com esta branch: os 7 itens passaram ("todos os testes passaram"): o Claude Code se redesenha na largura do celular; A−/A+ redimensionam; o teclado não redimensiona; desligar Command devolve o tamanho ao Mac; travar o telefone devolve; mudar a janela do Mac durante o modo mostra o aviso e o Mac fica com o tamanho dele; fora do modo a leitura não muda. Isso confirma no aparelho a medida no Safari e a ordem `pty.list`/`pty.resize` no servidor, que o plano marcava como não verificadas.

## Agent review

Tier `high`, modo profundo, `reviewer` em contexto limpo. Rodada 1: `3ad4037..6d34ddd`. Rodada 2: `6d34ddd..f1a93e0` → 0 Important. Os nits da rodada 2 foram corrigidos de passagem em `e84c962`, sem nova rodada (METHODOLOGY §4.4.1). Depois: `npm test` → `ℹ tests 114` / `ℹ pass 114` / `ℹ fail 0`.

| Rodada | Achado | Tag | Resultado | Promovido para |
|---|---|---|---|---|
| 1 | Lista de sessões tirada antes de um `size` era postada depois e desfazia o tamanho do emulador (`sendSessions` + `web/app.js`) | Important | fixed (`f1a93e0`); teste com `sessionInfo` lento, visto falhar sem a correção | — |
| 1 | `tower.close()` devolvia sem desligar o modo; um resize durante a parada ficava aplicado | Important | fixed (`f1a93e0`): `shared.closing`, `stop()` por espectador, espera limitada a 2,5 s | ADR decisão 4 (parada do gateway) já cobria; o código agora cumpre |
| 1 | Testes não provavam a parada, a ordem do `serial`, a troca da trava, a inatividade nem a lista velha | Important | fixed (`f1a93e0`) | — |
| 1 | `release()` antes de a devolução terminar | Nit | fixed (`f1a93e0`) | — |
| 1 | `summary` da ADR da fase 1 dizia resize proibido | Nit | fixed (`f1a93e0`) | — |
| 1 | Comentário do limite de 2 s contra o padrão de 10 s da lista | Nit | fixed (`f1a93e0`): `SIZE_LIST_MS`, `CLOSE_GIVEBACK_MS` | — |
| 2 | Override da lista guardava só o último anúncio; outra sessão podia sair com tamanho velho | Nit | fixed (`e84c962`): mapa por sessão | — |
| 2 | Teste da parada não exercitava o guarda `shared.closing` | Nit | fixed (`e84c962`): teste de `command on` durante a parada | — |

**Promoção (§5.6):** a classe "falha do teste deixa o fake aberto e trava o `npm test`" apareceu duas vezes nesta execução (passo 6 e o teste da lista velha). Fica registrada aqui; virar regra de teste (try/finally) é candidata a uma tarefa própria.

## Affected wiki pages

- Ver plano §4.7.
