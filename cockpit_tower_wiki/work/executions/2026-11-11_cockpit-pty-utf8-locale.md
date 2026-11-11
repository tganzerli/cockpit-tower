---
title: 2026-11-11 — Cockpit define LANG UTF-8 nos terminais, contribuição upstream
type: execution
work_id: 2026-11-11_cockpit-pty-utf8-locale
scope:
  area: [upstream-cockpit]
status: in_progress
updated: 2026-11-11
summary: Em andamento — helper withUtf8Locale no fork remote_pi, aplicado aos terminais e tasks.
topic: [bugfix]
related:
  - cross-cutting/upstream-contributions
---

# Execution Log — 2026-11-11_cockpit-pty-utf8-locale

> **Live log.** Atualizado a cada passo concluído.

## Metadata

- **ID:** `2026-11-11_cockpit-pty-utf8-locale`
- **Task:** [[work/tasks/2026-11-11_cockpit-pty-utf8-locale]]
- **Plan:** [[work/plans/2026-11-11_cockpit-pty-utf8-locale]]
- **Status:** `in_progress`
- **Start:** `2026-11-11`
- **Finish:** `—`
- **Scope:**
  - Area(s) affected: `[upstream-cockpit]`

## Checklist (espelha o plano §4.5)

- [x] Passo 1 — trio commitado no tower; `plan/00-decisions.md` lido
- [x] Passo 2 — fork sincronizado; worktree `fix/cockpit-pty-utf8-locale`
- [ ] Passo 3 — helper e testes
- [ ] Passo 4 — helper aplicado nos três pontos; `dart format`
- [ ] Passo 5 — analyze e suíte
- [ ] Passo 6 — build `macos-next` e verificação no app
- [ ] Passo 7 — commit e revisão `reviewer`
- [ ] Passo 8 — gate humano; issue e PR (com aprovação)
- [ ] Passo 9 — fechar e propor `/wiki-sync`

## Activity (chronological)

### `2026-11-11` — passo 1
- Plano aprovado pelo humano com `LANG` derivado do idioma (`pt_BR.UTF-8`), não `en_US` fixo.
- Commit `15dd9b7` (task e plano) em `docs/2026-11-11_cockpit-pty-utf8-locale__wiki`.
- `remote_pi:plan/00-decisions.md` lido: nenhuma decisão sobre ambiente de terminal ou locale.

### `2026-11-11` — passo 2
- `git push origin upstream/main:main`: `origin/main` foi de `8fe92dc2` para `f52d54a8`.
- O `main` local do clone principal ficou em `8fe92dc2`: o fast-forward abortou por arquivos
  gerados modificados (`cockpit/{linux,windows}/flutter/generated_plugin*`), que não são meus.
  Não mexi neles.
- Worktree `~/app/wt/remote-pi-utf8-locale`, branch `fix/cockpit-pty-utf8-locale`, base
  `f52d54a8`.

### `2026-11-11` — passos 3 e 4
- Novo `cockpit/lib/app/cockpit/data/terminal/terminal_locale_env.dart` (`withUtf8Locale`) e
  `cockpit/test/data/terminal_locale_env_test.dart` (10 casos).
- Helper aplicado em `pty_terminal_gateway.dart`, `sidecar/sidecar_terminal_gateway.dart` e
  `tasks/pty_task_runner.dart`. Comentários em pt-BR, como no resto do `remote_pi`.
- `dart format` nos arquivos tocados reformatou um bloco alheio do `pty_task_runner.dart`
  (`_watchDir`). Desfiz e reapliquei só as minhas três linhas nesse arquivo.
- O `flutter pub get` na worktree mexeu em `pubspec.lock` e arquivos `generated_plugin*`; ficam
  fora do commit.

### `2026-11-11` — passo 6 (build)
- A primeira tentativa falhou no `pod install`: `WARNING: CocoaPods requires your terminal to be
  using UTF-8 encoding` e depois `Encoding::CompatibilityError`. Este shell roda num terminal do
  Cockpit sem `LANG`, ou seja, o próprio bug. Mais uma evidência para o PR.
- Refeito com `LANG=en_US.UTF-8` só no comando: `pod install` e o `xcodebuild` ad-hoc em
  `~/app/remote_pi/cockpit/build/macos-next` → `** BUILD SUCCEEDED **`. O `Podfile.lock` foi
  revertido.
- `App` do `macos-next`: shasum `27cef801…`; `strings` acha `/usr/share/locale` (o helper está
  no binário).

## Commits

- tower `15dd9b7` — docs(work): add task and approved plan for the Cockpit UTF-8 LANG fix

## Divergences from the plan

- **None.**

## Validations

- [x] Teste do helper — `fvm flutter test test/data/terminal_locale_env_test.dart` → exit 0
  ```
  00:00 +10: All tests passed!
  ```
- [x] Analyze — `fvm flutter analyze lib test` → 40 na correção (`~/cpt`) e 40 na baseline
  `f52d54a8` (`~/cpb`); nos arquivos tocados:
  ```
  No issues found! (ran in 4.8s)
  ```
- [x] Suíte inteira (cópias com libghostty `prebuilt`) — `fvm flutter test`
  ```
  cpt: 09:16 +2126 ~11 -39: Some tests failed
  cpb: 09:09 +2116 ~11 -39: Some tests failed
  ```
  Os +10 são os testes novos. Mesmas falhas nas duas (o resumo final lista as mesmas 4, todas
  em `terminal_controller_test.dart`, conhecidas da dylib `prebuilt`).
- [ ] Verificação no app (plano §4.4) — pendente da troca do app pelo humano.

## Agent review

—

## Wiki pages affected

- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (UPDATE) — incluir a contribuição e
  a nota de que o Cockpit aberto pelo Dock não herda locale.

## Open notes

—
