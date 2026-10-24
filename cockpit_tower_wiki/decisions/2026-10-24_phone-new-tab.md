---
title: 2026-10-24 — Em modo de comando, o (+) do celular abre um terminal no workspace assistido pela CLI do Cockpit
type: adr
work_id: 2026-10-24_viewer-new-tab-button
scope:
  area: [gateway, viewer]
status: accepted
updated: 2026-10-24
summary: O gateway pode rodar um único verbo de escrita da CLI do Cockpit, new-tab, em modo de comando e com registro antes; pasta e aba âncora saem da listagem do Cockpit, nunca do navegador, e o Mac pode trocar de workspace.
revisit_when: "o Cockpit ganhar new-tab --workspace (abrir sem trocar a seleção do Mac), ou o tower passar a ver workspaces remotos"
supersedes: []
superseded_by: ""
sources:
  - https://github.com/jacobaraujo7/remote_pi (commit 177aea97)
code_refs:
  - src/new-tab.ts
  - src/server.ts
  - web/app.js
related:
  - decisions/2026-10-23_phone-input-client
  - services/gateway
  - contracts/cockpit-protocol-v2
  - work/plans/2026-10-24_viewer-new-tab-button
---

# 2026-10-24 — Em modo de comando, o (+) do celular abre um terminal no workspace assistido

## Contexto

O dono quer abrir pelo iPhone um terminal novo no workspace que está vendo, como faz no Mac pelo "+" da barra de abas. Até aqui o tower só lia e, em modo de comando, digitava, dimensionava e rolava a sessão assistida ([[decisions/2026-10-23_phone-input-client]]). Abrir um terminal cria uma PTY: é outra capacidade.

O que pesa (plano [[work/plans/2026-10-24_viewer-new-tab-button]], §4.0, e teste real de 2026-10-24):
- **Pelo protocolo não serve.** Um `pty.open` no `cockpit-server` cria uma PTY que o app não mostra como aba, e esse tipo é proibido desde a primeira ADR.
- **A CLI do Cockpit abre a aba como o "+".** O `cockpit new-tab` funciona fora de um terminal do Cockpit, pelo socket `~/.cockpit/status.sock`. Sozinho, porém, abre no workspace **selecionado no Mac**: o `--cwd` só define a pasta do shell.
- **`--tab-id` ancora a aba.** Com uma aba existente do workspace como âncora, a aba nova nasce naquele workspace, na pane da âncora, e o Mac passa a mostrar esse workspace. Não existe `--workspace`.
- **Workspaces remotos** (id `__remote__…`) abririam o terminal no host, que o tower não vê.

## Decisão

1. **Uma ação fora do protocolo.** O gateway pode rodar **um único** verbo de escrita da CLI do Cockpit, `new-tab`, e só pelo `src/new-tab.ts`. Nenhuma mensagem nova vai ao `cockpit-server`; `pty.open` continua proibido.
2. **Do navegador, `{type:'new-tab'}` sem argumentos.** Pasta, workspace e âncora saem da listagem do Cockpit, nunca do navegador. Qualquer campo extra é ignorado.
3. **As mesmas cercas da digitação:**
   - modo de comando ligado para a sessão assistida;
   - dono do Tailscale e `Origin` igual;
   - falha fechada: sem a opção `input`, não há `new-tab`.
4. **Alvo.** É o workspace da sessão assistida, pela pasta guardada da última lista. Ele precisa:
   - existir na listagem fresca da CLI;
   - não ser remoto;
   - ter uma aba aberta, que vira a âncora (a focada daquele workspace, senão a primeira).
5. **Comando:** `cockpit new-tab --tab-id <âncora> --cwd <pasta> --json`, por `execFile`, sem shell, com timeout de 12 s. Sem `--title` e sem `--split`. O id da âncora precisa casar com `[A-Za-z0-9_-]{1,64}`.
6. **Efeito no Mac (aceito pelo dono):** se o workspace não é o selecionado, o Mac passa a mostrá-lo, com a aba nova ativa na pane da âncora.
7. **Registro:** uma linha `new-tab` (login, sessão assistida, pasta), gravada **antes** de rodar. Se a gravação falhar, nada roda.
8. **Uma de cada vez por conexão.** Um segundo pedido enquanto o primeiro roda é recusado (`opening`).
9. **Depois de abrir,** a lista é reenviada na hora e o viewer seleciona a sessão nova daquele workspace. Isso desliga o modo de comando, como toda troca de sessão.

## Alternativas descartadas

| Alternativa | Por que foi descartada | O que a traria de volta |
|---|---|---|
| `pty.open` no `cockpit-server` | Cria uma PTY que não vira aba no app; continua proibido | — |
| `new-tab` sem `--tab-id` | Abre no workspace selecionado no Mac, não no do celular | — |
| Navegador manda a pasta ou o id | Deixaria o celular escolher o cwd | — |
| Contribuir `new-tab --workspace` antes | Decisão do dono: aceitar a troca agora | O app ganhar o verbo |
| Só para o dono, sem modo de comando | Decisão do dono: mesma cerca da digitação | — |
| Manter o modo de comando na aba nova | O modo nunca segue uma troca de sessão (ADR de digitação, decisão 3) | O uso mostrar que religar o modo atrapalha |

## Consequências

- **Positivas:** o dono abre um terminal pelo celular sem tocar no Mac, e a aba é uma aba normal do Cockpit.
- **Custos aceitos:**
  - O Mac pode trocar de workspace por um toque no celular.
  - O modo de comando desliga depois de abrir; para digitar, ligá-lo de novo.
  - Fechar no Mac uma aba aberta assim deixa o shell vivo, como qualquer aba (k21, do upstream).
  - Workspace remoto fica sem (+).
- **Novas restrições:**
  - Qualquer outro verbo de escrita da CLI do Cockpit exige uma ADR.
  - `node:child_process` só pode aparecer em `src/session-info.ts` (leitura) e em `src/new-tab.ts`.

## Como esta decisão é policiada

- Testes do `createNewTab` com um runner falso:
  - os únicos verbos rodados são `list-tabs`, `list-workspaces` e `new-tab`;
  - os argumentos são exatos;
  - recusas para remoto, ausente e id inválido.
- Testes do servidor:
  - recusa fora do modo de comando, para outro login e sem `input`;
  - registro antes, e recusa quando ele falha;
  - campos do navegador ignorados;
  - um pedido por vez.
- Varredura do código-fonte: `node:child_process` só nos dois arquivos.
- `REVIEW.md`: linha "Terminal novo" e item em "Always high risk".

## Revisão prevista

**Gatilho:** o Cockpit ganhar `new-tab --workspace`, ou o tower passar a ver workspaces remotos.

**O que a implementação deve ensinar:**
- se a troca de workspace no Mac incomoda no uso;
- se a seleção automática acerta a sessão nova;
- se religar o modo de comando depois de abrir atrapalha.

**O que se espera:** confirmar; com `--workspace` no app, refinar para não trocar a seleção.

## Decisões que esta abre ou fecha

- **Fecha:** abrir terminal pelo celular (k23).
- **Abre:** nada novo.

## Referências

- Plano: [[work/plans/2026-10-24_viewer-new-tab-button]] (§4.0, com as citações do `remote_pi`).
- Teste real: [[work/executions/2026-10-24_viewer-new-tab-button]] (passo 1).
