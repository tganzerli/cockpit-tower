---
title: 2026-10-23 — Comandos pelo celular, fase 2: a PTY no tamanho do celular
type: plan
work_id: 2026-10-23_phone-pty-resize
scope:
  area: [gateway, viewer]
status: executed
risk: high
updated: 2026-10-23
summary: ADR nova refina a de digitação e libera pty.resize só em modo de comando; o celular mede colunas e linhas da visão, o gateway limita, aplica à sessão assistida, guarda o tamanho do Mac e o devolve uma vez em cada desligamento do modo.
topic: [contract, ui]
related:
  - work/tasks/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-input-client
  - contracts/cockpit-protocol-v2
  - services/gateway
---

# Plano — Comandos pelo celular, fase 2: a PTY no tamanho do celular

> Cobre [[work/tasks/2026-10-23_phone-pty-resize]] (cartão k2). As decisões do dono que estão na task são fixas aqui. Lidos antes: [[decisions/2026-10-23_phone-input-client]], [[services/gateway]] ("Digitação pelo celular"), [[contracts/cockpit-protocol-v2]], `REVIEW.md` e o plano da fase 1 ([[work/plans/2026-10-23_phone-terminal-input]]).

## §4.0. Análises pré-plano

Foram três análises, A, B e C, e a síntese foi revalidada no thread principal. As citações `remote_pi:` apontam para `~/app/remote_pi` no commit `7d923ab`, com caminhos a partir de `cockpit/`. As citações `flterm:` apontam para `~/.pub-cache/git/libghostty-a342abbec8f744714bf6c38fb5516acf19114486/packages/flterm/lib/src/`, a versão do `pubspec.lock` do remote_pi.

### A. Teste prático: o resize externo vale e fica (2026-10-23, Cockpit real, aba descartável)

- **O teste.** Um cliente de teste mandou `pty.resize {rows:40, cols:45}` para a sessão.
  - `stty -f /dev/ttys007 size` respondeu `40 45`.
  - Durante 20 s, o `pty.list` mostrou `rows=40 cols=45` a cada 2 s, sem o app reaplicar o tamanho dele (o Mac não foi tocado).
  - O tamanho original, 60x143, foi restaurado pelo mesmo caminho.
- **No servidor, o resize é global e atualiza a info da sessão.** Por isso o `pty.list` devolve as `rows`/`cols` atuais:
  - aplicação e atualização da info: `remote_pi: packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:292-296`;
  - lista com `rows`/`cols`: `remote_pi: packages/cockpit_server/lib/src/remote_server.dart:603-616`;
  - tratamento do `PtyResize`: `remote_pi: packages/cockpit_server/lib/src/remote_server.dart:658-663`.
- **Formato no fio:** `{"t":"pty.resize","id","rows","cols"}` (`remote_pi: packages/cockpit_protocol/lib/src/messages.dart:397-413`).

### B. Quando o app manda o tamanho dele (leitura do código)

- **O app só manda resize quando as colunas ou linhas da grade mudam.** Há uma deduplicação contra a geometria já aplicada (`flterm: controller/terminal_session.dart:460-469`). Isso acontece ao redimensionar a janela, arrastar a divisória, abrir o painel lateral, mudar fonte ou zoom e no primeiro layout.
- **Ele nunca reenvia** por foco de aba, foco de janela, de tempos em tempos ou por causa de saída.
- **Abas Neovim são a exceção:** o `synchronizeDisplay` só é chamado para elas (`remote_pi: lib/app/cockpit/ui/viewmodels/cockpit_viewmodel.dart:1469,1537`).
- **O app nunca lê o tamanho da PTY de volta e não recebe aviso de tamanho.**

Consequências:
- **Um resize externo fica valendo até o layout do Mac mudar.** Aí o app sobrescreve o tamanho, e o tower não é avisado.
- **O app nunca devolve o tamanho do Mac sozinho.** O tower precisa guardar, por sessão, as `rows`/`cols` de antes (lidas do `pty.list`) e mandá-las de volta.

Ressalvas aceitas:
- se o layout do Mac mudar durante o modo de comando, o tamanho guardado fica velho (§4.3 trata isso com a checagem de tamanho);
- uma aba do Mac oculta (Offstage) pode ter um tamanho velho.

### C. Achado lateral: fechar a aba não mata o shell

- **O que se viu.** Ao fechar uma aba do Cockpit, a sessão sai do `pty.list`, mas o shell continua vivo (`Ss+`, filho do `cockpit-server`) até receber SIGHUP. Visto duas vezes em 2026-10-23 (pids 52694 e 43991).
- **Encaminhamento:** vira o cartão k21 (upstream, bug, externo).
- **O que corrige no wiki e no README:**
  - a frase do contrato "Fechar a aba no Mac encerra a sessão", hoje marcada ⚠ unverified (`cockpit_tower_wiki/contracts/cockpit-protocol-v2.md:70`);
  - a mesma frase no `README.md:94`.

### D. Estado atual do tower (fase 1 em `dev`)

- **Envio para o Cockpit.**
  - A lista branca fica em `src/protocol.ts:10`, e o `encode` recusa o resto (`src/protocol.ts:43-51`).
  - `inputMessage` é o único construtor de escrita (`src/protocol.ts:53-57`).
  - `CockpitClient.input` devolve `false` sem conexão (`src/cockpit-client.ts:129-134`), e `send` descarta em silêncio (`src/cockpit-client.ts:149-151`).
  - O comentário da classe diz "never resizes" (`src/cockpit-client.ts:20-23`).
- **Modo de comando no gateway.**
  - `commanding` (`src/server.ts:175`), `listed` como `Set` de ids vivos (`src/server.ts:177`, preenchido em `:229`).
  - `setCommand` (`src/server.ts:198-201`) é o ponto único por onde passam todos os desligamentos:
    - a sessão termina (`:205`);
    - o Cockpit cai (`:208-213`);
    - a sessão some da lista (`:230`);
    - `select` de outra sessão (`:291`);
    - `command` explícito (`:297-300`).
  - Uma mensagem `resize` do navegador hoje cai no descarte (`src/server.ts:302-303`).
  - O fechamento do socket só chama `client.close()` (`src/server.ts:309-315`).
  - `TowerServer.close()` faz `terminate` nos espectadores (`src/server.ts:148-151`), e o `main.ts` sai em até 3 s (`src/main.ts:46-51`, limite em `:48`).
- **Viewer.**
  - O emulador local é redimensionado ao selecionar a sessão (`web/app.js:596`) e quando a lista periódica traz outro tamanho (`web/app.js:715-725`).
  - `setCommand` abre o compositor só quando o gateway confirma (`web/app.js:626-640`, `:750-751`).
  - A página oculta manda `command off` (`web/app.js:780-787`).
  - O tamanho da fonte vai de 11 a 18 px, com A−/A+ na gaveta (`web/app.js:264-283`, `web/index.html:64-67`).
  - A visão HTML tem `padding: 6px 8px`, fonte monoespaçada, `line-height: 1.3` e `pre-wrap` com `overflow-wrap: anywhere` (`web/style.css:225-237`).
- **Testes que travam o resize hoje:**
  - `FORBIDDEN_TYPES` com `pty.resize` (`test/protocol.test.ts:8`);
  - a varredura `forbidden`/`input` (`test/protocol.test.ts:35-36`);
  - o conjunto exato de tipos (`test/client.test.ts:98`);
  - o envio de `{type:'resize'}` sem modo (`test/server.test.ts:206`), conferido só por `ALLOWED_OUTBOUND` (`:218`). **Esta asserção deixa de pegar um resize** quando `pty.resize` entrar na lista branca, e precisa virar uma asserção explícita.
- **O fake** só registra `pty.input` (`test/fake-cockpit-server.ts:131-132`) e responde `bad_message` ao resto (`:134-135`).
- **Afirmações "nunca redimensiona" no tower:**
  - `README.md:10`, `:47`, `:79-81`;
  - `REVIEW.md:14`, `:22`;
  - `src/protocol.ts:1`, `:6-9`, `:47`;
  - `src/cockpit-client.ts:22`;
  - `src/server.ts:302`;
  - `web/app.js:1-6`, `:596`, `:721`;
  - `cockpit_tower_wiki/services/gateway.md:65`, `:141`;
  - `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md:37`, `:55`;
  - ADR da fase 1: `:35`, `:41`, `:77`, `:88-89`.

## §4.1. Resumo e entendimento

Com a fase 1, o iPhone digita na sessão, mas a PTY continua no tamanho do Mac (por exemplo, 143 colunas). As TUIs dos agentes desenham para essa largura, e a visão HTML quebra as linhas no celular, então os parágrafos e as caixas ficam irregulares. O objetivo é o comportamento do antigo `window-size latest` do tmux: **quem comanda define o tamanho**. Enquanto o celular está em modo de comando, a PTY assume as colunas e linhas que cabem na tela dele, e o programa se redesenha nesse tamanho. Ao sair do modo, por qualquer gatilho, o Mac recebe de volta o tamanho que tinha.

Como o app nunca restaura o tamanho sozinho (§4.0 B), **a restauração é responsabilidade do tower**. Por isso a peça central é um "tamanho devido" por conexão: o tamanho original, lido de uma lista fresca, e o tamanho que aplicamos. Ele é devolvido **exatamente uma vez** por ciclo ligado→desligado, e só se a PTY ainda estiver no tamanho que pusemos. Se o Mac mudou o layout nesse meio-tempo, o app já pôs o tamanho dele, e restaurar o antigo pioraria.

A abertura é estreita, nas mesmas camadas da fase 1:
- `pty.resize` só é montado por `resizeMessage`, com faixa fixa;
- só é enviado para a sessão em modo de comando (`commanding === watching`), com o tamanho limitado no gateway;
- cada resize é registrado antes do envio.

`pty.kill`, `pty.open`, `pty.ack`, `rpc` e `rpc.res` continuam proibidos. O trabalho começa por uma **ADR nova que refina** a da fase 1, e essa continua `accepted`.

## §4.2. Arquivos afetados

**ADR (passo 2, antes do código):**
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (CREATE) — a decisão nova.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE) — nota de refinamento no topo, `revisit_when` sem o gatilho k2 e `related`.

**Gateway:**
- `src/protocol.ts` (UPDATE) — `pty.resize` na lista branca, `resizeMessage()`, `PTY_COLS`/`PTY_ROWS`, comentários e mensagem de erro.
- `src/cockpit-client.ts` (UPDATE) — `resize(id, cols, rows): boolean` e comentário da classe.
- `src/input.ts` (UPDATE) — `ptySize(msg)`: valida inteiros e limita à faixa.
- `src/input-log.ts` (UPDATE) — tipos `resize` e `restore` no `InputLogEntry`.
- `src/server.ts` (UPDATE) — mensagem `resize`, tamanho devido, restauração em todos os gatilhos, trava entre espectadores, `close()` que espera as restaurações e mensagem `size` para o navegador.

**Testes:**
- `test/protocol.test.ts`, `test/client.test.ts`, `test/server.test.ts`, `test/fake-cockpit-server.ts`, `test/input.test.ts`, `test/input-log.test.ts` (UPDATE).

**Viewer:**
- `web/app.js` (UPDATE) — medição de colunas e linhas, envio de `resize` ao ligar o modo e ao mudar a fonte, tratamento de `size` e das recusas, e comentários.
- `web/style.css` e `web/index.html`: **sem mudança** (o medidor é estilizado inline).

**Documentos:**
- `README.md` (UPDATE) — `:8-10`, `:47`, `:55-57`, `:79-81`, e `:94` (achado C).
- `REVIEW.md` (UPDATE) — contexto (`:14`), linha do cliente do socket (`:22`) e uma linha nova para o caminho de tamanho. `:32` já lista `pty.resize` e fica.

🔒 **Rules affected:** none. As regras `always_on` (`.agents/rules/mandatory_planning_rule.md`, `.agents/rules/git_branching_rule.md`) não falam de tipos de mensagem nem de tamanho de PTY. O `REVIEW.md` muda, mas não é regra, e está listado acima.

🔒 **ADRs affected:**
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` é **refinada**.
  - Muda a decisão 1 (uma porta a mais, `pty.resize`) e as restrições ("`pty.resize` só com a fase 2", `:89`).
  - As camadas 3–9 ficam confirmadas.
  - Ela continua `accepted` e recebe nota e links (está na lista acima).
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` já está superada e **não é tocada**.

## §4.3. Mudanças e justificativa

### ADR nova — `decisions/2026-10-23_phone-pty-resize.md`

Segue `decisions/_templates/adr.md`, com:
- `work_id: 2026-10-23_phone-pty-resize`;
- `supersedes: []`;
- `related: [decisions/2026-10-23_phone-input-client, contracts/cockpit-protocol-v2, services/gateway, work/plans/2026-10-23_phone-pty-resize]`;
- `revisit_when: "o app do Cockpit passar a ler ou anunciar o tamanho da PTY (broadcast de tamanho), ou a fase 3 (k3) precisar de outro tamanho para a rolagem em tela cheia"`.

Decisões-chave:

1. **Uma porta a mais para o Cockpit.**
   - O tower envia `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize`. `pty.kill`, `pty.open`, `pty.ack`, `rpc` e `rpc.res` continuam recusados.
   - Só `resizeMessage` monta `pty.resize`, e ele recusa valores fora de 20–500 colunas e 5–300 linhas.
2. **O tamanho segue o modo de comando.**
   - O resize só vale com o modo ligado, e só para a sessão assistida (`commanding === watching`). Um id vindo do navegador é ignorado.
   - O navegador mede e manda `resize {cols, rows}` depois que o gateway confirma o modo, e de novo quando muda a fonte.
   - O gateway exige inteiros e limita os valores à faixa.
3. **Linhas = altura da visão sem teclado**, medida ao ligar o modo. Abrir ou fechar o teclado não redimensiona; a mudança de fonte recalcula com essa mesma altura guardada.
4. **Restauração obrigatória, uma vez por ciclo.**
   - O tamanho original sai de um `pty.list` fresco, no primeiro resize do ciclo.
   - Todo desligamento devolve esse tamanho:
     - `command off` explícito;
     - troca de sessão;
     - página oculta (por meio do `command off`);
     - a sessão termina ou some da lista;
     - perda do Cockpit;
     - fechamento do WebSocket, inclusive por inatividade;
     - parada do gateway.
   - **Só restaura se a PTY ainda está no tamanho que pusemos** (lista fresca). Se não está, o Mac já pôs o dele e nada é enviado.
   - **Com o Cockpit fora do ar**, a restauração fica devida e é tentada na reconexão, com a mesma checagem. Se a página fechar antes disso, a dívida se perde (custo aceito).
5. **O Mac retoma o tamanho.** Se uma lista periódica mostrar que a sessão em comando mudou de tamanho por fora, o tower desiste da restauração, não briga com o Mac e avisa a página. As linhas voltam a quebrar como na fase 1 até um novo resize (por exemplo, mudar a fonte).
6. **Um espectador por vez dimensiona uma sessão.** Com um mapa no nível do gateway, um segundo espectador que tente dimensionar a mesma sessão recebe `busy`. A digitação continua funcionando para ele. Sem essa trava, o segundo guardaria o tamanho do primeiro celular como "original" e devolveria ao Mac um tamanho de celular.
7. **Registro.**
   - Cada resize é uma linha `kind:'resize'` com `cols`, `rows` e `from`, gravada **antes** do envio; uma falha de gravação recusa o resize (falha fechado).
   - Cada restauração é uma linha `kind:'restore'`, em **melhor esforço**: restaurar é a direção segura, e uma falha do registro não pode deixar o Mac no tamanho do celular.
8. **O resto não muda:** `Origin`, dono do Tailscale, token, e o tower nunca envia `pty.ack`.

Consequências registradas:
- Enquanto o celular comanda, **o Mac vê a sessão no tamanho do celular** (o resize é global, §4.0 A).
- Mexer no layout do Mac nesse período devolve o tamanho ao Mac na hora.
- Uma aba oculta no Mac pode ficar com um tamanho velho (§4.0 B).
- Girar o telefone com o modo ligado não redimensiona; basta desligar e ligar o modo.

Policiamento:
- testes do `encode` e de `resizeMessage`;
- varredura do código-fonte (`pty.resize` e `pty.input` só em `protocol.ts`);
- testes do servidor para cada gatilho de restauração;
- `REVIEW.md`.

Alternativas descartadas (tabela):

| Alternativa | Por que foi descartada |
|---|---|
| Restaurar sem checar o tamanho atual | Sobrescreve um layout novo do Mac com um tamanho velho, e o app não percebe |
| Reaplicar o tamanho do celular quando o Mac muda | Briga com quem está no Mac |
| Tamanho dentro de `command {on, cols, rows}` | A altura só é conhecida depois que o compositor abre, e a fonte precisa de outra mensagem de qualquer jeito |
| Redimensionar ao abrir o teclado | Decisão do dono |
| "O último ganha" entre dois celulares | Corrompe a restauração |
| Guardar o original da lista periódica | Pode ter até 5 s, e o layout pode ter mudado nesse intervalo |

**ADR da fase 1** (`decisions/2026-10-23_phone-input-client.md`):
- nota no topo: "Refinada por [[decisions/2026-10-23_phone-pty-resize]]: `pty.resize` passou a ser permitido só em modo de comando, com restauração. As decisões 2–9 continuam valendo";
- `revisit_when: "o cockpit-server passar a repassar o flow do pty.open"`;
- `related` ganha a ADR nova;
- "Revisão prevista" ganha uma linha: "Fase 2 feita em 2026-10-23: refinada, camadas mantidas";
- `updated` muda. O resto do corpo fica igual, como histórico.

### `src/protocol.ts`

```ts
// Subset of the Cockpit remote protocol (v2) that cockpit-tower needs: read sessions, type into one, and size it to the phone.
/**
 * The only message types this client may ever send. pty.input and pty.resize are the writes, built only by
 * inputMessage and resizeMessage; everything else (kill, open, ack, rpc) kills, spawns, touches credit or runs code.
 */
export const ALLOWED_OUTBOUND: ReadonlySet<string> = new Set(['hello', 'pty.list', 'pty.attach', 'pty.detach', 'pty.input', 'pty.resize']);

/** Sizes the gateway may give a PTY (ADR 2026-10-23_phone-pty-resize). */
export const PTY_COLS = { min: 20, max: 500 } as const;
export const PTY_ROWS = { min: 5, max: 300 } as const;

export type Outbound = /* existing five */ | { t: 'pty.resize'; id: string; rows: number; cols: number };

/** The only constructor of a PTY resize in the codebase (a source-scan test enforces it). */
export function resizeMessage(id: string, cols: number, rows: number): Outbound {
  const fits = (n: number, r: { min: number; max: number }) => Number.isInteger(n) && n >= r.min && n <= r.max;
  if (!fits(cols, PTY_COLS) || !fits(rows, PTY_ROWS)) throw new ForbiddenMessage(`resize to ${cols}x${rows} refused`);
  return { t: 'pty.resize', id, rows, cols };
}
```

- A mensagem do `encode` (`:47`) passa a listar também `pty.resize`.
- A faixa fica duplicada de propósito: o gateway limita (`ptySize`) e o construtor recusa. É a mesma dupla barreira de `MAX_INPUT_BYTES`.

### `src/cockpit-client.ts`

```ts
/** Sets a session's PTY size, for every client. Returns false, with nothing sent, while disconnected. */
resize(id: string, cols: number, rows: number): boolean {
  if (!this.isConnected) return false;
  this.send(resizeMessage(id, cols, rows));
  return true;
}
```

O comentário da classe (`:20-23`) passa a dizer: "lists, watches, types into (`input`) and sizes (`resize`) sessions, and never kills one".

### `src/input.ts`

```ts
/** A viewer `resize` message → the size to apply: integers only, clamped to the range the gateway allows. Null = refuse. */
export function ptySize(msg: { cols?: unknown; rows?: unknown }): { cols: number; rows: number } | null {
  const { cols, rows } = msg;
  if (!Number.isInteger(cols) || !Number.isInteger(rows)) return null;
  const clamp = (n: number, r: { min: number; max: number }) => Math.min(r.max, Math.max(r.min, n));
  return { cols: clamp(cols as number, PTY_COLS), rows: clamp(rows as number, PTY_ROWS) };
}
```

O gateway **limita** os valores, e não recusa, quando o número é inteiro mas fica fora da faixa: um celular pequeno com fonte grande mede menos de 20 colunas e deve receber 20. Valores que não são inteiros são recusados.

### `src/input-log.ts`

```ts
export interface InputLogEntry {
  login: string | null;
  session: string;
  kind: 'text' | 'key' | 'resize' | 'restore';
  key?: string;
  text?: string;
  bytes?: number;                            // text and key only
  cols?: number; rows?: number;              // resize and restore: the size sent
  from?: { cols: number; rows: number };     // resize: the size it will be restored to
}
```

O comentário de `:1` passa a dizer "everything the phone typed or sized".

### `src/server.ts`

**Estado compartilhado** em `startTowerServer`, passado a `serveViewer(ws, req, opts, shared)`:

```ts
/** Session id → the viewer holding its size; a second viewer cannot size it (its "original" would be a phone size). */
const sizedBy = new Map<string, object>();
/** Each viewer's give-back; close() runs them before terminating, since a stop must not leave the Mac at phone size. */
const givebacks = new Set<() => Promise<void>>();
// close: await Promise.allSettled([...givebacks].map((g) => g())); then terminate as today (main.ts caps the stop at 3 s).
```

**Em `serveViewer`:**

```ts
type Size = { cols: number; rows: number };
const RESTORE_LIST_MS = 2000; // fits inside main.ts's 3 s stop
const me = {};
/** The phone size this viewer put on a session and the size it owes back. Null = nothing owed. */
let hold: { id: string; original: Size; applied: Size } | null = null;
let sizeEpoch = 0; // bumped on every applied resize; a list started before it says nothing about who sized last
let chain: Promise<void> = Promise.resolve();
/** Resizes and give-backs run one at a time, in order: an off-then-on never restores after the new size. */
const serial = (fn: () => Promise<void>) => (chain = chain.then(fn).catch(() => {}));

const liveSize = async (id: string, ms?: number): Promise<Size | null> => {
  const s = (await client.list(ms)).find((x) => x.id === id && x.exit === undefined);
  return s ? { cols: s.cols, rows: s.rows } : null;
};
const release = () => {
  if (hold && sizedBy.get(hold.id) === me) sizedBy.delete(hold.id);
  hold = null;
};

const applySize = (msg: { cols?: unknown; rows?: unknown }) => serial(async () => {
  const target = watching; // never an id from the browser
  const refuse = (reason: string) => post({ type: 'resize', ok: false, reason });
  if (!mayCommand || target === null || commanding !== target) return refuse('command_off');
  const size = ptySize(msg);
  if (!size) return refuse('invalid');
  const holder = sizedBy.get(target);
  if (holder !== undefined && holder !== me) return refuse('busy');
  if (!client.isConnected) return refuse('cockpit_unavailable');
  let now: Size | null;
  try { now = await liveSize(target, opts.listTimeoutMs); } catch { return refuse('cockpit_unavailable'); }
  if (commanding !== target) return refuse('command_off'); // turned off while listing
  if (!now) return refuse('gone');
  const original = hold?.id === target ? hold.original : now; // a font change keeps the Mac's size as the one owed
  if (!opts.input!.log.append({ login, session: target, kind: 'resize', ...size, from: original })) return refuse('log_failed');
  if (!client.resize(target, size.cols, size.rows)) return refuse('cockpit_unavailable');
  hold = { id: target, original, applied: size };
  sizedBy.set(target, me);
  sizeEpoch++;
  post({ type: 'size', id: target, ...size, by: 'phone' });
});

/** Gives the Mac its size back, once, and only if the PTY still has the size we set. */
const giveBack = () => serial(async () => {
  if (!hold) return;
  if (!client.isConnected) { if (!open) release(); return; } // owed: retried on 'reconnected' while the page stays
  const h = hold;
  release(); // exactly once per on→off, whatever the list says
  const now = await liveSize(h.id, RESTORE_LIST_MS).catch(() => null);
  if (!now || now.cols !== h.applied.cols || now.rows !== h.applied.rows) return; // gone, or the Mac already set its own
  opts.input?.log.append({ login, session: h.id, kind: 'restore', ...h.original }); // best effort: restoring is the safe direction
  if (client.resize(h.id, h.original.cols, h.original.rows)) post({ type: 'size', id: h.id, ...h.original, by: 'mac' });
});
givebacks.add(giveBack);
```

**Ligações:**
- **`setCommand`** (`:198-201`): `if (id === null && hold !== null) void giveBack();`. Assim **todo** desligamento que já passa por ele restaura: término (`:205`), queda do Cockpit (`:212`), sumiço da lista (`:230`), `select` (`:291`) e `command off` (`:297-300`).
- **`reconnected`** (`:214-217`): depois do `sendSessions()`, `if (hold !== null && commanding === null) void giveBack();`.
- **`sendSessions`**, depois da lista (`:228-230`), detecta que o Mac retomou o tamanho:

  ```ts
  const epoch = sizeEpoch; // read before client.list
  // ...after the list:
  const mine = hold && commanding === hold.id && epoch === sizeEpoch ? sessions.find((s) => s.id === hold!.id) : undefined;
  if (mine && (mine.cols !== hold!.applied.cols || mine.rows !== hold!.applied.rows)) {
    release(); // the Mac re-laid out: it owns the size now, nothing to give back
    post({ type: 'size', id: mine.id, cols: mine.cols, rows: mine.rows, by: 'mac' });
  }
  ```

  ⚠ unverified: a guarda `sizeEpoch` supõe que o servidor responde a um `pty.list` enviado depois de um `pty.resize` na mesma conexão já com o tamanho novo (o `PtyResize` faz `await` em `remote_server.dart:658-663`, mas a ordem de tratamento das mensagens de uma conexão não foi lida).
- **Mensagens:**
  - `if (msg.type === 'resize') return applySize(msg);` entra antes do descarte (`:302`);
  - o comentário do descarte passa a ser "Anything else, including kill attempts, is dropped";
  - o tipo de `msg` (`:281`) ganha `cols` e `rows`.
- **`ws.on('close')`** (`:309-315`): `givebacks.delete(giveBack); void giveBack().finally(() => client.close());`, em vez de `client.close()` direto. O `post` já não envia nada com `open === false` (`:181`).
- **`listed`** continua `Set` (`:177`). O tamanho original vem de uma lista fresca, não da periódica, que pode ter até 5 s (§4.3, tabela de descartadas).
- **Literal do tipo.** O texto `pty.resize` não pode aparecer em `server.ts`, nem em comentário, por causa da varredura.

### `web/app.js`

- **Cabeçalho (`:1-6`).** Diz que o viewer manda texto, teclas e o próprio tamanho, só em modo de comando. Fora do modo, a PTY fica no tamanho do Mac e a visão quebra as linhas. Sem o literal do tipo de mensagem.
- **Comentários de `:596` e `:721`** passam a "local emulator: follows the PTY's size".
- **Medição:**

```js
// ---- PTY size from the phone ----------------------------------------------
// The view's text box without the keyboard, taken when command mode turns on; a font change reuses it.
let restBox = null;
function cellSize() {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;visibility:hidden;white-space:pre;left:0;top:0';
  probe.textContent = 'M'.repeat(100);
  viewEl.append(probe);
  const r = probe.getBoundingClientRect();
  probe.remove();
  return { w: r.width / 100, h: r.height };
}
function sendSize() {
  if (!commandOn || !restBox) return;
  const c = cellSize();
  send({ type: 'resize', cols: Math.floor(restBox.w / c.w), rows: Math.floor(restBox.h / c.h) });
}
// in the 'command' handler, after setCommand(true): measure once the composer is laid out.
requestAnimationFrame(() => {
  const cs = getComputedStyle(viewEl);
  restBox = {
    w: viewEl.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
    h: viewEl.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom),
  };
  sendSize();
});
```

- **`applyFont`** (`:273-280`) chama `sendSize()` no fim. Fora do modo, isso não faz nada.
- **`setCommand(false)`** (`:634-638`) limpa `restBox`.
- **Mensagem `size`** do gateway:

  ```js
  } else if (msg.type === 'size' && current && msg.id === current.id) {
    if (msg.cols !== current.cols || msg.rows !== current.rows) {
      current = { ...current, cols: msg.cols, rows: msg.rows };
      term.resize(msg.cols, msg.rows); // local emulator: follows the PTY's size
      resetView();
      scheduleRender();
    }
    if (msg.by === 'mac' && commandOn) note('the Mac changed the size; lines wrap again', 'warn');
  }
  ```

  O `size` sai do gateway logo depois do envio do resize ao Cockpit. Por isso chega à página **antes** do redesenho do programa (SIGWINCH), e o emulador já está no tamanho novo quando os bytes chegam. Quando o modo desliga, o `size` com `by:'mac'` volta o emulador ao tamanho do Mac. Se a página estiver oculta, a próxima lista faz isso (`:715-725`).
- **Recusas de `resize`:** `{type:'resize', ok:false, reason}` vai para `note()`, com motivos novos em `REASONS` (`:614-619`):
  - `busy`: "another viewer sized this session; lines wrap";
  - `gone`: "session ended".
- **Largura.** Com `cols` igual à largura medida, as linhas da PTY cabem numa linha da tela, e o `pre-wrap` (`web/style.css:235-236`) deixa de quebrar. Caracteres largos ainda podem quebrar, o que é aceitável.

### Testes

- **`test/protocol.test.ts`:**
  - `FORBIDDEN_TYPES` perde `pty.resize` (`:8`);
  - `encode(resizeMessage('s1', 45, 40))` → `{"t":"pty.resize","id":"s1","rows":40,"cols":45}`;
  - `resizeMessage` recusa 19/501 colunas, 4/301 linhas e `45.5`;
  - a varredura (`:35-36`) passa a usar:

    ```ts
    const forbidden = /pty\.(kill|open|ack)\b|['"`]rpc(\.res)?['"`]/; // never sent at all
    const writes = /pty\.(input|resize)\b/;                            // only inputMessage / resizeMessage build them
    ```
- **`test/input.test.ts`:**
  - `ptySize` limita 5→20 e 1000→300;
  - recusa `'45'`, `NaN`, `45.5`, `null` e campos ausentes.
- **`test/input-log.test.ts`:** uma entrada `resize` com `from` vira uma linha JSON com os campos.
- **`test/client.test.ts`:**
  - `:87-101` passa a "without input() or resize() the client sends only read types";
  - um teste novo cobre `resize()`: `pty.resize {id, rows, cols}` chega ao fake, e a função devolve `false` sem conexão.
- **`test/fake-cockpit-server.ts`:**
  - `case 'pty.resize'` atualiza `rows`/`cols` da sessão e não responde, como o servidor real (§4.0 A);
  - helper `setSize(id, cols, rows)` simula o Mac mudando o layout;
  - o comentário de `:2` muda.
- **`test/server.test.ts`:**
  - em `:198-223`, a asserção de `:218` ganha `assert.ok(!fake.received.some((m) => m.t === 'pty.resize'))`, e o título passa a "resize without command mode and kill are dropped";
  - testes novos, com registro em pasta temporária e sessão `s1` em 80x24:
    1. `resize` sem modo → `ok:false, command_off`, nenhum `pty.resize`;
    2. modo ligado + `resize {cols:45, rows:40, id:'s2'}` → o fake recebe `pty.resize {id:'s1', rows:40, cols:45}`, a página recebe `size by:'phone'`, e o registro tem `kind:'resize', from:{cols:80, rows:24}`;
    3. limites: `cols:5, rows:1000` → 20x300; `cols:'45'` → `invalid`, sem envio;
    4. restauração por `command off` → `pty.resize` 80x24 e `size by:'mac'`; um segundo `off` não manda nada (uma vez só);
    5. restauração por `select` de outra sessão;
    6. restauração ao fechar o WebSocket (o fake recebe 80x24 antes de a conexão cair);
    7. a sessão termina ou some da lista → nenhuma restauração;
    8. queda do Cockpit com resize ativo → depois da reconexão, restaura 80x24; com `setSize` enquanto o Cockpit está fora, não restaura;
    9. o Mac retoma (`setSize(s1, 100, 30)` durante o modo, depois uma lista) → `size by:'mac'`, e o `off` seguinte não manda resize;
    10. dois `resize` seguidos (troca de fonte) → a restauração volta ao 80x24 original, não ao primeiro tamanho do celular;
    11. um segundo espectador no modo, na mesma sessão → `busy`, sem `pty.resize` dele;
    12. registro que falha → `log_failed`, sem envio;
    13. `tower.close()` com resize ativo → o fake recebe a restauração antes do fim;
    14. sem a opção `input` → `resize` recusado com `command_off`.

## §4.4. Riscos e impacto

1. **O Mac fica no tamanho do celular.**
   - Acontece se a restauração não rodar: processo morto com SIGKILL, página fechada com o Cockpit fora do ar, ou iOS congelando a página sem entregar o `command off`.
   - **Mitigação:** restauração em todos os gatilhos, inclusive `close()` e a inatividade de 10 min (`src/server.ts:160,189`).
   - **Pior caso:** o dono mexe na janela ou na divisória no Mac, e o app reaplica o tamanho dele (§4.0 B).
2. **Restaurar por cima de um layout novo do Mac.** Evitado pela checagem com lista fresca. Sobra uma janela de corrida, entre a lista e o envio, de milissegundos.
3. **Ordem lista/resize no servidor** ⚠ unverified (§4.3, `sizeEpoch`). Se a ordem não for garantida, o pior efeito é desistir da restauração por engano. A conferência controlada cobre isso.
4. **O Mac vê o tamanho do celular** enquanto o celular comanda. É o objetivo e fica registrado na ADR.
5. **Abas Neovim:** o app reaplica o tamanho ao abrir arquivo (§4.0 B). O celular perde o tamanho dele, e a página avisa com `size by:'mac'`.
6. **Medição no Safari** ⚠ unverified: largura fracionária da fonte `ui-monospace`. O `Math.floor` erra para menos, deixando sobra à direita. O smoke confere com o Claude Code.
7. **Tela cheia (k3)** fora do escopo; a rolagem continua igual.

**Risk tier:** `high`. A mudança envia `pty.resize` a um terminal (`REVIEW.md:32`).

**Verification:**
- `npm test` com tudo verde (`# fail 0`). O CI está fora do ar, então trailers, wiki-lint e `npm test` rodam à mão antes do PR.
- **Conferência controlada no Mac**, com `tower on` real, numa aba descartável do Cockpit. Antes, anotar `tty` e `stty -f <tty> size` (o tamanho do Mac).
  - Ligar o modo pelo celular → `stty -f <tty> size` mostra o tamanho do celular, e `~/.cockpit-tower/input.log` tem a linha `resize` com o `from` certo.
  - Para cada gatilho, conferir que `stty` volta ao tamanho original:
    - `command off`;
    - troca de sessão;
    - travar o telefone;
    - fechar a página;
    - `tower off`;
    - `exit` na aba;
    - Cockpit fechado e reaberto.
  - Mudar o tamanho da janela do Mac durante o modo → depois do `off`, nenhum resize do tower, e o tamanho que fica é o do Mac.
  - Dois navegadores na mesma sessão → o segundo vê o aviso `busy`.
- **Smoke no iPhone, pelo dono:**
  1. o Claude Code se redesenha na largura do celular, sem parágrafos quebrados;
  2. A+/A− redimensionam de novo;
  3. abrir o teclado não redimensiona;
  4. ao desligar o modo, o Mac volta ao tamanho dele;
  5. travar o telefone devolve o tamanho;
  6. fora do modo, a leitura continua igual à da fase 1.

**Revert:**
- `git revert -m 1 <merge>` em `dev` (e em `main`, se já tiver sido promovido), seguido de `bin/tower off && bin/tower on`.
- Se o Mac ficar num tamanho errado, basta redimensionar a janela no Mac.
- Na wiki, a ADR nova vira `superseded` ou `deprecated`, com nota, e a da fase 1 perde a nota de refinamento.
- Nada é gravado no Cockpit.

## §4.5. Passos de execução

Uma branch e um PR de código, como na fase 1: o caminho do clique até a PTY é revisado inteiro.

- [ ] (1) Criar a branch `feat/2026-10-23_phone-pty-resize__tower` a partir de `dev` (thread principal). Mover o k2 para "Em curso" (housekeeping).
- [ ] (2) Escrever `decisions/2026-10-23_phone-pty-resize.md` e a nota e os links na ADR da fase 1 (§4.3).
- [ ] 🔒 **(2a) Portão da ADR:** o dono aprova o texto, principalmente estes pontos:
  - a faixa 20–500 / 5–300;
  - desistir da restauração quando o Mac muda o tamanho;
  - `busy` para o segundo espectador;
  - registro de `resize` falha fechado, e de `restore` em melhor esforço.

  Nenhum código antes disso. Se a ADR mudar, este plano recebe edições pontuais.
- [ ] (3) `src/protocol.ts` + `test/protocol.test.ts` (varredura `forbidden`/`writes`).
- [ ] (4) `src/cockpit-client.ts` (`resize`), `test/fake-cockpit-server.ts`, `test/client.test.ts`.
- [ ] (5) `src/input.ts` (`ptySize`) + `test/input.test.ts`; `src/input-log.ts` + `test/input-log.test.ts`.
- [ ] (6) `src/server.ts` + `test/server.test.ts` (ajuste de `:218` e testes 1–14).
- [ ] (7) **Portão do gateway:** `npm test` verde antes de mexer no viewer.
- [ ] (8) `web/app.js` (medição, `sendSize`, `size`, recusas, comentários).
- [ ] (9) `README.md` (incluindo `:94`, achado C) e `REVIEW.md`. Por fim, `grep -rn "never resiz\|never sends size\|PTY is never resized" src web README.md REVIEW.md` não deve achar afirmação falsa.
- [ ] (10) `npm test`, trailers e wiki-lint, rodados à mão.
- [ ] (11) Conferência controlada no Mac (§4.4).
- [ ] (12) Revisão pelo agente `reviewer`, tier `high`.
- [ ] (13) Smoke no iPhone pelo dono (§4.4).
- [ ] (14) Execution log, `/wiki-sync` (§4.7) e `/wiki-index decisions`. No PR de wiki do trio (housekeeping, fora do §4.7):
  - k2 → Done;
  - cartão novo **k21** (upstream, bug, externo): "fechar uma aba deixa o shell vivo até SIGHUP", com as evidências de §4.0 C;
  - "próximo kN livre" no quadro passa a k22.

## §4.6. Escopo

**Área(s) afetada(s):** `[gateway, viewer]`, sob a branch de escopo único `tower`, como na fase 1. Não toca `bin/tower`, `panel/` nem `src/main.ts`: a parada de 3 s (`src/main.ts:48`) já basta, porque o `close()` espera as restaurações com um limite de 2 s.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (CREATE, no passo 2) — o `/wiki-sync` só preenche os `code_refs` (`src/protocol.ts`, `src/server.ts`, `src/input.ts`, `web/app.js`) e confere as citações contra o código final.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE, no passo 2) — nota de refinamento, `revisit_when` e `related`.
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE):
  - "Mensagens que enviamos" passa a seis, com `pty.resize {id, rows, cols}` (`messages.dart:397-413`) e as condições de envio;
  - "nunca enviamos" fica sem `pty.resize`, e a frase sobre a varredura inclui `pty.resize`;
  - risco novo: o resize é global, e o app nunca restaura nem lê o tamanho (§4.0 A, B);
  - `:70` é corrigido com o achado C: a sessão sai da lista, mas o shell fica vivo até SIGHUP (k21).
- `cockpit_tower_wiki/services/gateway.md` (UPDATE):
  - `:65` passa a "Fase 2: tamanho do celular";
  - as mensagens do navegador ganham `resize {cols, rows}`, e as do gateway ganham `size {id, cols, rows, by}` e `resize {ok:false, reason}`;
  - seção nova "Tamanho da PTY": tamanho devido, uma restauração por ciclo, checagem do tamanho atual, retomada pelo Mac, `busy`, `close()`;
  - "Registro" ganha `resize`/`restore`;
  - "Limites de proteção" ganha a faixa de colunas e linhas;
  - `:141` é substituído pelas novas limitações (Mac no tamanho do celular durante o modo, rotação, aba oculta).
- `cockpit_tower_wiki/overview.md` (UPDATE):
  - `:21`: o modo de comando também dimensiona a PTY;
  - `:36`: a linha do viewer (o xterm segue o tamanho da PTY, que é o do celular em modo de comando);
  - `:41`: a decisão central cita também a ADR nova.
- `cockpit_tower_wiki/decisions/_index.md` (REGENERATE por `/wiki-index decisions`).
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada desta execução.
