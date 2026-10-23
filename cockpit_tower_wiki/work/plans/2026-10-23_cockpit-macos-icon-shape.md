---
title: 2026-10-23 — Ícone do Cockpit no formato padrão do macOS
type: plan
work_id: 2026-10-23_cockpit-macos-icon-shape
scope:
  area: [upstream-cockpit]
status: executed
risk: low
updated: 2026-10-23
summary: Gerar o ícone do macOS na grade da Apple (corpo 824 px com cantos contínuos e sombra numa tela de 1024 px) a partir da arte atual, apontar o flutter_launcher_icons para a cópia de canto a canto do iOS e contribuir via issue + PR no remote_pi.
topic: []
related:
  - work/tasks/2026-10-23_cockpit-macos-icon-shape
---

# Plano — Ícone do Cockpit no formato padrão do macOS

> Cobre [[work/tasks/2026-10-23_cockpit-macos-icon-shape]]. **Aprovado pelo dono em 2026-10-23 («aprovado.»), junto com a prévia do visual.**

## §4.0. Análises prévias

analyses: not needed — mudança de assets em um único lugar, levantada direto no fork (`~/app/remote_pi`, base `7d923ab`):

- `cockpit/macos/Runner/Assets.xcassets/AppIcon.appiconset/`: 7 PNGs (16, 32, 64, 128, 256, 512, 1024), sem alfa, arte de canto a canto; `Contents.json` mapeia os tamanhos 1x/2x do `idiom: mac`.
- `cockpit/pubspec.yaml:274-278`: `flutter_launcher_icons` (só `ios` e `android`) lê `image_path: "macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_1024.png"`, com `remove_alpha_ios: true`.
- `cockpit/ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png` é **idêntico pixel a pixel** ao `app_icon_1024.png` do macOS (`compare -metric AE` → `0`).
- Windows usa `cockpit/windows/runner/resources/app_icon.ico`, separado.
- Sem fonte vetorial; a arte de partida é o PNG de 1024.

Prévia gerada fora do repositório (atual × proposto, sobre fundo neutro) e mostrada ao dono antes da aprovação.

## §4.1. Resumo e entendimento

O ícone do macOS é a arte do iOS (quadrado de canto a canto), que o macOS não recorta. Desde o Big Sur o app entrega o ícone já no formato: um corpo de 824×824 px centrado numa tela transparente de 1024×1024, com cantos contínuos (squircle) e uma sombra leve. A correção é gerar os 7 PNGs do macOS nesse formato a partir da arte atual (mesmo π, mesmo ponto azul), sem mexer no iOS, no Android e no Windows.

## §4.2. Arquivos afetados (no fork `~/app/remote_pi`)

- `cockpit/macos/Runner/Assets.xcassets/AppIcon.appiconset/app_icon_{16,32,64,128,256,512,1024}.png` (UPDATE) — regerados na grade da Apple, com alfa.
- `cockpit/pubspec.yaml` (UPDATE) — `flutter_launcher_icons.image_path` passa para a cópia de canto a canto do iOS (`ios/Runner/Assets.xcassets/AppIcon.appiconset/Icon-App-1024x1024@1x.png`), com o comentário ajustado. A saída do iOS/Android fica igual.
- `cockpit/tool/macos_app_icon.py` (CREATE) — o gerador (Python + Pillow), para o mantenedor regerar se a arte mudar.
- Tower: este trio, cartão no `board.kanban`.

## §4.3. Mudanças e justificativa

Gerador (`cockpit/tool/macos_app_icon.py <arte 1024 de canto a canto> <pasta do appiconset>`):
- redimensiona a arte para 824×824 e recorta com uma superelipse (`|x|^5 + |y|^5 = 1`, supersampling 4×), que aproxima os cantos contínuos da Apple;
- centra numa tela transparente de 1024×1024 (margem de 100 px);
- sombra: o mesmo recorte em preto a 30 %, deslocado 10 px para baixo, desfoque gaussiano de 10 px;
- gera os tamanhos menores do 1024 (Lanczos).

Por que apontar o `flutter_launcher_icons` para o iOS: o iOS e o Android precisam da arte de canto a canto (aplicam a própria máscara, e a App Store recusa alfa). O PNG do iOS já é essa arte, idêntico ao atual; trocar o caminho mantém o resultado sem criar um arquivo novo.

## §4.4. Riscos e impacto

1. **Ícone menor ou maior que os da Apple no Dock.** Mitigação: grade 824/1024 do modelo da Apple; conferir no Dock ao lado dos ícones do sistema, com a build do fork.
2. **Mudar o ícone do iOS/Android sem querer.** Mitigação: rodar `dart run flutter_launcher_icons` depois da troca do caminho e confirmar `git status` limpo em `ios/` e `android/`.
3. **Cache de ícones do macOS** mostrando o antigo. Só local: some ao reabrir o app (ou `killall Dock`).
4. **macOS 26 (Tahoe)** passa a preferir ícones do Icon Composer (camadas, "Liquid Glass"). Fora do escopo; o PNG no formato da grade continua sendo aceito. Fica como nota no PR.

**Risk tier:** `low` — só assets e um comentário de configuração; nenhum código do app.

**Verification:**
- `sips -g pixelWidth -g hasAlpha` nos 7 PNGs: tamanhos certos, `hasAlpha: yes`.
- `dart run flutter_launcher_icons` (via `fvm`) → `git status` sem mudança em `ios/` e `android/`.
- Build release do fork (ad-hoc), aberta com `cockpit-switch.sh fork` no Terminal.app: o dono confere no Dock e no Finder.

**Revert:** reverter o commit no fork (ou fechar o PR).

## §4.5. Passos de execução

- [ ] (1) Branch `feat/cockpit-macos-icon-shape` no fork, a partir do `upstream/main`.
- [ ] (2) Gerador em `cockpit/tool/macos_app_icon.py`; gerar os 7 PNGs.
- [ ] (3) Trocar o `image_path` do `flutter_launcher_icons`; rodar e confirmar iOS/Android sem mudança.
- [ ] (4) Revisão do agente (tier `low`: pulada, registrada).
- [ ] (5) Build release do fork com o ícone novo (junto com o soft wrap, numa branch local de teste que junta as duas) e conferência do dono no Dock.
- [ ] (6) Com o OK do dono: issue e PR no `jacobaraujo7/remote_pi` (inglês, sem trailer de IA).

## §4.6. Escopo

**Area(s) affected:** `[upstream-cockpit]`

## §4.7. Impacto no wiki

- Nenhuma página nova além do trio; o fechamento entra no `/wiki-sync` junto da página de contribuições upstream prevista no soft wrap (`cross-cutting/upstream-contributions.md`).
