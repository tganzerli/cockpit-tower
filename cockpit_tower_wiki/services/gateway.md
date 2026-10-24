---
title: Gateway do tower
type: service
scope:
  area: [gateway, viewer]
status: stable
updated: 2026-10-24
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
  - src/new-tab.ts
  - src/close-tab.ts
  - src/cockpit-state.ts
  - web/app.js
related:
  - contracts/cockpit-protocol-v2
  - flows/tower-on-off
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-fullscreen-scroll
  - decisions/2026-10-24_phone-new-tab
  - decisions/2026-10-24_phone-close-tab
  - decisions/2026-10-22_read-only-client
  - work/executions/2026-10-22_read-only-viewer
  - work/executions/2026-10-23_phone-terminal-input
  - work/executions/2026-10-23_phone-pty-resize
  - work/executions/2026-10-23_phone-fullscreen-scroll
  - work/executions/2026-10-24_viewer-new-tab-button
  - work/executions/2026-10-24_viewer-close-tab-button
---

# Gateway do tower

Processo Node/TypeScript, executado sem build pelo type stripping nativo do Node ≥ 23.6. Ele lê as sessões de terminal do Cockpit e as mostra numa página xterm.js. O dono também pode **digitar na sessão que está assistindo**, com o modo de comando ligado (seção "Digitação pelo celular"), **abrir um terminal novo** no workspace dela (seção "Terminal novo pelo celular") e **fechar o terminal** que está vendo (seção "Fechar terminal pelo celular"). Sem a configuração de entrada, a página fica só em leitura.

## Peças

| Peça | Papel |
|---|---|
| `src/protocol.ts` | codec JSONL e a lista branca de envio, com `pty.input` como única escrita (ver [[contracts/cockpit-protocol-v2]]) |
| `src/cockpit-client.ts` | conecta ao socket, faz o handshake (timeout de 5 s), lista, anexa e reconecta. Na reconexão, reanexa a seleção **atual**, não a do momento da queda (`src/cockpit-client.ts:194-203`) |
| `src/server.ts` | HTTP + WebSocket só em `127.0.0.1` (`src/server.ts:85`), com tabela fixa de rotas |
| `src/input.ts` | tecla por nome ou texto do compositor → bytes: tabela fixa de teclas, texto só imprimível (`src/input.ts:6`, `src/input.ts:25`) |
| `src/input-log.ts` | registro local JSONL, `0600`, só acréscimos (`src/input-log.ts:20-22`) |
| `src/tailnet-identity.ts` | origem da página e login do dono, lidos de `tailscale status --json` (`src/tailnet-identity.ts:10`) |
| `src/session-info.ts` | contexto de cada sessão: projeto, aba, processo, branch e atividade (ver abaixo) |
| `src/new-tab.ts` | abre um terminal pela CLI do Cockpit (`cockpit new-tab`), uma das duas ações do gateway fora do protocolo (seção "Terminal novo pelo celular") |
| `src/close-tab.ts` | fecha a aba da sessão assistida pela CLI do Cockpit (`cockpit close-tab`), a outra ação fora do protocolo (seção "Fechar terminal pelo celular") |
| `web/app.js` | xterm só como emulador no tamanho da PTY, visão HTML com quebra de linha, e navegação no estilo do Cockpit (barra, faixa de abas, gaveta de workspaces). Na gaveta, workspace e worktree são botões e o terminal se escolhe pelas abas; abrir um workspace volta à última sessão vista nele, senão à aba em foco no Cockpit, a um agente trabalhando ou à primeira (`web/app.js:593`, `web/app.js:616`). A caixa de texto usa a fonte do terminal (`web/app.js:329`) |
| `src/serve-status.ts` | diz se o `tailscale serve` publica a porta **e** aponta para o gateway (`src/serve-status.ts:10`) |

## Acesso

- **Duas camadas para ler.** Todas as rotas ficam sob o prefixo secreto `/<token>/` **e** exigem o header `Tailscale-User-Login`, que o `tailscale serve` injeta (`src/server.ts:102-104`, `src/server.ts:130`). Fora disso a resposta é 404. Só o header não bastava: qualquer processo local o forja.
- **`Origin` no WebSocket.** Com origem configurada, o upgrade só passa se o `Origin` for igual a ela; senão, 404 (`src/server.ts:106`, `src/server.ts:152`). O navegador sempre manda `Origin` no WebSocket, então a página de outro site não abre o socket.
- **Dono do Tailscale.** Para digitar, o `Tailscale-User-Login` precisa ser **igual** ao login do dono (`src/server.ts:223`). Header repetido chega unido e não bate. Quem não é o dono lê, mas não digita.
- **Falha fechada.** Sem origem, dono ou registro, o gateway sobe só em leitura e avisa no log (`src/main.ts:20-33`). Fora do `--dev`, o servidor recusa subir com entrada sem origem e dono (`src/server.ts:98`).
- **Saúde.** `/healthz` não exige token e responde só `cockpit-tower` (`src/server.ts:125`), para o `bin/tower` reconhecer que a porta é dele.
- **Modo dev.** `--dev` desliga o token e o header, para testes locais. Com entrada ligada, a origem vira `http://127.0.0.1:<porta real>` e continua exigida (`src/server.ts:163`).

## Um espectador = uma conexão com o Cockpit

`serveViewer` (`src/server.ts:208`) abre uma conexão com o Cockpit quando a página conecta e a fecha quando a página sai. Com isso:
- cada página recebe o seu replay;
- a ambiguidade da CLI `cockpit` só existe enquanto alguém está olhando;
- fechar a página desanexa a sessão.

## Digitação pelo celular

Decisão: [[decisions/2026-10-23_phone-input-client]]. Fase 1: texto e teclas na sessão aberta. `pty.kill`, `pty.open`, `pty.ack` e `rpc` continuam proibidos ([[contracts/cockpit-protocol-v2]]).

**Mensagens do navegador** (qualquer outra é descartada, `src/server.ts:609-610`):
- `command {on}`: liga ou desliga o modo de comando (`src/server.ts:600-603`);
- `input {key}` ou `input {text, paste}`: uma tecla por nome, ou o texto do compositor (`src/server.ts:604`);
- `resize {cols, rows}`: o tamanho do celular (seção "Tamanho da PTY").
- `wheel {dir, count, mode, col, row, app}`: a rolagem do agente (seção "Rolagem do agente") (`src/server.ts:606`).
- `new-tab`, sem argumentos: abre um terminal no workspace da sessão assistida (seção "Terminal novo pelo celular") (`src/server.ts:607`).
- `close-tab`, depois `close-tab {confirm:true}`: os dois passos para fechar a aba da sessão assistida (seção "Fechar terminal pelo celular") (`src/server.ts:608`).

**Mensagens do gateway:**
- `access {input}`: se esta conexão pode digitar (`src/server.ts:394`);
- `command {on, id?}`: o estado do modo;
- `input {ok, bytes}` ou `input {ok:false, reason}`: a resposta de cada envio (`src/server.ts:397-411`);
- `size {id, cols, rows, by}` e `resize {ok:false, reason}`: o tamanho aplicado ou devolvido, e as recusas de resize.
- `wheel {ok:false, reason}`: só as recusas da rolagem; um envio aceito não tem resposta.
- `new-tab {ok:true, folder}` ou `new-tab {ok:false, reason}`: o resultado do terminal novo.
- `close-tab {stage:'confirm', title}`, `close-tab {ok:true, id}` ou `close-tab {ok:false, reason}`: o pedido de confirmação com o título da aba no Cockpit, o fechamento ou a recusa.

**Modo de comando.** É por conexão e começa desligado (`src/server.ts:225`). Só liga se a conexão pode digitar, o gateway não está parando e a sessão assistida está viva na última lista (`src/server.ts:601`). Desliga quando:
- a sessão termina (`src/server.ts:319`);
- o gateway perde o Cockpit, e a lista é esvaziada (`src/server.ts:322-330`);
- a sessão some da lista (`src/server.ts:356`);
- o espectador seleciona outra sessão (`src/server.ts:594`);
- a página fica oculta, por exemplo com o telefone travado (`web/app.js:978`);
- o gateway para (`src/server.ts:170`).

**Alvo.** Sempre a sessão assistida pelo gateway, nunca um id vindo do navegador (`src/server.ts:398`).

**Recusas** (`reason`): `command_off`, `invalid` (tecla desconhecida, texto vazio, com controle ou acima de 16 KiB), `cockpit_unavailable` e `log_failed` (`src/server.ts:397-411`).

**Bytes.** Teclas pela tabela fixa (`src/input.ts:6`). Texto sem controles, com quebras viradas em `\r` (`src/input.ts:19`, `src/input.ts:25`). Texto de várias linhas vai entre `\x1b[200~ … \x1b[201~` quando o emulador do viewer indica que o programa ligou esse modo (`web/app.js:866`).

**Registro.** Cada envio aceito é gravado **antes** de ir ao Cockpit, e uma falha de gravação recusa o envio (`src/server.ts:408`). Uma linha JSON com hora, login, sessão, tipo e bytes, mais a tecla ou o **texto inteiro**, em `~/.cockpit-tower/input.log`, `0600` (`src/input-log.ts:20-22`). Resizes, devoluções, rolagens e terminais novos também entram (tipos `resize`, `restore`, `wheel`, `new-tab`, com a pasta em `folder`, e `close-tab`, com a aba em `tab` e o título em `title`; uma linha por mensagem de rolagem) (`src/input-log.ts:8`).

**Configuração.** `TOWER_ORIGIN`, `TOWER_OWNER` e `TOWER_INPUT_LOG`, que o `bin/tower` preenche ([[flows/tower-on-off]]).

## Tamanho da PTY

Decisão: [[decisions/2026-10-23_phone-pty-resize]]. Fase 2: enquanto o celular está em modo de comando, a PTY tem o tamanho dele; ao sair, o Mac recebe o dele de volta. O app do Cockpit nunca devolve sozinho ([[contracts/cockpit-protocol-v2]], riscos).

- **Medida.** Depois que o gateway confirma o modo, a página mede colunas e linhas da visão, sem o teclado, e manda `resize` (`web/app.js:772-800`). A−/A+ mandam de novo com a mesma altura (`web/app.js:291`). O emulador segue cada `size` que o gateway anuncia (`web/app.js:802`).
- **Cerca.** `applySize` só aceita com o modo ligado e o gateway não parando, para a sessão assistida; exige inteiros e prende em 20–500 × 5–300 (`src/input.ts:37`); recusa `busy` se outro espectador já dimensionou a sessão (`src/server.ts:548`); lê o tamanho do Mac numa lista nova e grava o `resize` no registro antes de enviar (`src/server.ts:540-564`).
- **Devolução, uma vez por ciclo.** Todo desligamento do modo passa por `setCommand(null)`, que enfileira `giveBack` (`src/server.ts:314`). Ele lê uma lista nova e só devolve se a PTY ainda tem o tamanho que o celular pôs; a trava é solta só depois da lista (`src/server.ts:281-302`). Com o Cockpit fora, a devolução fica pendente e roda na reconexão (`src/server.ts:333`). Fechar a página também devolve antes de fechar a conexão com o Cockpit (`src/server.ts:622`).
- **Ordem.** Resizes e devoluções passam por uma fila única por espectador, então off → on → resize nunca devolve depois do tamanho novo.
- **O Mac retoma.** Se a lista periódica mostra outro tamanho para a sessão em comando, o gateway desiste da devolução e anuncia `size by:'mac'` (`src/server.ts:360`).
- **Lista atrasada.** Uma lista tirada antes de um tamanho anunciado sai com o tamanho novo daquela sessão, para não desfazer o emulador (`src/server.ts:240-246`, `src/server.ts:351`).
- **Parada.** `close()` liga `closing`, desliga o modo de cada espectador e espera as devoluções por até 2,5 s, dentro dos 3 s de saída do `main.ts` (`src/server.ts:167-175`, `src/server.ts:200-202`).

## Rolagem do agente

Decisão: [[decisions/2026-10-23_phone-fullscreen-scroll]]. Fase 3: em modo de comando, arrastar um dedo no terminal faz o que a roda do mouse faz no Mac, para os agentes em tela cheia.

- **Formato escolhido pela página, pelas regras do app do Mac.** O viewer acompanha os modos que o xterm não expõe (codificação 1006/1005/1015/1016 e o 1007) com handlers do parser (`web/app.js:49-50`) e decide em `wheelMode` (`web/app.js:57`):
  - mouse ligado pelo programa → botões 64/65, em SGR ou X10;
  - tela alternativa sem mouse → setas;
  - tela normal, ou formato que o gateway não monta → nada, e o arrasto rola a página.
- **Gesto.** Uma linha por altura de linha arrastada, com o dedo para baixo mostrando o conteúdo mais antigo; no máximo uma mensagem por quadro, e as últimas linhas saem mesmo depois que o dedo sai (`web/app.js:908`, `web/app.js:934`). A célula sob o dedo é achada pelas linhas desenhadas, porque a visão junta linhas em branco (`web/app.js:887`).
- **Bytes no gateway.** `wheelBytes` monta só três moldes: SGR `ESC[<64|65;c;rM`, X10 `ESC[M` + bytes crus (até 223) e setas CSI ou SS3 (`src/input.ts:63`). Até 20 eventos por mensagem (`src/input.ts:46`), e a célula é presa ao tamanho atual da PTY, que a lista guarda por sessão e que o `announceSize` atualiza (`src/server.ts:228`, `src/server.ts:244`).
- **Cerca.** `handleWheel` só envia em modo de comando, para a sessão assistida, grava a linha `wheel` antes e manda por `pty.input`; não responde aos envios aceitos (`src/server.ts:414-426`).

## Terminal novo pelo celular

Decisão: [[decisions/2026-10-24_phone-new-tab]]. Um (+) fixo na borda direita da faixa de abas, como o "+" da barra de abas do Cockpit, abre um terminal no workspace (ou worktree) da sessão assistida (`web/app.js:482`, `web/style.css:203`). Ele só aparece para quem pode digitar e só acende em modo de comando.

- **Sem argumentos do navegador.** A página manda só `{type:'new-tab'}`. A pasta é a do workspace da sessão assistida, guardada pelo gateway da última lista (`src/server.ts:230`, `src/server.ts:365`).
- **Cerca.** É a mesma da digitação: `mayCommand`, modo de comando ligado para `watching`, e a linha `new-tab` gravada antes de rodar. Só um (+) por vez **no gateway inteiro**, contando o pareamento descrito em "Fechar terminal pelo celular" (`src/server.ts:429-456`, `src/server.ts:435`).
- **Comando.** `createNewTab` confere a pasta numa listagem fresca da CLI, recusa workspace remoto (id `__remote__…`) e usa uma aba daquele workspace como âncora. Depois roda `cockpit new-tab --tab-id <âncora> --cwd <pasta> --json` por `execFile`, sem shell e com timeout de 12 s (`src/new-tab.ts:18`, `src/new-tab.ts:28-34`). O `--tab-id` faz o Cockpit abrir a aba naquele workspace e na pane da âncora; se o workspace não está selecionado, **o Mac troca para ele**. O `focused` da listagem vale para o app inteiro, então a âncora costuma ser a primeira aba do workspace. Um id de aba que viraria flag é descartado (`src/new-tab.ts:13`).
- **Depois.** O gateway reenvia a lista, e a página seleciona a sessão nova daquele workspace, desistindo depois de 15 s (`web/app.js:575`). Como em toda troca de sessão, o modo de comando desliga.
- **Recusas** (`reason`): `command_off`, `no_workspace` (sessão sem workspace), `opening`, `log_failed`, `gone` (workspace fora da listagem), `no_anchor` (workspace sem aba de terminal), `remote`, `cockpit_unavailable` e `failed`.
- **Só com a digitação ligada.** O `main.ts` só cria o `newTab` quando a opção `input` existe (`src/main.ts:36`).

## Fechar terminal pelo celular

Decisão: [[decisions/2026-10-24_phone-close-tab]].

**O botão.** Em modo de comando, a aba da sessão assistida ganha um (x), e só ela (`web/app.js:472`, `web/app.js:499`). Tocar nele pede o fechamento; a página mostra uma confirmação própria, um `<dialog>`, nunca o `confirm()` do navegador (`web/index.html:73`). Se a página já sabe que um agente está trabalhando, o (x) fica apagado e só explica.

**Dois passos, sem nada do navegador além de `confirm`** (`src/server.ts:491`):
1. **Preparar** (`{type:'close-tab'}`): uma olhada fresca (`pty.list` das sessões vivas, `lsof` das pastas, `list-tabs`) acha a aba. O gateway guarda `{sessão, aba, assinatura dos ids de sessões e abas}` e responde com o título da aba no Cockpit, que a confirmação mostra.
2. **Confirmar** (`{type:'close-tab', confirm:true}`, em até 30 s, `src/server.ts:501`): uma segunda olhada precisa dar a mesma aba e a mesma assinatura (`src/server.ts:521`). Então a linha `close-tab` é gravada antes (`src/server.ts:523`) e roda `cockpit close-tab <id> --json`, com o id devolvido conferido (`src/close-tab.ts:54-58`). Depois o modo de comando desliga, a sessão é solta e a lista é reenviada (`src/server.ts:530`); a página passa para a aba vizinha (`web/app.js:547`).

O pedido preparado cai com qualquer mudança do modo de comando, inclusive durante a confirmação em voo (`src/server.ts:514`).

**Aba aberta pelo (+): o par** (k26). Quando o próprio gateway abriu a aba, ele prova o par sessão → aba no momento em que ela nasce:
1. Antes do `new-tab`, lê as sessões. Depois, relê a cada 250 ms, por até 5 s, até aparecer uma sessão nova (`src/server.ts:465-481`).
2. Faz mais uma leitura e só grava `{sessão, pid, aba, pasta}` se for **exatamente uma** sessão nova, a mesma, com o mesmo pid, nas duas leituras (`src/server.ts:479-480`). Um terminal aberto no Mac nesse meio tempo vira uma segunda sessão nova, e então não há par.
3. O par vale enquanto a sessão tem o mesmo pid e a aba continua um terminal local na mesma pasta (`src/close-tab.ts:27-32`). Ele tem prioridade sobre o `soleTab` (`src/close-tab.ts:47`).
4. O par fica só na memória, num mapa do gateway inteiro (`src/server.ts:192`). Ele sai quando a sessão some da lista (`src/server.ts:357`), quando o (x) fecha a aba (`src/server.ts:527`) ou quando o gateway reinicia. Depois de um reinício do Cockpit, o pid muda e o par deixa de valer.

Se a conexão do celular cair durante o pareamento, não há par. Um terminal do Mac que nasça e se assente antes do nosso ainda pode ser pareado por engano; o título na confirmação continua sendo a última conferência.

**Qual aba é a da sessão, sem par** (`soleTab`, `src/session-info.ts:235`). O casamento por ordem de criação não serve aqui (ver "Contexto das sessões"). A aba só é achada quando:
- todo shell vivo está dentro da pasta de alguma aba de terminal local (abas de workspace remoto ficam de fora);
- cada pasta tem tantos shells quantas abas (`src/session-info.ts:248`);
- a pasta da sessão assistida tem exatamente uma aba e esse shell.

Sem par, com dois terminais no workspace, um shell fora de qualquer workspace ou uma pasta desconhecida, a resposta é `no_tab`. Shells que trocaram de pasta em ciclo ainda parecem equilibrados; o título na confirmação é a última conferência.

**Recusas** (`reason`):
- `command_off`, `closing` (um passo por vez por conexão, `src/server.ts:498`), `expired`;
- `no_tab`, `working` (agente trabalhando, lido nas duas olhadas, `src/close-tab.ts:49`), `changed`;
- `log_failed`, `cockpit_unavailable`, `failed`.

**Alvo vazio nunca.** Sem alvo, o `close-tab` fecharia a aba de quem chama, que pode ser a do próprio gateway. O id passa por `^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$` antes de virar argumento (`src/close-tab.ts:23`).

**Efeitos no Mac.** O Cockpit traz para frente o workspace da aba fechada, e fechar a última aba de um workspace deixa uma aba vazia. O shell da aba fechada **continua vivo** até um SIGHUP, porque o app manda só SIGTERM (k21, [[contracts/cockpit-protocol-v2]]).

Só existe com a digitação ligada: o `main.ts` cria o `closeTab` só quando há `input` (`src/main.ts:37`).

## Contexto das sessões

O `pty.sessions` não diz a qual aba cada sessão pertence (ver a lacuna em [[contracts/cockpit-protocol-v2]]). O gateway completa cada sessão com um campo `info`, lido no Mac **sem escrever em nada**:

| Dado | Fonte |
|---|---|
| pasta atual do shell | `/usr/sbin/lsof -a -d cwd -Fpn -p <pids>`, uma chamada por coleta |
| processo em primeiro plano | `/bin/ps -A -o pid=,ppid=,tty=,stat=,comm=`: o topo do grupo com `+` no terminal do shell |
| branch | leitura direta do `.git/HEAD`, sem rodar `git` (`src/session-info.ts:107`) |
| abas e workspaces | `~/.cockpit/bin/cockpit list-tabs --json` e `list-workspaces --json`, só verbos de listagem (`src/session-info.ts:137`) |
| atividade | crescimento do `len` entre duas coletas |

- **Comandos:** os de leitura rodam por `execFile`, sem shell, com caminhos absolutos, timeout de 2 s e pids validados como inteiros (`src/session-info.ts:66`). Nada que vem do navegador entra nos argumentos. Os verbos de escrita ficam em `src/new-tab.ts` e `src/close-tab.ts` (seções acima). Uma varredura de teste garante que só esses três arquivos importam `node:child_process` (`test/protocol.test.ts:55`).
- **Casamento aba ↔ sessão** (`src/session-info.ts:179`): só pela ordem de criação (os ids `sN` e `tN` crescem juntos), e só quando:
  - os ids são numéricos;
  - as contagens são iguais;
  - os mesmos ids foram vistos na coleta anterior;
  - no máximo um par tem a pasta discordante, e esse par fica sem aba.

  A pasta sozinha nunca decide, porque um shell pode sair da pasta da sua aba enquanto outro entra. Por isso os títulos aparecem a partir da segunda coleta, cerca de 5 s depois de abrir a página.

  **A ordem não sobrevive a um reinício do Cockpit.** Os ids das abas são restaurados e as sessões ganham ids novos na ordem de restauração. Em 2026-10-24, `s1` (cockpit-tower) pareava com `t16` (gtecq). Nesse estado nada casa, e as sessões aparecem sem título até as abas serem recriadas ([[work/executions/2026-10-24_viewer-close-tab-button]], D1).
- **Cache:** o resultado vale 3 s e é compartilhado entre os espectadores (`src/session-info.ts:307`).
- **Reenvio:** a lista é reenviada a cada 5 s por espectador (`src/server.ts:378`). Um pedido que chega durante outro é atendido logo depois. Um `pty.list` sem resposta é abandonado em 10 s (`src/cockpit-client.ts:100`).
- **Falhas:** se a CLI `cockpit` falhar, as sessões seguem sem aba.
- **Estado salvo do Cockpit** (`src/cockpit-state.ts:51`): lido só para leitura em `<raiz>/cockpit/state/`, onde a raiz é o conteúdo de `~/.cockpit/storage_root` ou, por padrão, `~/Documents` (a mesma regra do Cockpit, `src/cockpit-state.ts:32`). Dele saem, por workspace raiz:
  - a ordem da lateral e a cor do avatar (`projects.json`);
  - se a lista de worktrees está expandida (`layouts.json`, um texto JSON por workspace, validado em `src/cockpit-state.ts:60`).

  Também sai o tema (`settings.json` → `themeMode`). Cada sessão leva `workspace.color`, `order`, `rank` (a posição em `list-workspaces`, que ordena os worktrees) e `worktreesExpanded`, e a mensagem `sessions` leva `theme`. Ao navegador só chegam `#rrggbb`, números, booleanos e um de três temas. Arquivo ausente ou inválido vira estado vazio.

## Limites de proteção

| Limite | Valor | Onde |
|---|---|---|
| Tamanho máximo de uma mensagem do navegador | 64 KiB (cabe o texto do compositor) | `src/server.ts:151` |
| Maior escrita numa PTY | 16 KiB | `src/protocol.ts:13` |
| Tamanho de PTY que o celular pode pedir | 20–500 colunas, 5–300 linhas | `src/protocol.ts:16-17` |
| Eventos de roda por mensagem | 20 (X10 só até a célula 223) | `src/input.ts:46-48` |
| Espectador sem atividade é fechado (e devolve o tamanho) | 10 min (código 4408) | `src/server.ts:209` |
| Nova tentativa enquanto o Cockpit está fechado | a cada 3 s | `src/server.ts:210` |
| Espectador lento (buffer acima do limite) é cortado | 8 MiB | `src/server.ts:212` |
| Terminais novos em andamento | 1 no gateway inteiro, incluindo o pareamento de até 5 s (o seguinte é recusado com `opening`) | `src/server.ts:435` |
| Espera pela CLI do Cockpit ao abrir um terminal | 12 s | `src/new-tab.ts:18` |
| Prazo da confirmação de fechamento | 30 s | `src/server.ts:211` |
| Espera pela CLI do Cockpit ao fechar um terminal | 12 s | `src/close-tab.ts:35-38` |

Além disso:
- um `select` repetido não refaz o replay (`src/server.ts:593`);
- um frame inválido derruba só aquele espectador, nunca o processo (`src/server.ts:614`);
- a digitação e o tamanho nunca seguem o espectador para outra sessão (`src/server.ts:594`).

## Limitações conhecidas

- O nome das abas depende do casamento por ordem; quando ele não é seguro, a sessão aparece só com projeto, processo e pasta. Depois de um reinício do Cockpit, isso vale para todas as sessões.
- Fora do modo de comando, os agentes em tela cheia mostram só a tela atual; em modo de comando, o arrasto rola o histórico deles ([[decisions/2026-10-23_phone-fullscreen-scroll]]).
- A rolagem do agente não tem inércia nem direção horizontal. Se o replay de 4 MiB não trouxer a sequência em que o programa ligou o mouse, a página pode errar o formato.
- Enquanto o celular comanda, o Mac vê a sessão no tamanho do celular (o resize vale para todos). Girar o telefone com o modo ligado não redimensiona: desligue e ligue o modo.
- Se o gateway morrer à força (SIGKILL) com o modo ligado, o Mac fica no tamanho do celular até a janela ou a divisória dele mudar.
- Digitar no Mac e no celular ao mesmo tempo mistura os bytes ([[contracts/cockpit-protocol-v2]]).
- Abrir um terminal pelo celular pode trocar o workspace na tela do Mac, porque a CLI do Cockpit não tem `new-tab --workspace`. Workspace remoto fica sem (+).
- O (x) só fecha o único terminal de um workspace; com dois ou mais, o fechamento fica no Mac. O shell da aba fechada sobrevive até um SIGHUP (k21).
