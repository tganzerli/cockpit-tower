---
title: 2026-10-24 — Em modo de comando, o (x) do celular fecha a aba da sessão assistida pela CLI do Cockpit, em dois passos
type: adr
work_id: 2026-10-24_viewer-close-tab-button
scope:
  area: [gateway, viewer]
status: accepted
updated: 2026-10-25
summary: O gateway pode rodar close-tab, segundo verbo de escrita da CLI do Cockpit: só a sessão assistida, em modo de comando, em dois passos, se é o terminal único do workspace ou foi aberta pelo (+) (k26).
revisit_when: "o Cockpit expor o id da aba no pty.sessions (k5) ou o pid no list-tabs, ou corrigir o shell que sobrevive ao fechamento (k21)"
supersedes: []
superseded_by: ""
sources:
  - https://github.com/jacobaraujo7/remote_pi (commit 177aea97)
code_refs:
  - src/close-tab.ts
  - src/session-info.ts
  - src/server.ts
  - web/app.js
related:
  - decisions/2026-10-24_phone-new-tab
  - decisions/2026-10-23_phone-input-client
  - services/gateway
  - contracts/cockpit-protocol-v2
  - work/plans/2026-10-24_viewer-close-tab-button
  - work/plans/2026-10-24_phone-made-tab-close
---

# 2026-10-24 — Em modo de comando, o (x) do celular fecha a aba da sessão assistida

## Contexto

O dono quer fechar pelo iPhone o terminal que está vendo, como faz no Mac pelo (x) da aba (k24). É o par do (+) ([[decisions/2026-10-24_phone-new-tab]]), que exige uma ADR para qualquer outro verbo de escrita da CLI do Cockpit.

O que pesa (plano [[work/plans/2026-10-24_viewer-close-tab-button]], §4.0, e teste real de 2026-10-24):
- **É destrutivo.** Fechar a aba mata o processo dela, que pode ser um agente no meio do trabalho. O app não pede confirmação, nem no (x) do Mac.
- **O tower não sabe com certeza qual aba é a sessão.** O `list-tabs` não traz pid nem id da sessão do servidor. O `COCKPIT_TAB_ID` está no ambiente do shell, mas o macOS não mostra o ambiente de outro processo: testado com `ps -wwE`, dentro e fora do sandbox.
- **A ordem de criação não sobrevive a um reinício do Cockpit.** Os ids das abas são restaurados, e as sessões ganham ids novos na ordem em que o app as recria. Em 2026-10-24, com 5 sessões e 5 abas (uma por workspace), a ordem pareou `s1` (cockpit-tower) com `t16` (gtecq). O `matchTabs` não casou nada, como deve; um fechamento que dependesse dele ficaria recusado quase sempre (execução, passo 11).
- **`cockpit close-tab [<label|tab-id>] [--json]`.** O alvo é posicional; sem alvo, fecha a aba de quem chamou. O app resolve primeiro o id exato, depois um rótulo igual. Ele traz o workspace da aba para frente e fecha depois de responder `{"tabId":…}`.
- **k21.** O fechamento manda só SIGTERM ao grupo da PTY. O zsh interativo ignora, e o shell fica órfão, filho do `cockpit-server`, até um SIGHUP. A sessão sai do `pty.list` mesmo assim (reproduzido de novo em 2026-10-24, pid 80220).

## Decisão

1. **Segundo verbo de escrita.** O gateway pode rodar `close-tab`, e só pelo `src/close-tab.ts`. O alvo é sempre um id de aba posicional que casa com `^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$`: nunca vazio (fecharia a aba do próprio gateway), nunca uma flag. Nenhuma mensagem nova vai ao `cockpit-server`; matar pelo protocolo continua proibido.
2. **Só a sessão assistida,** só com o modo de comando ligado para ela, e com as mesmas cercas da digitação:
   - `Origin` igual e dono do Tailscale;
   - falha fechada: sem a opção `input`, não há `close-tab`.
3. **Dois passos.**
   - **Preparar** (`{type:'close-tab'}`): uma listagem fresca (`pty.list` das sessões vivas, `lsof` das pastas, `list-tabs`). A aba é a **única** possível (`soleTab`):
     - a pasta de cada shell escolhe o workspace local mais específico de alguma aba de terminal (abas de workspaces remotos ficam de fora);
     - **todo** shell vivo precisa estar dentro de uma dessas pastas (pasta desconhecida ou fora de todas recusa);
     - **cada** pasta precisa ter tantos shells quantas abas de terminal (um shell que entrou na pasta de outra aba desequilibra as duas);
     - a pasta da sessão assistida precisa ter **exatamente uma aba de terminal e exatamente esta sessão**. O gateway guarda `{sessão, aba, assinatura dos ids}` e devolve o título da aba como o Cockpit o mostra.
   - **Confirmar** (`{type:'close-tab', confirm:true}`, em até 30 s): uma nova listagem precisa dar a **mesma aba e a mesma assinatura de ids** de sessões e abas.
   - O navegador nunca manda id, pasta nem título.
4. **Recusas:**
   - `command_off`;
   - `no_tab` (o workspace tem outro terminal ou outro shell, alguma pasta desconhecida, ou id inválido);
   - `working` (agente trabalhando, lido de novo em cada passo);
   - `changed` (algo mudou entre os passos);
   - `expired`;
   - `closing` (um pedido por vez por conexão);
   - `log_failed`;
   - `cockpit_unavailable`;
   - `failed` (CLI falhou ou devolveu outro id).
5. **Registro:** uma linha `close-tab` (login, sessão, aba, título), gravada **antes** de rodar. Se a gravação falhar, nada roda.
6. **Confirmação na página,** sempre: um `<dialog>`, nunca `confirm()`. Ela mostra o título da aba vindo do Cockpit ao lado do nome que o viewer dá à sessão.
7. **Depois de fechar:**
   - o modo de comando desliga;
   - o gateway solta a sessão e reenvia a lista;
   - o viewer escolhe a aba vizinha.

## Alternativas descartadas

| Alternativa | Por que foi descartada | O que a traria de volta |
|---|---|---|
| Matar pelo protocolo do `cockpit-server` | Proibido desde a primeira ADR; não fecha a aba no app | — |
| Fechar qualquer aba da faixa | Decisão do dono: só a sessão assistida | — |
| Casamento por ordem de criação, endurecido (decisão inicial do plano) | Quebra depois de qualquer reinício do Cockpit (ids de aba restaurados, de sessão novos): recusaria quase sempre | O Cockpit manter a ordem dos ids de sessão ao restaurar |
| Esperar o id da aba no `pty.sessions` (k5) | Decisão do dono: fazer agora, com casamento endurecido | — |
| O tower matar o shell órfão | Decisão do dono: seria um segundo caminho de "matar processo" | — |
| Ler `COCKPIT_TAB_ID` do ambiente do shell | O macOS não mostra o ambiente de outro processo | — |
| Um passo só, com confirmação só no navegador | O casamento seria lido uma vez; as duas leituras pegam abas abertas ou fechadas no meio | — |
| `confirm()` do navegador | O dono pediu confirmação na página | — |

## Consequências

- **Positivas:** o dono fecha pelo celular o terminal que está vendo, sem tocar no Mac. A ação só acontece quando o tower prova qual é a aba e o dono vê o título dela.
- **Custos aceitos:**
  - **Só o terminal único do workspace fecha pelo celular,** ou um aberto pelo (+) do celular (ver Atualização k26). Fora disso, com dois ou mais terminais no workspace, o (x) recusa (`no_tab`) e o fechamento fica no Mac.
  - **Risco residual de aba errada:** shells que trocaram de pasta em ciclo (o de X entrou em Y e o de Y entrou em X) mantêm o equilíbrio e parecem cada um o único do seu workspace. O título na confirmação é a última barreira.
  - **Um shell fora de qualquer workspace bloqueia o (x) em todas as abas,** porque poderia ser de qualquer aba. Também conta um shell num caminho que só bate com o workspace por link simbólico, como `/tmp` × `/private/tmp`.
  - **Shell órfão (k21).** O processo some da lista, mas o zsh fica vivo até um SIGHUP. A correção é upstream, no k21.
  - **Troca de workspace no Mac.** O app traz para frente o workspace da aba fechada.
  - **Aba vazia.** Fechar a última aba de um workspace deixa uma aba vazia no Mac (comportamento do app).
  - **Rótulo × id.** Se o id sumir entre a segunda leitura e o comando, a CLI tentaria um rótulo igual. O id devolvido seria outro, e a resposta é `failed`.
- **Novas restrições:**
  - `node:child_process` só pode aparecer em `src/session-info.ts` (leitura), `src/new-tab.ts` e `src/close-tab.ts`.
  - Qualquer outro verbo de escrita da CLI continua exigindo uma ADR.

## Como esta decisão é policiada

- Testes do `createCloseTab` com um runner falso:
  - os únicos verbos rodados são `list-tabs`, `list-workspaces`, `lsof` e `close-tab`;
  - argumentos exatos;
  - recusas para segundo terminal ou segundo shell no workspace, pasta desconhecida, shell fora de todos os workspaces, desequilíbrio entre pastas, aba remota, agente trabalhando e id inválido ou vazio;
  - id devolvido diferente → `failed`.
- Testes do servidor:
  - recusa fora do modo de comando, para outro login e sem `input`;
  - preparar não fecha;
  - confirmar sem preparar ou depois de 30 s → `expired`;
  - aba ou assinatura diferentes → `changed`;
  - registro antes, e recusa quando ele falha;
  - campos do navegador ignorados;
  - um pedido por vez.
- Varredura do código-fonte: `node:child_process` só nos três arquivos.
- `REVIEW.md`: linha "Fechar terminal" e item em "Always high risk".

## Revisão prevista

**Gatilho:** o Cockpit expor o id da aba no `pty.sessions` (k5) ou o pid no `list-tabs`, ou o k21 ser corrigido.

**O que a implementação deve ensinar:**
- se a regra do terminal único recusa demais no uso (`no_tab` frequente);
- se o título do Cockpit na confirmação ajuda a reconhecer a aba;
- se o shell órfão se acumula.

**O que se espera:** com o id da aba no protocolo, refinar para casamento exato, liberar workspaces com vários terminais e dispensar a segunda leitura.

## Decisões que esta abre ou fecha

- **Fecha:** fechar terminal pelo celular (k24).
- **Refina:** [[decisions/2026-10-24_phone-new-tab]] (segundo verbo de escrita, terceiro arquivo com `child_process`).
- **Abre:** nada novo.

## Atualização 2026-10-24 (k26): a aba aberta pelo (+)

**Contexto.** No teste do dono no iPhone, o terminal aberto pelo (+) não fechava pelo (x). O (+) abre a aba no workspace da sessão assistida, e o workspace passa a ter dois terminais ([[work/executions/2026-10-24_viewer-close-tab-button]], checagem do dono).

**Emenda à Decisão, item 3 (Preparar).** Antes do `soleTab`, a aba pode vir do **par** gravado no (+) (plano [[work/plans/2026-10-24_phone-made-tab-close]]):
- **Como nasce:** o gateway lê as sessões antes do `new-tab` e as relê depois, até aparecer uma sessão nova. Faz mais uma leitura e grava `{sessão, pid, aba, pasta}` só se for exatamente uma sessão nova, a mesma nas duas leituras.
- **Um (+) por vez no gateway inteiro,** para que um viewer não tome a sessão de outro como a sua.
- **Quando vale:** enquanto a sessão tem o mesmo pid e a aba continua um terminal local na mesma pasta. Se não, vale o `soleTab`.
- **Quando sai:** quando a sessão some da lista, quando a aba é fechada ou quando o gateway reinicia (o par vive só na memória).

O verbo, as cercas, os dois passos, a assinatura e o registro não mudam. Por isso a mudança é uma emenda, não uma ADR nova.

**Risco residual aceito:** um terminal aberto no Mac no mesmo instante que o (+), cuja sessão se assente antes da nossa, seria pareado por engano. O título na confirmação continua sendo a última barreira.

**Policiada por:**
- testes do `close-tab`: o par com dois terminais na pasta, e a queda para o `soleTab` por pid, aba, pasta, aba remota ou aba que não é terminal;
- testes do servidor:
  - uma sessão nova vira par;
  - nenhuma ou duas sessões novas não viram par;
  - uma segunda sessão entre as leituras, ou a saída da nossa, não vira par;
  - o (+) de outro viewer é recusado durante o pareamento;
  - um viewer que sai libera o próximo (+);
  - o par cai quando a sessão sai da lista e depois do fechamento;
- a linha "Fechar terminal" do `REVIEW.md`.

## Nota 2026-10-25 (k27): o `soleTab` também serve à exibição

O viewer passou a usar o `soleTab` para mostrar o título da aba quando a ordem de criação não vale, junto com um par visto no nascimento da aba ([[services/gateway]], "Casamento aba ↔ sessão"; plano [[work/plans/2026-10-25_restart-tab-titles]]). **Esta decisão não muda.** O (x) continua achando a aba só pelo par do (+) e pelo `soleTab` (`src/close-tab.ts:47`). O par do nascimento não entra no fechamento: o `REVIEW.md` trata o uso dele no (x) como falha.

## Referências

- Plano: [[work/plans/2026-10-24_viewer-close-tab-button]] (§4.0, com as citações do `remote_pi`).
- Teste real: [[work/executions/2026-10-24_viewer-close-tab-button]] (passo 2).
- k26: [[work/executions/2026-10-24_phone-made-tab-close]] (teste real e checagem do dono no iPhone).
