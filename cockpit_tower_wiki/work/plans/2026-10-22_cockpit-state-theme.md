---
title: 2026-10-22 — Ordem, cores e tema do Cockpit no viewer (parte 3 da tela do iPhone)
type: plan
work_id: 2026-10-22_cockpit-state-theme
scope:
  area: [gateway, viewer]
status: executed
risk: medium
updated: 2026-10-22
summary: O gateway lê o estado do Cockpit (ordem, cor e tema) e o viewer ordena, colore e alterna claro/escuro com as paletas exatas do código do Cockpit.
topic: [ui]
related:
  - work/tasks/2026-10-22_cockpit-state-theme
  - services/gateway
---

# Plano — Ordem, cores e tema do Cockpit no viewer

> Cobre [[work/tasks/2026-10-22_cockpit-state-theme]]. Lido antes: [[work/executions/2026-10-22_session-identity-cockpit-look]], [[services/gateway]].

## §4.0. Análises pré-plano

analyses: not needed — a investigação foi feita no thread principal, lendo o código do Cockpit e o estado no disco; o resto é mudança localizada em `src/session-info.ts`, `src/server.ts` e `web/`.

Fatos usados pelo plano. O código do Cockpit é `github.com/jacobaraujo7/remote_pi`, commit `7d923ab`, o mesmo do contrato:

- **Onde fica o estado:** em `<raiz>/cockpit/state/`. A raiz é o conteúdo de `~/.cockpit/storage_root` quando existe, senão `getApplicationDocumentsDirectory()` (no macOS, `~/Documents`). 📎 `cockpit/lib/app/core/data/setup/storage_location.dart:52,95-104`. No Mac do humano: `~/Documents/cockpit/state/`, sem `storage_root`.
- **`projects.json`:** `{version: 1, data: {<id>: {id, name, path, color, createdAt, order, image, realm}}}`, mais chaves internas que começam com `__` (ex.: `__last_selected__::default`). Só os workspaces raiz estão ali. O `id` é o mesmo `workspaceId` da CLI `cockpit list-workspaces`, e um worktree tem id `<id raiz>::<pasta>`. Valores do humano: project-a 0, project-b 1, project-c 2, project-d 3, cockpit-tower 4, agent-dev-methodology 5, a mesma ordem da lateral no print.
- **`color`:** inteiro ARGB, por exemplo `4285421263` → `#6e56cf` para o cockpit-tower. O avatar usa essa cor, ou a imagem em `image` quando há uma. 📎 `cockpit/lib/app/cockpit/ui/widgets/workspace_avatar.dart` (`colorValue`, `imagePath`).
- **`settings.json`:** `data.app.themeMode` vale `system`, `light` ou `dark`. O do humano é `system`.
- **Cores da interface:** `AppColors.dark` (`bg #0D0D0F`, `panel #18181B`, `panel2 #1F1F23`, `border #26262A`, `text #ECECEF`, `text2 #9B9BA4`, `text3 #6A6A73`, `accent #2F6FF0`…) e `AppColors.light` (`bg #F5F5F7`, `panel #FFFFFF`, `panel2 #F0F0F3`, `border #E2E2E7`, `text #1A1A1F`, `text2 #5B5B66`, `text3 #8A8A94`, `accent #2F6FF0`…). 📎 `cockpit/lib/app/core/ui/themes/app_colors.dart:67-122`.
- **Paletas do terminal:** `cockpitTerminalThemeDark` (fundo `#18181B`, texto `#ECECEF`, 16 cores ANSI) e `cockpitTerminalThemeLight` (fundo `#FFFFFF`, texto `#1A1A1F`, ANSI estilo GitHub light). 📎 `cockpit/lib/app/core/ui/themes/terminal_theme.dart:8-60`. A paleta da parte 1 era uma aproximação. 📎 [`web/app.js:28`](../../../web/app.js)
- **Hoje:** o workspace de cada sessão sai de `workspaceFor`, sem cor nem ordem. 📎 [`src/session-info.ts:182`](../../../src/session-info.ts)

## §4.1. Resumo e entendimento

O humano quer que o viewer espelhe a lateral do Cockpit, com a mesma ordem, os mesmos nomes e as mesmas cores, e que tenha modo escuro. Tudo isso está no estado em JSON que o Cockpit grava no disco e no código dele.

- **Gateway:** lê, **somente leitura**, `projects.json` (ordem e cor de cada workspace raiz) e `settings.json` (`themeMode`), nos mesmos lugares que o Cockpit usa. Cada sessão ganha `workspace.color`, `workspace.order` e `workspace.rank` (a posição na lista da CLI, que ordena os worktrees). A mensagem `sessions` passa a levar `theme`.
- **Viewer:**
  - ordena os grupos pela `order` do Cockpit, com o workspace especial "Cockpit" primeiro e os desconhecidos no fim;
  - pinta os avatares com a cor do Cockpit;
  - alterna entre claro e escuro: `system` segue o iPhone, `light`/`dark` fixam;
  - usa as paletas exatas do Cockpit na interface e no terminal.
- **Sem o estado** (arquivo ausente ou inválido), tudo volta ao comportamento da parte 2: cor por hash, ordem de aparição e tema claro.

## §4.2. Arquivos afetados

- `src/cockpit-state.ts` (CREATE) — localiza a pasta de estado e lê `projects.json` e `settings.json` com validação.
- `src/session-info.ts` (UPDATE) — `workspace` ganha `color`, `order` e `rank`; o coletor devolve também o `theme`.
- `src/server.ts` (UPDATE) — `sessions` leva `theme`.
- `src/main.ts` (UPDATE) — liga a leitura do estado ao coletor.
- `test/cockpit-state.test.ts` (CREATE), `test/session-info.test.ts` e `test/server.test.ts` (UPDATE).
- `web/style.css`, `web/app.js`, `web/index.html` (UPDATE) — tokens claro/escuro, paleta ANSI em variáveis CSS, ordem e cores dos grupos.

## §4.3. Mudanças e justificativa

### `src/cockpit-state.ts`

```ts
export interface CockpitProject { id: string; name: string; color: string | null; order: number }
export interface CockpitState { projects: Map<string, CockpitProject>; theme: 'system' | 'light' | 'dark' }

/** Same lookup as Cockpit's StorageLocation: ~/.cockpit/storage_root, else ~/Documents; then cockpit/state. */
export async function cockpitStateDir(home: string, read = readText): Promise<string> { /* trim; absolute paths only */ }

/** Read-only; any missing or malformed file yields an empty state, never an error. */
export async function readCockpitState(home: string, read = readText): Promise<CockpitState> {
  // projects.json: data entries with a string id, skipping keys that start with "__";
  // color = '#' + (value & 0xffffff) as 6 hex digits; order must be a finite number.
  // settings.json: data.app.themeMode in {system, light, dark}, else 'system'.
}
```

Só dois arquivos com nomes fixos são lidos. O `storage_root` só desvia a raiz, como no Cockpit, e é um arquivo do próprio usuário. A imagem do avatar (`image`) não é lida nem servida.

### `src/session-info.ts`

O estado entra na mesma coleta (cache de 3 s). O casamento por id usa o mesmo id nos dois lados: o projeto raiz de um workspace é `projects.get(ws.id.split('::')[0])`.

```ts
workspace: { name, path, parent?, color?: string, order?: number, rank: number }
// order: the root project's Cockpit order; the special `__cockpit__` workspace gets -1 (Cockpit lists it first).
// rank: index in `cockpit list-workspaces`, which lists worktrees in git order under their root.
```

`SessionInfoSource` passa a devolver `{ info: Record<string, SessionInfo>; theme }`.

### `src/server.ts`

```ts
const { info, theme } = opts.sessionInfo ? await opts.sessionInfo(sessions).catch(() => EMPTY) : EMPTY;
post({ type: 'sessions', sessions: sessions.map(...), theme });
```

### `web/`

- **Tokens:** em `:root` (claro) e em `:root[data-theme="dark"]`, mais `@media (prefers-color-scheme: dark) { :root[data-theme="system"] {...} }`, com os valores de `AppColors`.
- **Terminal:** as 16 cores ANSI viram variáveis (`--ansi-0` … `--ansi-15`), com valores claros e escuros de `terminal_theme.dart`. A visão HTML passa a escrever `color: var(--ansi-N)` para essas cores, e o inverso usa `var(--term-fg)`/`var(--term-bg)`. Assim a troca de tema não exige redesenhar nada.
- **`app.js`:**
  - aplica `document.documentElement.dataset.theme = msg.theme || 'system'` e atualiza o `theme-color`;
  - ordena os grupos por `order` (sem `order` vai para o fim, na ordem de aparição) e os worktrees por `rank`;
  - usa `workspace.color` no avatar, com o hash como reserva.

### Acréscimo aprovado em 2026-10-22: worktrees recolhíveis como no Cockpit

- **No Cockpit:** a lateral mostra uma seta (`›` recolhido, `⌄` expandido) e a contagem de worktrees ao lado do workspace raiz. Tocar na seta só abre ou fecha a lista. 📎 `cockpit/lib/app/cockpit/ui/widgets/projects_rail.dart:53-54,252-258`.
- **Estado:** fica em `layouts.json` (`{version: 1, data: {<id raiz>: "<JSON em texto>"}}`), no campo `worktreesExpanded` de cada workspace raiz. No Mac do humano: project-c e project-a recolhidos, os outros expandidos.
- **Gateway:** `readCockpitState` lê também `layouts.json` e põe `worktreesExpanded` no projeto raiz, com o texto JSON de cada entrada validado. `workspace.worktreesExpanded` vai junto da cor e da ordem.
- **Viewer:**
  - o cabeçalho de um workspace com worktrees ganha a seta e a contagem;
  - o estado inicial vem do Cockpit, e o toque alterna só no celular;
  - recolhido, mostra o indicador "trabalhando" se algum worktree tiver agente ativo.

## §4.4. Riscos e impacto

1. **O formato do estado do Cockpit pode mudar** (o arquivo tem `version: 1`). Mitigação: validação campo a campo; um campo inválido é ignorado, e um arquivo inválido vira estado vazio (comportamento da parte 2). Teste com JSON quebrado e com campos de tipo errado.
2. **Leitura de arquivos pelo gateway exposto na rede.** Mitigação: só `projects.json` e `settings.json` sob a pasta de estado; nenhum caminho vem do navegador nem do Cockpit pela rede. O conteúdo enviado ao iPhone se limita a nome, cor, ordem e tema; caminhos de imagem não saem.
3. **Contraste no escuro:** o Claude do humano usa `theme: light` e emite cores truecolor pensadas para fundo claro. Mitigação: é o mesmo que acontece no Cockpit escuro, que o viewer espelha. Fica anotado; ajustar o `theme` do Claude é escolha do humano.
4. **`themeMode` fixo no Cockpit diferente do tema do iPhone.** É intencional: o viewer segue o Cockpit.

**Risk tier:** `medium` — o gateway passa a ler dois arquivos de estado do Cockpit, sem subprocesso novo, sem rota nova e sem tocar PTY, listener ou autenticação (nenhum item do "Always high risk").

**Verification:**
- `npm test`, com os testes novos de leitura do estado (ponteiro, padrão, JSON inválido, chaves `__`, cor ARGB) e de ordem e cor no coletor.
- Smoke ao vivo: a ordem dos grupos na gaveta deve ser Cockpit, project-a, project-b, project-c, project-d, cockpit-tower, agent-dev-methodology, com as cores do `projects.json`.
- Smoke headless nos dois temas (emulando `prefers-color-scheme`).
- Smoke no iPhone pelo humano.

**Revert:** `git revert` dos commits. Nada é gravado no Cockpit nem no disco.

## §4.5. Passos de execução

- [x] (1) Criar a branch `feat/2026-10-22_cockpit-state-theme__tower` a partir de `dev`.
- [x] (2) `src/cockpit-state.ts` com `test/cockpit-state.test.ts`.
- [x] (3) `src/session-info.ts`, `src/server.ts`, `src/main.ts` e testes.
- [x] (4) `web/`: tokens claro/escuro, ANSI em variáveis, ordem e cores.
- [x] (5) Verificação: `npm test`, smoke ao vivo e headless nos dois temas.
- [x] (5b) Acréscimo: worktrees recolhíveis (`layouts.json` no gateway, seta e contagem no viewer), com testes e smoke.
- [x] (6) Revisão pelo agente (`reviewer`).
- [x] (7) Smoke no iPhone pelo humano.

## §4.6. Escopo

**Área(s) afetada(s):** `[gateway, viewer]`.

## §4.7. Impacto no wiki

- `cockpit_tower_wiki/services/gateway.md` (UPDATE) — "Contexto das sessões": estado do Cockpit (ordem, cor, tema).
- `cockpit_tower_wiki/contracts/cockpit-protocol-v2.md` (UPDATE) — estado em JSON do Cockpit como fonte somente leitura (local, formato `version: 1`).
- `cockpit_tower_wiki/overview.md` (UPDATE) — linha do viewer: tema claro/escuro do Cockpit.
- `cockpit_tower_wiki/_meta/log.md` (APPEND) — entrada desta execução.
