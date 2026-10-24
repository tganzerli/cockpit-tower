---
title: 2026-10-24 — Plano: fonte da caixa de texto e gaveta por workspace no viewer
type: plan
work_id: 2026-10-24_compose-font-workspace-nav
scope:
  area: [viewer]
status: approved
risk: medium
updated: 2026-10-24
summary: Ligar a fonte da caixa de texto à fonte do terminal sem o zoom do iOS, e trocar os botões por terminal da gaveta por botões de workspace e worktree.
topic: [ui]
related:
  - services/gateway
---

# Plano — fonte da caixa de texto e gaveta por workspace

## Análises pré-plano

analyses: not needed — mudança pequena e só no viewer (`web/`), em código já lido nesta sessão; o gateway e o protocolo não mudam.

Fatos que o plano usa:

- A caixa de texto tem fonte fixa de 16 px, escolhida para o iOS não dar zoom ao focar 📎 `web/style.css:287-299` (comentário na linha 297).
- A fonte do terminal vale 12 px por padrão, de 11 a 18, salva em `localStorage` e aplicada só em `viewEl` 📎 `web/app.js:309-329`.
- A meta viewport não limita a escala 📎 `web/index.html:5`.
- A gaveta (`renderGroups`) monta, por workspace, um cabeçalho que não é botão (avatar, nome, branch) seguido de um botão por sessão (`sessionRow`); os worktrees viram um subtítulo seguido de botões por sessão; antes de tudo vem a seção "Working now", também com botões por sessão; no fim, "Other terminals" 📎 `web/app.js:463-589`, `web/app.js:402-423`.
- A faixa de abas já mostra as sessões do workspace exato da sessão na tela (`groupOf(s).ws`, o caminho do workspace) 📎 `web/app.js:443-460`, `web/app.js:379-383`.
- `select(session)` troca a sessão, desliga o modo de comando e avisa o gateway 📎 `web/app.js:636-650`; a escolha inicial prefere a aba em foco no Cockpit, depois um agente trabalhando, depois a primeira 📎 `web/app.js:624-630`.

## 4.1. Resumo e entendimento

O dono quer duas coisas na página do iPhone:

1. **O texto digitado ter o tamanho do texto do terminal.** Hoje a caixa usa 16 px e o terminal 12 px, então o que se digita parece maior que o que aparece na sessão. A caixa passa a usar o mesmo tamanho do terminal e a seguir A−/A+. O motivo dos 16 px era evitar o zoom automático do Safari ao focar um campo com fonte menor que 16 px; esse zoom passa a ser evitado pela meta viewport (`maximum-scale=1`). Desde o iOS 10 o Safari ignora esse limite para o gesto de pinça (acessibilidade), então ele só tira o zoom ao focar ⚠ unverified — confirmar no aparelho (passo 6).
2. **A gaveta navegar por workspace.** Como a faixa de abas já lista os terminais do workspace na tela, a gaveta vira a lateral do Cockpit: cada workspace é um botão (avatar, nome, branch, indicador de agente) e cada worktree também. Tocar abre o workspace numa sessão dele; trocar de terminal fica com as abas.

## 4.2. Arquivos afetados

- `web/index.html` — meta viewport.
- `web/style.css` — fonte da caixa de texto; linhas de workspace e worktree da gaveta como botões; remover estilos que deixam de ser usados.
- `web/app.js` — `applyFont`; `renderGroups`; memória da última sessão vista por workspace; escolha da sessão ao tocar num workspace.

**Regras afetadas:** nenhuma.

**ADRs afetadas:** nenhuma. As ADRs do modo de comando ([[decisions/2026-10-23_phone-input-client]], [[decisions/2026-10-23_phone-pty-resize]], [[decisions/2026-10-23_phone-fullscreen-scroll]]) ficam **confirmadas**: entrada e resize não mudam. O tamanho da PTY continua medido pela fonte da visão (`cellSize` mede dentro de `viewEl`, 📎 `web/app.js:697-705`), não pela caixa de texto.

## 4.3. Mudanças e justificativa

### A. Fonte da caixa de texto = fonte do terminal

`web/index.html:5`:

```html
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
```

`web/app.js`, `applyFont`: publicar o tamanho numa variável CSS, para a visão e a caixa lerem o mesmo valor.

```js
function applyFont(size) {
  fontSize = Math.max(FONT_MIN, Math.min(FONT_MAX, size));
  viewEl.style.fontSize = `${fontSize}px`;
  document.documentElement.style.setProperty('--term-font', `${fontSize}px`); // the compose box types at the terminal's size
  ...
}
```

`web/style.css`, `#compose`:

```css
font: var(--term-font, 12px) ui-monospace, "SF Mono", Menlo, monospace; /* the terminal's size; the viewport's maximum-scale stops iOS zooming in */
line-height: 1.3;
```

Com a fonte menor, a altura mínima de 44 px (alvo de toque) fica e o `padding` se mantém; o crescimento automático da caixa (se houver, por `scrollHeight`) continua valendo porque mede a caixa já com a fonte nova.

### B. Gaveta por workspace

Em `web/app.js`:

- **Memória por workspace.** Um `Map` `lastByWs` (caminho do workspace → id da sessão), atualizado em `select()`. Só na memória da página.
- **Sessão ao abrir um workspace.** `openWorkspace(path)`: a última sessão vista naquele workspace se ainda existir; senão a aba em foco no Cockpit dentro dele; senão um agente trabalhando; senão a primeira. Fecha a gaveta e chama `select()` (que já ignora a sessão que está na tela).

```js
function openWorkspace(path) {
  const inWs = sessions.filter((s) => groupOf(s).ws === path);
  const last = sessions.find((s) => s.id === lastByWs.get(path) && groupOf(s).ws === path);
  const pick = last || inWs.find((s) => s.info.tab && s.info.tab.focused) || inWs.find((s) => s.info.tab && s.info.tab.working) || inWs[0];
  closeDrawer();
  if (pick) select(pick);
}
```

- **Linha do workspace vira botão.** O cabeçalho `.ws-head` passa a ser um `<button class="ws-head">` com avatar, nome, branch e, à direita, o indicador (`working` se alguma sessão do workspace principal tem agente trabalhando, senão `activity` se alguma tem saída nova). Fica `active` quando a sessão na tela é desse workspace. O botão de recolher worktrees (`.wt-toggle`) continua ao lado, fora do botão do workspace (botão dentro de botão não é HTML válido), então o cabeçalho vira um `div` com dois botões: o do workspace e o da seta.
- **Workspace só com worktrees abertos.** Um grupo sem sessão no repositório principal (só nos worktrees) mostra o nome como hoje, mas desabilitado — não há sessão para abrir ali. Mostrar worktrees e workspaces sem terminal é o cartão k7, fora deste trabalho.
- **Linha do worktree vira botão.** O `.wt-head` vira `<button class="wt-row">` com o ícone de branch, `nome · branch`, indicador e estado `active`; toca → `openWorkspace(wt.path)`. Some a lista de sessões embaixo dele.
- **"Working now".** Sai a seção com um botão por sessão: o indicador de agente trabalhando passa a ficar na linha do workspace/worktree, e com a seta recolhida ele já aparece na seta 📎 `web/app.js:545-551`. Tocar num workspace com agente trabalhando abre esse agente se não houver sessão vista antes (regra acima).
- **"Other terminals".** Sessões sem workspace não têm nome de workspace para tocar; continuam como uma linha por sessão (`sessionRow(s, 'flat')`), como hoje.
- `sessionRow` fica só para "Other terminals"; `label`/`detail` continuam usados pelas abas e pelo cabeçalho.

Em `web/style.css`: `.ws-head` ganha estilo de botão (largura total, sem borda, `border-radius: 8px`, `.active` com `--row-active`); `.wt-row` herda o recuo de `.wt-head` (50 px) e o estilo de botão; saem `.row.nested` e o recuo de 50 px de `.row` (só sobra o `flat`).

**Por que lembrar a última sessão por workspace:** no Cockpit, voltar a um workspace volta para a aba em que se estava. Sem a memória, tocar no workspace sempre cairia na primeira aba.

## 4.4. Riscos e impacto

- **Tier: `medium`.** Mudança comum de produto, só no viewer. Não toca `pty.input`, `pty.resize` nem o gateway, então fica fora de "Always high risk" 📎 `REVIEW.md:29-36`. `applyFont` já chama `sendSize()`; essa chamada não muda.
- **`maximum-scale=1`:** se o Safari do aparelho respeitar o limite também para a pinça, o dono perde o zoom manual da página. Mitigação: o A−/A+ já cobre o tamanho do texto. Se o teste mostrar que a pinça sumiu e isso incomodar, registramos a divergência e decidimos com o dono (a alternativa é voltar a caixa para 16 px, que não atende o pedido).
- **Hábito:** quem usava "Working now" para pular direto para um agente agora toca no workspace (o indicador mostra qual). É a mudança pedida.
- **Sem teste automatizado do viewer** (cartão k6): a verificação da gaveta é manual.

**Verificação:**

1. `node --check web/app.js` — sem saída, código 0.
2. `npm test` — a suíte do gateway continua verde (o gateway não muda; garante que nada fora de `web/` foi tocado sem querer).
3. No iPhone, com `tower on` e a página aberta (passo 6): caixa com o tamanho do terminal e seguindo A−/A+; sem zoom ao focar; pinça ainda funciona; tocar em workspace e worktree abre o certo, abas mostram os terminais dele, destaque e indicador corretos; "Other terminals" continua abrindo.

**Como reverter:** `git revert` do commit de merge do PR na `dev` (só arquivos de `web/`; nada novo é salvo, a memória por workspace vive só na página aberta).

## 4.5. Passos de execução

1. Criar a branch `feat/2026-10-24_compose-font-workspace-nav__tower` a partir da `dev`, depois da aprovação.
2. `web/index.html`: `maximum-scale=1` na meta viewport.
3. `web/app.js` + `web/style.css`: variável `--term-font` em `applyFont` e no `#compose`.
4. `web/app.js`: `lastByWs` em `select()`, `openWorkspace()`, `renderGroups()` com cabeçalho de workspace e linha de worktree como botões, sem "Working now", "Other terminals" mantido.
5. `web/style.css`: estilos de `.ws-head` como botão, `.wt-row`, remover os que sobram.
6. Validações: `node --check web/app.js`, `npm test`; pedir ao dono o teste no iPhone (roteiro da verificação 3) e registrar o resultado.
7. Revisão de agente (tier `medium`), registro na execução, gate humano.

## 4.6. Escopo

Área: `viewer` (`web/`). Gateway, `bin/tower` e painel não mudam.

## 4.7. Impacto no wiki

- `cockpit_tower_wiki/services/gateway.md` — linha de `web/app.js` na tabela de arquivos: a gaveta passa a navegar por workspace e worktree.
- `cockpit_tower_wiki/overview.md` — linha da área `viewer`: a caixa de texto usa a fonte do terminal; navegação da gaveta por workspace.
