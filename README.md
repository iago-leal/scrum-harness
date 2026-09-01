# scrum-harness

Plugins de **SCRUM** para o [DeepSeek Harness](../deepseek-harness/): o processo ágil executável pelo agente (tools), por humanos (`/scrum` e um quadro visual na GUI web) e persistido fora das conversas.

Hierarquia semântica do backlog:

```
Release
  └─ Função (feature)
       └─ Backlog de produto (componente)
            └─ Tarefas
```

**Sprints** são janelas de tempo que selecionam Tarefas dessa hierarquia (Sprint Backlog), com quadro Kanban (`todo / in_progress / review / done`) e **cerimônias** registradas (Planning, Daily Standup, Review, Retrospectiva). Cada sprint pode ser **vinculada a uma Release** (no planejamento ou depois); o vínculo aparece em todas as vistas — chips de sprint na linha da release (árvore), seletor/badge na aba Sprints, cabeçalho do Board e saídas do `/scrum` e das tools.

**Ciclo de vida** (v0.2): todo item da hierarquia está em exatamente um de três estados — **vivo** (nas vistas principais), **arquivado** (`archivedAt`: concluído e guardado no **Arquivo**, reversível) ou **na lixeira** (`deletedAt`: soft delete na **Lixeira**, restaurável). Excluir sempre passa pela lixeira; a remoção física só acontece com *purge* / esvaziar lixeira, a partir da própria lixeira. Cascatas carimbam o mesmo timestamp na subárvore, então restaurar/desarquivar revive exatamente o que saiu junto (e reativa ancestrais quando preciso). Tarefas na sprint ativa não podem ser apagadas nem arquivadas; tarefas `done` arquivadas continuam contando nos totais das sprints históricas.

**Backlog na GUI** (v0.3, à la Azure DevOps): a aba Backlog é uma grade hierárquica com colunas alinhadas (**Item | Estado | Pontos | Sprint**) — ícone colorido por tipo (R/F/C/T), estado como ● + rótulo, rollup de progresso (barra + pontos concluídos/total) nos níveis pai, chevrons de expandir/recolher (com «Expandir/Recolher tudo»), menu **⋯** por linha e linhas-fantasma «＋ Novo item» por nível (Enter cria e mantém o foco). Os mesmos ícones/dots aparecem em Sprints, Arquivo e Lixeira.

**Work item form & estados multinível** (v0.4, à la Azure DevOps): clicar no título de qualquer linha do Backlog ou card do Board abre o **work item form** — modal com o conteúdo completo e editável (título, breadcrumb, estado, descrição, estimativa, data alvo, sprint; Esc fecha). Cada nível tem **workflow próprio**: componente `proposed → in_progress → done`, função `proposed → committed → in_progress → done` (campo com default no parse: mídia v0.3 carrega sem bump de versão). E a aba Board ganhou o pivô **Tarefas | Componentes | Funções**: além do Kanban da sprint, boards por nível cujas colunas são os estados do nível — arrastar o card muda o status, com rollup de progresso nos cards de pai.

**Um quadro por workspace** (v0.5): o `ctx.scrum` é um **gerente de quadros** — cada workspace tem seu próprio quadro em seu próprio meio de storage (`scrum_ws_<hash>.json`, chave derivada do caminho canônico via `boardNameOf`), aberto sob demanda e cacheado. As **tools** roteiam pelo cwd da sessão que chamou (`exec.agent.session.header.cwd`), o **`/scrum`** idem, a **API HTTP** recebe o workspace do cliente (`?workspace=` no GET, campo `workspace` no POST) e o **painel** segue o workspace da sessão corrente (chip 📁 no cabeçalho; fallback: workspace recente). Sessões sem cwd compartilham o quadro global (`scrum_global`). O quadro único anterior migra com `node scripts/migrate-v0.5.mjs` (adota o `scrum.json` como quadro deste repositório e guarda backup).

**Números de sprint & fluxo no board** (v0.6): a aba Sprints ganha **velocity** (barras SVG de pontos concluídos por sprint encerrada + média das últimas 3) e **burndown** por sprint (botão 📉 no card: linha real de pontos restantes × ideal, alimentada pelo carimbo `doneAt` que o `moveTask` grava ao entrar em `done` — campo opcional, mídia antiga carrega sem migração; a API expõe `stats` por sprint contando também tarefas arquivadas). O board de tarefas ganha **swimlanes por componente** (botão ☰ Raias, rollup por raia) e **WIP limits por coluna** (`wipLimits` opcional na sprint, editável clicando no contador da coluna — `n/limite` fica vermelho ao estourar; aviso visual, sem bloqueio, fiel ao Azure DevOps). Estados de pai seguem **manuais** por decisão de produto (estilo Azure): componente/função só mudam de coluna por arrasto, form ou tool. Gráficos em SVG puro, sem bibliotecas.

**Visual Primer** (v0.8): o painel adota o design system do GitHub via **@primer/primitives** — a camada de *design tokens* escolhida no spike da sprint (contra `@primer/css`, reescrita BEM, e `@primer/react`, bundle desproporcional). O `build.mjs` embarca as folhas de tokens como texto (`loader: { '.css': 'text' }`), `primer.ts` re-escopa os tokens de `:root` para os wrappers do painel (nada vaza para o shell) e o overlay carrega `data-color-mode`/`data-light-theme` — o tema fica escopado e o dark mode a um atributo de distância. O `styles.ts` fala só tokens semânticos com fallback literal (`var(--fgColor-accent, …)`); em cima disso: botões com tokens de componente (primário verde GitHub), inputs estilo form control, ícones/dots/chips como badges e issue labels, progresso verde de milestone, counters em pílula, work item form com anatomia de dialog Primer, backlog com cabeçalho de issue tracker, colunas/cards à la GitHub Projects (dot de estado no título da coluna) e gráficos SVG tokenizados.

**Agente ciente do quadro** (v0.7): o plugin `context-scrum` (padrão do `time-context` do DSH) intercepta o waterfall `agent/pre-step` e, no **1º step de cada turno**, resolve o quadro do workspace da sessão (`agent.session.header.cwd`) e injeta uma mensagem de contexto durável e atribuída ao plugin com o snapshot da **sprint ativa** — colunas com ids/pontos, estados explícitos dos pais e a instrução da disciplina de "board ao vivo" (mover a tarefa ao começar/terminar, manter os pais, registrar cerimônias). Só injeta **quando o snapshot mudou** desde a última injeção (o próprio texto é a chave, guardado em `WeakMap` por agente); sem sprint ativa, não injeta nada. Assim a disciplina que era hábito do agente vira contrato do harness — inclusive para o próprio agente que desenvolve este repositório.

## Pacotes

| Pacote | Papel | ctx key |
|---|---|---|
| `packages/scrum-domain` | Estado durável (via `ctx.storageDomain`, backend JSON, um meio por workspace) + regras de negócio no `ScrumBoard`; `ctx.scrum.board(cwd)` resolve o quadro | `ctx.scrum` |
| `packages/tool-scrum` | 23 tools para o modelo (`scrum_tree`, `scrum_sprint_plan`, `scrum_task_move`, `scrum_trash_list`, `scrum_item_restore`, `scrum_item_purge`, `scrum_item_archive`…) | registra em `ctx.tools` |
| `packages/command-scrum` | Comando humano `/scrum` (leitura: tree, sprints, status, ceremonies, trash, archive) | registra em `ctx.commands` |
| `packages/context-scrum` | Contexto de agente ciente do quadro: snapshot da sprint ativa injetado no 1º step do turno quando muda | listener `agent/pre-step` |
| `packages/scrum-api` | Rotas HTTP `/scrum-api/state` e `/scrum-api/action` para o quadro web | registra em `ctx.webServer` |
| `packages/ui-scrum` | Quadro visual na GUI web: botão na sidebar + painel (Backlog em grade estilo Azure DevOps, work item form modal, Boards multinível com drag-and-drop, Sprints, Arquivo, Lixeira) | slots `sidebar.footer.action` + `shell.overlay` |
| `packages/bundle-scrum` | Bundle instalável (`dsh.bundle`) que insere as linhas acima sobre o perfil web | — |

Regras de negócio centralizadas no `ScrumService`: pais precisam existir (e estar vivos); no máximo **uma sprint ativa**; encerrar sprint devolve tarefas não concluídas ao backlog; movimentos no board só na sprint ativa; cerimônias são append-only; exclusão de subárvore exige `cascade` e vai para a **lixeira** (restaurar com `restoreItem`, apagar de vez com `purgeItem`/`emptyTrash`); concluídos podem ir ao **arquivo** (`archiveItem`/`unarchiveItem`/`archiveCompleted`); sprints e cerimônias são história — nunca vão à lixeira, e uma release purgada apenas desvincula suas sprints.

## Rodando

Pré-requisito: o checkout do DSH ao lado (`../deepseek-harness`) com `lib/` buildado (as dependências são `file:` links para ele).

```sh
npm install --no-bin-links   # instala e linka as dependências
npx tsc --build              # compila os pacotes
(cd packages/ui-scrum && node build.mjs)  # bundle do browser
npx vitest run               # 48 testes de integração (storage/tools/HTTP reais)

bash scripts/setup-profile.sh  # cria o DSH_HOME hermético (.dsh-home) e o perfil "scrum"
bash scripts/serve.sh 3090     # sobe a GUI web com o perfil scrum
```

Abra `http://127.0.0.1:3090` — o botão **▦ SCRUM** fica no rodapé da sidebar. Os dados vivem em `.dsh-home/storages/scrum.json` (compartilhados entre a GUI, as tools do modelo e o `/scrum`).

O perfil `scrum` só existe neste repositório (`DSH_HOME` próprio em `.dsh-home/`): o harness aberto de qualquer outra pasta/perfil não vê nada disso.

**Login compartilhado**: o `setup-profile.sh` gera `.dsh-home/profiles/scrum/cordis.patch.yml` apontando as rows `settings` e `credentials` para os arquivos do seu `~/.dsh` (ambos os plugins aceitam `path` e observam o arquivo). Assim o sign-in na Anthropic, as chaves de API e o modelo padrão do harness normal valem também aqui — enquanto sessões, workspaces e os dados SCRUM continuam isolados no `.dsh-home`. Outra home real: `REAL_DSH_HOME=/caminho bash scripts/setup-profile.sh`.

## Arquitetura

- **Persistência**: `defineDomain` do `@deepseek-ai/dsh-storage-domain` (tabelas zod-validadas: releases, features, components, tasks, sprints, ceremonies + contadores de id no global). Dados sobrevivem às sessões e são compartilhados entre modelo, comando e GUI.
- **Tools**: padrão `defineTool` do `@deepseek-ai/dsh-tools`, saída textual id-first que o modelo referencia de volta (`rel-1`, `task-42`…).
- **UI**: plugin client (`dsh.client`) no formato de factory do module loader do DSH; registra nos slots do layout via `ctx.slots.inject`; estado de visualização em um store `defineStore` compartilhado entre o botão e o painel; dados via `fetch` same-origin nas rotas do `scrum-api` (com polling enquanto o painel está aberto).
- **Instalação**: `packages/bundle-scrum` declara `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` — o mecanismo oficial de patch-layer de perfis do DSH (`dsh plugin --profile <nome> add <pacote>` num DSH instalado; aqui, o perfil é montado por `scripts/setup-profile.sh` com symlinks).
