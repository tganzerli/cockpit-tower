---
title: 2026-10-24 — Botão (x) na aba do viewer para fechar o terminal assistido
type: plan
work_id: 2026-10-24_viewer-close-tab-button
scope:
  area: [gateway, viewer]
status: executed
risk: high
updated: 2026-10-24
summary: ADR nova libera fechar, em modo de comando e em dois passos (preparar e confirmar), a aba da sessão assistida pela CLI do Cockpit (`close-tab`), com aba achada numa listagem fresca, recusa de agente trabalhando e registro antes.
topic: [contract, ui]
related:
  - work/tasks/2026-10-24_viewer-close-tab-button
  - decisions/2026-10-24_phone-new-tab
  - decisions/2026-10-23_phone-input-client
  - contracts/cockpit-protocol-v2
  - services/gateway
---

# Plano — Botão (x) na aba do viewer para fechar o terminal assistido

> Modelo do plano: escrito no fio principal (tier de raciocínio alto), porque as duas análises e as decisões do dono já estavam no contexto. Linhas citadas do tower são do worktree em `origin/dev` `91f8dc7`; as do `remote_pi`, do commit `177aea97`.

## §4.0. Análises pré-plano

Triagem: **análises necessárias**. A ação é destrutiva, o casamento sessão ↔ aba é incerto e o comportamento do `close-tab` upstream era desconhecido. Duas análises independentes, em paralelo (`analyst`), com as citações conferidas no fio principal.

### A. O `cockpit close-tab` e o k21 (`~/app/remote_pi/cockpit`)

- **Sintaxe:** `cockpit close-tab [<label|tab-id>] [--json]`. O alvo é **posicional**; sem alvo, fecha a aba do próprio chamador (`$COCKPIT_TAB_ID`) 📎 `cli/src/commands.rs:209-215`, `:217-230`. Com `--json`, imprime `{"tabId":"tNN"}` e sai com 0; em erro, sai com 1 📎 `commands.rs:232-243`.
  - **Consequência:** um alvo vazio fecharia a aba onde o gateway roda, se ele foi iniciado de um terminal do Cockpit. O id precisa ser validado e não vazio.
- **Resolução do alvo:** primeiro o id exato, depois o rótulo (`label`) sem diferenciar maiúsculas 📎 `lib/app/cockpit/ui/viewmodels/cockpit_cli_handler.dart:340-349` (`_resolvePaneTarget`). Um id que sumiu entre a checagem e o comando poderia casar um rótulo igual. Ids são `tNN` e rótulos são escolhidos à mão, então o risco é residual; fica registrado.
- **Sem confirmação:** o app só recusa Neovim com buffers modificados. Se a aba é de outro workspace, o app o traz para frente (`selectProject`) e fecha a aba **depois** de responder 📎 `cockpit_cli_handler.dart:360-392`. O (x) do Mac também não confirma nada (análise A, `tab_actions.dart:18-64`, ⚠ não conferido no fio principal; não muda o plano).
- **k21, a causa:** fechar a aba chama `pty_kill`, que manda **SIGTERM** ao grupo e para aí 📎 `plugins/cockpit_pty/src/cockpit_pty_unix.c:269-282`. O zsh interativo ignora SIGTERM. Nada fecha o master da PTY (sem SIGHUP), e o shell fica órfão, filho do `cockpit-server`. O comentário em `:264-268` diz que o Dart não usa esse caminho, mas isso já não vale (análise A: `native_terminal_service.dart:303-320`, ⚠ não conferido). A sessão sai do `pty.list` (cartão k21). **Decisão do dono: o tower convive com isso e documenta.** A correção fica no k21, upstream.
- **`list-tabs --json`:** traz `id, kind, title, label, workspaceId, workspacePath, working, focused`. **Não traz** pid nem id da sessão do servidor. O `COCKPIT_TAB_ID` está no ambiente do shell 📎 `lib/app/cockpit/ui/viewmodels/cockpit_viewmodel.dart:5853`, mas **o macOS não mostra o ambiente de outro processo**. Testado em 2026-10-24 com `ps -wwE` nos filhos do `cockpit-server` (pids 43110, 46509, 28976), dentro e fora do sandbox: ambiente invisível. Confirma o k5. Não há casamento exato possível sem mudança upstream.
- **`working`** vem de eventos dos hooks do harness, sem intervalo de leitura. Pode ficar preso se o harness morrer sem `Stop` (análise A, `terminal_session.dart:242`, ⚠ não conferido).

### B. O tower hoje

- **Casamento:** `matchTabs` ordena sessões e abas pelo número do id e pareia por índice. Exige contagens iguais, ids numéricos e `stable` (os mesmos ids na leitura anterior). Confere a pasta de cada par e **tolera um par fora** (o descarta) 📎 `src/session-info.ts:169-194`. A única chamada fica dentro de `collect`, com `lastIds` compartilhado por todos os espectadores 📎 `src/session-info.ts:250`, `:265-268`.
  - **Ponto cego:** duas abas do mesmo workspace têm a mesma pasta. Uma troca entre elas "cabe", e só a ordem de criação a impede. Uma PTY recriada dentro de uma aba antiga quebraria a ordem sem ser vista. É o risco residual aceito pelo dono, mitigado pelo título na confirmação.
- **O id da aba não sai do gateway:** o navegador recebe `tab: {title, working, focused}` 📎 `src/session-info.ts:32`, `:279`.
- **O (+) como molde:** `handleNewTab` (cercas, `opening`, registro antes, `sendSessions` depois) 📎 `src/server.ts:402-422`; dispatch 📎 `src/server.ts:490`; `createNewTab` 📎 `src/new-tab.ts:21-43`; botão e motivos no viewer 📎 `web/app.js:469-488`, `:734-742`, `:1004-1008`; estilo 📎 `web/style.css:200-214`.
- **Varredura:** só `src/new-tab.ts` e `src/session-info.ts` podem importar `node:child_process` 📎 `test/protocol.test.ts:55-67`. O literal `pty.kill` é proibido fora de `protocol.ts` 📎 `test/protocol.test.ts:44`. Comentários e docs em `src/` e `web/` não podem citá-lo.
- **Sessão que some:** o servidor manda `exited` e desliga o modo de comando 📎 `src/server.ts:294-297`, mas `watching` continua no id morto. O viewer só mostra uma faixa e **não escolhe outra sessão** 📎 `web/app.js:989-990`, `:958-986`. Depois de fechar, o viewer precisa escolher a vizinha por conta própria, como o `pickNewTab` faz.
- **Regras:** "Qualquer outro verbo de escrita da CLI do Cockpit exige uma ADR" 📎 `cockpit_tower_wiki/decisions/2026-10-24_phone-new-tab.md:76`. `REVIEW.md`, linha "Terminal novo" e "Always high risk" 📎 `REVIEW.md:24`, `:34`.

## §4.1. Resumo e entendimento

O dono quer fechar pelo iPhone o terminal que está vendo, como faz no Mac pelo (x) da aba (k24). Fechar mata o processo da aba, e o tower só identifica a aba de uma sessão pela ordem de criação. O objetivo real, portanto, é **fechar a aba certa ou não fechar nenhuma**: o tower só fecha quando prova qual é a aba, e mostra ao dono o que vai fechar antes de agir.

Decisões do dono (tarefa, D1–D4, e triagem):

- confirmação na página, sempre;
- só a sessão assistida;
- recusa com agente trabalhando;
- só em modo de comando;
- casamento **endurecido**, com o título da aba vindo do Cockpit na confirmação;
- o shell órfão do k21 é aceito e documentado.

Desenho em **dois passos no gateway**:

1. **Preparar** (`{type:'close-tab'}`, tocar no x). O gateway lista de novo (`pty.list`, `lsof`, `list-tabs`, `list-workspaces`) e exige um casamento **completo**: todos os pares cabem, sem par descartado. Acha a aba da sessão assistida e recusa se ela é remota, se tem agente trabalhando ou se o id é inválido. Guarda `{sessão, aba, assinatura dos ids}` e devolve o título da aba do Cockpit para a confirmação.
2. **Confirmar** (`{type:'close-tab', confirm:true}`, botão da confirmação). As mesmas cercas valem de novo. O pedido preparado precisa existir, ser da sessão assistida e ter menos de 30 s. Uma nova leitura completa precisa dar **a mesma aba e a mesma assinatura de ids**: são duas leituras seguidas iguais. Se o agente começou a trabalhar entre os passos, recusa. Então grava o registro e roda `cockpit close-tab <id> --json`, conferindo o id devolvido. Depois desliga o modo de comando, solta a sessão e reenvia a lista. O viewer escolhe a aba vizinha.

O navegador nunca manda id, pasta ou título: tudo vem das listagens do Cockpit, como no (+).

## §4.2. Arquivos afetados

**Novos:**
- `cockpit_tower_wiki/decisions/2026-10-24_phone-close-tab.md` — ADR da capacidade nova.
- `src/close-tab.ts` — resolver a aba (preparar/confirmar) e rodar `close-tab`.
- `test/close-tab.test.ts`.

**Modificados:**
- `src/session-info.ts` — `freshTabs`, um casamento completo e fresco para uma ação, fora do cache compartilhado.
- `src/server.ts` — opção `closeTab`, `handleCloseTab` (preparar/confirmar), dispatch.
- `src/main.ts` — cria `closeTab` só com `input`.
- `src/input-log.ts` — `kind: 'close-tab'`, campos `tab` e `title`.
- `web/app.js` — (x) na aba ativa em modo de comando, confirmação na página, motivos, seleção da vizinha.
- `web/index.html` — `<dialog>` da confirmação.
- `web/style.css` — estilo do (x) e da confirmação.
- `test/server.test.ts`, `test/protocol.test.ts` (varredura com três arquivos), `test/input-log.test.ts`, `test/session-info.test.ts`.
- `REVIEW.md` — linha "Fechar terminal" e item em "Always high risk".
- `cockpit_tower_wiki/decisions/2026-10-24_phone-new-tab.md` — uma linha "Refinada por" apontando a ADR nova (a regra "outro verbo exige ADR" é cumprida, e a lista de arquivos com `child_process` passa a três).

**Regras afetadas:** nenhuma regra em `.agents/rules/` descreve esse comportamento. O que muda é o `REVIEW.md` (acima).

**ADRs afetadas:**
- `decisions/2026-10-24_phone-new-tab` — **refinada**: segundo verbo de escrita; `child_process` também em `src/close-tab.ts`.
- `decisions/2026-10-23_phone-input-client` — **confirmada**: as cercas são as mesmas, e `pty.kill` continua proibido.

## §4.3. Mudanças e justificativa

### ADR nova — `decisions/2026-10-24_phone-close-tab.md`

Mesmo molde da ADR do (+): contexto (§4.0), decisão, alternativas, consequências, policiamento, `revisit_when`.

**Decisão:**

1. Segundo verbo de escrita da CLI: `close-tab`, só por `src/close-tab.ts`, só com alvo posicional validado por `^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$` (nunca vazio, nunca uma flag). `pty.kill` continua proibido.
2. **Dois passos:** preparar e confirmar, com o pedido preparado guardado no gateway por no máximo 30 s. O navegador não manda id, pasta nem título.
3. **Só a sessão assistida** (`watching`), só com o modo de comando ligado para ela. As mesmas cercas da digitação valem: `Origin`, dono do Tailscale, falha fechada sem `input`.
4. **Casamento completo e fresco** em cada passo: contagens iguais, ids numéricos, todo par cabe (nenhum descartado). A aba e a assinatura dos ids precisam ser iguais nos dois passos.
5. **Recusas:**
   - `working` (agente trabalhando);
   - `remote`;
   - `no_tab` (sem casamento completo);
   - `changed` (algo mudou entre os passos);
   - `expired`;
   - `closing` (já fechando);
   - `log_failed`;
   - `failed`.
6. **Registro** `close-tab` (login, sessão, aba, título), gravado antes de rodar.
7. **Efeitos aceitos:**
   - o Mac pode trocar de workspace (o app traz o da aba para frente);
   - o shell fica órfão até um SIGHUP (k21, upstream);
   - fechar a última aba do workspace deixa uma aba vazia no Mac (comportamento do app).
8. **Risco residual aceito:** a ordem de criação pode enganar se uma PTY foi recriada numa aba antiga do mesmo workspace. A mitigação é o título da aba do Cockpit na confirmação.

- **`revisit_when`:** o Cockpit expor o id da aba no `pty.sessions` (k5), ou o `list-tabs` trazer o pid. O casamento fica exato e o endurecimento pode cair.
- **Alternativas descartadas:**

  | Alternativa | Por que foi descartada |
  |---|---|
  | `pty.kill` | Proibido; não fecha a aba no app |
  | Fechar qualquer aba da faixa | D2 |
  | Só quando é a única aba do workspace | Decisão do dono: restritivo demais |
  | Esperar o k5 | Decisão do dono |
  | Matar o shell órfão pelo tower | Decisão do dono: seria um segundo caminho de "matar processo" |
  | `alert()`/`confirm()` do navegador | D1 pede confirmação na página, e diálogos do navegador travam a automação de teste |

### `src/session-info.ts`

Exporta um casamento fresco para uma ação, sem mexer no `lastIds` compartilhado (a ação faz a própria checagem de estabilidade, entre os dois passos):

```ts
/** A one-off session ↔ tab match for an action, outside the viewers' shared cache. `complete` = every session
 *  got its tab (no pair left out), the only state an action may act on. `ids` fingerprints both id lists. */
export async function freshTabs(sessions: Session[], opts: { cockpitBin: string; run?: Runner }): Promise<{
  tabs: Map<string, Tab>; complete: boolean; ids: string; workspaces: Workspace[];
} | null> {
  const run = opts.run ?? execRunner;
  const pids = sessions.map((s) => s.pid).filter(isPid);
  const [lsof, cockpit] = await Promise.all([
    pids.length ? run(LSOF, ['-a', '-d', 'cwd', '-Fpn', '-p', pids.join(',')]) : Promise.resolve({ ok: true, stdout: '' }),
    cockpitList(opts.cockpitBin, run),
  ]);
  if (!cockpit) return null;
  const cwds = parseLsofCwd(lsof.stdout);
  const tabs = matchTabs(sessions.map((s) => ({ id: s.id, cwd: isPid(s.pid) ? cwds.get(s.pid) ?? null : null })), cockpit.tabs, true);
  const ids = `${sessions.map((s) => s.id).sort().join(',')}|${cockpit.tabs.map((t) => t.id).sort().join(',')}`;
  return { tabs, complete: sessions.length > 0 && tabs.size === sessions.length, ids, workspaces: cockpit.workspaces };
}
```

Ficando aqui, a leitura (`lsof`, listagem) continua no arquivo de leitura. O `close-tab.ts` só roda o verbo de escrita.

### `src/close-tab.ts` (novo)

```ts
// Closes the watched session's Cockpit tab for the phone (ADR 2026-10-24_phone-close-tab): the gateway's second
// CLI write. The tab is found in a complete, fresh match, twice, and its id never comes from the browser.
import { execFile } from 'node:child_process';
import { freshTabs } from './session-info.ts';
import type { Runner } from './session-info.ts';
import type { Session } from './protocol.ts';

export type CloseTarget = { tabId: string; title: string; ids: string };
export type Refusal = 'no_tab' | 'working' | 'remote' | 'cockpit_unavailable' | 'failed';
export interface CloseTab {
  /** Step 1: which tab the watched session is, or why it cannot be closed. */
  resolve(sessions: Session[], session: string): Promise<{ ok: true; target: CloseTarget } | { ok: false; reason: Refusal }>;
  /** Step 2: runs `close-tab` on an id that a second resolve just confirmed. */
  close(tabId: string): Promise<{ ok: true } | { ok: false; reason: 'failed' }>;
}

const REMOTE_PREFIX = '__remote__';
const TAB_ID = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$/; // never empty: an empty target closes the caller's own tab
```

- `resolve`: `freshTabs`; `null` → `cockpit_unavailable`; `!complete` ou sem aba → `no_tab`; workspace `__remote__` → `remote`; id fora da regex → `no_tab`; `working` → `working`.
- `close`: `run(bin, ['close-tab', tabId, '--json'])`, 12 s de timeout, e confere que o `tabId` devolvido é o pedido; senão `failed`.

### `src/input-log.ts`

```ts
kind: 'text' | 'key' | 'resize' | 'restore' | 'wheel' | 'new-tab' | 'close-tab';
/** Close tab: the Cockpit tab id and the title shown in the confirmation. */
tab?: string;
title?: string;
```

O comentário do topo passa a citar a ADR nova.

### `src/server.ts`

- Opção `closeTab?: CloseTab`, documentada como `newTab`: usada só com `input`.
- Estado por conexão:
  - `let closingTab = false`;
  - `let pendingClose: { session: string; target: CloseTarget; at: number } | null = null`.
  - `pendingClose` é limpo em `select`, em `setCommand(null)` e em `disconnected`.
- `handleCloseTab(msg)`:

```ts
const handleCloseTab = async (msg: { confirm?: unknown }) => {
  const target = watching; // never an id from the browser
  const refuse = (reason: string) => post({ type: 'close-tab', ok: false, reason });
  if (shared.closing || !mayCommand || !opts.closeTab || target === null || commanding !== target) return refuse('command_off');
  if (closingTab) return refuse('closing');
  const confirming = msg.confirm === true;
  if (confirming && (!pendingClose || pendingClose.session !== target || Date.now() - pendingClose.at > CLOSE_CONFIRM_MS))
    return refuse('expired');
  closingTab = true;
  try {
    let sessions: Session[];
    try { sessions = await client.list(SIZE_LIST_MS); } catch { return refuse('cockpit_unavailable'); }
    if (!open) return;
    if (commanding !== target) return refuse('command_off'); // turned off while listing
    const r = await opts.closeTab.resolve(sessions, target).catch(() => ({ ok: false, reason: 'failed' }) as const);
    if (!r.ok) return refuse(r.reason);
    if (!confirming) {
      pendingClose = { session: target, target: r.target, at: Date.now() };
      return post({ type: 'close-tab', stage: 'confirm', title: r.target.title });
    }
    const was = pendingClose!.target;
    pendingClose = null;
    if (r.target.tabId !== was.tabId || r.target.ids !== was.ids) return refuse('changed');
    if (!opts.input!.log.append({ login, session: target, kind: 'close-tab', tab: was.tabId, title: was.title })) return refuse('log_failed');
    const done = await opts.closeTab.close(was.tabId).catch(() => ({ ok: false, reason: 'failed' }) as const);
    if (!open) return;
    if (!done.ok) return refuse(done.reason);
    setCommand(null);
    client.detach(target);
    watching = null;
    post({ type: 'close-tab', ok: true, id: target });
    void sendSessions();
  } finally {
    closingTab = false;
  }
};
```

- `CLOSE_CONFIRM_MS = 30_000`.
- Dispatch: `if (msg.type === 'close-tab') return void handleCloseTab(msg);`. O tipo de `msg` ganha `confirm?: unknown`.
- O `pendingClose` também é limpo se a confirmação falha por qualquer motivo depois de consumida.

### `src/main.ts`

`const closeTab = input ? createCloseTab({ cockpitBin }) : undefined;`, passado a `startTowerServer`. O comentário de `:19` passa a citar "and closing it".

### `web/index.html`

Antes do fim do `body`, uma confirmação na página (`<dialog>` com `showModal`, não `confirm()`):

```html
<dialog id="close-confirm" class="sheet" aria-labelledby="close-title">
  <p id="close-title">Close this terminal?</p>
  <p id="close-what" class="sheet-detail"></p>
  <p class="sheet-detail">Its process ends, as with the tab's × on the Mac.</p>
  <div class="sheet-actions">
    <button type="button" id="close-cancel">Cancel</button>
    <button type="button" id="close-ok" class="danger">Close</button>
  </div>
</dialog>
```

### `web/app.js`

- **(x) na aba ativa** em `renderTabs`, só com `commandOn` (D2, D4). É um `span` com `role="button"`, para não aninhar botões; `onclick` com `stopPropagation`. Fica `disabled` (classe) quando `!current.info?.tab` ou `current.info.tab.working`, e então o toque só mostra o motivo (`no_tab` / `working`).
- **Toque no (x):** `send({type:'close-tab'})` e estado `closeReq = {id: current.id, stage: 'preparing'}`.
- **`close-tab` com `stage:'confirm'`** (e `closeReq` da sessão atual): preenche `close-what` com "`<título do Cockpit>` — `<label(current)>` em `<workspace>`" e abre o diálogo.
  - **Cancel** fecha o diálogo, sem mensagem: o pedido preparado expira no gateway.
  - **Close** manda `{type:'close-tab', confirm:true}`, desabilita o botão e espera.
- **`close-tab` com `ok:true`:** fecha o diálogo e escolhe a vizinha na faixa (a seguinte, senão a anterior, senão `preferred()` em outro workspace). Faz `current = null; select(vizinha)` e tira a sessão fechada de `sessions` localmente até a próxima lista.
- **`close-tab` com `ok:false`:** fecha o diálogo, mostra `CLOSE_TAB_REASONS[reason]` e limpa `closeReq`.

```js
const CLOSE_TAB_REASONS = {
  ...REASONS,
  no_tab: 'this terminal is not tied to a Cockpit tab yet; close it on the Mac',
  working: 'an agent is working here; stop it first (Esc or Ctrl-C)',
  remote: 'remote workspaces are not supported',
  changed: 'tabs changed in Cockpit; try again',
  expired: 'confirmation expired; try again',
  closing: 'already closing',
  failed: 'Cockpit did not close the terminal',
};
```

- `setCommand(false)`, `select` e `ws.onclose` fecham o diálogo e limpam `closeReq`.

### `web/style.css`

- `.tab-close`: alvo de toque de 28 px, cor `var(--muted)`, `.disabled` com opacidade 0.35.
- `.sheet`: diálogo com `var(--surface)`, borda `var(--border)`, `::backdrop` escurecido, botão `.danger` com `var(--bad)`.
- Funciona nos temas claro e escuro pelas variáveis já existentes.

### Testes

- **`test/close-tab.test.ts`** (`Runner` falso que grava chamadas, saídas de `lsof`/`list-tabs`/`list-workspaces` montadas):
  - caminho feliz: aba certa pela ordem, título devolvido;
  - `close` roda exatamente `['close-tab','t3','--json']` e confere o `tabId`;
  - um par fora da pasta (que o `matchTabs` toleraria) → `no_tab`;
  - contagens diferentes → `no_tab`;
  - `working` → `working`, e `close-tab` não roda;
  - workspace `__remote__` → `remote`;
  - id `-x` ou vazio → `no_tab`;
  - listagem falha → `cockpit_unavailable`;
  - CLI falha, JSON ruim ou outro `tabId` → `failed`;
  - os únicos verbos rodados são `list-tabs`, `list-workspaces`, `lsof` e `close-tab`.
- **`test/session-info.test.ts`:** `freshTabs` com `complete` falso quando um par é descartado; `ids` igual a `collect` para as mesmas listas; não altera a estabilidade do `createSessionInfo`.
- **`test/server.test.ts`** (`closeTab` falso que grava `resolve`/`close`):
  - fora do modo de comando, outro login, sem `input` → `command_off`, nada roda;
  - preparar devolve `stage:'confirm'` com o título, e `close` não roda;
  - confirmar sem preparar, ou depois de 30 s → `expired`;
  - confirmar depois de trocar de sessão → `command_off` (o `select` desliga o modo) e o pedido some;
  - aba ou `ids` diferentes na segunda leitura → `changed`, e `close` não roda;
  - registro antes de `close`; registro que falha → `log_failed`, e `close` não roda;
  - campos do navegador (`id`, `tab`, `title`) ignorados;
  - dois pedidos ao mesmo tempo → `closing`;
  - caminho feliz: `ok:true`, modo de comando desligado, `detach` da sessão, lista reenviada.
- **`test/protocol.test.ts`:** a varredura passa a `['src/close-tab.ts','src/new-tab.ts','src/session-info.ts']`, e o título do teste muda.
- **`test/input-log.test.ts`:** a linha `close-tab` grava `tab` e `title`.

### `REVIEW.md`

- **Linha nova:** `Fechar terminal (src/close-tab.ts, handleCloseTab, web/app.js)`.
  - **A falha se parece com:** "**Aba errada ou fechamento sem prova**: id/título vindo do navegador; um passo só; casamento com par descartado; assinatura de ids não comparada entre os passos; `working` aceito; alvo vazio ou que vira flag; sem registro antes; `confirm()` do navegador".
  - **Como verificar:** "Seguir `close-tab` do `ws.on('message')` até o `execFile`: alvo `watching`, `pendingClose` ≤ 30 s, segunda `resolve` igual, `log.append` antes".
- **"Always high risk":** "hoje só `new-tab`" passa a "hoje `new-tab` e `close-tab`, em `src/new-tab.ts` e `src/close-tab.ts`".
- **Linha "Terminal novo":** `child_process` fora dos **três** arquivos.

## §4.4. Riscos e impacto

- **Tier: `high`.** Ação destrutiva no Cockpit a partir do celular, e um verbo novo de escrita da CLI (`REVIEW.md:34`).
- **Fechar a aba errada.** Mitigado por:
  - casamento completo;
  - duas leituras iguais;
  - só a sessão assistida;
  - título do Cockpit na confirmação.

  Risco residual: uma PTY recriada numa aba antiga do mesmo workspace. Aceito pelo dono e registrado na ADR.
- **Matar trabalho de agente.** O `working` é recusado nos dois passos. Ele pode estar defasado (eventos de hook), mas cada passo o lê fresco.
- **Shell órfão (k21).** A aba some e a sessão sai do `pty.list`, mas o zsh continua vivo até um SIGHUP. Documentado; correção upstream no k21.
- **Efeito no Mac.** A aba fechada pode ser de outro workspace que não o selecionado, e o app traz esse workspace para frente.
- **Rótulo × id.** Se o id sumir entre a segunda leitura e o comando, a CLI tentaria um rótulo igual. É improvável (ids `tNN`); se acontecer, o `tabId` devolvido difere e a resposta é `failed`. Registrado na ADR.
- **Desempenho:** duas listagens a mais (cerca de 100–300 ms cada) só quando o dono toca no (x).
- **Compatibilidade:** mensagens novas (`close-tab`) que um gateway antigo ignora com aviso 📎 `src/server.ts:491-492`. Um viewer antigo nunca as envia.
- **Verificação:**
  - `npm test`: todos os testes passam, incluindo os novos (rodar `npm ci` no worktree antes);
  - `node --check web/app.js`;
  - teste real com abas descartáveis: criar duas com `cockpit new-tab` no workspace do tower, fechar a segunda pelo `close-tab` do gateway em `--dev` (dirigido por um script WebSocket local) e conferir, com `list-tabs`, que só ela sumiu;
  - checagem do dono no iPhone: (x) só em modo de comando, confirmação com título, recusa com agente trabalhando.
- **Como reverter:** reverter os commits da branch (código, testes, `REVIEW.md` e ADR). Sem migração de dados; as linhas `close-tab` do registro local ficam, inofensivas.

## §4.5. Passos de execução

1. Criar a branch `feat/2026-10-24_viewer-close-tab-button__tower` no worktree (§2.5, validações) e rodar `npm ci`.
2. Teste real da CLI com uma aba descartável: `cockpit new-tab` no workspace do tower, `list-tabs`, `close-tab <id> --json`, saída e `ps` do shell (registrar o k21). Nunca abrir o Cockpit pelo Bash.
3. Escrever a ADR `decisions/2026-10-24_phone-close-tab.md` e a linha "Refinada por" na ADR do (+).
4. `src/session-info.ts`: `freshTabs` e testes.
5. `src/close-tab.ts` e `test/close-tab.test.ts`.
6. `src/input-log.ts` e teste.
7. `src/server.ts` (`handleCloseTab`, estado, limpezas, dispatch) e `src/main.ts`, com testes em `test/server.test.ts`.
8. `test/protocol.test.ts`: varredura com três arquivos.
9. `web/index.html`, `web/app.js`, `web/style.css`.
10. `REVIEW.md`.
11. Verificação: `npm test`, `node --check web/app.js`, teste real com duas abas descartáveis pelo gateway `--dev`.
12. Commits lógicos e revisão do agente em modo **deep** (tier high).
13. Gate humano: diff completo e checagem no iPhone.

## §4.6. Escopo

Áreas: `gateway` (`src/`, `test/`) e `viewer` (`web/`). A branch tem um escopo só, `tower`, como a do (+) (`feat/2026-10-24_viewer-new-tab-button__tower`): as duas áreas são do mesmo produto e mudam juntas por uma única mensagem nova.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/services/gateway.md` — seção "Fechar terminal": dois passos, casamento completo, recusas, registro, k21; e a varredura com três arquivos.
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` — `close-tab` pela CLI (fora do protocolo); o shell órfão do k21 no fechamento de aba.
- `cockpit_tower_wiki/overview.md` — linha do viewer: o (x) na aba assistida; decisão central citando a ADR nova.
- `cockpit_tower_wiki/_meta/index.md` — ADR nova no catálogo (com `/wiki-index` em `decisions/`).
- `cockpit_tower_wiki/board.kanban` — k24 concluído; nota no k21 de que o (x) do celular também deixa o shell vivo.
