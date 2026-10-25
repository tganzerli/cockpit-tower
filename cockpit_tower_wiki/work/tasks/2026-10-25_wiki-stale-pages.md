---
title: 2026-10-25 — Páginas da wiki marcadas stale
type: task
work_id: 2026-10-25_wiki-stale-pages
scope:
  area: [wiki]
status: done
updated: 2026-10-25
summary: Reconferir contra o código as cinco páginas que o wiki-lint marca como stale, corrigir o que ficou errado e só então atualizar o updated, sem calar o aviso só pela data.
topic: [wiki, knowledge]
related:
  - overview
  - cross-cutting/upstream-contributions
  - decisions/2026-10-22_read-only-client
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-fullscreen-scroll
---

# Páginas da wiki marcadas stale

## Contexto

Pedido do dono em 2026-10-25: "tenta arrumar o wiki-lint". O lint passa (`exit 0`), mas mostra 5 avisos `stale`. O aviso é só por data: um arquivo de `code_refs` recebeu commit depois do `updated` da página (`.claude/skills/wiki-lint/lint.py:242-257`). Ele não diz se o texto ficou errado. Por isso a correção é reconferir cada página e só depois atualizar o `updated` (`_meta/conventions.md:207`, `:222`).

Páginas:
- `overview.md` (`src/` mudou em 2026-10-25);
- `cross-cutting/upstream-contributions.md` (`board.kanban` mudou em 2026-10-25);
- `decisions/2026-10-23_phone-pty-resize.md` e `decisions/2026-10-23_phone-fullscreen-scroll.md` (`src/server.ts` mudou em 2026-10-24);
- `decisions/2026-10-22_read-only-client.md` (`src/session-info.ts` mudou em 2026-10-25).

## Critérios de aceite

- [x] Cada página reconferida; o que estava errado foi corrigido com citação, e o que é histórico foi anotado, não reescrito (`_meta/conventions.md:59`).
- [x] `python3 .claude/skills/wiki-lint/lint.py --root .` sem avisos `stale` e com `exit 0`.
- [x] Cartão k29 no quadro, concluído no mesmo PR.

## Fontes

- `.claude/skills/wiki-lint/lint.py` (`w_stale`).
- `cockpit_tower_wiki/_meta/conventions.md` §citações e §status.
