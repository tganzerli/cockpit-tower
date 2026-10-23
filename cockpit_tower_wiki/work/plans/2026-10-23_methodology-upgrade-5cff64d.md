---
title: 2026-10-23 — Atualização da metodologia para o kit 5cff64d
type: plan
work_id: 2026-10-23_methodology-upgrade-5cff64d
scope:
  area: [methodology, tooling]
status: executed
risk: medium
updated: 2026-10-23
summary: Adotar as mudanças do kit 9d25a9f..5cff64d (texto da work-cycle §3.5, hook liberando experiment/<slug>), testar o portão nos dois agentes e carimbar KIT_VERSION.
topic: [methodology, tooling]
related:
  - work/tasks/2026-10-23_methodology-upgrade-5cff64d
---

# Plano — Atualização da metodologia para o kit 5cff64d

> Cobre [[work/tasks/2026-10-23_methodology-upgrade-5cff64d]]. **Aprovado pelo dono em 2026-10-23 («sim pode»).**

## §4.0. Análises prévias

analyses: not needed — a análise é a própria saída de `compare.py` (abaixo); duas mudanças pequenas, sem decisão de arquitetura.

`python3 .claude/skills/methodology-upgrade/compare.py --kit ~/app/agent-dev-methodology --root .` (carimbo 9d25a9f, HEAD 5cff64d):

- **kit-change (1):** `.claude/skills/work-cycle/SKILL.md` ← `core/skills/work-cycle/SKILL.md`. A única diferença para a HEAD é a frase do passo 1 do §3.5 (kit #31, `c56b366`).
- **both (1):** `.claude/hooks/require-approved-plan.sh` ← `core/hooks/require-approved-plan.sh`. Do lado local, só o `GUARDED` (`.claude/hooks/require-approved-plan.sh:128`); do lado do kit, só o bloco `experiment/<slug>` (kit #32, `07c9183`), 6 linhas depois do portão `docs/…__(knowledge|relay)`. As duas mudanças não se sobrepõem.
- **local (6), mantidos sem mudança:** `.agents/llm/gemini.md`, `.agents/METHODOLOGY.md`, `.agents/rules/mandatory_planning_rule.md`, `.claude/skills/_index.md`, `.github/pull_request_template.md`, `REVIEW.md`. São as adaptações registradas na atualização anterior; o kit não mexeu nelas entre 9d25a9f e 5cff64d (`git -C <kit> diff 9d25a9f 5cff64d --stat`: só os dois arquivos acima).
- Nenhum `new-in-kit`, `removed-in-kit` ou `missing`.

## §4.1. Resumo e entendimento

Levar a metodologia ao kit 5cff64d. Na prática, duas mudanças: o texto da work-cycle diz a regra de dobrar os commits de correção, e o portão de plano deixa de bloquear os spikes em `experiment/<slug>`, que a regra de branching já tira do ciclo formal. O `GUARDED` local continua como está.

## §4.2. Arquivos afetados

- `.claude/skills/work-cycle/SKILL.md` (UPDATE) — copiado da HEAD do kit (sem placeholder no trecho que mudou).
- `.claude/hooks/require-approved-plan.sh` (UPDATE) — mesclado: bloco `experiment/<slug>` do kit, `GUARDED` local.
- `.agents/KIT_VERSION` (UPDATE) — `kit_commit` 5cff64d, `upgraded: 2026-10-23 (from 9d25a9f)`.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada `methodology-update`.
- `cockpit_tower_wiki/work/_index.md` (regenerado), trio desta tarefa (CREATE).

## §4.3. Mudanças e justificativa

Hook, logo depois do portão de escopo knowledge/relay (ele continua valendo antes):

```python
if re.match(r"^experiment/[a-z0-9][a-z0-9-]*$", _branch):
    allow()
```

`allow()` sai com 0 nos dois protocolos e, no `agy`, não imprime nada (sem opinião; o pedido de permissão normal continua).

## §4.4. Riscos e impacto

1. **Spike em `experiment/` escrevendo código sem plano.** É o que a regra §3.2 permite: a branch não entra em linha permanente, e o que se aprende vira tarefa nova. O portão de escopo dos PRs continua.
2. **Perder o `GUARDED` local na mesclagem.** Mitigação: mesclagem de três vias (`git merge-file`, base = carimbo) e conferência com `compare.py --diff … --against head`, que deve mostrar só o `GUARDED`.
3. **CI não roda até 2026-11-01.** Mitigação: verificações rodadas à mão.

**Risk tier:** `medium` — mexe no portão de plano, sem tocar código de produto.

**Verification:**
- `compare.py` sem `kit-change`/`both`, só os `local` conhecidos; `--diff` do hook contra a HEAD mostra só o `GUARDED`.
- Hook com payloads do Claude Code (`tool_input.file_path`) e do `agy` (`toolCall.args.Path`), escrevendo `src/x.ts`, num clone temporário do repositório:
  - `experiment/x` → Claude exit 0 sem stderr; agy exit 0 sem stdout;
  - `dev` sem marcador → Claude exit 2; agy `{"decision":"deny",…}`;
  - `chore/2026-10-23_methodology-upgrade-5cff64d__tooling` com este plano `approved` → Claude exit 0; agy sem stdout.
- `lint.py --root .` sai 0; `work-index --check` ok; `check_commit_trailers.py origin/dev` sai 0; `npm test` passa.

**Revert:** reverter os commits do PR; `.agents/KIT_VERSION` volta a 9d25a9f.

## §4.5. Passos de execução

- [ ] (1) Criar a branch `chore/2026-10-23_methodology-upgrade-5cff64d__tooling` a partir de `dev`.
- [ ] (2) Copiar a work-cycle da HEAD do kit; mesclar o hook mantendo o `GUARDED`.
- [ ] (3) Testar o hook com os seis payloads.
- [ ] (4) Carimbar `KIT_VERSION`; entrada no log; regenerar o índice.
- [ ] (5) Verificações (lint, índice, trailers, `npm test`); revisão do agente (tier `medium`).
- [ ] (6) PR para `dev`.

## §4.6. Escopo

**Area(s) affected:** `[methodology, tooling]`

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada `methodology-update`.
