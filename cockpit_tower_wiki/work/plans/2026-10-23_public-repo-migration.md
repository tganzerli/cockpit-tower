---
title: 2026-10-23 — Migrar o tower para um repositório público, sem vazar dados pessoais
type: plan
work_id: 2026-10-23_public-repo-migration
scope:
  area: [repo]
status: approved
risk: high
updated: 2026-10-23
summary: Sanitizar a dev, renomear o repositório atual para cockpit-tower-archive (privado) e publicar tganzerli/cockpit-tower a partir de um commit inicial limpo.
topic: [tooling]
related:
  - work/tasks/2026-10-23_public-repo-migration
---

# Plano — Migrar o tower para um repositório público

## §4.0. Análises pré-plano

Varredura feita no thread principal em 2026-10-23, com `git grep` no conteúdo atual e `git log --all -S` no histórico.

- **O token real** (`~/.cockpit-tower/token`), comparado sem exibir o valor: 0 ocorrências no conteúdo e no histórico.
- **O nome do Mac na tailnet** aparece em `cockpit_tower_wiki/work/executions/2026-10-22_read-only-viewer.md:143`, introduzido em um único commit (`cf6e244`).
- **Nomes de workspaces e projetos:**
  - `cockpit_tower_wiki/board.kanban:94`;
  - `cockpit_tower_wiki/work/executions/2026-10-22_cockpit-state-theme.md:55`;
  - `cockpit_tower_wiki/work/plans/2026-10-22_cockpit-state-theme.md:126`;
  - `test/session-info.test.ts:23-24,60`;
  - e o texto do PR #7, que não é migrado.
- **Caminhos com o usuário do Mac:**
  - `cockpit_tower_wiki/work/executions/2026-10-23_methodology-upgrade.md:41`;
  - `cockpit_tower_wiki/work/plans/2026-10-23_methodology-upgrade-5cff64d.md:24`.
- **E-mail:** os autores são o e-mail pessoal do dono (86 commits) e o noreply do GitHub (21). Não há e-mail pessoal no conteúdo; os de `scripts/ci/check_commit_trailers.py` são exemplos.
- **Sem IPs da tailnet** (100.64/10, fd7a:115c) e sem binários com conteúdo, só `.gitkeep` vazios.
- **GitHub:**
  - branch padrão `main`;
  - nenhuma proteção de branch, nenhum ruleset, nenhuma issue;
  - um workflow, `.github/workflows/methodology-checks.yml`;
  - o fork `tganzerli/remote_pi` já é público.
- **Links** `github.com/tganzerli/cockpit-tower` em 6 arquivos do wiki continuam válidos porque o público herda o nome. Os links para PRs (`/pull/N`) passam a apontar para PRs que não existem no público; eles são trocados por "PR #N no repositório arquivado".

## §4.1. Resumo e entendimento

Publicar o tower sem expor dados pessoais. O histórico atual guarda esses dados, então o público começa num **commit inicial limpo**, e o atual fica **privado e renomeado** como arquivo. A limpeza é feita primeiro na `dev` deste repositório, por PR, para que o conteúdo publicado seja exatamente o que foi revisado e testado.

## §4.2. Arquivos afetados

- `test/session-info.test.ts` (UPDATE) — nomes de projetos → `project-a`, `project-b`, `project-c`, `project-d/v6`.
- `cockpit_tower_wiki/board.kanban` (UPDATE) — exemplo de worktree → `project-a/wt-feature`; cartão k22 (CI de volta) se for o caso.
- `cockpit_tower_wiki/work/executions/2026-10-22_cockpit-state-theme.md`, `cockpit_tower_wiki/work/plans/2026-10-22_cockpit-state-theme.md` (UPDATE) — ordem dos workspaces com nomes genéricos.
- `cockpit_tower_wiki/work/executions/2026-10-22_read-only-viewer.md` (UPDATE) — `<your-mac>.<tailnet>.ts.net`.
- `cockpit_tower_wiki/work/executions/2026-10-23_methodology-upgrade.md`, `cockpit_tower_wiki/work/plans/2026-10-23_methodology-upgrade-5cff64d.md` (UPDATE) — caminho absoluto → `~/…`.
- Links `/pull/N` do wiki (UPDATE) — texto "PR #N (repositório arquivado)".
- O trio desta tarefa (CREATE).

🔒 **Rules affected:** none. As regras não citam o nome nem a visibilidade do repositório. A memória "CI offline até 2026-11-01" deixa de valer e é atualizada fora do repositório.

🔒 **ADRs affected:** none. Nenhuma ADR trata de hospedagem ou visibilidade.

## §4.3. Mudanças e justificativa

- **Trocas por padrões fixos**, aplicadas por script e conferidas por uma varredura que precisa voltar vazia:

  (a lista literal fica no repositório arquivado: nome do Mac na tailnet, nomes de projetos, caminho com o usuário, e-mail pessoal)

  O mapa é estável: cada projeto do dono vira `project-a` a `project-d`, sempre o mesmo, para os testes manterem o formato.
- **Publicação:**
  1. `git archive dev` vai para uma pasta nova no scratchpad, com `git init`.
  2. Um commit `Initial public release` é feito como `Thiago Ganzerli <96201486+tganzerli@users.noreply.github.com>`; `main` e `dev` apontam para ele.
  3. A varredura roda de novo nessa árvore.
  4. `gh repo rename cockpit-tower-archive` no atual, que continua privado.
  5. `gh repo create tganzerli/cockpit-tower --public` com a mesma descrição, e push de `main` e `dev`.
- **Clone local:**
  - `origin` passa a ser o público, e `archive` o arquivado;
  - `git checkout -B dev origin/dev`. A árvore é a mesma da `dev` limpa, então o tower em execução não muda;
  - `git config user.email` deste repositório passa a usar o noreply.

## §4.4. Riscos e impacto

1. **Algo pessoal passar.** A varredura por padrões só pega o que está na lista. Mitigação: o dono lê a lista e o diff da limpeza antes da publicação (portão), e a varredura roda duas vezes (na `dev` e na árvore exportada).
2. **Links antigos.** Links para PRs e commits do privado deixam de abrir para terceiros. Os PRs são trocados no texto; os hashes citados nas execuções ficam como referência ao arquivo.
3. **Ação externa e irreversível.** Depois de público, o conteúdo pode ser copiado. Por isso o passo de publicação só roda com o OK explícito do dono, depois da varredura.
4. **Renomear o repositório.** O GitHub redireciona o nome antigo para o novo até que um repositório novo use esse nome. Como o público vai usar o nome, o redirecionamento acaba, e por isso o `origin` local é trocado na hora.

**Risk tier:** `high`: configuração de exposição ("Always high risk" do `REVIEW.md`).

**Verification:**
- `npm test` verde;
- a varredura volta vazia na `dev` e na árvore exportada;
- `gh repo view tganzerli/cockpit-tower --json visibility` → `PUBLIC`;
- `gh repo view tganzerli/cockpit-tower-archive --json visibility` → `PRIVATE`;
- o CI roda no público, conferido em `gh run list`.

**Revert:**
- `gh repo delete tganzerli/cockpit-tower`, com confirmação do dono;
- `gh repo rename` do arquivo de volta para `cockpit-tower`;
- `origin` local de volta.

O conteúdo publicado nesse meio-tempo pode já ter sido copiado.

## §4.5. Passos de execução

- [ ] (1) Branch `chore/2026-10-23_public-repo-migration__repo` a partir de `dev`.
- [ ] (2) Aplicar as trocas e rodar `npm test`.
- [ ] (3) Rodar a varredura (precisa voltar vazia) e fazer o commit.
- [ ] 🔒 (4) **Portão:** o dono lê o diff da limpeza e a lista de padrões.
- [ ] (5) PR para a `dev` do repositório atual e merge.
- [ ] (6) Exportar a `dev` limpa, criar o commit inicial e rodar a varredura de novo.
- [ ] 🔒 (7) **Portão:** OK do dono para publicar.
- [ ] (8) Renomear o atual para `cockpit-tower-archive`, criar o público, enviar `main` e `dev`, e trocar os remotes locais.
- [ ] (9) Conferir a visibilidade e o CI. Atualizar a memória do CI e fechar o trio no público.

## §4.6. Escopo

Repositório e hospedagem. Não muda comportamento do gateway, do viewer nem do `bin/tower`.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/overview.md` (UPDATE) — linha sobre o repositório e o arquivo privado.
