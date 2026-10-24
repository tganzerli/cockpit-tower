<!--
  REVIEW.md (repository root). See METHODOLOGY.md §4.4.1.

  Read by the `reviewer` role on EVERY agent review — keep it short: each line
  is paid in tokens on every review. CLAUDE.md/AGENTS.md teach the agent how to
  WRITE here; this file teaches it how to REVIEW here.

  Written by the owner of the code. Content in Portuguese (pt-BR); paths and
  identifiers in English. Seeded at install (2026-10-22) — paths are declared
  before the code exists; tighten them when the first code lands.
-->
# REVIEW.md — Cockpit Tower

> Contexto: gateway pequeno que **apenas se conecta** ao socket Unix local do `cockpit-server` (Remote Pi Cockpit, `~/.cockpit/cockpit-server.sock`, protocolo JSONL: `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize`) e serve um visualizador de terminal web que abre em leitura e só digita e dimensiona a PTY em **modo de comando**, pelo dono, na sessão assistida (ADRs `decisions/2026-10-23_phone-input-client` e `decisions/2026-10-23_phone-pty-resize`), e que, também em modo de comando, abre um terminal no workspace assistido pela CLI do Cockpit (`cockpit new-tab`, ADR `decisions/2026-10-24_phone-new-tab`) e fecha, em dois passos com confirmação, a aba da sessão assistida (`cockpit close-tab`, ADR `decisions/2026-10-24_phone-close-tab`), publicado só na tailnet via `tailscale serve`, ligado/desligado sob demanda (`tower on/off` com `caffeinate`).

## What failure looks like here

> Não são regras de estilo — é o **cheiro** que o revisor procura em cada área.

| Área / paths | A falha se parece com | Como verificar |
|---|---|---|
| Cliente do socket / protocolo JSONL | **Uma escrita além das duas portas** — envio de `pty.kill`, `pty.open`, `pty.ack`, `rpc`, ou `pty.input`/`pty.resize` montados fora de `inputMessage`/`resizeMessage` (`src/protocol.ts`) | Listar todo `type`/método enviado ao socket; só `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize` são permitidos |
| Caminho de digitação e rolagem (`src/server.ts` `handleInput`/`handleWheel`, `src/input.ts`, `web/app.js`) | **Entrada que escapa das cercas** — alvo vindo do navegador, `input`/`wheel` aceito sem modo de comando, sem o login do dono, sem `Origin` igual, sem registro gravado antes, bytes montados no navegador, ESC no texto, ou bytes de roda fora dos três moldes de `wheelBytes` (sem limite de quantidade, célula fora do tamanho, X10 acima de 223 em UTF-8) | Seguir `input` e `wheel` do `ws.on('message')` até `client.input`: o alvo é `watching`, `commanding === watching`, `mayCommand`, `log.append` antes do envio; tabelas `KEYS` e moldes de `wheelBytes` fixos |
| Terminal novo (`src/new-tab.ts`, `src/server.ts` `handleNewTab`, `web/app.js`) | **Escrita pela CLI além do `new-tab`** — outro verbo de escrita, pasta ou aba âncora vinda do navegador, `new-tab` sem modo de comando, sem o login do dono ou sem registro gravado antes, workspace remoto aceito, id de aba que vira flag, `child_process` fora de `session-info.ts`/`new-tab.ts`/`close-tab.ts` | Seguir `new-tab` do `ws.on('message')` até o `execFile`: alvo `watching`, pasta de `folders` (última lista), `commanding === watching`, `mayCommand`, `log.append` antes; argumentos só da listagem do Cockpit |
| Fechar terminal (`src/close-tab.ts`, `src/server.ts` `handleCloseTab`, `freshTabs`/`soleTab` em `src/session-info.ts`, `web/app.js`) | **Aba errada ou fechamento sem prova** — id, título ou sessão vindos do navegador; fechar num passo só; achar a aba pela ordem de criação (`matchTabs`) ou aceitar um workspace com dois terminais, dois shells ou uma pasta desconhecida, um shell fora de todas as pastas, ou pastas com shells e abas em número diferente (**a pasta de um shell não prova a aba dele**: todo casamento por pasta conta todos os shells e todas as abas; achado repetido em `2026-10-22_session-identity-cockpit-look` e `2026-10-24_viewer-close-tab-button`); aba ou assinatura de ids não comparadas entre os dois passos; pedido preparado sem prazo ou que sobrevive a troca de sessão/modo; `working` aceito; alvo vazio ou que vira flag; id devolvido pela CLI não conferido; sem registro antes; `confirm()` do navegador | Seguir `close-tab` do `ws.on('message')` até o `execFile`: alvo `watching`, `commanding === watching`, `mayCommand`, `pendingClose` ≤ `closeConfirmMs` e limpo em `setCommand`, segunda `resolve` com mesmo `tabId` e `ids`, `log.append` antes, `TAB_ID` no `close` |
| Caminho de tamanho (`src/server.ts` `applySize`/`giveBack`, `web/app.js`) | **Mac preso no tamanho do celular, ou resize fora da cerca** — resize sem modo de comando, para outra sessão, sem limite, sem registro antes; um desligamento do modo que não devolve o tamanho; devolução por cima de um layout novo do Mac (sem checar o tamanho atual); dois espectadores dimensionando a mesma sessão | Cada caminho que desliga o modo passa por `setCommand(null)` → `giveBack`; `close()` e o fechamento do WebSocket também; `giveBack` confere o tamanho atual numa lista fresca e roda uma vez só |
| Servidor HTTP/WebSocket, `tailscale serve` | **Um listener alcançável fora da tailnet/loopback** — bind em `0.0.0.0`/`::`, porta pública, `tailscale funnel` | Rastrear o endereço de bind até a chamada de `listen`; confirmar `127.0.0.1` + `tailscale serve` (nunca `funnel`) |
| Ciclo de vida (`tower on/off`, `caffeinate`) | **O gateway inicia ou mata o servidor do Cockpit** em vez de só se conectar | Procurar spawn/kill/`launchctl` do `cockpit-server`; socket ausente deve virar erro, não auto-start |
| Docs, README, comentários | **Mente** — descreve comportamento ou padrão que o código não tem (ex.: "somente leitura" sem garantia no código) | Comparar a afirmação com o código descrito |

## Always high risk

> Uma mudança que toca qualquer item abaixo é tier `high`, independente do tamanho (METHODOLOGY §4.4.1).

- Qualquer código que possa enviar entrada a um terminal: `pty.input`, `pty.resize`, `pty.kill`, ou escrita arbitrária no socket do `cockpit-server`.
- Qualquer código que rode um verbo da CLI do Cockpit além de `list-tabs`/`list-workspaces` (hoje `new-tab` e `close-tab`, em `src/new-tab.ts` e `src/close-tab.ts`).
- Qualquer código que faça bind de um listener de rede (HTTP, WebSocket, TCP, socket Unix novo).
- Configuração de autenticação e exposição: `tailscale serve`/`funnel`, ACLs, origens permitidas, tokens.
- `.github/workflows/`, `.githooks/`, `scripts/ci/`, `.claude/hooks/` (os mecanismos que sustentam os gates).

## Skip

> Paths que o revisor não revisa.

- Arquivos gerados, lockfiles, código vendorizado.
- `cockpit_tower_wiki/work/` (a tríade é revisada pelo humano, não pelo revisor).

## Do not flag (known false positives)

> Uma linha por padrão que o revisor apontou e o humano marcou como `wrong` ou `intentional`. Cada linha cita seu `work_id` de origem.

_(vazio no dia um — cresce a partir dos resultados das revisões)_

## Limits

- Máximo de nits por rodada: **3**.
- Todo achado traz `file:line` e o trecho literal — nada de palpite a partir de nomes.
- O relatório abre com a contagem de achados e diz `Nothing to fix.` quando não há nada.
