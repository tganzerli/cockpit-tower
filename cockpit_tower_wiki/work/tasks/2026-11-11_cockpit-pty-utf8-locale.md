---
title: 2026-11-11 — Cockpit define LANG UTF-8 nos terminais, contribuição upstream
type: task
work_id: 2026-11-11_cockpit-pty-utf8-locale
scope:
  area: [upstream-cockpit]
status: open
updated: 2026-11-11
summary: Fazer o Cockpit definir LANG=<locale>.UTF-8 no ambiente dos terminais e tasks quando nenhuma variável de locale vier herdada, para o pbcopy (e o Claude Code) não gravar acentos como Mac Roman; corrigir no fork e propor upstream.
topic: [bugfix]
related:
  - work/tasks/2026-11-09_cockpit-chime-release-audio
---

# Cockpit define LANG UTF-8 nos terminais, contribuição upstream

## Contexto

O humano percebeu que, ao copiar texto de um terminal do Cockpit, os acentos chegam
quebrados: `seção` vira `se√ß√£o`.

Causa reproduzida em 2026-11-11, num shell dentro do Cockpit aberto pelo Dock:
- O shell não tem `LANG`, `LC_ALL` nem `LC_CTYPE` (os três vazios).
- Sem locale, o `pbcopy` lê o stdin como Mac Roman. `printf 'seção' | env -u LANG pbcopy`
  deixa no clipboard `73 65 e2889a c39f e2889a c2a3 6f` ("se√ß√£o"). Com
  `LANG=en_US.UTF-8`, ficam os bytes certos, `73 65 c3a7 c3a3 6f`.
- O Claude Code e outras CLIs copiam via `pbcopy`, então toda cópia feita por programas no
  terminal sai errada. A cópia com ⌘C da seleção usa o clipboard do Flutter e não é afetada.
- Um app aberto pelo Dock/Finder não herda `LANG`. O Terminal.app e o iTerm definem a
  variável sozinhos. O Cockpit só define `TERM` e `COLORTERM`
  (`remote_pi:cockpit/lib/app/cockpit/data/terminal/pty_terminal_gateway.dart:99-104`, ref
  `upstream/main` `f52d54a8`).

Não há issue nem PR sobre isso no `jacobaraujo7/remote_pi` (busca de 2026-11-11 por LANG,
locale, UTF-8, accent, pbcopy, encoding).

## Critérios de aceite

- [ ] Num terminal novo do Cockpit aberto pelo Dock, `LANG` vem preenchida com um locale
      UTF-8 que existe no sistema (`locale` sem avisos).
- [ ] `printf 'seção' | pbcopy` dentro do Cockpit grava UTF-8 correto no clipboard (bytes
      conferidos), e a cópia pelo Claude Code cola `seção` certo.
- [ ] Se o ambiente do app já trouxer `LANG`, `LC_ALL` ou `LC_CTYPE`, nada é alterado.
- [ ] Tasks (`PtyTaskRunner`) recebem o mesmo tratamento que os terminais.
- [ ] Windows e Linux não mudam de comportamento.
- [ ] Testes unitários da regra, `fvm flutter analyze` sem issues novas em relação à baseline
      e suíte sem falhas novas, com a saída na execução.
- [ ] Issue e PR abertos no `jacobaraujo7/remote_pi`, em inglês, depois de validado no fork.

## Escopo declarado

**Área(s) afetada(s):** `[upstream-cockpit]` (nenhuma área do tower: `src/`, `web/`, `bin/` e
`panel/` não mudam).

## Restrições

- Não mexer nas configurações do shell do humano (`~/.zshenv` etc.): a correção é no app.
- Seguir as convenções do `remote_pi` (`cockpit/CLAUDE.md`).
- Issue e PR públicos só saem com aprovação do humano no momento.
- Sem trailer de IA nos commits.

## Sucesso

Copiar texto acentuado de qualquer programa no terminal do Cockpit funciona como no
Terminal.app, e o PR é aceito upstream.
