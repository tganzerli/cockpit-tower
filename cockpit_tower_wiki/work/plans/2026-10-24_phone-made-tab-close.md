---
title: 2026-10-24 — Fechar pelo celular o terminal que o próprio celular abriu
type: plan
work_id: 2026-10-24_phone-made-tab-close
scope:
  area: [gateway, viewer]
status: executed
risk: high
updated: 2026-10-24
summary: O gateway pareia cada (+) com a única sessão nova que aparece depois do new-tab (sessão, pid, aba, pasta) e o (x) fecha por esse par, com as cercas do k24; sem par, vale o terminal único.
topic: [contract, ui]
related:
  - work/tasks/2026-10-24_phone-made-tab-close
  - decisions/2026-10-24_phone-close-tab
  - decisions/2026-10-24_phone-new-tab
  - services/gateway
---

# Plano — Fechar pelo celular o terminal que o próprio celular abriu

> Modelo do plano: escrito no fio principal (tier de raciocínio alto), com o k24 inteiro no contexto. As linhas do tower são de `origin/dev` `b6aaa8b`; as do `remote_pi`, do commit `177aea97`.

## §4.0. Análises pré-plano

Triagem: **análises não necessárias.** O caminho do (+) e do (x) foi escrito e revisado no k23 e no k24. A única pergunta nova era se o `new-tab` devolve algo além do id da aba, e ela se respondeu numa leitura direta:
- O `new-tab` devolve só `{tabId}` 📎 `remote_pi` `cockpit/lib/app/cockpit/ui/viewmodels/cockpit_cli_handler.dart:286-333`.
- A CLI aceita `cwd`, `split` e `title`. Não há como plantar um marcador no shell 📎 `:291-321`.
- O id da aba nasce de `_nid('t')`. O PTY nasce do `TerminalSession`, sem nenhum id de aba no `pty.list` 📎 `cockpit_viewmodel.dart:4888-4894`, `:5781-5840`.
- No tower:
  - o (+) chama `opts.newTab(folder)` e só devolve a pasta ao viewer 📎 `src/server.ts:418-439`;
  - o `newTab` já recebe o `tabId` 📎 `src/new-tab.ts:35-39`;
  - o (x) resolve pela regra do terminal único 📎 `src/close-tab.ts:32-40`, `src/session-info.ts:235`.

## §4.1. Resumo e entendimento

**Problema.** O (+) abre o terminal novo no workspace da sessão assistida. Com isso, o workspace fica com dois terminais, e o (x) recusa (`no_tab`). O dono não fecha pelo celular o terminal que acabou de abrir pelo celular.

**Solução.** O par sessão → aba de uma aba aberta pelo gateway é provado no momento em que ela nasce:

1. **Antes do `new-tab`:** o gateway lê o `pty.list` (sessões vivas = "antes").
2. **Depois do `new-tab` ok:** o gateway lê de novo a cada 250 ms, por até 5 s, até aparecer alguma sessão viva fora do "antes".
   - Ao aparecer, espera mais uma leitura (assentar) e conta as sessões novas.
   - **Exatamente uma** → grava `{sessão, pid, aba, pasta}` num mapa do gateway inteiro.
   - Nenhuma ou mais de uma → não grava nada.
3. **Um (+) por vez no gateway inteiro**, não só por conexão. Assim, dois viewers nunca veem a sessão um do outro como "a nova".
4. **No (x)** (`resolve`), se a sessão assistida tem par:
   - a sessão viva precisa ter o **mesmo pid**;
   - a aba precisa existir na listagem fresca, ser **terminal**, de workspace **local** e com `workspacePath` igual à pasta gravada.
   - Se tudo bate, essa é a aba, e o resto do caminho do k24 é o mesmo: `working`, título, assinatura, registro antes.
   - Se algo não bate, o par cai e vale o `soleTab`.
5. **Fim do par:** ele sai do mapa quando a sessão some do `pty.list`, quando o (x) fecha a aba, ou quando o gateway reinicia (o mapa vive só na memória). Depois de um reinício do Cockpit, as sessões ganham ids e pids novos, e o pid não bate mais.

**Risco residual.** Um terminal aberto no Mac **no mesmo segundo** que o (+) do celular:
- se as duas sessões aparecerem antes do assentar, são duas novas e não há par;
- se a do Mac nascer e se assentar antes da do celular, o par grava a sessão errada.

A última barreira continua sendo o título da aba na confirmação, como no k24.

## §4.2. Arquivos afetados

| Arquivo | Mudança |
|---|---|
| `src/server.ts` | `Shared` ganha `made` (mapa) e `newTabBusy`; o `handleNewTab` pareia; o `handleCloseTab` passa o par ao `resolve` e o apaga ao fechar; o `sendSessions` poda pares de sessões que sumiram |
| `src/close-tab.ts` | `resolve(sessions, session, made?)`: o par, com as verificações; senão, o `soleTab` |
| `src/session-info.ts` | Nada novo (o `freshTabs` já traz as abas) |
| `web/app.js` | Texto de `no_tab`: "só fecha o terminal único do workspace ou um aberto por aqui" |
| `test/close-tab.test.ts`, `test/server.test.ts` | Testes novos |
| `decisions/2026-10-24_phone-close-tab.md` | Nova seção "Atualização 2026-10-24 (k26)": o par como segunda forma de achar a aba |
| `REVIEW.md` | A linha "Fechar terminal" cita o par |

## §4.3. Mudanças e justificativa

### `src/close-tab.ts`
- `export type MadeTab = { pid: number; tabId: string; folder: string }`.
- `resolve(sessions, session, made?)`:
  - Se há `made` e `live.find(id === session)?.pid === made.pid`, procura em `fresh.tabs` uma aba com `id === made.tabId`, `kind === 'terminal'`, sem o prefixo `__remote__` no workspace e com `workspacePath === made.folder`.
  - Se acha, essa é a aba, com o mesmo `TAB_ID`, `working` e `ids` do k24.
  - Se não, `soleTab`.
- Por quê: o par só muda **qual** aba; tudo o que vem depois de achar a aba fica igual.

### `src/server.ts`
- `Shared`:
  - `made: Map<string, MadeTab>` (sessão → par);
  - `newTabBusy: boolean`.
- `handleNewTab`:
  - recusa `opening` também quando `shared.newTabBusy`;
  - lê o "antes" com `client.list(SIZE_LIST_MS)` antes de rodar o `newTab`. Se essa leitura falhar, o (+) roda mesmo assim, só sem par;
  - depois do ok, roda `pairNewTab(before, tabId, folder)`:
    - lê a cada `opts.pairPollMs ?? 250` ms, por até `opts.pairWaitMs ?? 5000` ms;
    - assenta com mais uma leitura;
    - grava se houver exatamente uma sessão nova.
  - A resposta `new-tab ok` ao viewer **não espera** o par: o par roda em segundo plano, com o `newTabBusy` preso até terminar. Assim, o (+) responde como hoje.
  - O par **não** depende de a conexão continuar aberta.
- `handleCloseTab`: passa `shared.made.get(target)` ao `resolve`; ao fechar com sucesso, `shared.made.delete(target)`.
- `sendSessions`: apaga do `shared.made` as sessões que não estão vivas na lista.
- Opções novas só para teste: `pairPollMs` e `pairWaitMs`.

### `web/app.js`
- `CLOSE_TAB_REASONS.no_tab`: "only the single terminal of a workspace, or one opened from here, closes from the phone; close this one on the Mac".

### ADR `decisions/2026-10-24_phone-close-tab.md`
- Seção "Atualização 2026-10-24 (k26)": a aba pode vir do par de um (+), com as regras do §4.1 e o risco residual.
- A ADR continua `accepted`.
- Por quê: muda como a aba é achada, mas não o verbo nem as cercas. Uma emenda datada basta, sem ADR nova. O plano do k24 pedia ADR para **verbo** novo, e este não é um.

### Testes
- **`close-tab`:**
  - o par acha a aba mesmo com dois terminais no workspace;
  - pid diferente, aba sumida, aba de outro workspace, aba remota ou aba não terminal → cai no `soleTab` (`no_tab`);
  - par com agente trabalhando → `working`.
- **`server`:**
  - (+) com uma sessão nova grava o par, e o (x) fecha em dois passos num workspace com dois terminais;
  - (+) sem sessão nova, ou com duas, não grava par;
  - um segundo (+) durante o par recusa `opening`, mesmo de outro viewer;
  - o par some quando a sessão some;
  - o par some depois de fechar.

### `REVIEW.md`
- Linha "Fechar terminal": "a aba vem do par de um (+) (única sessão nova, mesmo pid) ou do terminal único; nunca de ordem nem de pasta sozinha".

## §4.4. Riscos e impacto

- **Tier: high.** Mexe no (x), que fecha processos, e no (+), dois itens de "Always high risk" do `REVIEW.md`.
- **Riscos:**
  - par errado por corrida com o Mac (ver §4.1; a barreira é o título);
  - par preso de um viewer que fechou (o mapa é do gateway, e a poda vem pelo `sendSessions`);
  - o (+) ficar travado por 5 s quando nenhuma sessão nasce (aceito: um (+) por vez).
- **Verificação:**
  - `npm test`;
  - wiki-lint e trailers;
  - teste real no `--dev`, porta 7699: num workspace temporário com um terminal, abrir um segundo pelo (+) e fechá-lo pelo (x). O primeiro precisa continuar vivo.
- **Reverter:** um `git revert` do commit de código. Sem par, o comportamento volta a ser o do k24.

## §4.5. Passos de execução

1. Branch `feat/2026-10-24_phone-made-tab-close__tower` a partir de `origin/dev`.
2. `src/close-tab.ts` com o par e os testes dele.
3. `src/server.ts` (Shared, (+) com par, (x) com par, poda) e os testes dele.
4. Texto do `no_tab` em `web/app.js`.
5. `npm test`.
6. Teste real (§4.4).
7. Revisão por agente (deep, até 3 rodadas).
8. Portão humano: diff completo e teste no iPhone.
9. `/wiki-sync`: ADR com a emenda, `services/gateway.md`, `REVIEW.md` e o cartão k26 em Done.

## §4.6. Escopo

- **Fora:** casar sessão e aba sem um (+), por exemplo para corrigir os títulos depois de um reinício do Cockpit. O par vale só para abas que o próprio gateway abriu.
- **Fora:** persistir o par em disco.

## §4.7. Impacto no wiki

- `decisions/2026-10-24_phone-close-tab.md`: emenda k26.
- `services/gateway.md`: a seção "Fechar terminal pelo celular" ganha o par.
- `board.kanban`: o k26 vai para Done.
