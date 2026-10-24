---
title: 2026-10-24 — Botão (+) na faixa de abas do viewer para abrir um terminal novo
type: plan
work_id: 2026-10-24_viewer-new-tab-button
scope:
  area: [gateway, viewer]
status: executed
risk: high
updated: 2026-10-24
summary: ADR nova libera, em modo de comando, abrir um terminal no workspace assistido; o gateway acha pasta e aba âncora na listagem do Cockpit e roda `cockpit new-tab --tab-id --cwd`, com registro antes; o viewer seleciona a sessão nova.
topic: [contract, ui]
related:
  - work/tasks/2026-10-24_viewer-new-tab-button
  - decisions/2026-10-23_phone-input-client
  - contracts/cockpit-protocol-v2
  - services/gateway
---

# Plano — Botão (+) na faixa de abas do viewer para abrir um terminal novo

> Cobre [[work/tasks/2026-10-24_viewer-new-tab-button]] (cartão k23). Lidos antes: [[decisions/2026-10-23_phone-input-client]], [[services/gateway]], [[contracts/cockpit-protocol-v2]] e `REVIEW.md`.
>
> **Decisões do dono (2026-10-24), fixas aqui:**
> - **D1. A troca de workspace no Mac é aceita.** Quando o workspace do celular não é o selecionado no Mac, o Cockpit do Mac passa a mostrá-lo, com a aba nova ativa.
> - **D2. Mesma cerca da digitação.** O (+) só funciona em modo de comando, para o dono do Tailscale, com `Origin` igual e registro gravado antes.
>
> Modelo recomendado para escrever e executar: Opus (risco alto, mexe nas cercas do gateway).

## §4.0. Análises pré-plano

Foram duas análises em paralelo: A, sobre o Cockpit, e B, sobre o tower. A síntese foi revalidada no thread principal. As citações `remote_pi:` apontam para `~/app/remote_pi/cockpit` no commit `177aea97`.

### A. O que o `cockpit new-tab` faz fora de um terminal do Cockpit (leitura do código; sem execução)

- **A CLI funciona sem as variáveis `COCKPIT_*`.** Ela procura `~/.cockpit/status.sock` quando não há `$COCKPIT_STATUS_SOCK`, e no macOS não usa token: a proteção é a permissão do socket (`remote_pi: cli/src/transport.rs:7-8`, `:64-91`).
- **`--cwd` não escolhe o workspace.** A aba nasce no workspace **selecionado no Mac**, na pane focada. O `--cwd` só define a pasta do shell (`remote_pi: lib/app/cockpit/ui/viewmodels/cockpit_viewmodel.dart:4878-4893`, confirmado).
- **`--tab-id` de uma aba existente ancora a criação.** Se a aba é de outro workspace, o handler faz `selectProject` desse workspace (é a troca de D1) e põe a aba nova na pane da âncora (`remote_pi: lib/app/cockpit/ui/viewmodels/cockpit_cli_handler.dart:316-327`, confirmado).
  - Um `--tab-id` inexistente cai em silêncio no caminho "workspace selecionado".
  - `--tab-id` explícito vence o `COCKPIT_TAB_ID` herdado (`remote_pi: cli/src/commands.rs:191`, `tab_id.or_else(self_tab_id)`). Isso importa porque o gateway pode ter sido ligado de dentro de uma aba.
- **O `new-tab` não tem `--workspace`.** As flags são `--cwd`, `--title`, `--split`, `--tab-id` e `--json` (`remote_pi: cli/src/commands.rs:132-160`).
- **A saída com `--json`** é o `data` da resposta, `{"tabId":"tNN"}` (`remote_pi: cli/src/commands.rs:192-200`). O timeout da CLI é de 10 s (`remote_pi: cli/src/commands.rs:14`).
- **O "+" do Cockpit** chama `newTerminalInPane(node.id)` (`remote_pi: lib/app/cockpit/ui/cockpit_page.dart:1105`), com cwd `project.path`, perfil de terminal padrão e título igual ao nome do workspace (`cockpit_viewmodel.dart:4833-4863`).
  - Pela CLI, o perfil é o mesmo e o cwd é o que passamos. O título padrão é o nome da pasta (`cockpit_viewmodel.dart:4892`), que difere do nome do workspace só quando o workspace foi renomeado. Não passamos `--title`, porque isso fixaria um rótulo manual.
- **A PTY sobe na criação** (`remote_pi: lib/app/cockpit/ui/session/terminal_session.dart:74-80`). O tower já vê toda aba local no `pty.list`, porque é assim que lista as sessões hoje.
- **Workspace remoto:** o id começa com `__remote__` (`remote_pi: lib/app/cockpit/domain/entities/project.dart:52`). Com âncora remota, o handler pula a checagem da pasta e abriria um terminal no host, que o tower não vê. Fica fora: o gateway recusa.
- **Falhas:** sem app, a CLI sai com código 3. Pasta inexistente → `directory not found`. Não há limite de taxa no app (ausência confirmada pela análise).
- ⚠ **Não testado ao vivo.** O passo 1 da execução testa numa aba descartável, com o dono presente.

### B. O tower hoje (worktree em `origin/dev` `b351182`)

- **A faixa de abas** é `renderTabs` (`web/app.js:451-468`). Ela mostra as sessões do workspace de `current` (`groupOf(s).ws` = `info.workspace.path`, `web/app.js:381-385`) e não tem nenhum botão fixo.
- **O modo de comando** está no gateway. O viewer só espelha `mayCommand`/`commandOn` (`web/app.js:65-67`, `setCommand` em `:703-723`). Trocar de sessão desliga o modo nos dois lados (`web/app.js:668`, `src/server.ts:443`).
- **O molde das cercas** é o de `handleInput`/`handleWheel`:
  - alvo `watching`, nunca um id do navegador;
  - `!mayCommand || target === null || commanding !== target` → `command_off`;
  - `log.append` antes, com falha virando `log_failed` (`src/server.ts:359-388`).
  - O `Origin` e o header são conferidos no upgrade (`src/server.ts:137`), e o dono é conferido em `mayCommand` (`src/server.ts:197`).
- **Despacho:** tipos desconhecidos são descartados com aviso (`src/server.ts:456-457`). O tipo de `msg` é uma lista fechada de campos (`src/server.ts:418-433`).
- **O gateway não guarda a pasta do workspace por sessão.** `sendSessions` calcula `info` e não o retém; `listed` guarda só o tamanho (`src/server.ts:202`, `:317-328`).
- **CLI do Cockpit no gateway:** só `list-tabs`/`list-workspaces`, por `execFile`, sem shell, com timeout de 2 s (`src/session-info.ts:59-63`, `:136-137`). `cockpitList` é exportado e devolve abas com `id`, `workspaceId` e `focused`, e workspaces com `id` e `path` (`src/session-info.ts:136-160`). O binário vem de `TOWER_COCKPIT_BIN` ou `~/.cockpit/bin/cockpit` (`src/main.ts:11`).
- **Nenhuma ação de escrita fora do protocolo existe hoje.** `execFile` só aparece em `src/session-info.ts`. A varredura de `test/protocol.test.ts:34-52` não pegaria um `new-tab`.
- **Registro:** `InputLogEntry.kind` é uma união fechada (`src/input-log.ts:7`).
- **Testes do servidor:** WebSocket real, `FakeCockpitServer`, `inputSetup` e `tempLog` (`test/server.test.ts:26-42`, `:281-287`). O `sessionInfo` é injetado como função falsa (`test/server.test.ts:146`).
- **Wiki e revisão:**
  - A ADR de digitação lista as mensagens do navegador (decisão 2, `decisions/2026-10-23_phone-input-client.md:48`).
  - [[services/gateway]] diz que "Nada que vem do navegador entra nos argumentos" (`services/gateway.md:138`).
  - O `REVIEW.md` diz que o gateway "apenas se conecta" (`REVIEW.md:14`). A linha "Ciclo de vida" (`REVIEW.md:26`) e "Always high risk" (`REVIEW.md:29`) não citam a CLI do Cockpit.

## §4.1. Resumo e entendimento

O dono quer abrir, pelo iPhone, um terminal novo no workspace que está vendo, como faz no Mac pelo "+" da barra de abas. O viewer ganha um botão (+) no fim da faixa de abas. Com o modo de comando ligado, um toque manda `{type:'new-tab'}`, **sem nenhum argumento**.

O gateway faz o resto sozinho:
1. Pega a pasta do workspace da sessão assistida, que ele mesmo guardou da última lista.
2. Confere essa pasta na listagem do Cockpit.
3. Escolhe uma aba daquele workspace como âncora.
4. Grava o registro.
5. Roda `cockpit new-tab --tab-id <âncora> --cwd <pasta> --json`.

O Cockpit abre a aba como no "+": no workspace, na pane da âncora, ativa. Se precisar, troca o workspace selecionado no Mac (D1). O viewer recebe a lista nova e seleciona a sessão que apareceu naquele workspace. Como em qualquer troca de sessão, o modo de comando desliga, e o dono o liga de novo na aba nova para digitar.

É a **primeira ação do gateway que não é uma mensagem do protocolo**. Ela não toca o socket do `cockpit-server` (`ALLOWED_OUTBOUND` não muda), mas cria uma PTY. Por isso entra numa ADR, com as mesmas cercas da digitação e uma varredura de testes própria.

## §4.2. Arquivos afetados

**ADRs (passo 2, antes do código):**
- `cockpit_tower_wiki/decisions/2026-10-24_phone-new-tab.md` (CREATE) — a decisão nova.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE) — terceira nota de refinamento no topo (a decisão 2 ganha `new-tab`), `summary` e `related`.

**Código:**
- `src/new-tab.ts` (CREATE) — resolve o workspace e a âncora e roda a CLI.
- `src/server.ts` (UPDATE) — opção `newTab`, pastas por sessão e `handleNewTab`.
- `src/input-log.ts` (UPDATE) — `kind: 'new-tab'` e o campo `dir`.
- `src/main.ts` (UPDATE) — liga `newTab` só quando a digitação está ligada.
- `web/app.js` (UPDATE) — botão (+), envio, resposta e seleção da sessão nova.
- `web/style.css` (UPDATE) — estilo do `.tab-add`.

**Testes:**
- `test/new-tab.test.ts` (CREATE) — `createNewTab` com `Runner` falso.
- `test/server.test.ts` (UPDATE) — cercas e caminho feliz do `new-tab`.
- `test/protocol.test.ts` (UPDATE) — varredura: `node:child_process` só em `session-info.ts` e `new-tab.ts`.
- `test/input-log.test.ts` (UPDATE) — linha `new-tab`.

**Revisão:**
- `REVIEW.md` (UPDATE) — contexto, linha nova na tabela e item em "Always high risk".

**Quadro:** `cockpit_tower_wiki/board.kanban` — k23 para *Em curso* no início da execução e para *Done* no fechamento.

🔒 **Rules affected:** nenhuma regra `.agents/rules/*` descreve o comportamento que muda. `REVIEW.md`, que descreve o que o revisor procura, está na lista acima.

🔒 **ADRs affected:**
- `decisions/2026-10-23_phone-input-client.md` é **refinada**:
  - a decisão 2 (mensagens do navegador) ganha `new-tab`;
  - a decisão 1 (portas para o Cockpit) fica **confirmada**, porque nenhum tipo novo vai ao socket;
  - as decisões 3–9 também ficam **confirmadas**: modo de comando, alvo assistido, acesso e registro valem para o `new-tab`.

  Continua `accepted` e está na lista acima.
- `decisions/2026-10-23_phone-pty-resize.md` e `decisions/2026-10-23_phone-fullscreen-scroll.md`: **confirmadas**, sem mudança.
- `decisions/2026-10-22_read-only-client.md`: já superada, **não é tocada**.

## §4.3. Mudanças e justificativa

### ADR nova — `decisions/2026-10-24_phone-new-tab.md`

Segue `decisions/_templates/adr.md`, com:
- `status: accepted`;
- `code_refs: [src/new-tab.ts, src/server.ts, web/app.js]`;
- `related: [decisions/2026-10-23_phone-input-client, services/gateway, contracts/cockpit-protocol-v2, work/plans/2026-10-24_viewer-new-tab-button]`;
- `revisit_when: "o Cockpit ganhar new-tab --workspace (abrir sem trocar a seleção do Mac), ou o tower passar a ver workspaces remotos"`.

**Decisão:**
1. **Uma ação fora do protocolo.** O gateway pode rodar um único verbo de escrita da CLI do Cockpit, `new-tab`, e só pelo `src/new-tab.ts`. Nenhuma mensagem nova vai ao `cockpit-server`; `pty.open` continua proibido.
2. **Do navegador, `{type:'new-tab'}` sem argumentos.** Pasta, workspace e âncora vêm da listagem do Cockpit, nunca do navegador. Qualquer campo extra é ignorado.
3. **Mesmas cercas da digitação (D2):** modo de comando ligado para a sessão assistida, dono do Tailscale, `Origin` igual, falha fechada sem `input`.
4. **Alvo:** o workspace da sessão assistida, pela pasta guardada na última lista. Ele precisa existir na listagem fresca da CLI, não pode ser remoto e precisa ter uma aba aberta, que vira a âncora: a focada daquele workspace ou, sem ela, a primeira.
5. **Comando:** `cockpit new-tab --tab-id <âncora> --cwd <pasta> --json`, por `execFile`, sem shell, com timeout de 12 s. Sem `--title` e sem `--split`.
6. **Efeito no Mac (D1):** se o workspace não é o selecionado, o Mac passa a mostrá-lo, com a aba nova ativa na pane da âncora.
7. **Registro:** uma linha `new-tab` (login, sessão assistida, pasta), gravada **antes** de rodar. Se a gravação falhar, nada roda.
8. **Uma de cada vez por conexão:** um segundo pedido enquanto o primeiro roda é recusado (`opening`).
9. **Depois:** a lista é reenviada na hora, e o viewer seleciona a sessão nova daquele workspace, o que desliga o modo de comando, como toda troca.

**Alternativas descartadas:**

| Alternativa | Por que foi descartada | O que a traria de volta |
|---|---|---|
| `pty.open` no `cockpit-server` | Cria uma PTY que não vira aba no app; continua proibido | — |
| `new-tab` sem `--tab-id` | Abre no workspace selecionado no Mac, não no do celular | — |
| Navegador manda a pasta ou o id | Deixaria o celular escolher o cwd | — |
| Contribuir `new-tab --workspace` antes | Decisão do dono (D1): aceitar a troca agora | O app ganhar o verbo |
| Só para o dono, sem modo de comando | Decisão do dono (D2) | — |

**Consequências:**
- O Mac pode trocar de workspace sem aviso, por toque do dono no celular.
- Abrir um terminal desliga o modo de comando, porque ele não segue a troca de sessão.
- Workspace remoto: sem (+).

**Policiamento:**
- testes de recusa por cerca;
- teste de que nada do navegador chega aos argumentos;
- varredura: `node:child_process` só em `session-info.ts` e `new-tab.ts`;
- teste do `createNewTab`: só os verbos `list-tabs`, `list-workspaces` e `new-tab` com os argumentos esperados;
- linha nova no `REVIEW.md`.

**Revisão prevista:** se a troca de workspace incomoda no uso; se a seleção automática acerta a sessão nova.

### ADR de digitação (`decisions/2026-10-23_phone-input-client.md`)

- Nota nova no topo, abaixo da de `:31`: "**Refinada em 2026-10-24** por `[[decisions/2026-10-24_phone-new-tab]]`: o navegador também manda `new-tab` (decisão 2), e o gateway abre um terminal pela CLI do Cockpit, sem tipo novo para o socket. As decisões 1 e 3–9 continuam valendo."
- O `summary` termina em "Refinada pelas ADRs do resize, da roda e do terminal novo."
- O `related` ganha `decisions/2026-10-24_phone-new-tab`.

### `src/new-tab.ts` (novo)

```ts
// Opens a Cockpit terminal tab for the phone (ADR 2026-10-24_phone-new-tab): the gateway's only action that is
// not a protocol message. The folder and the anchor tab come from Cockpit's own listing, never from the browser.
import { execFile } from 'node:child_process';
import { cockpitList } from './session-info.ts';
import type { Runner } from './session-info.ts';

export type NewTabResult = { ok: true; tabId: string } | { ok: false; reason: 'gone' | 'remote' | 'cockpit_unavailable' | 'failed' };
/** Opens a terminal in the workspace whose folder is `workspacePath`, next to one of its open tabs. */
export type NewTab = (workspacePath: string) => Promise<NewTabResult>;

const REMOTE_PREFIX = '__remote__'; // Cockpit's id prefix for an SSH workspace, whose PTYs the tower cannot see
const TAB_ID = /^[A-Za-z0-9_-]{1,64}$/;

// The CLI waits up to 10 s for the app; a little more here so its own error is the one reported.
const execRunner: Runner = (file, args) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: 12_000, maxBuffer: 1 << 20 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }));
  });

export function createNewTab(opts: { cockpitBin: string; run?: Runner }): NewTab {
  const run = opts.run ?? execRunner;
  return async (workspacePath) => {
    const listing = await cockpitList(opts.cockpitBin, run);
    if (!listing) return { ok: false, reason: 'cockpit_unavailable' };
    const ws = listing.workspaces.find((w) => w.path !== '' && w.path === workspacePath);
    if (!ws) return { ok: false, reason: 'gone' };
    if (ws.id.startsWith(REMOTE_PREFIX)) return { ok: false, reason: 'remote' };
    const tabs = listing.tabs.filter((t) => t.workspaceId === ws.id && TAB_ID.test(t.id));
    const anchor = tabs.find((t) => t.focused) ?? tabs[0];
    if (!anchor) return { ok: false, reason: 'gone' };
    // --tab-id anchors the new tab in that workspace (and wins over an inherited COCKPIT_TAB_ID).
    const out = await run(opts.cockpitBin, ['new-tab', '--tab-id', anchor.id, '--cwd', ws.path, '--json']);
    if (!out.ok) return { ok: false, reason: 'failed' };
    try {
      const tabId: unknown = JSON.parse(out.stdout).tabId;
      return typeof tabId === 'string' && tabId !== '' ? { ok: true, tabId } : { ok: false, reason: 'failed' };
    } catch {
      return { ok: false, reason: 'failed' };
    }
  };
}
```

Por que assim:
- A âncora e a pasta vêm da **listagem fresca**, então uma pasta guardada que deixou de ser workspace vira `gone`.
- O `TAB_ID` impede que um id estranho vire argumento. O `execFile` sem shell já impede injeção, mas um id começando por `-` poderia virar flag.
- A listagem roda com o mesmo runner de 12 s. É uma ação rara, então o custo não importa.

### `src/input-log.ts`

```ts
kind: 'text' | 'key' | 'resize' | 'restore' | 'wheel' | 'new-tab';
/** New tab: the workspace folder the terminal opens in. */
dir?: string;
```

O comentário do topo passa a citar também a ADR `2026-10-24_phone-new-tab`.

### `src/server.ts`

- **Opção:**
  ```ts
  /** Opens a terminal in the watched session's workspace once command mode is on (ADR 2026-10-24_phone-new-tab).
   * Only used with `input`; absent = no new-tab. */
  newTab?: NewTab;
  ```
- **Pastas por sessão**, ao lado de `listed`:
  ```ts
  /** Each listed session's workspace folder, from the last list: new-tab's only source for where to open. */
  let folders = new Map<string, string>();
  ```
  Em `sendSessions`, depois do `info`: `folders = new Map(Object.entries(info).flatMap(([id, i]) => (i.workspace?.path ? [[id, i.workspace.path]] : [])));`. No `disconnected`, `folders = new Map()`, junto de `listed`.
- **Handler**, ao lado de `handleWheel`:
  ```ts
  let opening = false;
  /** The (+) on the phone: a terminal in the watched session's workspace (ADR 2026-10-24_phone-new-tab). */
  const handleNewTab = async () => {
    const target = watching; // never an id from the browser
    const refuse = (reason: string) => post({ type: 'new-tab', ok: false, reason });
    if (shared.closing || !mayCommand || !opts.newTab || target === null || commanding !== target) return refuse('command_off');
    const dir = folders.get(target);
    if (!dir) return refuse('no_workspace');
    if (opening) return refuse('opening');
    if (!opts.input!.log.append({ login, session: target, kind: 'new-tab', dir })) return refuse('log_failed');
    opening = true;
    try {
      const r = await opts.newTab(dir);
      if (!open) return;
      if (!r.ok) return refuse(r.reason);
      post({ type: 'new-tab', ok: true, dir });
      void sendSessions();
    } finally {
      opening = false;
    }
  };
  ```
- **Despacho:** `if (msg.type === 'new-tab') return void handleNewTab();`, antes do `console.warn`. O campo `msg` não ganha nada: o pedido não tem argumentos.

### `src/main.ts`

```ts
const newTab = input ? createNewTab({ cockpitBin }) : undefined;
// …
...(newTab ? { newTab } : {}),
```

O comentário de `:19` passa a citar o terminal novo.

### `web/app.js`

- **Botão em `renderTabs`.** Depois das abas, se `current` tem workspace (`groupOf(current).ws !== ''`) e `mayCommand`, entra o `<button class="tab-add" aria-label="New terminal">+</button>`, com `disabled = !commandOn || newTab !== null`. `newTab` é o pedido pendente: `null`, ou `{ ws, before, at }`.
  ```js
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'tab-add';
  add.textContent = '+';
  add.setAttribute('aria-label', 'New terminal');
  add.disabled = !commandOn || newTab !== null;
  add.onclick = () => {
    if (!send({ type: 'new-tab' })) return note('not sent: no connection', 'bad');
    newTab = { ws, before: new Set(sessions.map((s) => s.id)), at: Date.now() };
    renderTabs();
  };
  ```
- **`setCommand`** chama `renderTabs()`, para o botão acompanhar o modo.
- **Resposta:**
  - `new-tab` com `ok:false` → `newTab = null`, nota com `REASONS`, `renderTabs()`;
  - com `ok:true` → mantém `newTab` à espera da lista.
- **Na mensagem `sessions`:** se `newTab` está pendente e há uma sessão fora de `before` com `groupOf(s).ws === newTab.ws`, faz `newTab = null` e `select(s)`. Depois de 15 s sem achar, `newTab = null` e a nota "terminal opened on the Mac; pick it in the tabs".
- **`REASONS`** ganha:
  - `no_workspace: 'no workspace for this terminal'`;
  - `remote: 'remote workspaces are not supported'`;
  - `failed: 'Cockpit did not open the terminal'`;
  - `opening: 'already opening a terminal'`.

  O `gone` existente ("session ended") fica genérico demais para o `new-tab`. Por isso a resposta usa um texto próprio: `gone` → "workspace not open in Cockpit".
- A troca de conexão (`ws.onclose`) zera `newTab`.

### `web/style.css`

```css
.tab-add {
  flex: none;
  padding: 0 14px;
  border: 0;
  background: transparent;
  color: var(--muted);
  font-size: 18px;
  line-height: 1;
}
.tab-add:disabled { opacity: 0.35; }
```

O `.tabs:empty` continua: sem `current`, não há botão.

### Testes

- `test/new-tab.test.ts`, com `Runner` falso que grava as chamadas:
  - caminho feliz: âncora focada, argumentos exatos (`['new-tab','--tab-id','t3','--cwd','/w','--json']`), `tabId` devolvido;
  - sem aba focada → primeira aba;
  - pasta fora da listagem → `gone`;
  - id `__remote__…` → `remote`, e o `new-tab` não roda;
  - workspace sem aba → `gone`;
  - id da aba inválido (`-x`) → descartado;
  - listagem falha → `cockpit_unavailable`;
  - CLI falha ou JSON ruim → `failed`;
  - os únicos verbos chamados são `list-tabs`, `list-workspaces` e `new-tab`.
- `test/server.test.ts` (com `inputSetup` mais `newTab` falso que grava as pastas e `sessionInfo` falso com `workspace.path`):
  - fora do modo de comando → `command_off`, nada roda;
  - outro login do Tailscale → `command_off`;
  - sem a opção `input` → `command_off`;
  - registro que falha → `log_failed`, nada roda;
  - campos do navegador (`dir`, `cwd`, `id`) ignorados: a pasta usada é a da sessão assistida;
  - sessão sem workspace → `no_workspace`;
  - dois pedidos seguidos → o segundo `opening`;
  - caminho feliz: linha `new-tab` com `dir`, resposta `ok:true` e uma lista nova enviada.
- `test/protocol.test.ts`: novo teste "only session-info.ts and new-tab.ts import node:child_process".
- `test/input-log.test.ts`: a linha `new-tab` grava `dir`.

### `REVIEW.md`

- **Contexto (`:14`):** acrescentar "e abre um terminal no workspace assistido pela CLI do Cockpit (`cockpit new-tab`, ADR `decisions/2026-10-24_phone-new-tab`)".
- **Linha nova na tabela:** `Terminal novo (src/new-tab.ts, handleNewTab)` | "**Escrita pela CLI além do `new-tab`**, ou pasta/âncora vinda do navegador, sem modo de comando, sem registro antes, workspace remoto aceito" | "Seguir `new-tab` do `ws.on('message')` até o `execFile`: alvo `watching`, `folders` da última lista, `log.append` antes; argumentos só da listagem".
- **"Always high risk":** "Qualquer código que rode um verbo da CLI do Cockpit além de `list-tabs`/`list-workspaces`".

## §4.4. Riscos e impacto

- **Tier: `high`.** Cria uma PTY a partir do celular e mexe nas cercas do gateway (`REVIEW.md` "Always high risk").
- **Troca de workspace no Mac (D1):** aceita. Ela aparece só por toque do dono, em modo de comando.
- **Shell com o ambiente do app, não do gateway:** a PTY é do Cockpit, que injeta as variáveis dele. O gateway não passa ambiente nenhum.
- **Âncora errada:** a âncora é qualquer aba com `workspaceId` igual ao do workspace, sem depender do casamento sessão ↔ aba (k5). No pior caso, a aba nova vai para outra pane do mesmo workspace.
- **Seleção automática:** depende da sessão nova ter `workspace.path` igual. Para uma sessão nova, o casamento por ordem fica instável por uma coleta, e o `workspaceFor` cai na pasta, que é exatamente o cwd que passamos. Se falhar, sobra a nota "pick it in the tabs".
- **Flavor errado:** com o Cockpit oficial e o fork abertos ao mesmo tempo, a CLI pode falar com o outro (`remote_pi: cli/src/transport.rs:60-67`). Isso já vale para as listagens de hoje.
- **Sem mudança no protocolo nem em `bin/tower`.**
- **Verificação:**
  - `npm test` → todos os testes passam, com os novos (`# fail 0`);
  - `python3 scripts/ci/check_commit_trailers.py origin/dev` e `python3 .claude/skills/wiki-lint/lint.py --root .` sem erros;
  - teste real, com o dono e o tower ligado: tocar no (+) num workspace não selecionado abre a aba no Mac (com a troca de workspace) e a seleciona no celular. Fora do modo de comando, o botão fica desabilitado. A linha `new-tab` aparece no `~/.cockpit-tower/input.log`. A aba de teste é fechada com `cockpit close-tab` (atenção ao k21: conferir com `ps` se o shell morreu).
- **Como reverter:** `git revert` dos commits do trio. Nada persiste fora do repo, só as linhas do `input.log` e as abas abertas no teste.

## §4.5. Passos de execução

1. **Teste prático da CLI, com o dono presente**, numa aba descartável:
   - `list-tabs --json` → escolher uma âncora de um workspace não selecionado;
   - `env -u COCKPIT_TAB_ID ~/.cockpit/bin/cockpit new-tab --tab-id <âncora> --cwd <pasta> --json`;
   - conferir a troca no Mac, o `{"tabId"}` e a sessão no `pty.list`;
   - `close-tab` e `ps`.

   Se divergir de §4.0 A, parar e emendar o plano.
2. Criar `decisions/2026-10-24_phone-new-tab.md` e atualizar a ADR de digitação.
3. `src/input-log.ts` + `test/input-log.test.ts`.
4. `src/new-tab.ts` + `test/new-tab.test.ts`.
5. `src/server.ts` + `test/server.test.ts`.
6. `src/main.ts`.
7. `test/protocol.test.ts` (varredura do `child_process`).
8. `web/app.js` + `web/style.css`.
9. `REVIEW.md`.
10. `npm test`, trailers e wiki-lint, registrando a saída na execução.
11. Teste real no iPhone com o dono (§4.4), registrando na execução.
12. Revisão por agente com contexto limpo, em modo profundo (tier `high`).
13. Sinalizar o dono para a revisão do diff completo.

## §4.6. Escopo

Áreas: `gateway` (`src/`), `viewer` (`web/`). Sem `bin/`, sem `panel/`, sem o fork do Cockpit.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/services/gateway.md` — seção nova "Terminal novo pelo celular". Também: "Peças" ganha `src/new-tab.ts`; "Contexto das sessões" esclarece que os verbos de listagem são só leitura e que o `new-tab` mora em outro lugar; "Limites de proteção" ganha uma linha (um pedido por vez, timeout de 12 s).
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` — "Mensagens que nunca enviamos": nota de que abrir terminal passa pela CLI do app, não por `pty.open`.
- `cockpit_tower_wiki/overview.md` — linha do viewer cita o (+), e "Decisão central" cita a ADR nova como refinamento.
- `cockpit_tower_wiki/decisions/_index.md` — regenerar com `/wiki-index` (a ADR nova).
