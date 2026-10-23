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

> Contexto: gateway pequeno que **apenas se conecta** ao socket Unix local do `cockpit-server` (Remote Pi Cockpit, `~/.cockpit/cockpit-server.sock`, protocolo JSONL: `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize`) e serve um visualizador de terminal web que abre em leitura e só digita e dimensiona a PTY em **modo de comando**, pelo dono, na sessão assistida (ADRs `decisions/2026-10-23_phone-input-client` e `decisions/2026-10-23_phone-pty-resize`), publicado só na tailnet via `tailscale serve`, ligado/desligado sob demanda (`tower on/off` com `caffeinate`).

## What failure looks like here

> Não são regras de estilo — é o **cheiro** que o revisor procura em cada área.

| Área / paths | A falha se parece com | Como verificar |
|---|---|---|
| Cliente do socket / protocolo JSONL | **Uma escrita além das duas portas** — envio de `pty.kill`, `pty.open`, `pty.ack`, `rpc`, ou `pty.input`/`pty.resize` montados fora de `inputMessage`/`resizeMessage` (`src/protocol.ts`) | Listar todo `type`/método enviado ao socket; só `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize` são permitidos |
| Caminho de digitação (`src/server.ts`, `src/input.ts`, `web/app.js`) | **Digitação que escapa das cercas** — alvo vindo do navegador, `input` aceito sem modo de comando, sem o login do dono, sem `Origin` igual, sem registro gravado antes, ou bytes montados no navegador / com ESC no texto | Seguir `input` do `ws.on('message')` até `client.input`: o alvo é `watching`, `commanding === watching`, `mayCommand`, `log.append` antes do envio; tabela `KEYS` fixa |
| Caminho de tamanho (`src/server.ts` `applySize`/`giveBack`, `web/app.js`) | **Mac preso no tamanho do celular, ou resize fora da cerca** — resize sem modo de comando, para outra sessão, sem limite, sem registro antes; um desligamento do modo que não devolve o tamanho; devolução por cima de um layout novo do Mac (sem checar o tamanho atual); dois espectadores dimensionando a mesma sessão | Cada caminho que desliga o modo passa por `setCommand(null)` → `giveBack`; `close()` e o fechamento do WebSocket também; `giveBack` confere o tamanho atual numa lista fresca e roda uma vez só |
| Servidor HTTP/WebSocket, `tailscale serve` | **Um listener alcançável fora da tailnet/loopback** — bind em `0.0.0.0`/`::`, porta pública, `tailscale funnel` | Rastrear o endereço de bind até a chamada de `listen`; confirmar `127.0.0.1` + `tailscale serve` (nunca `funnel`) |
| Ciclo de vida (`tower on/off`, `caffeinate`) | **O gateway inicia ou mata o servidor do Cockpit** em vez de só se conectar | Procurar spawn/kill/`launchctl` do `cockpit-server`; socket ausente deve virar erro, não auto-start |
| Docs, README, comentários | **Mente** — descreve comportamento ou padrão que o código não tem (ex.: "somente leitura" sem garantia no código) | Comparar a afirmação com o código descrito |

## Always high risk

> Uma mudança que toca qualquer item abaixo é tier `high`, independente do tamanho (METHODOLOGY §4.4.1).

- Qualquer código que possa enviar entrada a um terminal: `pty.input`, `pty.resize`, `pty.kill`, ou escrita arbitrária no socket do `cockpit-server`.
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
