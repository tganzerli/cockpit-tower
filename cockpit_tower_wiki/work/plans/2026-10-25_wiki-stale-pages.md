---
title: 2026-10-25 — Páginas da wiki marcadas stale
type: plan
work_id: 2026-10-25_wiki-stale-pages
scope:
  area: [wiki]
status: executed
risk: low
updated: 2026-10-25
summary: Corrige no overview a regra do (x), anota as citações históricas da ADR do cliente só-leitura, atualiza as pendências upstream e registra a reverificação das duas ADRs de 2026-10-23, zerando os avisos stale do lint.
topic: [wiki, knowledge]
related:
  - work/tasks/2026-10-25_wiki-stale-pages
  - overview
  - cross-cutting/upstream-contributions
  - decisions/2026-10-22_read-only-client
  - decisions/2026-10-23_phone-pty-resize
  - decisions/2026-10-23_phone-fullscreen-scroll
---

# Plano — Páginas da wiki marcadas stale

> Cobre [[work/tasks/2026-10-25_wiki-stale-pages]]. Linhas de `origin/dev` `f7d3d19`.

## §4.0. Análises pré-plano

Triagem: **análises necessárias**, porque o aviso só diz que a data venceu, não o que mudou. Foram três perguntas independentes, em paralelo, uma por grupo de páginas. As afirmações usadas abaixo foram reconferidas no fio principal.

**A. `overview.md`** (commits em `src/`, `web/`, `bin/tower` depois de 2026-10-24: `abb2932`, `d1462bd`, `5fd3cbc`, `9ce64fc`, `b0cf8d8`, `ed711fe`)
- **Um erro de fato:** a linha 36 diz que o (x) fecha o terminal "se ele for o único do workspace". Desde o k26 o (x) fecha o terminal que o (+) abriu para a sessão ou, senão, o único da **pasta** da sessão, e recusa com agente trabalhando 📎 `src/close-tab.ts:1-3`, `:15`.
- O resto confere: `web/index.html:23,32,5`, `web/style.css:348`, `web/app.js:1-6`, `:482` (`newTabButton`), `:499` (`closeButton`), `:593` (`openWorkspace`). O analista sugeriu mover `:482`/`:499`; conferido, são as linhas das funções e ficam.
- O casamento de títulos (k27, k28) não aparece no overview, só em [[services/gateway]].

**B. `decisions/2026-10-23_phone-pty-resize.md` e `…_phone-fullscreen-scroll.md`**
- Depois de 2026-10-23, `src/server.ts` e `web/app.js` só ganharam o (+), o (x), a fonte da caixa de texto e a gaveta por workspace (`78b22ad`, `abb2932`, `d1462bd`, `5fd3cbc`). `src/protocol.ts` e `src/input.ts` não mudaram depois de `43eea98`. O caminho de tamanho e devolução (`applySize`, `giveBack`, `setCommand(null)` → `giveBack`) e o da roda (`handleWheel`) seguem iguais.
- As duas ADRs não citam `file:line` deste repositório, só do `remote_pi`/`flterm` fixadas em `7d923ab`. Nenhum gatilho de "Revisão prevista" disparou.
- **Veredito:** nada a corrigir. Fica uma linha datada de reverificação em "Revisão prevista" e o `updated`.

**C. `decisions/2026-10-22_read-only-client.md` e `cross-cutting/upstream-contributions.md`**
- A ADR é `superseded` (linha 25: "O corpo abaixo fica como histórico"). Citações valem pelo momento em que foram escritas (`_meta/conventions.md:59`). Só que as cinco citações de código (`src/protocol.ts:7,36`, `src/server.ts:141`, `web/app.js:284`, `web/app.js:1-5`, `src/session-info.ts:51`) não batem nem com o commit mais antigo do repositório, `9d52541` (2026-10-23, "Initial public release"). Exemplos: lá, `src/server.ts:141` é o `handleUpgrade` e `src/session-info.ts:51` é `export interface Workspace`. A ADR é de 2026-10-22, anterior a esse commit, então a versão citada não existe no histórico, e não dá para saber se estavam certas quando foram escritas.
- O lint não pula páginas `superseded` (`lint.py:51`, `:352-353`).
- `upstream-contributions.md`: os PRs #263 e #264 continuam abertos (`gh pr view 263|264 -R jacobaraujo7/remote_pi` → `OPEN`), então a tabela segue certa e só a data muda. As "Pendências" (linha 98) citam só k11 e k12 e omitem os outros dois cartões `upstream` + `externo` do quadro: k21 (fechar uma aba deixa o shell vivo, causa achada em 2026-10-24) e k5 (pedir o id da aba no `pty.sessions`).

**Recorrência:** `overview.md` (`src/`) e `upstream-contributions.md` (`board.kanban`) têm `code_refs` largos e voltam a ser marcados a cada trio. O aviso, desta vez, pegou um erro real no overview, então ficam como estão.

## §4.1. Resumo e entendimento

Os cinco avisos são por data. O objetivo é zerá-los **com** reconferência: corrigir o que ficou errado (o (x) no overview, as pendências upstream), anotar como histórico o que não pode ser conferido (as citações da ADR substituída) e registrar a reverificação das ADRs que continuam certas. Só então o `updated` passa a 2026-10-25.

## §4.2. Arquivos afetados

Na execução, só o trio e o quadro. As cinco páginas de conhecimento mudam no `/wiki-sync` (§4.7), com os textos da §4.3, porque a wiki de conhecimento não muda fora dele (METHODOLOGY §4.5, §7).

- `cockpit_tower_wiki/overview.md` (UPDATE) — regra do (x) na linha 36; `updated`.
- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (UPDATE) — data da tabela, pendências k21 e k5; `updated`.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — nota de citações históricas sob o aviso de substituição; `updated`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE) — linha de reverificação em "Revisão prevista"; `updated`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md` (UPDATE) — idem; `updated`.
- `cockpit_tower_wiki/board.kanban` (UPDATE) — cartão k29, e "hoje: k29" → "hoje: k30".

- **Regras afetadas:** nenhuma.
- **ADRs afetadas:** as três acima, todas **confirmadas**. Nenhuma decisão muda; só reverificação e anotação.

## §4.3. Mudanças e justificativa

### `overview.md:36`

```diff
- também em modo de comando, a aba assistida ganha um (x) que fecha o terminal depois de uma confirmação, se ele for o único do workspace 📎 [`web/app.js:499`](../web/app.js))
+ também em modo de comando, a aba assistida ganha um (x) que, depois de uma confirmação, fecha o terminal que o (+) abriu para ela ou o único da pasta da sessão, e nunca com agente trabalhando 📎 [`web/app.js:499`](../web/app.js), [`src/close-tab.ts:1-3`](../src/close-tab.ts))
```

### `decisions/2026-10-22_read-only-client.md`, logo abaixo do aviso da linha 25

```markdown
> **Citações de código (nota de 2026-10-25):** as linhas `src/…` e `web/…` abaixo são de 2026-10-22, de uma versão anterior ao primeiro commit deste repositório (`9d52541`, 2026-10-23), e não batem com ele nem com o código atual. Ficam como estavam, `⚠ unverified`; o estado atual está na ADR sucessora e em [[services/gateway]].
```

### `cross-cutting/upstream-contributions.md`

- Cabeçalho da tabela: "Estado em 2026-10-24" → "Estado em 2026-10-25".
- Pendências:

```markdown
- Acompanhamentos do soft wrap no quadro: k11 (coluna escorrega sem quebra, oferecido no #264; espera o mantenedor) e k12 (adiar a remedição ao arrastar a divisória).
- k21: fechar uma aba deixa o shell vivo. A causa provável está no cartão k21 do `cockpit_tower_wiki/board.kanban`; falta abrir a issue no `remote_pi`.
- k5: pedir ao mantenedor o id da aba no `pty.sessions`, para trocar o casamento por ordem e pasta; falta abrir a issue ou o PR.
```

A causa do k21 aponta para o cartão, sem repetir as linhas do `remote_pi`, que não reconferi.

### As duas ADRs de 2026-10-23, no fim de "Revisão prevista"

```markdown
**Reverificada em 2026-10-25:** depois de 2026-10-23, `src/server.ts` e `web/app.js` só ganharam o (+), o (x) e a fonte da caixa de texto; o caminho de tamanho e devolução não mudou, e o gatilho não disparou.
```

(Na ADR da rolagem: "o caminho da roda (`handleWheel`) e `src/input.ts` não mudaram".)

### Todas as cinco

`updated: 2026-10-25`.

## §4.4. Riscos e impacto

1. **Calar o aviso sem conferir.** Mitigação: cada página tem a sua conferência na §4.0; a ADR substituída fica marcada `⚠ unverified` em vez de "corrigida".
2. **Os avisos voltam no próximo trio** que mexer em `src/` ou no quadro. É esperado (ver "Recorrência").

**Risk tier:** `low` — só wiki e quadro, sem código.

**Verificação:** `python3 .claude/skills/wiki-lint/lint.py --root .` → `exit 0` e sem a linha `⚠ stale`; `python3 .claude/skills/work-index/generate.py --check --root .` → ok.

**Revert:** `git revert` do commit.

## §4.5. Passos da execução

- [ ] (1) Após a aprovação, branch `docs/2026-10-25_wiki-stale-pages__wiki` no worktree, a partir de `origin/dev`.
- [ ] (2) Cartão k29 e contador do quadro.
- [ ] (3) Log da execução com as conferências da §4.0 e os textos da §4.3 como páginas afetadas; revisão do agente `skipped — low`; `work-index`, wiki-lint e trailers.
- [ ] (4) Portão humano; o dono chama `/wiki-sync 2026-10-25_wiki-stale-pages`, que aplica a §4.3 e fecha o trio.
- [ ] (5) PR para `dev` e merge, com o aval do dono.

## §4.6. Escopo

**Área afetada:** `[wiki]`.

## §4.7. Impacto na wiki

- `cockpit_tower_wiki/overview.md` (UPDATE) — regra do (x) (§4.3); `updated`.
- `cockpit_tower_wiki/cross-cutting/upstream-contributions.md` (UPDATE) — data da tabela e pendências k21, k5; `updated`.
- `cockpit_tower_wiki/decisions/2026-10-22_read-only-client.md` (UPDATE) — nota de citações históricas; `updated`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-pty-resize.md` (UPDATE) — linha de reverificação; `updated`.
- `cockpit_tower_wiki/decisions/2026-10-23_phone-fullscreen-scroll.md` (UPDATE) — linha de reverificação; `updated`.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada do wiki-sync.
