---
title: 2026-10-22 — Texto do terminal no estilo do Cockpit (parte 1 da tela do iPhone)
type: task
work_id: 2026-10-22_terminal-text-cockpit-style
scope:
  area: [viewer]
status: done
updated: 2026-10-22
summary: Mostrar o texto do terminal no iPhone com a cara do Cockpit, quebrando as linhas na largura da tela, usando toda a altura e com rolagem pelo histórico.
topic: [ui]
related:
  - work/executions/2026-10-22_read-only-viewer
  - decisions/2026-10-22_read-only-client
---

# Texto do terminal no estilo do Cockpit (parte 1 da tela do iPhone)

## Contexto

A tela do viewer no iPhone vai ser melhorada por partes. Esta é a primeira: **como o texto
que está dentro do terminal aparece**. A referência é o terminal do Cockpit no Mac (print do
humano de 2026-10-22: fundo branco, texto preto, fonte monoespaçada do sistema).

Hoje o viewer desenha a tela da PTY exatamente no tamanho do Mac (ex.: 117 colunas) e reduz a
fonte até caber na largura do iPhone, chegando a 6 px. Também não dá para rolar e ver o que já
saiu da tela, e as linhas em branco da PTY ocupam a altura do celular. O tema é o padrão escuro
do xterm, diferente do Cockpit. Esses pontos ficaram nas notas abertas de
[[work/executions/2026-10-22_read-only-viewer]].

Pedido do humano (2026-10-22): poder rolar para ver o que saiu da tela; o texto caber na largura
do iPhone, quebrando as linhas; e aproveitar melhor a altura, mostrando mais linhas no celular.

A PTY continua no tamanho do Mac ([[decisions/2026-10-22_read-only-client]]): a quebra de linhas
é feita só na exibição do iPhone.

## Critérios de aceite

- [x] O texto usa o tema claro do Cockpit: fundo `#ffffff`, texto `#000000` e cores ANSI
      legíveis sobre fundo branco, na fonte monoespaçada do sistema (SF Mono no iPhone).
- [x] As linhas quebram na largura da tela: não há rolagem horizontal no terminal normal.
- [x] A fonte tem um tamanho legível (≥ 11 px) e pode ser aumentada ou diminuída por um
      controle, com a escolha salva no aparelho.
- [x] Dá para rolar para cima e ler o histórico que já saiu da tela, com rolagem nativa do iPhone.
      *(Vale quando o programa deixa o histórico no terminal. CLIs em tela cheia não têm histórico no
      terminal; isso fica para a tarefa de comandos pelo celular.)*
- [x] Enquanto o humano está lendo o histórico, a saída nova não puxa a tela para baixo. Um
      atalho volta para o fim, e no fim a tela acompanha a saída ao vivo.
- [x] Linhas em branco no fim da tela da PTY não ocupam espaço: o conteúdo usa toda a altura.
- [x] Programas de tela cheia (tela alternativa, ex.: `vim`, `less`, `htop`) continuam
      aparecendo inteiros, mesmo sem quebra de linha. *(Ajustado com o humano em 2026-10-22: a tela
      alternativa também quebra as linhas, porque os agentes rodam em tela cheia.)*
- [x] O viewer continua somente leitura: nenhuma mudança envia entrada ou tamanho para a PTY.

## Restrições

- Fora do escopo: cabeçalho, lista de sessões e identificação da sessão certa (próximas partes).
- Não alterar o Cockpit nem o `cockpit-server`, e não redimensionar a PTY.
