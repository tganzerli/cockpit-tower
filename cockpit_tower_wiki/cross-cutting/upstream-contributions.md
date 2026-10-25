---
title: Como contribuir com o remote_pi (o Cockpit) a partir do tower
type: page
scope:
  area: [upstream-cockpit]
status: draft
updated: 2026-10-25
summary: Fluxo, toolchain, build ad-hoc e uso diário do fork tganzerli/remote_pi (clone ~/app/remote_pi) para mandar issues e PRs ao jacobaraujo7/remote_pi, mais as contribuições já abertas.
sources: []
code_refs:
  - cockpit_tower_wiki/board.kanban
related:
  - sources/external/2026-10-23_cockpit-code-editor
  - work/executions/2026-10-23_cockpit-editor-soft-wrap
  - work/executions/2026-10-23_cockpit-macos-icon-shape
---

# Como contribuir com o remote_pi (o Cockpit) a partir do tower

## Resumo

O Cockpit é o `remote_pi` de `jacobaraujo7`. O código dele **não** vive no tower: muda-se no fork, e o tower guarda só o trio (tarefa, plano, execução) e o conhecimento, na área `upstream-cockpit`. Esta página é o procedimento; os fatos de cada contribuição ficam nas execuções.

## Onde fica cada coisa

- **Código:** fork `tganzerli/remote_pi`, clone em `~/app/remote_pi`, com `origin` = fork e `upstream` = `jacobaraujo7/remote_pi` (`cockpit_tower_wiki/board.kanban:29`). O app Flutter fica em `cockpit/`.
- **Trio e wiki:** neste repositório, área `upstream-cockpit` (`cockpit_tower_wiki/work/executions/2026-10-23_cockpit-editor-soft-wrap.md:25-27`).
- **Cartões:** a etiqueta `cockpit-fork` marca o trabalho cujo código fica no fork (`cockpit_tower_wiki/board.kanban:21`).
- **O editor de arquivos do Cockpit** está destilado em [[sources/external/2026-10-23_cockpit-code-editor]].

## Fluxo

1. **Trio no tower**, num worktree próprio, a partir da `dev`.
2. **Ler `remote_pi:plan/00-decisions.md`** para ver se alguma decisão conflita (`cockpit_tower_wiki/work/executions/2026-10-23_cockpit-editor-soft-wrap.md:52-54`).
3. **Branch a partir de `upstream/main`:** `git fetch upstream` e `git checkout -b feat/<slug> upstream/main` (`…soft-wrap.md:55-56`).
4. **Issue antes do PR.** O dono aprova o texto na conversa e só então a issue é publicada (`…soft-wrap.md:58-61`).
5. **Código e testes**, na cópia de teste (seção seguinte).
6. **Revisão de agente** (seção "Revisão do agente" do log).
7. **Teste de usabilidade do dono com uma build release** do fork, antes do PR. No soft wrap ele trouxe duas mudanças: a opção em Settings e o ⌥Z por tipo de arquivo (`…soft-wrap.md:166-168`, `:317-318`).
8. **Texto do PR revisado pelo dono** ("pode abrir"). Antes de abrir: conferir se a `upstream/main` andou (`git merge-tree`) e se os commits não têm trailer de IA (`…soft-wrap.md:364-372`).
9. **PR** com `Closes #<issue>`.

Regras de texto:

- Issue, PR e commits em **inglês**, sem `Co-Authored-By` nem rodapé de IA (`CLAUDE.md`).
- Os comentários de código seguem o repositório: no `remote_pi` são em pt-BR (`remote_pi:cockpit/lib/app/core/data/setup/storage_location.dart:8-11`).

## Toolchain

- **Flutter via fvm**, `3.50.0-0.1.pre` (`remote_pi:.fvmrc:2`): `fvm flutter test`, `fvm flutter analyze`. ⚠ unverified que seja "a versão do CI": o `cockpit-server-release.yml` usa a mesma, mas o `app-release.yml` fixa `3.44.4`.
- **Zig 0.16 e rustup** são keg-only no Homebrew (o `zig` do brew é o 0.17) e entram no PATH **só no comando**, com `/opt/homebrew/opt/{rustup,zig@0.16}/bin`; o `~/.zshrc` não muda. Depois: `rustup default stable` e `rustup target add aarch64-unknown-linux-gnu` (`…soft-wrap.md:190-193`).
- **Cópia de teste `~/cpt`:** espelho de `~/app/remote_pi/cockpit` por `rsync`, com o libghostty em `source: prebuilt` no `pubspec.yaml` da cópia (`…soft-wrap.md:64-66`). O `prebuilt` baixa uma dylib que não exporta `ghostty_terminal_compression_activity` (`remote_pi:cockpit/pubspec.yaml:25-29`), então alguns testes de terminal já falham.
- **Baseline `~/cpb`:** `upstream/main` por `git archive`, com a mesma troca. Rode a suíte inteira nas duas e compare (`…soft-wrap.md:140-146`).
  - A saída `-r expanded` intercala linhas, porque os arquivos rodam em paralelo; para decidir, compare **por arquivo** (`…soft-wrap.md:336-344`).
  - Arquivos com falhas conhecidas: `terminal_controller_test`, `ghostty_presentation_visibility_test`, `otlp_and_config_test`, `mongo_socks_support_test`.
- **`fvm flutter analyze lib test`:** baseline de 39 issues, só `info`. O PR não pode aumentar a contagem (`…soft-wrap.md:138-139`).
- **Formatação:** só nos arquivos tocados. Um `dart format` de pasta reformatou arquivos fora do trabalho (`…soft-wrap.md:133-135`).

## Compilar o app

- `fvm flutter build macos` **falha**: o projeto assina com o certificado do mantenedor (`…soft-wrap.md:194-195`).
- **Contorno, sem tocar no projeto**, em `cockpit/macos`:

  ```
  xcodebuild -workspace Runner.xcworkspace -scheme Runner -configuration Release \
    -derivedDataPath ../build/macos-next CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build
  ```

  Antes, para Release: `fvm flutter build macos --release --config-only` e `pod install`. Depois, reverter o `cockpit/macos/Podfile.lock` com `git checkout` (`…soft-wrap.md:196-203`).
- **Debug isola, release não:**
  - Debug usa o bundle `work.jacobmoura.cockpit.debug` (`remote_pi:cockpit/macos/Runner/Configs/AppInfo.xcconfig:10-13`), a pasta de estado `cockpit-debug` (`remote_pi:cockpit/lib/app/core/data/setup/storage_location.dart:12`) e sockets com `-debug` (`remote_pi:cockpit/lib/app/cockpit/data/hooks/terminal_status_server_impl.dart:38`).
  - Release usa o bundle de produção e os **mesmos dados** do app oficial. O Sparkle só fica ativo em release (`remote_pi:cockpit/lib/app/cockpit/cockpit_module.dart:367`): uma release oficial nova pode substituir o fork.
- O app de debug aberto com `open` ficou uma vez vivo sem janela (causa não confirmada). Rodar o binário direto dá o log (`…soft-wrap.md:435-438`).

## Usar a build do fork no dia a dia

Regras aprendidas num incidente (`…soft-wrap.md:441-451`):

- **Só um Cockpit por vez.** O mais novo encerra o servidor do outro (`remote_pi:cockpit/lib/app/cockpit/data/terminal/sidecar/sidecar_terminal_connector.dart:95-103`), e os terminais do outro morrem, inclusive a sessão do agente.
- **Nunca abrir o Cockpit pelo Bash do Claude.** O app herda `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION` etc., o servidor repassa o ambiente aos terminais (`sidecar_terminal_connector.dart:131-132`), e todo `claude` aberto lá para de salvar o histórico (`cockpit_tower_wiki/board.kanban:30`).
- **`~/app/remote_pi/.fork-tools/cockpit-switch.sh status|fork|oficial|atualizar`**, rodado no Terminal.app. ⚠ O script não é versionado; as linhas abaixo são do arquivo local.
  - Detecta os apps com `ps`, não com `pgrep`, que esconde os ancestrais de quem chama (`cockpit-switch.sh:15-16`).
  - Abre com `open`, que dá o ambiente limpo do LaunchServices (`cockpit-switch.sh:38-40`).
  - Recusa rodar de dentro de um terminal do Cockpit (`COCKPIT_TAB_ID`) e com algum Cockpit aberto (`cockpit-switch.sh:30-35`, `:42-47`).
  - `atualizar` copia `build/macos-next` por cima da build do fork (`cockpit-switch.sh:48-49`).
- **Atualizar o fork:** compilar em `cockpit/build/macos-next` com o app aberto (a build em uso fica intacta). Depois: ⌘Q (encerra os terminais e as sessões de agente dele), no Terminal.app `cockpit-switch.sh atualizar && cockpit-switch.sh fork`, e `claude --resume` nas sessões que quiser continuar.

## Contribuições até agora

| Issue / PR | Assunto | Estado em 2026-10-25 | Execução |
|---|---|---|---|
| #261 / #264 | Soft wrap no editor, ligado por padrão em Markdown | Mergeado em 2026-10-25 (`8138e03`) | [[work/executions/2026-10-23_cockpit-editor-soft-wrap]] |
| #262 / #263 | Ícone do macOS no formato da grade da Apple | Mergeado em 2026-10-25 (`6321d5d`) | [[work/executions/2026-10-23_cockpit-macos-icon-shape]] |

## Pendências

- Acompanhamentos do soft wrap no quadro: k11 (coluna escorrega sem quebra, oferecido no #264, que foi mergeado sem resposta; decisão do dono) e k12 (adiar a remedição ao arrastar a divisória).
- k21: fechar uma aba deixa o shell vivo. A causa provável está no cartão k21 do `cockpit_tower_wiki/board.kanban`; falta abrir a issue no `remote_pi`.
- k5: pedir ao mantenedor o id da aba no `pty.sessions`, para trocar o casamento por ordem e pasta; falta abrir a issue ou o PR.
