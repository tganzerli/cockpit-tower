---
title: 2026-10-23 — Comandos pelo celular, fase 1: digitar na sessão aberta
type: plan
work_id: 2026-10-23_phone-terminal-input
scope:
  area: [gateway, viewer, tower-cli]
status: executed
risk: high
updated: 2026-10-23
summary: ADR nova substitui o somente leitura; o gateway libera só pty.input, por conexão em modo de comando, para a sessão que ela assiste, com Origin, dono do Tailscale e registro local; o viewer ganha caixa de texto e teclas especiais.
topic: [contract, ui]
related:
  - work/tasks/2026-10-23_phone-terminal-input
  - decisions/2026-10-22_read-only-client
  - contracts/cockpit-protocol-v2
  - services/gateway
  - flows/tower-on-off
---

# Plano — Comandos pelo celular, fase 1: digitar na sessão aberta

> Cobre [[work/tasks/2026-10-23_phone-terminal-input]] (cartão k1, com a decisão do k4). As decisões do dono que estão na task são fixas aqui. Lidos antes: [[decisions/2026-10-22_read-only-client]], [[contracts/cockpit-protocol-v2]], [[services/gateway]], `REVIEW.md`.

## §4.0. Análises pré-plano

Foram três análises, A, B e C, e a síntese foi revalidada no thread principal. As citações `remote_pi:` apontam para `~/app/remote_pi` no commit `7d923ab`, e os caminhos começam em `cockpit/`.

### A. Como o Cockpit recebe digitação

- **Mensagem.** É `{"t":"pty.input","id","d"}`, com `d` = base64 dos bytes crus (`remote_pi: packages/cockpit_protocol/lib/src/messages.dart:345-363`).
- **Bytes que o app emite** (keytab do fork do xterm, `remote_pi: lib/app/core/terminal/xterm/src/core/input/keytab/keytab_default.dart`):
  - Enter `\r` (`:32`), Esc `\x1b` (`:24`), Tab `\t` (`:26`), Shift-Tab `\x1b[Z` (`:27`);
  - setas CSI `\x1b[A..D` (`:67-70`), ou SS3 `\x1bOA..D` com AppCuKeys (`:62-65`);
  - o app alimenta `appCursorKeys` com `appKeypadMode`, não com o DECCKM (`.../core/input/handler.dart:119`). Por isso emite CSI quase sempre;
  - Ctrl+letra = letra − 0x60, então Ctrl-C = `0x03` (`.../xterm/src/terminal.dart:281-285`).
- **Colagem com marcadores** (`\x1b[200~…\x1b[201~`). Só acontece quando o programa ligou `?2004h` (`.../xterm/src/terminal.dart:325-331`, `.../core/escape/emitter.dart:26-28`). O xterm.js do viewer acompanha esse modo em `term.modes.bracketedPasteMode` (`node_modules/@xterm/xterm/typings/xterm.d.ts:1919`, versão 6.0.0).
- **O servidor aceita `pty.input`, `pty.resize` e `pty.kill` de qualquer conexão,** sem exigir attach nem dono (`remote_pi: packages/cockpit_server/lib/src/remote_server.dart:652-667`). A digitação do app e a do tower se intercalam. Não há tamanho máximo de entrada no protocolo nem no servidor.
- **`pty.resize` fica para a fase 2.** Ele é global, e o app reaplica o tamanho a cada layout e re-attach.

### B. Crédito de fluxo e `pty.ack` (k4)

- **O servidor não repassa o `flow` do `pty.open`.**
  - O `PtySpawnSpec` é montado sem `flowControlled` (`remote_pi: packages/cockpit_server/lib/src/remote_server.dart:588-596`), e o campo começa em `false` (`remote_pi: packages/cockpit_core/lib/src/terminal/terminal_service.dart:13`).
  - `git grep -i flow 7d923ab -- cockpit/packages/cockpit_server` volta vazio.
  - Por isso o `ack()` retorna logo no início (`remote_pi: packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:220`).
- **Consequência:** pelo servidor, a janela de 256 KiB nunca se aplica, e o `pty.ack` não faz nada. O risco "o shell pode travar" da ADR e do contrato não tem apoio no código. Isso vem da leitura do código e não foi testado ao vivo.
- **Se o fluxo fosse ligado,** o crédito seria por sessão e os acks seriam subtraídos (`native_terminal_service.dart:222`), não um máximo nem um offset. Acks do tower se somariam aos do app e anulariam o controle de fluxo.
- **Decisão do dono:** o tower continua sem nunca enviar `pty.ack`, e a ADR e o contrato corrigem o texto do risco.
- **Fechar a aba no Mac** mata a sessão para todos (`pty.kill`). Já o `pty.detach` só tira a assinatura da conexão. ⚠ unverified: vem da análise B, e não achei de novo o ponto do app que manda `pty.kill` ao fechar a aba.

### C. As barreiras atuais do tower

- **Lista branca de envio.** Fica em `src/protocol.ts:7`, com a união fechada `Outbound` em `:9-13` e `encode`/`ReadOnlyViolation` em `:33-42`. O único caminho de envio é `CockpitClient.send` (`src/cockpit-client.ts:141-143`), que descarta em silêncio sem conexão.
- **Testes que travam a escrita:**
  - `WRITE_TYPES` (`test/protocol.test.ts:7`);
  - a varredura de `src/` e `web/` com `pty.(input|resize|kill|open|ack)` e `rpc`, que isenta `protocol.ts` (`test/protocol.test.ts:26-30`);
  - o conjunto exato de tipos enviados (`test/client.test.ts:98`);
  - "typing attempts are dropped", que manda `{type:'input',id,data}` (`test/server.test.ts:188-212`, envio em `:195`).
- **Do navegador para o gateway:**
  - aceita `ping`, `list` e `select`, e o resto é descartado (`src/server.ts:220-239`, descarte em `:237-238`);
  - o `watching` é por conexão (`src/server.ts:150`);
  - o `select` não confere o id contra a lista (`src/server.ts:230-235`);
  - `maxPayload: 4096` fecha o socket se o frame for maior (`src/server.ts:114`);
  - `touch()` roda a cada mensagem (`src/server.ts:221`).
- **Acesso:**
  - o prefixo vem do token (`src/server.ts:69`);
  - `hasIdentity` só confere se o header existe (`src/server.ts:70-71`);
  - o bind é em `127.0.0.1` (`src/server.ts:56,125`);
  - **não há checagem de `Origin`** em lugar nenhum.
- **`bin/tower`:**
  - a pasta de estado recebe `chmod 700`, e o token é gerado com `randomBytes` (`bin/tower:80-85`);
  - o gateway recebe a configuração por ambiente (`bin/tower:102`) e reinicia só quando o token muda (`bin/tower:90-93`);
  - publica com `tailscale serve --bg --https=8443` (`bin/tower:123`);
  - o nome DNS sai de `tailscale status --json` (`bin/tower:49-57`).
- **Identidade do Tailscale, conferida ao vivo neste Mac em 2026-10-23.** `tailscale status --json` traz `Self.UserID` e o mapa `User[<id>]` com `LoginName`. ⚠ unverified: que o valor do header `Tailscale-User-Login` injetado pelo `serve` seja igual ao `LoginName`. Vai para o smoke no iPhone, com fallback `TOWER_OWNER`.
- **Viewer:**
  - o xterm é criado com `disableStdin` e nunca aparece na tela (`web/app.js:1-5,19`);
  - `send()` descarta em silêncio sem socket (`web/app.js:589-591`);
  - na reconexão, a página só volta a selecionar depois do `sessions` (`web/app.js:624-630,661`). Até lá o `watching` do servidor é `null`;
  - há espaço livre depois do `</main>` (`web/index.html:30`), e o selo "read-only" fica em `web/index.html:48`.
- **Onde se afirma "somente leitura":**
  - `README.md:8,60-61,72-75`;
  - `package.json:5`;
  - `REVIEW.md:14,22`;
  - `cockpit_tower_wiki/overview.md:21,36,41`;
  - `cockpit_tower_wiki/services/gateway.md:25`;
  - `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md:34,43-45,57`;
  - `cockpit_tower_wiki/_meta/index.md:37`;
  - `bin/tower:2`;
  - `src/protocol.ts:1`, `src/cockpit-client.ts:21`, `web/app.js:1`, `test/fake-cockpit-server.ts:2`.
- **Regras:** nenhuma regra `always_on` em `.agents/rules/` fala em somente leitura ou em tipos de mensagem (busca em `.agents/rules/` vazia).

## §4.1. Resumo e entendimento

O dono quer continuar pelo iPhone o que um agente faz no Mac: mandar texto e as teclas Enter, Esc, Ctrl-C, setas, Tab e Shift-Tab para a sessão aberta. Hoje isso é proibido por decisão. Por isso o trabalho começa por uma **ADR nova que substitui** a de 2026-10-22, e o código só vem depois que o dono aprovar o texto.

A mudança abre **uma única porta**, o `pty.input`, e cerca essa porta de quatro formas:

1. **Por conexão e por sessão.** A página abre em leitura. "Command" liga o modo de comando **só naquela conexão e só para a sessão que ela assiste**. O gateway guarda esse estado e recusa digitação fora dele. O alvo é sempre o `watching` do servidor, nunca um id vindo do navegador.
2. **Por quem e de onde.** Na publicação, o WebSocket só abre com o `Origin` da página. A digitação só vale para o login do Tailscale gravado no `tower on`.
3. **Com registro.** Cada envio vira uma linha num arquivo local `0600`, gravada **antes** do envio. Se a gravação falhar, o envio é recusado.
4. **O resto continua proibido.** `pty.resize`, `pty.kill`, `pty.open`, `pty.ack`, `rpc` e `rpc.res` seguem recusados, com teste, e o tower continua sem nunca enviar `pty.ack`.

No celular, a interface é uma caixa de texto com uma barra de teclas especiais, e o teclado do xterm não é capturado. O gateway traduz nomes de teclas para bytes por uma tabela fixa, igual à do app (§4.0 A), e o texto só passa com caracteres imprimíveis.

## §4.2. Arquivos afetados

**ADR (passo 2, antes do código):**
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (CREATE) — a decisão nova.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — `status: superseded`, `superseded_by`, nota no topo.

**Gateway e CLI:**
- `src/protocol.ts` (UPDATE) — `pty.input` na lista branca, `inputMessage()`, `MAX_INPUT_BYTES`, `ReadOnlyViolation` → `ForbiddenMessage`.
- `src/cockpit-client.ts` (UPDATE) — `input(id, bytes): boolean`.
- `src/input.ts` (CREATE) — tabela de teclas e validação do texto, que viram bytes.
- `src/input-log.ts` (CREATE) — registro append-only `0600`.
- `src/tailnet-identity.ts` (CREATE) — lê `tailscale status --json` e devolve a origem da página e o login do dono.
- `src/server.ts` (UPDATE) — `Origin`, modo de comando por conexão, mensagens `command`/`input`, `maxPayload`.
- `src/main.ts` (UPDATE) — `TOWER_ORIGIN`, `TOWER_OWNER`, `TOWER_INPUT_LOG`.
- `bin/tower` (UPDATE) — descobre origem e dono, passa as variáveis e reinicia o gateway quando a configuração muda.

**Testes:**
- `test/protocol.test.ts`, `test/client.test.ts`, `test/server.test.ts`, `test/fake-cockpit-server.ts` (UPDATE).
- `test/input.test.ts`, `test/input-log.test.ts`, `test/tailnet-identity.test.ts` (CREATE).

**Viewer:**
- `web/index.html`, `web/app.js`, `web/style.css` (UPDATE) — botão "Command", caixa de texto, barra de teclas e selo dinâmico.

**Documentos que deixam de dizer "somente leitura":**
- `README.md` (UPDATE) — intro, "What it never does", "Known limitations" (texto do crédito de fluxo) e a tabela de variáveis.
- `package.json` (UPDATE) — `description`.
- `REVIEW.md` (UPDATE) — contexto (`:14`), linha do cliente do socket (`:22`) e uma linha nova para o caminho de digitação.

🔒 **Rules affected:** none. Nenhuma regra `always_on` (`.agents/rules/mandatory_planning_rule.md`, `.agents/rules/git_branching_rule.md`) descreve o somente leitura ou os tipos de mensagem. O que muda é o `REVIEW.md`, que não é regra e está listado acima.

🔒 **ADRs affected:** `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` é **superada** pela nova, porque a decisão 1 muda, a 2 muda de justificativa e a 4 ganha camadas. A decisão 3 ("uma conexão por espectador") é **confirmada** e passa para a ADR nova. As duas estão na lista acima.

## §4.3. Mudanças e justificativa

### ADR nova — `decisions/2026-10-23_phone-input-client.md`

Segue o template `decisions/_templates/adr.md`, com `work_id`, `supersedes: [decisions/2026-10-22_read-only-client]` e `revisit_when: "fase 2 (k2): pty.resize para o tamanho do celular; ou o cockpit-server passar a repassar flow do pty.open"`. Decisões-chave:

- **Duas camadas, uma porta a mais.**
  - Para o Cockpit: `hello`, `pty.list`, `pty.attach`, `pty.detach` e `pty.input`, e nada mais. `pty.resize`, `pty.kill`, `pty.open`, `pty.ack`, `rpc` e `rpc.res` continuam recusados no `encode`.
  - Do navegador: `ping`, `list`, `select`, `command` e `input`.
- **Modo de comando por conexão, guardado no servidor.**
  - Começa desligado.
  - Liga só para a sessão que a conexão assiste.
  - Desliga ao trocar de sessão, quando a sessão termina e na reconexão (uma conexão nova começa desligada).
  - `input` fora do modo é recusado.
- **O alvo é sempre o `watching` do servidor.** Qualquer id que venha numa mensagem `input` é ignorado. Para ligar o modo, a sessão precisa estar na última lista e não ter terminado.
- **Teclas por nome, bytes no gateway.** A tabela é fixa e igual à do app: setas sempre em CSI, como o app faz (§4.0 A). O texto não pode ter ESC, C0 (fora Tab e quebra de linha) nem C1, então não carrega teclas escondidas nem fecha uma colagem. Quebras de linha viram `\r`. Um texto com várias linhas vai entre `\x1b[200~ … \x1b[201~` quando o emulador do viewer indica `?2004h`.
- **Limites.** Até 16 KiB por envio (`MAX_INPUT_BYTES`), e o frame do navegador sobe para 64 KiB.
- **Acesso.**
  - Ficam o token e o header obrigatório, com listener só em loopback, sem `funnel`.
  - Entra o `Origin` do WebSocket, igual à origem publicada pelo `tower on`.
  - Para digitar, o `Tailscale-User-Login` precisa ser **igual** ao login do dono, lido de `tailscale status --json` no `tower on`.
  - Sem origem, dono ou registro, o gateway sobe em leitura (falha fechado).
- **Registro.**
  - Fica em `~/.cockpit-tower/input.log`, `0600`, numa pasta `0700`, uma linha JSON por envio: `{ts, login, session, kind, key?, bytes, text?}`.
  - É gravado antes do envio, e uma falha de gravação recusa o envio.
  - **Proposta: gravar o texto inteiro.** Custo aceito: um segredo digitado pelo celular fica em claro no disco, no mesmo nível de confiança do arquivo do token. A alternativa (só tamanho e tecla) entra na tabela de descartadas.
  - Sem rotação.
- **`pty.ack` nunca.** Pelo `cockpit-server` o fluxo não é ligado, então o ack não faria nada (§4.0 B). Se fosse ligado, os acks do tower anulariam o controle de fluxo do app. O risco "o shell trava" sai.
- **Consequências registradas:**
  - a digitação do Mac e a do celular se intercalam;
  - Ctrl-C interrompe o agente de verdade;
  - a CLI `cockpit` continua com a ambiguidade de segundo cliente;
  - quebra de linha só na exibição, como antes.
- **Como é policiada:** testes de `encode`; varredura do código-fonte (tipos proibidos fora de `protocol.ts`; o literal `pty.input` também só lá); testes do servidor para cada recusa; `REVIEW.md`.
- **Alternativas descartadas** (tabela do template):
  - capturar o teclado do xterm;
  - permitir digitação a qualquer conexão com o token;
  - deixar o navegador montar os bytes;
  - registrar só os metadados;
  - mandar `pty.ack`;
  - emendar a ADR antiga em vez de substituí-la.

A ADR antiga recebe `status: superseded`, `superseded_by: decisions/2026-10-23_phone-input-client` e uma linha no topo apontando para a nova. O corpo não muda, para servir de histórico.

### `src/protocol.ts`

```ts
// Subset of the Cockpit remote protocol (v2) that cockpit-tower needs: read sessions, and type into one.
export const ALLOWED_OUTBOUND: ReadonlySet<string> = new Set(['hello', 'pty.list', 'pty.attach', 'pty.detach', 'pty.input']);
/** Largest single write to a PTY; the Cockpit protocol sets no limit of its own. */
export const MAX_INPUT_BYTES = 16 * 1024;

export type Outbound = /* existing four */ | { t: 'pty.input'; id: string; d: string };

export class ForbiddenMessage extends Error {}

/** The only constructor of a PTY write in the codebase (a source-scan test enforces it). */
export function inputMessage(id: string, bytes: Uint8Array): Outbound {
  if (bytes.length === 0 || bytes.length > MAX_INPUT_BYTES) throw new ForbiddenMessage(`input of ${bytes.length} bytes refused`);
  return { t: 'pty.input', id, d: Buffer.from(bytes).toString('base64') };
}
```

A mensagem de erro do `encode` passa a ser `refusing to send '<t>': cockpit-tower only sends hello, pty.list, pty.attach, pty.detach and pty.input`.

### `src/cockpit-client.ts`

```ts
/** Writes bytes to a session's PTY. Returns false, with nothing sent, while disconnected. */
input(id: string, bytes: Uint8Array): boolean {
  if (!this.isConnected) return false;
  this.send(inputMessage(id, bytes));
  return true;
}
```

O retorno booleano existe porque `send` descarta em silêncio (`src/cockpit-client.ts:142`). Sem ele, um envio perdido seria registrado como feito. O comentário em `:21` deixa de dizer "Read-only".

### `src/input.ts`

```ts
/** Same bytes Cockpit's own terminal emits (remote_pi keytab_default.dart); arrows always CSI, as the app sends them. */
export const KEYS: Readonly<Record<string, string>> = {
  enter: '\r', esc: '\x1b', tab: '\t', 'shift-tab': '\x1b[Z', 'ctrl-c': '\x03',
  up: '\x1b[A', down: '\x1b[B', right: '\x1b[C', left: '\x1b[D',
};

/** A named key, or composer text: printable only, newlines sent as CR like a terminal paste. Null = refuse. */
export function inputBytes(msg: { key?: unknown; text?: unknown; paste?: unknown }): Buffer | null {
  if (typeof msg.key === 'string') return Object.hasOwn(KEYS, msg.key) ? Buffer.from(KEYS[msg.key]) : null;
  if (typeof msg.text !== 'string' || msg.text === '') return null;
  const text = msg.text.replace(/\r\n?|\n/g, '\r');
  // No ESC, other C0 or C1: text can neither smuggle a key sequence nor close a bracketed paste early.
  if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/.test(text)) return null;
  const out = msg.paste === true && text.includes('\r') ? `\x1b[200~${text}\x1b[201~` : text;
  const bytes = Buffer.from(out, 'utf8');
  return bytes.length <= MAX_INPUT_BYTES ? bytes : null;
}
```

Os bytes saem do gateway, e não do navegador, porque assim a tabela é revisável num lugar só e um navegador comprometido não manda sequências arbitrárias. O texto de uma linha nunca vai com os marcadores de colagem, como numa digitação. O Enter é uma tecla à parte, enviada em outra mensagem, que é como um humano faria.

### `src/input-log.ts`

```ts
export interface InputLog { append(entry: InputLogEntry): boolean }
export interface InputLogEntry { login: string | null; session: string; kind: 'text' | 'key'; key?: string; bytes: number; text?: string }

/** Append-only JSONL, owner-only: opened with O_APPEND and mode 0600, and re-chmodded in case the file pre-existed. */
export function openInputLog(file: string): InputLog {
  const fd = fs.openSync(file, 'a', 0o600);
  fs.fchmodSync(fd, 0o600);
  return { append: (e) => { try { fs.writeSync(fd, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n'); return true; } catch { return false; } } };
}
```

A escrita é síncrona porque são poucos envios, feitos à mão, e o registro precisa estar no disco antes do envio.

### `src/tailnet-identity.ts`

É o mesmo padrão de `src/serve-status.ts`, que o `bin/tower:45` já usa: lê o JSON pela entrada padrão e é testável.

```ts
/** From `tailscale status --json`: the origin the page is served from, and the login of this Mac's owner. */
export function tailnetIdentity(status: unknown, httpsPort: string): { origin: string | null; owner: string | null } {
  // origin: new URL(`https://${Self.DNSName without trailing dot}:${httpsPort}`).origin  (port 443 drops out, as browsers send it)
  // owner:  User[String(Self.UserID)].LoginName
}
// CLI: prints origin and owner on two lines (empty line when unknown).
```

### `src/server.ts`

```ts
// TowerServerOptions
/** Exact Origin of the page (https://<mac>.<tailnet>.ts.net:8443); a WebSocket from any other origin gets 404. */
origin?: string;
/** Absent = read-only, as before. Outside dev, requires `origin` and `owner`. */
input?: { owner: string | null; log: InputLog };

// startTowerServer
if (opts.input && !opts.dev && (!opts.origin || !opts.input.owner)) throw new Error('input needs origin and owner outside --dev');
const originOk = (req: http.IncomingMessage) => !opts.origin || req.headers.origin === opts.origin;
const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 }); // composer text up to MAX_INPUT_BYTES, plus JSON escaping
// upgrade: `|| !originOk(req)` joins the 404 condition; serveViewer(ws, req, opts)
```

Em `serveViewer`:

```ts
const login = req.headers['tailscale-user-login'];
const mayCommand = opts.input !== undefined && (opts.dev === true || login === opts.input.owner);
let commanding: string | null = null; // session id command mode is on for; null = off
let listed = new Set<string>();       // live ids from the last pty.list (sendSessions fills it, skipping exited ones)
post({ type: 'access', input: mayCommand });

const setCommand = (id: string | null) => { commanding = id; post({ type: 'command', on: id !== null, ...(id ? { id } : {}) }); };
// client 'exited': if (id === commanding) setCommand(null)

if (msg.type === 'select' ...) { if (commanding !== null && msg.id !== commanding) setCommand(null); /* existing */ }
if (msg.type === 'command') {
  return setCommand(msg.on === true && mayCommand && watching !== null && listed.has(watching) ? watching : null);
}
if (msg.type === 'input') {
  const target = watching; // never an id from the browser
  const refuse = (reason: string) => post({ type: 'input', ok: false, reason });
  if (!mayCommand || target === null || commanding !== target) return refuse('command_off');
  const bytes = inputBytes(msg);
  if (!bytes) return refuse('invalid');
  if (!client.isConnected) return refuse('cockpit_unavailable');
  const entry = { login: typeof login === 'string' ? login : null, session: target, bytes: bytes.length,
    ...(typeof msg.key === 'string' ? { kind: 'key' as const, key: msg.key } : { kind: 'text' as const, text: String(msg.text) }) };
  if (!opts.input!.log.append(entry)) return refuse('log_failed');
  client.input(target, bytes);
  return post({ type: 'input', ok: true, bytes: bytes.length });
}
```

- **Igualdade exata no login.** Se o header vier duplicado, o Node junta os valores, e a comparação falha fechado.
- **`Origin` no upgrade, e não só no `command`.** Isso também fecha a leitura a outros sites. Em `--dev` sem `origin` configurada, nada muda.
- **O comentário de `:237`** passa a "anything else, including resize or kill attempts, is dropped".

### `src/main.ts`

```ts
const origin = process.env.TOWER_ORIGIN || undefined;
const owner = process.env.TOWER_OWNER || undefined;
const logPath = process.env.TOWER_INPUT_LOG || undefined;
let input;
if (logPath && (dev || (origin && owner))) {
  try { input = { owner: owner ?? null, log: openInputLog(logPath) }; } catch (err) { console.warn(`cockpit-tower: input log unavailable (${(err as Error).message})`); }
}
if (!input) console.warn('cockpit-tower: typing disabled (needs TOWER_INPUT_LOG, TOWER_ORIGIN and TOWER_OWNER); the page is read-only');
```

### `bin/tower`

```bash
# Origin of the page and the tailnet login allowed to type. TOWER_OWNER overrides the login (fallback
# if the Tailscale-User-Login header turns out to differ from LoginName).
identity="$(tailscale status --json 2>/dev/null | node "$ROOT/src/tailnet-identity.ts" "$HTTPS_PORT")" || identity=""
origin="$(sed -n 1p <<<"$identity")"
owner="${TOWER_OWNER:-$(sed -n 2p <<<"$identity")}"
[[ -n "$origin" && -n "$owner" ]] || echo "tower: warning: Tailscale identity unavailable; the page stays read-only"
config="$(printf '%s\n%s\n%s' "$token" "$origin" "$owner")"
# restart when "$STATE/gateway.config" differs (replaces the token-only check at :90-93)
TOWER_PORT=... TOWER_TOKEN="$token" TOWER_ORIGIN="$origin" TOWER_OWNER="$owner" TOWER_INPUT_LOG="$STATE/input.log" nohup ...
(umask 077 && echo "$config" >"$STATE/gateway.config")
```

- **`gateway.config` substitui `gateway.token`.** Ele guarda token, origem e dono, com `0600`. O `cmd_off` apaga os dois (o antigo por compatibilidade).
- **Sigilo:** a origem e o dono passam por ambiente, como o token já passa. O login nunca aparece no `argv` nem é impresso.
- **Cabeçalho do script:** a linha 2 deixa de dizer "read-only".

### Viewer (`web/`)

- **`index.html`:**
  - botão `#command` ("Command", em inglês como o resto da interface; o dono pode pedir "Comandar") na barra do topo, antes do `#dot` (`web/index.html:23`), oculto por padrão;
  - `<footer id="composer" hidden>` depois do `</main>`, com `<textarea autocapitalize="off" autocorrect="off" spellcheck="false">`, botão "Send" e a barra `[data-key]`: ⏎, Esc, ^C, Tab, ⇧Tab, ←, ↑, ↓, →;
  - o selo `:48` vira `#mode` ("read-only" ou "command").
- **`app.js`:**
  - **Cabeçalho.** O comentário de `:1` muda: o viewer passa a enviar texto e teclas, só em modo de comando, e nunca o tamanho.
  - **`send()`** retorna `boolean`. Um envio sem socket mostra "not sent".
  - **`access`** mostra ou esconde o botão. **`command`** abre ou fecha o compositor e atualiza o selo; o estado só muda quando o servidor responde, e a página não assume nada.
  - **Teclas.** Cada tecla manda `{type:'input', key}`.
  - **Texto.** "Send" manda `{type:'input', text, paste: term.modes.bracketedPasteMode}` e limpa a caixa quando chega `{type:'input', ok:true}`. Se o texto tiver várias linhas com `bracketedPasteMode === false`, a página pede `confirm()` ("N lines will run as separate Enter presses").
  - **Desligamento.** No `ws.onclose` e no `select` de outra sessão, o modo desliga localmente, espelhando o servidor.
  - **Erros.** `{ok:false, reason}` aparece no status.
- **`style.css`:** compositor fixo no rodapé com `padding-bottom: env(safe-area-inset-bottom)`, botões de tecla com pelo menos 44 px de altura, e `#view` com espaço embaixo enquanto o compositor está aberto.

### Testes

- **`test/protocol.test.ts`:**
  - `encode(inputMessage('s1', bytes))` passa;
  - `inputMessage` recusa 0 bytes e mais de `MAX_INPUT_BYTES`;
  - os `WRITE_TYPES` restantes (`pty.resize`, `pty.kill`, `pty.open`, `pty.ack`, `rpc`, `rpc.res`) continuam lançando `ForbiddenMessage`.
- **Varredura do código-fonte:**

  ```ts
  const FORBIDDEN = /pty\.(resize|kill|open|ack)\b|['"`]rpc(\.res)?['"`]/; // never named outside protocol.ts
  const INPUT = /pty\.input\b/;                                          // only inputMessage builds it
  ```

  Os dois falham se aparecerem em `src/` ou `web/` fora de `protocol.ts`.
- **`test/input.test.ts`:**
  - os bytes de cada tecla, conferidos contra §4.0 A;
  - tecla desconhecida → `null`, inclusive `__proto__`;
  - `\n` e `\r\n` → `\r`;
  - recusa de ESC, C0 e C1;
  - os marcadores de colagem só aparecem com várias linhas e `paste:true`;
  - o limite em bytes UTF-8.
- **`test/input-log.test.ts`:** o modo `0600` com arquivo novo e com arquivo prévio `0644`; uma linha JSON por chamada, com os campos.
- **`test/tailnet-identity.test.ts`:** origem com porta 8443 e com 443 (sem porta); dono por `Self.UserID`; JSON incompleto → `null`.
- **`test/client.test.ts`:**
  - `:87-101` passa a se chamar "sends only the allowed types" e continua sem `pty.input` quando `input()` não é chamado;
  - um teste novo cobre `input()` (`pty.input` com `d` em base64) e o `false` sem conexão.
- **`test/fake-cockpit-server.ts`:** um `case 'pty.input'` só registra, sem responder `bad_message`. O comentário `:2` muda.
- **`test/server.test.ts`:** o teste `:188-212` passa a "resize and kill attempts are dropped" e mantém a asserção de `ALLOWED_OUTBOUND`. Testes novos, com um registro em pasta temporária:
  1. `input` sem `command` → `ok:false, command_off`, sem `pty.input` no fake;
  2. `command` com outro login → `on:false`, e um `input` depois é recusado;
  3. `Origin` errado ou ausente com `origin` configurada → 404 no upgrade;
  4. caminho feliz: texto e tecla chegam como `pty.input` com os bytes exatos para `s1`, mesmo quando a mensagem traz `id:'s2'`;
  5. `select` de outra sessão → `command on:false`, e o `input` é recusado;
  6. uma conexão nova começa com o modo desligado;
  7. registro que falha → `log_failed`, sem envio;
  8. `startTowerServer` com `input` sem `origin`/`owner` fora do dev → lança erro;
  9. sem `input`, `access.input === false`, ou seja, o comportamento de hoje.

## §4.4. Riscos e impacto

1. **Digitar na sessão errada.** O modo fica preso ao id da sessão no servidor e desliga com troca de sessão, término ou reconexão. O alvo nunca vem do navegador. Há testes para os itens 4 e 5. Ainda assim, um toque em ⏎ ou ^C vai de verdade para o agente: é o objetivo, e o selo "command" fica visível.
2. **Intercalação com o Mac.** O servidor aceita entrada de qualquer conexão (§4.0 A). Digitar nos dois lados ao mesmo tempo mistura os bytes. A ADR registra isso como custo aceito.
3. **Setas em modo de aplicação.** O gateway manda sempre CSI, como o próprio app (`handler.dart:119`). Um programa que só aceite SS3 se comportaria igual no Mac. Conferir no smoke, em um menu do Claude Code.
4. **Segredos no registro.** O texto fica em claro, num arquivo `0600` dentro de uma pasta `0700`. A ADR deixa a escolha explícita, e a alternativa é só tamanho e tecla.
5. **Identidade e `Origin`** ⚠ unverified:
   - igualdade entre `Tailscale-User-Login` e `LoginName`;
   - o `Origin` exato do Safari via `serve`;
   - se o `serve` sobrescreve os headers de identidade.

   **Mitigação:** falha fechado. Login diferente deixa a página só em leitura. `Origin` diferente faz o upgrade dar 404 e a página não carrega o terminal, o que se vê na hora. Fallbacks: `TOWER_OWNER`, e `TOWER_ORIGIN` lido do ambiente se `bin/tower` errar. **Regressão possível:** se a origem calculada estiver errada, a leitura também para. O smoke confere isso primeiro.
6. **Crédito de fluxo.** Não muda: o tower não manda ack, e pelo servidor o fluxo não está ligado (§4.0 B, leitura do código, sem teste ao vivo). Se uma versão futura do Cockpit ligar o fluxo, a `revisit_when` da ADR dispara.
7. **Frame maior (4 KiB → 64 KiB).** O custo de memória por mensagem continua limitado. Um frame acima disso ainda fecha o socket, então a página bloqueia texto acima de 16 KiB antes de enviar.
8. **Reinício por configuração.** Um `tower on` depois de trocar o login do Tailscale reinicia o gateway, como já acontece com o token.

**Risk tier:** `high`. A mudança envia entrada a um terminal e mexe em autenticação e origens permitidas (`REVIEW.md:31,33`).

**Verification:**
- `npm test` com tudo verde (`# fail 0`), incluindo as recusas que continuam. O CI está fora do ar, então trailers, wiki-lint e `npm test` rodam à mão antes do PR.
- **Verificação controlada no Mac** (com `tower on` real, numa aba descartável do Cockpit rodando `cat -v`):
  - **Bytes de cada tecla.**
    - "abc" chega como `abc`;
    - ⏎ termina a linha;
    - Esc aparece como `^[`;
    - as setas aparecem como `^[[A`…`^[[D`;
    - Tab passa;
    - ⇧Tab aparece como `^[[Z`;
    - ^C encerra o `cat`.
  - **Colagem com marcadores.** Depois de `printf '\e[?2004h'; cat -v`, um texto de duas linhas chega como `^[[200~…^[[201~`.
  - **Registro.** `stat -f %Lp ~/.cockpit-tower/input.log` dá `600`, e as linhas batem com o que foi enviado.
  - **Recusas no upgrade.** Um WebSocket local com token e `Origin` errado dá 404.
  - **Recusa por login.** Com `Origin` certo e outro `Tailscale-User-Login`, a resposta é `access.input:false`.
- **Smoke no iPhone, pelo dono:**
  1. a página abre em leitura, sem compositor;
  2. "Command" aparece e abre o compositor;
  3. texto + ⏎ chegam ao Claude Code como se fossem digitados no Mac;
  4. Esc cancela;
  5. as setas navegam um menu;
  6. ⇧Tab troca o modo do Claude;
  7. ^C interrompe;
  8. um texto de várias linhas chega como uma colagem só;
  9. trocar de sessão desliga o modo;
  10. bloquear o telefone e voltar (reconexão) desliga o modo;
  11. a leitura continua igual a antes.

**Revert:**
- `git revert -m 1 <merge>` em `dev` (e em `main`, se já tiver sido promovido), seguido de `bin/tower off && bin/tower on` para o gateway antigo subir.
- Na wiki: a ADR antiga volta a `accepted`, e a nova vira `superseded` com uma nota.
- O `~/.cockpit-tower/input.log` pode ser apagado. Nada é gravado no Cockpit.

## §4.5. Passos de execução

**Etapas.** Recomendo **uma branch e um PR de código**, com dois portões internos, em vez de dividir gateway e viewer em PRs. O gateway sozinho entregaria um caminho de escrita sem uso. O viewer sozinho não funciona. E uma revisão `high` vale mais olhando o caminho inteiro, do clique à PTY.

- [ ] (1) Criar a branch `feat/2026-10-23_phone-terminal-input__tower` a partir de `dev` (thread principal). Mover o cartão k1 para "Em curso" (housekeeping do ciclo de trabalho).
- [ ] (2) Escrever `decisions/2026-10-23_phone-input-client.md` (§4.3) e marcar a ADR antiga como `superseded`. Ela vai junto do trio, no PR de wiki, como nos trios anteriores.
- [ ] 🔒 **(2a) Portão da ADR:** o dono lê e aprova o texto, principalmente estes pontos:
  - conteúdo do registro;
  - nome do botão;
  - limite de 16 KiB;
  - desligar o modo ao trocar de sessão.

  **Nenhum passo de código começa antes.** Se a ADR mudar, este plano recebe edições pontuais.
- [ ] (3) `src/protocol.ts` + `test/protocol.test.ts`, com a varredura dividida em `FORBIDDEN` e `INPUT`.
- [ ] (4) `src/cockpit-client.ts` (`input`), `test/fake-cockpit-server.ts`, `test/client.test.ts`.
- [ ] (5) `src/input.ts` + `test/input.test.ts`.
- [ ] (6) `src/input-log.ts` + `test/input-log.test.ts`.
- [ ] (7) `src/server.ts` + `test/server.test.ts` (testes 1–9).
- [ ] (8) `src/tailnet-identity.ts` + teste; `src/main.ts`; `bin/tower` (identidade, variáveis, `gateway.config`, cabeçalho).
- [ ] (9) **Portão do gateway:** `npm test` verde antes de mexer no viewer.
- [ ] (10) `web/index.html`, `web/app.js`, `web/style.css`.
- [ ] (11) `README.md`, `package.json`, `REVIEW.md`, comentários em `src/` e `test/`. Por fim, `grep -rni "read-only\|somente leitura"` fora de `work/` não deve achar nenhuma afirmação falsa.
- [ ] (12) `npm test`, trailers e wiki-lint, rodados à mão.
- [ ] (13) Verificação controlada no Mac com a aba descartável (§4.4).
- [ ] (14) Revisão pelo agente `reviewer`, tier `high`.
- [ ] (15) Smoke no iPhone pelo dono (§4.4).
- [ ] (16) Execution log, `/wiki-sync` (§4.7) e `/wiki-index decisions`. No PR de wiki do trio, registrar a resolução do k4 ("o tower nunca envia `pty.ack`; o risco de travar não se sustenta pelo servidor") e fechar o cartão (housekeeping do ciclo de trabalho).

## §4.6. Escopo

**Área(s) afetada(s):** `[gateway, viewer, tower-cli]`, sob a branch de escopo único `tower`, como nos trios anteriores que mexeram em gateway e viewer. Não toca `panel/`. O `tower status --json` não muda.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (CREATE, no passo 2) — o `/wiki-sync` só confere os `code_refs` contra o código final.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE, no passo 2) — `superseded`.
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE):
  - "Mensagens que enviamos" ganha `pty.input`;
  - "nunca enviamos" fica sem ele;
  - o risco do crédito de fluxo é corrigido com as citações de §4.0 B;
  - a intercalação de entrada entra nos riscos.
- `cockpit_tower_wiki/services/gateway.md` (UPDATE):
  - o resumo deixa de dizer somente leitura;
  - "Acesso" ganha `Origin`, dono e modo de comando;
  - seção nova para mensagens do navegador e registro de entrada;
  - peças novas (`input.ts`, `input-log.ts`, `tailnet-identity.ts`).
- `cockpit_tower_wiki/flows/tower-on-off.md` (UPDATE) — identidade do Tailscale, `TOWER_ORIGIN`/`TOWER_OWNER`/`TOWER_INPUT_LOG`, `gateway.config` no reinício, `input.log` na pasta de estado.
- `cockpit_tower_wiki/overview.md` (UPDATE) — resumo do produto (`:21`), linha do viewer (`:36`), decisão central (`:41`).
- `cockpit_tower_wiki/_meta/index.md` (UPDATE) — linha do gateway (`:37`).
- `cockpit_tower_wiki/decisions/_index.md` (REGENERATE por `/wiki-index decisions`).
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada desta execução.
