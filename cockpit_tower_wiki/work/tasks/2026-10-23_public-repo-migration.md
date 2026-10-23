---
title: 2026-10-23 — Migrar o tower para um repositório público, sem vazar dados pessoais
type: task
work_id: 2026-10-23_public-repo-migration
scope:
  area: [repo]
status: in_progress
updated: 2026-10-23
summary: Criar tganzerli/cockpit-tower público a partir de um commit inicial sanitizado; o repositório atual vira tganzerli/cockpit-tower-archive, privado.
topic: [tooling]
related: []
---

# Migrar o tower para um repositório público

## Contexto

O dono quer tornar o tower público. Não há decisão registrada para ele ser privado: foi criado assim em 2026-10-22. Uma varredura do conteúdo e do histórico (2026-10-23) achou:

- **Nenhum segredo.** O token real nunca foi commitado, e não há `.env`, chaves nem IPs da tailnet.
- **Dados pessoais ou de contexto:**
  - o nome real do Mac na tailnet, em uma execução (commit `cf6e244`);
  - os nomes dos workspaces e projetos do dono, no quadro, num plano, numa execução, nos testes e no texto do PR #7;
  - o e-mail pessoal como autor de 86 commits;
  - caminhos com o usuário do Mac.

**Decisões do dono (2026-10-23):**
- o público herda o nome `tganzerli/cockpit-tower`, e o atual vira `tganzerli/cockpit-tower-archive`, privado;
- os nomes de projetos viram genéricos;
- vai tudo, sanitizado: código, testes, wiki, ADRs, trios e metodologia;
- um commit inicial limpo, com o e-mail noreply do GitHub.

## Critérios de aceite

- [x] O conteúdo da `dev` não tem o nome do Mac na tailnet, os nomes de projetos do dono, o e-mail pessoal nem caminhos com o usuário. Uma varredura com padrões fixos não acha nada.
- [x] `npm test` passa depois da troca nos testes.
- [x] `tganzerli/cockpit-tower` é público, com `main` e `dev` num commit inicial sanitizado, de autor noreply.
- [x] O repositório antigo continua privado como `tganzerli/cockpit-tower-archive`, com todo o histórico e os PRs.
- [x] O clone local aponta para o público, e o arquivo fica como remote secundário. O tower continua rodando.
- [ ] O CI (`methodology-checks.yml`) roda no público.
