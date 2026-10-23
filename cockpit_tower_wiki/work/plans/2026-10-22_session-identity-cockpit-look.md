---
title: 2026-10-22 — Identificar as sessões e deixar o viewer com a cara do Cockpit (parte 2 da tela do iPhone)
type: plan
work_id: 2026-10-22_session-identity-cockpit-look
scope:
  area: [gateway, viewer]
status: executed
risk: high
updated: 2026-10-22
summary: O gateway enriquece cada sessão com projeto, aba, agente e branch (lsof, ps, HEAD do git e a CLI cockpit), e o viewer ganha a navegação e o visual do Cockpit.
topic: [ui]
related:
  - work/tasks/2026-10-22_session-identity-cockpit-look
  - contracts/cockpit-protocol-v2
  - services/gateway
  - decisions/2026-10-22_read-only-client
---

# Plano — Identificar as sessões e deixar o viewer com a cara do Cockpit

> Cobre [[work/tasks/2026-10-22_session-identity-cockpit-look]]. Lido antes: [[work/executions/2026-10-22_terminal-text-cockpit-style]], [[contracts/cockpit-protocol-v2]], [[decisions/2026-10-22_read-only-client]].

## §4.0. Análises pré-plano

Duas análises em paralelo (`analyst`) mais verificações no thread principal. Modelo do plano: o mesmo do thread principal, por ser decisão de arquitetura com risco `high`.

### Pergunta 1: como ligar cada sessão do `pty.list` a uma aba e a um workspace do Cockpit?

- O `pty.list` traz `{id, pid, cmd, rows, cols, len, exit?}` e nada da aba. 📎 [`src/protocol.ts:16-23`](../../../src/protocol.ts). O `cmd` é sempre `/bin/zsh`.
- O ambiente do shell (`COCKPIT_TAB_ID`) não é legível de fora no macOS: `ps -E` e `KERN_PROCARGS2` não trazem o ambiente (verificado no thread principal).
- `cockpit list-tabs --json` traz `{id, kind, title, working, focused, workspaceId, workspacePath}` e `list-workspaces --json` traz `{id, name, path, tabs}`, sem pid nem sessão. A CLI fica em `~/.cockpit/bin/cockpit`.
- **A CLI funciona de fora de uma aba e com uma página do Tower conectada** (verificado no thread principal: gateway `--dev` com um viewer anexado à `s3`; `env -i HOME=$HOME PATH=$PATH cockpit list-tabs --json` devolveu o JSON completo). O erro "more than one Cockpit is attached" citado na ADR não apareceu para os verbos de listagem.
- Pelo `pid`: `lsof -a -d cwd -p <pids>` dá a pasta atual, e `ps` dá o terminal e o processo em primeiro plano (`claude`, `node`, `dart`).
- **Ao vivo, 15 sessões e 15 abas de terminal casaram 1:1** combinando dois sinais: a ordem numérica dos ids (sessões `sN` ordenadas casam posição a posição com as abas `tN` ordenadas) e o cwd compatível com o `workspacePath` da aba. O único caso sem cwd compatível foi a aba `__cockpit__`, com `workspacePath ""` e shell no home (relatório da análise, tabela de 15 linhas).
- **Modos de falha:** só a ordem quebra em silêncio com qualquer sessão ou aba extra, e só o cwd fica ambíguo com duas abas no mesmo workspace, depois de um `cd`, ou com workspaces aninhados (worktrees dentro de `.claude/worktrees/`). Um nome errado é pior que nenhum, então empate vira "sem aba".
- A comparação de conteúdo (`read-tab` contra a saída) foi descartada: falha na tela alternativa e em prompts iguais.
- A branch sai do `HEAD` do repositório. Ler o arquivo `.git/HEAD` direto evita rodar `git` em pastas de terceiros, onde uma configuração como `core.fsmonitor` pode executar programas.

### Pergunta 2: qual é a linguagem visual do Cockpit e o que o viewer pode reaproveitar?

Tokens tirados do print do Cockpit (tema claro), conferidos por amostragem:

| Token | Valor |
|---|---|
| fundo das laterais e barras | `#f5f5f7` |
| fundo da faixa de abas | `#f4f5f6` |
| aba ativa / terminal | `#ffffff`, sublinhado `#416ee8` de 2 px |
| linha ativa da lista | `#f0f1f3` |
| borda | `#e2e1e6` |
| texto primário / secundário / apagado | `#19191e` / `#5b5a64` / `#898a92` |
| destaque | `#416ee8` |
| chip de branch | fundo `#f7eed9`, texto `#ae7b33` |
| avatares | `#64b670`, `#8d8e95`, `#416ee8`, `#4da29f`, `#6a57c8`, `#d35353` |

- **Estrutura do Cockpit:** lista de workspaces com avatar de letra (≈36 pt, raio 8), nome, linha da branch e worktrees aninhados; faixa de abas sobre o terminal.
- **Fonte:** o CSS de painel do próprio Cockpit usa `-apple-system` e `ui-monospace`. A fonte do app (provavelmente Hanken Grotesk, ⚠ unverified) exigiria rota nova no `src/server.ts`. Decisão: fontes do sistema.
- **Ícones:** Material Symbols (Apache 2.0) exigiriam rota nova. Decisão: poucos SVGs inline (branch, menu, ponto de status).
- **Correção ao relatório:** o terminal da parte 1 usa a monoespaçada do sistema, não JetBrains Mono. 📎 [`web/style.css`](../../../web/style.css) (`.view { font-family: ui-monospace, … }`).

## §4.1. Resumo e entendimento

O humano quer achar a sessão certa no iPhone do mesmo jeito que acha no Cockpit, pelo projeto e pela aba, e quer que o viewer pareça o Cockpit.

O gateway passa a **enriquecer cada sessão** com dados lidos no Mac, sempre somente leitura:
- **Projeto:** o workspace cujo `path` é o prefixo mais longo do cwd do shell, ou a pasta do cwd se nenhum servir.
- **Aba:** título e `working`, **só quando o casamento é seguro**; senão a sessão fica sem aba.
- **Processo em primeiro plano** (ex.: `claude`) e **branch** do repositório.
- **Atividade:** bytes novos desde a última leitura.

A lista é reenviada a cada 5 s enquanto a página está aberta, para o "trabalhando" ficar vivo.

O viewer troca a barra de botões por uma navegação como a do Cockpit:
- **Barra superior compacta:** menu, avatar e nome do projeto atual, ponto de status.
- **Faixa de abas:** as sessões do projeto atual.
- **Gaveta lateral:** os workspaces com avatar, branch e worktrees aninhados, e no topo uma seção "Trabalhando agora".
- **Visual:** tudo com os tokens do Cockpit e as fontes do sistema.

**Regra central do casamento** (função pura, testada):
1. **Global:** se o número de sessões é igual ao de abas de terminal, e o cwd de cada sessão é compatível com a aba na mesma posição da ordem, todos os pares valem. Compatível quer dizer igual ao `workspacePath`, dentro dele, ou aba com `workspacePath` vazio.
2. **Senão, por sessão:** as abas candidatas são as do workspace mais específico que contém o cwd. O par vale se houver exatamente uma aba candidata e só essa sessão apontar para ela.
3. **Qualquer outro caso:** sem aba. A sessão aparece com o projeto, o processo e a pasta.

## §4.2. Arquivos afetados

- `src/session-info.ts` (CREATE) — coleta (lsof, ps, `.git/HEAD`, CLI `cockpit`), casamento puro e cache curto compartilhado entre os viewers.
- `src/server.ts` (UPDATE) — a mensagem `sessions` passa a levar `info` por sessão; reenvio a cada 5 s por viewer.
- `src/main.ts` (UPDATE) — caminho da CLI `cockpit` (padrão `~/.cockpit/bin/cockpit`, sobrescrito por `TOWER_COCKPIT_BIN`).
- `test/session-info.test.ts` (CREATE) — parsers e casamento com os 15 casos reais e os casos ambíguos.
- `test/server.test.ts` (UPDATE) — `sessions` enriquecida com um coletor falso; reenvio periódico.
- `web/index.html`, `web/style.css`, `web/app.js` (UPDATE) — barra, faixa de abas, gaveta e tokens do Cockpit.

## §4.3. Mudanças e justificativa

### `src/session-info.ts`

Os comandos rodam por `execFile` (sem shell), com argumentos fixos e timeout. Os pids vêm do Cockpit e são validados como inteiros antes de entrar nos argumentos:

```ts
const run = (file: string, args: string[]) => execFileAsync(file, args, { timeout: 2000, maxBuffer: 1 << 20 });

// One call for all sessions: `lsof -a -d cwd -Fpn -p 123,456`
async function cwdByPid(pids: number[]): Promise<Map<number, string>> { /* parse p<pid> / n<path> lines */ }
// One call: `ps -A -o pid=,ppid=,tty=,stat=,comm=` → foreground process (stat has '+') per tty of each shell.
async function foregroundByPid(pids: number[]): Promise<Map<number, string>> { /* basename of comm */ }
// No subprocess: read <dir>/.git/HEAD, following a `gitdir:` file for worktrees, walking up to the repo root.
async function branchOf(cwd: string): Promise<string | null> { /* 'ref: refs/heads/x' → 'x'; detached → short sha */ }
// Read-only listing verbs only, fixed argv.
async function cockpitList(bin: string): Promise<{ tabs: Tab[]; workspaces: Workspace[] } | null> {
  /* run(bin, ['list-tabs', '--json']), run(bin, ['list-workspaces', '--json']); any failure → null */
}

export function matchTabs(sessions: { id: string; cwd: string | null }[], tabs: Tab[]): Map<string, Tab> { /* §4.1 rule */ }
```

`collect(sessions)` junta tudo num objeto por sessão:

```ts
interface SessionInfo {
  workspace: { name: string; path: string; parent?: string } | null; // parent = main repo workspace for a worktree
  tab: { title: string; working: boolean; focused: boolean } | null;  // null when the match is not certain
  cwd: string | null;        // home replaced by '~'
  process: string | null;    // e.g. 'claude', 'node', 'zsh'
  branch: string | null;
  active: boolean;           // len grew since the previous collect
}
```

- **Cache:** o resultado vale ~3 s e é compartilhado entre os viewers, para que vários iPhones abertos não multipliquem os `lsof`.
- **Falhas:** se a CLI `cockpit` falhar, as abas ficam `null` e o resto continua. Um erro de coleta nunca derruba a lista de sessões.

### `src/server.ts`

```ts
const sendSessions = async () => {
  try {
    const sessions = await client.list();
    post({ type: 'sessions', sessions: await withInfo(sessions) }); // withInfo never throws; info may be partial
  } catch { /* unchanged */ }
};
const refreshTimer = setInterval(() => void sendSessions(), opts.sessionsRefreshMs ?? 5000); // cleared on close
```

Nada muda no que é enviado ao Cockpit (`hello`, `pty.list`, `pty.attach`, `pty.detach`) nem no que é aceito do navegador (`list`, `select`, `ping`).

### `web/` — navegação e visual do Cockpit

- **Barra superior (≈44 pt, `#f5f5f7`):** botão de menu, avatar e nome do projeto atual, título da aba atual, e o ponto de status (verde/âmbar/vermelho) no lugar do texto longo.
- **Faixa de abas:** as sessões do projeto atual, cada uma com o título da aba ou o processo e um indicador quando está trabalhando. A ativa fica branca com sublinhado azul.
- **Gaveta:**
  - "Trabalhando agora" no topo.
  - Depois os workspaces na ordem do Cockpit, com avatar de letra (cor escolhida por hash do nome entre as 6 do Cockpit), chip da branch e worktrees aninhados.
  - Por fim, "Outros terminais" para as sessões sem projeto.
  - A−/A+ e o selo "read-only" passam para o rodapé da gaveta, liberando altura para o texto.
- **Seleção inicial:** a sessão da aba em foco no Cockpit; senão a primeira trabalhando; senão a primeira.
- **Visual:** tokens do §4.0 em variáveis CSS, fontes do sistema, SVGs inline e tema claro fixo.

## §4.4. Riscos e impacto

1. **Nome de aba errado na tela.** Mitigação: a regra do §4.1 só aceita pares únicos ou confirmados pela ordem e pelo cwd juntos; empate vira "sem aba". Testes com os casos ambíguos (duas abas no mesmo workspace, `cd`, worktree aninhado, sessão extra).
2. **O gateway passa a rodar subprocessos.** Mitigação: `execFile` sem shell, binários e argumentos fixos, pids validados como inteiros, timeout de 2 s, `maxBuffer`, e só os verbos de listagem da CLI `cockpit`. Nenhum dado do navegador entra em argumentos.
3. **Rodar `git` em pastas de terceiros executa configurações.** Mitigação: a branch vem da leitura do `.git/HEAD`, sem `git`.
4. **Mais dados expostos ao iPhone:** pastas (com `~`) e títulos das abas. Mitigação: o canal é o mesmo do conteúdo dos terminais, que já é exposto (token + tailnet). Nada novo sai da tailnet.
5. **Custo de CPU** com `lsof`/`ps` a cada 5 s. Mitigação: uma chamada de cada por ciclo, cache de 3 s compartilhado, e só enquanto houver página aberta.
6. **A CLI `cockpit` pode mudar** de formato ou de caminho. Mitigação: parse defensivo; falha vira "sem aba"; o caminho é configurável.

**Risk tier:** `high` — o gateway, que é a parte exposta na rede, passa a executar subprocessos e a chamar a CLI do Cockpit. Essa CLI também tem verbos de escrita (`send`, `send-key`), embora o código use só a listagem. Pede revisão em modo profundo.

**Verification:**
- `npm test`, com os testes novos de parser e de casamento (os 15 casos reais e os ambíguos) e o teste do servidor com coletor falso.
- `grep -n "execFile\|spawn" src/` mostrando só `lsof`, `ps` e o binário `cockpit` com `list-tabs`/`list-workspaces`.
- Smoke local: gateway `--dev` e Chrome headless com tamanho de iPhone. A tabela de casamento impressa pelo gateway em `--dev` deve bater com a tabela do §4.0.
- Smoke no iPhone pelo humano.

**Revert:** `git revert` dos commits. Nada persiste fora do processo, só a chave da fonte no `localStorage`, que já existia.

## §4.5. Passos de execução

- [x] (1) Criar a branch `feat/2026-10-22_session-identity-cockpit-look__tower` a partir de `dev`.
- [x] (2) `src/session-info.ts`: parsers de `lsof`/`ps`, leitura do `.git/HEAD`, chamada da CLI e `matchTabs`, com `test/session-info.test.ts`.
- [x] (3) `src/server.ts` e `src/main.ts`: `sessions` com `info`, reenvio a cada 5 s, caminho da CLI; ajustar `test/server.test.ts`.
- [x] (4) `web/`: tokens do Cockpit, barra superior, faixa de abas e gaveta.
- [x] (5) Verificação: `npm test`, `grep`, smoke headless com a tabela de casamento ao vivo.
- [x] (6) Revisão pelo agente (`reviewer`, modo profundo).
- [x] (7) Smoke no iPhone pelo humano.

## §4.6. Escopo

**Área(s) afetada(s):** `[gateway, viewer]`. O nome da branch usa o escopo `tower`, como na parte do painel, porque a mudança cruza gateway e viewer.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — enriquecimento das sessões (coleta, casamento, cache, reenvio a cada 5 s).
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — lacuna do id da aba: o contorno pela CLI `cockpit` e pelo cwd, e o teste com uma página conectada.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — consequência: o gateway roda `lsof`/`ps` e os verbos de listagem da CLI, ainda sem escrever em nada.
- `cockpit_tower_wiki/overview.md` (UPDATE) — linha do viewer: navegação do Cockpit.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada desta execução.
