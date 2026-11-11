---
title: 2026-11-11 — Cockpit define LANG UTF-8 nos terminais, contribuição upstream
type: execution
work_id: 2026-11-11_cockpit-pty-utf8-locale
scope:
  area: [upstream-cockpit]
status: done
updated: 2026-11-11
summary: Helper withUtf8Locale no fork remote_pi (LANG UTF-8 nos terminais e tasks do macOS sem locale herdado), validado pelo Dock; issue #320 e PR #321 abertos upstream.
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
- **Status:** `done`
- **Start:** `2026-11-11`
- **Finish:** `2026-11-11`
- **Scope:**
  - Area(s) affected: `[upstream-cockpit]`

## Checklist (espelha o plano §4.5)

- [x] Passo 1 — trio commitado no tower; `plan/00-decisions.md` lido
- [x] Passo 2 — fork sincronizado; worktree `fix/cockpit-pty-utf8-locale`
- [x] Passo 3 — helper e testes
- [x] Passo 4 — helper aplicado nos três pontos; `dart format`
- [x] Passo 5 — analyze e suíte
- [x] Passo 6 — build `macos-next` e verificação no app
- [x] Passo 7 — commit e revisão `reviewer`
- [x] Passo 8 — gate humano; issue e PR (com aprovação)
- [x] Passo 9 — fechar e propor `/wiki-sync`

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

### `2026-11-11` — passo 6 (verificação no app)
- O humano rodou `cockpit-switch.sh atualizar && … fork` e reabriu, mas a primeira reabertura
  (19:29) ainda era a build antiga: `App` com shasum `5d496a7d` e data de 10:09. Um dry-run do
  `rsync` do script (`rsync -an --delete`) saía com exit 0 e listava a cópia. O humano repetiu, e
  o app de 19:32 (PID 36789) já era a build nova. ⚠ Causa da primeira falha não confirmada; o
  mais provável é o `atualizar` ter recusado porque o Cockpit ainda estava fechando.
- Verificação registrada em Validations. A task de teste foi um `.cockpit/tasks.json`
  temporário no checkout principal do tower, apagado logo depois (`git status` limpo).
- As linhas `ln: …/.nvm/nvm.sh: File exists` na saída da task vêm do perfil do shell do humano.
  Não têm relação com a correção.
- `ps -o lstart` passou a sair em português (`Qua 11 Nov`): é o efeito previsto no plano §4.4
  (mensagens localizadas, como no Terminal.app).

### `2026-11-11` — passo 7 (commit)
- Fork `a3b85b03` `fix(cockpit): export a UTF-8 LANG to terminals when the app has no locale`,
  sobre `f52d54a8`. Revisão `reviewer` round 1 disparada no range `f52d54a8..a3b85b03`.

## Commits

- tower `15dd9b7` — docs(work): add task and approved plan for the Cockpit UTF-8 LANG fix
- tower `10a55d2` — docs(work): start the execution log for the Cockpit UTF-8 LANG fix
- fork `64265c7f` — fix(cockpit): export a UTF-8 LANG to terminals when the app has no locale

### `2026-11-11` — passo 7 (revisão)
- Round 1 (`f52d54a8..a3b85b03`): 0 Important, 2 Nit. Nit 1 corrigido de passagem e incorporado
  ao commit (amend, sem push ainda): agora `64265c7f`. A build testada no app é anterior a essa
  correção, que só muda locales com script (o `pt-BR` dá o mesmo resultado). Teste do helper
  depois: `00:00 +11: All tests passed!`; analyze dos arquivos tocados: `No issues found!`.
- Pelas regras, sem Important corrigido não há round 2.

### `2026-11-11` — passos 8 e 9
- O humano aprovou a correção e o texto da issue e do PR.
- Issue publicada: https://github.com/jacobaraujo7/remote_pi/issues/320
- Push de `fix/cockpit-pty-utf8-locale` (`64265c7f`) para o fork e PR aberto para
  `jacobaraujo7/remote_pi:main`: https://github.com/jacobaraujo7/remote_pi/pull/321
  (`Fixes #320`, seção Testing com os bytes do clipboard e a nota sobre CLIs traduzidas).
- Pendente: merge upstream. A task fica `open` até lá.

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
- [x] Verificação no app (plano §4.4), PID 36789, `App` shasum `27cef801` (igual ao `macos-next`):
  ```
  LANG=pt_BR.UTF-8 LC_ALL= LC_CTYPE=
  locale → LANG="pt_BR.UTF-8", LC_CTYPE="pt_BR.UTF-8" (stderr vazio)
  printf 'seção' | pbcopy → 00000000: 7365 c3a7 c3a3 6f0a
  task json:lang-check (printenv LANG) → pt_BR.UTF-8
  ```
  Antes, na build antiga (`5d496a7d`), o mesmo `pbcopy` deu `7365 e288 9ac3 9fe2 889a c2a3 6f0a`.
- [ ] Cópia pelo Claude Code colando `seção` — ⚠ unverified: o humano aprovou o trabalho sem confirmar esse teste de forma explícita. O `pbcopy` que o Claude Code usa foi verificado por bytes.

## Agent review

Tier `medium`.

| Round | Range reviewed | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `f52d54a8..a3b85b03` | 0 | 2 | 0 |

### Findings and outcome

| # | Round | Tag | `file:line` | Outcome | Promoted to |
|---|---|---|---|---|---|
| 1 | 1 | Nit | `cockpit/lib/app/cockpit/data/terminal/terminal_locale_env.dart:32-35` — `zh-Hans-CN` virava `zh_Hans_CN` e caía em `en_US` | fixed (script de 4 letras descartado; teste novo) | — |
| 2 | 1 | Nit | `cockpit/test/data/terminal_locale_env_test.dart:1-49` — nenhum teste prova que os três pontos chamam o helper; "a validação manual não passa pelo sidecar" | nit-ignored: o `_terminalEnv` é privado, e um teste de contrato por gateway exigiria um seam novo. A premissa do sidecar está errada: o terminal verificado nasce do `cockpit-server` (`ps`: zsh → claude → zsh → `cockpit-server` → `Cockpit`), então o caminho do sidecar foi o testado no app. Fica como sugestão no PR, se o mantenedor quiser. | — |

## Wiki pages affected

- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (UPDATE) — incluir a contribuição e
  a nota de que o Cockpit aberto pelo Dock não herda locale.

## Open notes

—
