---
title: 2026-10-23 — Atualização da metodologia para o kit 5cff64d
type: task
work_id: 2026-10-23_methodology-upgrade-5cff64d
scope:
  area: [methodology, tooling]
status: done
updated: 2026-10-23
summary: Atualizar a metodologia instalada (kit 9d25a9f) para o kit 5cff64d, com o portão de plano liberando branches experiment/<slug> e a regra de dobrar commits escrita na work-cycle.
topic: [methodology, tooling]
related:
  - work/tasks/2026-10-23_methodology-upgrade
---

# Atualização da metodologia para o kit 5cff64d

> **Human-authored.** Pedido do dono em 2026-10-23 («Rode /methodology-upgrade … Abra o trio pelo ciclo normal e mantenha o GUARDED local … Atualize o KIT_VERSION e abra o PR para a dev.»).

## Context

O cockpit-tower está no kit 9d25a9f desde [[work/tasks/2026-10-23_methodology-upgrade]]. O kit recebeu dois PRs desde então:

- **#31:** o §3.5 da skill `work-cycle` passa a dizer no próprio texto a regra de dobrar os commits de correção antes do PR, em vez de citar o `git_branching_rule.md` §6.1.
- **#32:** o `.claude/hooks/require-approved-plan.sh` deixa passar as branches `experiment/<slug>`, que a regra §3.2 deixa fora do ciclo formal.

## Acceptance criteria

- [x] `.agents/KIT_VERSION` aponta para 5cff64d.
- [x] A work-cycle instalada traz o texto novo do §3.5.
- [x] O hook libera `experiment/<slug>` e mantém o `GUARDED` local (`src/ lib/ bin/ web/ scripts/ panel/ test/`).
- [x] Hook testado com payloads do Claude Code e do `agy`: `experiment/x` liberado; `dev` sem plano bloqueado; branch efêmera com plano aprovado liberada.
- [x] Entrada `methodology-update` em `_meta/log.md`.
- [x] PR aberto para a `dev`.

## Declared scope

**Area(s) affected:** `[methodology, tooling]`

## Constraints / discipline

- Não copiar arquivos do kit por cima de adaptações locais: o hook (`both`) é mesclado à mão.
- Sem mudança em código de produto (`src/`, `web/`, `panel/`, `bin/`).

## Success

O repositório fica no kit 5cff64d, com o portão de plano verificado nos dois agentes.
