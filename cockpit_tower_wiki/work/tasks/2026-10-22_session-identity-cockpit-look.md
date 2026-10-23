---
title: 2026-10-22 — Identificar as sessões e deixar o viewer com a cara do Cockpit (parte 2 da tela do iPhone)
type: task
work_id: 2026-10-22_session-identity-cockpit-look
scope:
  area: [gateway, viewer]
status: done
updated: 2026-10-22
summary: Mostrar no iPhone de qual projeto, aba e agente é cada sessão, e organizar a navegação e o visual como no Cockpit.
topic: [ui]
related:
  - work/executions/2026-10-22_terminal-text-cockpit-style
  - contracts/cockpit-protocol-v2
  - decisions/2026-10-22_read-only-client
---

# Identificar as sessões e deixar o viewer com a cara do Cockpit (parte 2 da tela do iPhone)

## Contexto

Parte 2 da melhoria da tela do iPhone. Hoje a lista mostra só `zsh s3 · 143×60` para cada
sessão. Com muitas sessões abertas, é difícil achar a certa. No Cockpit o humano sabe de qual
projeto é cada terminal (a pasta do workspace), e o título da aba mostra a tarefa do agente.

O humano quer:

1. **Analisar até onde dá para saber sobre cada sessão** (projeto/pasta, aba, agente, atividade)
   e mostrar isso no iPhone.
2. **Deixar a aparência mais parecida com o próprio Cockpit**: a navegação por workspaces e abas,
   e o visual (cores, tipografia, ícones), indo além do texto do terminal da parte 1.

Levantamento inicial (2026-10-22, feito na conversa):

- O `pty.list` entrega `{id, pid, cmd, rows, cols, len, exit?}`, sem o id da aba
  ([[contracts/cockpit-protocol-v2]]).
- Pelo `pid` do shell, o Mac informa a pasta atual (`lsof -d cwd`), o terminal e o processo em
  primeiro plano (`claude`, `node`, `dart`…).
- O ambiente do shell (`COCKPIT_TAB_ID`) não é legível por outro processo no macOS.
- A CLI `cockpit` lista workspaces (nome, pasta) e abas (título, workspace, `working`, `focused`),
  mas não diz qual sessão de terminal é qual aba.

## Critérios de aceite

- [x] Cada sessão mostra pelo menos o projeto (nome e pasta) e o processo em primeiro plano, em vez de só `zsh`.
- [x] Quando dá para ligar a sessão à aba do Cockpit com segurança, mostra também o título da aba e se o agente está trabalhando; quando não dá, a sessão aparece sem esses dados, nunca com os de outra aba.
      *(Os títulos aparecem a partir da segunda coleta com os mesmos ids, ~5 s depois de abrir.)*
- [x] A navegação agrupa as sessões por projeto/workspace, como no Cockpit, e é confortável no celular.
- [x] As sessões ativas ou com agente trabalhando ficam fáceis de achar.
- [x] O visual (cabeçalho, navegação, cores, tipografia) segue o Cockpit.
- [x] O viewer continua somente leitura e não expõe nada novo fora da tailnet.

## Restrições

- Não alterar o Cockpit nem o `cockpit-server`.
- Somente leitura: comandos pelo celular são uma tarefa futura.
- Não depender de configuração das CLIs (Claude, Antigravity, Codex).
