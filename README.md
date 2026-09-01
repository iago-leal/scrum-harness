# scrum-harness

Plugins de **SCRUM** para o [DeepSeek Harness](../deepseek-harness/): o processo ágil executável pelo agente (tools), por humanos (`/scrum` e um quadro visual na GUI web) e persistido fora das conversas.

Hierarquia semântica do backlog:

```
Release
  └─ Função (feature)
       └─ Backlog de produto (componente)
            └─ Tarefas
```

**Sprints** são janelas de tempo que selecionam Tarefas dessa hierarquia (Sprint Backlog), com quadro Kanban (`todo / in_progress / review / done`) e **cerimônias** registradas (Planning, Daily Standup, Review, Retrospectiva).

## Pacotes

| Pacote | Papel | ctx key |
|---|---|---|
| `packages/scrum-domain` | Estado durável (via `ctx.storageDomain`, backend JSON) + regras de negócio | `ctx.scrum` |
| `packages/tool-scrum` | 15 tools para o modelo (`scrum_tree`, `scrum_sprint_plan`, `scrum_task_move`…) | registra em `ctx.tools` |
| `packages/command-scrum` | Comando humano `/scrum` (leitura: tree, sprints, status, ceremonies) | registra em `ctx.commands` |
| `packages/scrum-api` | Rotas HTTP `/scrum-api/state` e `/scrum-api/action` para o quadro web | registra em `ctx.webServer` |
| `packages/ui-scrum` | Quadro visual na GUI web: botão na sidebar + painel (Backlog, Board Kanban com drag-and-drop, Sprints) | slots `sidebar.footer.action` + `shell.overlay` |
| `packages/bundle-scrum` | Bundle instalável (`dsh.bundle`) que insere as linhas acima sobre o perfil web | — |

Regras de negócio centralizadas no `ScrumService`: pais precisam existir; no máximo **uma sprint ativa**; encerrar sprint devolve tarefas não concluídas ao backlog; movimentos no board só na sprint ativa; cerimônias são append-only; exclusão de subárvore exige `cascade`.

## Rodando

Pré-requisito: o checkout do DSH ao lado (`../deepseek-harness`) com `lib/` buildado (as dependências são `file:` links para ele).

```sh
npm install --no-bin-links   # instala e linka as dependências
npx tsc --build              # compila os pacotes
(cd packages/ui-scrum && node build.mjs)  # bundle do browser
npx vitest run               # 18 testes de integração (storage/tools/HTTP reais)

bash scripts/setup-profile.sh  # cria o DSH_HOME hermético (.dsh-home) e o perfil "scrum"
bash scripts/serve.sh 3090     # sobe a GUI web com o perfil scrum
```

Abra `http://127.0.0.1:3090` — o botão **▦ SCRUM** fica no rodapé da sidebar. Os dados vivem em `.dsh-home/storages/scrum.json` (compartilhados entre a GUI, as tools do modelo e o `/scrum`).

O perfil `scrum` só existe neste repositório (`DSH_HOME` próprio em `.dsh-home/`): o harness aberto de qualquer outra pasta/perfil não vê nada disso.

## Arquitetura

- **Persistência**: `defineDomain` do `@deepseek-ai/dsh-storage-domain` (tabelas zod-validadas: releases, features, components, tasks, sprints, ceremonies + contadores de id no global). Dados sobrevivem às sessões e são compartilhados entre modelo, comando e GUI.
- **Tools**: padrão `defineTool` do `@deepseek-ai/dsh-tools`, saída textual id-first que o modelo referencia de volta (`rel-1`, `task-42`…).
- **UI**: plugin client (`dsh.client`) no formato de factory do module loader do DSH; registra nos slots do layout via `ctx.slots.inject`; estado de visualização em um store `defineStore` compartilhado entre o botão e o painel; dados via `fetch` same-origin nas rotas do `scrum-api` (com polling enquanto o painel está aberto).
- **Instalação**: `packages/bundle-scrum` declara `"dsh": {"bundle": {"patch": "./cordis.patch.yml"}}` — o mecanismo oficial de patch-layer de perfis do DSH (`dsh plugin --profile <nome> add <pacote>` num DSH instalado; aqui, o perfil é montado por `scripts/setup-profile.sh` com symlinks).
