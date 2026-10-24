# Wiki Log

> Chronological, append-only. Standard prefix `## [YYYY-MM-DD] {operation} | {target}` so entries stay `grep`-able.
>
> Possible operations: `bootstrap`, `ingest`, `query`, `wiki-sync`, `lint`, `methodology-update`, `git-correction`, `rename`.
>
> Newest entries go on **top**, right below this header. Never edit or delete a past entry — only append.

## [2026-10-22] bootstrap | instalação da metodologia agent-dev-methodology

Instalação do kit agent-dev-methodology (core apenas) em um repositório vazio. Nenhum código de produto escrito; o primeiro ciclo de trabalho começa com a primeira task do humano.

- kit_commit: 4d137d0480624a50402a73c990f671e02b0318c4 (mesmo carimbo em `.agents/KIT_VERSION`)
- Projeto: Cockpit Tower
- Slug do vault: cockpit_tower → `cockpit_tower_wiki/`
- Idioma do conhecimento: Portuguese (pt-BR) — wiki, planos, tasks, execuções e conversa com o humano. Decisão explícita do humano: código, comentários de código, mensagens de commit, títulos e corpos de PR em inglês.
- Monorepo: não → regra de branching single-repo do core (`main`/`dev` + efêmeras com plano aprovado).
- Agentes: Claude Code (`.agents/llm/claude.md`, `CLAUDE.md`, `.claude/agents/*`, hook de plano em `.claude/settings.json`) + Antigravity CLI (`.agents/llm/gemini.md`, `GEMINI.md`, symlink `.agents/skills -> ../.claude/skills`; sem `.gemini/commands/`). `AGENTS.md` na raiz.
- Time parceiro: não. Git host: GitHub.
- Módulos instalados: nenhum (monorepo, cross-team, intra-team, benchmarks, contracts, dev-env, writing, peer-relay ficaram de fora — gatilhos em `.claude/skills/_index.md`).
- Mecanismos: `.githooks/commit-msg` + `scripts/ci/check_commit_trailers.py`, `.github/workflows/methodology-checks.yml`, `.github/pull_request_template.md`, `REVIEW.md` semeado.
- Onboarding por clone: `git config core.hooksPath .githooks`.

## [2026-10-22] wiki-sync | 2026-10-22_read-only-viewer | 5 pages touched

- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (CREATE)
- `cockpit_tower_wiki/services/gateway.md` (CREATE)
- `cockpit_tower_wiki/flows/tower-on-off.md` (CREATE)
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (CREATE)
- `cockpit_tower_wiki/overview.md` (UPDATE) — resumo e áreas preenchidos

## [2026-10-22] wiki-sync | 2026-10-22_tower-cockpit-panel | 3 pages touched

- `cockpit_tower_wiki/flows/tower-on-off.md` (UPDATE) — status --json, qr, DETACH, painel, token fora do argv; citações atualizadas
- `cockpit_tower_wiki/overview.md` (UPDATE) — área panel
- `cockpit_tower_wiki/cross-cutting/cockpit-exec-process-group.md` (CREATE)

## [2026-10-22] wiki-sync | 2026-10-22_terminal-text-cockpit-style | 2 pages touched

- `cockpit_tower_wiki/overview.md` (UPDATE) — linha do viewer: xterm só como emulador e visão HTML com quebra de linha
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — quebra de linha só na exibição; fase de comandos pelo celular na revisão planejada

## [2026-10-22] wiki-sync | 2026-10-22_session-identity-cockpit-look | 4 pages touched

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — nova seção "Contexto das sessões"; peças e limitações atualizadas
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — lacuna do id da aba: contorno pela ordem e pela CLI cockpit
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — consequência: leituras lsof/ps e listagem da CLI no gateway
- `cockpit_tower_wiki/overview.md` (UPDATE) — linha do viewer: navegação do Cockpit e identificação das sessões

## [2026-10-22] wiki-sync | 2026-10-22_cockpit-state-theme | 3 pages touched

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — estado salvo do Cockpit (ordem, cor, worktrees, tema); citações de linha atualizadas
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — nova seção: estado salvo do Cockpit como fonte somente leitura
- `cockpit_tower_wiki/overview.md` (UPDATE) — linha do viewer: tema claro/escuro e lateral do Cockpit

## [2026-10-23] methodology-update | 2026-10-23_methodology-upgrade | kit 4d137d0 → 9d25a9f

- `kit_commit: 9d25a9fcdff7e7cc299661a62b80a42c07e9662b` (antes `4d137d0480624a50402a73c990f671e02b0318c4`); `.agents/KIT_VERSION` atualizado.
- Adotado: portão de plano do Antigravity (`.agents/hooks.json`), `attribution: false` (`.claude/settings.json`), `GUARDED` com `panel/` e `test/`, `rule-size` no `lint.py`, verificador de trailers, workflow de checagens, modelo de PR, templates e scripts de índice/lint.
- Mantido localmente: divisão de idiomas, nota do portão no `GEMINI.md`, `REVIEW.md`, `.claude/skills/_index.md`. Não instalado: `git-runbook/reference.md` (módulo monorepo).

## [2026-10-23] methodology-update | 2026-10-23_methodology-upgrade-5cff64d | kit 9d25a9f → 5cff64d

- `kit_commit: 5cff64d3328a692de1c0e1223c9f6bb2eb73b286` (antes `9d25a9fcdff7e7cc299661a62b80a42c07e9662b`); `.agents/KIT_VERSION` atualizado.
- Adotado: kit #31 (work-cycle §3.5 diz a regra de dobrar os commits de correção) e kit #32 (o portão de plano libera `experiment/<slug>`, git_branching_rule.md §3.2).
- Mantido localmente: `GUARDED` (`src/ lib/ bin/ web/ scripts/ panel/ test/`) e os seis arquivos `local` da atualização anterior.

## [2026-10-23] wiki-sync | 2026-10-23_methodology-upgrade | 0 pages touched


## [2026-10-23] wiki-sync | 2026-10-23_methodology-upgrade-5cff64d | 0 pages touched


## [2026-10-23] wiki-sync | 2026-10-23_cockpit-macos-icon-shape | 0 pages touched

## [2026-10-23] wiki-sync | 2026-10-23_phone-terminal-input | 7 pages touched

- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE) — ADR nova (criada na execução); dev também exige Origin
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — superseded
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — pty.input enviado; risco do crédito de fluxo revisto
- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — acesso com Origin e dono; seção Digitação pelo celular
- `cockpit_tower_wiki/flows/tower-on-off.md` (UPDATE) — identidade do Tailscale, gateway.config; linhas do bin/tower
- `cockpit_tower_wiki/overview.md` (UPDATE) — produto deixa de ser só leitura
- `cockpit_tower_wiki/_meta/index.md` (UPDATE) — linha do gateway

## [2026-10-23] wiki-sync | 2026-10-23_phone-pty-resize | 5 pages touched

- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE) — ADR nova (criada na execução); code_refs
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE) — nota de refinamento, summary
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — pty.resize enviado; resize global; aba fechada deixa o shell vivo (k21)
- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — seção Tamanho da PTY; citações de src/server.ts atualizadas
- `cockpit_tower_wiki/overview.md` (UPDATE) — modo de comando também dimensiona a PTY

## [2026-10-23] wiki-sync | 2026-10-23_phone-fullscreen-scroll | 6 pages touched

- `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md` (UPDATE) — ADR nova (criada na execução); code_refs
- `cockpit_tower_wiki/decisions/2026-10-23_phone-input-client.md` (UPDATE) — nota de refinamento (wheel)
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE) — revisit_when e Abre sem o k3
- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — seção Rolagem do agente; citações de src/server.ts atualizadas
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — rolagem também por pty.input
- `cockpit_tower_wiki/overview.md` (UPDATE) — arrasto rola os agentes em tela cheia
