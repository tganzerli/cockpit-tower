---
title: Protocolo do Cockpit (v2) — o subconjunto que consumimos
type: contract
scope:
  area: [gateway]
status: stable
updated: 2026-10-24
summary: O que o tower envia e recebe no socket do cockpit-server (protocolo v2), o que nunca envia (toda escrita menos pty.input e pty.resize) e os riscos de ser um segundo cliente.
sources:
  - https://github.com/jacobaraujo7/remote_pi (commit 7d923ab)
code_refs:
  - src/protocol.ts
  - src/cockpit-client.ts
  - src/session-info.ts
  - src/cockpit-state.ts
  - src/input.ts
related:
  - services/gateway
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-fullscreen-scroll
  - decisions/2026-10-24_phone-new-tab
  - decisions/2026-10-24_phone-close-tab
  - decisions/2026-10-22_read-only-client
  - work/executions/2026-10-22_read-only-viewer
  - work/executions/2026-10-23_phone-terminal-input
  - work/executions/2026-10-23_phone-pty-resize
---

# Protocolo do Cockpit (v2) — o subconjunto que consumimos

O Cockpit roda os terminais num servidor sidecar (`cockpit-server`) que escuta em `~/.cockpit/cockpit-server.sock`. Numa build de desenvolvimento do Cockpit o arquivo é `cockpit-server-debug.sock`. Somos **consumidores** desse contrato: ele é do Cockpit, e não o controlamos. As citações `remote_pi:` apontam para o código dele no commit `7d923ab`.

## Transporte

- **Formato:** JSONL, um objeto por linha, UTF-8 (`remote_pi: cockpit/packages/cockpit_protocol/lib/src/codec.dart:12,23-30`). Uma linha pode ter MBs, porque o replay chega numa linha só. O decodificador não limita o tamanho (`src/protocol.ts:60`).
- **Versão:** `protocolVersion = 2` (`remote_pi: cockpit/packages/cockpit_protocol/lib/src/messages.dart:12`). A documentação do Cockpit ainda diz "v1" e está desatualizada. Suportamos só a v2 (`src/protocol.ts:4`). Versão diferente → `err{code:"version_mismatch"}` e o servidor fecha a conexão.
- **Autenticação:** nenhuma sobre o socket Unix; quem consegue abrir o arquivo pode conectar.

## Mensagens que enviamos

São só estas seis, impostas por lista branca (`src/protocol.ts:10`, `src/protocol.ts:48`):

| Mensagem | Uso |
|---|---|
| `hello {v, client}` | handshake; timeout de 5 s se não houver resposta (`src/cockpit-client.ts:62`) |
| `pty.list {rid}` | listar sessões: `{id,pid,cmd,rows,cols,len,exit?}` |
| `pty.attach {id, from}` | replay a partir de `from` + saída ao vivo, sem duplicar nem perder bytes |
| `pty.detach {id}` | desanexar; fechar a conexão também desanexa de forma implícita |
| `pty.input {id, d}` | digitação: `d` = base64 dos bytes crus (`remote_pi: cockpit/packages/cockpit_protocol/lib/src/messages.dart:345-363`) |
| `pty.resize {id, rows, cols}` | tamanho da PTY no celular, em modo de comando (`remote_pi: cockpit/packages/cockpit_protocol/lib/src/messages.dart:397-413`) |

`pty.input` e `pty.resize` são as escritas liberadas ([[decisions/2026-10-23_phone-input-client]], [[decisions/2026-10-23_phone-pty-resize]]):
- **Um só construtor.** `inputMessage` é o único que monta `pty.input`, e recusa 0 byte e mais de 16 KiB (`src/protocol.ts:13`, `src/protocol.ts:54`).
- **Sem fila.** `CockpitClient.input` devolve `false` enquanto desconectado (`src/cockpit-client.ts:130`).
- **Bytes decididos no tower.** Teclas por uma tabela fixa, igual à do app, e texto sem ESC, controles C0 (fora Tab e quebra de linha), DEL nem C1 (`src/input.ts:6`, `src/input.ts:19`, `src/input.ts:25`; app: `remote_pi: cockpit/lib/app/core/terminal/xterm/src/core/input/keytab/keytab_default.dart:24-32,67-70`).
- **A rolagem também vai por `pty.input`.** O arrasto do celular vira os bytes da roda do mouse (botões 64/65 em SGR ou X10) ou setas, montados no gateway por moldes fixos (`src/input.ts:63`, [[decisions/2026-10-23_phone-fullscreen-scroll]]); não há tipo novo de mensagem.
- **Resize com faixa fixa.** `resizeMessage` é o único que monta `pty.resize`, e recusa fora de 20–500 colunas e 5–300 linhas (`src/protocol.ts:16-17`, `src/protocol.ts:65`).
- **Quem pode mandar** (o dono, em modo de comando, para a sessão assistida): [[services/gateway]], seções "Digitação pelo celular" e "Tamanho da PTY".

## Mensagens que nunca enviamos

`pty.kill`, `pty.open`, `pty.ack`, `rpc`, `rpc.res`. Elas matam processos, abrem PTYs, rodam comandos ou mexem no crédito do app. O `encode` recusa todas (`src/protocol.ts:48`). Um teste falha se algum desses tipos aparecer no código-fonte, ou se os literais `pty.input` e `pty.resize` aparecerem fora de `src/protocol.ts` (`test/protocol.test.ts`, teste "no source file outside protocol.ts names a write message type").

Abrir um terminal pelo celular não usa `pty.open`: o gateway roda a CLI do app (`cockpit new-tab`), e o Cockpit cria a aba e a PTY como no "+" da barra de abas ([[decisions/2026-10-24_phone-new-tab]], `src/new-tab.ts:34`). Uma PTY aberta por `pty.open` não viraria aba no app.

Fechar o terminal assistido pelo celular também não usa `pty.kill`: o gateway roda `cockpit close-tab <id> --json`, e o Cockpit fecha a aba como no (x) do Mac ([[decisions/2026-10-24_phone-close-tab]], `src/close-tab.ts:54`). O app traduz isso num `pty.kill` dele mesmo, que manda só SIGTERM ao grupo da PTY (`remote_pi: cockpit/plugins/cockpit_pty/src/cockpit_pty_unix.c:269-282`).

## Mensagens que recebemos e ignoramos

- `turn.status`: broadcast para todos os clientes.
- `rpc{m:"cli.cmd"}`.
- Qualquer `t` desconhecido.

Nunca respondemos a nenhuma delas (`src/cockpit-client.ts:171`).

## Riscos de ser um segundo cliente

- **Crédito de fluxo (revisto em 2026-10-23).** O `cockpit-server` não repassa o `flow` do `pty.open`: o `PtySpawnSpec` é montado sem `flowControlled` (`remote_pi: cockpit/packages/cockpit_server/lib/src/remote_server.dart:588-596`), e o campo começa em `false` (`remote_pi: cockpit/packages/cockpit_core/lib/src/terminal/terminal_service.dart:13`). Por isso o `ack()` retorna logo e não faz nada (`remote_pi: cockpit/packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:220`). O risco antigo, "se só o tower ficar anexado, o shell trava", não tem apoio no código (leitura, sem teste ao vivo).
  - Se uma versão futura ligar o fluxo, o crédito é por sessão e os acks são subtraídos (`native_terminal_service.dart:222`): os do tower se somariam aos do app e anulariam o controle de fluxo dele. Por isso o tower continua sem mandar `pty.ack` ([[decisions/2026-10-23_phone-input-client]], `revisit_when`).
- **Intercalação de entrada.** O servidor aceita `pty.input` (e `pty.resize`, `pty.kill`) de qualquer conexão, sem exigir attach nem dono (`remote_pi: cockpit/packages/cockpit_server/lib/src/remote_server.dart:652-667`). Digitar no Mac e no celular ao mesmo tempo mistura os bytes. Toda a proteção fica no tower ([[services/gateway]]).
- **O resize vale para todos e o app não sabe dele.** O servidor aplica `pty.resize` à PTY e atualiza o `pty.list`, sem avisar ninguém (`remote_pi: cockpit/packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:292-296`, `cockpit/packages/cockpit_server/lib/src/remote_server.dart:603-616,658-663`). O app só manda o tamanho quando a grade dele muda e nunca o lê de volta (`flterm: controller/terminal_session.dart:460-469`), então quem redimensiona precisa devolver o tamanho. Visto num teste em 2026-10-23: 40×45 ficou valendo 20 s sem o app reagir ([[work/plans/2026-10-23_phone-pty-resize]] §4.0).
- **Fechar a aba no Mac tira a sessão da lista** para todos, inclusive para o celular; o `pty.detach` só tira a assinatura da conexão. Mas o shell da aba fechada **continua vivo**, filho do `cockpit-server`, até receber SIGHUP: visto duas vezes em 2026-10-23 (cartão k21, upstream) ([[work/executions/2026-10-23_phone-pty-resize]]). A causa: o fechamento manda só SIGTERM, que o zsh interativo ignora, e nada fecha o master da PTY. Vale também para o `cockpit close-tab`, reproduzido em 2026-10-24 ([[work/executions/2026-10-24_viewer-close-tab-button]], passo 2).
- **CLI `cockpit`.** Com mais de uma conexão aberta, comandos `cockpit …` sem aba dona falham com "more than one Cockpit is attached" (`remote_pi: cockpit/packages/cockpit_server/lib/src/remote_server.dart:188-226`).
- **Ciclo de vida.** O sidecar morre quando o app fecha. O app mata servidores que não reconhece, então nunca criamos nem substituímos o socket (`src/cockpit-client.ts:48`).

## Lacuna

O `pty.sessions` não traz o id da aba. O app passa `COCKPIT_TAB_ID` no ambiente do `pty.open`, mas o servidor não o lista, e o macOS não deixa outro processo ler o ambiente do shell (`ps -E` e `KERN_PROCARGS2` voltam sem ambiente, verificado em 2026-10-22). É um pedido em aberto ao mantenedor do Cockpit.

**Contorno (2026-10-22):** o gateway liga sessões e abas pela ordem de criação, conferida pela pasta do shell, e lê títulos e workspaces pela CLI `cockpit` ([[services/gateway]], seção "Contexto das sessões"):
- A CLI responde aos verbos de listagem de fora de uma aba e com uma página do tower conectada. Verificado com `env -i HOME=$HOME PATH=$PATH cockpit list-tabs --json` enquanto um espectador estava anexado. O erro "more than one Cockpit is attached" não apareceu para listagens.
- Se o Cockpit passar a listar o id da aba no `pty.sessions`, o contorno pode sair.

## Estado salvo do Cockpit (fonte local, somente leitura)

Fora do protocolo, o app grava o próprio estado em JSON (`remote_pi` `cockpit/lib/app/core/data/setup/storage_location.dart`), em `~/Documents/cockpit/state/` ou na pasta apontada por `~/.cockpit/storage_root`. O tower lê três arquivos (`version: 1`), sem nunca escrever:
- `projects.json`: `data.<id>` = `{id, name, path, color (ARGB), order, image, realm}`, mais chaves internas que começam com `__`. O `id` é o mesmo `workspaceId` da CLI `cockpit`, e um worktree tem id `<id raiz>::<pasta>`.
- `layouts.json`: `data.<id>` = um texto JSON com o layout do workspace, de onde o tower usa só `worktreesExpanded`.
- `settings.json`: `data.app.themeMode` (`system`, `light` ou `dark`).

É um formato interno do app e pode mudar sem aviso; por isso a leitura valida campo a campo e cai no estado vazio ([[services/gateway]]).
