---
title: 2026-10-24 — Corrigir as citações do bin/tower na página do grupo de processos
type: plan
work_id: 2026-10-24_exec-process-group-citations
scope:
  area: [wiki]
status: executed
risk: low
updated: 2026-10-24
summary: Trocar bin/tower:25/102/116 por 26/113/127 e atualizar o updated da página; nenhum texto muda.
topic: [wiki]
related:
  - work/tasks/2026-10-24_exec-process-group-citations
  - cross-cutting/cockpit-exec-process-group
---

# Plano — Corrigir as citações do bin/tower na página do grupo de processos

## §4.0. Análises pré-plano

`analyses: not needed` — troca mecânica de três números de linha, conferidos com `sed -n` no `bin/tower` atual:
- `bin/tower:26` é o `DETACH=(perl -MPOSIX …)`;
- `bin/tower:113` é a subida do gateway por `DETACH`;
- `bin/tower:127` é a subida do `caffeinate` por `DETACH`.

## §4.1. Resumo e entendimento

A página cita `bin/tower:25`, `:102` e `:116`, que hoje caem num comentário, num `cmd_off` e na gravação do `gateway.config`. A correção devolve as citações às linhas certas, sem mudar a lição.

## §4.2. Arquivos afetados

- `cockpit_tower_wiki/cross-cutting/cockpit-exec-process-group.md` (UPDATE) — três citações e `updated`.

🔒 **Rules affected:** none. 🔒 **ADRs affected:** none.

## §4.3. Mudanças e justificativa

`bin/tower:25` → `:26`, `:102` → `:113`, `:116` → `:127`; `updated: 2026-10-24`.

## §4.4. Riscos e impacto

**Risk tier:** `low` (wiki). **Verification:** `python3 .claude/skills/wiki-lint/lint.py --root .` sem o aviso `stale` da página. **Revert:** `git revert` do commit.

## §4.5. Passos de execução

- [x] (1) Branch `docs/2026-10-24_exec-process-group-citations__wiki` a partir de `dev`.
- [x] (2) Trocar as citações e o `updated`.
- [x] (3) Wiki-lint e trailers; PR para a `dev`.

## §4.6. Escopo

Wiki.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/cross-cutting/cockpit-exec-process-group.md` (UPDATE) — citações.
