---
title: 2026-10-22 — Visualizador web somente leitura do Cockpit
type: plan
work_id: 2026-10-22_read-only-viewer
scope:
  area: [gateway, viewer, tower-cli]
status: executed
risk: high
updated: 2026-10-22
summary: Gateway Node/TS que lê as sessões do cockpit-server pelo socket local e as mostra num xterm.js, exposto só na tailnet por `tower on/off`.
topic: [tooling, ui, api]
related:
  - work/tasks/2026-10-22_read-only-viewer
---

# Plano — Visualizador web somente leitura do Cockpit

> Cobre [[work/tasks/2026-10-22_read-only-viewer]] (etapas 1 e 2, num único plano: são pequenas e a etapa 2 só embrulha a 1).

## §4.0. Análises pré-plano

Uma análise (analista, sonnet) sobre o protocolo do Cockpit no clone `jacobaraujo7/remote_pi@7d923ab` (caminhos relativos a `cockpit/`), mais um probe real no Mac. As citações-chave foram revalidadas no thread principal.

### Q1: o que um cliente somente leitura precisa enviar e receber?

- **Transporte:** JSONL, um objeto por linha, UTF-8 (`packages/cockpit_protocol/lib/src/codec.dart:12,23-30`). Envelope `{"t": ...}`, bytes da PTY em base64 no campo `d`.
- **Versão:** `const int protocolVersion = 2;` (`packages/cockpit_protocol/lib/src/messages.dart:12`). A documentação ainda diz "v1" e está desatualizada. Versão diferente → `err{code:"version_mismatch"}` e o servidor fecha (`packages/cockpit_server/lib/src/remote_server.dart:519-526`). **Probe real em 2026-10-22:** `hello.ack {v:2, server:"0.1.0"}` e `pty.sessions` com 1 sessão (`/bin/zsh`, 127×41).
- **Socket:** `~/.cockpit/cockpit-server.sock` na build release; `-debug.sock` na build de dev (`lib/app/cockpit/data/terminal/sidecar/sidecar_terminal_connector.dart:267-268`). Sem token sobre socket Unix.
- **Mensagens seguras para enviar:** `hello`, `pty.list`, `pty.attach {id, from}`, `pty.detach`.
- **Nunca enviar:** `pty.input`, `pty.resize`, `pty.kill`, `pty.open`, `pty.ack`, `rpc`, `rpc.res`. Escrevem na PTY, matam processos ou rodam comandos (`remote_server.dart:535-640`).
- **Attach:** um replay (até 4 MiB) com `off` igual ao primeiro byte retido; depois a saída ao vivo, contígua, sem duplicar nem perder bytes. Linhas podem ter MBs, então não limitar o tamanho da linha. Dois clientes no mesmo PTY recebem a saída de forma independente, sem afetar o app.
- **Mensagens não pedidas que o servidor envia:** `turn.status` (broadcast para todos) e `rpc{m:"cli.cmd"}`. Ignorar as duas e nunca responder. Ignorar também qualquer `t` desconhecido.

### Q2: riscos para o app do Cockpit

- **Controle de fluxo:** o app abre as PTYs com `flowControlled: true`, numa janela de 256 KiB contada por sessão (`packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:188-197`; `sidecar_terminal_gateway.dart:111`). Com o app anexado, quem paga o crédito é o `pty.ack` dele. Se só o tower ficar anexado (`consumers > 0`, ninguém dá ack), **a leitura do shell trava depois de 256 KiB**. → Decisão D2.
- **Encaminhamento da CLI `cockpit`:** com mais de uma conexão, comandos `cockpit ...` sem dono de aba falham com "more than one Cockpit is attached" (`remote_server.dart:188-226`). → Decisão D3.
- **Ciclo de vida:** o sidecar morre quando o app fecha (`--exit-on-parent-close`, em `sidecar_terminal_connector.dart:122-129`); o tower não o mantém vivo. O app mata servidores que não reconhece, então o tower **nunca** cria nem substitui o socket (`:206-245, 257-262`).
- **Nomes das abas:** o protocolo não os traz. `pty.sessions` tem só `{id,pid,cmd,rows,cols,len,exit?}` (`remote_server.dart:603-614`). O `status.sock` lista abas, mas sem vínculo com o id da sessão (⚠ unverified: nenhum campo de ligação encontrado). → Fora do escopo; vira pedido ao Jacob.

## §4.1. Resumo e entendimento

Construir o `cockpit-tower`: um processo Node/TypeScript que roda no Mac só quando ligado. Ele faz quatro coisas:
- conecta ao `cockpit-server` local **como cliente extra**;
- lista as sessões de terminal;
- serve uma página com xterm.js que mostra a sessão escolhida (histórico + ao vivo);
- **nunca** escreve no terminal.

A página fica em loopback, e a única exposição é o `tailscale serve` (HTTPS, só na tailnet). O comando `tower on|off|status` liga e desliga o conjunto (gateway + `caffeinate` + `tailscale serve`), para o Mac só ficar acordado quando você quiser.

Decisões:
- **D1. Stack:** TypeScript rodando direto no Node ≥ 23.6, com type stripping nativo e sem build. Local: Node v26.3.1. Dependências: `ws` (servidor WebSocket), `@xterm/xterm` + `@xterm/addon-fit`, servidos do `node_modules` e não de CDN. Escolhido em vez de Dart porque o xterm.js e o WebSocket são nativos desse ecossistema; o protocolo é pequeno o suficiente para não exigir o pacote do Jacob.
- **D2. Controle de fluxo:** o tower **nunca envia `pty.ack`**, que é uma escrita e mexe no crédito do app. Para não ser o único consumidor de uma sessão:
  - anexa à sessão **só enquanto um navegador a assiste**;
  - desanexa quando o navegador sai;
  - desanexa se o navegador ficar mais de 10 min sem atividade.

  Risco residual documentado no README: se você fechar a aba no Mac enquanto a assiste pelo iPhone, uma saída muito grande pode travar o shell até você sair da página.
- **D3. Conexão preguiçosa:** o socket do Cockpit só é aberto enquanto há ao menos um navegador conectado. Assim a ambiguidade da CLI `cockpit` (Q2) só existe quando você está de fato olhando.
- **D4. Somente leitura em duas camadas:**
  - **saída:** um `send()` único com lista branca de tipos (`hello`, `pty.list`, `pty.attach`, `pty.detach`); qualquer outro tipo lança erro;
  - **entrada:** do navegador, o WebSocket aceita apenas `{type:"select", id}` e `{type:"list"}`; qualquer outra mensagem é ignorada e registrada no log.
- **D5. Exposição:**
  - HTTP + WS em `127.0.0.1:${TOWER_PORT:-7681}`;
  - `tailscale serve --bg --https=8443 http://127.0.0.1:7681`, numa porta dedicada para não sobrescrever outro `serve` seu;
  - em modo normal, rejeitar requisição sem o header `Tailscale-User-Login`, que o serve injeta. Isso garante que só chega quem vem pela tailnet. `--dev` desliga a exigência para testar localmente.

## §4.2. Arquivos afetados

- `package.json` (CREATE): metadados, `type: module`, dependências e scripts `start`/`test`.
- `src/protocol.ts` (CREATE): codec JSONL, tipos v2 e `send()` com lista branca.
- `src/cockpit-client.ts` (CREATE): conexão ao socket, handshake, list, attach/detach, reconexão com `from = off + len`.
- `src/server.ts` (CREATE): HTTP estático + WebSocket, header do Tailscale, conexão preguiçosa (D3), attach só com espectador (D2).
- `src/main.ts` (CREATE): leitura de env/flags (`--dev`, porta, caminho do socket) e start.
- `web/index.html`, `web/app.js`, `web/style.css` (CREATE): lista de sessões e terminal xterm.js somente leitura (`disableStdin: true`), layout para iPhone.
- `bin/tower` (CREATE): `on|off|status` em bash, com estado em `~/.cockpit-tower/` (pid, log).
- `test/fake-cockpit-server.ts` (CREATE): servidor falso v2 sobre socket Unix, que registra tudo o que recebe.
- `test/protocol.test.ts`, `test/client.test.ts`, `test/server.test.ts` (CREATE): testes com `node --test`.
- `README.md` (CREATE): pré-requisitos, uso, riscos (D2/D3) e o que nunca faz.
- `.gitignore` (UPDATE): `node_modules/`.
- `.claude/hooks/require-approved-plan.sh` (UPDATE): `GUARDED` passa a incluir `test/`? **Não.** Os testes ficam livres, como o wiki. Sem mudança.
- 🔒 **Regras afetadas:** nenhuma.
- 🔒 **ADRs afetados:** nenhum, porque ainda não há ADR. Este plano cria um (ver §4.7).

## §4.3. Mudanças e justificativa

### `src/protocol.ts`: a garantia de somente leitura

```ts
export const PROTOCOL_VERSION = 2;
const ALLOWED_OUT = new Set(['hello', 'pty.list', 'pty.attach', 'pty.detach']);

export function encode(msg: { t: string } & Record<string, unknown>): string {
  if (!ALLOWED_OUT.has(msg.t)) throw new Error(`refusing to send '${msg.t}': read-only client`);
  return JSON.stringify(msg) + '\n';
}
```

Todo envio passa por `encode`. O teste `protocol.test.ts` prova que `pty.input`, `pty.resize`, `pty.kill`, `pty.open`, `pty.ack` e `rpc` lançam erro. Um segundo teste faz um grep no código-fonte e falha se alguma dessas strings aparecer fora da lista de recusa.

### `src/cockpit-client.ts`: um cliente que só se conecta

- **Socket ausente → erro claro.** `connect(path)`: se o arquivo não existir, retorna `CockpitUnavailable` ("Cockpit não está aberto"); **nunca** tenta subir o servidor.
- **Handshake.** Envia `hello {v:2, client:"cockpit-tower/<versão>"}`. Um `version_mismatch` vira um erro visível na página: "Cockpit usa protocolo vN; tower suporta v2".
- **Reconexão.** Se o socket fechar, reconecta com backoff enquanto houver espectador e re-anexa cada sessão assistida com `from = últimoOff + bytes`.
- **Mensagens ignoradas.** `turn.status`, `rpc` e `t` desconhecidos são descartados (debug log).

### `src/server.ts`: ponte para o navegador

```ts
wss.on('connection', (ws, req) => {
  if (!dev && !req.headers['tailscale-user-login']) return ws.close(4401, 'tailnet only');
  viewers.add(ws);                       // D3: first viewer opens the Cockpit socket
  ws.on('message', (raw) => {
    const m = safeParse(raw);
    if (m?.type === 'list') return sendSessions(ws);
    if (m?.type === 'select' && typeof m.id === 'string') return watch(ws, m.id);
    log.warn('ignored viewer message');  // D4: nothing else is accepted
  });
});
```

O `watch` anexa a sessão ao Cockpit no primeiro espectador e desanexa no último (D2). O servidor HTTP escuta em `127.0.0.1` e nunca em `0.0.0.0`; um teste verifica o endereço do listener.

### `web/`: o visualizador

O xterm.js roda com `disableStdin: true` e `cursorBlink: false`. As colunas são as do PTY, reportadas em `pty.sessions`, e a fonte é ajustada para caber na largura do iPhone, com rolagem horizontal como alternativa (não podemos redimensionar, D4). A página tem uma lista de sessões (cmd · id · tamanho · bytes) e um aviso quando o Cockpit está fechado ou numa versão incompatível.

### `bin/tower`: ligar e desligar sob demanda

```bash
on)  node --experimental-strip-types "$ROOT/src/main.ts" >>"$STATE/tower.log" 2>&1 &
     echo $! >"$STATE/gateway.pid"
     caffeinate -is -w "$(cat "$STATE/gateway.pid")" &   # awake only while the gateway lives
     tailscale serve --bg --https=8443 "http://127.0.0.1:${TOWER_PORT:-7681}"
     echo "https://$(tailscale status --json | jq -r .Self.DNSName | sed 's/\.$//'):8443" ;;
off) tailscale serve --https=8443 off; kill "$(cat "$STATE/gateway.pid")" ;;
```

O `caffeinate -w` amarra o "manter acordado" à vida do gateway: matou o gateway, o Mac volta a poder dormir. `status` mostra o pid vivo, o `tailscale serve status` e se o socket do Cockpit existe. A flag `--experimental-strip-types` só entra se a versão do Node exigir; o script testa isso antes. Dependências do script: `tailscale` e `jq`, verificadas no início, com erro claro se faltarem.

## §4.4. Riscos e impacto

1. **O shell da aba trava por falta de crédito (D2).** Mitigação: anexar só com espectador, desanexar ao sair ou após 10 min ocioso, e documentar no README. Teste com o servidor falso: depois que o último espectador sai, o tower envia `pty.detach`.
2. **Comandos `cockpit ...` falham enquanto o tower está conectado (D3).** Mitigação: conexão preguiçosa e README.
3. **Algo envia escrita para a PTY.** Mitigação: lista branca em `encode`, entrada do navegador limitada a `list` e `select`, teste de recusa e grep.
4. **Exposição fora da tailnet.** Mitigação: listener em `127.0.0.1` (com teste), header do Tailscale obrigatório fora do `--dev`, porta 8443 só via `tailscale serve`. O comando `tailscale funnel`, que exporia à internet, **nunca** é usado.
5. **Mudança de protocolo no Cockpit.** Mitigação: `version_mismatch` vira mensagem visível, e a versão suportada fica numa constante.
6. **O tampa do MacBook fechada faz o Mac dormir mesmo com `caffeinate`, se não houver monitor externo.** Mitigação: limitação documentada no README; deixar a tampa aberta.

**Nível de risco:** `high`. O código abre um listener de rede e se conecta a terminais (`REVIEW.md`, "Sempre risco alto"). A revisão pelo agente roda em modo profundo, e a revisão humana lê o diff inteiro.

**Verificação:**
- `npm test` (`node --test test/`). Todos verdes, incluindo os testes de recusa, de listener em loopback, de detach sem espectador e de `version_mismatch`.
- Smoke real:
  - com o Cockpit aberto, `bin/tower on`;
  - `curl -s https://<host>.ts.net:8443/` deve devolver a página;
  - `curl -s http://127.0.0.1:7681/` sem o header deve recusar o WebSocket com 4401;
  - no iPhone, abrir a URL e ver a aba `zsh` com o histórico;
  - `bin/tower off` deve deixar `tailscale serve status` sem a 8443 e `pmset -g assertions` sem o `caffeinate`.

**Revert:**
- `bin/tower off`, que remove o serve e o caffeinate;
- reverter o merge;
- `rm -rf ~/.cockpit-tower`.

Nada é escrito no Cockpit nem em `~/.cockpit`, então não há o que desfazer lá.

## §4.5. Passos de execução

- [ ] (1) Criar a branch `feat/2026-10-22_read-only-viewer__tower` a partir de `dev`. Commitar a task, este plano e a execução nela.
- [ ] (2) `package.json`, `.gitignore`, `npm install ws @xterm/xterm @xterm/addon-fit`.
- [ ] (3) `src/protocol.ts` + `test/protocol.test.ts` (recusa + grep). Testes verdes.
- [ ] (4) `test/fake-cockpit-server.ts` + `src/cockpit-client.ts` + `test/client.test.ts`: handshake, mismatch, list, attach com replay, reconexão, mensagens ignoradas.
- [ ] (5) `src/server.ts` + `src/main.ts` + `test/server.test.ts`: loopback, header, conexão preguiçosa, detach sem espectador.
- [ ] (6) `web/`: lista + xterm somente leitura, layout para iPhone.
- [ ] (7) `bin/tower on|off|status`.
- [ ] (8) `README.md`.
- [ ] (9) Smoke real no Mac + iPhone (precisa de você para a parte do iPhone).
- [ ] (10) Revisão pelo agente (tier high, modo profundo) e registro dos achados. Depois, o gate humano.

## §4.6. Escopo

**Área(s) afetada(s):** `[gateway, viewer, tower-cli]`

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (CREATE): o subconjunto do protocolo que consumimos, o que nunca enviamos e por quê, e os riscos D2/D3, com citações do código do Cockpit.
- `cockpit_tower_wiki/services/gateway.md` (CREATE): arquitetura do gateway (cliente, ponte WS, conexão preguiçosa).
- `cockpit_tower_wiki/flows/tower-on-off.md` (CREATE): o fluxo de `tower on/off/status` com `caffeinate` e `tailscale serve`.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (CREATE): ADR com D2–D4 (somente leitura, sem `pty.ack`, conexão preguiçosa) e `revisit_when`: "o tower passar a aceitar digitação" ou "o protocolo trouxer o id da aba nas sessões".
- `cockpit_tower_wiki/overview.md` (UPDATE): o mapa do produto.
- `cockpit_tower_wiki/_meta/index.md` e `_meta/log.md`: regenerados e anexados pelo `/wiki-sync`.
