---
title: remote_pi/cockpit — CodeEditor (editor de arquivos) e soft wrap
type: source
scope:
  area: [upstream-cockpit]
status: draft
updated: 2026-10-25
summary: "Como o CodeEditor do Cockpit mede linhas (altura fixa ou tabela por linha com quebra), onde moram os atalhos do editor, a ponte de menu, a setting editorWordWrap e o catálogo manual de atalhos. Fork 177aea97, PR #264."
related:
  - cross-cutting/upstream-contributions
  - work/executions/2026-10-23_cockpit-editor-soft-wrap
---

# Summary — `remote_pi/cockpit` (CodeEditor e soft wrap)

## About this source

Código-fonte do app Cockpit em [github.com/jacobaraujo7/remote_pi](https://github.com/jacobaraujo7/remote_pi), no subdiretório `cockpit/` (Dart/Flutter, comentários em pt-BR). Esta página destila o editor de arquivos (`CodeEditor`) para quem trabalha no tower ou em contribuições ao upstream ([[cross-cutting/upstream-contributions]]).

> **Ponto no tempo.** As citações `remote_pi:<caminho>:<linha>` valem para o commit **`177aea97`** da branch `feat/cockpit-editor-soft-wrap` do fork (base `upstream/main` `7d923ab`). Esse código **ainda não está no upstream**: o PR [#264](https://github.com/jacobaraujo7/remote_pi/pull/264) está aberto (issue [#261](https://github.com/jacobaraujo7/remote_pi/issues/261)). Em `upstream/main` o modo de quebra não existe. Se o PR mudar na revisão, as linhas mudam: anote, não reescreva.
>
> **Atualização 2026-10-25:** o PR #264 foi mergeado no upstream (merge `8138e03`). A ponta do PR é o `177aea97` citado aqui, então as linhas valem para o código que entrou. Mudanças no `upstream/main` depois do merge não foram reconferidas.

Execução que produziu o conhecimento: [[work/executions/2026-10-23_cockpit-editor-soft-wrap]].

## What it covers

### Geometria de linha: sem quebra e com quebra

- **Sem quebra**, uma linha lógica é uma linha visual. `_lineHeight` vem de um `TextPainter` com `'X'` no `codeStyle` (`preferredLineHeight`), recalculado a cada `build` (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:470`, `:915`). O gutter usa `itemExtent: _lineHeight` (`:1056`), e o topo de uma linha é `line * _lineHeight` (`:163`, `:172`).
- **Com `wordWrap`**, uma linha lógica ocupa N linhas visuais. O scroll horizontal e o `IntrinsicWidth` saem, e gutter, reveal, hover e overview leem a altura de cada linha de um `EditorWrapLayout` (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:42-45`). Os acessores `_lineTop`, `_lineExtent` e `_lineAtY` alternam entre as duas geometrias conforme `widget.wordWrap` (`:163`, `:167`, `:172`).
- Com quebra, o gutter usa `itemExtent: null` e um `itemExtentBuilder` que chama `_ensureWrap()` e devolve `_wrap.height(i)`; o número fica no topo da primeira linha visual (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:1039-1060`).
- O overview ruler recebe a mesma tabela (`wrap`) (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/editor_overview_ruler.dart:83`, `:91`).
- Ligar ou desligar a quebra preserva a linha do topo (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:300`, `:321`).

### `EditorWrapLayout` (tabela de tops por linha lógica)

- Mede cada linha num `TextPainter` na largura de quebra do campo e acumula os `tops`. A quebra recomeça a cada `\n`, então medir linha a linha dá o mesmo layout do campo (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/editor_wrap_layout.dart:14-22`, `:55-60`).
- A largura de medição desconta `kEditorWrapCaretMargin = 3` px (1 px de folga mais o `cursorWidth` de 2 px). Sem isso a tabela quebra 3 px depois do campo e o gutter desalinha (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/editor_wrap_layout.dart:3-7`).
- Cache por texto da linha: digitar só remede a linha alterada. A largura natural não depende da pane, então ao arrastar a divisória só as linhas mais largas que a pane são remedidas (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/editor_wrap_layout.dart:24-27`, `:106-115`). O cache é limpo quando passa de um teto proporcional ao nº de linhas (`:68`).
- `update` não faz nada quando texto, largura e estilo não mudaram, e notifica os ouvintes só quando algum top muda; `revision` sobe nessa hora (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/editor_wrap_layout.dart:41-45`, `:74-80`, `:90-94`).

### Armadilha: medir com o estilo efetivo do `EditableText`

- O `TextField` mescla o estilo do tema por baixo do `style` passado (por exemplo `letterSpacing`). Medir com o `codeStyle` puro quebra em outro ponto (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:144-146`; `remote_pi:cockpit/lib/app/cockpit/ui/widgets/editor_wrap_layout.dart:17-20`).
- Na execução, um teste de diagnóstico mostrou `letterSpacing: 0.5` e um strut forçado no campo, enquanto o `codeStyle` não tem `letterSpacing` (execução, "correções da rodada 1").
- `_ensureWrap()` acha o `EditableText` sob `_fieldKey` e lê `style`, `strutStyle` e `textScaler` dele; cai no `_codeStyle` só se o campo ainda não existir (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:178-211`). Roda sob demanda no layout do gutter, quando a subárvore já foi inflada (`:136-138`, `:176-178`).
- O `textScaler` do `MediaQuery` é lido no `build` e guardado em `_buildScaler`, porque no layout não se lê `InheritedWidget` (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:148-150`, `:909`).
- Toda medição nova (hover, reveal) deve reutilizar `_fieldStyle`, `_fieldStrut` e `_fieldScaler`, como faz `_revealMatch` com quebra (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:397-415`).

### Atalhos do editor: `CallbackShortcuts` local do `FileViewer`

- O ⌥Z (Alt+Z fora do macOS) fica no `CallbackShortcuts` do `FileViewer`, não num atalho global: um atalho global roubaria o Alt+Z dos terminais no Windows/Linux, onde Alt vira Meta. Só o editor focado vê a tecla (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/file_viewer.dart:974-977`; `remote_pi:cockpit/lib/app/core/ui/menu/app_menu_bar.dart:249-253`).
- O mesmo `CallbackShortcuts` envolve o viewer inteiro (editor mais rodapé), para funcionar com o foco fora do campo, e só existe quando o arquivo é editável. Save, Find, Format e Clone Lines moram ali também (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/file_viewer.dart:934-977`).

### Ponte de menu: `EditorMenuBridge`, `MenuAccelerator`, `shortcutHandledExternally`

- `EditorMenuBridge` é um `ChangeNotifier` do app. O `FileViewer` focado publica capacidades e callbacks (`publish`), e o menu lê esse estado para habilitar cada item. Há **um dono por vez**: `clear` só limpa se o dono ainda for o mesmo (`remote_pi:cockpit/lib/app/core/ui/menu/editor_menu_bridge.dart:3-14`).
- `canToggleWordWrap` só fica verdadeiro quando o editor passa `onToggleWordWrap`; os editores `.http` e `.dbq` publicam sem ele (`remote_pi:cockpit/lib/app/core/ui/menu/editor_menu_bridge.dart:20-27`, `:46-57`). O `FileViewer` publica só quando focado e editando, e faz `clear` no resto (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/file_viewer.dart:454-474`).
- `shortcutHandledExternally: true` faz do acelerador só uma dica: no macOS o menu nativo ainda dispara a tecla; fora dele, `menuShortcuts` pula o item, para a ação não rodar duas vezes (`remote_pi:cockpit/lib/app/core/ui/menu/menu_model.dart:59-65`, `:107-110`, `:116-121`).
- "Toggle Word Wrap" usa `MenuAccelerator(keyZ, alt: true, primary: false)` e fica desabilitado sem editor de arquivo focado (`remote_pi:cockpit/lib/app/core/ui/menu/app_menu_bar.dart:254-261`). No macOS, o dono usou o ⌥Z no dia a dia (2026-10-24) e ele alterna sem digitar "Ω".

### Setting `editorWordWrap`

- `AppSettings.editorWordWrap` é `bool?`: `null` = padrão da linguagem (Markdown e texto quebram), `true` = todo arquivo, `false` = nenhum (`remote_pi:cockpit/lib/app/core/domain/entities/app_settings.dart:125-129`). É global, não por arquivo.
- Chave JSON `editor.wordWrap`, gravada só quando não é `null` (`remote_pi:cockpit/lib/app/core/domain/entities/app_settings.dart:380`, `:465`).
- `copyWith(editorWordWrap: null)` **não** zera o campo; voltar ao padrão exige `clearEditorWordWrap: true`, e `SettingsController.setEditorWordWrap(null)` faz isso (`remote_pi:cockpit/lib/app/core/domain/entities/app_settings.dart:274-275`, `:326-328`; `remote_pi:cockpit/lib/app/core/ui/settings_controller.dart:216-220`).
- `fileEditorWordWrap(chosen, language)` dá o valor efetivo: `chosen ?? _wrapByDefault.contains(language)`, com o padrão ligado em `markdown`, `md`, `txt` e `text` (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/file_viewer.dart:1397-1403`).
- `toggledEditorWordWrap(chosen, language)` define o que o ⌥Z grava: se o arquivo aberto quebra, `false`; se não, `null` num arquivo de texto (volta ao padrão) ou `true` num de código (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/file_viewer.dart:1405-1416`).
- Em Settings → General → Editor, `_WordWrapDropdown` mostra os três valores (`remote_pi:cockpit/lib/app/settings/ui/settings_page.dart:491-492`, `:1259-1262`).

### Catálogo de atalhos (Settings → Shortcuts): estático, atualizado à mão

- A aba Shortcuts é só leitura e lê `buildShortcutCatalog()`, que resolve ⌘/Ctrl, ⇧/Shift e ⌥/Alt por plataforma (`remote_pi:cockpit/lib/app/settings/ui/settings_page.dart:1983-1994`; `remote_pi:cockpit/lib/app/settings/ui/shortcut_catalog.dart:31-36`).
- Ela **não deriva** dos handlers reais: um atalho novo só aparece se alguém o escrever lá, como o "Toggle Word Wrap" (`remote_pi:cockpit/lib/app/settings/ui/shortcut_catalog.dart:74-77`).
- Regra prática: ao criar ou mudar um atalho, atualizar três lugares — o handler (`FileViewer` ou `AppRoot`), o item de menu em `app_menu_bar.dart` e o `shortcut_catalog.dart`. O dono achou a falta do catálogo no teste de usabilidade.

### Not covered

- Os editores `.http` e `.dbq`, o LSP e os diagnósticos.

## Wiki pages it feeds

- [[cross-cutting/upstream-contributions]]

## Usage notes

- ⚠ **Coluna escorrega sem quebra (bug que já existia, não corrigido).** Sem quebra, o hover do go-to-definition converte x em coluna com um `TextPainter` no `codeStyle` puro (`remote_pi:cockpit/lib/app/cockpit/ui/widgets/code_editor.dart:598-605`), e o `_revealMatch` mede o prefixo do mesmo jeito (`:436-447`). O campo desenha com `letterSpacing: 0.5`, então o erro cresce 0,5 px por coluna (~40 px na coluna 80). Com quebra o hover usa `RenderEditable.getPositionForPoint` e não sofre disso (`:579-588`). Oferecido ao mantenedor nas "Notes" do PR #264; cartão k11 do quadro.
- Arrastar a divisória com quebra ligada custa ~25 ms por largura nova num arquivo de 2096 linhas (medição da execução). Adiar a medição durante o arraste é o cartão k12.
- As linhas citadas só valem em `177aea97`. Depois do merge ou de um rebase, reconferir.

## History

- 2026-10-24: criada no `/wiki-sync` de [[work/executions/2026-10-23_cockpit-editor-soft-wrap]] (issue #261, PR #264 aberto).
- 2026-10-25: PR #264 mergeado; nota no aviso de ponto no tempo ([[work/executions/2026-10-25_upstream-prs-merged]]).
