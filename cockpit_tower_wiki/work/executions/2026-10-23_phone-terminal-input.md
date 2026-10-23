---
title: 2026-10-23 — Comandos pelo celular, fase 1: digitar na sessão aberta
type: execution
work_id: 2026-10-23_phone-terminal-input
scope:
  area: [gateway, viewer, tower-cli]
status: done
updated: 2026-10-23
summary: O iPhone digita na sessão assistida em modo de comando — só pty.input, com Origin, dono do Tailscale e registro local; ADR nova substitui o somente leitura e o tower nunca envia pty.ack.
topic: [contract, ui]
related:
  - decisions/2026-10-23_phone-input-client
  - decisions/2026-10-22_read-only-client
  - "[[decisions/2026-10-23_phone-input-client]]"
  - "[[decisions/2026-10-22_read-only-client]]"
  - "[[contracts/cockpit-protocol-v2]]"
  - "[[services/gateway]]"
  - "[[flows/tower-on-off]]"
  - "[[overview]]"
  - "[[_meta/index]]"
---

# Execution Log — 2026-10-23_phone-terminal-input

> **Live log.** Atualizado a cada passo concluído.

## Metadata

- **ID:** `2026-10-23_phone-terminal-input`
- **Task:** [[work/tasks/2026-10-23_phone-terminal-input]]
- **Plan:** [[work/plans/2026-10-23_phone-terminal-input]]
- **Status:** `done`
- **Start:** `2026-10-23`
- **Finish:** `2026-10-23`
- **Branch:** `feat/2026-10-23_phone-terminal-input__tower` (base `dev` @ `0e9efcd`)
- **Scope:** `[gateway, viewer, tower-cli]`
- **Risk tier:** `high`

## Checklist (espelha o plano §4.5)

- [x] (1) Criar a branch e mover o cartão k1 para "Em curso".
- [x] (2) Escrever `decisions/2026-10-23_phone-input-client.md` (`status: proposed`).
- [x] (2a) Portão da ADR: o dono aprova o texto; a ADR vira `accepted` e a antiga `superseded`.
- [x] (3) `src/protocol.ts` + `test/protocol.test.ts`.
- [x] (4) `src/cockpit-client.ts`, `test/fake-cockpit-server.ts`, `test/client.test.ts`.
- [x] (5) `src/input.ts` + `test/input.test.ts`.
- [x] (6) `src/input-log.ts` + `test/input-log.test.ts`.
- [x] (7) `src/server.ts` + `test/server.test.ts`.
- [x] (8) `src/tailnet-identity.ts` + teste; `src/main.ts`; `bin/tower`.
- [x] (9) Portão do gateway: `npm test` verde.
- [x] (10) `web/index.html`, `web/app.js`, `web/style.css`.
- [x] (11) README, package.json, REVIEW.md, comentários; grep de "read-only".
- [x] (12) `npm test`, trailers e wiki-lint à mão.
- [x] (13) Verificação controlada no Mac (aba descartável).
- [x] (14) Revisão pelo `reviewer`, tier `high`.
- [x] (15) Smoke no iPhone pelo dono.
- [ ] (16) Fechar a execução, `/wiki-sync`, `/wiki-index decisions`, cartões k1/k4.

## Activity (chronological)

### `2026-10-23` — início
- Plano aprovado pelo dono. Branch criada a partir de `dev` @ `0e9efcd`.
- Cartão k1 movido para "Em curso" em `cockpit_tower_wiki/board.kanban`.
- ADR escrita como `proposed`. A ADR antiga só vira `superseded` depois do portão 2a.

### `2026-10-23` — portão da ADR e código
- Dono aprovou a ADR. Nova `accepted`; antiga `superseded` com nota no topo.
- Passos 3–8: `src/protocol.ts`, `src/cockpit-client.ts`, `src/input.ts`, `src/input-log.ts`, `src/server.ts`, `src/tailnet-identity.ts`, `src/main.ts`, `bin/tower`, com testes. O teste de mensagem grande passou de 10 000 para 70 000 bytes, por causa do limite novo de 64 KiB.
- Passos 10–11: viewer (`web/`), README, `package.json`, `REVIEW.md` (linha nova "Caminho de digitação").
- Passos 12–13: validações abaixo.

## Commits

> Os hashes abaixo são do histórico de trabalho. Antes do PR, as rodadas de correção foram dobradas nos commits lógicos (ver "Commits do PR").

- `f231dc7` docs(work): open phone-terminal-input trio, propose phone-input ADR, move k1 to in progress
- `4e91f9d` feat(gateway): let the owner type into the watched session in command mode
- `936da12` feat(viewer): add the Command button, composer and special-key bar
- `0b37ba3` docs(wiki): regenerate the work and decisions indexes
- `7154e9d` docs(work): log phone-terminal-input steps 2a-13 and validations
- `22079fa` fix(gateway): turn command mode off when Cockpit drops or the session leaves the list; require the origin in dev
- `537a4cb` fix(gateway): derive the dev origin from the bound port, and only when typing is on

### Commits do PR (depois de dobrar as rodadas de correção)

- `f231dc7` docs(work): open phone-terminal-input trio, propose phone-input ADR, move k1 to in progress
- `b2f43f8` docs(decisions): accept the phone-input ADR and supersede the read-only one
- `d68a543` feat(gateway): let the owner type into the watched session in command mode
- `8f80305` feat(viewer): add the Command button, composer and special-key bar
- `9a9f922` docs: describe typing from the phone in README, package.json and REVIEW.md
- o commit deste log (docs(work)), que fecha a execução

Árvore final idêntica à do histórico de trabalho (`git write-tree` antes e depois).

## Divergences from the plan

- **Smoke no iPhone (passo 15):** três ajustes no viewer, no commit `d8fadf8`:
  - **Item 11:** travar o telefone não desligava o modo, porque o iOS manteve o WebSocket aberto e a regra "conexão nova começa desligada" não se aplicava. Agora a página manda `command off` quando fica oculta (`visibilitychange`).
  - **Item 12:** com o teclado aberto, sobrava uma faixa cinza e o terminal não mostrava a última linha. A página passou a ficar fixa na área visível (altura **e** deslocamento do `visualViewport`), e um `ResizeObserver` mantém o terminal no fim quando ele encolhe.
  - **Pedido do dono:** com o teclado aberto, menos espaço para o que não é digitação. Somem a faixa de abas e a segunda linha do título, e o topo, as teclas e a caixa ficam mais baixos. Todas as teclas ficam.
- **Item 9:** texto de várias linhas chegou com as quebras, como colagem. O dono prefere assim; nada muda.

- **Passo 2a (respostas do dono):** "aprovado" sem detalhar os quatro pontos; ficou o que a ADR propunha: registro com o texto inteiro, botão "Command", 16 KiB, modo desliga ao trocar de sessão ou reconectar.
- **Commit `4e91f9d`:** levou junto a troca de status das ADRs (`accepted`/`superseded`), que é wiki. Separar num commit `docs` na limpeza antes do PR.
- **Viewer:** o compositor é um filho flex do `body` (o `main` encolhe), não um rodapé fixo com espaço no `#view`; e a página ajusta a altura ao `visualViewport` com o compositor aberto, para o teclado do iOS não cobri-lo. ⚠ unverified no iPhone (smoke, passo 15).
- **Verificação controlada (passo 13):** feita com um **segundo gateway** de teste (porta 7699, token, origem e dono de teste), e não com `tower on`, para não reiniciar o gateway do dono. As recusas por `Origin` e por login foram testadas nesse gateway, com cabeçalhos montados à mão; a igualdade real entre `Tailscale-User-Login` e `LoginName` fica para o smoke.
- **Passo 2:** a ADR antiga é marcada `superseded` só no portão 2a, e não junto com a escrita da nova, para não ficar sem decisão vigente enquanto a nova é `proposed`.

## Validations

- **Portão do gateway (passo 9) e final (passo 12):** `npm test`
  ```
  ℹ tests 84
  ℹ pass 84
  ℹ fail 0
  ```
- **Trailers:** `python3 scripts/ci/check_commit_trailers.py origin/dev` → `ok — 3 new commit(s) in origin/dev..HEAD, no LLM attribution`
- **Wiki-lint:** `python3 .claude/skills/wiki-lint/lint.py --root .` → primeiro `✗ catalog-drift: 2` (índices de trabalho e de decisões); depois de `/work-index` e `/wiki-index decisions`, exit `0`. Ficam 5 avisos `stale` (overview, contrato, gateway, tower-on-off, cockpit-exec-process-group), que o `/wiki-sync` resolve.
- **Identidade do Tailscale:** `tailscale status --json | node src/tailnet-identity.ts 8443` → duas linhas preenchidas (origem e dono; valores não anotados).
- **Verificação controlada no Mac (passo 13)**, gateway de teste na porta 7699 ligado ao Cockpit real, aba descartável `tower-input-test` com `cat -v` (sessão `s5`, achada pelo pid do shell pai do `cat`):
  - recusas: `wrong origin status: 404`, `no origin status: 404`, `other login access: {"type":"access","input":false}`; `input` antes do `command` → `{"ok":false,"reason":"command_off"}`;
  - `command` → `{"type":"command","on":true,"id":"s5"}`;
  - bytes, lidos com `cockpit read-tab`: `abc^[^[[A^[[B^[[C^[[D   ^[[Z` e o Enter fechou a linha (o `cat` repetiu-a);
  - ^C: `cat ended by ^C`;
  - colagem, depois de `printf '\e[?2004h'; cat -v`: `^[[200~line1` / `line2^[[201~`;
  - registro: `stat -f %Lp` → `600`; 12 linhas, uma por envio aceito; as recusas não foram gravadas.
  - Gateway de teste parado e aba fechada no fim.

- **Smoke no iPhone pelo dono (passo 15), 2026-10-23:** antes, `tower on` falhou com "Tailscale is stopped." (o Tailscale do Mac estava desligado; `tailscale status --json` → `BackendState: Stopped`), sem relação com a mudança. Com o Tailscale ligado, `bin/tower status` → `gateway: on`, `tailnet: published on port 8443`, e `gateway.config` com origem e dono preenchidos (o log não tem "typing disabled"). O dono confirmou os itens 1–10 e, depois dos ajustes acima, 11 e 12 ("tudo está ok", "ficou bom"). Isso confirma, no aparelho real, que o `Tailscale-User-Login` bate com o `LoginName` e que o `Origin` do Safari bate com a origem calculada pelo `tower on`.

## Agent review

Tier `high`, modo profundo, `reviewer` em contexto limpo. Rodada 1: `0e9efcd..7154e9d`. Rodada 2: `7154e9d..22079fa`. Rodada 3: `22079fa..537a4cb` → `Nothing to fix.` Depois das correções, `npm test` → `ℹ tests 89` / `ℹ pass 89` / `ℹ fail 0`.

| Rodada | Achado | Tag | Resultado | Promovido para |
|---|---|---|---|---|
| 1 | Modo de comando sobrevivia à queda do Cockpit dentro do mesmo WebSocket (`src/server.ts`, handlers `disconnected`/`reconnected`) | Important | fixed (`22079fa`) | ADR decisão 3 (lista completa de quando o modo desliga) |
| 1 | `--dev` + `TOWER_INPUT_LOG` deixava qualquer página do Mac digitar (sem token, sem `Origin`) | Important | fixed (`22079fa`, refeito em `537a4cb`) | ADR decisão 6 (dev também exige `Origin`) |
| 1 | Sem teste para término da sessão, queda do Cockpit e sessão que some da lista | Important | fixed (`22079fa`) | — |
| 1 | `import.meta.main` exige Node 24.2, `engines` diz 23.6 | Nit | nit-ignored (mesmo padrão de `src/serve-status.ts`) | — |
| 1 | Limite no navegador não contava os marcadores de colagem | Nit | fixed (`22079fa`) | — |
| 1 | README dava padrão de `TOWER_INPUT_LOG` que só o `bin/tower` aplica | Nit | fixed (`22079fa`) | — |
| 2 | Origem de dev fixada sempre e pela porta pedida: quebrava a leitura no dev | Important | fixed (`537a4cb`) | — |
| 2 | `listed` não era limpo na queda do Cockpit | Nit | fixed (`537a4cb`) | — |

**Promoção (§5.6):** busca nas execuções anteriores por `Origin`/WebSocket entre sites e por reconexão com seleção não achou ocorrência; nenhum achado é repetido.

## Affected wiki pages

- Ver plano §4.7.
