---
title: 2026-10-23 — Atualização da metodologia para o kit 9d25a9f
type: plan
work_id: 2026-10-23_methodology-upgrade
scope:
  area: [methodology, tooling]
status: executed
risk: medium
updated: 2026-10-23
summary: Adotar as mudanças do kit 4d137d0..9d25a9f, instalar o portão de plano do agy e o attribution false, e carimbar KIT_VERSION.
topic: [methodology, tooling]
related:
  - work/tasks/2026-10-23_methodology-upgrade
---

# Plano — Atualização da metodologia para o kit 9d25a9f

> Cobre [[work/tasks/2026-10-23_methodology-upgrade]]. **Aprovado pelo dono em 2026-10-23 («vamos fazer o ponto 2 em diante»).**

## §4.0. Análises prévias

analyses: not needed — a análise é a própria saída de `compare.py` (abaixo); sem decisão de arquitetura.

`python3 -I <kit>/core/skills/methodology-upgrade/compare.py --kit <kit> --root .` (carimbo 4d137d0, HEAD 9d25a9f):

- **kit-change (19):** `scripts/ci/check_commit_trailers.py`, `.github/workflows/methodology-checks.yml`, `.agents/rules/git_branching_rule.md`, `compare.py`, `wiki-index/{SKILL.md,generate.py}`, `wiki-lint/{SKILL.md,lint.py}`, `wiki-sync/sync_bookkeeping.py`, `work-cycle/SKILL.md`, `work-index/{SKILL.md,generate.py}`, templates (adr, execution, plan, postmortem, source, wiki-page) e `_meta/conventions.md`.
- **both (6):** `.agents/llm/claude.md`, `.agents/llm/gemini.md`, `.agents/METHODOLOGY.md`, `.claude/hooks/require-approved-plan.sh`, `.agents/rules/mandatory_planning_rule.md`, `work/tasks/_template.md`. Mesclados com `git merge-file` (base = carimbo, kit = HEAD) e conflitos resolvidos à mão mantendo: divisão de idiomas (pt-BR / commits em inglês), `GUARDED` local, linha de commit/PR em inglês no `gemini.md`.
- **local (2), mantidos:** `.claude/skills/_index.md` (módulos excluídos do projeto, link do agy), `REVIEW.md` (conteúdo do projeto).
- **new-in-kit (4):** `.agents/hooks.json` e `.claude/settings.json` (instalar), `.github/pull_request_template.md` (já existe: mesclar o modelo novo mantendo a dica de risco do projeto), `.claude/skills/git-runbook/reference.md` (só do módulo monorepo; **não instalar**).
- Nenhum arquivo em `removed-in-kit`.

## §4.1. Resumo e entendimento

Levar a metodologia instalada ao kit 9d25a9f sem perder adaptações locais, e fechar a lacuna principal: o `agy` não tinha portão de plano executável.

## §4.2. Arquivos afetados

- Os 19 arquivos `kit-change` acima (UPDATE; `check_commit_trailers.py` e o workflow incluídos).
- `.agents/llm/claude.md`, `.agents/llm/gemini.md`, `.agents/METHODOLOGY.md`, `.agents/rules/mandatory_planning_rule.md`, `.claude/hooks/require-approved-plan.sh`, `cockpit_tower_wiki/work/tasks/_template.md` (UPDATE, mesclados).
- `.agents/hooks.json` (CREATE) — portão do `agy`.
- `.claude/settings.json` (UPDATE) — `"attribution": false`.
- `.github/pull_request_template.md` (UPDATE) — modelo novo do kit.
- `CLAUDE.md`, `GEMINI.md` (UPDATE) — lista de diretórios protegidos; `GEMINI.md` ganha a nota do portão do agy.
- `.agents/KIT_VERSION` (UPDATE) — 9d25a9f, `commit_lang`, `upgraded`.
- `cockpit_tower_wiki/_meta/log.md` (APPEND), `cockpit_tower_wiki/work/_index.md` (regenerado), trio desta tarefa (CREATE).

## §4.3. Mudanças e justificativa

`.claude/hooks/require-approved-plan.sh`: o kit passou a comparar prefixos sem diferenciar maiúsculas (`GUARDED_CI`) e a falar o protocolo do `agy`. Mantido o `GUARDED` local e ampliado para os diretórios de código vistos na árvore:

```python
GUARDED = ("src/", "lib/", "bin/", "web/", "scripts/", "panel/", "test/")
GUARDED_CI = tuple(g.lower() for g in GUARDED)
```

`.agents/hooks.json` e `.claude/settings.json` vêm de `core/hooks/` sem alteração. `attribution: false` exige Claude Code ≥ 2.1.281 (instalado: 2.1.309).

## §4.4. Riscos e impacto

1. **Portão bloqueando edições legítimas em `panel/` e `test/`.** Mitigação: só bloqueia fora de branch efêmera com plano aprovado; `SKIP_PLAN_GATE=1` com consentimento do dono.
2. **Perda de adaptação local em arquivo `both`.** Mitigação: mesclagem de três vias, conflitos revisados um a um.
3. **CI não roda (Actions fora do ar até 2026-11-01).** Mitigação: verificações rodadas à mão (abaixo).

**Risk tier:** `medium` — mexe no portão de plano e em regras sempre carregadas, sem tocar código de produto.

**Verification:** `lint.py --root .` sai 0 (com `rule-size`); `work-index --check` ok; grep de placeholders vazio; portão do Claude nega escrita guardada sem plano (exit 2) e permite com plano aprovado; sonda real do `agy` nega/permite; verificador de trailers rejeita trailer de LLM e aceita commit humano.

**Revert:** reverter os commits do PR; `.agents/KIT_VERSION` volta a 4d137d0.

## §4.5. Passos de execução

- [ ] (1) Classificar com `compare.py`.
- [ ] (2) Copiar os `kit-change` desembaraçados de placeholders.
- [ ] (3) Mesclar os `both` à mão; manter os `local`.
- [ ] (4) Instalar `.agents/hooks.json`, `.claude/settings.json`, modelo de PR; ajustar `GUARDED`.
- [ ] (5) Carimbar `KIT_VERSION`; entrada no log.
- [ ] (6) Testar (lint, índice, placeholders, portão Claude e agy, trailers).
- [ ] (7) PR para `dev`.

## §4.6. Escopo

**Area(s) affected:** `[methodology, tooling]`

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada `methodology-update`.
