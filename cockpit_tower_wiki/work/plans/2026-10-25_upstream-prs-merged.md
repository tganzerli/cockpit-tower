---
title: "2026-10-25 — PRs #263 e #264 mergeados no remote_pi"
type: plan
work_id: 2026-10-25_upstream-prs-merged
scope:
  area: [wiki]
status: executed
risk: low
updated: 2026-10-25
summary: "Marca os PRs #263 e #264 como mergeados na página de contribuições upstream, na página do CodeEditor, nos dois trios de 2026-10-23 e no quadro, e passa o k11 do mantenedor para o dono."
topic: [wiki, knowledge]
related:
  - work/tasks/2026-10-25_upstream-prs-merged
  - cross-cutting/upstream-contributions
  - sources/external/2026-10-23_cockpit-code-editor
---

# Plano — PRs #263 e #264 mergeados no remote_pi

> Cobre [[work/tasks/2026-10-25_upstream-prs-merged]]. Linhas de `origin/dev` `c9e0824`.

## §4.0. Análises pré-plano

Triagem: **sem análises**. Os fatos vêm do `gh` (na tarefa) e as menções foram achadas com um `grep` por `#26[1-4]`, "esperando" e "PR aberto" em `cockpit_tower_wiki/`. Menções fora desta lista são histórico datado (atividade "PR aberto" de 2026-10-24, plano do `wiki-stale-pages`) e ficam como estão (`_meta/conventions.md:59`).

## §4.1. Resumo e entendimento

O mantenedor mergeou os dois PRs em 2026-10-25. Onde o texto descreve o estado atual ("PR aberto", "esperando o merge"), ele passa a dizer mergeado, com data e commit. Onde é histórico, ganha uma nota datada no fim e não é reescrito. O k11 dependia de uma resposta que não veio: o #264 entrou sem comentário. Por isso o próximo passo agora é do dono (mandar o PR do k11 sem convite ou largar).

## §4.2. Arquivos afetados

Na execução: o trio, os dois trios de 2026-10-23 e o quadro. As duas páginas de conhecimento mudam no `/wiki-sync` (§4.7).

- `work/tasks/2026-10-23_cockpit-editor-soft-wrap.md` e `…_cockpit-macos-icon-shape.md` (UPDATE): uma seção "Desfecho" no fim.
- `work/executions/2026-10-23_cockpit-editor-soft-wrap.md` (UPDATE): entrada de atividade `2026-10-25 — PR mergeado` depois da linha 372 e `summary`.
- `work/executions/2026-10-23_cockpit-macos-icon-shape.md` (UPDATE): entrada de atividade antes de `## Commits` (linha 65) e `summary`.
- `work/_index.md` (REGEN): pelo `work-index`, por causa dos `summary`.
- `board.kanban` (UPDATE): k0 (linha 24), k10 (linha 140), k20 (linha 155), k11 (linha 109 e etiqueta), cartão k30 em Done, contador → k31.

**Regras afetadas:** nenhuma. **ADRs afetadas:** nenhuma.

## §4.3. Mudanças e justificativa

### Trios de 2026-10-23

Seção nova no fim de cada tarefa (os critérios antigos ficam como estão):

```markdown
## Desfecho

2026-10-25: PR #264 mergeado por `jacobaraujo7` (merge `8138e03`, ponta `177aea97`); a issue #261 fechou junto.
```

(Ícone: "PR #263 mergeado por `jacobaraujo7` (merge `6321d5d`); a issue #262 fechou junto.")

Entrada de atividade em cada execução, com o mesmo texto e a fonte `gh pr view … -R jacobaraujo7/remote_pi`. No soft wrap ela também diz que a oferta do k11 ficou sem resposta.

`summary` das execuções:
- soft wrap: "…proposto upstream na issue #261 e no PR #264 do remote_pi." → "…proposto upstream na issue #261 e no PR #264 do remote_pi, mergeado em 2026-10-25."
- ícone: "…; esperando o OK do dono no Dock." → "…; aprovado pelo dono no Dock e mergeado no remote_pi (PR #263) em 2026-10-25." O OK do Dock já estava registrado na linha 63.

### Quadro

- k10 e k20: "Esperando o merge do mantenedor." → "Mergeado pelo mantenedor em 2026-10-25."
- k11, "Estado": "Esperando a resposta do mantenedor; se ele quiser, novo trio e PR separado." → "O #264 foi mergeado em 2026-10-25 sem resposta à oferta. Cabe ao dono decidir: mandar o PR separado sem convite (novo trio) ou largar." A etiqueta `externo` vira `dono`, e o cartão continua em *Esperando*.
- k0, linha 24: "o k11 espera a resposta do mantenedor no PR do soft wrap (#264)" → "o k11 espera a decisão do dono (o #264 foi mergeado sem resposta à oferta)".
- k30 novo, no topo de Done: "PRs #263 e #264 mergeados no remote_pi". Contador "hoje: k30" → "hoje: k31".

Toda edição no quadro é por string exata com `count == 1`, e cada uma é seguida de `git diff --stat` e `grep -n '^## '`.

### `cross-cutting/upstream-contributions.md` (no `/wiki-sync`)

```diff
-| #261 / #264 | Soft wrap no editor, ligado por padrão em Markdown | PR aberto | …
-| #262 / #263 | Ícone do macOS no formato da grade da Apple | PR aberto | …
+| #261 / #264 | Soft wrap no editor, ligado por padrão em Markdown | Mergeado em 2026-10-25 (`8138e03`) | …
+| #262 / #263 | Ícone do macOS no formato da grade da Apple | Mergeado em 2026-10-25 (`6321d5d`) | …
```

Pendência do k11: "oferecido no #264; espera o mantenedor" → "oferecido no #264, que foi mergeado sem resposta; decisão do dono".

### `sources/external/2026-10-23_cockpit-code-editor.md` (no `/wiki-sync`)

Logo abaixo do aviso "Ponto no tempo" (linha 20):

```markdown
> **Atualização 2026-10-25:** o PR #264 foi mergeado no upstream (merge `8138e03`). A ponta do PR é o `177aea97` citado aqui, então as linhas valem para o código que entrou. Mudanças no `upstream/main` depois do merge não foram reconferidas.
```

History: "- 2026-10-25: PR #264 mergeado; nota no aviso de ponto no tempo." `updated: 2026-10-25`.

## §4.4. Riscos e impacto

1. **Reescrever histórico.** Mitigação: só os textos de estado atual mudam; o resto ganha nota datada.
2. **Apagar colunas do quadro** (incidente do k29). Mitigação: só strings exatas e diff após cada edição.

**Risk tier:** `low`: só wiki e quadro, sem código.

**Verificação:** `python3 .claude/skills/wiki-lint/lint.py --root .` → `exit 0`; `python3 .claude/skills/work-index/generate.py --check --root .` → ok; `python3 scripts/ci/check_commit_trailers.py origin/dev` → `exit 0`; `grep -n '^## ' cockpit_tower_wiki/board.kanban` mostra as 6 colunas.

**Revert:** `git revert` do commit.

## §4.5. Passos da execução

- [ ] (1) Após a aprovação: no worktree, branch `docs/2026-10-25_upstream-prs-merged__wiki` a partir de `origin/dev`.
- [ ] (2) Trios de 2026-10-23 e `work-index`.
- [ ] (3) Quadro (k0, k10, k11, k20, k30, contador).
- [ ] (4) Log da execução; revisão do agente `skipped — low`; lint, index e trailers.
- [ ] (5) `/wiki-sync`: aplica a §4.3 nas duas páginas e fecha o trio.
- [ ] (6) PR para `dev` e merge, com o aval do dono.

## §4.6. Escopo

**Área afetada:** `[wiki]`.

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (UPDATE): estado dos PRs e pendência do k11.
- `cockpit_tower_wiki/sources/external/2026-10-23_cockpit-code-editor.md` (UPDATE): nota de merge e History; `updated`.
- `cockpit_tower_wiki/_meta/log.md` (APPEND): entrada do wiki-sync.
