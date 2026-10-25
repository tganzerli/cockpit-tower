---
title: 2026-10-25 — O matchTabs conta as abas remotas
type: plan
work_id: 2026-10-25_matchtabs-remote-tabs
scope:
  area: [gateway]
status: approved
risk: medium
updated: 2026-10-25
summary: O matchTabs passa a usar só as abas de terminal locais (localTabs), nas contagens, na ordem e nas pastas da aba sem pasta, com um teste da aba remota mais a sessão sem aba.
topic: [bugfix, service]
related:
  - work/tasks/2026-10-25_matchtabs-remote-tabs
  - services/gateway
---

# Plano — O `matchTabs` conta as abas remotas

> Cobre [[work/tasks/2026-10-25_matchtabs-remote-tabs]]. Linhas de `origin/dev` `44eeed1`. Plano escrito no fio principal: mudança pequena e já entendida.

## §4.0. Análises pré-plano

analyses: not needed — mudança de uma função pura, com o filtro já pronto (`localTabs`) e o defeito reproduzido.

**Reprodução** (2026-10-25, `scratchpad/k28-probe.ts`, código de `origin/dev`): abas `t1` remota (`/srv`), `t2` local (`/a`), `t3` local (`/b`); sessões `s1` (`/a`, o shell da `t2`), `s2` (`/a`, uma tarefa sem aba), `s3` (`/b`). Com `stable = true`, `matchTabs` devolve `{ s2: 't2', s3: 't3' }`: a `t1` remota absorve o único par discordante (`s1`), e a tarefa `s2` fica com a aba do `s1`.

No `pairTabs`, as outras fontes não seguram esse erro: o `soleTab` recusa a pasta `/a` (dois shells, uma aba) e não há nascimento, então a ordem responde sozinha e o `agreeTabs` aceita 📎 `src/session-info.ts:387-396`, `:300-304`.

Fatos do código:
- `matchTabs` compara `sessions.length` com `tabs.length` e ordena todas as abas recebidas 📎 `src/session-info.ts:182-186`. As pastas da regra da aba sem pasta também vêm de todas 📎 `:187-189`.
- O único chamador passa todas as abas de terminal (`all`) 📎 `src/session-info.ts:387`.
- `localTabs` já tira as abas remotas e devolve as pastas distintas das locais 📎 `src/session-info.ts:226-232`; `soleTab` 📎 `:247` e `birthPair` 📎 `:277` já o usam.
- Os testes de `pairTabs` usam duas abas remotas (`REMOTE`) para manter as contagens diferentes e calar a ordem 📎 `test/session-info.test.ts:431-432`. Com a correção, essas abas deixam de contar, e a ordem passaria a responder nesses testes.

## §4.1. Resumo e entendimento

Uma aba de workspace remoto não tem PTY local, então nunca tem sessão no `pty.list`. Contá-la no casamento por ordem é contar uma aba que não pode ter par. Quando outra sessão também não tem aba (uma tarefa), as contagens se igualam por acaso. A aba remota vira o único par discordante permitido e os pares seguintes deslizam uma posição, dando a uma sessão o título de outra aba.

A correção faz o `matchTabs` trabalhar só com as abas locais, como já fazem o `soleTab` e o nascimento. Com isso, aba remota mais tarefa deixa as contagens diferentes, e a ordem não responde.

## §4.2. Arquivos afetados

- `src/session-info.ts` (UPDATE) — `matchTabs` filtra pelas abas locais; `localTabs` e `REMOTE_PREFIX` sobem para antes do `matchTabs`; o comentário do `matchTabs` cita a exclusão.
- `test/session-info.test.ts` (UPDATE) — teste novo da aba remota mais a sessão sem aba; o fixture `REMOTE` dos testes de `pairTabs` vira duas abas locais sem pasta e sem shell, que mantêm as contagens diferentes.

- **Regras afetadas:** nenhuma regra descreve o `matchTabs`. A linha "Título da aba" do `REVIEW.md` (`REVIEW.md:26`) continua valendo como está.
- **ADRs afetadas:** nenhuma. A `decisions/2026-10-24_phone-close-tab` proíbe a ordem de criação no (x), e o (x) não usa o `matchTabs`; fica confirmada.

## §4.3. Mudanças e justificativa

### `src/session-info.ts`

Mover `REMOTE_PREFIX` e `localTabs` (hoje em `:226-232`) para logo antes do comentário do `matchTabs`, sem mudar o corpo. `REMOTE_PREFIX` continua exportado (`src/close-tab.ts:5` o importa). No `matchTabs`, trocar `tabs` pelas abas locais e as pastas pelas de `localTabs`:

```ts
export function matchTabs(sessions: { id: string; cwd: string | null }[], tabs: Tab[], stable: boolean): Map<string, Tab> {
  const out = new Map<string, Tab>();
  const { local, folders } = localTabs(tabs);
  if (!stable || sessions.length === 0 || sessions.length !== local.length) return out;
  if (![...sessions, ...local].every((x) => NUMERIC_ID.test(x.id))) return out;
  const s = [...sessions].sort((a, b) => idNumber(a.id) - idNumber(b.id));
  const t = [...local].sort((a, b) => idNumber(a.id) - idNumber(b.id));
  const fits = (cwd: string | null, tab: Tab) =>
    cwd !== null && (tab.workspacePath === '' ? !folders.some((f) => within(cwd, f)) : within(cwd, tab.workspacePath));
  // ... resto igual
}
```

As pastas de `localTabs` são distintas, e as atuais têm repetição; para `folders.some(...)` dá no mesmo. Tirar as pastas remotas também é certo: o caminho de uma aba remota é do outro host, e um shell local num caminho igual não está "dentro" dela.

No comentário do `matchTabs`, um item a mais: "remote tabs (`__remote__` workspaces) have no local PTY and are left out, so they never even the counts (k28)".

### `test/session-info.test.ts`

Teste novo, perto dos outros do `matchTabs`, com o layout da reprodução:

```ts
test('remote tabs never even the counts, so a tabless session never takes another session’s tab', () => {
  // s1 is t2's shell, s2 a task with no tab, s3 is t3's shell; t1 is an SSH tab with no local PTY.
  const tabs = [tab('t1', '/srv/app', { workspaceId: '__remote__pin' }), tab('t2', '/a'), tab('t3', '/b')];
  const sessions = [{ id: 's1', cwd: '/a' }, { id: 's2', cwd: '/a' }, { id: 's3', cwd: '/b' }];
  assert.deepEqual(pairs(matchTabs(sessions, tabs, true)), {});
  // Without the task, the local tabs still pair one to one around the remote one.
  assert.deepEqual(pairs(matchTabs([sessions[0]!, sessions[2]!], tabs, true)), { s1: 't2', s3: 't3' });
});
```

No fixture `REMOTE` (`test/session-info.test.ts:431-432`): trocar as duas abas remotas por duas abas locais sem pasta (`tab('t1', '')`, `tab('t3', '')`), que nenhum shell do teste ocupa. Elas mantêm as contagens diferentes, e o `soleTab` e o `birthPair` não as veem (pasta vazia não entra nas pastas de `localTabs`, e elas existem desde a primeira olhada). Renomear para `IDLE` e ajustar o comentário. Os casos remotos de `soleTab` e `birthPair` (`:343-346`, `:385`) ficam como estão.

## §4.4. Riscos e impacto

1. **A ordem passa a responder onde hoje não responde.** Num layout com abas remotas e sem tarefa, as contagens locais agora batem e a ordem pode parear. É o comportamento certo, com as mesmas guardas (ids numéricos, `stable`, no máximo um par discordante), e o `agreeTabs` ainda exige concordância das outras fontes. Mitigação: o teste novo cobre os dois lados (com e sem a tarefa).
2. **Testes do `pairTabs` mudam de fixture.** Se a troca do `REMOTE` mudar o que eles provam, uma regressão do nascimento passaria. Mitigação: repetir a mutação de guardas do k27 nesses testes (`confirmation`, `window`, `prune` viradas no-op devem falhar).
3. **Nada muda no (x).** `close-tab.ts` não chama o `matchTabs` (`src/close-tab.ts:47`).

**Risk tier:** `medium` — mudança comum de produto no casamento do título (linha "Título da aba" do `REVIEW.md:26`); não toca entrada, resize nem fechamento, nada de "Always high risk".

**Verificação:**
- `npm test` → `# fail 0`.
- O teste novo falha no código de hoje (rodar antes de mudar o `src/`) e passa depois.
- `node scratchpad/k28-probe.ts` → `{}`.
- Mutação: com o filtro de `localTabs` desfeito no `matchTabs`, o teste novo falha; com `confirmation`, `window` e `prune` viradas no-op, os testes de `pairTabs` falham.

**Revert:** `git revert` do commit da correção; sem estado, sem migração.

## §4.5. Passos da execução

- [ ] (1) Após a aprovação, criar o branch `fix/2026-10-25_matchtabs-remote-tabs__gateway` no worktree, a partir de `origin/dev`.
- [ ] (2) Escrever o teste novo e ver ele falhar no código atual.
- [ ] (3) Corrigir o `matchTabs` e mover `REMOTE_PREFIX`/`localTabs`.
- [ ] (4) Trocar o fixture `REMOTE` por `IDLE` nos testes de `pairTabs`.
- [ ] (5) `npm test`, probe e mutações; registrar com saída.
- [ ] (6) Commit; revisão do `reviewer` (contexto limpo); tratar achados.
- [ ] (7) Trailers, wiki-lint e `npm test` à mão (CI fora do ar); portão humano.

## §4.6. Escopo

**Área afetada:** `[gateway]` (`src/session-info.ts`).

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — "Casamento aba ↔ sessão", item 1: a ordem de criação conta só as abas locais; atualizar as linhas citadas de `src/session-info.ts` que mudarem.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada do wiki-sync.
