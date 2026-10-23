---
title: Fluxo tower on / off / status
type: flow
scope:
  area: [tower-cli]
status: stable
updated: 2026-10-23
sources: []
code_refs:
  - bin/tower
  - src/tailnet-identity.ts
  - src/main.ts
  - src/serve-status.ts
  - src/status-json.ts
  - src/qr.ts
  - panel/tower.panel
related:
  - services/gateway
  - work/executions/2026-10-22_read-only-viewer
  - work/executions/2026-10-22_tower-cockpit-panel
  - cross-cutting/cockpit-exec-process-group
  - decisions/2026-10-23_phone-input-client
  - work/executions/2026-10-23_phone-terminal-input
---

# Fluxo tower on / off / status

O tower é ligado **sob demanda**: o Mac só fica acordado enquanto ele estiver ligado. O estado fica em `~/.cockpit-tower/`: pids, token e `gateway.config` (`0600`), registro de digitação `input.log` (`0600`), log e saída do serve, numa pasta `0700`.

Há duas formas de operar o tower: pelo terminal (`bin/tower on|off|status`) ou pelo painel do Cockpit, descrito [abaixo](#painel-do-cockpit). As duas rodam o mesmo `bin/tower`, então sempre concordam.

## `tower on` (`bin/tower:75`)

1. **Token.** Gera um token aleatório na primeira vez (`bin/tower:84-86`).
2. **Identidade.** Lê `tailscale status --json` e passa a `src/tailnet-identity.ts` a porta HTTPS (`bin/tower:93`; `src/tailnet-identity.ts:10`). Dali saem a **origem** da página e o **dono**, o login do Tailscale que pode digitar (`bin/tower:94-95`). `TOWER_OWNER` no ambiente sobrescreve o dono (`bin/tower:95`).
   - **Sem origem ou sem dono:** avisa `Tailscale identity unavailable; the page stays read-only` (`bin/tower:96`) e sobe assim mesmo, só em leitura.
3. **Reinício por configuração.** A configuração é token + origem + dono (`bin/tower:97`). Se o gateway está vivo e `gateway.config` difere dela, o gateway é reiniciado (`bin/tower:100-103`). Antes valia só o token.
4. **Porta.** Recusa subir se a porta já estiver ocupada por outro processo. Só aceita como gateway pronto quem responde `cockpit-tower` no `/healthz` (`bin/tower:40`).
   - **Ambiente do gateway.** `TOWER_TOKEN`, `TOWER_ORIGIN`, `TOWER_OWNER` e `TOWER_INPUT_LOG=$STATE/input.log` vão **por ambiente, nunca por argv** (`bin/tower:112-113`). Depois grava `gateway.config` com `umask 077` (`bin/tower:116`).
   - **Sem os três** (`TOWER_INPUT_LOG`, `TOWER_ORIGIN`, `TOWER_OWNER`), o gateway sobe com a página só em leitura e avisa no log (`src/main.ts:18-30`).
5. **Mac acordado.** `caffeinate -is -w <pid do gateway>` (`bin/tower:127`): o Mac fica acordado só enquanto o gateway vive.
   - **Sessão própria.** O gateway (`bin/tower:113`) e o `caffeinate` (`bin/tower:127`) sobem por `DETACH` (`bin/tower:26`), que roda `perl -MPOSIX` com `POSIX::setsid()` e depois `exec`. O macOS não tem `setsid(1)`. O `exec` mantém o pid, então o pid file e o `pid_is` continuam valendo. Sem isso, quando o tower é ligado pelo painel, os dois entram no grupo de processos do app Cockpit. Ver [[cross-cutting/cockpit-exec-process-group]].
6. **Publicação.** `tailscale serve --bg --https=8443 http://127.0.0.1:7681` (`bin/tower:134`). A saída vai para um arquivo e o script espera até 20 s.
   - **Se o Serve não está habilitado na tailnet:** o comando imprime um link de consentimento e espera para sempre. O tower mostra o link e desliga tudo.
   - **Confirmação:** a publicação é conferida pelo `serve status --json` (`bin/tower:43-47`).
   - **Falha:** mostra a saída do `serve` e desliga tudo (`bin/tower:146-150`).

## `tower off` (`bin/tower:157`)

- Sempre tenta `tailscale serve --https=8443 off` (`bin/tower:160`). O comando é idempotente, e o `reset` nunca é usado, para não apagar outras configurações.
- Para o gateway e o `caffeinate` e espera que saiam.
- Apaga os pid files e `gateway.config`, além do `gateway.token`, nome antigo dele (`bin/tower:172-173`). O `token` e o `input.log` ficam.

## `tower status`

Mostra gateway, caffeinate, publicação na tailnet e se o socket do Cockpit existe.

- **`--json`** (`bin/tower:178`, `bin/tower:195`). O formato é `{on, gateway{running,pid,port}, awake{running,pid}, tailnet{published,port,url}, cockpit{socket,path}}`, montado por `src/status-json.ts`. `published` usa o mesmo teste do texto, `serve_published` (`bin/tower:43`). `on` vale gateway vivo e porta publicada (`src/status-json.ts:22`). `url` só aparece se estiver publicado e começar com `https://` (`src/status-json.ts:25`).

## `tower qr`

Imprime o QR code da URL em SVG (`bin/tower:206-211`), gerado por `qrcode-generator` em `src/qr.ts:8-11`. Recusa sem publicação ou quando a URL não é `https://` (`bin/tower:208-209`).

## Painel do Cockpit

`panel/tower.panel` é uma casca sobre o `bin/tower`. Ele roda `./bin/tower …` pela ponte `cockpit("exec …")`, com `cwd: ..` (`panel/tower.panel:4`).

- **Estado:** `status --json` a cada 5 s (`panel/tower.panel:67`), sem chamadas sobrepostas. Uma chamada feita durante um poll espera e repete o poll (`panel/tower.panel:92-93`), para o estado mostrado depois de uma ação ser sempre lido depois dela.
- **Ações:** `exec --timeout 60` (`panel/tower.panel:145`), porque o `tower on` pode levar cerca de 25 s.
- **Erros:** um campo por origem: ação, status e QR (`panel/tower.panel:73`). Cada um some quando a sua origem volta ao normal.
- **Visual:** neste tema, `--ckp-accent-text` é azul sobre o fundo azul, então o painel sobrescreve `button.primary` (`panel/tower.panel:18`).

## Cuidados

- **Pid file.** Só é confiável se o pid ainda for o nosso processo (`bin/tower:29-35`), porque pids são reutilizados depois de um crash.
- **Não usar `cmd | grep -q` com `pipefail`.** O `grep` sai no primeiro match e mata o comando com SIGPIPE. Capture a saída antes. Esse erro apareceu na revisão.
- **O raio do Cockpit é outra coisa.** O botão de "manter acordado" do Cockpit é independente do tower: não liga nem desliga o tower.
- **O token nunca vai no argv.** O argv de qualquer processo aparece no `ps`. O `tailnet_url` pede ao node só a base da URL e anexa o token com o `echo` do shell, que é builtin (`bin/tower:49-58`). A URL chega a `src/status-json.ts` e `src/qr.ts` pelo stdin. No painel, as mensagens de erro são fixas, e linhas com `https://` são filtradas das saídas mostradas (`panel/tower.panel:147`). Esse vazamento já existia e foi achado na revisão de [[work/executions/2026-10-22_tower-cockpit-panel]].
- **Tailscale parado.** Com o Tailscale do Mac desligado (`BackendState: Stopped`), o `tower on` mostra `Tailscale is stopped.`, que é a saída do `serve` (`bin/tower:147`), e desliga tudo. Basta ligar o Tailscale e repetir. Visto em [[work/executions/2026-10-23_phone-terminal-input]].
- **Origem e dono nunca vão no argv.** Vão por ambiente, como o token (`bin/tower:112-113`).
- **Tampa fechada.** Com a tampa do MacBook fechada e sem monitor externo, o Mac dorme mesmo com o `caffeinate`.
