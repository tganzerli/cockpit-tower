---
title: 2026-10-24 — `tower off` diz "off" e deixa o gateway vivo na porta
type: plan
work_id: 2026-10-24_tower-off-orphan-gateway
scope:
  area: [bin]
status: approved
risk: medium
updated: 2026-10-24
summary: O bin/tower reconhece o gateway do tower de qualquer checkout (pelo pidfile ou pela porta), para no off, troca no on e só apaga o pidfile quando o processo saiu; um teste sobe dois checkouts falsos com um estado só.
topic: [bugfix, tooling]
related:
  - work/tasks/2026-10-24_tower-off-orphan-gateway
  - flows/tower-on-off
---

# Plano — `tower off` diz "off" e deixa o gateway vivo na porta

> Cobre [[work/tasks/2026-10-24_tower-off-orphan-gateway]] (cartão k25). As decisões do dono que estão na tarefa ficam fixas aqui:
> - **D1:** um `on` cruzado troca para o checkout que o chamou.
> - **D2:** o `off` para qualquer gateway do tower.
>
> Modelo recomendado para escrever e executar: Opus. O trabalho é pequeno, mas um erro de shell aqui mata o processo errado.

## §4.0. Análises pré-plano

A triagem levantou uma pergunta só: por que o `off` não parou o gateway? Ela foi respondida por uma **reprodução** no thread principal. Por isso não houve agentes.

### A. Hipótese descartada: falta de permissão

- No sandbox do Claude Code, `kill -0 86303` (o gateway real) deu exit 0, e `ps -p 28072 -o command=` mostrou o comando.
- O processo órfão tinha o caminho do worktree, o mesmo `$MAIN` do `bin/tower` usado no `off`.
- Logo, nem o `ps` nem o `kill` falhavam.

### B. Reprodução: o estado compartilhado e o reconhecimento por checkout (2026-10-24)

**Montagem:**
- dois checkouts falsos, A e B, cada um com uma cópia do `bin/tower` desta `dev` e um `src/main.ts` falso que só responde `cockpit-tower` no `/healthz`;
- `tailscale` e `caffeinate` falsos no PATH;
- `TOWER_STATE` próprio, porta 17681.

**Caminho 1, pelo `off`:**
```
== A on                    → pidfile: 90826
== B off (other checkout)  → tower: off — …   (sem "gateway stopped")
pidfile after: GONE
A gateway alive: 90826 node …/repro-k25/A/src/main.ts
== A off (own checkout)    → tower: off — …   (sem "gateway stopped")
A gateway alive: 90826 …
== B on                    → tower: port 17681 is already in use by another process
== A on                    → tower: port 17681 is already in use by another process
```

**Caminho 2, pelo `on`:**
```
A on, pid 91228
== B on (other checkout)   → tower: port 17681 is already in use by another process
pidfile after: GONE
== A status                → gateway:   off   (com o gateway vivo)
```

**Causa:**
- O estado (`$STATE`, padrão `~/.cockpit-tower`) é **um só** para todos os checkouts (`bin/tower:10`, `:14`).
- O `pid_is` reconhece o gateway só pelo **próprio** caminho (`gateway_pid` com `$MAIN`, `bin/tower:19`, `:36`).
- E dois lugares apagam o pidfile sem saber se aquele pid está vivo:
  - o `on`, quando o gateway não é deste checkout (`bin/tower:107`);
  - o `off`, sempre (`bin/tower:173`).

  Depois disso, nenhum checkout acha o gateway: o `off` diz "off", o `on` morre com "port in use" e o `status` (e o painel) diz "off".

**Fragilidade extra:** o `wait_gone` (`bin/tower:66-73`) considera morto qualquer pid em que o `kill -0` falhe, inclusive por falta de permissão. E o `kill` final não é conferido.

### C. O que mais usa esses pontos

- **Painel:** o `panel/tower.panel` só roda `./bin/tower status --json`, `qr`, `on` e `off` (`panel/tower.panel:103`, `:131`, `:144`). O formato do JSON vem de `src/status-json.ts` e não muda.
- **CI:** roda em `ubuntu-latest` (`.github/workflows/methodology-checks.yml:31`). O teste novo usa `bash`, `perl`, `curl` e `ps`, presentes lá. O `lsof` é opcional no script e no teste.

## §4.1. Resumo e entendimento

Só existe **um** tower por vez: uma porta, um estado em `~/.cockpit-tower`. Mas cada checkout (o principal e os worktrees de teste) só se reconhecia a si mesmo. Quando um checkout mexia no estado, apagava o pidfile do gateway do outro, e esse gateway ficava órfão na porta. A partir daí, nada no script conseguia mais pará-lo nem ligar outro.

A correção faz o `bin/tower` reconhecer **o gateway do tower de qualquer checkout**:
- **Pelo pidfile:** um processo `node <raiz>/src/main.ts`, de qualquer raiz.
- **Pela porta:** quando o pidfile se perdeu, o processo que escuta a porta, desde que responda `cockpit-tower` no `/healthz` e seja `node …/src/main.ts`.

O comportamento passa a ser:
- **`off`** para esse gateway e diz de onde era (D2). Só apaga o pidfile depois que o processo saiu; se ele não sair, avisa e sai com erro.
- **`on`** troca para este checkout quando o gateway é de outro (D1). Se a porta está com algo que não é o tower, mostra o pid e o comando.
- **`status`** e o JSON do painel mostram o gateway de qualquer checkout.

## §4.2. Arquivos afetados

- `bin/tower` (UPDATE) — reconhecimento por qualquer checkout, `off`/`on`/`status` e `wait_gone`.
- `test/tower-cli.test.ts` (CREATE) — dois checkouts falsos com um estado só.
- `cockpit_tower_wiki/board.kanban` — k25 para *Em curso* no início e para *Done* no fechamento, pelo PR de wiki.

🔒 **Rules affected:** nenhuma regra `.agents/rules/*` descreve o `bin/tower`. O `REVIEW.md` ("Ciclo de vida": o gateway nunca inicia nem mata o servidor do Cockpit) continua valendo como está, e o plano o respeita: só para processos `node …/src/main.ts`.

🔒 **ADRs affected:** nenhuma ADR governa o ciclo de vida do `bin/tower`. As ADRs do tower tratam do protocolo e da digitação. Nenhuma é tocada.

## §4.3. Mudanças e justificativa

### `bin/tower`

**Reconhecimento**, no lugar de `gateway_pid` (`bin/tower:36`). O `pid_is` fica só para o `caffeinate`.

```bash
# Any checkout's gateway is `node <root>/src/main.ts`: the state dir is shared by every checkout (the main one
# and worktrees under test), so the pid file may name a gateway another checkout started.
GATEWAY_CMD='^(.*/)?node (.+)/src/main\.ts$'

# Prints the checkout a tower gateway pid was started from; fails if the pid is not a tower gateway.
gateway_root() {
  local cmd
  [[ "$1" =~ ^[0-9]+$ ]] || return 1
  cmd="$(ps -p "$1" -o command= 2>/dev/null)" || return 1
  [[ "$cmd" =~ $GATEWAY_CMD ]] || return 1
  echo "${BASH_REMATCH[2]}"
}

# The process listening on our port (lsof is optional: without it, only the pid file is used).
port_listener() {
  local out
  command -v lsof >/dev/null 2>&1 || return 1
  out="$(lsof -nP -iTCP:"$PORT" -sTCP:LISTEN -t 2>/dev/null)" || return 1
  [[ -n "$out" ]] && echo "${out%%$'\n'*}"
}

# The running tower gateway, from any checkout: the pid file's, else a tower gateway that lost it (on our port).
gateway_pid() {
  local pid
  if [[ -f "$PIDFILE" ]] && pid="$(cat "$PIDFILE")" && gateway_root "$pid" >/dev/null; then echo "$pid"; return 0; fi
  port_is_tower && pid="$(port_listener)" && gateway_root "$pid" >/dev/null && echo "$pid"
}
```

- O regex ancorado (`node <raiz>/src/main.ts` e nada mais) substitui o "contém `$MAIN`". Assim um pid reutilizado por outro programa não passa, e o caminho do checkout sai do próprio comando.
- **Pela porta:** só vale quem responde `cockpit-tower` no `/healthz` **e** tem esse comando. O servidor do Cockpit, ou qualquer outro processo na porta, nunca é parado.
- A saída do `lsof` é capturada antes de pegar a primeira linha, para não haver `cmd | head` com `pipefail` (ver "Cuidados" em [[flows/tower-on-off]]).

**`wait_gone`** confere com `ps -p` (existe, com ou sem permissão) e devolve falha se o processo sobreviveu:

```bash
# Waits for a pid to exit, SIGKILL after 5 s; fails if it is still there (ps, not kill -0: a pid we may not
# signal is not a dead one).
wait_gone() {
  local pid="$1"
  for _ in $(seq 1 50); do
    ps -p "$pid" >/dev/null 2>&1 || return 0
    sleep 0.1
  done
  kill -9 "$pid" 2>/dev/null || true
  sleep 0.2
  ! ps -p "$pid" >/dev/null 2>&1
}
```

**`cmd_off`** (`bin/tower:157-175`):

```bash
  local pid root
  if pid="$(gateway_pid)"; then
    root="$(gateway_root "$pid")" || root="?"
    kill "$pid" 2>/dev/null || true
    # Keep the pid file of a gateway that is still alive: losing it is what orphaned one (k25).
    wait_gone "$pid" || die "could not stop the gateway (pid $pid, started from $root); its pid file is kept"
    if [[ "$root" == "$ROOT" ]]; then echo "tower: gateway stopped"; else echo "tower: gateway stopped (started from $root)"; fi
  fi
  if pid="$(caffeinate_pid)"; then
    kill "$pid" 2>/dev/null || true
    wait_gone "$pid" || echo "tower: warning: caffeinate (pid $pid) did not exit" >&2
  fi
  rm -f "$PIDFILE" "$CAFFEINATE_PIDFILE" "$CONFIGFILE" "$STATE/gateway.token"
```

O `tailscale serve … off` continua vindo primeiro (`bin/tower:159-161`). Se o gateway não sair, a página já está fora do tailnet e o erro diz qual processo ficou.

**`cmd_on`** (`bin/tower:99-110`):

```bash
  local pid root
  if pid="$(gateway_pid)"; then
    root="$(gateway_root "$pid")"
    if [[ "$root" != "$ROOT" ]]; then
      echo "tower: a gateway from $root is running; switching to $ROOT"
      cmd_off >/dev/null
    elif [[ "$(cat "$CONFIGFILE" 2>/dev/null)" != "$config" ]]; then
      echo "tower: configuration changed; restarting the gateway"
      cmd_off >/dev/null
    fi
  fi
  if pid="$(gateway_pid)"; then
    echo "tower: gateway already running (pid $pid)"
  else
    rm -f "$PIDFILE" # no tower gateway is alive: the pid file can only be stale
    if port_answers; then
      die "port $PORT is already in use by $(port_owner); set TOWER_PORT to a free port"
    fi
    …
```

com

```bash
# Who holds our port, for the "in use" message: "pid N (command)", or "another process" without lsof.
port_owner() {
  local pid cmd
  pid="$(port_listener)" && cmd="$(ps -p "$pid" -o command= 2>/dev/null)" && { echo "pid $pid ($cmd)"; return; }
  echo "another process"
}
```

**`cmd_status`** (`bin/tower:177-181`): o gateway de outro checkout aparece ligado, com a origem:

```bash
  if pid="$(gateway_pid)"; then
    root="$(gateway_root "$pid")"
    echo "gateway:   on (pid $pid, http://127.0.0.1:$PORT$([[ "$root" != "$ROOT" ]] && echo ", from $root"))"
```

O `status_json` usa o mesmo `gateway_pid`, então o painel passa a ver o gateway de qualquer checkout, com o formato igual.

**Comentários:** o do `pid_is` (`bin/tower:28`) passa a dizer que ele vale para o `caffeinate`, e o cabeçalho do `off` (`bin/tower:4`) ganha "from any checkout".

### `test/tower-cli.test.ts` (novo)

Ele roda o `bin/tower` de verdade, com `node:test` + `child_process.spawnSync('bash', …)`, num ambiente montado em pasta temporária:
- dois checkouts falsos, A e B, cada um com a cópia do `bin/tower` do repo e `node_modules/ws/`;
- em cada checkout, `src/main.ts` falso (servidor HTTP que responde `cockpit-tower` no `/healthz`), `src/serve-status.ts` (`process.exit(0)`), `src/tailnet-identity.ts` vazio e o `src/status-json.ts` real;
- `tailscale` e `caffeinate` falsos no início do PATH;
- `TOWER_STATE` temporário, porta livre, `TOWER_OWNER=me`.

Casos:
1. `A on`, `B off` → "gateway stopped (started from A)"; o processo saiu; não há pidfile.
2. `A on`, `B on` → "switching to B"; o gateway vivo é o de B; o pidfile tem o pid de B; o de A saiu.
3. `A on`, pidfile apagado à mão, `A off` → acha pela porta e para (pulado sem `lsof`).
4. Porta ocupada por um servidor que **não** é o tower: o `on` falha citando o pid dele, e o `off` não o mata.
5. `A on`, `B status` → "gateway: on (pid N, …, from A)", e `B status --json` com `gateway.running: true`.
6. Os casos 1 e 2 refeitos no ambiente sem `lsof` (PATH sem ele), para provar que o pidfile basta.

Ao fim de cada caso, todo processo que sobrou é morto (pelo pidfile e pela lista de pids gravada no teste).

## §4.4. Riscos e impacto

- **Tier: `medium`.** Mexe no ciclo de vida (para processos), mas não em entrada, listener, autenticação nem publicação (`REVIEW.md` "Always high risk").
- **Parar o processo errado.** Só para `node <raiz>/src/main.ts`, e pela porta só quem também responde `cockpit-tower`. Um outro projeto com `node …/src/main.ts` só seria parado se estivesse no nosso pidfile, o que exige reutilização de pid **e** esse mesmo comando.
- **`on` cruzado** derruba a página aberta no celular por alguns segundos, porque o gateway reinicia. É o que D1 pede.
- **Painel:** passa a mostrar "on" para um gateway de worktree, o que é o estado real. O formato do JSON não muda.
- **`lsof` ausente:** sem ele, o caso "perdeu o pidfile" não é achado, e o comportamento é o de hoje, mas sem apagar o pidfile de quem está vivo.
- **Verificação:**
  - `npm test` → todos passam (`# fail 0`), com o `test/tower-cli.test.ts`;
  - `bash -n bin/tower`;
  - `python3 scripts/ci/check_commit_trailers.py origin/dev` e `python3 .claude/skills/wiki-lint/lint.py --root .` sem erros;
  - com o tower real, pelo dono, no Terminal.app: `<worktree>/bin/tower on` com o principal ligado → "switching"; depois `~/app/cockpit-tower/bin/tower off` → "gateway stopped (started from <worktree>)"; e `~/app/cockpit-tower/bin/tower on` volta normal.
- **Como reverter:** `git revert` dos commits do trio. Nenhum estado novo é gravado.

## §4.5. Passos de execução

1. `bin/tower`: `gateway_root`, `port_listener`, `gateway_pid` novo, `wait_gone`, `port_owner`.
2. `bin/tower`: `cmd_off`, `cmd_on`, `cmd_status` e comentários.
3. `test/tower-cli.test.ts`.
4. `bash -n bin/tower`, `npm test`, trailers e wiki-lint, com a saída registrada na execução.
5. Revisão por agente com contexto limpo (tier `medium`).
6. Teste real pelo dono (§4.4) e sinalização.

## §4.6. Escopo

Área: `bin` (`bin/tower`), mais um teste em `test/`. Sem `src/`, `web/` nem `panel/`.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/flows/tower-on-off.md`:
  - `tower on`: o passo 4 ganha a troca de checkout e a mensagem de porta ocupada;
  - `tower off`: para o gateway de qualquer checkout e só apaga o pidfile depois que ele saiu;
  - `tower status`: mostra a origem;
  - "Cuidados": o pidfile é compartilhado entre checkouts, e o reconhecimento é pelo comando `node <raiz>/src/main.ts`;
  - as citações `bin/tower:N` são atualizadas.
