---
title: 2026-10-23 — Em modo de comando, a PTY assume o tamanho do celular e o tower devolve o tamanho do Mac
type: adr
work_id: 2026-10-23_phone-pty-resize
scope:
  area: [gateway, viewer]
status: accepted
updated: 2026-10-25
summary: Libera pty.resize só em modo de comando, para a sessão assistida, com tamanho limitado e registrado; o tower guarda o tamanho do Mac e o devolve uma vez por ciclo, se a PTY ainda estiver no tamanho que ele pôs.
revisit_when: "o app do Cockpit passar a ler ou anunciar o tamanho da PTY (broadcast de tamanho)"
supersedes: []
superseded_by: ""
sources:
  - https://github.com/jacobaraujo7/remote_pi (commit 7d923ab)
code_refs:
  - src/protocol.ts
  - src/server.ts
  - src/input.ts
  - web/app.js
related:
  - decisions/2026-10-23_phone-input-client
  - contracts/cockpit-protocol-v2
  - services/gateway
  - work/plans/2026-10-23_phone-pty-resize
---

# 2026-10-23 — Em modo de comando, a PTY assume o tamanho do celular e o tower devolve o tamanho do Mac

## Contexto

Com a fase 1 ([[decisions/2026-10-23_phone-input-client]]), o iPhone digita na sessão, mas a PTY continua no tamanho do Mac. As TUIs dos agentes desenham para cerca de 140 colunas, e a visão do celular quebra as linhas, então parágrafos e caixas ficam irregulares. O dono quer o comportamento do antigo `window-size latest` do tmux: quem comanda define o tamanho.

O que pesa na decisão (plano [[work/plans/2026-10-23_phone-pty-resize]], §4.0):

- **O resize externo vale e fica.** Num teste no Cockpit real, um `pty.resize` de um segundo cliente mudou a PTY (`stty size` → `40 45`) e ficou assim por 20 s, sem o app reagir. O servidor aplica o tamanho a todos e atualiza o `pty.list` (`remote_pi: cockpit/packages/cockpit_engine/lib/src/pty/native_terminal_service.dart:292-296`; `cockpit/packages/cockpit_server/lib/src/remote_server.dart:603-616,658-663`).
- **O app nunca devolve o tamanho sozinho.** Ele só manda o tamanho quando a grade dele muda: janela, divisória, painel ou fonte. Ele também não lê o tamanho de volta (`flterm: controller/terminal_session.dart:460-469`). Abas Neovim são a exceção, ao abrir arquivo (`remote_pi: cockpit/lib/app/cockpit/ui/viewmodels/cockpit_viewmodel.dart:1469,1537`).
- **Por isso a restauração é do tower.** Sem ela, o Mac fica no tamanho do celular até alguém mexer no layout.

## Decisão

1. **Uma porta a mais para o Cockpit.**
   - O tower envia `hello`, `pty.list`, `pty.attach`, `pty.detach`, `pty.input` e `pty.resize`. `pty.kill`, `pty.open`, `pty.ack`, `rpc` e `rpc.res` continuam recusados.
   - Só uma função monta `pty.resize`. Ela recusa valores fora de **20–500 colunas** e **5–300 linhas**.
2. **O tamanho segue o modo de comando.**
   - O resize só vale com o modo ligado, e só para a sessão assistida. Um id vindo do navegador é ignorado.
   - O navegador mede e manda `resize {cols, rows}` depois que o gateway confirma o modo, e de novo quando a fonte muda.
   - O gateway exige números inteiros e prende os valores dentro da faixa.
3. **Linhas = altura da visão sem teclado**, medida ao ligar o modo. Abrir ou fechar o teclado não redimensiona. Uma mudança de fonte recalcula usando essa mesma altura.
4. **Restauração obrigatória, uma vez por ciclo.**
   - O tamanho original sai de um `pty.list` feito na hora do primeiro resize do ciclo.
   - Todo desligamento do modo devolve esse tamanho:
     - `command off`;
     - troca de sessão;
     - página oculta;
     - a sessão termina ou some da lista;
     - perda do Cockpit;
     - fechamento da conexão da página, inclusive por inatividade;
     - parada do gateway.
   - **Só devolve se a PTY ainda estiver no tamanho que o tower pôs.** Se não estiver, o Mac já pôs o dele, e nada é enviado.
   - Com o Cockpit fora do ar, a devolução fica pendente e é tentada na reconexão, com a mesma checagem. Se a página fechar antes, ela se perde.
5. **O Mac pode retomar o tamanho.** Se a lista periódica mostrar que a sessão em comando mudou de tamanho por fora, o tower desiste da devolução e avisa a página. Ele não reaplica o tamanho do celular.
6. **Um espectador por vez dimensiona uma sessão.** Um segundo espectador que tente dimensionar a mesma sessão recebe `busy`. Ele continua podendo digitar.
7. **Registro.**
   - Cada resize vira uma linha `resize`, com o tamanho e o `from`, gravada antes do envio. Se a gravação falhar, o resize é recusado.
   - Cada devolução vira uma linha `restore`, gravada só quando der: devolver é o caminho seguro e não pode depender do registro.
8. **O resto não muda:** `Origin`, dono do Tailscale e token. O tower nunca envia `pty.ack`.

## Alternativas descartadas

| Alternativa | Por que foi descartada | O que a traria de volta |
|---|---|---|
| Devolver sem checar o tamanho atual | Sobrescreve um layout novo do Mac com um tamanho velho, e o app não percebe | O app passar a reaplicar o tamanho dele sozinho |
| Reaplicar o tamanho do celular quando o Mac muda | Briga com quem está no Mac | — |
| Mandar o tamanho dentro de `command {on, cols, rows}` | A altura só é conhecida depois que a caixa de texto abre, e a mudança de fonte precisa de outra mensagem de qualquer jeito | — |
| Redimensionar ao abrir o teclado | Decisão do dono: um redesenho a cada toque | O dono pedir |
| "O último ganha" entre duas páginas | O segundo guardaria o tamanho do primeiro celular como original e o devolveria ao Mac | — |
| Pegar o tamanho original da lista periódica | Pode ter até 5 s, e o layout pode ter mudado nesse intervalo | — |
| Redimensionar fora do modo de comando ("Fit" só para ler) | Decisão do dono: a aba do Mac encolheria sem ninguém comandar | O dono pedir |

## Consequências

- **Positivas:** os agentes se redesenham na largura do celular, sem parágrafos quebrados, e o Mac volta ao tamanho dele sozinho.
- **Custos aceitos:**
  - enquanto o celular comanda, o Mac vê a sessão no tamanho do celular, porque o resize vale para todos;
  - mexer no layout do Mac nesse período devolve o tamanho ao Mac na hora;
  - uma aba oculta no Mac pode guardar um tamanho velho;
  - girar o telefone com o modo ligado não redimensiona: basta desligar e ligar o modo;
  - se o gateway morrer sem rodar a devolução (SIGKILL), o Mac fica no tamanho do celular até o layout dele mudar.
- **Novas restrições:** o texto `pty.resize` só aparece no arquivo do protocolo; toda nova mensagem para o Cockpit continua exigindo uma ADR.

## Como esta decisão é policiada

- Testes do `encode` e da função que monta o resize, inclusive os limites da faixa.
- Varredura do código-fonte: `pty.input` e `pty.resize` só podem aparecer no arquivo do protocolo, e `pty.kill`, `pty.open`, `pty.ack` e `rpc` em nenhum outro lugar.
- Testes do servidor para cada gatilho de devolução, para a checagem de tamanho, para `busy` e para o registro.
- `REVIEW.md`: o caminho de tamanho é "Always high risk".

## Revisão prevista

**Gatilho:** o app do Cockpit passar a ler ou anunciar o tamanho da PTY. (A fase 3, k3, não precisou de outro tamanho: [[decisions/2026-10-23_phone-fullscreen-scroll]].)

**O que a implementação deve ensinar:**
- se a devolução falha em algum caso real e deixa o Mac pequeno;
- se o servidor trata `pty.list` e `pty.resize` de uma mesma conexão em ordem;
- se a medida de largura no Safari bate com o que as TUIs usam.

**O que se espera:** confirmar.

**Reverificada em 2026-10-25:** depois de 2026-10-23, `src/server.ts` e `web/app.js` só ganharam o (+), o (x), a fonte da caixa de texto e a gaveta por workspace (`78b22ad`, `abb2932`, `d1462bd`, `5fd3cbc`); o caminho de tamanho e devolução não mudou, e o gatilho não disparou ([[work/executions/2026-10-25_wiki-stale-pages]]).

## Decisões que esta abre ou fecha

- **Fecha:** o tamanho da PTY no celular (k2).
- **Abre:** rolagem em tela cheia (k3), feita em [[decisions/2026-10-23_phone-fullscreen-scroll]] sem outro tamanho; o shell que continua vivo ao fechar uma aba no Cockpit (k21, upstream).

## Referências

- Plano: [[work/plans/2026-10-23_phone-pty-resize]] (§4.0, com as citações completas).
- `remote_pi:` citações no commit `7d923ab`. `flterm:` é `~/.pub-cache/git/libghostty-a342abbec8f744714bf6c38fb5516acf19114486/packages/flterm/lib/src/`.
