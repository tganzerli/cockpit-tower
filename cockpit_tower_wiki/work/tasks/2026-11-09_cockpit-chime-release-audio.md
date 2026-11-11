---
title: 2026-11-09 — Cockpit larga a saída de áudio depois do chime, contribuição upstream
type: task
work_id: 2026-11-09_cockpit-chime-release-audio
scope:
  area: [upstream-cockpit]
status: done
updated: 2026-11-11
summary: Fazer o Cockpit fechar a saída CoreAudio quando o chime termina, em vez de mantê-la aberta até sair do app; corrigir no fork e propor upstream (issue + PR).
topic: [performance]
related:
  - work/tasks/2026-10-23_cockpit-editor-soft-wrap
---

# Cockpit larga a saída de áudio depois do chime, contribuição upstream

## Contexto

O plano de medição de bateria de outra sessão (2026-11-09) concluiu que o Cockpit mantém um
contexto de áudio aberto mesmo sem tocar som, e que isso faz o `coreaudiod` trabalhar. Por isso
a bateria teria de rodar com o Cockpit fechado. O humano quer corrigir o Cockpit.

A causa provável está no código (conferida em `upstream/main` `8fe92dc2`):
- O chime de turno usa um `Player` do media_kit criado no boot e reusado a cada toque
  (`remote_pi:cockpit/lib/app/cockpit/data/notifications/local_notifier.dart:28-36`). Cada
  toque só faz `open(Media(...))` (`:103-131`). Nada para o player depois do som.
- O media_kit inicia o mpv com `idle=yes`, `pause=yes` e `keep-open=yes`
  (`media_kit:lib/src/player/native/player/real.dart:2398-2401`, ref `44ba261`, a que o
  `pubspec.yaml` do Cockpit pina). Com `keep-open`, ao fim do arquivo o mpv fica com ele
  carregado, parado no último quadro, e a saída de áudio (AO CoreAudio) continua aberta.
- Portanto, antes do primeiro chime não há contexto de áudio; depois dele, o contexto fica
  aberto até o app sair.
- O preview de som nas Configurações tem o mesmo padrão enquanto a página está aberta
  (`remote_pi:cockpit/lib/app/settings/ui/settings_page.dart:1663-1684`).

⚠ unverified: que o AO parado no fim do arquivo mantém trabalho no `coreaudiod`, e que o
`stop` do mpv (modo idle) o libera. A execução mede isso antes e depois.

Não há issue nem PR sobre isso no `jacobaraujo7/remote_pi` (busca de 2026-11-09 por audio,
chime, coreaudio, mpv, battery, keep-open).

O fork `tganzerli/remote_pi` (`~/app/remote_pi`) foi sincronizado com o upstream em
2026-11-09: fast-forward de `f74845e9` para `8fe92dc2`, com push para `origin/main`.

## Critérios de aceite

- [x] Medição antes da correção, no build atual: depois de um chime, o Cockpit ocioso mantém a
      saída de áudio aberta (evidência na execução).
- [x] Depois da correção: quando o chime termina, a saída de áudio é liberada e o Cockpit
      ocioso não mantém contexto de áudio (mesma medição, evidência na execução).
- [x] Chimes seguidos continuam tocando, e o override de som customizado e o volume seguem
      funcionando. (Custom não testado à mão; mesmo caminho de código.)
- [x] O preview das Configurações também libera o áudio ao terminar.
- [x] `fvm flutter analyze` sem issues novas em relação à baseline e testes existentes passando,
      com a saída na execução.
- [x] Issue aberta no `jacobaraujo7/remote_pi` com o problema, a causa e a medição.
- [x] PR aberto do fork para `jacobaraujo7/remote_pi:main`, em inglês, citando a issue.

## Escopo declarado

**Área(s) afetada(s):** `[upstream-cockpit]` (nenhuma área do tower: `src/`, `web/`, `bin/` e
`panel/` não mudam).

## Restrições

- Não mudar configurações globais do media_kit nem do player de mídia do viewer
  (`media_view.dart`): o conserto fica restrito ao chime e ao preview.
- Seguir as convenções do `remote_pi` (`cockpit/CLAUDE.md`).
- Issue e PR públicos só saem com aprovação do humano no momento.
- Sem trailer de IA nos commits.

## Sucesso

Rodar a bateria com o Cockpit aberto, e o PR aceito upstream.

## Desfecho

2026-11-11: PR #315 mergeado por `jacobaraujo7` às 12:31 UTC (merge `0cfd32b`); a issue #314 fechou junto. A falha de CI no PR vinha de um teste do `main` (`onEditSource`), consertado pelo mantenedor no #317. A corrida estreita do `stop()` foi aceita para um chime de melhor esforço.
