---
title: 2026-10-23 — O tower lê e digita na sessão que o celular assiste, só com o modo de comando ligado
type: adr
work_id: 2026-10-23_phone-terminal-input
scope:
  area: [gateway, viewer, tower-cli]
status: accepted
updated: 2026-10-24
summary: Libera pty.input em modo de comando, para a sessão assistida, com Origin, dono do Tailscale e registro local; kill/open/ack/rpc seguem proibidos e nunca há pty.ack. Refinada pelas ADRs do resize, da roda e do terminal novo.
revisit_when: "o cockpit-server passar a repassar o flow do pty.open"
supersedes:
  - decisions/2026-10-22_read-only-client
superseded_by: ""
sources:
  - https://github.com/jacobaraujo7/remote_pi (commit 7d923ab)
code_refs: []
related:
  - decisions/2026-10-22_read-only-client
  - contracts/cockpit-protocol-v2
  - services/gateway
  - flows/tower-on-off
  - work/plans/2026-10-23_phone-terminal-input
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-fullscreen-scroll
  - decisions/2026-10-24_phone-new-tab
---

# 2026-10-23 — O tower lê e digita na sessão que o celular assiste, só com o modo de comando ligado

> **Refinada em 2026-10-23** por [[decisions/2026-10-23_phone-pty-resize]]: `pty.resize` passou a ser permitido só em modo de comando, com o tamanho do Mac devolvido ao sair. As decisões 2–9 continuam valendo; o corpo abaixo fica como estava.
>
> **Refinada em 2026-10-23** por [[decisions/2026-10-23_phone-fullscreen-scroll]]: o navegador também manda `wheel` (decisão 2), com bytes montados no gateway como as teclas (decisão 5) e enviados por `pty.input`, sem tipo novo para o Cockpit. A decisão 1, com o `pty.resize` da nota acima, e as decisões 3–9 continuam valendo.
>
> **Refinada em 2026-10-24** por [[decisions/2026-10-24_phone-new-tab]]: o navegador também manda `new-tab` (decisão 2), e o gateway abre um terminal pela CLI do Cockpit (`cockpit new-tab`), sem tipo novo para o socket. A decisão 1 e as decisões 3–9 continuam valendo.

## Contexto

O dono quer continuar pelo iPhone a tarefa que um agente faz no Mac: mandar texto e as teclas Enter, Esc, Ctrl-C, setas, Tab e Shift-Tab para a sessão aberta. A decisão anterior ([[decisions/2026-10-22_read-only-client]]) proibia qualquer escrita, e a "Revisão planejada" dela previa reabrir quando houvesse digitação.

O que pesa na decisão (análises do plano [[work/plans/2026-10-23_phone-terminal-input]], §4.0):

- **O servidor do Cockpit não protege a sessão.** Ele aceita `pty.input`, `pty.resize` e `pty.kill` de qualquer conexão, sem exigir attach nem dono (`remote_pi: cockpit/packages/cockpit_server/lib/src/remote_server.dart:652-667`). Toda a proteção fica no tower.
- **Formato da entrada.** É `pty.input {id, d}`, com `d` = base64 dos bytes crus (`remote_pi: cockpit/packages/cockpit_protocol/lib/src/messages.dart:345-363`). O app manda Enter `\r`, Esc `\x1b`, Tab `\t`, Shift-Tab `\x1b[Z`, setas CSI e Ctrl-C `0x03` (`remote_pi: cockpit/lib/app/core/terminal/xterm/src/core/input/keytab/keytab_default.dart:24-32,67-70`).
- **`pty.resize` muda a PTY para todos,** e o app reaplica o tamanho a cada layout. Fica para a fase 2.
- **Crédito de fluxo.** Pelo `cockpit-server`, o `flow` do `pty.open` não é repassado (`remote_server.dart:588-596`; `flowControlled` começa `false`, `remote_pi: cockpit/packages/cockpit_core/lib/src/terminal/terminal_service.dart:13`), então o `ack()` não faz nada (`remote_pi: cockpit/packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:220`). O risco "o shell trava sem o ack do tower", registrado na decisão anterior, não tem apoio no código (leitura, sem teste ao vivo).
- **Acesso de hoje.** Token no caminho, header `Tailscale-User-Login` só conferido por presença (`src/server.ts:79-80`), listener em `127.0.0.1` exposto por `tailscale serve`, e nenhuma checagem de `Origin`. Bastava para ler; para escrever, não.

## Decisão

1. **Para o Cockpit, uma porta a mais.** O tower envia `hello`, `pty.list`, `pty.attach`, `pty.detach` e `pty.input`, e nada mais. `pty.resize`, `pty.kill`, `pty.open`, `pty.ack`, `rpc` e `rpc.res` continuam recusados pela lista branca do `encode` (`src/protocol.ts`). Só uma função monta `pty.input`.
2. **Do navegador,** o gateway aceita `ping`, `list`, `select`, `command` e `input`. O resto é descartado.
3. **Modo de comando por conexão, guardado no gateway.**
   - A página abre em leitura, e o modo começa desligado.
   - O botão do topo liga o modo só para a sessão que aquela conexão assiste, e só se a sessão estiver na última lista e viva.
   - O modo desliga ao trocar de sessão, quando a sessão termina ou some da lista, quando o gateway perde a conexão com o Cockpit e na reconexão da página (conexão nova começa desligada).
   - `input` com o modo desligado é recusado.
4. **O alvo é sempre a sessão assistida, guardada no gateway.** Um id que venha numa mensagem `input` é ignorado.
5. **Teclas por nome; os bytes saem do gateway.**
   - A tabela é fixa e igual à do app, com as setas sempre em CSI, como o app faz.
   - O texto não pode ter ESC, outros controles C0 (fora Tab e quebra de linha) nem C1.
   - Quebras de linha viram `\r`. Texto com várias linhas vai entre `\x1b[200~ … \x1b[201~` quando o programa ligou esse modo (`?2004h`), conforme o emulador do viewer.
   - Até **16 KiB por envio**; o frame do navegador sobe de 4 KiB para 64 KiB.
6. **Acesso.**
   - Ficam: token no caminho, header obrigatório, listener só em loopback, `tailscale serve` e nunca `funnel`.
   - Entra: o WebSocket só abre se o `Origin` for igual à origem publicada pelo `tower on`.
   - Entra: só digita quem tiver `Tailscale-User-Login` **igual** ao login do dono, lido de `tailscale status --json` no `tower on` (com `TOWER_OWNER` de reserva).
   - Sem origem, dono ou registro disponível, o gateway sobe só em leitura (falha fechado).
   - No `--dev` (teste local, sem token nem Tailscale), digitar continua exigindo o `Origin`, que é `http://127.0.0.1:<porta>`; só a checagem do login sai.
7. **Registro de cada envio.**
   - Arquivo `~/.cockpit-tower/input.log`, modo `0600`, numa pasta `0700`, uma linha JSON por envio: hora, login, sessão, tipo, tecla ou **texto inteiro**, e número de bytes.
   - É gravado **antes** do envio; se a gravação falhar, o envio é recusado.
   - Sem rotação.
8. **O tower nunca envia `pty.ack`.** Pelo servidor ele não teria efeito. Se o Cockpit passar a aplicar crédito, os acks são subtraídos por sessão (`native_terminal_service.dart:222`), e os do tower se somariam aos do app, anulando o controle de fluxo dele.
9. **Uma conexão com o Cockpit por espectador** (decisão 3 da ADR anterior, confirmada).

## Alternativas descartadas

| Alternativa | Por que foi descartada | O que a traria de volta |
|---|---|---|
| Capturar o teclado do xterm | O xterm nem aparece na tela; no iPhone, teclado virtual sobre um terminal é ruim de usar e não tem Esc, Ctrl nem setas | O viewer passar a mostrar o xterm em vez da visão HTML |
| Digitação para qualquer conexão com o token | O token vive numa URL e num QR; vazou, escreve no terminal | Nada: o dono pediu o reforço |
| O navegador montar os bytes | Um navegador comprometido mandaria qualquer sequência; a tabela ficaria fora da revisão do gateway | Precisar de teclas que a tabela não cobre, e mesmo assim a tabela cresce no gateway |
| Registrar só tamanho e tecla | Não daria para saber o que foi mandado a um agente | Digitar segredos pelo celular virar rotina |
| Enviar `pty.ack` | Não faz nada hoje e, com crédito ligado, anularia o controle de fluxo do app | O servidor passar a contar crédito por cliente |
| Emendar a ADR antiga | A decisão central ("somente leitura") deixa de valer; uma emenda deixaria o título mentindo | — |
| Liberar também `pty.resize` agora | Muda a PTY para todos e o app reaplica o tamanho; precisa de teste à parte | Fase 2 (k2) |

## Consequências

- **Positivas:** o dono comanda os agentes pelo iPhone sem tmux; cada envio fica rastreável; a leitura por outro site também fecha, com a checagem de `Origin`.
- **Custos aceitos:**
  - a digitação do Mac e a do celular se intercalam, porque o servidor não tem trava;
  - Ctrl-C e Enter vão de verdade para o agente: o selo de modo na página é a defesa;
  - o texto digitado fica em claro no registro, no mesmo nível de confiança do arquivo do token;
  - se a origem calculada pelo `tower on` estiver errada, a página não carrega o terminal até corrigir (`TOWER_ORIGIN`);
  - a CLI `cockpit` continua ambígua com um segundo cliente conectado ([[contracts/cockpit-protocol-v2]]);
  - a quebra de linha continua só na exibição: a PTY fica no tamanho do Mac.
- **Novas restrições:** toda mensagem nova para o Cockpit exige uma ADR; `pty.resize` só com a fase 2.

## Como esta decisão é policiada

- Testes do `encode`: os tipos proibidos lançam erro, e `pty.input` só passa pela função que o monta.
- Varredura do código-fonte: os tipos proibidos não aparecem fora de `src/protocol.ts`, e o literal `pty.input` também não.
- Testes do servidor para cada recusa: sem modo, outro login, outro `Origin`, outra sessão, conexão nova, registro que falha.
- `REVIEW.md`: o caminho de digitação é "Always high risk".

## Revisão prevista

**Gatilho:** a fase 2 (k2), que traz `pty.resize`; ou o `cockpit-server` passar a repassar o `flow` do `pty.open`.

**O que a implementação deve ensinar:** se o modo de comando por conexão basta no uso diário, ou se falta trava contra digitação simultânea Mac/celular; se o header do Tailscale bate com o `LoginName`.

**O que se espera:** refinar (mais uma porta, `pty.resize`), mantendo as camadas.

**Fase 2 feita em 2026-10-23:** refinada por [[decisions/2026-10-23_phone-pty-resize]], com as camadas mantidas.

## Decisões que esta abre ou fecha

- **Fecha:** se o tower pode escrever (pode, só `pty.input`); o `pty.ack` (k4: nunca).
- **Abre:** resize para o celular (k2); rolagem em tela cheia (k3).

## Referências

- Plano: [[work/plans/2026-10-23_phone-terminal-input]] (§4.0, com as citações completas).
- `remote_pi:` citações no commit `7d923ab`.
