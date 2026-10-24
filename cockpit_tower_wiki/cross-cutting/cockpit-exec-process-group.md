---
title: Processos iniciados pelo Cockpit herdam o grupo do app
type: discovery
scope:
  area: [tower-cli, panel]
status: stable
updated: 2026-10-24
summary: Um processo de fundo iniciado por cockpit exec ou por um .panel sobrevive ao fim do comando, mas fica no grupo de processos do app Cockpit; use setsid via perl.
sources: []
code_refs:
  - bin/tower
related:
  - flows/tower-on-off
  - work/executions/2026-10-22_tower-cockpit-panel
---

# Processos iniciados pelo Cockpit herdam o grupo do app

Vale para qualquer ferramenta deste repositório disparada de dentro do Cockpit, seja um botão de `.panel`, `cockpit exec` ou uma task.

## O que foi observado

Teste de 2026-10-22, registrado em [[work/executions/2026-10-22_tower-cockpit-panel]] e no plano do mesmo trabalho, §4.0:

- `cockpit exec --json -- 'nohup sleep 300 >/dev/null 2>&1 & echo $!'` terminou, e o `sleep` **continuou vivo**, com PPID 1.
- Mas ele estava com o **PGID do app Cockpit**. O `ps -g` desse grupo listava o próprio `Cockpit`, que é o líder, o `cockpit-server … --exit-on-parent-close`, o `caffeinate -i -w <pid do Cockpit>` do botão do raio e o `sleep` do teste.
- O `exec` não tem um timeout curto por padrão: um `sleep 35` terminou com `"timedOut":false`.

## Por que importa

Um sinal enviado ao grupo inteiro, por exemplo quando o app fecha, alcançaria também os processos da ferramenta. No caso do tower, seriam o gateway e o `caffeinate`, e o Mac poderia dormir com a porta ainda publicada. ⚠ unverified: não se testou se o Cockpit realmente sinaliza o grupo ao fechar, porque fechar o app derrubaria a sessão do agente.

## O que fazer

- **Abrir uma sessão própria.** O macOS não tem `setsid(1)`, mas o `perl` padrão tem: `perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV'`. O `exec` mantém o pid, então pid files e checagens por comando continuam válidos. No tower isso é o array `DETACH` (`bin/tower:26`), usado no gateway (`bin/tower:113`) e no `caffeinate` (`bin/tower:127`). É um array, e não uma função, porque o `nohup` não executa funções do bash.
- **Conferir com `ps`.** Depois de ligar pelo `cockpit exec`, o PGID deve ser igual ao pid do processo. Em 2026-10-22 foi `8936 PGID 8936` para o gateway e `8978 PGID 8978` para o `caffeinate`.
- **Passar um `--timeout` explícito** no `exec` de ações demoradas (`panel/tower.panel:145`).
