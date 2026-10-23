---
title: 2026-10-23 — Quebra de linha (soft wrap) no editor do Cockpit, contribuição upstream
type: plan
work_id: 2026-10-23_cockpit-editor-soft-wrap
scope:
  area: [upstream-cockpit]
status: approved
risk: medium
updated: 2026-10-23
summary: Modo de quebra de linha opcional no CodeEditor do Cockpit, com uma tabela de altura por linha lógica para gutter, reveal, hover e overview; ligado por padrão em .md/.txt, alternado por ⌥Z.
topic: [ui]
related:
  - work/tasks/2026-10-23_cockpit-editor-soft-wrap
---

# Plano — Quebra de linha (soft wrap) no editor do Cockpit

> Cobre [[work/tasks/2026-10-23_cockpit-editor-soft-wrap]]. O código é do `remote_pi`: o fork
> `tganzerli/remote_pi`, clonado em `~/app/remote_pi`, com o remote `upstream` em
> `jacobaraujo7/remote_pi`, commit `7d923ab`. As citações `remote_pi:` são relativas a
> `cockpit/`, e as `sdk:` são relativas a `packages/flutter/lib/src` do Flutter `3.50.0-0.1.pre`
> (`fvm`), a versão do CI do projeto (`remote_pi:../.github/workflows/cockpit-release.yml:41`).

## §4.0. Análises pré-plano

Na triagem saíram três perguntas independentes, cada uma respondida por um agente `analyst`
em paralelo. As citações principais foram conferidas no thread principal.

**A. Posição das linhas com quebra (geometria).**
- Não há API pública que entregue as métricas de linha do `RenderEditable`:
  `computeLineMetrics` só existe no `_textPainter`, que é privado
  (`sdk:rendering/editable.dart:163`). A `editableTextKey` do `TextField` fica no estado
  privado `_TextFieldState` (`sdk:material/text_field.dart:1147`).
- `getPositionForPoint(global)` desconta sozinho o scroll interno do campo
  (`sdk:rendering/editable.dart:1794-1796`, conferido). É o caminho exato de "mouse → offset".
- O campo quebra o texto em `maxWidth - _caretMargin` (`sdk:rendering/editable.dart:2272`,
  conferido), ou seja, 3 px a menos que a largura dele.
- O `ListView` aceita `itemExtentBuilder` (`sdk:widgets/scroll_view.dart:1339`, conferido).
  Com isso o gutter passa a ter altura variável por linha e continua sendo um `ListView`,
  sem perder tooltip, ícones de severidade e as chaves `git-change-line:N` que os testes
  usam (`remote_pi:lib/app/cockpit/ui/widgets/code_editor.dart:648-679`).
- O overview do Git calcula `lineCount * lineHeight` e `(line - 1) * lineHeight`
  (`remote_pi:lib/app/cockpit/ui/widgets/editor_overview_ruler.dart:180-198`, conferido).
- O `CodeEditingController` trabalha com linhas lógicas, e o realce da busca são spans,
  então quebra naturalmente (`remote_pi:lib/app/core/ui/widgets/code_editing_controller.dart:141-153,265-346`).
- **Escolha (híbrida):**
  - Uma **tabela de alturas por linha lógica**, com um `TextPainter` por linha na largura
    do campo menos 3 px, com cache pelo texto da linha e invalidada quando mudam a largura
    ou o estilo. Ela alimenta o gutter, o reveal, a linha do hover e o overview.
  - `getPositionForPoint` para o go-to-definition.
  - Risco: o estilo itálico dos comentários (`remote_pi:lib/app/core/ui/themes/syntax_colors.dart:251`)
    não entra na tabela. Com fonte monoespaçada o efeito deve ser nulo, mas está ⚠ unverified.

**B. Como ligar e desligar.**
- **Configuração:** fica no JSON da `JsonSettingsStore`
  (`remote_pi:lib/app/core/data/repositories/json_settings_store.dart:6-40`). Um booleano
  novo segue o padrão do `pinUserMessage`
  (`remote_pi:lib/app/core/domain/entities/app_settings.dart:42,107,263,313,363,447`,
  conferido), e o setter fica junto do `setFormatOnSave`
  (`remote_pi:lib/app/core/ui/settings_controller.dart:213-214`, conferido).
- **Menu:**
  - O menu View já existe (`remote_pi:lib/app/core/ui/menu/app_menu_bar.dart:135`).
  - O `MenuAccelerator` só conhece o modificador primário (⌘ ou Ctrl) e o shift
    (`remote_pi:lib/app/core/ui/menu/menu_model.dart:24-37`), e o `MenuAction` não tem
    estado "marcado" (`:59-71`).
  - A ponte entre o editor focado e o menu é a `EditorMenuBridge`, com um dono por vez
    (`remote_pi:lib/app/core/ui/menu/editor_menu_bridge.dart:14-79`).
- **Atalhos do editor:** os do `FileViewer` ficam num `CallbackShortcuts` local, com
  `alt: true` já usado no clonar-linha
  (`remote_pi:lib/app/cockpit/ui/widgets/file_viewer.dart:920-950`).
  - Não há outro Alt+Z no app.
  - Um atalho global roubaria o Alt+Z do terminal no Windows e no Linux, onde Alt vira Meta
    (`remote_pi:lib/app/cockpit/ui/widgets/terminal_pane.dart:165`). Por isso o atalho fica
    restrito ao editor.
- **Linguagem do arquivo:** `FileViewer._language`
  (`remote_pi:lib/app/cockpit/ui/widgets/file_viewer.dart:148-155`, conferido) devolve
  `'markdown'` ou a extensão pura (por exemplo `'txt'`).
- **Traduções:** chaves em `lib/i18n/{en,pt_BR,es}.i18n.json`, regeneradas com
  `dart run slang`, que reescreve os `strings*.g.dart`.
- **`.http` e `.dbq`:** ficam sem quebra (`remote_pi:lib/app/cockpit/ui/widgets/http_request_view.dart:370`,
  `db_query_view.dart:444`).

**C. Testes e validação local.**
- **Harness para copiar:** `remote_pi:test/ui/code_editor_reveal_test.dart:1-70`, que usa
  `ShadcnApp(theme: buildTheme(...))` e `CodeEditingController` e não precisa de i18n.
  `test/flutter_test_config.dart:19-26` já trata o `fontsChange`.
- **Testes do editor que existem:** `code_editor_reveal_test.dart` (15 testes),
  `code_editor_selection_scroll_test.dart`, `code_editor_bottom_scroll_test.dart`,
  `code_editor_tab_indent_test.dart`, `code_editor_comment_chord_test.dart` e
  `file_viewer_session_test.dart`.
- **`fvm flutter analyze` no clone intocado** (conferido): `39 issues found`, todas info, sem
  error nem warning, exit 1. Essa é a baseline.
- **`flutter test` falha sem Zig.** O hook do libghostty usa `source: compile`
  (`remote_pi:pubspec.yaml:34-38`, conferido) e chama `zig build`.
  - Contorno validado pelo agente: rodar numa **cópia** do projeto num caminho curto, com
    `source: prebuilt` só na cópia. Resultado `+15: All tests passed!` no reveal test.
  - Não há CI de analyze nem de testes Flutter no `remote_pi`
    (`remote_pi:../.github/workflows/`), então o PR descreve os comandos rodados à mão.

Modelo do plano: este thread (Opus). A decisão difícil, a geometria, já veio da análise A.

## §4.1. Resumo e entendimento

**O que a task pede:** que o editor do Cockpit quebre linhas longas em `.md`. Esse comportamento
deve virar uma contribuição upstream, com issue e PR.

**O que é preciso de fato:**
- Um **modo opcional** no `CodeEditor` que troque a rolagem horizontal pela quebra na largura
  da pane.
- Que tudo o que hoje assume "uma linha lógica = uma linha visual" (gutter, reveal, hover,
  go-to-definition, overview) passe a usar a altura real de cada linha.
- Que o modo atual fique **intacto**, porque é o padrão para código, `.http` e `.dbq`.

**A forma de ligar segue o VS Code:** "View → Toggle Word Wrap" e ⌥Z/Alt+Z, numa preferência
global salva. Enquanto o usuário não escolheu nada, vale um padrão por linguagem: ligado em
markdown e texto puro, desligado no resto.

## §4.2. Arquivos afetados

**Código do `remote_pi`** (`~/app/remote_pi/cockpit/`, branch `feat/cockpit-editor-soft-wrap` no fork):

| Arquivo | Mudança |
|---|---|
| `lib/app/cockpit/ui/widgets/editor_wrap_layout.dart` | **novo**: tabela de alturas por linha lógica (pura, testável) |
| `lib/app/cockpit/ui/widgets/code_editor.dart` | parâmetro `wordWrap`; layout sem rolagem horizontal; consumidores usam a tabela |
| `lib/app/cockpit/ui/widgets/editor_overview_ruler.dart` | posição da linha por função opcional (padrão = conta atual) |
| `lib/app/cockpit/ui/widgets/file_viewer.dart` | calcula o wrap efetivo, passa ao `CodeEditor`, atalho ⌥Z local, publica na ponte |
| `lib/app/core/domain/entities/app_settings.dart` | campo `bool? editorWordWrap` (`null` = padrão da linguagem) |
| `lib/app/core/ui/settings_controller.dart` | `setEditorWordWrap(bool)` |
| `lib/app/core/ui/menu/menu_model.dart` | `MenuAccelerator` ganha `alt` e `primary` |
| `lib/app/core/ui/menu/editor_menu_bridge.dart` | capacidade `canToggleWordWrap` + `toggleWordWrap()` |
| `lib/app/core/ui/menu/app_menu_bar.dart` | item "Toggle Word Wrap" no View; hint do ⌥ no menu desenhado (Win/Linux) |
| `lib/i18n/{en,pt_BR,es}.i18n.json` + `lib/i18n/strings*.g.dart` | chave `core.menu.toggleWordWrap` |
| `test/ui/code_editor_soft_wrap_test.dart` | **novo**: testes de widget do modo quebra |
| `test/ui/editor_wrap_layout_test.dart` | **novo**: testes da tabela |
| `test/ui/app_menu_new_terminal_accelerator_test.dart` | caso do acelerador com `alt` sem primário |

**Tower** (este repositório, branch `docs/2026-10-23_cockpit-editor-soft-wrap__wiki`): o trio
deste trabalho e o cartão do `board.kanban`.

- 🔒 **Regras afetadas:** nenhuma. Nenhuma regra do tower descreve o editor do Cockpit.
- 🔒 **ADRs afetadas:** nenhuma.
  - No tower, [[decisions/2026-10-22_read-only-client]] trata do gateway, e este trabalho
    não toca nele.
  - No `remote_pi`, `plan/00-decisions.md` lista decisões fechadas. A leitura dele entra no
    passo 1, e um conflito sobre o editor para a execução.

## §4.3. Mudanças e justificativa

### 1. `editor_wrap_layout.dart` (novo)

Mede cada linha lógica na largura de quebra e guarda os tops acumulados. O cache por texto
de linha faz a digitação recalcular só a linha que mudou.

```dart
/// Per-logical-line vertical geometry when the editor soft-wraps.
class EditorWrapLayout {
  double _width = -1;
  TextStyle? _style;
  final _heightByText = <String, double>{};
  List<double> _tops = const [0];

  /// Recomputes tops for [lines] laid out at [width] (the field's wrap width).
  void update(List<String> lines, double width, TextStyle style, double rowHeight) {
    if (width != _width || style != _style) {
      _heightByText.clear();
      _width = width;
      _style = style;
    }
    final tops = List<double>.filled(lines.length + 1, 0);
    for (var i = 0; i < lines.length; i++) {
      tops[i + 1] = tops[i] + _heightOf(lines[i], rowHeight);
    }
    _tops = tops;
  }

  double top(int line) => _tops[line];
  double height(int line) => _tops[line + 1] - _tops[line];
  double get totalHeight => _tops.last;

  /// Logical line (0-based) containing content y [y]; binary search over tops.
  int lineAtY(double y) { /* ... */ }
}
```

- `_heightOf` usa um `TextPainter(maxWidth: width)`; uma linha vazia mede `rowHeight`.
- O cache é limitado: ele é limpo quando o número de entradas passa de 4× o número de linhas.
- A largura de quebra é a do campo menos o `_caretMargin` de 3 px do `RenderEditable`
  (`sdk:rendering/editable.dart:2272`). Para não espalhar um número mágico, o valor fica numa
  constante com comentário.

### 2. `code_editor.dart`

- **Parâmetro:** `final bool wordWrap;` com padrão `false`. Os outros chamadores (`.http` e
  `.dbq`) não mudam.
- **Layout:** com `wordWrap`, o `SingleChildScrollView` horizontal e o `IntrinsicWidth`
  (`code_editor.dart:911-922`) dão lugar a um `Padding(left: 14, right: 16)`. O `LayoutBuilder`
  que já existe (`:903`) passa a largura para `_wrap.update(...)`, que roda de forma síncrona
  no build e evita um frame de atraso. A `Scrollbar` horizontal externa só é montada sem quebra.
- **Gutter:** troca o `itemExtent: _lineHeight` por um `itemExtentBuilder` no modo quebra,
  com o número alinhado ao topo da célula:
  ```dart
  itemExtent: widget.wordWrap ? null : _lineHeight,
  itemExtentBuilder: widget.wordWrap ? (i, _) => _wrap.height(i) : null,
  ```
  O `_syncGutter` continua igual: a altura total do gutter é a do conteúdo do campo, então
  o `jumpTo` segue 1:1.
- **Reveal:** em `_reveal` e `_revealMatch`, a conta `idx * _lineHeight` passa a usar
  `_lineTop(idx)`, que é `wordWrap ? _wrap.top(idx) : idx * _lineHeight`.
  - No `_revealMatch` com quebra, o alvo vertical é o topo da linha visual do match. A conta
    sai da largura do prefixo pela própria tabela, ou do caret rect como alternativa.
  - O ramo horizontal (`:286-316`) é pulado.
- **Hover de diagnostic:** `contentY ~/ _lineHeight` (`:391`) vira `_lineAtY(contentY)`, e o
  overlay (`:792`, `:800`) usa `_lineTop` e a altura da linha.
- **Go-to-definition** (`:419-446`): no modo quebra, usa `getPositionForPoint(event.position)`
  do `RenderEditable`. Ele é achado por uma `GlobalKey` no `Focus` que já envolve o
  `TextField` (`:929`) e por uma busca na subárvore de render. O modo atual não muda, para
  manter o diff pequeno e a regressão em zero.
- **Pin horizontal** (`:157-194`): com quebra, `_keepHorizontalOnSelection` e
  `_onHorizontalScroll` retornam cedo, porque não há rolagem horizontal.
- **Troca de modo em tempo de execução:** `didUpdateWidget` detecta a mudança de `wordWrap`
  e preserva a primeira linha visível, que é reposicionada pelo `_lineTop`.

### 3. `editor_overview_ruler.dart`

- O `EditorOverviewRuler` e os helpers `@visibleForTesting` ganham um parâmetro opcional
  `double Function(int line)? lineTop`. Quando ele é `null`, vale a conta atual
  (`(line - 1) * lineHeight`, `:190`, `:197`). O `CodeEditor` só passa a função no modo quebra.
- A extensão total passa a preferir a `scrollContentExtent` real, que já é passada
  (`code_editor.dart:989`).

### 4. Preferência, ponte, menu e atalho

- **`AppSettings`:** `final bool? editorWordWrap;`, salvo em JSON como `'editor.wordWrap'`.
  O nome com ponto segue o precedente `editor.engine`. O `copyWith` ganha
  `clearEditorWordWrap` (padrão dos campos anuláveis, como `locale`).
- **`SettingsController`:**
  `void setEditorWordWrap(bool v) => _apply(_settings.copyWith(editorWordWrap: v));`
- **`FileViewer`:**
  ```dart
  static const _proseLanguages = {'markdown', 'md', 'txt', 'text'};
  bool get _wordWrap =>
      context.watch<SettingsController>().settings.editorWordWrap ??
      _proseLanguages.contains(_language);
  void _toggleWordWrap() =>
      context.read<SettingsController>().setEditorWordWrap(!_wordWrap);
  ```
  Ele passa `wordWrap: _wordWrap` em `_editor()`, acrescenta
  `SingleActivator(LogicalKeyboardKey.keyZ, alt: true): _toggleWordWrap` ao
  `CallbackShortcuts` local e publica `canToggleWordWrap: true` na ponte.
- **`EditorMenuBridge`:** ganha `canToggleWordWrap`, `onToggleWordWrap` e `toggleWordWrap()`,
  com o mesmo padrão de dono e de notificação dos outros. O `.http` e o `.dbq` publicam `false`.
- **`MenuAccelerator`:** ganha `const MenuAccelerator(key, {shift, alt = false, primary = true})`.
  O `resolve()` aplica `meta`/`control` só quando `primary` é verdadeiro, e acrescenta `alt`.
- **Menu View:** `MenuAction(tr.toggleWordWrap, accelerator: MenuAccelerator(keyZ, alt: true, primary: false), onSelected: bridge.canToggleWordWrap ? bridge.toggleWordWrap : null, shortcutHandledExternally: true)`.
  O `shortcutHandledExternally` existe porque o atalho real fica no editor. Isso evita roubar
  o Alt+Z do terminal fora do macOS e segue o precedente do ⌘S.
- **Rótulo fixo "Toggle Word Wrap":** o mesmo nome do comando no VS Code. Evita criar estado
  "marcado" no menu, que o `PlatformMenuItem` nativo não tem.

### 5. i18n

`core.menu.toggleWordWrap`: en "Toggle Word Wrap", pt-BR "Alternar quebra de linha",
es "Alternar ajuste de línea". Os `strings*.g.dart` são regenerados com `fvm dart run slang`.

### 6. Testes

- **`editor_wrap_layout_test.dart`:**
  - Uma linha longa ocupa mais de uma linha visual.
  - Linha vazia mede `rowHeight`.
  - `lineAtY` cai na linha certa nas bordas.
  - Mudar a largura invalida o cache.
  - Digitar recalcula só a linha alterada.
- **`code_editor_soft_wrap_test.dart`** (harness do reveal test):
  - Com `wordWrap: true` e uma linha de 400 caracteres numa caixa de 300 px, não sobra
    scrollable horizontal e o campo fica mais alto que uma linha.
  - O número "2" do gutter fica no mesmo y do início da linha 2 do texto. A posição é
    comparada pelo `RenderEditable.getLocalRectForCaret`.
  - O reveal da linha 3 rola até `top(2)`.
  - O overview marca a linha certa (`git-change-line:N` alinhado).
  - Com `wordWrap: false`, a rolagem horizontal continua existindo (regressão).
- **Acelerador:** `MenuAccelerator(keyZ, alt: true, primary: false).resolve()` não tem `meta`
  nem `control` e tem `alt`.

## §4.4. Riscos e impacto

- 🔒 **Tier: `medium`.** É uma mudança comum de produto, só que no Cockpit. Não toca nada do
  "Always high risk" do `REVIEW.md` do tower (terminal, rede, autenticação, workflows) nem
  código do tower.
- **Regressão no modo atual:** é o risco principal, porque o editor é usado por todo arquivo
  de código, pelo `.http` e pelo `.dbq`. Mitigação: todo caminho novo fica atrás de
  `widget.wordWrap`, e os testes do editor que já existem precisam continuar passando.
- **Divergência entre a tabela e o layout real:** o itálico dos comentários e a margem de
  3 px podem desalinhar o gutter. Mitigação: o teste de alinhamento compara com o
  `RenderEditable`, e em debug um `assert` pós-frame compara `totalHeight + _padBottom` com
  a extensão de scroll do campo.
- **Desempenho:**
  - Um arquivo de 5 mil linhas faz 5 mil layouts de `TextPainter` ao abrir e a cada mudança
    de largura (estimativa: dezenas de ms, ⚠ unverified).
  - Mitigação: o cache por texto, e a quebra só vem ligada por padrão em `.md` e `.txt`.
  - O tempo medido num `.md` grande entra na execução e no PR.
- **⌥Z no macOS:** não está provado se o equivalente de tecla do menu dispara antes de o
  campo digitar "Ω" (⚠ unverified). O atalho local do `FileViewer` é o caminho principal, e
  falta testar à mão.
- **Teste manual no app:** depende de Rust e Zig 0.16, que não estão instalados. Sem eles o
  PR diz que o comportamento foi validado só por testes de widget.
- **Verificação** (no clone, rodar na ordem):
  1. `cd ~/app/remote_pi/cockpit && fvm flutter analyze`: espera-se `39 issues found` ou
     menos, sem nenhum `error` ou `warning` novo.
  2. Na cópia de teste com `source: prebuilt` (o contorno do §4.0 C):
     `fvm flutter test test/ui/editor_wrap_layout_test.dart test/ui/code_editor_soft_wrap_test.dart test/ui/code_editor_reveal_test.dart test/ui/code_editor_selection_scroll_test.dart test/ui/code_editor_bottom_scroll_test.dart test/ui/code_editor_tab_indent_test.dart test/ui/code_editor_comment_chord_test.dart test/ui/file_viewer_session_test.dart test/ui/app_menu_new_terminal_accelerator_test.dart`:
     espera-se `All tests passed!`.
  3. `fvm dart run slang` sem erro e `git diff --stat lib/i18n` mostrando as 3 traduções e os
     4 `.g.dart`.
- **Como reverter:**
  - Antes do merge upstream: fechar o PR e apagar a branch do fork. O clone local não afeta
    nada instalado.
  - Depois do merge: o mantenedor reverte o commit.
  - No tower: reverter os commits do trio.

## §4.5. Passos de execução

1. Criar no tower a branch `docs/2026-10-23_cockpit-editor-soft-wrap__wiki` e o log de
   execução. Ler o `plan/00-decisions.md` do `remote_pi`, procurando conflito com o editor.
2. `git fetch upstream` e criar a branch do fork, `feat/cockpit-editor-soft-wrap`, a partir
   de `upstream/main`. Registrar o commit base.
3. **Issue:** escrever o texto em inglês e **mostrar ao humano**. Publicar só com aprovação
   no momento.
4. Criar `editor_wrap_layout.dart` e o teste dele.
5. Mudar o `code_editor.dart` (layout, gutter, reveal, hover, definition, pin e troca de
   modo) e o `editor_overview_ruler.dart`.
6. Escrever o `code_editor_soft_wrap_test.dart`.
7. Fazer a preferência (`AppSettings`, `SettingsController`), a ponte, o `MenuAccelerator`, o
   item do menu e a ligação no `FileViewer`.
8. Fazer o i18n e rodar `fvm dart run slang`.
9. Rodar `dart format` nos arquivos tocados e a verificação do §4.4 (analyze, testes na cópia
   e slang), registrando os comandos e o fim das saídas.
10. Medir o tempo de abertura de um `.md` grande (por exemplo, o `CHANGELOG.md` do
    `remote_pi`) no teste de widget e registrar o resultado.
11. Commits em inglês, no formato `feat(cockpit): …`, sem trailer de IA. Depois, a revisão
    `reviewer` com contexto limpo (tier medium, até 3 rodadas).
12. Gate humano. Depois dele: push para o fork e o texto do PR em inglês, citando a issue e
    com uma seção "Testing" que traz os comandos e a limitação do teste manual. O PR é
    **mostrado ao humano** e aberto só com aprovação no momento.
13. Fechar a execução e propor o `/wiki-sync`.

## §4.6. Escopo

- **Área:** `upstream-cockpit`. Nenhuma área do tower (`gateway`, `viewer`, `tower-cli`,
  `panel`) muda.
- No `remote_pi`, só o subprojeto `cockpit/` muda.

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/sources/external/2026-10-23_cockpit-code-editor.md` (**novo**): resumo
  do editor do Cockpit, com a geometria das linhas, o modo de quebra, os atalhos do editor e
  a ponte do menu. Tudo com citações `remote_pi:`, para servir às próximas contribuições.
- `cockpit_tower_wiki/sources/external/_index.md`: regenerado com `/wiki-index`.
- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (**novo**): como contribuir com
  o `remote_pi` a partir do tower.
  - Fork, clone e `upstream`.
  - O Flutter beta do CI via `fvm`.
  - O contorno do `source: prebuilt` para testes sem Zig.
  - A baseline do analyze.
  - O idioma de issue e PR.
  - Sem trailer de IA.
- `cockpit_tower_wiki/overview.md`: a linha da área `upstream-cockpit` passa a apontar a página
  de contribuições.
