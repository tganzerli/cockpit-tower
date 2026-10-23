---
title: 2026-10-22 — Visualizador web somente leitura do Cockpit
type: execution
work_id: 2026-10-22_read-only-viewer
scope:
  area: [gateway, viewer, tower-cli]
status: done
updated: 2026-10-22
summary: Gateway Node/TS somente leitura para as sessões do Cockpit, exposto só na tailnet por `tower on/off`.
topic: [tooling, ui, api]
related: ["[[contracts/cockpit-protocol-v2]]", "[[services/gateway]]", "[[flows/tower-on-off]]", "[[decisions/2026-10-22_read-only-client]]", "[[overview]]"]
---

# Log de execução — 2026-10-22_read-only-viewer

> **Log vivo.** Atualizado a cada passo concluído.

## Metadados

- **ID:** `2026-10-22_read-only-viewer`
- **Task:** [[work/tasks/2026-10-22_read-only-viewer]]
- **Plano:** [[work/plans/2026-10-22_read-only-viewer]] (`risk: high`)
- **Status:** `done`
- **Início:** `2026-10-22`
- **Fim:** `2026-10-22`
- **Escopo:** área(s) `[gateway, viewer, tower-cli]`
- **Branch:** `feat/2026-10-22_read-only-viewer__tower` (a partir de `dev`)

## Checklist (espelha o plano §4.5)

- [x] (1) Branch criada; trio commitado nela
- [x] (2) `package.json`, `.gitignore`, dependências
- [x] (3) `src/protocol.ts` + teste de recusa e grep
- [x] (4) Servidor falso + `src/cockpit-client.ts` + testes
- [x] (5) `src/server.ts` + `src/main.ts` + testes
- [x] (6) `web/` (lista + xterm somente leitura)
- [x] (7) `bin/tower on|off|status`
- [x] (8) `README.md`
- [x] (9) Smoke real no Mac + iPhone
- [x] (10) Revisão pelo agente (tier high): 3 rodadas, encerrada com `Nothing to fix.` + gate humano

## Atividade (cronológica)

### `2026-10-22` — início
- Plano aprovado pelo humano "com as recomendações" (D1–D5).
- Antes do plano, um probe somente leitura (`hello` + `pty.list`) contra o Cockpit real confirmou o protocolo v2 (`server 0.1.0`).

### `2026-10-22` — passos 2–4
- Dependências: `ws@8.22`, `@xterm/xterm@6.0`, `@xterm/addon-fit@0.11`; dev: `@types/ws`, `@types/node`. O Node v26.3.1 roda `.ts` direto, sem build.
- `src/protocol.ts`: `encode` só aceita `hello`, `pty.list`, `pty.attach`, `pty.detach`. O teste prova que os tipos de escrita são recusados e faz um grep no código.
- `src/cockpit-client.ts` + `test/fake-cockpit-server.ts`: handshake, mismatch, list, attach com replay e saída ao vivo, ruído do servidor ignorado, reconexão a partir do último offset.
- Um teste de reconexão falhou primeiro por **corrida no próprio teste**: o servidor falso lê o `pty.attach` de forma assíncrona. Corrigido com `waitFor` e um `finally`. A falha também deixava o processo de teste preso, porque o cliente não era fechado.

### `2026-10-22` — passos 5–6
- `src/server.ts`:
  - HTTP + WebSocket em `127.0.0.1`;
  - tabela fixa de rotas estáticas;
  - exige o header `Tailscale-User-Login` (exceto com `--dev`);
  - uma conexão com o Cockpit por espectador;
  - espectador ocioso por 10 min é fechado (código 4408).
- `src/main.ts`: lê `TOWER_PORT`, `TOWER_SOCKET` e `--dev`.
- `web/`: xterm.js com `disableStdin`; colunas da PTY ajustadas só no cliente; fonte reduzida para caber no iPhone; ping a cada 60 s enquanto a página está visível.
- **Teste contra o Cockpit real** (`--dev`, loopback, porta 17681): `status connected 0.1.0`; `sessions s3,s4,s6,s7 (/bin/zsh 117x54)`; `replayed bytes 2499`. Gateway desligado em seguida.

### `2026-10-22` — passos 7–8
- `bin/tower on|off|status`:
  - o gateway sobe em segundo plano e o `caffeinate -is -w <pid>` mantém o Mac acordado só enquanto o gateway vive;
  - publica com `tailscale serve --bg --https=8443`;
  - `off` remove só a porta 8443 (nunca usa `serve reset`).
- **Achado no smoke:** o Serve não está habilitado nesta tailnet. Nesse caso o `tailscale serve` imprime um link de consentimento e **espera para sempre**. Duas tentativas de limitar isso falharam:
  1. descartar a saída escondia o link;
  2. `perl alarm` dentro de `$(...)` matava só o wrapper `sh` de `/usr/local/bin/tailscale`; o filho `Tailscale.app` segurava o pipe.

  **Correção final:** saída para arquivo, espera de até 20 s e `pkill` pelo padrão `[Tt]ailscale serve --bg --https=<porta>`. Resultado verificado: o link aparece, tudo é desligado, exit 1 e nenhum processo sobra:
  ```
  Serve is not enabled on your tailnet. ... https://login.tailscale.com/f/serve?node=…
  tower: could not publish on the tailnet; turning everything off
  exit=1
  gateway: off · awake: no · tailnet: not published
  ```
- `README.md`: requisitos, uso, variáveis, o que o tower nunca faz e limitações (D2, D3, nomes das abas, tampa fechada, protocolo v2).
- **Pendente do humano:** habilitar o Serve na tailnet pelo link e fazer o smoke no iPhone (passo 9).

### `2026-10-22` — revisão rodada 1 e correções
- Revisor com contexto limpo, tier `high`, modo profundo: 10 Important + 3 Nit, todos corrigidos em `220f651`. Nenhum caminho escrevia na PTY; a garantia principal se confirmou.
- `npm test` → `ℹ tests 25 · ℹ pass 25 · ℹ fail 0`.
- **Teste real com token** (loopback, porta 17682, header simulado): `status connected 0.1.0` · `sessions 10` · `replayed bytes 2499` · página sem token `404` · com token `200`.
- `bin/tower`: pid file velho apontando para outro processo foi ignorado (não matou nada); token `0600`, pasta `0700`; com o Serve desabilitado, sai com `exit=1` e nenhum processo sobra.

### `2026-10-22` — revisão rodada 2 e correções
- Rodada 2 (só o diff das correções): os 13 achados da rodada 1 foram confirmados como corrigidos. Surgiram 2 Important + 2 Nit introduzidos pelas próprias correções, todos corrigidos em `0dd4223`.
- A lógica de "está publicado?" saiu do bash para `src/serve-status.ts`, com 3 testes unitários: vazio, a nossa porta inclusive 443, e outro serviço ou porta com o mesmo prefixo.
- `npm test` → `ℹ tests 28 · ℹ pass 28 · ℹ fail 0`.

### `2026-10-22` — revisão rodada 3 (última)
- `Nothing to fix.` Os quatro achados da rodada 2 foram confirmados como corrigidos. O revisor também verificou que `import.meta.main` existe no Node v26.3.1 (`true` ao rodar direto, `false` quando importado), então o teste não dispara o ramo de CLI.
- **Revisão pelo agente encerrada:** 17 achados no total, todos `fixed`, nenhum aberto.

### `2026-10-22` — passo 9: smoke real
- O humano habilitou o Serve na tailnet. `bin/tower on` publicou na primeira tentativa. A primeira requisição HTTPS voltou `000` enquanto o Tailscale emitia o certificado da máquina; a seguinte já deu `200` em ~10 ms.
- No iPhone havia 13 sessões, todas `zsh`, porque o `claude` roda dentro do shell da aba. Para identificar a certa, o tamanho e o fim do histórico (lidos só para leitura) apontaram a `s12`. O humano confirmou histórico e saída ao vivo.
- **Atrito encontrado:** sem o nome da aba (o protocolo não traz), achar a sessão certa no celular é difícil. Vira proposta de task: mostrar bytes e atividade recente e ordenar as mais ativas primeiro.

### `2026-10-22` — gate humano e fechamento
- O humano mandou "desligar o tower e seguir com o wiki-sync e PR" depois do smoke no iPhone. **Fica registrado como aprovação da execução.** A leitura completa do diff, que a metodologia pede para o tier `high`, não foi confirmada explicitamente.
- `bin/tower off` → `gateway: off · awake: no · tailnet: not published`.

## Commits

- `410dc27` docs(work): add read-only viewer task, approved plan and execution log
- `3fed1bc` feat(gateway): add read-only protocol codec and Cockpit client with fake-server tests

- `956550f` feat(viewer): add loopback HTTP/WebSocket bridge and read-only xterm viewer

- `9a13c25` feat(tower-cli): add on/off/status with caffeinate and tailscale serve; add README

- `220f651` fix: harden gateway and tower CLI after review round 1

- `0dd4223` fix: address review round 2

## Divergências do plano

- **Script de teste:** o plano dizia `node --test test/`. No Node 26, um diretório como argumento é tratado como módulo e falha (`Cannot find module .../test`), então o script passou a ser `node --test 'test/*.test.ts'`. Não muda o escopo.
- **Uma conexão com o Cockpit por espectador**, em vez de uma conexão compartilhada com contagem de espectadores. Assim cada espectador recebe o seu replay, a conexão só existe enquanto há alguém olhando (D3), e fechar a página desanexa de forma implícita (D2). Mais simples e com as mesmas garantias.
- **Recusa sem o header do Tailscale:** HTTP 403 no upgrade do WebSocket, em vez de abrir a conexão e fechá-la com 4401. A conexão nem é aceita.
- **D5 mudou: token secreto no caminho + header do Tailscale.** O plano dizia que o header `Tailscale-User-Login` garantia que só a tailnet chegaria. A revisão mostrou que qualquer processo local, de qualquer usuário do Mac, forja esse header. Agora todas as rotas ficam sob `/<token>/`; o token é gerado pelo `bin/tower` com 18 bytes aleatórios e gravado em `~/.cockpit-tower/token` (`0600`). O header continua como segunda camada. Fora do token e sem header a resposta é **404**, não 403.
- **`/healthz` sem token:** responde só `cockpit-tower`, para o `bin/tower` reconhecer que a porta é do gateway dele. Não revela mais nada.
- **`bin/tower` sem `jq`:** a URL da tailnet é lida com `node`, que já é requisito, então sai uma dependência.
- **`@xterm/addon-fit` removido:** o ajuste é feito manualmente pelo tamanho da fonte, porque não podemos redimensionar a PTY (D4). Seria dependência morta.

## Validações

> Cada validação é o comando + o fim da saída.

- [x] Testes — `npm test` → exit 0
  ```
  ℹ tests 28
  ℹ pass 28
  ℹ fail 0
  ```
- [x] Verificação do plano §4.4 (smoke real) — `bin/tower on` → exit 0
  ```
  tower: on — https://<your-mac>.<tailnet>.ts.net:8443/<token>/
  gateway: on · awake: yes (caffeinate) · tailnet: published on port 8443 · cockpit: socket present
  page with token via tailnet: 200 · root without token via tailnet: 404 · loopback with token, no header: 404
  ```
  iPhone (humano): sessão `s12` (Claude, ~1 MB) mostrou o histórico e atualizou ao vivo.

## Revisão pelo agente

> Tier `high`: uma passada em modo profundo. Máximo de 3 rodadas.

| Rodada | Faixa revisada | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `dev..707a9ea` (diff completo, modo profundo) | 10 | 3 | 0 |
| 2 | `707a9ea..220f651` (só o diff das correções) | 2 | 2 | 0 |
| 3 | `220f651..0dd4223` (só o diff das correções) | 0 | 0 | 0 |

### Achados e desfecho

| # | Rodada | Tag | `file:line` | Desfecho | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Important | `src/server.ts:61` (classe: exceção não tratada derruba o processo — também `:46` e `ws` sem `error`) | fixed | — |
| 2 | 1 | Important | `src/server.ts:39` (header do Tailscale forjável por processo local) | fixed (token secreto no caminho + header) | `REVIEW.md` já cobria ("listener alcançável"); sem nova regra |
| 3 | 1 | Important | `src/cockpit-client.ts:154` (reconexão reanexa snapshot antigo) | fixed | — |
| 4 | 1 | Important | `web/app.js:98` (página não reseleciona após reconectar) | fixed | — |
| 5 | 1 | Important | `src/cockpit-client.ts:54` (sem timeout no handshake) | fixed | — |
| 6 | 1 | Important | `src/server.ts:112` (sem nova tentativa se o Cockpit abrir depois) | fixed | — |
| 7 | 1 | Important | `bin/tower:18` (pid file sem checar identidade) | fixed | — |
| 8 | 1 | Important | `bin/tower:48` (prontidão aceita qualquer processo na porta; status do serve ignorado) | fixed (`/healthz` + porta ocupada → erro) | — |
| 9 | 1 | Important | `bin/tower:82` (`off` não espera o gateway sair) | fixed | — |
| 10 | 1 | Important | `test/server.test.ts:1` (testes não cobriam esses caminhos; grep não recursivo) | fixed (25 testes) | — |
| 11 | 1 | Nit | `src/server.ts:59` (sem limite de payload/buffer; select repetido refaz replay) | fixed | — |
| 12 | 1 | Nit | `bin/tower:91` (padrões de `pgrep`/`pkill` amplos) | fixed (pids gravados + padrão ancorado) | — |
| 13 | 1 | Nit | `src/cockpit-client.ts:91` (`list()` nunca rejeita) | fixed | — |
| 14 | 2 | Important | `bin/tower:33` (classe: `cmd \| grep -q` sob `pipefail` → SIGPIPE/141; também `pid_is`) | fixed (saída capturada antes; `serve status --json` via `src/serve-status.ts`) | Candidato a regra no `REVIEW.md` se voltar a aparecer |
| 15 | 2 | Important | `src/server.ts:206` (select repetido ignorado + `term.reset()` na página = tela em branco) | fixed (deduplicação na página) | — |
| 16 | 2 | Nit | `bin/tower:33` (regex falha com a porta 443) | fixed (JSON) | — |
| 17 | 2 | Nit | `bin/tower:71` (token rotacionado com gateway ligado → URL 404) | fixed (gateway reinicia quando o token muda) | — |

## Páginas do wiki afetadas

- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (CREATE)
- `cockpit_tower_wiki/services/gateway.md` (CREATE)
- `cockpit_tower_wiki/flows/tower-on-off.md` (CREATE)
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (CREATE)
- `cockpit_tower_wiki/overview.md` (UPDATE)

## Notas abertas

- **Próximas tasks: melhorar a tela** (decisão do humano após o smoke). Pontos já identificados:
  - legibilidade do Claude nas 117 colunas da PTY numa tela de iPhone;
  - identificar a sessão certa entre muitas `zsh`: bytes e atividade recente, as mais ativas primeiro.

- Pedido ao Jacob: incluir o id da aba (`COCKPIT_TAB_ID`) em `pty.sessions`, para o tower mostrar os nomes das abas.
