---
title: 2026-10-23 — Quebra de linha (soft wrap) no editor do Cockpit, contribuição upstream
type: execution
work_id: 2026-10-23_cockpit-editor-soft-wrap
scope:
  area: [upstream-cockpit]
status: in_progress
updated: 2026-10-24
summary: Em andamento — modo de quebra de linha no CodeEditor do Cockpit, com issue e PR no remote_pi.
topic: [ui]
related: []
---

# Log de execução — 2026-10-23_cockpit-editor-soft-wrap

> **Log vivo.** Atualizado a cada passo concluído.

## Metadados

- **ID:** `2026-10-23_cockpit-editor-soft-wrap`
- **Task:** [[work/tasks/2026-10-23_cockpit-editor-soft-wrap]]
- **Plano:** [[work/plans/2026-10-23_cockpit-editor-soft-wrap]]
- **Status:** `in_progress`
- **Início:** `2026-10-23 10:05`
- **Fim:** `—`
- **Escopo:**
  - Área(s) afetada(s): `[upstream-cockpit]`
- **Repositório do código:** fork `tganzerli/remote_pi`, clone `~/app/remote_pi`, branch `feat/cockpit-editor-soft-wrap`.
  - Base: `upstream/main` @ `7d923ab05eb84f139e73c39701d45b4355fdd4a4`.

## Checklist (espelha o §4.5 do plano)

- [x] 1 — Branch do tower, este log, leitura do `plan/00-decisions.md` do `remote_pi`
- [x] 2 — Branch do fork a partir de `upstream/main`
- [x] 3 — Texto da issue mostrado ao humano; publicar com aprovação → [#261](https://github.com/jacobaraujo7/remote_pi/issues/261)
- [x] 4 — `editor_wrap_layout.dart` + teste
- [x] 5 — `code_editor.dart` + `editor_overview_ruler.dart`
- [x] 6 — `code_editor_soft_wrap_test.dart`
- [x] 7 — Preferência, ponte, acelerador, menu, `FileViewer`
- [x] 8 — i18n + `slang`
- [x] 9 — `dart format` + verificação do §4.4
- [x] 10 — Medir a abertura de um `.md` grande
- [x] 11 — Commits + revisão `reviewer`
- [ ] 12 — Gate humano; push + PR com aprovação — **em espera:** o humano decidiu testar a usabilidade com uma build de debug do fork antes do PR (de 1 a 2 dias, a partir de 2026-10-23)
- [ ] 13 — Fechar e propor `/wiki-sync`

## Atividade (cronológica)

### `2026-10-23 10:05` — passos 1 e 2
- Tower: branch `docs/2026-10-23_cockpit-editor-soft-wrap__wiki` criada a partir de `dev`.
  - O plano passou a `approved`, e a task a `in_progress`.
- `remote_pi:plan/00-decisions.md` (161 linhas): nenhuma decisão sobre o editor, a quebra de
  linha ou os atalhos. As decisões do Cockpit tratam do motor de agente (`:25-31`), da
  distribuição (`:150`) e dos updates (`:152`). Não há conflito.
- Fork: `git fetch upstream` e
  `git checkout -b feat/cockpit-editor-soft-wrap upstream/main` → `7d923ab`.

### `2026-10-23` — passo 3
- O humano aprovou o texto na conversa e a issue foi publicada:
  https://github.com/jacobaraujo7/remote_pi/issues/261, com o título
  `[cockpit] Soft wrap (word wrap) in the file editor, on by default for Markdown`.

### `2026-10-23` — cópia de teste
- Script `cpt-sync.sh`, no scratchpad da sessão e fora dos dois repositórios: espelha
  `~/app/remote_pi/cockpit` em `~/cpt/cockpit` com `rsync`. Na cópia, o `pubspec.yaml` usa o
  libghostty com `source: prebuilt`; o `pubspec.lock` da cópia é dela.
- Baseline na cópia: `fvm flutter test test/ui/code_editor_reveal_test.dart` → `00:00 +13: All tests passed!`.

### `2026-10-23` — passos 4 a 6
- **`editor_wrap_layout.dart`:** a tabela `EditorWrapLayout`, com `update`, `top`, `height`,
  `lineAtY`, `revision` e a constante `kEditorWrapCaretMargin = 3`.
  - O contador `revision` não estava no plano: o overview precisa saber quando repintar, porque
    a tabela é mutável. Ver divergências.
- **`editor_overview_ruler.dart`:**
  - Ganhou o parâmetro opcional `EditorWrapLayout? wrap`, que chega aos helpers
    `overviewContentOffsetFor*` e `overviewRulerLineForDy` e ao painter (que repinta quando a
    `revision` muda).
  - Com `null`, as contas ficam iguais às de antes.
- **`code_editor.dart`:**
  - Novo parâmetro `wordWrap` (padrão `false`) e os helpers `_lineTop`, `_lineExtent`,
    `_lineAtY` e `_renderEditable`.
  - O reveal, o reveal de match (soma o y do caret dentro da linha quebrada), o hover, o overlay
    e o go-to-definition (`getPositionForPoint`) passaram a usar esses helpers.
  - `_keepTopLineOnWrapToggle` mantém a primeira linha visível quando o modo muda.
  - O `_editorScroll` foi reescrito com `field`, `gutter` e `body` extraídos. Sem quebra, a
    árvore é a mesma de antes.
  - Com quebra, um `LayoutBuilder` acima do Row mede a tabela antes do gutter, e a `Scrollbar`
    horizontal deixa de ser montada.
  - O pin horizontal não precisou de mudança: sem a rolagem horizontal, o `_horizontal` não tem
    clients e os guards que já existiam retornam cedo.
- **Testes:**
  - `test/ui/editor_wrap_layout_test.dart`: 4 testes.
  - `test/ui/code_editor_soft_wrap_test.dart`: 6 testes. Com quebra não há scrollable
    horizontal e a linha 3 desce mais de 4 linhas visuais; sem quebra continua o layout de
    código; o número e a marca Git da linha 3 alinham com o texto dela; os dois reveals deixam
    o alvo visível; alternar o modo em tempo de execução não lança.
- **O teste foi visto vermelho:** na cópia, voltei o gutter para `itemExtent: _lineHeight` fixo
  e o teste de alinhamento falhou (`Actual: <40.0>`). Depois a cópia foi restaurada.
- **Testes do editor que já existiam**, na cópia:
  `fvm flutter test test/ui/editor_wrap_layout_test.dart test/ui/code_editor_reveal_test.dart test/ui/code_editor_selection_scroll_test.dart test/ui/code_editor_bottom_scroll_test.dart test/ui/code_editor_tab_indent_test.dart test/ui/code_editor_comment_chord_test.dart test/ui/file_viewer_session_test.dart` → `00:05 +28: All tests passed!`
- **Testes novos:** `fvm flutter test test/ui/code_editor_soft_wrap_test.dart` → `00:00 +6: All tests passed!`

### `2026-10-23` — passos 7 e 8
- **`AppSettings.editorWordWrap` (`bool?`):**
  - É salva como `'editor.wordWrap'` só depois que o usuário escolhe.
  - O `copyWith` ganhou `editorWordWrap` e `clearEditorWordWrap`, e o `SettingsController`
    ganhou `setEditorWordWrap`.
- **`MenuAccelerator`:** aceita `alt` e `primary`.
- **`EditorMenuBridge`:** `publish` recebe um `onToggleWordWrap` opcional, e a capacidade
  `canToggleWordWrap` vale exatamente quando ele foi passado. O `.http` e o `.dbq` não mudaram e
  ficam com o item desabilitado.
- **Menu View:** "Toggle Word Wrap" antes do zoom, com `MenuAccelerator(keyZ, alt: true, primary: false)`
  e `shortcutHandledExternally: true`.
- **`FileViewer`:**
  - `_wordWrapFor(chosen)` usa a escolha do usuário ou o padrão
    `{'markdown','md','txt','text'}`; `_toggleWordWrap()` grava o oposto do valor que está
    valendo.
  - ⌥Z fica no `CallbackShortcuts` local, `wordWrap` é passado ao `CodeEditor` via
    `context.select`, e a ponte recebe `onToggleWordWrap`.
- **i18n:** `core.menu.toggleWordWrap` em en ("Toggle Word Wrap"), pt-BR ("Alternar Quebra de
  Linha") e es ("Alternar Ajuste de Línea"). Rodei `fvm dart run slang`, que imprimiu
  `Translations generated successfully. (0.094 seconds)`, e o `git diff --stat -- cockpit/lib/i18n`
  mostrou 7 arquivos: as 3 traduções e os 4 `.g.dart` (o `strings.g.dart` só mudou o cabeçalho
  de contagem e data).
- **Testes novos:**
  - `test/domain/app_settings_editor_word_wrap_test.dart` (4): padrão `null`, ida e volta pelo
    JSON, chave omitida até a escolha, `copyWith`/`clear`.
  - Dois casos no `test/ui/app_menu_new_terminal_accelerator_test.dart`:
    - o ⌥Z resolve com `alt` e sem `meta`/`control`, e não entra em `menuShortcuts`;
    - o item só fica habilitado com uma publicação que traz `onToggleWordWrap`.
  - Resultado: `fvm flutter test test/domain/app_settings_editor_word_wrap_test.dart test/ui/app_menu_new_terminal_accelerator_test.dart`
    → `00:01 +9: All tests passed!`
- **Correção no caminho:** o `dart format lib/app/core` reformatou também o
  `lib/app/core/terminal/terminal_find.dart`, que não faz parte do trabalho. Desfiz com
  `git checkout`.

### `2026-10-23` — passos 9 e 10
- **Análise completa:** `cd ~/app/remote_pi/cockpit && fvm flutter analyze` →
  `39 issues found. (ran in 3.9s)`. É a mesma contagem da baseline, sem `error` nem `warning`.
- **Suíte inteira na cópia:** `fvm flutter test` →
  `03:04 +1643 ~6 -18: Some tests failed.`
  - Para comparar, montei uma segunda cópia (`~/cpb`) com `upstream/main` pelo `git archive` e a
    mesma troca para `prebuilt`, e rodei as duas com `-r expanded`.
  - As listas de testes que falham são **idênticas**: `diff` → `SAME_FAILURES`. São 10 testes,
    em `test/core/terminal/terminal_controller_test.dart` e
    `test/ui/ghostty_presentation_visibility_test.dart`; a contagem de 18 inclui repetições.
  - Essas falhas já existem e vêm do binário pronto do libghostty. O comentário em
    `remote_pi:pubspec.yaml:25-29` avisa que a dylib do modo `prebuilt` não exporta
    `ghostty_terminal_compression_activity`, que os bindings chamam.
- **Medição** com um teste descartável, que não foi commitado, sobre o `cockpit/CHANGELOG.md`
  (2096 linhas), `fontSize: 13`, na fonte de teste:
  - 1ª versão, a 600 px: montar do zero `59 ms`, digitar com cache `0,6 ms`, mudar a largura
    `40 ms`.
  - Melhoria feita na hora: guardar a largura natural de cada linha, para que uma mudança de
    largura só remeça as linhas mais largas que a pane.
  - Depois dela, a 600 px: montar `72 ms`, digitar `0,3 ms`, mudar a largura `35,6 ms`.
  - A 1000 px (cerca de 77 caracteres por linha, como uma mono real a 600 px): montar `63,5 ms`,
    digitar `0,4 ms`, mudar a largura `25 ms`. O arquivo tem 349 linhas com mais de 77
    caracteres.
  - O "primeiro frame" do teste (`495 ms` sem quebra, `147 ms` com quebra) não serve como
    comparação, porque o primeiro teste paga o aquecimento.
- **Testes de quebra depois da melhoria:**
  `fvm flutter test test/ui/editor_wrap_layout_test.dart test/ui/code_editor_soft_wrap_test.dart`
  → `+13: All tests passed!` (contando a medição).

### `2026-10-23` — gate humano: teste de usabilidade antes do PR
- O humano adiou o PR: vai usar uma build de debug do fork por um ou dois dias e, se achar
  erros, eles são corrigidos antes do PR. O rascunho do PR está pronto, fora do repositório.
- **Isolamento da build de debug:** bundle `work.jacobmoura.cockpit.debug`
  (`remote_pi:macos/Runner/Configs/AppInfo.xcconfig:10-13`), estado em `cockpit-debug`
  (`remote_pi:lib/app/core/data/setup/storage_location.dart:12`) e sockets com sufixo `-debug`
  (`remote_pi:lib/app/cockpit/data/hooks/terminal_status_server_impl.dart:38`). A `--profile`
  e a `--release` usam o bundle de produção, então ficam de fora.
- **Ferramentas para compilar:** `zig@0.16` (o `zig` do brew é o 0.17) e `rustup`, com o target
  `aarch64-unknown-linux-gnu`.
- **Roteiro passado ao humano:**
  - `.md` abre quebrado e `.dart` abre sem quebra;
  - digitar até ganhar ou perder uma linha visual;
  - ⌥Z sem digitar "Ω" e o item do menu;
  - a escolha persiste;
  - ⌘F até o fim de um parágrafo;
  - as marcas do Git;
  - arrastar a divisória;
  - Alt+Z no terminal.

### `2026-10-23` — push para o fork e build de debug
- O humano aprovou os dois passos ("sim quero").
- `git push -u origin feat/cockpit-editor-soft-wrap` levou a branch ao fork `tganzerli/remote_pi`,
  sem PR.
- **Ferramentas:** `brew install zig@0.16 rustup`. As duas são keg-only e entram no PATH só
  nos comandos (`/opt/homebrew/opt/{rustup,zig@0.16}/bin`); o `~/.zshrc` não foi alterado.
  O `zig@0.16` trouxe o `llvm@21`, com 1,5 GB. Depois: `rustup default stable` (rustc 1.99.1) e
  `rustup target add aarch64-unknown-linux-gnu`.
- **1ª tentativa:** `fvm flutter build macos --debug` falhou com `No signing certificate "Developer ID Application" found ... team ID "U843T2P7A2"`.
  O projeto assina com o certificado do mantenedor.
- **Contorno, sem tocar no projeto:**
  `xcodebuild -workspace Runner.xcworkspace -scheme Runner -configuration Debug -derivedDataPath ../build/macos CODE_SIGN_IDENTITY=- CODE_SIGN_STYLE=Manual DEVELOPMENT_TEAM= PROVISIONING_PROFILE_SPECIFIER= build`
  → `** BUILD SUCCEEDED **`.
  - Os entitlements de Debug (`remote_pi:macos/Runner/DebugProfile.entitlements`) não exigem
    time nem perfil.
- **App conferido:** `CFBundleIdentifier` = `work.jacobmoura.cockpit.debug`, `Signature=adhoc`, e
  o processo ficou rodando (`pgrep`).
- O `pod install` da build alterou o `cockpit/macos/Podfile.lock`, e eu desfiz com `git checkout`.

## Commits

Fork `tganzerli/remote_pi`, branch `feat/cockpit-editor-soft-wrap`, base `7d923ab`:

- `2d8816db` feat(cockpit): optional soft wrap mode in the code editor
- `13b752d8` feat(cockpit): View > Toggle Word Wrap (Alt+Z), on by default for Markdown
- `55d9db49` fix(cockpit): measure wrapped lines with the field's effective style (correções da rodada 1)
- `ce25e4e0` fix(cockpit): repaint the overview ruler when the wrap table changes (Nit da rodada 2)
- `b95ce896` feat(cockpit): word wrap in Settings and in the Shortcuts list (pedido do dono no teste de usabilidade)

Os commits de correção ficam separados dos dois `feat` (§6.1 do branching): cada um é uma
unidade lógica com mensagem própria, não um WIP. Separar o `55d9db49` entre os dois `feat` exigiria
um rebase manual, sem ganho para quem revisa; o mantenedor pode fazer squash no merge.

### `2026-10-23` — rodada 2 e Nit
- A rodada 2 (`13b752d8..55d9db49`) não trouxe nenhum Important e confirmou as correções da
  rodada 1. Vieram 2 Nit.
- **Nit do overview:** as marcas ficavam um frame atrás. Corrigido em `ce25e4e0`:
  - `EditorWrapLayout` passou a ser um `ChangeNotifier` e notifica quando algum top muda.
  - O painter do overview usa `super(repaint: wrap)`.
  - O `CodeEditor` faz `_wrap.dispose()`.
- **Nit da posição do hover**, um frame atrás e só visual: nit-ignored.
- **Testes:**
  - Os do editor, de configuração e de menu → `00:06 +50: All tests passed!`
  - A suíte inteira, com o mesmo procedimento de comparação → `SAME_FAILURES`, para o
    `55d9db49` e para o `ce25e4e0`.
  - `fvm flutter analyze lib test` → `39 issues found`.

### `2026-10-23` — correções da rodada 1
- **Testes escritos antes da correção, contra o código antigo:**
  - "editar a linha até ela quebrar": falhou com `Actual: <40.0>`, porque o gutter não foi
    reconstruído.
  - "larguras de fronteira": falhou com `Actual: <20.0>` na linha 26. Esse **achado novo** não
    estava na revisão.
- **Causa do achado novo:** o `EditableText` recebe o estilo do tema mesclado por baixo do
  `codeStyle`. Um teste de diagnóstico mostrou `letterSpacing: 0.5` e um strut forçado
  (`DBG field=TextStyle(... letterSpacing: 0.5, ... height: 1.6x ...)`), enquanto o `codeStyle`
  não tem `letterSpacing`.
- **Correções:**
  - A tabela mede com o `style`/`strutStyle`/`textScaler` do `EditableText`, lidos pelo
    `_ensureWrap()`, que roda sob demanda no `itemExtentBuilder` do gutter, quando o campo já
    está montado.
  - O `textScaler` do `MediaQuery` é lido no `build`, porque no layout não se lê
    `InheritedWidget`.
  - `update` não faz nada quando texto, largura e estilo são os mesmos.
  - O `_onChanged` reconstrói quando o texto muda com a quebra ligada.
  - `lineAtY` devolve o nº de linhas para um y abaixo do conteúdo.
  - O padrão por linguagem virou a função `fileEditorWordWrap`, com teste.
  - O `clearEditorWordWrap` foi removido.
- **Testes novos:**
  - Alinhamento depois de editar o texto, nos dois sentidos.
  - Varredura de 14 larguras seguidas com linhas de 1 a 40 caracteres, conferindo todos os
    números do gutter.
  - Offsets do overview com a tabela.
  - Largura natural sem remedição e revisão estável.
  - `fileEditorWordWrap`.
- **Os testes foram vistos vermelhos, nas mutações feitas na cópia:**
  - (a) medir com o `codeStyle` → `+7 -1: Some tests failed.`;
  - (b) `kEditorWrapCaretMargin = 0` → `+7 -1: tabela de alturas quebra igual ao campo em larguras de fronteira [E]`.
  - Nos dois casos a cópia foi restaurada depois.
- **Resultados:**
  - `fvm flutter test test/ui/code_editor_soft_wrap_test.dart` → `00:01 +8: All tests passed!`
  - `fvm flutter analyze lib test` → `39 issues found`, sem error/warning.
- **Correção no caminho:** o `dart format test/` reformatou o `test/core/terminal/terminal_find_test.dart`,
  que não faz parte do trabalho, e eu desfiz. Daqui em diante, formatar só arquivos tocados.

## Divergências do plano

- **Configuração na tela e atalho na lista (2026-10-24), pedido do dono no teste de usabilidade.**
  O plano não previa nenhum dos dois. Ele achou a falta ao usar a build: a quebra não aparecia
  em Settings, e o ⌥Z não estava em Settings → Shortcuts.
  - O dono escolheu um seletor de 3 opções em General → Editor: "Markdown and text" (`null`),
    "All files" (`true`) e "Off" (`false`). Isso também conserta um furo do plano: depois do
    primeiro ⌥Z, a escolha virava explícita e não havia como voltar ao padrão por linguagem.
  - Por isso o `clearEditorWordWrap`, removido na rodada 1 por falta de uso, voltou ao `copyWith`.

- **Comentários do código em pt-BR.** O plano tinha os exemplos em inglês, mas o `remote_pi`
  comenta em pt-BR (por exemplo `code_editor.dart:29-48`), e o código novo segue o código ao
  redor. Commits, PR e identificadores continuam em inglês.
- **O overview recebe a própria tabela (`EditorWrapLayout? wrap`)**, e não uma função
  `lineTop` como no plano. Como a tabela é mutável, foi preciso um contador `revision` para o
  `shouldRepaint`; com a tabela, o tap no overview também resolve a linha por `lineAtY`.
- **A medição da tabela fica num `LayoutBuilder` acima do Row (gutter + campo)**, e não no
  `LayoutBuilder` do campo. O gutter faz layout antes do campo, então a tabela já precisa
  estar pronta quando ele começa; senão haveria um frame desalinhado a cada mudança de largura.
- **O menu desenhado do Windows/Linux não ganhou a dica do ⌥.** O plano previa, mas esse menu
  não desenha nenhum acelerador (achado da análise B), então não havia o que mudar.
- **A tabela também guarda a largura natural de cada linha**, o que não estava no plano. Foi a
  resposta à medição do passo 10: a mudança de largura caiu de 40 ms para 25–35 ms.
- **Faltam testes do `FileViewer`:** o padrão por linguagem e o ⌥Z do editor não têm teste de
  widget. Montar o `FileViewer` exige a VM e a sessão, e os testes existentes cobrem a
  preferência, a ponte e o menu. Fica registrado como lacuna no PR.
  - Na rodada 1, o padrão por linguagem ganhou teste pela função `fileEditorWordWrap`. A ligação
    do ⌥Z no `CallbackShortcuts` continua sem teste.
- **Sem o `assert` pós-frame do §4.4.** Comparar a altura da tabela com a extensão de scroll do
  campo dá falso positivo quando o conteúdo é menor que o viewport, e quebraria builds de debug
  dos mantenedores. A varredura de larguras de fronteira cumpre o papel de detector, e as
  mutações mostraram que ela pega o erro.
- **A tabela é medida sob demanda, no layout do gutter**, e não no `LayoutBuilder`. Isso
  substitui a divergência anterior: é a única forma de medir com o estilo efetivo do
  `EditableText` no mesmo frame.

### `2026-10-24` — teste de usabilidade e configuração na tela
- O dono usou a build release do fork no dia a dia e aprovou a quebra de linha. Achou dois
  pontos de atenção: a opção não estava em Settings, e o atalho não estava na página de atalhos.
- **Onde ficam:**
  - A página de atalhos lê um catálogo fixo, só para exibição
    (`remote_pi:cockpit/lib/app/settings/ui/shortcut_catalog.dart`). O comentário do arquivo
    diz que ele precisa ser atualizado à mão a cada atalho novo.
  - A seção Editor fica em General (`settings_page.dart`, `_GeneralPanel`, logo abaixo de
    "Engine").
- **Commit `b95ce896`:**
  - `_WordWrapDropdown` usa o `_DropdownChip` e o `showAppMenu`. O valor vai embrulhado num
    record `(bool?,)`, porque o `showAppMenu` devolve `null` quando o menu fecha sem escolha.
  - `setEditorWordWrap(bool?)`: o `null` limpa a escolha.
  - "Toggle Word Wrap" entra na seção Editor do catálogo.
  - Strings em en, pt-BR e es; `slang` → `Translations generated successfully.`
- **Testes:**
  - `copyWith(clearEditorWordWrap: true)`;
  - o controller grava `false` e depois volta ao padrão sem a chave `editor.wordWrap`;
  - o catálogo tem o atalho.
  - Mutação na cópia (o `null` deixa de limpar a escolha): o teste do controller falhou.
    Depois a cópia foi restaurada.
- **Resultados:**
  - `fvm flutter analyze lib test` → `39 issues found`, a mesma baseline.
  - Editor, configuração e menu → `00:03 +63: All tests passed!`
  - Suíte inteira: `+1653 ~6 -18` na branch e `+1627 ~6 -18` na `~/cpb` (`upstream/main`). A
    diferença de `+` é a dos testes novos.
    - A lista de nomes que falharam não sai confiável da saída `-r expanded`, porque os
      arquivos rodam em paralelo e as linhas se intercalam.
    - Conferi por arquivo: os quatro arquivos com falhas conhecidas (`terminal_controller`,
      `ghostty_presentation_visibility`, `otlp_and_config`, `mongo_socks_support`) dão
      `+9 -13` nas duas cópias.
    - Os três arquivos que o parser apontou só na branch passam quando rodam sozinhos (`+17`).
- O checkout do fork passou de `local/test-build` para `feat/cockpit-editor-soft-wrap`.

## Validações

- [x] **Análise estática:** `fvm flutter analyze` → `39 issues found`. É a baseline, só info,
      sem `error`/`warning`.
- [x] **Testes do §4.4**, na cópia com `source: prebuilt`:
  - os testes do editor que já existiam → `+28: All tests passed!`;
  - final, com o editor, a configuração e o menu juntos → `+50: All tests passed!`;
  - inclui `code_editor_soft_wrap_test` (8), `editor_wrap_layout_test` (7) e
    `file_editor_word_wrap_test` (2).
- [x] **Suíte inteira:** `+1643 ~6 -18` no `13b752d8`. Depois, `SAME_FAILURES` no `55d9db49` e
      no `ce25e4e0`: a lista de falhas é sempre a mesma do `upstream/main`.
- [x] **`fvm dart run slang`** → `Translations generated successfully.`
- [x] **Verificação do §4.4 do plano:** os itens 1 a 3 acima.
- [ ] **Teste manual no app:** não feito. Sem Rust e Zig não dá para compilar o app.

## Revisão do agente

Tier `medium`.

| Rodada | Range revisado | Important | Nit | Pre-existing |
|---|---|---|---|---|
| 1 | `7d923ab..13b752d8` (diff completo) | 2 | 2 | 0 |
| 2 | `13b752d8..55d9db49` | 0 | 2 | 0 |
| 3 | `ce25e4e0..b95ce896` | 0 | 1 | 0 |

### Achados e desfecho

| # | Rodada | Tag | `file:line` | Desfecho | Promovido para |
|---|---|---|---|---|---|
| 1 | 1 | Important | `code_editor.dart:709-727` (`_onChanged`), editar sem `\n` não reconstruía o gutter | fixed (`55d9db49`), com teste visto vermelho | — |
| 2 | 1 | Important | `code_editor_soft_wrap_test.dart:106-123`, teste fraco na fronteira, faltam testes, `assert` ausente | fixed em parte (`55d9db49`): varredura de larguras, teste de edição, overview, `fileEditorWordWrap`. **wrong** em parte: a ponte e a persistência já tinham teste (`app_menu_new_terminal_accelerator_test.dart`, `app_settings_editor_word_wrap_test.dart`). O `assert` saiu de propósito (ver divergências). | — |
| 3 | 1 | Nit | `code_editor.dart:~490`, hover abaixo do conteúdo | fixed (`lineAtY` devolve o nº de linhas) | — |
| 4 | 1 | Nit | `code_editor.dart:1010-1025` / `app_settings.dart:274-277`, split a cada build e `clearEditorWordWrap` sem uso | fixed (`update` sem trabalho quando nada mudou; o flag foi removido) | — |
| 6 | 2 | Nit | `code_editor.dart:1179` / `editor_overview_ruler.dart`, a revisão era capturada no build, um frame atrás | fixed (`ce25e4e0`, `repaint: wrap`) | — |
| 7 | 2 | Nit | `code_editor.dart:960`, `_hoverOverlay` lia a tabela no build | nit-ignored (um frame, só visual, some ao mover o mouse) | — |
| 8 | 3 | Nit | `settings_page.dart:1259`, o `_WordWrapDropdown` não tem teste de widget (record, `selected:`, `picked != null`) | nit-ignored: o revisor conferiu a lógica na leitura; montar a `SettingsPage` exige os providers da tela inteira; fica como lacuna no PR | — |
| 5 | 1 | (achado do autor) | `editor_wrap_layout.dart`, a tabela media com o `codeStyle` e não com o estilo efetivo do campo | fixed (`55d9db49`), com teste visto vermelho | — |

## Páginas da wiki afetadas

- `cockpit_tower_wiki/sources/external/2026-10-23_cockpit-code-editor.md` (CREATE): o editor
  do Cockpit, com a geometria das linhas, o modo de quebra, os atalhos e a ponte do menu.
- `cockpit_tower_wiki/sources/external/_index.md` (UPDATE, gerado por `/wiki-index`).
- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (CREATE): como contribuir com o
  `remote_pi` a partir do tower.
- `cockpit_tower_wiki/overview.md` (UPDATE): a área `upstream-cockpit` aponta a página de
  contribuições.

## Notas abertas

- **Bug que já existia, achado aqui e não corrigido (fora do escopo):**
  - Sem quebra, o hover do go-to-definition (`code_editor.dart`, `_updateDefinitionHoverRange`)
    converte x em coluna com um `TextPainter` no `codeStyle`. O campo usa o mesmo estilo com
    `letterSpacing: 0.5` do tema, então o erro cresce 0,5 px por coluna: na coluna 80 são uns
    40 px, cerca de 3 caracteres.
  - O mesmo vale para a coluna do match no `_revealMatch` sem quebra.
  - Entra no PR como observação; corrigir pede o mesmo truque do estilo efetivo.
- **Arrastar a divisória com quebra ligada:** no `CHANGELOG.md` de 2096 linhas, cada largura
  nova custa cerca de 25 ms. Um próximo passo seria adiar a medição durante o arraste.
- **⌥Z no macOS:** falta testar à mão se o equivalente de tecla do menu dispara sem digitar "Ω".

### `2026-10-23` — app de debug não abriu pelo `open`

- A primeira abertura com `open` ficou ~1h viva sem janela e sem subir o `cockpit-server-debug` (morreu antes do `sample`; sem crash report nem erro no `log show`). Causa não confirmada.
- Relançado executando o binário direto (`.../Debug/Cockpit.app/Contents/MacOS/Cockpit > debug-run.log 2>&1 &`): `[boot] Cockpit 2.1.18+116`, servidor em `~/.cockpit/cockpit-server-debug.sock` (sem conflito com o app instalado). Humano confirmou a janela.
- Daqui em diante, lançar pelo binário direto para ter o log.

### `2026-10-23` — build release do fork no lugar do oficial (incidente na primeira troca)

- Pedido do humano: usar o fork como se fosse uma versão mais nova, com os mesmos dados do Cockpit instalado, um aberto por vez.
- Build release ad-hoc (`xcodebuild -configuration Release`, mesmo override de assinatura; antes `fvm flutter build macos --release --config-only` + `pod install`, depois revertido o `Podfile.lock`): bundle `work.jacobmoura.cockpit`, `2.1.18`, `Signature=adhoc`. Mesma versão do instalado (`2.1.18+116`), então o estado não muda de formato. Em release o Sparkle fica ativo (`cockpit_module.dart:367`): uma release oficial nova pode substituir o fork.
- **Incidente:** o primeiro `cockpit-switch.sh fork` subiu o fork com o oficial ainda aberto. A trava usava `pgrep -f`, e o `pgrep` do macOS exclui os ancestrais de quem chama; o agente rodava num terminal do oficial. O fork encerrou o servidor do oficial (`sidecar: servidor alheio no socket (...Applications...); encerrando e subindo o meu`, `sidecar_terminal_connector.dart:95-103`), e os terminais do oficial morreram, inclusive a sessão do agente, retomada pelo humano no fork.
- **Segundo efeito:** o fork foi aberto do Bash do Claude Code e herdou `CLAUDECODE`, `CLAUDE_CODE_CHILD_SESSION` etc. (`ps -E`). O servidor repassa o ambiente aos terminais (`sidecar_terminal_connector.dart:131`), então todo `claude` aberto no fork avisa `Transcript saving is off — inherited CLAUDE_CODE_CHILD_SESSION marker`.
- **Correção** do script `~/app/remote_pi/.fork-tools/cockpit-switch.sh` (fora do git):
  - detecta pelos caminhos com `ps`, não com `pgrep`;
  - abre com `open` (ambiente limpo do LaunchServices);
  - recusa rodar com `COCKPIT_TAB_ID` definido;
  - `status` avisa quando os dois estão abertos.
  Testado: o `status` mostra os dois; a recusa funciona de dentro do Cockpit e com um app aberto.
- **Procedimento de troca:**
  1. esperar os agentes terminarem;
  2. ⌘Q no app aberto;
  3. no Terminal.app, `~/app/remote_pi/.fork-tools/cockpit-switch.sh fork|oficial`, ou abrir o `.app` pelo Finder;
  4. `claude --resume <id>` nas sessões que quiser continuar.
- **Pendente do humano:** ⌘Q no oficial (sem servidor; se tentar subir de novo, derruba o do fork); depois reabrir o fork pelo Finder ou pelo script para limpar as `CLAUDE_*`.
