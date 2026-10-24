---
title: 2026-10-24 — `tower off` diz "off" e deixa o gateway vivo na porta
type: task
work_id: 2026-10-24_tower-off-orphan-gateway
scope:
  area: [bin]
status: done
updated: 2026-10-24
summary: O bin/tower passa a reconhecer o gateway do tower de qualquer checkout, para pará-lo no off e trocá-lo no on, sem apagar o pidfile de um gateway vivo nem dizer "off" com ele rodando.
topic: [bugfix, tooling]
related:
  - flows/tower-on-off
  - work/executions/2026-10-24_viewer-new-tab-button
---

# `tower off` diz "off" e deixa o gateway vivo na porta

## Contexto

Cartão k25. Em 2026-10-24, no fechamento do trio [[work/executions/2026-10-24_viewer-new-tab-button]]:
1. O `bin/tower off` do worktree de teste respondeu "tower: off" sem "tower: gateway stopped".
2. O gateway (pid 28072) continuou vivo na porta 7681, já sem publicação no tailnet e sem `gateway.pid`.
3. O `tower on` do checkout principal morreu com "port 7681 is already in use by another process".
4. Foi preciso um `kill` à mão.

O estado (`~/.cockpit-tower`: pidfile, config, token) é **um só para todos os checkouts**. Mas cada `bin/tower` só reconhece como seu o gateway cujo comando tem o **próprio** caminho (`$MAIN`). E tanto o `on` quanto o `off` apagam o pidfile mesmo quando ele aponta para o gateway vivo de outro checkout. Depois disso, ninguém mais acha o gateway.

**Decisões do dono (2026-10-24):**
- **D1. `on` cruzado troca.** Se o gateway que está rodando é de outro checkout, o `on` o para e sobe o deste, avisando.
- **D2. `off` para qualquer gateway do tower.** Só existe um tower por vez (uma porta, um estado). O `off` para o gateway que estiver no pidfile ou escutando na porta, desde que seja um gateway do tower, e diz de onde era.

## Critérios de aceite

- [x] `tower off` para o gateway do tower mesmo quando ele foi ligado por outro checkout, e diz de qual caminho era.
- [x] `tower off` também acha um gateway do tower que perdeu o pidfile (escutando na porta e respondendo `cockpit-tower` no `/healthz`).
- [x] Nenhum caminho apaga o pidfile de um gateway que continua vivo. Se o gateway não morrer, o `off` diz isso e sai com erro, em vez de "off".
- [x] `tower on` com o gateway de outro checkout rodando troca para o deste, avisando.
- [x] `tower on` com a porta ocupada por algo que não é o tower mostra o pid e o comando de quem a ocupa.
- [x] `tower status` (e o `--json` do painel) mostra o gateway de qualquer checkout como ligado.
- [x] O gateway só é parado se for do tower (`node …/src/main.ts`); nunca outro processo, nem o servidor do Cockpit.
- [x] Um teste automatizado reproduz o cenário de dois checkouts com um estado só.

## Escopo declarado

**Área(s) afetada(s):** `[bin]`

## Fontes relacionadas

### Internas
- `bin/tower` — `pid_is`/`gateway_pid` (linhas 29-36), `cmd_on` (75), `rm -f "$PIDFILE"` no `on` (107) e no `off` (173), `wait_gone` (66).
- [[flows/tower-on-off]] — o fluxo documentado.
- `panel/tower.panel` — roda `./bin/tower status --json` do checkout principal.

## Restrições / disciplina

- Nada de matar o `cockpit-server` nem processos que não sejam o gateway do tower (`REVIEW.md`, "Ciclo de vida").
- Não mudar o formato do `status --json` que o painel lê.
