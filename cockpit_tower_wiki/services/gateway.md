---
title: Gateway do tower
type: service
scope:
  area: [gateway, viewer]
status: stable
updated: 2026-10-23
sources: []
code_refs:
  - src/server.ts
  - src/protocol.ts
  - src/input.ts
  - src/input-log.ts
  - src/tailnet-identity.ts
  - src/cockpit-client.ts
  - src/main.ts
  - src/session-info.ts
  - src/cockpit-state.ts
  - web/app.js
related:
  - contracts/cockpit-protocol-v2
  - flows/tower-on-off
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-fullscreen-scroll
  - decisions/2026-10-22_read-only-client
  - work/executions/2026-10-22_read-only-viewer
  - work/executions/2026-10-23_phone-terminal-input
  - work/executions/2026-10-23_phone-pty-resize
  - work/executions/2026-10-23_phone-fullscreen-scroll
---

# Gateway do tower

Processo Node/TypeScript, executado sem build pelo type stripping nativo do Node ≥ 23.6. Ele lê as sessões de terminal do Cockpit e as mostra numa página xterm.js. O dono também pode **digitar na sessão que está assistindo**, com o modo de comando ligado (seção "Digitação pelo celular"). Sem a configuração de entrada, a página fica só em leitura.

## Peças

| Peça | Papel |
|---|---|
| `src/protocol.ts` | codec JSONL e a lista branca de envio, com `pty.input` como única escrita (ver [[contracts/cockpit-protocol-v2]]) |
| `src/cockpit-client.ts` | conecta ao socket, faz o handshake (timeout de 5 s), lista, anexa e reconecta. Na reconexão, reanexa a seleção **atual**, não a do momento da queda (`src/cockpit-client.ts:194-203`) |
| `src/server.ts` | HTTP + WebSocket só em `127.0.0.1` (`src/server.ts:68`), com tabela fixa de rotas |
| `src/input.ts` | tecla por nome ou texto do compositor → bytes: tabela fixa de teclas, texto só imprimível (`src/input.ts:6`, `src/input.ts:25`) |
| `src/input-log.ts` | registro local JSONL, `0600`, só acréscimos (`src/input-log.ts:19-21`) |
| `src/tailnet-identity.ts` | origem da página e login do dono, lidos de `tailscale status --json` (`src/tailnet-identity.ts:10`) |
| `src/session-info.ts` | contexto de cada sessão: projeto, aba, processo, branch e atividade (ver abaixo) |
| `web/app.js` | xterm só como emulador no tamanho da PTY, visão HTML com quebra de linha, e navegação no estilo do Cockpit (barra, faixa de abas, gaveta de workspaces) |
| `src/serve-status.ts` | diz se o `tailscale serve` publica a porta **e** aponta para o gateway (`src/serve-status.ts:10`) |

## Acesso

- **Duas camadas para ler.** Todas as rotas ficam sob o prefixo secreto `/<token>/` **e** exigem o header `Tailscale-User-Login`, que o `tailscale serve` injeta (`src/server.ts:85-87`, `src/server.ts:113`). Fora disso a resposta é 404. Só o header não bastava: qualquer processo local o forja.
- **`Origin` no WebSocket.** Com origem configurada, o upgrade só passa se o `Origin` for igual a ela; senão, 404 (`src/server.ts:89`, `src/server.ts:135`). O navegador sempre manda `Origin` no WebSocket, então a página de outro site não abre o socket.
- **Dono do Tailscale.** Para digitar, o `Tailscale-User-Login` precisa ser **igual** ao login do dono (`src/server.ts:197`). Header repetido chega unido e não bate. Quem não é o dono lê, mas não digita.
- **Falha fechada.** Sem origem, dono ou registro, o gateway sobe só em leitura e avisa no log (`src/main.ts:18-30`). Fora do `--dev`, o servidor recusa subir com entrada sem origem e dono (`src/server.ts:81`).
- **Saúde.** `/healthz` não exige token e responde só `cockpit-tower` (`src/server.ts:108`), para o `bin/tower` reconhecer que a porta é dele.
- **Modo dev.** `--dev` desliga o token e o header, para testes locais. Com entrada ligada, a origem vira `http://127.0.0.1:<porta real>` e continua exigida (`src/server.ts:146`).

## Um espectador = uma conexão com o Cockpit

`serveViewer` (`src/server.ts:183`) abre uma conexão com o Cockpit quando a página conecta e a fecha quando a página sai. Com isso:
- cada página recebe o seu replay;
- a ambiguidade da CLI `cockpit` só existe enquanto alguém está olhando;
- fechar a página desanexa a sessão.

## Digitação pelo celular

Decisão: [[decisions/2026-10-23_phone-input-client]]. Fase 1: texto e teclas na sessão aberta. `pty.kill`, `pty.open`, `pty.ack` e `rpc` continuam proibidos ([[contracts/cockpit-protocol-v2]]).

**Mensagens do navegador** (qualquer outra é descartada, `src/server.ts:456-457`):
- `command {on}`: liga ou desliga o modo de comando (`src/server.ts:449-452`);
- `input {key}` ou `input {text, paste}`: uma tecla por nome, ou o texto do compositor (`src/server.ts:453`);
- `resize {cols, rows}`: o tamanho do celular (seção "Tamanho da PTY").
- `wheel {dir, count, mode, col, row, app}`: a rolagem do agente (seção "Rolagem do agente") (`src/server.ts:455`).

**Mensagens do gateway:**
- `access {input}`: se esta conexão pode digitar (`src/server.ts:356`);
- `command {on, id?}`: o estado do modo;
- `input {ok, bytes}` ou `input {ok:false, reason}`: a resposta de cada envio (`src/server.ts:359-373`);
- `size {id, cols, rows, by}` e `resize {ok:false, reason}`: o tamanho aplicado ou devolvido, e as recusas de resize.
- `wheel {ok:false, reason}`: só as recusas da rolagem; um envio aceito não tem resposta.

**Modo de comando.** É por conexão e começa desligado (`src/server.ts:199`). Só liga se a conexão pode digitar, o gateway não está parando e a sessão assistida está viva na última lista (`src/server.ts:450`). Desliga quando:
- a sessão termina (`src/server.ts:286`);
- o gateway perde o Cockpit, e a lista é esvaziada (`src/server.ts:289-295`);
- a sessão some da lista (`src/server.ts:320`);
- o espectador seleciona outra sessão (`src/server.ts:443`);
- a página fica oculta, por exemplo com o telefone travado (`web/app.js:836`);
- o gateway para (`src/server.ts:153`).

**Alvo.** Sempre a sessão assistida pelo gateway, nunca um id vindo do navegador (`src/server.ts:360`).

**Recusas** (`reason`): `command_off`, `invalid` (tecla desconhecida, texto vazio, com controle ou acima de 16 KiB), `cockpit_unavailable` e `log_failed` (`src/server.ts:359-373`).

**Bytes.** Teclas pela tabela fixa (`src/input.ts:6`). Texto sem controles, com quebras viradas em `\r` (`src/input.ts:19`, `src/input.ts:25`). Texto de várias linhas vai entre `\x1b[200~ … \x1b[201~` quando o emulador do viewer indica que o programa ligou esse modo (`web/app.js:724`).

**Registro.** Cada envio aceito é gravado **antes** de ir ao Cockpit, e uma falha de gravação recusa o envio (`src/server.ts:370`). Uma linha JSON com hora, login, sessão, tipo e bytes, mais a tecla ou o **texto inteiro**, em `~/.cockpit-tower/input.log`, `0600` (`src/input-log.ts:19-21`). Resizes, devoluções e rolagens também entram (tipos `resize`, `restore` e `wheel`; uma linha por mensagem de rolagem).

**Configuração.** `TOWER_ORIGIN`, `TOWER_OWNER` e `TOWER_INPUT_LOG`, que o `bin/tower` preenche ([[flows/tower-on-off]]).

## Tamanho da PTY

Decisão: [[decisions/2026-10-23_phone-pty-resize]]. Fase 2: enquanto o celular está em modo de comando, a PTY tem o tamanho dele; ao sair, o Mac recebe o dele de volta. O app do Cockpit nunca devolve sozinho ([[contracts/cockpit-protocol-v2]], riscos).

- **Medida.** Depois que o gateway confirma o modo, a página mede colunas e linhas da visão, sem o teclado, e manda `resize` (`web/app.js:651-679`). A−/A+ mandam de novo com a mesma altura (`web/app.js:283`). O emulador segue cada `size` que o gateway anuncia (`web/app.js:681`).
- **Cerca.** `applySize` só aceita com o modo ligado e o gateway não parando, para a sessão assistida; exige inteiros e prende em 20–500 × 5–300 (`src/input.ts:37`); recusa `busy` se outro espectador já dimensionou a sessão (`src/server.ts:398`); lê o tamanho do Mac numa lista nova e grava o `resize` no registro antes de enviar (`src/server.ts:390-414`).
- **Devolução, uma vez por ciclo.** Todo desligamento do modo passa por `setCommand(null)`, que enfileira `giveBack` (`src/server.ts:281`). Ele lê uma lista nova e só devolve se a PTY ainda tem o tamanho que o celular pôs; a trava é solta só depois da lista (`src/server.ts:249-270`). Com o Cockpit fora, a devolução fica pendente e roda na reconexão (`src/server.ts:298`). Fechar a página também devolve antes de fechar a conexão com o Cockpit (`src/server.ts:469`).
- **Ordem.** Resizes e devoluções passam por uma fila única por espectador, então off → on → resize nunca devolve depois do tamanho novo.
- **O Mac retoma.** Se a lista periódica mostra outro tamanho para a sessão em comando, o gateway desiste da devolução e anuncia `size by:'mac'` (`src/server.ts:323`).
- **Lista atrasada.** Uma lista tirada antes de um tamanho anunciado sai com o tamanho novo daquela sessão, para não desfazer o emulador (`src/server.ts:208-214`, `src/server.ts:315`).
- **Parada.** `close()` liga `closing`, desliga o modo de cada espectador e espera as devoluções por até 2,5 s, dentro dos 3 s de saída do `main.ts` (`src/server.ts:150-158`, `src/server.ts:175-177`).

## Rolagem do agente

Decisão: [[decisions/2026-10-23_phone-fullscreen-scroll]]. Fase 3: em modo de comando, arrastar um dedo no terminal faz o que a roda do mouse faz no Mac, para os agentes em tela cheia.

- **Formato escolhido pela página, pelas regras do app do Mac.** O viewer acompanha os modos que o xterm não expõe (codificação 1006/1005/1015/1016 e o 1007) com handlers do parser (`web/app.js:45-46`) e decide em `wheelMode` (`web/app.js:53`):
  - mouse ligado pelo programa → botões 64/65, em SGR ou X10;
  - tela alternativa sem mouse → setas;
  - tela normal, ou formato que o gateway não monta → nada, e o arrasto rola a página.
- **Gesto.** Uma linha por altura de linha arrastada, com o dedo para baixo mostrando o conteúdo mais antigo; no máximo uma mensagem por quadro, e as últimas linhas saem mesmo depois que o dedo sai (`web/app.js:766`, `web/app.js:792`). A célula sob o dedo é achada pelas linhas desenhadas, porque a visão junta linhas em branco (`web/app.js:745`).
- **Bytes no gateway.** `wheelBytes` monta só três moldes: SGR `ESC[<64|65;c;rM`, X10 `ESC[M` + bytes crus (até 223) e setas CSI ou SS3 (`src/input.ts:63`). Até 20 eventos por mensagem (`src/input.ts:46`), e a célula é presa ao tamanho atual da PTY, que a lista guarda por sessão e que o `announceSize` atualiza (`src/server.ts:202`, `src/server.ts:212`).
- **Cerca.** `handleWheel` só envia em modo de comando, para a sessão assistida, grava a linha `wheel` antes e manda por `pty.input`; não responde aos envios aceitos (`src/server.ts:376-388`).

## Contexto das sessões

O `pty.sessions` não diz a qual aba cada sessão pertence (ver a lacuna em [[contracts/cockpit-protocol-v2]]). O gateway completa cada sessão com um campo `info`, lido no Mac **sem escrever em nada**:

| Dado | Fonte |
|---|---|
| pasta atual do shell | `/usr/sbin/lsof -a -d cwd -Fpn -p <pids>`, uma chamada por coleta |
| processo em primeiro plano | `/bin/ps -A -o pid=,ppid=,tty=,stat=,comm=`: o topo do grupo com `+` no terminal do shell |
| branch | leitura direta do `.git/HEAD`, sem rodar `git` (`src/session-info.ts:107`) |
| abas e workspaces | `~/.cockpit/bin/cockpit list-tabs --json` e `list-workspaces --json`, só verbos de listagem (`src/session-info.ts:137`) |
| atividade | crescimento do `len` entre duas coletas |

- **Comandos:** rodam por `execFile`, sem shell, com caminhos absolutos, timeout de 2 s e pids validados como inteiros (`src/session-info.ts:66`). Nada que vem do navegador entra nos argumentos.
- **Casamento aba ↔ sessão** (`src/session-info.ts:179`): só pela ordem de criação (os ids `sN` e `tN` crescem juntos), e só quando:
  - os ids são numéricos;
  - as contagens são iguais;
  - os mesmos ids foram vistos na coleta anterior;
  - no máximo um par tem a pasta discordante, e esse par fica sem aba.

  A pasta sozinha nunca decide, porque um shell pode sair da pasta da sua aba enquanto outro entra. Por isso os títulos aparecem a partir da segunda coleta, cerca de 5 s depois de abrir a página.
- **Cache:** o resultado vale 3 s e é compartilhado entre os espectadores (`src/session-info.ts:247`).
- **Reenvio:** a lista é reenviada a cada 5 s por espectador (`src/server.ts:340`). Um pedido que chega durante outro é atendido logo depois. Um `pty.list` sem resposta é abandonado em 10 s (`src/cockpit-client.ts:100`).
- **Falhas:** se a CLI `cockpit` falhar, as sessões seguem sem aba.
- **Estado salvo do Cockpit** (`src/cockpit-state.ts:51`): lido só para leitura em `<raiz>/cockpit/state/`, onde a raiz é o conteúdo de `~/.cockpit/storage_root` ou, por padrão, `~/Documents` (a mesma regra do Cockpit, `src/cockpit-state.ts:32`). Dele saem, por workspace raiz:
  - a ordem da lateral e a cor do avatar (`projects.json`);
  - se a lista de worktrees está expandida (`layouts.json`, um texto JSON por workspace, validado em `src/cockpit-state.ts:60`).

  Também sai o tema (`settings.json` → `themeMode`). Cada sessão leva `workspace.color`, `order`, `rank` (a posição em `list-workspaces`, que ordena os worktrees) e `worktreesExpanded`, e a mensagem `sessions` leva `theme`. Ao navegador só chegam `#rrggbb`, números, booleanos e um de três temas. Arquivo ausente ou inválido vira estado vazio.

## Limites de proteção

| Limite | Valor | Onde |
|---|---|---|
| Tamanho máximo de uma mensagem do navegador | 64 KiB (cabe o texto do compositor) | `src/server.ts:134` |
| Maior escrita numa PTY | 16 KiB | `src/protocol.ts:13` |
| Tamanho de PTY que o celular pode pedir | 20–500 colunas, 5–300 linhas | `src/protocol.ts:16-17` |
| Eventos de roda por mensagem | 20 (X10 só até a célula 223) | `src/input.ts:46-48` |
| Espectador sem atividade é fechado (e devolve o tamanho) | 10 min (código 4408) | `src/server.ts:184` |
| Nova tentativa enquanto o Cockpit está fechado | a cada 3 s | `src/server.ts:185` |
| Espectador lento (buffer acima do limite) é cortado | 8 MiB | `src/server.ts:186` |

Além disso:
- um `select` repetido não refaz o replay (`src/server.ts:442`);
- um frame inválido derruba só aquele espectador, nunca o processo (`src/server.ts:461`);
- a digitação e o tamanho nunca seguem o espectador para outra sessão (`src/server.ts:443`).

## Limitações conhecidas

- O nome das abas depende do casamento por ordem; quando ele não é seguro, a sessão aparece só com projeto, processo e pasta.
- Fora do modo de comando, os agentes em tela cheia mostram só a tela atual; em modo de comando, o arrasto rola o histórico deles ([[decisions/2026-10-23_phone-fullscreen-scroll]]).
- A rolagem do agente não tem inércia nem direção horizontal. Se o replay de 4 MiB não trouxer a sequência em que o programa ligou o mouse, a página pode errar o formato.
- Enquanto o celular comanda, o Mac vê a sessão no tamanho do celular (o resize vale para todos). Girar o telefone com o modo ligado não redimensiona: desligue e ligue o modo.
- Se o gateway morrer à força (SIGKILL) com o modo ligado, o Mac fica no tamanho do celular até a janela ou a divisória dele mudar.
- Digitar no Mac e no celular ao mesmo tempo mistura os bytes ([[contracts/cockpit-protocol-v2]]).
