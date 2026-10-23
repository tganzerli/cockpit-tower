---
title: 2026-10-22 — Visualizador web somente leitura do Cockpit
type: task
work_id: 2026-10-22_read-only-viewer
scope:
  area: [gateway, viewer, tower-cli]
status: done
updated: 2026-10-22
summary: Ver, pelo Safari do iPhone via Tailscale, as abas de terminal do Cockpit rodando no Mac, sob demanda e somente leitura.
topic: [tooling, ui, api]
related: []
---

# Visualizador web somente leitura do Cockpit

## Contexto

Os agentes (Claude Code, Antigravity CLI) rodam em abas de terminal do Remote Pi Cockpit no Mac. O Cockpit não tem cliente para iPhone, e o host remoto dele é por SSH. Quero acompanhar essas abas pelo iPhone de forma **pontual**: só quando eu ligar o modo remoto e mantiver o Mac acordado. Fora isso, o Mac dorme normalmente.

Os terminais locais do Cockpit rodam no `cockpit-server` (sidecar), que escuta um socket Unix em `~/.cockpit/cockpit-server.sock`. O protocolo é JSONL documentado: `hello`, `pty.list`, `pty.attach` com replay do histórico e saída ao vivo. As sessões pertencem ao servidor, então um segundo cliente pode se anexar sem afetar o app.

Decisões já tomadas:
- **Não é fork do Cockpit:** é um cliente do protocolo dele, num repositório separado. Se ficar bom, oferecemos ao Jacob.
- **Somente leitura nesta task:** digitar no terminal fica para o futuro.
- **Exposição só na tailnet** via `tailscale serve`. Nada de porta aberta na internet.

## Critérios de aceite

- [x] O gateway conecta ao socket do Cockpit **sem** subir, matar ou substituir o servidor. Se o socket não existir ou não responder, mostra uma mensagem clara.
- [x] Uma página web lista as sessões ativas e mostra a escolhida com o histórico (replay) e ao vivo, num terminal xterm.js usável no Safari do iPhone.
- [x] Nenhum caminho de código envia `pty.input`, `pty.resize` ou `pty.kill`, e um teste prova isso.
- [x] O listener do gateway escuta só em loopback. A exposição acontece **apenas** via `tailscale serve` (HTTPS na tailnet).
- [x] `tower on` liga o `caffeinate`, o gateway e o `tailscale serve`, e mostra a URL. `tower off` desfaz os três e o Mac volta a poder dormir. `tower status` diz o que está ligado.
- [x] Uma versão de protocolo incompatível (o Cockpit atualizado) gera um erro claro, não uma tela vazia.
- [x] O README explica os pré-requisitos (Cockpit aberto, Tailscale no Mac e no iPhone) e o uso.

## Escopo declarado

**Área(s) afetada(s):** `[gateway, viewer, tower-cli]`

## Fontes relacionadas

### Externas
- https://github.com/jacobaraujo7/remote_pi — `cockpit/docs/remote-protocol.md` (protocolo), `cockpit/lib/app/cockpit/data/terminal/sidecar/sidecar_terminal_connector.dart` (socket e ciclo de vida do sidecar).
- Documentação do `tailscale serve`.

## Restrições / disciplina

- Não alterar nada no Cockpit nem nos arquivos em `~/.cockpit`, exceto conectar ao socket.
- Nenhum listener fora de loopback; nenhuma credencial no repositório.
- A stack do gateway é decidida no plano (TypeScript/Node ou Dart).

## Etapas

### Etapa 1: gateway + visualizador somente leitura (open)
Conexão ao socket, listagem, attach com replay e página xterm.js.

#### Plano executado
- `—`

### Etapa 2: `tower on/off/status` (open)
`caffeinate` + gateway + `tailscale serve`, ligados sob demanda.

#### Plano executado
- `—`

## Sucesso

Fora de casa, rodo `tower on` antes de sair (ou pelo SSH), abro a URL da tailnet no iPhone e acompanho o agente trabalhando na aba do Cockpit. Ao voltar, `tower off`.
