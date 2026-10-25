---
title: 2026-10-25 — Títulos das abas depois de um reinício do Cockpit
type: task
work_id: 2026-10-25_restart-tab-titles
scope:
  area: [gateway]
status: done
updated: 2026-10-25
summary: Quando a ordem de criação não vale (depois de um reinício do Cockpit), o viewer volta a mostrar o título da aba pela regra do terminal único e pelo par visto no nascimento de uma aba, sem nunca arriscar o título de outra aba.
topic: [bugfix, service]
related:
  - services/gateway
  - decisions/2026-10-24_phone-close-tab
  - work/executions/2026-10-24_viewer-close-tab-button
---

# Títulos das abas depois de um reinício do Cockpit

## Contexto

Cartão k27 do `board.kanban`. Depois que o Cockpit reinicia, o viewer mostra todas as sessões sem o nome da aba, só com projeto, processo e pasta, até as abas serem recriadas. O `matchTabs` casa sessão e aba pela ordem de criação. No reinício, os ids das abas são restaurados, mas as sessões ganham ids novos, e a ordem deixa de valer ([[work/executions/2026-10-24_viewer-close-tab-button]], D1; [[services/gateway]], "Contexto das sessões").

As análises de 2026-10-25 descartaram os outros sinais:
- o ambiente do shell (`COCKPIT_TAB_ID`) não é legível;
- o Cockpit não expõe o elo aba → sessão;
- a ordem de restauração depende de quando cada workspace é ativado;
- o título restaurado é o salvo, e não o que a PTY nova emitiu.

O conserto de vez continua sendo o k5.

**Abordagem escolhida pelo dono (2026-10-25):**
1. Quando a ordem não casa, usar para a exibição a mesma regra do terminal único do (x) (`soleTab`).
2. Quando o gateway vê surgir, numa mesma olhada, exatamente uma sessão nova e uma aba de terminal nova, com a pasta batendo, guardar o par enquanto o pid durar.

## Critérios de aceite

- [x] Depois de um reinício do Cockpit, cada sessão que é o único shell do único terminal de um workspace mostra o título da aba, já na primeira coleta.
- [x] Um terminal aberto no Mac com o tower ligado mostra o título mesmo num workspace com vários terminais. Isso vale quando ele foi a única sessão nova e a única aba nova entre duas olhadas próximas, e o shell está na pasta da aba.
- [x] Nenhuma fonte mostra título com dúvida:
  - fontes que discordam sobre uma sessão deixam essa sessão sem título;
  - uma aba atribuída a duas sessões não vai para nenhuma;
  - o par do nascimento cai quando o pid muda ou a aba some ou muda de pasta.
- [x] O fechamento pelo (x) não muda: continua usando só o par do (+) e o `soleTab`.
- [x] `npm test` verde, com testes dos ramos que recusam.

## Escopo declarado

**Área(s) afetada(s):** `[gateway]` (`src/session-info.ts`). O viewer não muda: ele já mostra `info.tab` quando existe.

## Fontes relacionadas

### Internas
- `src/session-info.ts` — `matchTabs`, `soleTab`, `createSessionInfo`.
- [[decisions/2026-10-24_phone-close-tab]] — a regra do terminal único e os seus limites.
- [[work/tasks/2026-10-24_phone-made-tab-close]] — o par do (+), modelo do par do nascimento.

## Restrições

- Nada de heurística que possa mostrar o título de outra aba quando os sinais permitem duvidar.
- Só leitura: nenhuma escrita nova no socket nem na CLI do Cockpit.
