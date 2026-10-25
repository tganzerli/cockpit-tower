---
title: 2026-10-25 — Títulos das abas depois de um reinício do Cockpit
type: plan
work_id: 2026-10-25_restart-tab-titles
scope:
  area: [gateway]
status: executed
risk: medium
updated: 2026-10-25
summary: O collect soma à ordem de criação o terminal único e o par do nascimento (uma sessão e uma aba novas na mesma olhada, confirmado na seguinte), e só mostra o título quando as fontes concordam e a aba não vai para duas sessões.
topic: [bugfix, service]
related:
  - work/tasks/2026-10-25_restart-tab-titles
  - services/gateway
  - decisions/2026-10-24_phone-close-tab
---

# Plano — Títulos das abas depois de um reinício do Cockpit

> Modelo do plano: escrito no fio principal (tier de raciocínio alto), com as duas análises no contexto. As linhas do tower são de `origin/dev` `071da1e`. As do `remote_pi` vêm do working tree em `feat/cockpit-editor-soft-wrap`, lido pelo analista, e podem ter deslocado em relação à `main`.

## §4.0. Análises pré-plano

Triagem: **análises necessárias.** O comportamento do Cockpit no reinício decide a forma do plano, e havia mais de um sinal possível. Foram duas perguntas independentes, em paralelo, e uma medição no Mac.

**A. Sinais do lado do Cockpit** (analista no `remote_pi`, só leitura)
- O `title` de uma aba de terminal vem só do OSC 0/2 da PTY (`terminal.onTitleChanged`) 📎 `cockpit/lib/app/cockpit/ui/session/terminal_session.dart:157-158`. Ele é **salvo e restaurado** 📎 `cockpit_viewmodel.dart:~6742`, `:6425-6428`. Uma aba restaurada mostra, portanto, o título antigo, que a PTY nova nunca emitiu.
- A restauração é preguiçosa, por workspace, quando ele é ativado 📎 `cockpit_viewmodel.dart:6180-6226`. Dentro de um workspace, as sessões são abertas uma a uma, na ordem salva 📎 `:6290-6303`. A ordem entre workspaces depende de quando cada um é ativado, então não dá para reconstruí-la.
- O elo aba → sessão não é exposto:
  - `pty.sessions` traz `{id, pid, cmd, rows, cols, len, exit?}` 📎 `packages/cockpit_server/lib/src/remote_server.dart:606-618`;
  - o `COCKPIT_TAB_ID` do `pty.open` fica num conjunto privado do servidor 📎 `remote_server.dart:365,586-587`;
  - o `list-tabs` não traz pid nem sessão 📎 `cockpit_cli_handler.dart:183-207`.
- Cada sessão tem replay de 4 MiB 📎 `packages/cockpit_engine/lib/src/pty/scrollback_buffer.dart:12`. O conteúdo antigo da aba é restaurado só no cliente 📎 `cockpit_viewmodel.dart:6420`.

**B. O que o gateway vê** (analista no tower)
- O gateway só se liga (`attach`) à sessão que um espectador assiste 📎 `src/server.ts:593-597`, uma conexão por espectador. Um rastreador de OSC pediria um espectador fixo em todas as sessões, com replay de 4 MiB em cada religação. A ADR da rolagem já recusou um segundo parser de terminal no gateway 📎 `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md:68`. Somado ao título restaurado antigo (A), **o caminho do OSC fica descartado.**
- `collect` calcula `stable` e chama `matchTabs` 📎 `src/session-info.ts:325-328`. A aba vira `info.tab` 📎 `:339`. O `soleTab` é puro e não depende de ordem 📎 `:235-254`, e hoje só o (x) o usa 📎 `src/close-tab.ts:47`.

**C. Medição no Mac** (2026-10-25, `scratchpad/k27-probe.ts`, só leitura: `pty.list`, `lsof`, `list-tabs`)
- O ambiente dos shells não é legível pelo `ps -E`, nem o do próprio shell desta sessão.
- O layout real tem 7 sessões e 7 abas de terminal:
  - `matchTabs`, mesmo com `stable = true`: **nenhum par**;
  - `soleTab`: **4 de 7** (`s1→t133`, `s4→t38`, `s8→t16`, `s25→t167`);
  - as 3 do `tcc` (`s2`, `s31`, `s32` × `t75`, `t177`, `t178`) ficam sem aba.
- `s31` e `s32` nasceram depois do reinício. Se o tower estivesse ligado, o par do nascimento as cobriria.

**Abordagem escolhida pelo dono (2026-10-25):** terminal único mais par do nascimento. As alternativas "só terminal único" e "esperar o k5" foram oferecidas e recusadas.

## §4.1. Resumo e entendimento

O título da aba some depois de um reinício do Cockpit, porque o único elo usado, a ordem de criação, quebra. O objetivo é voltar a mostrar o título **quando houver prova**, sem nunca trocar o título de uma sessão pelo de outra aba. A correção definitiva continua sendo o k5.

Duas provas novas entram no `collect`, ao lado da ordem:
1. **Terminal único** (`soleTab`, a mesma regra do (x)): o shell é o único na pasta mais específica, essa pasta tem um único terminal, e todas as pastas têm o mesmo número de shells e abas.
2. **Nascimento:** entre duas olhadas próximas (≤ 15 s), surgiram exatamente uma sessão nova e uma aba de terminal local nova, e a pasta mais específica do shell é a da aba. O candidato só vira par na olhada seguinte, se nenhuma outra sessão nova tiver aparecido na mesma pasta. Isso cobre a sessão que nasceu antes da aba dela, como a de uma tarefa sem aba. O par vale enquanto a sessão tiver o mesmo pid e a aba continuar um terminal local na mesma pasta.

**Regra de combinação:** a sessão só ganha a aba quando todas as fontes que respondem concordam. Uma aba que acabe atribuída a duas sessões não vai para nenhuma. O (x) não muda.

## §4.2. Arquivos afetados

- `src/session-info.ts` — `folderOf` extraído do `soleTab`; novos `birthPair` e `agreeTabs`; estado do nascimento e combinação no `collect`.
- `test/session-info.test.ts` — testes novos e dois ajustes de expectativa (ver §4.3).
- `REVIEW.md` — linha "Título da aba" em "What failure looks like here".
- `cockpit_tower_wiki/board.kanban` — andamento do k27 (já em *Em curso*).

🔒 **Regras afetadas:** nenhuma. Nenhuma regra `always_on` descreve o casamento aba ↔ sessão.

🔒 **ADRs afetadas:**
- [[decisions/2026-10-24_phone-close-tab]]: **confirmada.** O `soleTab` passa a servir também à exibição, mas o (x) continua com o par do (+) e o `soleTab`. O par do nascimento **não** entra no fechamento.
- [[decisions/2026-10-23_phone-fullscreen-scroll]]: **confirmada.** Nenhum parser do fluxo de saída no gateway.
- Nenhuma outra governa a exibição do título.

## §4.3. Mudanças e justificativa

### `src/session-info.ts`

**`folderOf`** — sai de dentro do `soleTab` (`:238-239`) para ser usado também pelo nascimento. O `soleTab` não muda de comportamento.

```ts
/** The most specific of `folders` holding `cwd`; undefined when cwd is unknown or outside them all. */
const folderOf = (cwd: string | null, folders: string[]) =>
  cwd === null ? undefined : folders.filter((f) => within(cwd, f)).sort((a, b) => b.length - a.length)[0];
```

**`birthPair`** (puro, exportado para teste): o candidato de uma olhada.

```ts
/**
 * A tab and a session born together (k27): since the previous look, exactly one session and exactly one local
 * terminal tab appeared, and the shell sits in that tab's folder (the most specific one). Null otherwise.
 */
export function birthPair(
  before: { sessions: Set<string>; tabs: Set<string> },
  sessions: { id: string; pid: number; cwd: string | null }[],
  tabs: Tab[],
): { session: string; pid: number; tabId: string; folder: string } | null {
  const local = tabs.filter((t) => !t.workspaceId.startsWith(REMOTE_PREFIX));
  const newSessions = sessions.filter((s) => !before.sessions.has(s.id));
  const newTabs = local.filter((t) => !before.tabs.has(t.id));
  if (newSessions.length !== 1 || newTabs.length !== 1) return null;
  const [s, t] = [newSessions[0]!, newTabs[0]!];
  const folders = [...new Set(local.map((x) => x.workspacePath).filter((p) => p !== ''))];
  if (!isPid(s.pid) || t.workspacePath === '' || folderOf(s.cwd, folders) !== t.workspacePath) return null;
  return { session: s.id, pid: s.pid, tabId: t.id, folder: t.workspacePath };
}
```

**`agreeTabs`** (puro, exportado): combina as fontes.

```ts
/** A session keeps a tab only when every source that names one names the same, and no other session got it. */
export function agreeTabs(ids: string[], sources: Map<string, Tab>[]): Map<string, Tab> {
  const out = new Map<string, Tab>();
  for (const id of ids) {
    const found = sources.map((m) => m.get(id)).filter((t): t is Tab => t !== undefined);
    if (found.length > 0 && found.every((t) => t.id === found[0]!.id)) out.set(id, found[0]!);
  }
  const owners = new Map<string, number>();
  for (const t of out.values()) owners.set(t.id, (owners.get(t.id) ?? 0) + 1);
  for (const [id, t] of out) if (owners.get(t.id)! > 1) out.delete(id);
  return out;
}
```

**`createSessionInfo` / `collect`** — estado novo no fechamento da função, ao lado de `lastIds` (`:310`):

```ts
let seen: { sessions: Set<string>; tabs: Set<string>; at: number } | null = null; // previous look, for births
let candidate: (ReturnType<typeof birthPair> & {}) | null = null; // waits one look before it is trusted
const born = new Map<string, { pid: number; tabId: string; folder: string }>();
```

No `collect`, com a CLI respondendo:
1. `live` = sessões sem `exit`, com a pasta de cada uma.
2. **Confirmação do candidato da olhada anterior:** ele vira par em `born` se a sessão ainda existe com o mesmo pid, a aba ainda existe na mesma pasta e nenhuma outra sessão nova desta olhada caiu na mesma pasta.
3. **Novo candidato:** `birthPair(seen, live, tabs)`, só se `seen` existir e `now() - seen.at <= birthWindowMs` (opção, padrão 15 000 ms).
4. **Poda de `born`:** sai o par cuja sessão sumiu, mudou de pid ou cuja aba sumiu ou mudou de pasta.
5. `seen` = ids desta olhada (sessões vivas e todas as abas de terminal), com `at = now()`.
6. Fontes:
   - `order` = `matchTabs(...)` (como hoje);
   - `births` = `born` resolvido para `Tab`;
   - `sole` = `soleTab(cwdsVivas, tabs, id)` para cada sessão viva.
7. `tabs = agreeTabs(sessions.map((s) => s.id), [order, births, sole])`.

Sem a CLI, nada disso roda e `seen` não muda (como hoje, sem aba).

**Por que a confirmação numa olhada a mais.** Se uma sessão sem aba (ex.: uma tarefa) e uma aba nova aparecem juntas, e a sessão da aba só chega na olhada seguinte, a sessão da aba cai na mesma pasta e derruba o candidato. O custo é o título aparecer uma olhada depois (~5 s), o mesmo atraso que o `matchTabs` já tem.

**Por que a janela de 15 s.** O `collect` só roda com espectador conectado, a cada ~5 s (`src/server.ts:378`). Depois de um tempo sem ninguém, a diferença entre olhadas acumula nascimentos que não foram vistos juntos. Fora da janela, não há candidato.

### `test/session-info.test.ts`

Testes novos, cada guarda com o ramo que recusa:
- `birthPair`:
  - uma sessão e uma aba novas na pasta → par;
  - duas sessões novas, ou duas abas novas → nada;
  - aba remota, aba sem pasta, pid inválido, ou shell fora da pasta → nada;
  - shell numa sub-pasta que é outro workspace aninhado → nada (pasta mais específica).
- `agreeTabs`:
  - fontes que concordam → a aba;
  - fontes que discordam → nada;
  - a mesma aba para duas sessões → nenhuma das duas.
- `collect`:
  - layout `RESTARTED` (ou equivalente com o `fakeMac`): títulos já na primeira olhada pelo terminal único;
  - nascimento num workspace com dois terminais: o título aparece na olhada seguinte à do nascimento, não antes;
  - candidato derrubado quando outra sessão nova cai na mesma pasta na olhada seguinte;
  - nada fora da janela (`now` avançado além de 15 s);
  - par desfeito quando o pid muda, a aba some ou muda de pasta.

Ajustes de expectativa (a mudança de comportamento é a correção, não um efeito colateral):
- `:205` — "tabs wait for a second look": no `fakeMac`, cada pasta tem um terminal e um shell, então o terminal único já responde na primeira olhada. A asserção passa a esperar a aba. Para preservar o caso "a ordem espera a segunda olhada", o `fakeMac` ganha uma opção de layout em que só a ordem responde.
- `:297-306` — "a fresh look leaves the viewers' stable history alone": passa a usar esse mesmo layout em que só a ordem responde, para continuar provando que o `freshTabs` não mexe no `lastIds`.

### `REVIEW.md`

Linha nova em "What failure looks like here":

| Área / paths | A falha se parece com | Como verificar |
|---|---|---|
| Título da aba (`src/session-info.ts` `collect`, `birthPair`, `agreeTabs`) | **Título de outra aba** — fonte aceita sem as outras concordarem; aba dada a duas sessões; par do nascimento com mais de uma sessão ou aba nova, sem a pasta mais específica, sem a olhada de confirmação, fora da janela, ou que sobrevive a outro pid ou à aba em outra pasta; par do nascimento usado no (x) | Seguir `collect` até `agreeTabs`; para cada recusa de `birthPair` e da confirmação, achar o teste que falha se ela virar no-op |

## §4.4. Riscos e impacto

🔒 **Tier: `medium`.** A mudança só afeta o que é exibido. Não há escrita nova no socket nem na CLI, e o (x) não muda. Não entra em "Always high risk" do `REVIEW.md`.

**Riscos:**
- **Título trocado por ciclo de pastas.** Dois shells, cada um único no seu workspace, trocam de pasta entre si. O terminal único vê o equilíbrio e troca os títulos. É o limite já aceito no (x) 📎 `src/session-info.ts:232-233`. Na exibição, o efeito é um rótulo errado até alguém sair da pasta, sem nenhuma ação. Foi aceito pelo dono na escolha da abordagem.
- **Nascimento enganado.** Uma sessão sem aba e uma aba nova aparecem na mesma olhada, a sessão da aba só chega depois de duas olhadas e cai noutra pasta. É um caso estreito. A confirmação e a pasta mais específica fecham os casos comuns.
- **Custo:** nenhum comando novo. Só conjuntos em memória do tamanho das listas.
- **Comportamento visível:** os títulos passam a aparecer já na primeira olhada onde o terminal único responde, em vez de ~5 s depois. É uma melhora.

**Verificação:**
- `npm test` → `# fail 0`.
- `node scratchpad/k27-probe.ts <worktree>`, estendido para chamar `createSessionInfo` duas vezes sobre o layout real. Esperado: `t133`, `t38`, `t16` e `t167` com título; as três do `tcc` sem título.
- **Nascimento ao vivo (com o dono):** o probe em laço a cada 3 s. O dono abre um terminal num workspace que já tem outro terminal. Esperado: o título da aba nova aparece na olhada seguinte, e as outras abas do workspace continuam sem título.
- Antes do PR: `python3 scripts/ci/check_commit_trailers.py origin/dev` e `python3 .claude/skills/wiki-lint/lint.py --root .` (o CI está desligado até 2026-11-01).

**Como reverter:** `git revert` do commit de `src/`/`test/` (e do `REVIEW.md`). O `collect` volta a usar só o `matchTabs`. Não há estado persistido.

## §4.5. Passos de execução

1. Branch `fix/2026-10-25_restart-tab-titles__gateway` a partir de `origin/dev`, no worktree (`git checkout -b ... `), e execução `executions/2026-10-25_restart-tab-titles.md` aberta. Cartão k27 atualizado.
2. `folderOf` extraído; `npm test` verde, sem mudança de comportamento.
3. `birthPair` e `agreeTabs` com os testes puros.
4. Estado do nascimento e combinação no `collect`, com os testes do `collect` e os dois ajustes.
5. Linha do `REVIEW.md`.
6. Verificação: `npm test`, probe no layout real e nascimento ao vivo com o dono. Cartão atualizado.
7. Commits e revisão do agente (uma rodada, mais as correções, até o limite de três).
8. Gate humano: log mais achados. Cartão atualizado.
9. `/wiki-sync`, com o cartão em *Done* e `[x]`, e PRs para o dono abrir.

## §4.6. Escopo

Área: `gateway` (`src/session-info.ts`). O viewer não muda.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/services/gateway.md` (UPDATE):
  - "Contexto das sessões": as três fontes, a regra de concordância e o par do nascimento;
  - "Limitações conhecidas": o que continua sem título (vários terminais restaurados no mesmo workspace, tower desligado no nascimento) e o ciclo de pastas.
- `cockpit_tower_wiki/decisions/2026-10-24_phone-close-tab.md` (UPDATE, nota curta): o `soleTab` também serve à exibição; o par do nascimento não entra no (x).
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE, se a "Lacuna" citar o efeito do reinício): o título restaurado é o salvo, não o emitido pela PTY nova.
- `cockpit_tower_wiki/board.kanban` (UPDATE): k27 para *Done*.
