# CLAUDE.md — Cockpit Tower

> Thin stub for Claude Code. The canonical, LLM-agnostic methodology is **`.agents/METHODOLOGY.md`**; this file never duplicates it.

**Read always, in order** (METHODOLOGY §9):

1. `.agents/METHODOLOGY.md`
2. `.agents/rules/mandatory_planning_rule.md`
3. `.agents/rules/git_branching_rule.md`
4. `.agents/llm/claude.md` — Claude-specific adapter (tools, sub-agents in `.claude/agents/`, no-co-author rule).
5. `cockpit_tower_wiki/overview.md`

**Consult on demand:** `cockpit_tower_wiki/work/_index.md` (search past work with `/work-find`), `cockpit_tower_wiki/_meta/index.md`, `cockpit_tower_wiki/_meta/conventions.md` (only when writing to the wiki), `.claude/skills/_index.md`, `REVIEW.md` (reviewer role).

**Language:** Portuguese (pt-BR) for wiki, plans, tasks, executions and conversation; English for code, code comments, commit messages and PR text.

**Plan gate:** `.claude/hooks/require-approved-plan.sh` (registered in `.claude/settings.json`) blocks Edit/Write under `src/`, `lib/`, `bin/`, `web/`, `scripts/`, `panel/`, `test/` without an approved plan — including tooling under `scripts/` (e.g. `scripts/ci/`) and `test/`, which go through an ephemeral branch with a plan like any other change. Escape hatch: `SKIP_PLAN_GATE=1`, only with the human's explicit consent.

**Never** add `Co-Authored-By` or any AI-attribution trailer/footer to commits or PRs.
