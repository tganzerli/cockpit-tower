---
title: 2026-11-09 — Cockpit larga a saída de áudio depois do chime, contribuição upstream
type: plan
work_id: 2026-11-09_cockpit-chime-release-audio
scope:
  area: [upstream-cockpit]
status: executed
risk: low
updated: 2026-11-09
summary: Parar o Player do chime (e do preview das Configurações) quando o som termina, para o mpv sair do arquivo carregado pelo keep-open e fechar o AO CoreAudio; medir antes e depois, issue e PR upstream.
topic: [performance, bugfix]
related:
  - work/tasks/2026-11-09_cockpit-chime-release-audio
  - cross-cutting/upstream-contributions
---

# Plano — Cockpit larga a saída de áudio depois do chime

> Cobre [[work/tasks/2026-11-09_cockpit-chime-release-audio]]. O código é do `remote_pi`, no
> fork `tganzerli/remote_pi` (`~/app/remote_pi`), base `upstream/main` `8fe92dc2`. As citações
> `remote_pi:` são relativas a `cockpit/`. As citações `media_kit:` são relativas a
> `~/.pub-cache/git/media-kit-44ba261c463f5e2cef926d35438a95ee63cc5cf9/media_kit/`, a ref
> pinada em `remote_pi:pubspec.yaml:345-349`.

## §4.0. Análises pré-plano

A investigação foi feita no thread principal, sem agentes: eram poucas leituras, todas com
alvo conhecido.

- **Quem usa áudio no Cockpit:** só o media_kit (libmpv). Há três usos de `Player`: o chime
  (`remote_pi:lib/app/cockpit/data/notifications/local_notifier.dart:29`), o preview das
  Configurações (`remote_pi:lib/app/settings/ui/settings_page.dart:1664`) e o player de mídia
  do viewer (`remote_pi:lib/app/cockpit/ui/widgets/media_view.dart:43,57`). O Rust do app não
  tem dependência de áudio.
- **O chime nasce no boot e vive até o fim:** o `LocalNotifier.init()` cria o `Player`
  (`local_notifier.dart:36`), chamado no boot do módulo
  (`remote_pi:lib/app/cockpit/cockpit_module.dart:168-173`). Cada `play()` só faz `setVolume`
  e `open` (`local_notifier.dart:103-131`). Não há `stop` nem `dispose`.
- **O mpv do media_kit usa `keep-open=yes`** (`media_kit:lib/src/player/native/player/real.dart:2398-2401`).
  Ao fim do arquivo, o mpv mantém ele carregado e só sinaliza `eof-reached`, que o media_kit
  publica como `stream.completed` (`real.dart:1952`).
- **O `stop()` do media_kit** manda `stop`, `playlist-clear` e `playlist-play-index none` ao mpv
  (`real.dart:250-273`). Com `idle=yes`, o mpv volta ao modo ocioso sem arquivo.
  ⚠ unverified: que o mpv fecha o AO nesse momento. É o que o passo de medição prova.
- **O viewer de mídia** já dá `dispose` ao fechar a aba (`media_view.dart:12-14`). Uma mídia aberta
  é uma escolha do usuário, então fica fora do escopo.

## §4.1. Resumo e entendimento

**O problema:** o primeiro chime abre a saída de áudio, que só fecha quando o app sai. Por isso
o Cockpit ocioso mantém o `coreaudiod` trabalhando e atrapalha a medição de bateria.

**A correção:** quando o chime termina (`completed == true`), chamar `stop()` no player. O arquivo
sai, o mpv fica ocioso e o AO fecha. O próximo `play()` reabre tudo, como já faz hoje (o `open`
sempre recarrega). O preview das Configurações recebe o mesmo tratamento.

**Alternativa descartada:** passar `keep-open=no` ao mpv. O media_kit fixa essa opção e baseia o
`completed` nela (`real.dart:1495`). Mudá-la seria mexer no comportamento da biblioteca para
todos os players, inclusive o do viewer.

## §4.2. Arquivos afetados

**`remote_pi`** (branch `fix/cockpit-chime-release-audio` no fork, a partir de `upstream/main`):

| Arquivo | Mudança |
|---|---|
| `lib/app/cockpit/data/notifications/local_notifier.dart` | assina `stream.completed` do `_chime` e chama `stop()` ao terminar, com um comentário explicando o `keep-open` |
| `lib/app/settings/ui/settings_page.dart` | idem para o `_player` do preview, cancelando a assinatura no `dispose` |

**Tower** (branch `docs/2026-11-09_cockpit-chime-release-audio__wiki`): o trio e a página
`cross-cutting/upstream-contributions.md`.

- 🔒 **Regras afetadas:** nenhuma.
- 🔒 **ADRs afetadas:** nenhuma. O passo 1 lê o `plan/00-decisions.md` do `remote_pi`, e um
  conflito sobre áudio ou notificações para a execução.

## §4.3. Mudanças e justificativa

### 1. `local_notifier.dart`

Logo depois de `_chime = Player();` (`:36`):

```dart
// media_kit runs mpv with keep-open=yes, so a finished clip stays loaded and
// the CoreAudio output stays open for the app's lifetime, keeping coreaudiod
// busy while idle. Stopping on completion unloads it and releases the device;
// the next play() reopens it.
_chime!.stream.completed.listen((done) {
  if (done) unawaited(_chime?.stop());
});
```

O `LocalNotifier` vive enquanto o app vive, então a assinatura não precisa ser cancelada.
O `stop()` fica num `try`/`catchError` silencioso, como o resto do som, que é best-effort.

### 2. `settings_page.dart`

Em `_preview` (`:1672-1684`), ao criar o `_player`, guardar a assinatura do `completed` com o
mesmo `stop()` e cancelá-la no `dispose` (`:1666-1670`), antes do `_player?.dispose()`.

### 3. Testes

Não há testes do `LocalNotifier` hoje, e o `Player` é uma classe concreta da libmpv. Um teste
unitário exigiria um seam novo só para isso. O comportamento que importa, o AO ser liberado, só
aparece no app real. Por isso a prova é a medição antes e depois (§4.4), mais o analyze e a
suíte existente.

## §4.4. Riscos e impacto

- 🔒 **Tier: `low`.** São duas assinaturas de stream num caminho de som best-effort, sem tocar
  em terminal, rede, autenticação, workflows ou código do tower.
- **Corrida entre o `stop` e um chime novo:** se um `play()` chegar logo depois do `completed`,
  o `stop` atrasado poderia cortar o som novo. As chamadas do media_kit passam por um lock
  (`real.dart:250-255`, `synchronized`) e o listener roda no mesmo microtask do evento, então o
  `stop` entra na fila antes. Verificação: dois chimes seguidos no teste manual.
- **O `stop` pode não liberar o AO:** nesse caso a medição depois mostra o contexto ainda aberto.
  A execução para e volta ao humano com a alternativa (`dispose` e recriar o player a cada
  toque).
- **A premissa pode estar errada:** se a medição antes não mostrar contexto aberto depois do
  chime, a execução para e o humano decide.
- **Medição** (o app é aberto pelo humano, nunca pelo Bash do Claude):
  1. Fechar outros apps que tocam áudio. Com o Cockpit aberto e ainda sem chime, guardar
     `pmset -g assertions | grep coreaudiod` e a CPU do `coreaudiod` com `top -l 5 -pid <pid> -stats cpu`.
  2. Tocar o chime pelo preview das Configurações e fechar a página, ou deixar um agente
     terminar um turno. Esperar 30 s e repetir as leituras. Para atribuir o contexto ao
     Cockpit, usar `log show --last 2m --predicate 'process == "coreaudiod"'` filtrando pelo
     PID do Cockpit.
  3. Fazer isso no build atual (antes) e no build corrigido (depois).
- **Verificação de código** (clone e cópias, como em [[cross-cutting/upstream-contributions]]):
  1. `fvm flutter analyze lib test`: contagem igual ou menor que a baseline, sem `error` nem `warning`.
  2. Suíte inteira na cópia `~/cpt` comparada com a baseline `~/cpb`: nenhuma falha nova.
  3. Build ad-hoc em `cockpit/build/macos-next` e teste manual: chime, dois chimes seguidos,
     som customizado e volume.
- **Como reverter:** fechar o PR e apagar a branch do fork. Depois do merge, o mantenedor reverte
  o commit. No tower, reverter os commits do trio.

## §4.5. Passos de execução

1. Criar no tower a branch `docs/2026-11-09_cockpit-chime-release-audio__wiki` e o log de
   execução. Ler o `plan/00-decisions.md` do `remote_pi`.
2. Medição **antes** com o build em uso (§4.4). O humano toca o chime, e eu leio as métricas.
3. No `remote_pi`, numa worktree própria, criar `fix/cockpit-chime-release-audio` a partir de
   `upstream/main` e registrar o commit base.
4. **Issue:** escrever o texto em inglês, com o problema, a causa e a medição, e **mostrar ao
   humano**. Publicar só com aprovação no momento.
5. Aplicar as mudanças 1 e 2 e rodar `dart format` nos arquivos tocados.
6. Rodar o analyze e a suíte (§4.4) e registrar o fim das saídas.
7. Build ad-hoc em `macos-next`. O humano troca o app (`cockpit-switch.sh`), e repito a medição
   (**depois**) e o teste manual.
8. Commit `fix(cockpit): release the audio output after the notification chime`, sem trailer de
   IA. Depois, a revisão `reviewer` com contexto limpo.
9. Gate humano. Depois: push para o fork e o texto do PR em inglês, citando a issue e com uma
   seção "Testing" que traz a medição. O PR é **mostrado ao humano** e aberto só com aprovação
   no momento.
10. Fechar a execução e propor o `/wiki-sync`. Avisar a sessão da bateria de que o Cockpit pode
    ficar aberto, se o PR (ou o build do fork) estiver em uso.

## §4.6. Escopo

- **Área:** `upstream-cockpit`. Nenhuma área do tower muda.
- No `remote_pi`, só o subprojeto `cockpit/` muda.

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md`: incluir esta contribuição na
  lista, e uma nota de que o `Player` do media_kit mantém o AO aberto no fim do arquivo
  (`keep-open`).
