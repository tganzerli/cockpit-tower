---
title: 2026-10-22 — Texto do terminal no estilo do Cockpit (parte 1 da tela do iPhone)
type: plan
work_id: 2026-10-22_terminal-text-cockpit-style
scope:
  area: [viewer]
status: executed
risk: medium
updated: 2026-10-22
summary: Trocar o desenho do xterm por uma visão em HTML que quebra as linhas na largura do iPhone, rola pelo histórico e usa o tema claro do Cockpit, mantendo o xterm como emulador no tamanho da PTY.
topic: [ui]
related:
  - work/tasks/2026-10-22_terminal-text-cockpit-style
  - decisions/2026-10-22_read-only-client
---

# Plano — Texto do terminal no estilo do Cockpit

> Cobre [[work/tasks/2026-10-22_terminal-text-cockpit-style]]. Lido antes: [[work/executions/2026-10-22_read-only-viewer]] (notas abertas) e [[decisions/2026-10-22_read-only-client]].

## §4.0. Análises pré-plano

analyses: not needed — mudança restrita a `web/`, com o comportamento atual e a API do xterm lidos direto no código (citações abaixo). A dúvida que sobra (xterm sem `open()`) é verificada no passo 2, com plano B.

Fatos usados pelo plano:

- O terminal é criado sem `theme`, `fontFamily` nem `lineHeight`. 📎 [`web/app.js:7`](../../../web/app.js)
- `fitToSession` redimensiona o xterm **localmente** para as colunas/linhas da PTY e reduz a fonte para caber na largura, com piso de 6 px. 📎 [`web/app.js:22-28`](../../../web/app.js)
- O servidor serve uma lista fixa de arquivos (`/app.js`, `/style.css`, `vendor/xterm.*`). O plano não cria arquivos novos em `web/` nem mexe em `src/server.ts`. 📎 [`src/server.ts:14-17`](../../../src/server.ts)
- O xterm 6.0.0 expõe o buffer para leitura: tipo `normal`/`alternate`, `baseY`, `isWrapped`, `getCell` e os atributos da célula (cor RGB/paleta, negrito, itálico, sublinhado, inverso, apagado), mais os eventos `onWriteParsed` e `onBufferChange`. 📎 [`node_modules/@xterm/xterm/typings/xterm.d.ts:976,1507,1531,1590,1600,1622,1690-1735`](../../../node_modules/@xterm/xterm/typings/xterm.d.ts)
- Cores lidas dos pixels do print do Cockpit (2026-10-22): fundo `#ffffff`, texto `#000000`, texto apagado `#656565`, cursor `#406ee8`. As cores do Claude Code (laranja, azul dos links, faixa do prompt) são truecolor emitidas pelo próprio Claude e passam direto.

## §4.1. Resumo e entendimento

O humano quer ler o terminal no iPhone com conforto. Isso significa: texto do tamanho certo, linhas quebradas
na largura da tela, a altura inteira aproveitada, rolagem pelo histórico e a cara do Cockpit.

O obstáculo é a decisão de somente leitura: a PTY fica no tamanho do Mac (ex.: 117 × 40) e o programa
(o Claude) posiciona o cursor contando com esse tamanho. Emular num tamanho menor corromperia a tela.
Por isso o plano **separa emular de exibir**:

1. **Emulador:** o xterm continua recebendo os bytes, no tamanho exato da PTY. Ele não é mais mostrado.
2. **Exibição:** uma visão HTML lê o buffer do xterm e desenha o texto com `white-space: pre-wrap`. Linhas
   que o terminal quebrou sozinho (`isWrapped`) viram uma linha lógica só, e o navegador quebra tudo na
   largura do iPhone. O histórico (scrollback) vira parte de um documento com rolagem nativa.

**Limitação a aceitar:** o Claude quebra os próprios parágrafos em 117 colunas com quebras de linha reais.
No iPhone, cada uma dessas linhas quebra de novo, e o parágrafo fica com o lado direito irregular. Juntar
essas linhas exigiria heurística, que fica para uma parte futura se incomodar.

Programas de tela cheia (tela alternativa) não dão para quebrar sem desmontar o layout. Neles a visão
mostra a tela da PTY sem quebra e com rolagem horizontal, como hoje.

## §4.2. Arquivos afetados

- `web/app.js` (UPDATE) — xterm vira emulador oculto com tema; nova visão HTML (desenho incremental, cores, seguir o fim) e controle de fonte.
- `web/index.html` (UPDATE) — contêiner da visão, controle A−/A+ e botão "ir para o fim".
- `web/style.css` (UPDATE) — tema claro, fonte monoespaçada e estilos da visão.

## §4.3. Mudanças e justificativa

### `web/app.js` — emulador

O xterm continua sendo o único lugar que interpreta os bytes; fica num elemento fora da tela. Se o passo 2
mostrar que ele funciona sem `open()`, o elemento nem é criado. `term.resize` continua local (nada vai
para a PTY). O tema do xterm só importa para mapear as cores da paleta na visão:

```js
const PALETTE = [ // ANSI 0-15, tuned for a white background
  '#000000', '#c4302b', '#1a7f37', '#8c692c', '#2f5bd8', '#8a3fb8', '#1b7c83', '#656565',
  '#656565', '#d73a49', '#22863a', '#9a6700', '#406ee8', '#a347d1', '#1f8a94', '#8c8c8c',
];
const term = new Terminal({ disableStdin: true, scrollback: 10000, allowProposedApi: false });
```

As cores 16-255 seguem a fórmula padrão do xterm (cubo 6×6×6 e rampa de cinza). RGB passa direto.

### `web/app.js` — visão HTML incremental

Cada linha física do buffer vira um `<span>` com os trechos de mesmo estilo. Depois dele vem `\n`, a não ser
que a próxima linha tenha `isWrapped`. Os espaços em branco no fim de cada linha são cortados.

```js
// Rows above baseY are scrollback and never change: append them once.
// Rows from baseY to baseY + rows are the live screen: redraw them on each frame.
function render() {
  const buf = term.buffer.active;
  if (buf.type === 'alternate') return renderScreenOnly(buf); // full-screen TUI: no wrap, horizontal scroll
  syncScrollback(buf);   // append rows [renderedBase, buf.baseY); drop rows trimmed off the top
  renderLive(buf);       // replace the live block; trailing empty rows are omitted
  if (following) viewEl.scrollTop = viewEl.scrollHeight;
}
term.onWriteParsed(() => scheduleRender()); // one render per animation frame
```

- **Corte do topo:** quando o scrollback chega a 10 000 linhas, o xterm descarta as mais antigas. A visão
  percebe pela diferença entre o `baseY` e o total de linhas e remove o mesmo número de nós do início.
- **Limpeza:** se o `baseY` diminuir (`clear`, reset ou troca de sessão), a visão é redesenhada do zero.
- **Seguir o fim:** `following` fica verdadeiro enquanto a rolagem está a menos de ~1 linha do fim. Se o
  humano subir, a visão para de puxar e aparece o botão "↓ fim", que volta e retoma o acompanhamento.
- **Espaço vertical:** as linhas vazias abaixo do conteúdo da tela da PTY não são desenhadas, então o texto
  ocupa a altura do iPhone em vez das 40 linhas do Mac.

### `web/app.js` — fonte

Fonte padrão 12 px, entre 11 e 18 px, ajustada por A−/A+ e salva no `localStorage` (leitura e gravação em
`try/catch`). Muda só o `font-size` da visão; o emulador não é afetado.

### `web/index.html`

```html
<span class="font-controls"><button id="font-down" type="button">A−</button><button id="font-up" type="button">A+</button></span>
...
<main id="terminal"><div id="view" class="view"></div><button id="to-end" hidden>↓ fim</button></main>
```

### `web/style.css`

```css
.view {
  background: #ffffff; color: #000000;
  font-family: ui-monospace, "SF Mono", Menlo, monospace;
  line-height: 1.3; white-space: pre-wrap; overflow-wrap: anywhere;
  overflow-y: auto; -webkit-overflow-scrolling: touch;
}
.view.screen { white-space: pre; overflow-x: auto; } /* alternate screen */
```

## §4.4. Riscos e impacto

1. **Os parágrafos do Claude ficam com o lado direito irregular** (limitação descrita em §4.1). Mitigação: ela é aceita como está e entra nas notas para uma parte futura (juntar linhas).
2. **Desempenho com saída rápida.** Mitigação: o histórico é desenhado uma vez só; a cada quadro (`requestAnimationFrame`) só a tela viva (≤ linhas da PTY) é refeita. Na primeira carga, o replay de ~1 MB é desenhado em blocos.
3. **xterm sem `open()` pode não atualizar o buffer.** Mitigação: o passo 2 verifica; o plano B é abrir o xterm num elemento oculto fora da tela.
4. **Erros no corte do topo ou na limpeza deixam a visão diferente do buffer.** Mitigação: um redesenho completo ao trocar de sessão ou ao mudar o tipo de buffer, e um teste de mesa no passo 6 com `clear` e com saída longa.
5. **Perder a garantia de somente leitura.** Mitigação: nenhuma mensagem nova ao WebSocket; o revisor confirma que `send` só recebe `select`, `list` e `ping`.
6. **Seleção e cursor.** A visão não mostra o cursor da PTY (não faz falta numa tela somente leitura). A seleção nativa de texto do iPhone passa a funcionar, o que é um ganho.

**Risk tier:** `medium` — reescreve a exibição do viewer em `web/`, sem tocar listener, PTY ou autenticação (nenhum item do "Always high risk" do `REVIEW.md`). É `medium` e não `low` pelo tamanho da mudança e pela proximidade da garantia de somente leitura.

**Verification:** `npm test` (continua verde, já que o servidor não muda) e `grep -n "send(" web/app.js` mostrando só `select`, `list` e `ping`. Smoke local no navegador do Mac com largura de iPhone e uma sessão real: quebra de linha, histórico, `clear`, `vim` (tela alternativa) e seguir o fim. Smoke no iPhone pelo humano: sessão do Claude legível, sem rolagem horizontal, histórico rolando, A−/A+ salvo depois de recarregar.

**Revert:** `git revert` dos commits da branch. Não há estado persistente além da chave da fonte no `localStorage` do aparelho, que é ignorada se sumir.

## §4.5. Passos de execução

- [x] (1) Criar a branch `feat/2026-10-22_terminal-text-cockpit-style__viewer` a partir de `dev`.
- [x] (2) Verificar se o xterm atualiza o buffer sem `open()`; escolher entre sem elemento e elemento oculto.
- [x] (3) `web/app.js`: xterm como emulador oculto, paleta e conversão de célula para trecho com estilo.
- [x] (4) `web/app.js`: visão incremental (histórico, tela viva, corte do topo, limpeza, tela alternativa, seguir o fim).
- [x] (5) `web/index.html`, `web/style.css` e controle de fonte com persistência.
- [x] (6) Verificação: `npm test`, `grep` e smoke local com largura de iPhone (`clear`, saída longa, `vim`).
- [x] (7) Revisão pelo agente (`reviewer`, contexto limpo).
- [x] (8) Smoke no iPhone pelo humano.

## §4.6. Escopo

**Área(s) afetada(s):** `[viewer]`

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/overview.md` (UPDATE) — linha do viewer: emulador xterm oculto mais visão HTML com quebra de linha, histórico e tema do Cockpit.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — nota: a quebra de linha é só de exibição, a PTY continua no tamanho do Mac.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada desta execução.
