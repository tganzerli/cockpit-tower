---
title: 2026-10-22 — Painel do Cockpit para ligar e desligar o Tower
type: execution
work_id: 2026-10-22_tower-cockpit-panel
scope:
  area: [tower-cli, panel]
status: done
updated: 2026-10-22
summary: Painel panel/tower.panel com estado, botões ligar/desligar, URL e QR; tower status --json, tower qr e processos desligados do grupo do Cockpit.
topic: [tooling, ui]
related: ["[[flows/tower-on-off]]", "[[overview]]", "[[cross-cutting/cockpit-exec-process-group]]"]
---

# Log de execução — 2026-10-22_tower-cockpit-panel

## Metadados

- **ID:** `2026-10-22_tower-cockpit-panel`
- **Task:** [[work/tasks/2026-10-22_tower-cockpit-panel]]
- **Plano:** [[work/plans/2026-10-22_tower-cockpit-panel]]
- **Status:** `done`
- **Início:** `2026-10-22`
- **Fim:** `2026-10-22`
- **Escopo:** áreas `[tower-cli, panel]`
- **Branch:** `feat/2026-10-22_tower-cockpit-panel__tower` (base `dev` @ `e7688b7`)

## Checklist (espelha o plano §4.5)

- [x] 1 — Criar a branch (decisão do humano: base `dev`, fechamento da read-only-viewer em PR separado)
- [x] 2 — `npm install qrcode-generator@2.0.4 --save-exact`
- [x] 3 — `src/status-json.ts` + `test/status-json.test.ts`
- [x] 4 — `src/qr.ts` + `test/qr.test.ts`
- [x] 5 — `bin/tower`: `DETACH`, `status --json`, `qr`, texto de uso
- [x] 6 — Verificações 2 a 4 da §4.4
- [x] 7 — `panel/tower.panel` + conferência visual no Cockpit
- [x] 8 — README, seção "From Cockpit"
- [x] 9 — Commits + revisão de agente (deep, 2 rodadas)
- [x] 10 — Entregar ao humano a verificação 5 e o gate do diff completo (aprovado: "pode fazer o push e abrir o PR")

## Atividade (cronológica)

### `2026-10-22` — preparação
- O humano aprovou o plano (tier `high`), pediu que o fechamento da read-only-viewer fosse num PR separado e autorizou apagar a branch antiga.
- Fechamento da read-only-viewer: branch `docs/2026-10-22_read-only-viewer__work`, commit `4ddf1d6`, PR #2 para o `dev`. A task foi marcada como `done` e o `/work-index` foi regenerado.
- A branch `feat/2026-10-22_read-only-viewer__tower` foi apagada, local e remota, depois de mergeada no PR #1.
- Branch nova criada a partir do `dev`.

### `2026-10-22` — passos 2 a 8
- `qrcode-generator@2.0.4` instalado com versão fixa ("added 1 package … found 0 vulnerabilities"). Ele expõe `import` em `./dist/qrcode.mjs`, e o `createSvgTag` não inclui o texto codificado no SVG.
- `src/status-json.ts`, `src/qr.ts` e os testes, no padrão de `src/serve-status.ts`.
- `bin/tower`: o array `DETACH` (perl `POSIX::setsid` + `exec`) no gateway e no caffeinate, `current_url`, `status_json`, `cmd_qr` (que só aceita URL `https://`) e o texto de uso.
- `panel/tower.panel`: petite-vue + `cockpit.css`. As capturas de tela ligado e desligado foram conferidas e apagadas em seguida, porque a captura com o Tower ligado continha o token.
- Correção visual: com `cockpit.css`, o `button.primary` usa `color: var(--ckp-accent-text)`, e neste tema esse valor é azul sobre o fundo azul. O painel sobrescreve com `var(--ckp-bg)`.
- README: subseção "From Cockpit" e os comandos `status --json` e `qr`.

## Commits

- `342b11b` docs(work): add tower-cockpit-panel task and plan
- `7549fb4` feat: control tower from a Cockpit panel
- `f9abaea` fix: address review round 1
- `601e9b3` fix: validate status shape in the Cockpit panel
- `d64048f` docs(work): log tower-cockpit-panel execution and review
- `bb4ab27` docs(work): close tower-cockpit-panel execution

## Divergências do plano

- **Gate da branch de fechamento.** A §4.6 do `git_branching_rule.md` pede um plano `approved` para o work_id da branch `docs/2026-10-22_read-only-viewer__work`, mas esse plano já está `executed`. O humano pediu explicitamente o PR separado, e o commit só registra o fechamento da tríade (status e índice), sem código.

## Validações

- [x] Testes: `npm test` → exit 0
  ```
  ℹ tests 35
  ℹ pass 35
  ℹ fail 0
  ```
- [x] Sintaxe: `bash -n bin/tower` → `syntax-ok`
- [x] §4.4 verificação 2, com o Tower desligado: `bin/tower status --json | node -e '…process.exit(s.on?1:0)'` → `off-check exit=0`
  ```
  {"on":false,"gateway":{"running":false,"pid":null,"port":7681},"awake":{"running":false,"pid":null},"tailnet":{"published":false,"port":8443,"url":null},"cockpit":{"socket":true,...}}
  ```
  `bin/tower qr` → `tower: not published on the tailnet; run 'tower on' first`, exit 1. `bin/tower bogus` → `usage: tower on|off|status [--json]|qr`, exit 2.
- [x] §4.4 verificação 3, ligando pelo `cockpit exec` (o mesmo caminho do painel): `cockpit exec --json --timeout 60 --cwd "$PWD" -- ./bin/tower on` → `ok true code 0`. Em seguida, `ps -o pid,ppid,pgid,sess,command`:
  ```
   8936     1  8936      0 node .../src/main.ts
   8978     1  8978      0 caffeinate -is -w 8936
  ```
  O PGID é igual ao pid nos dois processos, fora do grupo 39811 do Cockpit. O `status --json` deu `"on":true` com `tailnet.url` (o token foi mascarado na captura), e o `bin/tower qr | head -c 40` imprimiu `<svg version="1.1" xmlns=…`.
- [x] §4.4 verificação 4: `bin/tower off` → `tower: off — tailnet port 8443 unpublished`. O `status --json` voltou a `"on":false`, e o `ps -p 8936,8978` → `pids gone`.
- [x] Depois das correções da rodada 1: `npm test` → `ℹ pass 35 / ℹ fail 0`. Ligado pelo `cockpit exec`, o painel mostrou a URL e o QR sem erro. Varredura de argv durante 60 polls de `status --json` (`ps -Ao pid=,command=` + `index($0, token)`): 0 linhas. Depois do `601e9b3`: `npm test` → `pass 35 / fail 0`, e o painel desligado renderiza sem erro.
- [x] §4.4 verificação 5 (uso real pelo humano): o humano testou no iPhone e respondeu "testei no iPhone, funcionou".

## Revisão de agente

Tier `high`, modo deep.

| Rodada | Range revisado | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `e7688b7..7549fb4` (diff completo) | 3 | 2 | 0 |
| 2 | `7549fb4..f9abaea` | 0 | 1 | 0 |

A rodada 2 confirmou os cinco achados da rodada 1 como corrigidos. Sem `Important` aberto, não houve rodada 3. O Nit foi corrigido de passagem em `601e9b3`.

### Achados e resultado

| # | Rodada | Tag | Achado | Resultado | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Important | `panel/tower.panel` tinha um único slot de erro, limpo só com o prefixo `tower status`, e o erro do `qr` voltava a cada poll quando `url` era null | fixed (`f9abaea`): um slot por origem (`actionError`, `statusError`, `qrError`) e o `qr` só roda com `tailnet.url` | — |
| 2 | 1 | Important | `tailnet_url` passava o token no argv do `node -e` (pré-existente, mas este diff passou a chamá-lo a cada 5 s, e os comentários diziam o contrário) | fixed (`f9abaea`): o node devolve só a base, e o shell anexa o token com o builtin `echo`. Varredura do `ps` com 60 amostras durante polls: 0 ocorrências | — (primeira ocorrência: a busca por `argv`/`ps` no trabalho anterior e no `REVIEW.md` não achou nada) |
| 3 | 1 | Important | Corrida entre poll e ação deixava estado velho; `run` sem try/finally; Turn off desabilitado quando `!s` | fixed (`f9abaea`): `refresh` serializado com re-poll, try/finally em `run`, Turn off só desabilitado quando `busy` | — |
| 4 | 1 | Nit | `published` do JSON vinha de `current_url`, e o status em texto vinha de `serve_published` | fixed (`f9abaea`): o `pub` vem de `serve_published`, e a URL fica à parte | — |
| 5 | 1 | Nit | `e.message` do `JSON.parse` podia mostrar o token | fixed (`f9abaea`): mensagem fixa | — |
| 6 | 2 | Nit | `poll` não validava o formato do JSON: sem `tailnet`/`gateway`, lançava TypeError sem tratamento | fixed (`601e9b3`): checagem do formato com mensagem fixa. Também passou a filtrar `https://` do erro de ação | — |

## Wiki sync

- **Adiado** (`git_branching_rule.md` §6.2). O humano pediu o PR logo depois do teste no iPhone, e o `/wiki-sync` é manual, com gate próprio. Ele roda em seguida, sobre as páginas abaixo, e o plano passa para `executed` nesse momento.

## Páginas da wiki afetadas

- `cockpit_tower_wiki/flows/tower-on-off.md`
- `cockpit_tower_wiki/overview.md`
- `cockpit_tower_wiki/cross-cutting/cockpit-exec-process-group.md` (nova)
