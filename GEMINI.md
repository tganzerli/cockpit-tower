# GEMINI.md — Cockpit Tower

> Thin stub for Gemini / Antigravity CLI (`agy`). The canonical, LLM-agnostic methodology is **`.agents/METHODOLOGY.md`**; this file never duplicates it.

**Read always, in order** (METHODOLOGY §9):

1. `.agents/METHODOLOGY.md`
2. `.agents/rules/mandatory_planning_rule.md`
3. `.agents/rules/git_branching_rule.md`
4. `.agents/llm/gemini.md` — Gemini/Antigravity adapter.
5. `cockpit_tower_wiki/overview.md`

**Consult on demand:** `cockpit_tower_wiki/work/_index.md` (search past work with `work-find`), `cockpit_tower_wiki/_meta/index.md`, `cockpit_tower_wiki/_meta/conventions.md` (only when writing to the wiki), `REVIEW.md` (reviewer role).

**Language:** Portuguese (pt-BR) for wiki, plans, tasks, executions and conversation; English for code, code comments, commit messages and PR text.

**Plan gate (Antigravity):** `.agents/hooks.json` runs `.claude/hooks/require-approved-plan.sh` on `write_file|edit_file` and denies writes under `src/`, `lib/`, `bin/`, `web/`, `scripts/`, `panel/`, `test/` without an approved plan. Escape hatch: `SKIP_PLAN_GATE=1`, only with the human's explicit consent.

**Never** add `Co-Authored-By` or any AI-attribution trailer/footer to commits or PRs.

## Skills available

Skills live in `.claude/skills/` and are exposed to Antigravity through the symlink `.agents/skills -> ../.claude/skills` (native discovery). Catalog: `.claude/skills/_index.md`. Use only these; do not invent skills. Skills marked *manual* run only on the human's explicit request.

| Skill | Path | Trigger |
|---|---|---|
| `work-cycle` | `.claude/skills/work-cycle/SKILL.md` | Start/drive the task → plan → execution cycle. |
| `wiki-sync` | `.claude/skills/wiki-sync/SKILL.md` | *Manual.* Propagate a finished execution to the knowledge pages. |
| `wiki-lint` | `.claude/skills/wiki-lint/SKILL.md` | *Manual.* Check wiki health (`lint.py`). |
| `wiki-index` | `.claude/skills/wiki-index/SKILL.md` | Regenerate a knowledge sub-index from page `summary`. |
| `ingest-source` | `.claude/skills/ingest-source/SKILL.md` | *Manual.* Ingest an external source into the wiki. |
| `commit` | `.claude/skills/commit/SKILL.md` | *Manual.* Close the cycle: grouped commits by work_id/type. |
| `sync-context` | `.claude/skills/sync-context/SKILL.md` | *Manual.* Sync local tree with the remote before new work. |
| `work-audit` | `.claude/skills/work-audit/SKILL.md` | Audit trio frontmatter vs `work/_index.md`. |
| `work-index` | `.claude/skills/work-index/SKILL.md` | Regenerate `work/_index.md` + archive. |
| `methodology-upgrade` | `.claude/skills/methodology-upgrade/SKILL.md` | *Manual.* Compare installed methodology with a kit checkout. |
| `work-find` | `.claude/skills/work-find/SKILL.md` | Search past work ("how was X done?"). |
