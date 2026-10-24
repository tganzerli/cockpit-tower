---
title: 2026-10-23 — Quebra de linha (soft wrap) no editor do Cockpit, contribuição upstream
type: task
work_id: 2026-10-23_cockpit-editor-soft-wrap
scope:
  area: [upstream-cockpit]
status: done
updated: 2026-10-24
summary: Propor ao remote_pi (issue + PR) um modo de quebra de linha no editor do Cockpit, ligado por padrão em .md.
topic: [ui]
related:
  - contracts/cockpit-protocol-v2
---

# Quebra de linha (soft wrap) no editor do Cockpit, contribuição upstream

## Contexto

O humano usa o Cockpit como IDE. Ao editar `.md`, um parágrafo vira uma linha só, com
rolagem horizontal, o que torna difícil editar texto corrido. Não há issue nem PR sobre
isso no `remote_pi`. A busca foi feita em 2026-10-23 na sessão `891cce64`, cobrindo as
issues abertas e as issues e PRs fechados.

O código não tem opção escondida, e o comportamento é intencional:
- `remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:29-37` diz que o
  `IntrinsicWidth` com a rolagem horizontal externa faz a linha longa não quebrar.
- Os `.md` abrem no mesmo `CodeEditor` usado para código
  (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/file_viewer.dart:965`).
- Quatro pontos contam com uma linha visual por linha lógica: o gutter com altura fixa
  por item (`code_editor.dart:885-895`), o reveal (`:244`, `:275`), o hover e o
  go-to-definition (`:391`, `:421`) e o overview do Git (`:986-990`).

Não é trabalho do produto tower: é uma contribuição ao Cockpit, que o tower consome.
O código fica no fork `tganzerli/remote_pi`, clonado em `~/app/remote_pi` com o remote
`upstream`. O tower guarda o trio e o que se aprender sobre o editor.

## Critérios de aceite

- [ ] Issue aberta no `jacobaraujo7/remote_pi` com o problema, a proposta e as notas técnicas.
- [ ] Com a quebra ligada, uma linha longa quebra na largura da pane e não sobra rolagem horizontal.
- [ ] Com a quebra ligada, os números de linha, o reveal (busca e Git), o hover de
      diagnostic e o overview do Git apontam para a linha certa.
- [ ] Com a quebra desligada, o editor se comporta exatamente como antes.
- [ ] A quebra é ligada e desligada pelo menu (atalho ⌥Z), vem ligada por padrão em
      `.md`/`.txt`, e a escolha persiste.
- [ ] Textos novos em en, pt-BR e es (regra de i18n do `cockpit/CLAUDE.md`).
- [ ] `flutter analyze` sem issues e testes de widget novos passando, com a saída na execução.
- [ ] PR aberto do fork para `jacobaraujo7/remote_pi:main`, em inglês, citando a issue.

## Escopo declarado

**Área(s) afetada(s):** `[upstream-cockpit]` (nenhuma área do tower: `src/`, `web/`, `bin/` e `panel/` não mudam).

## Restrições

- Seguir as convenções do `remote_pi` (`cockpit/CLAUDE.md`, `cockpit/lib/app/CLAUDE.md`):
  tema por tokens, i18n completo, scroll clamp, sem `Color(0x…)` fixo.
- Não regredir o modo atual, que também é usado pelo `.http` e pelo `.dbq`
  (`http_request_view.dart:370`, `db_query_view.dart:444`).
- Issue e PR públicos só saem com aprovação do humano no momento.
- Sem trailer de IA nos commits.

## Sucesso

Editar `.md` no Cockpit sem rolar para o lado, e o PR aceito upstream.
