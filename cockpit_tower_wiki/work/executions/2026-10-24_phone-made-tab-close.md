---
title: 2026-10-24 — Fechar pelo celular o terminal que o próprio celular abriu
type: execution
work_id: 2026-10-24_phone-made-tab-close
scope:
  area: [gateway, viewer]
status: in_progress
updated: 2026-10-24
summary: O gateway pareia cada (+) com a única sessão nova que aparece depois do new-tab, e o (x) fecha por esse par mesmo num workspace com outros terminais; testado num workspace descartável.
topic: [contract, ui]
related:
  - work/tasks/2026-10-24_phone-made-tab-close
  - work/plans/2026-10-24_phone-made-tab-close
  - "[[services/gateway]]"
  - "[[decisions/2026-10-24_phone-close-tab]]"
---

# Execution Log — 2026-10-24_phone-made-tab-close

## Metadata

- **ID:** `2026-10-24_phone-made-tab-close`
- **Task:** [[work/tasks/2026-10-24_phone-made-tab-close]]
- **Plan:** [[work/plans/2026-10-24_phone-made-tab-close]]
- **Status:** `in_progress`
- **Start:** `2026-10-24`
- **Finish:** —
- **Scope:**
  - Área(s) afetada(s): `[gateway, viewer]`
- **Branch:** `feat/2026-10-24_phone-made-tab-close__tower`, num worktree próprio a partir de `origin/dev` `b6aaa8b`.

## Checklist (espelha o plano §4.5)

- [x] Passo 1 — branch e `npm ci`
- [x] Passo 2 — `src/close-tab.ts` com o par e testes
- [x] Passo 3 — `src/server.ts` (Shared, (+) com par, (x) com par, poda) e testes
- [x] Passo 4 — texto do `no_tab` em `web/app.js`
- [x] Passo 5 — `npm test`
- [x] Passo 6 — teste real
- [x] Passo 7 — revisão do agente (deep)
- [ ] Passo 8 — gate humano
- [ ] Passo 9 — `/wiki-sync`

## Atividade (cronológica)

### `2026-10-24` — início

- O dono aprovou o plano ("pode marcar como aprovado e fechar o anterior").
- "Fechar o anterior": a checagem do k24 no iPhone foi registrada na execução [[work/executions/2026-10-24_viewer-close-tab-button]], no mesmo commit que abriu este trio.

### `2026-10-24` — código

- **`src/close-tab.ts`:**
  - tipo `MadeTab {pid, tabId, folder}`;
  - `madeTab()` valida o par contra a listagem fresca: mesmo pid, aba presente, workspace local, mesma pasta;
  - `resolve(sessions, session, made?)` usa o par e cai no `soleTab` se ele não valer.
- **`src/session-info.ts`:** só exporta o `REMOTE_PREFIX`, que já existia, para o `close-tab.ts` não repetir a constante.
- **`src/server.ts`:**
  - `Shared.made` e `Shared.newTabBusy`;
  - o `handleNewTab` lê o "antes", roda o `newTab` e, se der ok, solta o `pairNewTab` em segundo plano com o `newTabBusy` preso;
  - o `pairNewTab` lê a cada 250 ms, por até 5 s, assenta com uma leitura a mais e grava só uma sessão nova igual nas duas leituras (mesmo id e mesmo pid);
  - o `handleCloseTab` passa `shared.made.get(target)` ao `resolve` e apaga o par ao fechar;
  - o `sendSessions` poda os pares de sessões fora da lista, mas só os gravados antes de a lista começar;
  - a flag `opening` por conexão saiu: o `newTabBusy` do gateway a substitui.
- **`web/app.js`:** texto do `no_tab`.
- **`REVIEW.md`:** a linha "Fechar terminal" ganhou o par.

### `2026-10-24` — teste real

Gateway `--dev` do worktree na porta 7699, com registro temporário. Workspace descartável `tower-e2e`, criado com `cockpit new-workspace` numa pasta do scratchpad, com um terminal (`t170`). Script `scratchpad/k26-e2e.mjs`.

```
tabs before: [ 't170:terminal' ]
new-tab: {"type":"new-tab","ok":true,"folder":"…/scratchpad/tower-e2e-ws"}
tabs after (+): [ 't170:terminal', 't171:terminal' ]
original s26 | made s27
original (x) step 1: {"type":"close-tab","ok":false,"reason":"no_tab"}
made (x) step 1: {"type":"close-tab","stage":"confirm","title":"tower-e2e-ws"}
made (x) step 2: {"type":"close-tab","ok":true,"id":"s27"}
tabs after (x): [ 't170:terminal' ]
```

- Registro: `new-tab` (s26, 21:50:20) e `close-tab` (s27, `t171`, 21:50:23), nessa ordem.
- A aba original continuou, e a sessão original sem par recusou, como antes.
- **Limpeza:**
  - `close-workspace` do `tower-e2e` e pasta removida;
  - `kill -HUP` nos dois shells que ficaram vivos (k21): 51019 e 51699, ambos filhos do `cockpit-server` 42994.

## Commits

- `8ef8004` — docs(work): record the owner's iPhone check of the close-tab button and open the made-tab close work
- `5fd3cbc` — feat(gateway): close from the phone a terminal the phone opened (o código revisado em `7e8c856` e as correções `97d2fe6` e `bb8cd32`, juntos num commit; árvore igual à `bb8cd32`)
- `b7a8f1c` — docs(work): log the made-tab close execution, real check and review

## Divergências do plano

| # | Plano | Feito | Por quê |
|---|---|---|---|
| D1 | §4.3: "o par **não** depende de a conexão continuar aberta" | O `pairNewTab` desiste quando a conexão fecha | O par lê pelo `CockpitClient` da própria conexão, que fecha com ela. Abrir outro cliente só para isso não compensa: o viewer que deu o (+) é o mesmo que vai fechar. Sem par, vale a regra do terminal único |
| D2 | §4.2: `src/session-info.ts` sem mudança | Exporta o `REMOTE_PREFIX` | Evita duplicar a constante no `close-tab.ts` |
| D3 | §4.5 passo 9: `REVIEW.md` no wiki-sync | No commit de código | O revisor lê o `REVIEW.md` do diff; a linha nova é para ele |

## Validações

- `npm test` → `ℹ tests 196 · ℹ pass 196 · ℹ fail 0`, contra 189 antes.
- Testes novos:
  - `close-tab`, 3: o par acha a aba com dois terminais; pid, aba, pasta, remoto ou não terminal caem no `soleTab`; o par com agente trabalhando dá `working`;
  - `server`, 4: uma sessão nova vira par, o par chega aos dois passos e some depois de fechar; nenhuma ou duas sessões novas não fazem par; outro viewer recebe `opening` durante o par; o par some quando a sessão sai da lista, mesmo que volte uma com o mesmo id.
- Teste real: ver Atividade.

## Revisão do agente

Tier `high`: modo deep.

| Rodada | Faixa revisada | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `8ef8004..7e8c856` (código) | 1 | 1 | 0 |
| 2 | `bbfccb0..97d2fe6` (só a correção) | 0 | 2 | 0 |

- **Prova de que o teste novo protege a barreira:** a checagem da leitura de assentar foi trocada por um no-op, e o teste novo falhou (`ℹ pass 87 · ℹ fail 1`). Depois o arquivo foi restaurado.
- **Depois das correções:** `npm test` → `ℹ tests 198 · ℹ pass 198 · ℹ fail 0`.

### Achados e desfecho

| # | Rodada | Tag | `file:line` | Desfecho | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Important | `test/server.test.ts` (teste "no new session, or two") — o ramo da leitura de assentar em `pairNewTab` nunca falhava: as duas sessões nasciam juntas e o código saía antes. Remover a barreira contra corrida com o Mac deixava tudo verde | fixed: teste com uma sessão a mais entre as leituras e com a nossa saindo; teste do viewer que sai durante o par e libera o próximo (+). `before` nulo e a guarda `at < listedAt` da poda ficaram sem teste (precisariam de falha injetada no `pty.list` e de uma corrida de listas) | `REVIEW.md`, linha "Testes de guardas de corrida": achar o teste que falha quando a guarda vira no-op. É a 2ª ocorrência; a 1ª foi em `2026-10-23_phone-pty-resize`, achado 2 (`shared.closing`) |
| 2 | 1 | Nit | `src/server.ts` (`Shared.made`) — o comentário não dizia que a poda depende de um viewer conectado | fixed | — |
| 3 | 2 | Nit | `src/server.ts` `pairNewTab` — a parte do pid na leitura de assentar continua sem teste | nit-ignored: o `FakeCockpitServer` não muda o pid de uma sessão viva, e o Cockpit também não (sessão nova = id novo). Remover só o pid não muda o comportamento real | — |
| 4 | 2 | Nit | `test/server.test.ts` — margem de 30 ms entre as leituras | fixed: leituras a cada 100 ms, mudança em 150 ms | — |

## Páginas do wiki afetadas

—

## Notas abertas

—
