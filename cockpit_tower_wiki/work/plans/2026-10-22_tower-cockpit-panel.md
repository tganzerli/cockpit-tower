---
title: 2026-10-22 — Painel do Cockpit para ligar e desligar o Tower
type: plan
work_id: 2026-10-22_tower-cockpit-panel
scope:
  area: [tower-cli, panel]
status: executed
risk: high
updated: 2026-10-22
summary: Painel panel/tower.panel com estado, botões ligar/desligar, URL e QR; tower status --json, tower qr e processos desligados do grupo do Cockpit.
topic: [tooling, ui]
related:
  - work/tasks/2026-10-22_tower-cockpit-panel
  - flows/tower-on-off
  - decisions/2026-10-22_read-only-client
---

# Plano — Painel do Cockpit para ligar e desligar o Tower

> Cobre [[work/tasks/2026-10-22_tower-cockpit-panel]]. Lido antes: [[flows/tower-on-off]], `REVIEW.md`, a referência de `.panel` da skill `cockpit-design` e a do verbo `exec` da skill `cockpit-cli`.

## §4.0. Análises pré-plano

Nenhum sub-agente foi usado. A única dúvida que mudava a forma do plano era como um processo se comporta quando é iniciado pelo `cockpit exec`, e isso só se responde com um teste prático. Rodei o teste no main thread com `sleep`, sem tocar no Tower.

1. **Um processo em segundo plano sobrevive ao fim do `exec`.** O comando `cockpit exec --json -- 'nohup sleep 300 >/dev/null 2>&1 & echo $!'` devolveu o pid 52587. Depois que o `exec` terminou, `ps` mostrava `52587  PPID 1  PGID 39811  sleep 300`.
2. **Mas ele fica no grupo de processos do app Cockpit.** O `ps -g 39811` lista `Cockpit.app/.../Cockpit` (pid 39811, líder do grupo), `cockpit-server-arm64 ... --exit-on-parent-close`, o `caffeinate -i -w 39811` do botão do raio e o `sleep` do teste. Um sinal enviado ao grupo, por exemplo quando o app fecha, pode levar junto o gateway e o `caffeinate` do Tower. Não testei se o Cockpit realmente sinaliza o grupo ao fechar (⚠ unverified), porque fechar o app derrubaria esta sessão. Mesmo assim, separar os processos custa pouco e faz o ciclo de vida depender só de `tower on`/`off`, como pelo terminal.
3. **O macOS não tem o comando `setsid`.** O `which setsid` retorna `setsid not found`. O `perl -MPOSIX` está disponível e oferece `POSIX::setsid()` seguido de `exec`, que mantém o mesmo pid. Isso importa porque o `pid_is` confere o comando do processo (`bin/tower:23`, `bin/tower:30`).
4. **O `exec` não tem um timeout curto por padrão.** O `cockpit exec --json -- 'sleep 35; echo done'` levou 35,0 s e devolveu `"timedOut":false`. O `tower on` pode levar até cerca de 25 s: 5 s esperando o gateway e 20 s esperando o serve (`bin/tower:98`, `bin/tower:117`). Mesmo assim, o painel vai passar `--timeout 60` explicitamente.
5. **O JSON do `exec` é válido.** O `od -c` mostra `"stdout":"a\nb\n"` com o escape correto. A leitura de "JSON inválido" no primeiro teste veio do `echo` do zsh, que interpreta `\n`.
6. **Pontos de mudança no `bin/tower`:** o gateway sobe com `nohup node "$MAIN" ... &` (`bin/tower:94`), o caffeinate sobe com `caffeinate -is -w "$pid" ... &` (`bin/tower:108`), a URL é montada por `tailnet_url` (`bin/tower:43`), o status em texto fica em `cmd_status` (`bin/tower:157`) e os subcomandos são despachados em `bin/tower:169`.
7. **Restrições de um `.panel`:** os arquivos relativos só resolvem dentro da pasta do painel, o `cwd:` do frontmatter vale para `exec` e os recursos `/__cockpit__/cockpit.css` e `petite-vue.js` já vêm com o app. Não há biblioteca de QR code embutida. Fonte: `~/.claude/skills/cockpit-design/references/panel.md`, que é externa ao repositório.

**Modelo do plano:** o main thread (Opus). O código cabe no contexto, e a decisão de arquitetura saiu do teste acima.

## §4.1. Resumo e entendimento

O objetivo é operar o Tower sem terminal, pela interface do Cockpit, mantendo a mesma garantia de hoje: o Mac só fica acordado e publicado na tailnet enquanto o Tower estiver ligado. O painel é só uma casca. Toda a lógica continua no `bin/tower`, e o painel chama `./bin/tower on|off|status --json|qr` pelo `cockpit("exec ...")`. Para isso, o `bin/tower` precisa de três coisas:

- uma saída de status que uma máquina consiga ler (`--json`);
- um QR code da URL que nunca passe o token por argv;
- processos de fundo que não dependam de quem os chamou. Pelo terminal, a aba podia fechar. Pelo painel, o grupo de processos é o do próprio app Cockpit.

## §4.2. Arquivos afetados

| Arquivo | Ação |
|---|---|
| `bin/tower` | alterar: `status --json`, subcomando `qr`, `detach` para o gateway e o caffeinate, texto de uso |
| `src/status-json.ts` | criar: monta o JSON do status a partir dos argumentos, como função pura testável mais o ponto de entrada da CLI |
| `src/qr.ts` | criar: lê a URL do stdin e imprime um SVG do QR code |
| `test/status-json.test.ts` | criar: testes do formato JSON |
| `test/qr.test.ts` | criar: o SVG é gerado e a URL não aparece em texto puro |
| `panel/tower.panel` | criar: o painel |
| `package.json` / `package-lock.json` | alterar: dependência `qrcode-generator` (MIT, sem dependências, versão 2.0.4) |
| `README.md` | alterar: seção "Pelo Cockpit" |

- **Regras afetadas:** nenhuma. Nenhuma regra `always_on` descreve o `bin/tower`.
- **ADRs afetados:** [[decisions/2026-10-22_read-only-client]] fica **confirmado**. O painel não fala com o socket do `cockpit-server` e só roda o `bin/tower`. O gateway continua sendo um cliente somente leitura.

## §4.3. Mudanças e motivo

### `bin/tower`

**`detach`: separar o processo do grupo de quem chamou.** Isso vale para o gateway e para o caffeinate. O `exec` do perl mantém o pid, então `$!`, o pid file e o `pid_is` continuam funcionando.

```bash
# New session and process group, so the process outlives whoever started tower
# (a Cockpit panel runs commands inside the app's own process group). Same pid after exec.
DETACH=(perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV or die "exec: $!\n"')
...
nohup "${DETACH[@]}" node "$MAIN" >>"$LOG" 2>&1 &        # bin/tower:94
...
"${DETACH[@]}" caffeinate -is -w "$pid" >/dev/null 2>&1 & # bin/tower:108
```

É um array, e não uma função, porque o `nohup` não consegue executar funções do bash. O `POSIX::setsid()` só falha se o processo já liderar um grupo, o que não acontece num job `&` de script não interativo. Se falhar mesmo assim, o comando segue sem se separar, como hoje.

**`status --json`.** O `cmd_status` passa a aceitar `--json`. O bash coleta os valores, e `node src/status-json.ts` monta o JSON, para não escapar strings à mão:

```bash
cmd_status() {
  [[ "${1:-}" == "--json" ]] && { status_json; return; }
  ...  # text output unchanged
}
status_json() {
  local gw="" aw="" pub=0 sock=0 url=""
  gw="$(gateway_pid)" || gw=""
  aw="$(caffeinate_pid)" || aw=""
  command -v tailscale >/dev/null 2>&1 && serve_published && pub=1
  [[ -S "$SOCKET" ]] && sock=1
  [[ "$pub" == 1 && -s "$TOKENFILE" ]] && url="$(tailnet_url "$(cat "$TOKENFILE")")"
  node "$ROOT/src/status-json.ts" "$gw" "$aw" "$pub" "$PORT" "$HTTPS_PORT" "$sock" "$SOCKET" <<<"$url"
}
```

A URL vai pelo stdin, não pelo argv: o `ps` de qualquer usuário mostra o argv, e a URL contém o token. A saída tem este formato:

```json
{"on":true,"gateway":{"running":true,"pid":123,"port":7681},"awake":{"running":true,"pid":124},
 "tailnet":{"published":true,"port":8443,"url":"https://mac.tailnet.ts.net:8443/<token>/"},
 "cockpit":{"socket":true,"path":"/Users/.../cockpit-server.sock"}}
```

`on` vale `gateway.running && tailnet.published`. A `url` só aparece quando está publicado. O `tower status` em texto não muda.

**`qr`.** Imprime o SVG do QR code da URL atual. Se o Tower estiver desligado, sai com código 1 e uma mensagem no stderr. A URL também vai pelo stdin:

```bash
cmd_qr() {
  serve_published && [[ -s "$TOKENFILE" ]] || die "not published; run 'tower on' first"
  tailnet_url "$(cat "$TOKENFILE")" | node "$ROOT/src/qr.ts"
}
```

O texto de uso passa a ser `usage: tower on|off|status [--json]|qr`.

### `src/status-json.ts`

Uma função pura, `buildStatus(args, url)`, mais o ponto de entrada da CLI, que lê o argv e o stdin, chama a função e faz `console.log(JSON.stringify(...))`. Segue o mesmo padrão de `src/serve-status.ts`, que é uma CLI testada em `test/serve-status.test.ts`.

### `src/qr.ts`

```ts
import qrcode from "qrcode-generator";
export function qrSvg(text: string): string {
  const qr = qrcode(0, "M"); qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 2, scalable: true });
}
// CLI: read URL from stdin, print SVG
```

O `createSvgTag` não coloca o texto codificado no SVG, mas o teste confere isso de qualquer forma. A biblioteca entra como dependência npm em vez de ficar copiada na pasta do painel, porque assim a versão e a licença ficam rastreadas no lockfile.

### `panel/tower.panel`

O painel fica numa pasta própria, `panel/`, fora de `web/`. O gateway só serve uma lista fixa de arquivos de `web/` (`src/server.ts:13-15`), mas manter o painel fora dessa pasta evita que ele seja exposto por engano no futuro. O frontmatter é `title: Tower` e `cwd: ..`. Ele usa `cockpit.css` e `petite-vue.js`. Conteúdo:

- **Estado:** um selo Ligado, Desligado ou Parcial (por exemplo, gateway no ar sem publicação). Cards mostram gateway, Mac acordado, tailnet e socket do Cockpit, este último com aviso quando o socket não existe.
- **Botões:** Ligar e Desligar, que rodam `exec --timeout 60 -- ./bin/tower on` e `... off`. Ficam desabilitados enquanto qualquer comando roda e mostram "Ligando…" ou "Desligando…". No fim, o painel atualiza o estado na hora.
- **URL:** um campo somente leitura, um botão Copiar (`navigator.clipboard.writeText`, com fallback de seleção do texto) e o QR code de `exec ./bin/tower qr`. O QR só é pedido quando a URL muda e é inserido como SVG. A URL não é registrada no `console`.
- **Erros:** quando `ok` é falso, aparece um bloco `.error` com o `stderr` completo, sem cortar o link de consentimento do Tailscale. Também há um aviso se `status --json` falhar ou não for JSON.
- **Atualização:** `status --json` roda a cada 5 s, sem chamadas sobrepostas e com pausa quando a aba está oculta (`document.visibilityState`). Também há um botão Atualizar.

## §4.4. Riscos e impacto

**Tier de risco: `high`.** O `REVIEW.md` classifica como sempre alto o que toca "tokens" e "exposição", e esta mudança traz uma nova saída que contém o token: a URL no JSON, no painel e no QR. Ela também mexe no ciclo de vida dos processos do `tower on`.

| Risco | Mitigação |
|---|---|
| O token aparece no argv, no log ou no console | A URL vai sempre pelo stdin, nunca pelo argv nem por `console.log`. O teste do QR confere que a URL não sai em texto puro. ⚠ unverified: se o Cockpit guarda a saída do `exec` em algum lugar. A telemetria do Cockpit só registra comandos rodados por `cockpit telemetry <cmd>`, segundo a skill `cockpit-telemetry`. |
| O `perl` com `setsid` quebra o `pid_is` | O `exec` mantém o pid, e o padrão `$MAIN` / `caffeinate -is -w` continua no comando final. A verificação abaixo confere isso. |
| O painel dispara dois `on` ao mesmo tempo | Os botões ficam desabilitados enquanto um comando roda. Um segundo `on` vindo do terminal já é idempotente: "gateway already running" (`bin/tower:87`). |
| Um painel desatualizado mostra estado errado | Ele atualiza a cada 5 s e logo depois de cada ação. |
| A dependência nova é um risco de cadeia de suprimentos | `qrcode-generator` não tem dependências, usa licença MIT e fica com a versão travada no lockfile. |

**Verificação:**

1. `npm test`: tudo passa, incluindo os testes novos.
2. Com o Tower desligado, `bin/tower status --json | node -e 'const s=JSON.parse(require("fs").readFileSync(0));if(s.on)process.exit(1)'` deve terminar com código 0.
3. `cockpit exec --timeout 60 -- ./bin/tower on`, rodado pelo `exec`, que é o mesmo caminho do painel. Depois, `ps -o pid,pgid,sess,command -p $(cat ~/.cockpit-tower/gateway.pid)` deve mostrar PGID igual ao pid, ou seja, fora do grupo 39811. O mesmo vale para o caffeinate. O `status --json` deve dar `"on":true` com a `url`, e o `bin/tower qr | head -c 5` deve imprimir `<svg`.
4. `bin/tower off` pelo terminal: o `status --json` volta para `"on":false`, e os pids somem.
5. Uso real, feito pelo humano: abrir `panel/tower.panel` no Cockpit, ligar, ler o QR com o iPhone, abrir o visualizador, fechar a aba do painel, confirmar que continua no ar e desligar pelo painel.

**Como reverter:** `git revert` dos commits da branch e `npm install` para tirar a dependência. Nenhum estado persistente muda de formato: `~/.cockpit-tower/` continua igual.

## §4.5. Passos de execução

1. Criar a branch, conforme a decisão do humano sobre a base (ver a questão em aberto abaixo).
2. Rodar `npm install qrcode-generator@2.0.4 --save-exact`.
3. Criar `src/status-json.ts` com `test/status-json.test.ts`, e depois rodar `npm test`.
4. Criar `src/qr.ts` com `test/qr.test.ts`, e depois rodar `npm test`.
5. No `bin/tower`: o array `DETACH` no gateway e no caffeinate, `status --json`, `qr` e o texto de uso.
6. Verificações 2 a 4 da §4.4.
7. Criar `panel/tower.panel` e abrir com `cockpit open panel/tower.panel` para conferir o visual (com captura de tela, se der).
8. Atualizar o `README.md` com a seção "Pelo Cockpit".
9. Fazer os commits e a revisão de agente em modo **deep**, por causa do tier high.
10. Entregar ao humano a verificação 5 e o gate do diff completo.

**Questão em aberto (base da branch):** a branch `feat/2026-10-22_read-only-viewer__tower` ainda não foi mergeada no `dev`. Há duas opções: (a) mergear e criar a branch nova a partir do `dev`, que é o recomendado; ou (b) empilhar a branch nova sobre a read-only-viewer e registrar uma divergência.

## §4.6. Escopo

Áreas: `tower-cli` (`bin/tower`, `src/status-json.ts`, `src/qr.ts`) e `panel`, uma área nova (`panel/`). O gateway (`src/server.ts`, `src/cockpit-client.ts`) e o visualizador (`web/`) não mudam. Nome da branch: `feat/2026-10-22_tower-cockpit-panel__tower`.

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/flows/tower-on-off.md`: atualizar com `status --json`, `qr`, o `detach` (por que usar setsid e o grupo de processos do Cockpit) e o painel como uma segunda forma de ligar o Tower.
- `cockpit_tower_wiki/overview.md`: acrescentar a área `panel` na tabela de áreas.
- `cockpit_tower_wiki/cross-cutting/cockpit-exec-process-group.md` (nova): a lição de que um processo iniciado por `cockpit exec`/`.panel` herda o grupo de processos do app Cockpit, com a evidência do `ps`. Ela vale para qualquer ferramenta futura disparada pelo Cockpit.
