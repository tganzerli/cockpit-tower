---
title: 2026-11-11 — Cockpit define LANG UTF-8 nos terminais, contribuição upstream
type: plan
work_id: 2026-11-11_cockpit-pty-utf8-locale
scope:
  area: [upstream-cockpit]
status: executed
risk: medium
updated: 2026-11-11
summary: Helper puro que preenche LANG=<locale>.UTF-8 (fallback en_US.UTF-8) no macOS quando LANG/LC_ALL/LC_CTYPE faltam, aplicado nos terminais (PTY e sidecar) e nas tasks; validar no fork pelo Dock, depois issue e PR upstream.
topic: [bugfix]
related:
  - work/tasks/2026-11-11_cockpit-pty-utf8-locale
  - cross-cutting/upstream-contributions
---

# Plano — Cockpit define LANG UTF-8 nos terminais

> Cobre [[work/tasks/2026-11-11_cockpit-pty-utf8-locale]]. O código é do `remote_pi`, no fork
> `tganzerli/remote_pi` (`~/app/remote_pi`), base `upstream/main` `f52d54a8`. As citações
> `remote_pi:` são relativas a `cockpit/`.

## §4.0. Análises pré-plano

Investigação feita no thread principal, sem agentes: poucos arquivos, todos com alvo conhecido.

- **Causa reproduzida** (task, Contexto): sem locale, o `pbcopy` grava UTF-8 como Mac Roman.
- **Onde o ambiente dos terminais é montado** (todos herdam o env do app, sem `LANG`):
  - Terminal local direto: `_terminalEnv` em
    `remote_pi:lib/app/cockpit/data/terminal/pty_terminal_gateway.dart:99-104`
    (`...Platform.environment`, `TERM`, `COLORTERM`, `...extraEnv`).
  - Terminal via sidecar (`cockpit-server`): cópia do mesmo `_terminalEnv` em
    `remote_pi:lib/app/cockpit/data/terminal/sidecar/sidecar_terminal_gateway.dart:218-223`.
    O servidor funde esse mapa por cima do próprio env (comentário em `:216-217`), e o próprio
    servidor também nasce sem `LANG` (`sidecar_terminal_connector.dart:131-134`).
  - Tasks: mapa em `remote_pi:lib/app/cockpit/data/tasks/pty_task_runner.dart:366-374`, a partir
    de `envWithNodeOnPath()` (`remote_pi:lib/app/core/data/setup/remote_pi_resolver.dart:82-83`,
    cópia de `Platform.environment`).
  - Terminal remoto: `remote_host_terminal_gateway.dart:423-426` não herda o env local, e o host
    remoto usa o locale dele. Fica fora do escopo.
- **Locale do app:** `Platform.localeName` devolve `pt-BR` neste Mac sem `LANG` (rodado com
  `fvm dart`). O macOS tem `/usr/share/locale/pt_BR.UTF-8` e `/usr/share/locale/en_US.UTF-8`.
- **Testes de env existentes:** nenhum teste verifica o `_terminalEnv` hoje
  (`git grep COLORTERM cockpit/test` vazio). Há `test/data/sidecar_terminal_gateway_test.dart`.

## §4.1. Resumo e entendimento

**O problema:** um Cockpit aberto pelo Dock entrega aos terminais um ambiente sem locale. O
`pbcopy` e outras ferramentas caem no encoding legado (Mac Roman), e o texto acentuado copiado
por programas no terminal (Claude Code, vim, scripts) chega quebrado.

**A correção:** fazer o que o Terminal.app faz. No macOS, quando o env herdado não tem `LANG`,
`LC_ALL` nem `LC_CTYPE`, preencher `LANG` com o locale do usuário em UTF-8 (`pt-BR` →
`pt_BR.UTF-8`). Se esse locale não existir em `/usr/share/locale`, usar `en_US.UTF-8`. Se
qualquer uma das três variáveis já vier preenchida, não mexer em nada.

Um helper puro e testável faz isso, e é chamado nos três pontos que montam o env (PTY, sidecar e
tasks). O `extraEnv` (perfil e workspace) continua por cima, então quem define `LANG` no perfil
ainda vence.

**Alternativas descartadas:**
- `LC_CTYPE=UTF-8` sozinho: é o mínimo para o encoding, mas o `ssh` repassa essa variável, e
  hosts Linux reclamam `setlocale: LC_CTYPE: cannot change locale (UTF-8)`. Um `LANG` completo é
  o que o Terminal.app manda.
- Sempre `en_US.UTF-8`: funciona, mas foge da paridade com o Terminal.app, que segue o idioma
  do usuário.
- Linux: sessões gráficas já exportam `LANG`, e `en_US.UTF-8` pode não estar gerado lá. Por isso
  o helper só atua no macOS.

## §4.2. Arquivos afetados

**`remote_pi`** (branch `fix/cockpit-pty-utf8-locale` no fork, a partir de `upstream/main`):

| Arquivo | Mudança |
|---|---|
| `lib/app/cockpit/data/terminal/terminal_locale_env.dart` | **novo**: helper puro `withUtf8Locale` |
| `lib/app/cockpit/data/terminal/pty_terminal_gateway.dart` | `_terminalEnv` aplica o helper ao env herdado; doc do método ganha a linha do `LANG` |
| `lib/app/cockpit/data/terminal/sidecar/sidecar_terminal_gateway.dart` | idem |
| `lib/app/cockpit/data/tasks/pty_task_runner.dart` | idem, sobre o `envWithNodeOnPath()` |
| `test/data/terminal_locale_env_test.dart` | **novo**: testes do helper |

**Tower** (branch `docs/2026-11-11_cockpit-pty-utf8-locale__wiki`): o trio e a página
`cross-cutting/upstream-contributions.md`.

- 🔒 **Regras afetadas:** nenhuma.
- 🔒 **ADRs afetadas:** nenhuma. O passo 1 lê o `plan/00-decisions.md` do `remote_pi`, e um
  conflito sobre ambiente de terminal para a execução.

## §4.3. Mudanças e justificativa

### 1. `terminal_locale_env.dart` (novo)

```dart
import 'dart:io';

/// macOS GUI apps launched from the Dock/Finder inherit no locale variables.
/// Without them `pbcopy` (used by Claude Code, vim, etc.) reads stdin as
/// MacRoman and copied accents turn into mojibake ("seção" -> "se√ß√£o").
/// Terminal.app and iTerm export LANG themselves; this does the same.
///
/// Returns [env] unchanged unless on macOS with none of LANG, LC_ALL and
/// LC_CTYPE set. Then LANG becomes the user's locale in UTF-8 (`pt-BR` ->
/// `pt_BR.UTF-8`) if installed, else `en_US.UTF-8`.
Map<String, String> withUtf8Locale(
  Map<String, String> env, {
  bool? isMacOS,
  String? localeName,
  bool Function(String locale)? localeExists,
}) {
  if (!(isMacOS ?? Platform.isMacOS)) return env;
  bool has(String key) => (env[key] ?? '').isNotEmpty;
  if (has('LANG') || has('LC_ALL') || has('LC_CTYPE')) return env;
  final exists = localeExists ??
      (l) => Directory('/usr/share/locale/$l').existsSync();
  final base = (localeName ?? Platform.localeName)
      .split(RegExp('[.@]'))
      .first
      .replaceAll('-', '_');
  final candidate = '$base.UTF-8';
  final lang = base.isNotEmpty && exists(candidate) ? candidate : 'en_US.UTF-8';
  return {...env, 'LANG': lang};
}
```

Os parâmetros opcionais são o seam dos testes. Em produção o helper usa `Platform` e o disco.

### 2. Os três pontos de montagem

```dart
// pty_terminal_gateway.dart e sidecar_terminal_gateway.dart
Map<String, String> _terminalEnv(Map<String, String> extraEnv) => {
  ...withUtf8Locale(Platform.environment),
  if (!Platform.isWindows) 'TERM': 'xterm-256color',
  'COLORTERM': 'truecolor',
  ...extraEnv,
};

// pty_task_runner.dart
final env = {
  ...withUtf8Locale(await envWithNodeOnPath()),
  ...
};
```

A ordem mantém o `extraEnv` e o `profile.env` por cima: um `LANG` explícito no perfil vence.

### 3. Testes (`test/data/terminal_locale_env_test.dart`)

- Não-macOS: devolve o mapa igual.
- `LANG`, `LC_ALL` ou `LC_CTYPE` presentes: devolve igual (um caso para cada).
- `localeName: 'pt-BR'` com o locale existente → `LANG=pt_BR.UTF-8`.
- `localeName: 'pt_BR.ISO8859-1'` → `pt_BR.UTF-8` (sufixo trocado).
- Locale inexistente (`'xx-YY'`, ou `'pt'` sem região) → `en_US.UTF-8`.
- Variável vazia (`LANG=''`) conta como ausente.
- O resto do mapa é preservado.

## §4.4. Riscos e impacto

- 🔒 **Tier: `medium`.** Muda o ambiente de todo terminal e de toda task do macOS (o caminho
  principal do produto). O `REVIEW.md` do tower não lista ambiente de terminal do upstream como
  "Always high risk", e a mudança só preenche o que está ausente.
- **Mensagens de CLIs em português:** com `LANG=pt_BR.UTF-8`, ferramentas traduzidas (git,
  coreutils do Homebrew) passam a falar português dentro do Cockpit. É o mesmo comportamento do
  Terminal.app neste Mac. Quem preferir inglês define `LANG` no perfil do terminal ou no shell.
- **Scripts que dependem de locale C:** `sort` e `grep` com `[a-z]` podem ordenar e casar de outro
  jeito. É igual ao Terminal.app, e o shell do usuário já roda assim fora do Cockpit.
- **Sidecar:** o servidor funde o mapa por cima do env dele. Se ele removesse `LANG`, o teste
  manual mostra (o terminal padrão no macOS usa o sidecar ou o PTY direto, e o teste cobre os dois
  se houver toggle).
- **Verificação de código** (procedimento de [[cross-cutting/upstream-contributions]]):
  1. `fvm flutter test test/data/terminal_locale_env_test.dart`: todos passam.
  2. `fvm flutter analyze lib test`: contagem igual ou menor que a baseline, sem `error` nem
     `warning`.
  3. Suíte inteira na cópia `~/cpt` comparada com a baseline `~/cpb`: nenhuma falha nova.
- **Verificação no app** (build ad-hoc em `cockpit/build/macos-next`, trocado pelo humano com
  `cockpit-switch.sh atualizar`, aberto pelo Dock):
  1. Num terminal novo: `echo $LANG` → `pt_BR.UTF-8`, e `locale` sem avisos.
  2. `printf 'seção' | pbcopy; osascript -e 'the clipboard as «class utf8»' | xxd` →
     `73 65 c3a7 c3a3 6f`.
  3. Copiar um trecho com acento pelo Claude Code e colar → `seção`.
  4. Uma task rodando `echo $LANG` → `pt_BR.UTF-8`.
- **Como reverter:** fechar o PR e apagar a branch do fork. Depois do merge, o mantenedor reverte
  o commit. No tower, reverter os commits do trio.

## §4.5. Passos de execução

1. Commitar task e plano aprovados na branch do tower e criar o log de execução. Ler o
   `plan/00-decisions.md` do `remote_pi`.
2. No `remote_pi`: sincronizar o `main` do fork com `upstream/main` (fast-forward e push para
   `origin/main`). Criar a worktree `~/app/wt/remote-pi-utf8-locale` com
   `fix/cockpit-pty-utf8-locale` a partir de `upstream/main`, e registrar o commit base.
3. Escrever o helper e os testes, e rodar o teste do helper.
4. Aplicar o helper nos três pontos e rodar `dart format` nos arquivos tocados.
5. Rodar analyze e suíte (§4.4) e registrar o fim das saídas.
6. Build ad-hoc em `cockpit/build/macos-next` (no clone principal, para o `cockpit-switch.sh`).
   O humano troca o app e abre pelo Dock. Rodo a verificação no app (§4.4), e o humano testa a
   cópia pelo Claude Code.
7. Commit `fix(cockpit): export a UTF-8 LANG to terminals when the app has no locale`, sem
   trailer de IA. Depois, a revisão `reviewer` com contexto limpo.
8. Gate humano. Depois: texto da issue e do PR em inglês, com causa, reprodução por bytes e
   seção "Testing". Os dois são **mostrados ao humano** e publicados só com aprovação no momento.
9. Fechar a execução e propor o `/wiki-sync`.

## §4.6. Escopo

- **Área:** `upstream-cockpit`. Nenhuma área do tower muda.
- No `remote_pi`, só o subprojeto `cockpit/` muda.

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md`: incluir esta contribuição na lista,
  e uma nota de que o Cockpit aberto pelo Dock não herda locale, então o `LANG` vem do app.
