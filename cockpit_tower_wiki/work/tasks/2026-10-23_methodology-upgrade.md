---
title: 2026-10-23 — Atualização da metodologia para o kit 9d25a9f
type: task
work_id: 2026-10-23_methodology-upgrade
scope:
  area: [methodology, tooling]
status: done
updated: 2026-10-23
summary: Atualizar a metodologia instalada (kit 4d137d0) para o kit 9d25a9f, incluindo o portão de plano do Antigravity, o limite de tamanho de regras e a verificação de trailers.
topic: [methodology, tooling]
related:
  - overview
---

# Atualização da metodologia para o kit 9d25a9f

> **Human-authored.** Solicitado pelo dono em 2026-10-23 («vamos fazer o ponto 2 em diante», ponto 5 = `/methodology-upgrade` no cockpit-tower).

## Context

O cockpit-tower foi instalado ontem a partir do kit 4d137d0. O kit evoluiu até 9d25a9f (portão de plano para o `agy` via `.agents/hooks.json`, `attribution: false` no Claude Code, checagem `rule-size` no `lint.py`, verificação de trailers, modelo de PR, scripts de índice e lint corrigidos). Esta tarefa adota essas mudanças preservando as adaptações locais (divisão de idiomas, notas do `agy` no `GEMINI.md`, `REVIEW.md`, índice de skills).

## Acceptance criteria

- [x] `.agents/KIT_VERSION` aponta para 9d25a9f.
- [x] Portão de plano instalado para Claude Code (`.claude/settings.json`) e Antigravity (`.agents/hooks.json`), com `GUARDED` cobrindo os diretórios de código do repositório.
- [x] `python3 .claude/skills/wiki-lint/lint.py --root .` sai com 0, incluindo `rule-size`.
- [x] Nenhum placeholder de template restante (checklist do INSTALL).
- [x] Entrada `methodology-update` em `_meta/log.md`.

## Declared scope

**Area(s) affected:** `[methodology, tooling]`

## Constraints / discipline

- Não copiar arquivos do kit por cima de adaptações locais: `both` e `local` são mesclados à mão.
- Sem mudança em código de produto (`src/`, `web/`, `panel/`).

## Success

O repositório fica no kit 9d25a9f, com o portão de plano verificado nos dois agentes.
