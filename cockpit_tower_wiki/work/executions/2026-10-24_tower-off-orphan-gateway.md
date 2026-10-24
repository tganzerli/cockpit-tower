---
title: 2026-10-24 — Execução: `tower off` diz "off" e deixa o gateway vivo na porta
type: execution
work_id: 2026-10-24_tower-off-orphan-gateway
scope:
  area: [bin]
status: done
updated: 2026-10-24
summary: O bin/tower reconhece o gateway do tower de qualquer checkout (pidfile de checkout do tower, ou a porta com /healthz): o off para e só apaga o pidfile quando ele sai, o on troca de checkout e o status mostra a origem.
topic: [bugfix, tooling]
related: []
---

# Execução — 2026-10-24_tower-off-orphan-gateway

## Metadados

- **ID:** `2026-10-24_tower-off-orphan-gateway`
- **Tarefa:** [[work/tasks/2026-10-24_tower-off-orphan-gateway]]
- **Plano:** [[work/plans/2026-10-24_tower-off-orphan-gateway]]
- **Status:** `done`
- **Início:** `2026-10-24`
- **Fim:** `2026-10-24`
- **Escopo:** área `[bin]`
- **Branch:** `fix/2026-10-24_tower-off-orphan-gateway__bin`. A branch foi criada como `wip/…` num worktree próprio a partir da `origin/dev` `7d0a71d` e renomeada após a aprovação; a base foi conferida.

## Checklist (espelha o plano §4.5)

- [x] 1 — `bin/tower`: `gateway_root`, `port_listener`, `gateway_pid` novo, `wait_gone`, `port_owner`.
- [x] 2 — `bin/tower`: `cmd_off`, `cmd_on`, `cmd_status` e comentários.
- [x] 3 — `test/tower-cli.test.ts`.
- [x] 4 — `bash -n`, `npm test`, trailers e wiki-lint.
- [x] 5 — Revisão por agente com contexto limpo.
- [x] 6 — Teste real pelo dono e sinalização.

## Atividade (cronológica)

### `2026-10-24` — passos 1 e 2: `bin/tower`

- **Reconhecimento:**
  - `GATEWAY_CMD` (`^(.*/)?node (.+)/src/main\.ts$`) e `gateway_root`, que devolve a raiz do checkout a partir do comando do pid;
  - `port_listener` (`lsof … -t`, com a saída capturada antes de cortar a primeira linha);
  - `gateway_pid`: o pid do pidfile, ou o que escuta na porta se responde `cockpit-tower`.

  O `pid_is` ficou só para o `caffeinate`.
- **`wait_gone`:** confere com `ps -p` e devolve falha se o processo sobreviveu ao SIGKILL. Novo `port_owner`.
- **`cmd_off`:** para o gateway de qualquer checkout, avisa "(started from …)" e sai com erro, sem apagar o pidfile, se o processo não sair.
- **`cmd_on`:** troca de checkout ("switching to …"); o `rm -f "$PIDFILE"` só acontece quando nenhum gateway do tower está vivo; "port in use" passa a nomear quem ocupa a porta.
- **`cmd_status`:** mostra ", from <raiz>" quando o gateway é de outro checkout.
- **Conferência manual** no ambiente de reprodução do §4.0 B, com o script novo:
  - `B status` → `gateway: on (pid 5060, …, from …/repro-k25/A)`, e o JSON com `{'running': True, 'pid': 5060, 'port': 17681}`;
  - `B on` → "a gateway from …/A is running; switching to …/B";
  - `A off` → "gateway stopped (started from …/B)";
  - pidfile apagado e depois `A off` → "gateway stopped" (achado pela porta).

### `2026-10-24` — passo 3: teste

- `test/tower-cli.test.ts`, com 6 casos. Cada caso monta dois checkouts falsos, com estado e porta próprios, `tailscale` e `caffeinate` falsos, e mata o que sobrou ao terminar.
- **Contra o `bin/tower` antigo** (`git show origin/dev:bin/tower`), os 6 falham:
  ```
  ℹ pass 0
  ℹ fail 6
  ```
- **Com o novo:**
  ```
  ℹ pass 6
  ℹ fail 0
  ℹ skipped 0
  ```
- Nenhum processo `tower-cli-*` ficou vivo depois das rodadas (`ps -A`).

### `2026-10-24` — passo 5: revisão por agente (duas rodadas)

- **Rodada 1:** 2 Important e 1 Nit, todos corrigidos.
  - O pidfile passou a exigir que a raiz seja um checkout do tower (`bin/tower` existe).
  - Os testes ganharam as cercas: o falso "não-tower" com o mesmo comando (`FAKE_NOT_TOWER` por ambiente), o pid reaproveitado de outro projeto e o gateway que não sai (wrapper de `ps` com `STUCK_PID`).
  - O `on` regrava o pidfile de um gateway achado pela porta.
- **Mutações** (a cópia do script foi restaurada e conferida com `cmp`):
  - sem a checagem da raiz → falha `a pid file naming a reused pid that is another project's …`;
  - sem o `port_is_tower` → falha `a \`node <checkout>/src/main.ts\` on the port that does not answer cockpit-tower …`.
- **Rodada 2:** só sobre a correção, 0 Important e 1 Nit. O Nit dizia que o teste do pid reaproveitado talvez passasse sem a checagem da raiz. A mutação acima mostra que não passa: ele falha. Resultado: `wrong`.
- **Depois da correção:** `npm test` → `ℹ tests 158 · ℹ pass 158 · ℹ fail 0`.

## Commits

- `0c27b6a` docs(work): open the tower-off-orphan-gateway task and plan
- `9ce64fc` fix(bin): recognize the tower gateway from any checkout in tower on/off/status (com a correção da revisão juntada)
- docs(work): log the tower-off-orphan-gateway execution (este registro; o hash muda a cada emenda)

## Divergências do plano

- **Corrida no `on` e no `status`:** se o pid sai entre o `gateway_pid` e o `gateway_root`, a raiz cai em `$ROOT`, e não há troca nem ", from". O plano não tratava esse caso; sem isso, o `set -e` mataria o script.

## Validações

- [x] `bash -n bin/tower` → `bash -n ok`
- [x] `npm test` → exit 0
  ```
  ℹ tests 156
  ℹ pass 156
  ℹ fail 0
  ℹ skipped 0
  ```
- [x] `python3 scripts/ci/check_commit_trailers.py origin/dev` → `ok — 2 new commit(s) in origin/dev..HEAD, no LLM attribution`
- [x] `python3 .claude/skills/wiki-lint/lint.py --root .` → nenhuma linha `✗`. Antes de regenerar o `work/_index.md` (`/work-index`) acusava `catalog-drift: 1`, por causa dos status novos da tarefa e do plano.
- [x] Verificação §4.4: teste real pelo dono no Terminal.app, com o tower real. As URLs, que levam o token, foram omitidas:
  ```
  $W/bin/tower on
  tower: a gateway from /Users/thiagoganzerli/app/cockpit-tower is running; switching to …/scratchpad/wt-tower-off
  tower: on — https://…:8443/<token>/
  ~/app/cockpit-tower/bin/tower status      # script antigo (pré-merge): o bug
  gateway:   off
  $W/bin/tower status
  gateway:   on (pid 63499, http://127.0.0.1:7681)
  $W/bin/tower off
  tower: gateway stopped
  tower: off — tailnet port 8443 unpublished; the Mac can sleep again
  ~/app/cockpit-tower/bin/tower on
  tower: on — https://…:8443/<token>/
  ```

## Revisão por agente

Tier `medium`.

| Rodada | Intervalo revisado | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `7d0a71d..a5c43eb` (diff do trabalho) | 2 | 1 | 0 |
| 2 | `a5c43eb..bf8d647` (só a correção; depois juntada ao commit `fix`) | 0 | 1 | 0 |

### Achados e resultado

| # | Rodada | Tag | `file:line` | Resultado | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Important | `bin/tower:61`: o pidfile aceitava qualquer `node <raiz>/src/main.ts` (pid reaproveitado de outro projeto seria morto) | fixed (a raiz precisa ter `bin/tower`; teste novo) | — |
| 2 | 1 | Important | `test/tower-cli.test.ts:131`: o falso "não-tower" tinha `--not-tower` no argv, então a regex já o rejeitava; faltavam os testes do pid reaproveitado e do gateway que não sai | fixed (`FAKE_NOT_TOWER` por ambiente, dois testes novos, mutações) | — |
| 3 | 1 | Nit | `bin/tower:152`: gateway achado pela porta seguia sem pidfile depois do `on` | fixed | — |
| 4 | 2 | Nit | `test/tower-cli.test.ts`: o teste do pid reaproveitado talvez não dependesse da checagem da raiz | wrong (a mutação 1 o faz falhar) | — |

## Páginas do wiki afetadas

Do plano §4.7:
- `cockpit_tower_wiki/flows/tower-on-off.md` (UPDATE) — `on` (troca de checkout, porta ocupada), `off` (qualquer checkout, pidfile só depois que o gateway saiu), `status` (origem), "Cuidados" (estado compartilhado) e citações `bin/tower:N`.

## Notas em aberto

—
