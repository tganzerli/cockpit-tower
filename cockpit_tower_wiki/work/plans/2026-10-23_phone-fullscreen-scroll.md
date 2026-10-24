---
title: 2026-10-23 — Comandos pelo celular, fase 3: rolar o histórico dos agentes em tela cheia
type: plan
work_id: 2026-10-23_phone-fullscreen-scroll
scope:
  area: [gateway, viewer]
status: approved
risk: high
updated: 2026-10-23
summary: Em modo de comando, o arrasto do dedo vira a roda do mouse (botões 64/65 em SGR ou X10, ou setas), com bytes montados no gateway, posição presa ao tamanho da PTY e registro antes do envio.
topic: [contract, ui]
related:
  - work/tasks/2026-10-23_phone-fullscreen-scroll
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-23_phone-pty-resize
  - services/gateway
---

# Plano — Comandos pelo celular, fase 3: rolar o histórico dos agentes em tela cheia

> Cobre [[work/tasks/2026-10-23_phone-fullscreen-scroll]] (cartão k3). As decisões do dono que estão na task são fixas aqui. Lidos antes: [[decisions/2026-10-23_phone-input-client]], [[decisions/2026-10-23_phone-pty-resize]], [[services/gateway]], `REVIEW.md` e o plano da fase 2 ([[work/plans/2026-10-23_phone-pty-resize]]).

## §4.0. Análises pré-plano

Foram três análises, A, B e C, revalidadas no thread principal, mais a leitura do estado atual (D). As citações `flterm:` apontam para `~/.pub-cache/git/libghostty-a342abbec8f744714bf6c38fb5516acf19114486/packages/flterm/lib/src/` (a versão do `pubspec.lock` do remote_pi `7d923ab`). As citações `libghostty:` apontam para `.../packages/libghostty/lib/src/`. As citações `xterm.d.ts:` apontam para `node_modules/@xterm/xterm/typings/xterm.d.ts` (xterm 6.0.0).

### A. Sessões reais (replay, só leitura, 2026-10-23)

- As duas sessões do Claude Code deixaram ligados `1000h 1002h 1003h 1006h 2004h`: mouse com rastreamento de qualquer movimento, codificação SGR e bracketed paste.
- Os shells comuns ligam só `2004h`.

### B. O que o app do Cockpit faz com a roda

- **Com o mouse ligado pelo programa:**
  - cada passo vira um evento de botão 4/5, protocolo 64 (sobe) ou 65 (desce); 6/7 são horizontais;
  - só o "press", repetido `|passos|` vezes (`flterm: controller/terminal_input.dart:64-80`);
  - sai sem enviar se o rastreamento for `none` (`:65`).
- **Sem mouse, na tela alternativa, com 1007 ligado:** manda setas (`:82-92`).
  - O 1007 é ligado por padrão (`flterm: foundation/terminal_config.dart:69`).
  - As setas saem em SS3 ou CSI conforme o `cursorKeyApplication` (`:89-91`; bytes em `:9`, `:12`).
- **Na tela normal:** não manda nada.
- **Formato.** O codificador nativo segue o que o programa ligou (`libghostty: api/mouse/mouse_encoder.dart:146-152`). Ele suporta X10, UTF-8, SGR, URxvt e SGR-Pixels (`:103`).
  - SGR (1006): `ESC[<64;col;rowM`;
  - X10: `ESC[M` + chr(32+b) chr(32+col) chr(32+row), válido até 223.
- **Coordenadas:** começam em 1 e são a célula sob o ponteiro.
- **Quantidade:** o deslocamento em pixels é quantizado em um evento por altura de célula, e um "clique" da roda dá cerca de 3 eventos (`flterm: input/scroll_gesture_region.dart` ~296-300, ~466-509).

### C. O que o xterm.js do viewer expõe

- `term.modes.mouseTrackingMode`: `'none'|'x10'|'vt200'|'drag'|'any'` (`xterm.d.ts:1932`).
- `term.buffer.active.type`: `'normal'|'alternate'` (`:1507`).
- `term.modes.applicationCursorKeysMode` (`:1911`).
- **A codificação (1005/1006/1015/1016) e o 1007 não são expostos.** O viewer os acompanha com handlers que devolvem `false`; assim o xterm continua tratando a sequência (o handler mais recente é tentado primeiro, `:1809-1817`):
  - `term.parser.registerCsiHandler({prefix:'?', final:'h'|'l'}, cb)` (`:1817`; `prefix` e `final` em `:1772`, `:1782`);
  - `registerEscHandler` para o RIS (`ESC c`) (`:1847`).

### D. Estado atual do tower (fases 1 e 2 em `dev`)

- **`handleInput`** (`src/server.ts:355-369`):
  - alvo `watching`;
  - cerca `mayCommand && commanding === target`;
  - `inputBytes`, depois `log.append` e por fim `client.input`;
  - sempre responde `input {ok…}` (`:368`).
- **`listed` é um `Set` de ids** (`src/server.ts:201`): zerado em `:290`, preenchido em `:310`, consultado em `:311` e `:425`.
- **O tamanho anunciado** à página passa por `announceSize` (`src/server.ts:208-212`). Uma lista atrasada é corrigida por `fresh()` (`:320-323`).
- **Os bytes saem só do gateway:** tabela `KEYS`, setas sempre em CSI (`src/input.ts:5-16`). O `inputBytes` codifica em UTF-8 (`src/input.ts:32`).
- **Varredura:** `pty.input` não pode aparecer fora de `src/protocol.ts` (`test/protocol.test.ts:34`).
- **Viewer:**
  - **A visão não é 1:1 com a PTY.** `screenRows` junta linhas em branco seguidas e corta as finais (`web/app.js:216-233`), inclusive na tela alternativa (`:235-241`).
  - A rolagem nativa decide se a visão segue a saída (`:249-254`).
  - `onInputResult` limpa `pendingText` a cada resposta `input` (`:734-743`).
  - O `select` faz `term.reset()` (`:599`).
  - `fitViewport` fixa a página no viewport visível com o teclado aberto (`:695-702`).
  - A visão: `padding: 6px 8px`, `line-height: 1.3`, `pre-wrap` (`web/style.css:225-237`).
- **O replay tem no máximo 4 MiB** (`src/protocol.ts:71`). Um DECSET anterior a essa janela não chega ao emulador do viewer.

## §4.1. Resumo e entendimento

Os agentes em tela cheia desenham na tela alternativa: o histórico mora no programa, não no terminal. No Mac, rolar manda a roda do mouse ao programa, que se redesenha. No iPhone, hoje, só se vê a tela atual.

O objetivo é que, **em modo de comando**, arrastar o dedo sobre o terminal faça o que a roda faz no Mac, com as mesmas regras do app (§4.0 B). A direção é a rolagem natural do iOS: o dedo para baixo mostra o conteúdo mais antigo, ou seja, roda para cima (64).

O desenho segue as camadas das fases 1 e 2:
- **o viewer escolhe o formato** a partir do seu emulador, que é quem lê o fluxo, e manda `wheel {dir, count, mode, col, row, app}`;
- **o gateway monta os bytes** a partir de moldes fixos, limita a quantidade e a posição ao tamanho atual da PTY e grava uma linha `wheel` **antes** de enviar (falha fechado);
- os bytes vão pelo **mesmo `pty.input`**, sem tipo novo para o Cockpit.

Fora do modo, na tela normal sem mouse, ou quando o formato não é conhecido, o arrasto rola a visão como hoje e nada é enviado.

## §4.2. Arquivos afetados

**ADRs (passo 2, antes do código):**
- `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md` (CREATE) — a decisão nova.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE) — nota de refinamento (decisão 2 ganha `wheel`; decisão 5 estendida) e `related`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE) — `revisit_when` perde o gatilho "fase 3 precisar de outro tamanho" (`:10`, `:100`), porque não precisou; "Abre" (`:112`) registra que o k3 foi feito.

**Gateway:**
- `src/input.ts` (UPDATE) — `wheelBytes()`, `WHEEL_MAX`, tipo `Wheel`.
- `src/input-log.ts` (UPDATE) — tipo `wheel` no `InputLogEntry`.
- `src/server.ts` (UPDATE) — `handleWheel`, mensagem `wheel`, `listed` passa a `Map<id, Size>`.

**Viewer:**
- `web/app.js` (UPDATE) — acompanhamento de 1006/1005/1015/1016/1007, `wheelMode()`, gesto de toque, `liveRows`/`cellAt`, recusas `wheel`, cabeçalho.
- `web/style.css`, `web/index.html`: **sem mudança**.

**Testes:**
- `test/input.test.ts`, `test/input-log.test.ts`, `test/server.test.ts` (UPDATE).
- `test/protocol.test.ts` e `test/client.test.ts`: sem mudança, porque não há tipo novo de saída.

**Documentos:**
- `README.md` (UPDATE) — um item em "Typing from the phone" (`:54-66`).
- `REVIEW.md` (UPDATE) — a linha do caminho de digitação (`:23`) inclui `wheel`/`wheelBytes`.

🔒 **Rules affected:** none. As regras `always_on` (`.agents/rules/mandatory_planning_rule.md`, `.agents/rules/git_branching_rule.md`) não falam de tipos de entrada. O `REVIEW.md` muda, mas não é regra, e está listado acima.

🔒 **ADRs affected:**
- `decisions/2026-10-23_phone-input-client.md` é **refinada**: a decisão 2 (mensagens do navegador) ganha `wheel`, e a decisão 5 ("bytes saem do gateway") passa a valer também para a roda. A decisão 1 (só `pty.input` como escrita de bytes) e as camadas 3–9 ficam **confirmadas**. Continua `accepted` e está na lista acima.
- `decisions/2026-10-23_phone-pty-resize.md` é **confirmada**: a rolagem não precisou de outro tamanho. Só o `revisit_when` e o "Abre" mudam (lista acima).
- `decisions/2026-10-22_read-only-client.md` já está superada e **não é tocada**.

## §4.3. Mudanças e justificativa

### ADR nova — `decisions/2026-10-23_phone-fullscreen-scroll.md`

Segue `decisions/_templates/adr.md`, com:
- `work_id: 2026-10-23_phone-fullscreen-scroll`;
- `supersedes: []`;
- `related: [decisions/2026-10-23_phone-input-client, decisions/2026-10-23_phone-pty-resize, services/gateway, work/plans/2026-10-23_phone-fullscreen-scroll]`;
- `revisit_when: "o app do Cockpit mudar as regras da roda (flterm terminal_input.dart), um agente usar codificação 1005/1015/1016, ou for pedida a rolagem horizontal"`.

Decisões-chave:

1. **A roda é mais uma entrada nomeada.** Para o Cockpit, nada muda: os bytes vão por `pty.input`, montado só por `inputMessage`.
2. **Do navegador:** `wheel {dir:'up'|'down', count, mode:'sgr'|'x10'|'arrows', col, row, app}`, uma mensagem própria.
   - Ela não reaproveita `input`, porque cada resposta `input` mexe no compositor (`web/app.js:734-743`).
   - O gateway **não confirma** envios aceitos; só recusa com `wheel {ok:false, reason}`. Com ~60 mensagens/s, um eco não serviria para nada.
3. **O viewer escolhe o formato, o gateway monta os bytes.** Só existem três moldes:
   - `sgr`: `ESC[<64;c;rM` / `ESC[<65;c;rM`;
   - `x10`: `ESC[M` + `(32+b)(32+c)(32+r)` em bytes crus, recusado se `c` ou `r` > 223;
   - `arrows`: `ESC[A`/`ESC[B`, ou `ESC OA`/`ESC OB` com `app:true`.

   Nenhum outro byte pode sair por esse caminho. O gateway não sabe se o programa ligou o mouse; quem sabe é o emulador do viewer, o único que lê o fluxo.
4. **As regras do Mac (§4.0 B):**
   - rastreamento 1000/1002/1003 → botões 64/65, em SGR se 1006 está ligado, senão em X10;
   - codificação 1005/1015/1016 ligada, ou DECSET 9 → nada (formatos que o gateway não monta);
   - tela alternativa sem mouse e com 1007 ligado → setas;
   - tela normal sem mouse → nada, e o arrasto rola a visão.
5. **Só em modo de comando e para a sessão assistida.** Um id vindo do navegador é ignorado, como em `input`.
6. **Limites:**
   - `count` inteiro ≥ 1, limitado a 20 por mensagem;
   - `col` e `row` inteiros, limitados a 1..cols e 1..rows do tamanho atual da PTY (última lista ou tamanho anunciado);
   - valor não inteiro, direção ou formato desconhecidos → `invalid`.
7. **Direção natural do iOS:** dedo para baixo = roda para cima (conteúdo mais antigo). Um evento por altura de linha arrastada, como o trackpad do Mac.
8. **Registro:** uma linha `kind:'wheel'` por mensagem, com `dir`, `count`, `mode`, `col`, `row` e `bytes`, gravada **antes** do envio. Uma falha de gravação recusa (`log_failed`).

Consequências registradas:
- **A aba do Mac rola junto**, porque o estado é do programa.
- **Com o teclado aberto,** a visão é mais baixa que a PTY: o arrasto rola o agente, e a visão fica presa no fim (caixa de entrada visível). Para ver o alto da tela, basta fechar o teclado.
- **Sem inércia:** o dedo parado para a rolagem, ao contrário do trackpad.
- **Sem rolagem horizontal** (botões 6/7).
- **Replay truncado em 4 MiB** (`src/protocol.ts:71`): se o DECSET ficou antes da janela, o viewer pode errar o formato (§4.4, 1).

Policiamento:
- testes de `wheelBytes` (bytes exatos de cada molde e recusas);
- testes do servidor (cerca, limites, registro antes);
- a varredura de `pty.input` (sem mudança);
- `REVIEW.md:23`.

Alternativas descartadas (tabela):

| Alternativa | Por que foi descartada |
|---|---|
| Bytes montados no navegador | Quebra a decisão 5 da fase 1: o navegador nunca escolhe bytes |
| O gateway acompanhar os DECSET no fluxo de saída | Seria um segundo parser VT no gateway, com o mesmo problema da janela de 4 MiB |
| `input {wheel…}` em vez de `wheel` | A resposta `input` limpa o estado do compositor, e o eco a 60/s seria ruído |
| Mudar a configuração das CLIs | Decisão do dono |
| Botões ou dois dedos para rolar | Decisão do dono: arrastar um dedo |
| Mandar SGR sempre que houver mouse | Um programa em X10 leria lixo; o formato tem de seguir o que o programa ligou |

**ADR da fase 1** (`decisions/2026-10-23_phone-input-client.md`):
- segunda nota no topo, abaixo da de `:28`: "Refinada em 2026-10-23 por [[decisions/2026-10-23_phone-fullscreen-scroll]]: o navegador também manda `wheel`, com bytes montados no gateway e enviados por `pty.input`. As decisões 1, 3–4 e 6–9 continuam valendo";
- `related` ganha a ADR nova;
- `summary` (`:9`) cita as duas refinações;
- `updated` muda. O resto do corpo fica igual, como histórico.

**ADR da fase 2:**
- `revisit_when` (`:10`) e o gatilho (`:100`) perdem "ou a fase 3 (k3) precisar de outro tamanho";
- "Abre" (`:112`) passa a "rolagem em tela cheia: feita em [[decisions/2026-10-23_phone-fullscreen-scroll]], sem outro tamanho".

### `src/input.ts`

```ts
/** Largest wheel batch per message: about seven mouse-wheel notches on the Mac (3 events each). */
export const WHEEL_MAX = 20;
/** X10 puts 32 + n in one byte: coordinates above 223 cannot be encoded. */
const X10_MAX = 223;

export interface Wheel {
  dir: 'up' | 'down';
  count: number;
  mode: 'sgr' | 'x10' | 'arrows';
  col?: number;
  row?: number;
  bytes: Buffer;
}

/**
 * A viewer `wheel` message → the bytes Cockpit's own terminal sends for the same scroll (flterm terminal_input.dart):
 * mouse buttons 64/65 in the encoding the program enabled, or arrows on the alternate screen. Null = refuse.
 */
export function wheelBytes(
  msg: { dir?: unknown; count?: unknown; mode?: unknown; col?: unknown; row?: unknown; app?: unknown },
  size: { cols: number; rows: number },
): Wheel | null {
  const { dir, count, mode } = msg;
  if (dir !== 'up' && dir !== 'down') return null;
  if (!Number.isInteger(count) || (count as number) < 1) return null;
  if (mode !== 'sgr' && mode !== 'x10' && mode !== 'arrows') return null;
  const n = Math.min(count as number, WHEEL_MAX);
  if (mode === 'arrows') {
    const one = (msg.app === true ? '\x1bO' : '\x1b[') + (dir === 'up' ? 'A' : 'B');
    return { dir, count: n, mode, bytes: Buffer.from(one.repeat(n), 'latin1') };
  }
  if (!Number.isInteger(msg.col) || !Number.isInteger(msg.row)) return null;
  const clamp = (v: number, max: number) => Math.min(max, Math.max(1, v));
  const col = clamp(msg.col as number, size.cols);
  const row = clamp(msg.row as number, size.rows);
  const button = dir === 'up' ? 64 : 65;
  let one: Buffer;
  if (mode === 'sgr') one = Buffer.from(`\x1b[<${button};${col};${row}M`, 'latin1');
  else if (col > X10_MAX || row > X10_MAX) return null;
  else one = Buffer.from([0x1b, 0x5b, 0x4d, 32 + button, 32 + col, 32 + row]); // raw bytes, not UTF-8
  return { dir, count: n, mode, col, row, bytes: Buffer.concat(Array<Buffer>(n).fill(one)) };
}
```

- **Quantidade e posição são limitadas, não recusadas**, como no `ptySize`: um arrasto rápido ou um toque na borda tem de funcionar. Tipo errado é recusado.
- **O maior envio** é 20 × `ESC[<65;500;300M` (14 bytes) = 280 bytes, bem abaixo de `MAX_INPUT_BYTES` (`src/protocol.ts:13`).
- **O X10 vai em bytes crus.** Em UTF-8, `chr(32+col)` acima de 127 viraria dois bytes, e o programa leria outra posição.
- O cabeçalho (`:1-2`) passa a citar a ADR nova.

### `src/input-log.ts`

```ts
kind: 'text' | 'key' | 'resize' | 'restore' | 'wheel';
/** Wheel: direction, events sent, format, and the cell (mouse formats only). */
dir?: 'up' | 'down';
count?: number;
mode?: 'sgr' | 'x10' | 'arrows';
col?: number;
row?: number;
```

`bytes` (`:10-11`) passa a valer para text, key e wheel. O comentário de `:1` passa a "typed, scrolled or sized".

### `src/server.ts`

- **`listed` vira `Map<string, Size>`.** Os `.has()` existentes (`:311`, `:425`) continuam iguais.
  - `:290`: `listed = new Map();`
  - `:310`, com `fresh` declarado antes, porque uma lista atrasada não pode desfazer um tamanho anunciado:

    ```ts
    listed = new Map(sessions.filter((s) => s.exit === undefined).map((s) => { const f = fresh(s); return [s.id, { cols: f.cols, rows: f.rows }]; }));
    ```
  - `announceSize` (`:208-212`): `if (listed.has(size.id)) listed.set(size.id, { cols: size.cols, rows: size.rows });`
- **`handleWheel`**, ao lado de `handleInput`, síncrono como ele. Não passa pela fila `serial`: a posição é limitada ao tamanho conhecido no momento, e uma corrida com um resize em voo dá no máximo uma célula fora, que o programa ignora.

  ```ts
  const handleWheel = (msg: Parameters<typeof wheelBytes>[0]) => {
    const target = watching; // never an id from the browser
    const refuse = (reason: string) => post({ type: 'wheel', ok: false, reason });
    if (!mayCommand || target === null || commanding !== target) return refuse('command_off');
    const size = listed.get(target);
    const wheel = size ? wheelBytes(msg, size) : null;
    if (!wheel) return refuse('invalid');
    if (!client.isConnected) return refuse('cockpit_unavailable');
    const { bytes, ...what } = wheel;
    if (!opts.input!.log.append({ login, session: target, kind: 'wheel', ...what, bytes: bytes.length })) return refuse('log_failed');
    if (!client.input(target, bytes)) return refuse('cockpit_unavailable');
    // No ok echo: a drag sends up to one message per frame.
  };
  ```
- **Mensagens:** `if (msg.type === 'wheel') return handleWheel(msg);` entra antes do descarte (`:430`). O tipo de `msg` (`:399-408`) ganha `dir`, `count`, `mode`, `col`, `row` e `app`.
- **Literal do tipo.** O texto `pty.input` continua fora de `server.ts` (varredura, `test/protocol.test.ts:34`).

### `web/app.js`

- **Cabeçalho (`:1-7`):** o viewer também manda a rolagem (roda do mouse ou setas) em modo de comando.
- **Acompanhamento dos modos**, logo depois de criar o `term` (`:27`):

  ```js
  // What the program asked of the mouse that xterm does not expose: the report encoding and alternate scroll (1007).
  const mouseModes = { sgr: false, other: false, altScroll: true };
  function resetMouseModes() { mouseModes.sgr = false; mouseModes.other = false; mouseModes.altScroll = true; }
  const trackModes = (set) => (params) => {
    for (const p of params) {
      if (p === 1006) mouseModes.sgr = set;
      else if (p === 1005 || p === 1015 || p === 1016) mouseModes.other = set; // encodings the gateway does not build
      else if (p === 1007) mouseModes.altScroll = set;
    }
    return false; // xterm still applies the mode
  };
  term.parser.registerCsiHandler({ prefix: '?', final: 'h' }, trackModes(true));
  term.parser.registerCsiHandler({ prefix: '?', final: 'l' }, trackModes(false));
  term.parser.registerEscHandler({ final: 'c' }, () => { resetMouseModes(); return false; }); // RIS

  /** What a drag sends, by Cockpit's own rules (flterm terminal_input.dart); null = the drag scrolls the view. */
  function wheelMode() {
    const tracking = term.modes.mouseTrackingMode;
    if (tracking === 'x10') return null; // DECSET 9: not what the agents use; not sent
    if (tracking !== 'none') return mouseModes.other ? null : mouseModes.sgr ? 'sgr' : 'x10';
    return term.buffer.active.type === 'alternate' && mouseModes.altScroll ? 'arrows' : null;
  }
  ```

  No `select` (`:599`), `resetMouseModes()` ao lado de `term.reset()`.
- **Mapa das linhas desenhadas.** Em `screenRows` (`:219-233`), cada linha anexada empurra seu `y` para `liveRows`, e `liveFrom = from`. `render`/`renderScreen` zeram o mapa antes de redesenhar `liveEl`.
- **Célula sob o dedo.** Com a PTY na largura do celular (fase 2), cada linha da PTY é uma linha visual. A conta parte da **última** linha desenhada, porque o topo de `liveEl` cai no fim da última linha do histórico:

  ```js
  // The cell under the finger, 1-based on the PTY's screen. Blank runs are collapsed in the view (screenRows),
  // so the visual line maps back through liveRows; the gateway clamps whatever this gets wrong.
  function cellAt(p, cell) {
    const rects = liveEl.getClientRects();
    if (!rects.length || !liveRows.length) return { col: 1, row: 1 };
    const fromBottom = Math.floor((rects[rects.length - 1].bottom - p.y) / cell.h);
    const i = liveRows.length - 1 - fromBottom;
    const y = i < 0 ? liveFrom : i < liveRows.length ? liveRows[i] : liveRows.at(-1) + (i - liveRows.length + 1);
    const left = viewEl.getBoundingClientRect().left + parseFloat(getComputedStyle(viewEl).paddingLeft);
    return { col: Math.floor((p.x - left) / cell.w) + 1, row: y - liveFrom + 1 };
  }
  ```

  ⚠ unverified: o retângulo de um `span` em linha no Safari termina na área do texto, não na caixa da linha. O erro (~1–2 px) fica abaixo de meia célula; a conferência controlada mede isso.
- **Gesto**, só em `#view`:

  ```js
  // ---- agent scroll (command mode) -------------------------------------------
  // A one-finger drag scrolls the program like the Mac's trackpad: one event per line height, finger down = older.
  const WHEEL_MAX = 20; // the gateway's limit (src/input.ts)
  let drag = null;
  let pendingWheel = 0;
  let wheelFrame = false;
  viewEl.addEventListener('touchstart', (e) => {
    drag = commandOn && e.touches.length === 1 && wheelMode() ? { y: e.touches[0].clientY, acc: 0, cell: cellSize(), at: null } : null;
  }, { passive: true });
  viewEl.addEventListener('touchmove', (e) => {
    if (!drag) return;
    e.preventDefault(); // the drag scrolls the program, not the page
    const t = e.touches[0];
    drag.acc += t.clientY - drag.y;
    drag.y = t.clientY;
    const n = Math.trunc(drag.acc / drag.cell.h);
    if (n === 0) return;
    drag.acc -= n * drag.cell.h;
    pendingWheel += n;
    drag.at = { x: t.clientX, y: t.clientY };
    if (!wheelFrame) { wheelFrame = true; requestAnimationFrame(flushWheel); }
  }, { passive: false });
  const endDrag = () => { drag = null; };
  viewEl.addEventListener('touchend', endDrag);
  viewEl.addEventListener('touchcancel', endDrag);

  function flushWheel() {
    wheelFrame = false;
    const mode = commandOn ? wheelMode() : null;
    if (!mode || pendingWheel === 0 || !drag) { pendingWheel = 0; return; }
    const count = Math.min(Math.abs(pendingWheel), WHEEL_MAX);
    const dir = pendingWheel > 0 ? 'up' : 'down'; // natural scrolling
    pendingWheel -= Math.sign(pendingWheel) * count;
    const cell = mode === 'arrows' ? {} : cellAt(drag.at, drag.cell);
    send({ type: 'wheel', dir, count, mode, app: term.modes.applicationCursorKeysMode, ...cell });
    if (pendingWheel !== 0) { wheelFrame = true; requestAnimationFrame(flushWheel); }
  }
  ```

  - A decisão de capturar o gesto é tomada no `touchstart`. O formato é recalculado a cada envio, porque o programa pode mudar de modo no meio.
  - `setCommand(false)` (`:640-645`) zera `drag` e `pendingWheel`.
  - Como a rolagem nativa não acontece durante o gesto, `following` (`:250-254`) não muda, e a visão continua presa no fim.
  - `fitViewport` e `restBox` não mudam.
- **Recusas:** `msg.type === 'wheel' && msg.ok === false` → `note(msg.reason === 'invalid' ? 'scroll not sent' : REASONS[msg.reason] || \`scroll not sent: ${msg.reason}\`, 'bad')`, ao lado de `:808`.

### Testes

- **`test/input.test.ts`:**
  1. SGR: `{dir:'up', count:3, mode:'sgr', col:10, row:5}` em 80x24 → `1b5b3c36343b31303b354d` × 3; `down` → `…3635…`.
  2. X10: `up` em 10,5 → `1b5b4d602a25`; col 223 em 300x300 → último byte de coordenada `ff`; col 224 → `null`.
  3. Setas: `up` × 2 → `1b5b411b5b41`; `app:true` → `1b4f41`; `down` → `…42`; sem `col`/`row`.
  4. Limites: `count:100` → 20 eventos; col 0 → 1; col 999 → 80; row 999 → 24.
  5. Recusas: `dir:'left'`; `mode` `'utf8'`, `'urxvt'` ou ausente; `count` `0`, `-1`, `1.5`, `'3'`; `col:'10'` em SGR.
- **`test/input-log.test.ts`:** uma entrada `wheel` vira uma linha JSON com `dir`, `count`, `mode`, `col`, `row` e `bytes`.
- **`test/server.test.ts`.** Usa `inputSetup`/`commanding`/`inputs` (`:286-303`, `:555-559`), com a sessão `s1` em 80x24 (`test/fake-cockpit-server.ts:51`). Helper `wheelTo(v, msg)` manda e espera um `pty.input` novo ou um `wheel` de recusa.
  - Em `:198-223`, um `wheel` sem modo entra entre os descartados (nenhum `pty.input`).
  - Testes novos:
    1. `wheel` sem modo → `ok:false, command_off`, nada no fake;
    2. modo ligado + `{dir:'up', count:3, mode:'sgr', col:10, row:5, id:'s2'}` → `pty.input` para `s1` com os bytes exatos; o registro tem `kind:'wheel', dir:'up', count:3, mode:'sgr'`; não chega resposta `input`;
    3. limites: `col:500, row:500, count:50` → 20 × `ESC[<64;80;24M`;
    4. depois de `resize {cols:45, rows:40}` (fase 2), `col:80` → 45 (tamanho anunciado);
    5. `x10` e `arrows` com `app:true` → bytes exatos;
    6. formato, direção ou quantidade inválidos → `invalid`, nada gravado nem enviado;
    7. registro que falha → `log_failed`, sem envio;
    8. sem a opção `input` → `command_off`.

## §4.4. Riscos e impacto

1. **Bytes errados digitados se o viewer errar o formato.**
   - **Como acontece:** o replay só traz os últimos 4 MiB (`src/protocol.ts:71`). Se o programa ligou o mouse antes dessa janela, o emulador não sabe.
   - **Casos:**
     - nada visto → `none`, e na tela normal o arrasto é nativo, sem envio (seguro);
     - só a tela alternativa vista → setas para um programa que esperava mouse. No Claude Code, isso navega o histórico do prompt, sem Enter;
     - 1000 visto sem o 1006 → `ESC[M…` para um programa em SGR, que pode ler três caracteres como texto.
   - **Mitigação:**
     - os moldes não têm CR nem texto livre;
     - no máximo 20 eventos por mensagem;
     - tudo fica visível e registrado;
     - na prática o programa liga os modos juntos no início, e qualquer DECSET depois da conexão é visto. Reabrir a sessão no Mac, ou o programa redesenhar, não resolve o replay. O dono pode desligar o modo.
2. **O gateway não confere o estado do programa.** É escolha da ADR, e o pior caso é o do item 1.
3. **Coordenadas no Safari** ⚠ unverified (§4.3 `cellAt`). O gateway limita ao tamanho da PTY, então o pior caso é a roda cair numa área que o programa não rola.
4. **`preventDefault` no `touchmove`** com `passive:false` num elemento com `overflow-y:auto` no iOS ⚠ unverified. Plano B: alternar `touch-action: none` em `#view` enquanto `wheelMode()` vale.
5. **Volume do registro:** até ~60 linhas/s durante o arrasto (~150 bytes cada). É aceitável, e o arquivo não tem rotação (como hoje).
6. **Teclado aberto:** o alto da tela do agente não aparece até fechar o teclado (consequência da ADR).
7. **Sem inércia, sem horizontal:** diferente do trackpad. Fica registrado.

**Risk tier:** `high`. A mudança envia entrada a um terminal (`REVIEW.md:33`).

**Verification:**
- `npm test` com tudo verde (`# fail 0`). O CI está fora do ar, então trailers, wiki-lint e `npm test` rodam à mão antes do PR.
- **Conferência controlada no Mac**, com gateway de dev e registro de dev (`README.md:51`), numa aba descartável do Cockpit que roda `stty -icanon -echo; printf '\e[?1049h\e[?1000h\e[?1006h'; cat -v`. Um script de sonda no scratchpad (cliente WebSocket com o `Origin` da página) liga o modo e manda `wheel`:
  - SGR → a aba mostra `^[[<64;10;5M` (× count);
  - depois de `printf '\e[?1006l'` → X10 `^[[M`*%`;
  - sem mouse na tela alternativa → `^[[A`; com `\e[?1h` → `^[OA`;
  - `~/.cockpit-tower/dev-input.log` tem uma linha `wheel` por mensagem;
  - pelo navegador do iPhone na mesma aba: com o dedo descendo, saem botões 64 e uma linha/célula coerente com o toque (mede o ⚠ do `cellAt`); na tela normal (`\e[?1049l\e[?1000l`), o arrasto rola a visão e nada aparece.
- **Smoke no iPhone, pelo dono:**
  1. o Claude Code em tela cheia rola o histórico, e a aba do Mac rola junto;
  2. dedo para baixo = conteúdo mais antigo;
  3. fora do modo, o arrasto rola a visão e nada vai ao registro;
  4. num shell comum, o arrasto rola a visão;
  5. com o teclado aberto, o arrasto rola o agente;
  6. digitação e tamanho da fase 2 continuam iguais.

**Revert:**
- `git revert -m 1 <merge>` em `dev` (e em `main`, se já tiver sido promovido), seguido de `bin/tower off && bin/tower on`.
- Na wiki, a ADR nova vira `superseded` ou `deprecated`, com nota, e as das fases 1 e 2 perdem as notas.
- Nada é gravado no Cockpit.

## §4.5. Passos de execução

Uma branch e um PR de código, como nas fases 1 e 2: o caminho do toque até a PTY é revisado inteiro.

- [ ] (1) Criar a branch `feat/2026-10-23_phone-fullscreen-scroll__tower` a partir de `dev` (thread principal). Mover o k3 para "Em curso" (housekeeping).
- [ ] (2) Escrever `decisions/2026-10-23_phone-fullscreen-scroll.md` e as notas nas ADRs das fases 1 e 2 (§4.3).
- [ ] 🔒 **(2a) Portão da ADR:** o dono aprova o texto, principalmente estes pontos:
  - mensagem `wheel` própria, sem eco de aceite;
  - limite de 20 eventos por mensagem;
  - arrasto nativo quando o formato não é conhecido (1005/1015/1016, DECSET 9) ou com 1007 desligado;
  - com o teclado aberto, o arrasto rola o agente;
  - o risco de formato errado depois de um replay truncado.

  Nenhum código antes disso. Se a ADR mudar, este plano recebe edições pontuais.
- [ ] (3) `src/input.ts` (`wheelBytes`) + `test/input.test.ts`; `src/input-log.ts` + `test/input-log.test.ts`.
- [ ] (4) `src/server.ts` (`listed` como `Map`, `handleWheel`, mensagem) + `test/server.test.ts` (ajuste de `:198-223` e testes 1–8).
- [ ] (5) **Portão do gateway:** `npm test` verde antes de mexer no viewer.
- [ ] (6) `web/app.js` (modos, `wheelMode`, `liveRows`/`cellAt`, gesto, recusas, cabeçalho).
- [ ] (7) `README.md` e `REVIEW.md:23`.
- [ ] (8) `npm test`, trailers e wiki-lint, rodados à mão.
- [ ] (9) Conferência controlada no Mac (§4.4).
- [ ] (10) Revisão pelo agente `reviewer`, tier `high`.
- [ ] (11) Smoke no iPhone pelo dono (§4.4).
- [ ] (12) Execution log, `/wiki-sync` (§4.7) e `/wiki-index decisions`. k3 → Done no PR de wiki do trio (housekeeping, fora do §4.7).

## §4.6. Escopo

**Área(s) afetada(s):** `[gateway, viewer]`, sob a branch de escopo único `tower`, como nas fases 1 e 2. Não toca `src/protocol.ts`, `src/cockpit-client.ts`, `bin/tower`, `panel/` nem `src/main.ts`: nenhum tipo novo de saída e nenhum ciclo de vida novo.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md` (CREATE, no passo 2) — o `/wiki-sync` só preenche os `code_refs` (`src/input.ts`, `src/server.ts`, `web/app.js`) e confere as citações contra o código final.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE, no passo 2) — nota de refinamento, `summary` e `related`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE, no passo 2) — `revisit_when` sem o gatilho do k3; "Abre" registra o k3 feito.
- `cockpit_tower_wiki/services/gateway.md` (UPDATE):
  - as mensagens do navegador ganham `wheel {dir, count, mode, col, row, app}`, e as do gateway ganham `wheel {ok:false, reason}`;
  - seção nova "Rolagem do agente": as regras do Mac, os três moldes, os limites, o tamanho de `listed`, sem eco;
  - "Registro" ganha `wheel`;
  - "Limites de proteção" ganha 20 eventos por mensagem e X10 até 223;
  - "Limitações conhecidas": a linha "Com os agentes em tela cheia, o iPhone mostra só a tela atual" é substituída por teclado aberto, sem inércia, sem horizontal e formato depois de replay truncado.
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — uma linha em `pty.input` (`:47-51`): a rolagem também vai por `pty.input`, com bytes de roda ou setas montados no gateway.
- `cockpit_tower_wiki/overview.md` (UPDATE):
  - `:21`: em modo de comando, arrastar o dedo rola o agente em tela cheia;
  - `:43`: a decisão central cita a ADR nova.
- `cockpit_tower_wiki/decisions/_index.md` (REGENERATE por `/wiki-index decisions`).
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada desta execução.
