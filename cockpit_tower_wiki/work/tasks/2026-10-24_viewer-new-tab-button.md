---
title: 2026-10-24 — Botão (+) na faixa de abas do viewer para abrir um terminal novo
type: task
work_id: 2026-10-24_viewer-new-tab-button
scope:
  area: [viewer, gateway]
status: in_progress
updated: 2026-10-24
summary: Um botão (+) no fim da faixa de abas do viewer abre um terminal novo no workspace (ou worktree) na tela, como o "+" da barra de abas do Cockpit.
topic: [ui]
related:
  - services/gateway
  - contracts/cockpit-protocol-v2
  - decisions/2026-10-23_phone-input-client
  - work/executions/2026-10-24_compose-font-workspace-nav
---

# Botão (+) na faixa de abas do viewer para abrir um terminal novo

## Contexto

O dono quer, pela página do iPhone, abrir um terminal novo sem precisar do Mac. No Cockpit, a barra de abas de cada pane termina num botão "+" que cria uma aba de terminal nova naquele pane (`remote_pi` `cockpit/lib/app/cockpit/ui/widgets/pane_view.dart`, o `Icon(Icons.add)` perto da linha 1260; ao lado dele há uma seta para escolher o shell, que não entra aqui). O viewer já tem a faixa de abas com os terminais do workspace na tela (`<nav id="tabs">` em `web/index.html`), e desde a tarefa [[work/tasks/2026-10-24_compose-font-workspace-nav]] a gaveta escolhe o workspace e as abas escolhem o terminal. Falta o "+" no lado direito dessa faixa.

**Isto é uma escrita nova.** Hoje o tower só envia `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize` (`ALLOWED_OUTBOUND` em `src/protocol.ts:10`), e a ADR [[decisions/2026-10-23_phone-input-client]] libera do celular só a entrada na sessão assistida. Abrir um terminal é outra capacidade e precisa de decisão do dono antes do código. Caminhos possíveis a avaliar no plano:

- **CLI do Cockpit:** `cockpit new-tab [--cwd <dir>] [--title <name>]`, que abre a aba no app (aparece no Mac e nos `list-tabs`), como o "+". O gateway já roda o binário `cockpit` para `list-tabs`/`list-workspaces` (`src/session-info.ts`). Falta confirmar em qual workspace/pane a aba nasce quando o comando não vem de um terminal do Cockpit.
- **`pty.open` direto no `cockpit-server`:** criaria uma PTY que o app talvez não mostre como aba; provavelmente não serve ao objetivo de "igual ao Cockpit".

**Decisões do dono (2026-10-24):**

- **D1.** Aceita a troca de workspace no Mac. A CLI não abre aba em workspace não selecionado sem trocar a seleção, e isso fica aceito.
- **D2.** O (+) só funciona em modo de comando, com as mesmas cercas da digitação.

## Critérios de aceite

- [ ] A faixa de abas do viewer mostra um botão (+) no lado direito, no estilo do "+" da barra de abas do Cockpit.
- [ ] Tocar no (+) abre um terminal novo no workspace (ou worktree) que está na tela, que aparece também no Cockpit do Mac como aba normal.
- [ ] Depois de criado, o terminal novo aparece na faixa de abas do viewer e fica selecionado.
- [ ] O (+) só funciona com as mesmas garantias da digitação (modo de comando ligado, `Origin`, dono do Tailscale, registro local) — ou com as que a decisão do dono definir; fora disso o botão não aparece ou fica desabilitado.
- [ ] A capacidade nova está registrada numa ADR (nova ou emenda de [[decisions/2026-10-23_phone-input-client]]) e no contrato [[contracts/cockpit-protocol-v2]] ou em [[services/gateway]], conforme o caminho escolhido.
- [ ] `npm test` cobre a rota/mensagem nova do gateway, incluindo a recusa quando as garantias não valem.

## Escopo declarado

**Área(s) afetada(s):** `[viewer, gateway]`

## Fontes relacionadas

### Externas
- `~/app/remote_pi` `cockpit/lib/app/cockpit/ui/widgets/pane_view.dart` — o botão "+" da barra de abas do Cockpit (ícone, tamanho 14, cor `text4`, altura 40).
- `cockpit --help` — verbo `new-tab [--cwd <dir>] [--title <name>] [--split h|v]`, que imprime o id da aba.

### Internas (já no repo)
- `web/index.html` — `<nav id="tabs">`, a faixa de abas.
- `web/app.js` — montagem da faixa de abas e do modo de comando.
- `src/protocol.ts:10` — lista de mensagens que o tower pode enviar.
- `src/server.ts` — as garantias da digitação (`Origin`, dono do Tailscale, modo de comando).
- `src/session-info.ts` — onde o gateway já executa o binário `cockpit`.
- [[decisions/2026-10-23_phone-input-client]] — o que o celular pode fazer hoje.

## Restrições / disciplina

- Risco alto: envia uma ação ao Cockpit a partir do celular (`REVIEW.md`, "Always high risk"). Nada de código antes da decisão do dono e do plano `approved`.
- Não mudar configurações das CLIs nem do Cockpit para fazer funcionar.
- Nunca abrir o Cockpit pelo Bash do Claude para testar; usar uma aba descartável e fechá-la depois (`cockpit close-tab`).
