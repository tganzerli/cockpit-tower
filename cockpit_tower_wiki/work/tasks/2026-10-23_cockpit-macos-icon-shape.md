---
title: 2026-10-23 — Ícone do Cockpit no formato padrão do macOS
type: task
work_id: 2026-10-23_cockpit-macos-icon-shape
scope:
  area: [upstream-cockpit]
status: done
updated: 2026-10-25
summary: Trazer o ícone do Cockpit no macOS para o formato padrão da Apple (squircle com margem e sombra), sem mudar o ícone do iOS/Android, e contribuir a mudança no remote_pi.
topic: []
related:
  - work/tasks/2026-10-23_cockpit-editor-soft-wrap
---

# Ícone do Cockpit no formato padrão do macOS

> **Human-authored.** Pedido do dono em 2026-10-23 («o ícone está me incomodando muito aqui no mac, ele não está seguindo o padrão arredondado … vamos melhorar isso e trazer para o padrão da Apple?»), com captura do Dock.

## Context

No Dock, o Cockpit é o único ícone quadrado e sem margem: um quadrado preto de canto a canto com o π e o ponto azul. Os outros apps seguem o modelo da Apple desde o Big Sur (forma de "squircle", com margem em volta e uma sombra leve), então o Cockpit parece maior e fora do lugar.

O que já se sabe (`remote_pi`, upstream `7d923ab`):
- O ícone do macOS são PNGs em `cockpit/macos/Runner/Assets.xcassets/AppIcon.appiconset/` (`app_icon_16.png` … `app_icon_1024.png`), 1024×1024 sem canal alfa, arte de canto a canto. Último commit nesses arquivos: `a5e65efd`.
- O mesmo `app_icon_1024.png` é a fonte do ícone do iOS e do Android: `flutter_launcher_icons.image_path` em `cockpit/pubspec.yaml:274-278`. Lá a arte de canto a canto é a certa, porque o iOS e o Android aplicam a própria máscara.
- Não há arquivo vetorial do ícone no repositório; existe `cockpit/assets/branding/cockpit_logo.png`.

Como no soft wrap ([[work/tasks/2026-10-23_cockpit-editor-soft-wrap]]), a ideia é chegar com a solução pronta: issue e PR no `jacobaraujo7/remote_pi`, feitos no fork `~/app/remote_pi`.

## Acceptance criteria

- [ ] No Dock e no Finder do macOS, o ícone do Cockpit tem o formato e o tamanho dos ícones da Apple (squircle com margem e sombra), nos tamanhos de 16 a 1024.
- [ ] O π e o ponto azul ficam iguais (mesma arte, mesmas cores e proporções).
- [ ] O ícone do iOS e do Android continua o mesmo (a fonte do `flutter_launcher_icons` segue de canto a canto).
- [ ] O ícone do Windows não muda.
- [ ] Issue aberta e PR pronto no `remote_pi`, publicados só com o OK do dono.

## Declared scope

**Area(s) affected:** `[upstream-cockpit]`

## Constraints / discipline

- Código e PR upstream em inglês; publicar issue e PR só com o OK do dono no momento.
- Não abrir o Cockpit pelo Bash do Claude; testar a build trocando com `~/app/remote_pi/.fork-tools/cockpit-switch.sh` no Terminal.app.

## Desfecho

2026-10-25: PR #263 mergeado por `jacobaraujo7` (merge `6321d5d`); a issue #262 fechou junto.
