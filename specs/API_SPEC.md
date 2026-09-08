---
title: "API — scrum-harness"
purpose: "Os contratos das três superfícies do Controller sobre o quadro: as 30 tools scrum_* do agente (entrada, saída textual, recusas com o ScrumError e a regra que impõem), as rotas HTTP /scrum-api/state e /scrum-api/action da GUI (envelope JSON, ações, mapeamento de erros) e os subcomandos de leitura do /scrum."
version: 2
status: approved
owner: api-data
---
# API: scrum-harness (tools `scrum_*`, `/scrum-api`, `/scrum`)

Este documento formaliza o que ARCHITECTURE.md (v2) chama de Controller: as tools registradas por `tool-scrum` (`packages/tool-scrum/src/index.ts`), as rotas registradas por `scrum-api` (`packages/scrum-api/src/index.ts`) e o comando registrado por `command-scrum` (`packages/command-scrum/src/index.ts`). Nenhuma delas decide (R1): cada endpoint traduz a chamada num método de `ScrumBoard` (`packages/scrum-domain/src/service.ts`) e devolve o que o Model decidiu; toda recusa citada abaixo nasce no Model como `ScrumError` e a regra de RULES.md (v3) que ela impõe é citada inline. Vocabulário: GLOSSARY.md (v2).

## Convenções

**Auth.** Nenhuma. As três superfícies rodam no DSH da própria máquina: as tools e o `/scrum` dentro da sessão do agente; a API HTTP no `ctx.webServer` do host, consumida same-origin pela GUI (`ui-scrum`). Não há autenticação, token nem multiusuário (S4): o único isolamento é o workspace.

**Formato.**
- Tools: entrada é o objeto de parâmetros do schema da tool (validado pelo host `dsh-tools` — `required`, `enum`, tipos — antes de `execute`); saída é sempre texto (`TEXT_OUTPUT`: `{ text: string }` renderizado como um bloco de texto), *id-first*: toda linha de listagem começa pelo id do item. Uma tool que recusa lança o `ScrumError` do Model sem traduzir (`code` + `message`); os poucos erros de envelope que a própria tool lança (marcados "envelope" abaixo) são `Error` simples, não `ScrumError`.
- API HTTP: JSON UTF-8 (`content-type: application/json; charset=utf-8`). Sucesso: `{ ok: true, state }` (GET) ou `{ ok: true, result, state }` (POST). Falha: `{ ok: false, code, message }` com o status HTTP da seção «Erros padrão».
- `/scrum`: texto no chat (`CommandResult` `success` | `error`), nunca enviado ao modelo; somente leitura.

**Versionamento.** Nenhum versionamento de rota nem de tool: a superfície é a do bundle instalado. A mídia do quadro está em `version: 1` e evolui por migração no parse (R35): `phase`, `kind` e `releaseIds` nascem em `.transform` dos schemas zod de `packages/scrum-domain/src/spec.ts`, sem bump. Bump de `version` rejeitaria mídia antiga na abertura (contrato do `storage-domain`); portanto nenhuma mudança deste contrato o exige.

**Ids.** `rel-N` (release), `feat-N` (função), `comp-N` (componente), `task-N` (tarefa), `spr-N` (sprint), `cer-N` (cerimônia). Monotônicos por quadro, nunca reusados; toda validação de título/nome/meta/kind roda antes do `nextId`, logo uma recusa nunca consome um id (R4). Em `scrum_item_update` e nas tools de lixeira e arquivo, o **prefixo** do id seleciona a tabela (`scrum_trace` consulta sempre `components`: um `task-1` responde `not-found`, não `invalid-id`).

**Estados e enums (importados do Model, S2).** Release `planned | active | released`; função `proposed | committed | in_progress | done`; componente `proposed | in_progress | done` (R6); tarefa `backlog | todo | in_progress | review | done`, colunas do Kanban `BOARD_COLUMNS = todo | in_progress | review | done`; sprint `planned | active | completed`; fase `COMPONENT_PHASES = requirements | design | tdd | construction | validation`; kind `TASK_KINDS = test | code | other`; cerimônia `CEREMONY_TYPES = planning | standup | review | retrospective`.

**Roteamento por workspace (R3).** Tools e `/scrum` abrem o quadro de `agent.session.header.cwd` (`ctx.scrum.board(cwd)` → `scrum_ws_<12 hex>` do sha256 do caminho canônico); a API recebe o workspace do cliente — `?workspace=` no GET, campo `workspace` ao lado do envelope no POST (S4). Sem cwd/workspace, todas caem no quadro global `scrum_global`; nesse caso nenhuma superfície sonda o disco (as tools de spec respondem `Specs: no workspace — the spec set lives in <workspace>/specs/`, sem erro).

**O quadro nunca escreve `specs/` (R31).** `scrum_spec_status`, `scrum_spec_brief`, `scrum_spec_review_brief`, o cabeçalho de `scrum_tree`/`/scrum` e o campo `specs` do `state` só **leem** `<workspace>/specs/*.md` e `specs/reviews/*.review.md` pela sonda (`@scrum-harness/probe`, cap `SPEC_FILE_CAP` = 256 KiB por arquivo, P5); a API leva só metadados, nunca o texto (S3). O agente salva `specs/<file>` e `specs/reviews/<stem>.review.md` com suas próprias ferramentas de arquivo; `status: approved` é carimbo humano (R29).

**Erros padrão — os `code` de `ScrumError` lançados hoje** (`grep "new ScrumError('"` em `scrum-domain/src` e `scrum-api/src`), um por linha:
- `not-found` — id inexistente na tabela; sem sprint ativa quando ela seria o default (`status`, `end`, cerimônia). Único código que a API traduz em 404.
- `in-trash` — item na lixeira: recusa mutação, leitura de matriz e arquivamento (R16).
- `archived` — item arquivado: recusa mutação de conteúdo/fase (R16).
- `invalid-id` — prefixo desconhecido (`updateItem`) ou não-prateleável (`spr-`/`cer-` em delete/restore/purge/archive, R15).
- `invalid-input` — título/nome/meta vazio; título só-prefixo; WIP limit não inteiro ≥ 0; cerimônia sem nota; caminho de impacto absoluto ou com `..`; arquivo fora do catálogo; listagem da sonda com nome duplicado (R7, R9, R14, R15, S3).
- `title-contract` — título > 80 ou meta > 120 code points, quebra de linha ou caractere de controle, todas as razões juntas (R7).
- `invalid-status` — estado fora do conjunto do nível (R6).
- `invalid-kind` — kind fora de `test | code | other` (R9).
- `kind-conflict` — prefixo `[test]`/`[code]` contradiz o `kind` explícito (R9).
- `invalid-column` — coluna fora de `BOARD_COLUMNS` (chave de `wipLimits` ou destino de `moveTask`) (R13, R14).
- `invalid-phase` — fase fora de `COMPONENT_PHASES`; na API, `op: set` sem `phase` (S2).
- `phase-gate` — avanço recusado: já na última fase, componente `done`, pulo de fase, ou as condições do gate (R21–R25).
- `done-gate` — transição para `status: done` recusada com todas as condições (R26, R27).
- `review-brief` — `scrum_component_review_brief` sem requisitos, sem `version` no frontmatter ou sem corpo.
- `validation` — orçamento da suite inválido (≤ 0 / não número) ou acima do default sem razão (R28).
- `has-children` — exclusão de pai com descendentes vivos sem `cascade` (R17).
- `not-in-trash` — restore/purge de item que não está na lixeira (R17, R18).
- `already-archived` / `not-archived` — arquivar item já arquivado / desarquivar item não arquivado (R20).
- `task-in-active-sprint` — tarefa da sprint ativa não vai à lixeira nem ao arquivo (R19).
- `task-already-in-sprint` / `task-not-in-sprint` — vínculo tarefa↔sprint duplicado / inexistente (R12).
- `sprint-completed` — entrar/sair de sprint encerrada (R12).
- `sprint-already-active` — iniciar sprint com outra ativa (R10).
- `invalid-transition` — iniciar sprint não `planned`; encerrar sprint não `active` (R10).
- `task-not-in-active-sprint` — mover tarefa que não está na sprint ativa (R13).
- `spec-order` — brief de autor com predecessor direto não `approved`/sem revisão `current`, todas as razões (R34).
- `spec-review-brief` — brief de revisor para spec `missing` ou `invalid` (R34).

Códigos **só da API HTTP** (transporte, S1/S2): `unsupported-media-type` (415), `bad-json` (400), `bad-action` (400), `no-such-route` (404).

## Endpoints

**Grupo A — as 30 tools do agente (`tool-scrum`).** Notação de Request: `{ name: type (required|optional; enum …) }`. "Resolução de id" abaixo significa `not-found` | `in-trash` | `archived` conforme o estado do item (R5, R16); "só não lixeira" significa que arquivados respondem (`not-found` | `in-trash`). "Lixeira ou arquivo" nomeia os dois depósitos reversíveis do GLOSSARY (item não vivo).

### scrum_tree
- Request: `{}`.
- Response: cabeçalho opcional (`Suite budget: Ns (board …)` só quando o orçamento é do quadro; contagem de títulos/metas acima do limite só quando > 0; `Specs: a/3 minimal approved · N present · … · complete · N reviewed` só quando `<workspace>/specs/` existe), depois a hierarquia viva, indentada, ordem por `order`: `rel-N nome [status] (target: …) (sprints: spr-N status, …)`, `  feat-N título [status]`, `    comp-N título [status · fase · ready for done]` (sufixo ` · review stale` quando uma revisão válida já não cobre os requisitos; nunca em `done`), `      task-N [kind] título [status @spr-N] (Npt)`; sufixo `título longo` em itens legados acima do limite (R8). Fecha com `Sprints:` e o roster (`spr-N #n "meta" [status] início → fim`). Quadro vazio: `Empty backlog: no releases yet. Create one with scrum_release_create.`
- Errors: nenhuma — leitura pura; itens na lixeira ou no arquivo não aparecem.

### scrum_spec_status
- Request: `{}`.
- Response: uma linha por arquivo do catálogo (15, na ordem da cadeia de owners) com o estado `missing | draft | approved | invalid (razões) | unknown` e a revisão `current | stale | needs-revision | invalid | no review` (R32, R33); arquivos `unknown` ≤ 20 antes de ` +N` (P5); cabeçalho com o resumo (`minimal`, `present`, `invalid`, `unknown`, `complete`, `reviewed`); linha final `Unknown reviews: <file> (did you mean <stem>?), …` quando `specs/reviews/` traz revisões fora do catálogo. Sem cwd: `Specs: no workspace — …`; sem `specs/`: mensagem de ausência; `specs` não diretório: `Specs: specs is not a directory` — nunca erro (S5).
- Errors: nenhuma (não abre quadro; o set é sem estado).

### scrum_spec_brief
- Request: `{ file: string (required; enum: os 15 arquivos do catálogo — PRD.md, GLOSSARY.md, RULES.md, ARCHITECTURE.md, TECH_STACK.md, SECURITY.md, API_SPEC.md, DATABASE_SCHEMA.md, UI_UX_SPEC.md, TESTS_SPEC.md, AGENTS.md, WORKFLOW.md, PROMPTS.md, TASKS.md, README.md) }`.
- Response: o brief do autor — papel (Tabela 6.4), predecessores diretos como entrada (arquivos inteiros), versão atual do arquivo quando existe, revisão anterior, template, convenções da casa e formato de resposta com o frontmatter pré-preenchido (`version` = atual + 1, `status: draft`). Não escreve nada.
- Errors: `spec-order` — algum predecessor direto (PRD ← ∅; GLOSSARY/RULES/TASKS/README ← PRD; ARCHITECTURE/TECH_STACK/SECURITY ← RULES; API_SPEC/DATABASE_SCHEMA/UI_UX_SPEC/AGENTS/WORKFLOW/PROMPTS ← ARCHITECTURE; TESTS_SPEC ← RULES + API_SPEC) não está `approved` com revisão `current`, todas as razões (R34); `invalid-input` — arquivo fora do catálogo (o enum do envelope já o barra). Sem cwd: texto `no workspace`, sem erro.

### scrum_spec_review_brief
- Request: `{ file: string (required; enum: os 15 arquivos do catálogo) }`.
- Response: o brief do revisor — a spec (versão, digest, ids, texto), predecessores para coerência, revisão anterior, `orderWarnings` quando a cadeia atrás não está limpa (só aviso), checklist das convenções, perguntas por owner e o frontmatter da revisão pré-preenchido (`reviewed_version`, `reviewed_digest`) para este texto exato (R30). O revisor salva `specs/reviews/<stem>.review.md`.
- Errors: `spec-review-brief` — spec `missing` (escreva primeiro) ou `invalid` (razões do contrato) (R34); `invalid-input` — fora do catálogo. Sem cwd: texto `no workspace`.

### scrum_suite_budget
- Request: `{ seconds: number (optional; > 0, ou 0 = remover), reason: string (optional; obrigatória acima de 15) }`. Sem `seconds`: leitura.
- Response: `suite budget: 15s (default)` ou `suite budget: Ns (board, set <ISO> — reason: …)` — sempre o estado após a escrita.
- Errors: `validation` — `seconds` não é número > 0; `seconds` > 15 sem `reason`, também ao regravar o mesmo valor (R28). Baixar nunca reabre componente `done` (R28).

### scrum_release_create
- Request: `{ name: string (required; ≤ 80), description: string (optional), targetDate: string (optional; YYYY-MM-DD) }`.
- Response: `Created release rel-N "name" [planned].`
- Errors: `invalid-input` — nome vazio após trim; `title-contract` — nome > 80 code points, quebra de linha ou controle (R7). Validado antes do id (R4).

### scrum_feature_create
- Request: `{ releaseId: string (required; rel-N), title: string (required; ≤ 80), description: string (optional) }`.
- Response: `Created feature feat-N "title" under rel-N.` (estado `proposed`).
- Errors: resolução de id do pai (R5); `invalid-input` — título vazio; `title-contract` (R7).

### scrum_component_create
- Request: `{ featureId: string (required; feat-N), title: string (required; ≤ 80), description: string (optional) }`.
- Response: `Created component comp-N "title" under feat-N.` (estado `proposed`, fase `requirements`, `phaseLog: []`).
- Errors: resolução de id do pai (R5); `invalid-input`; `title-contract` (R7).

### scrum_task_create
- Request: `{ componentId: string (required; comp-N), title: string (required; ≤ 80 após remover o prefixo), description: string (optional), estimate: number (optional; pontos — a tool aceita qualquer `number` e o Model não valida: um `-3` é gravado; só a API recusa negativo, 400), kind: string (optional; enum test | code | other) }`.
- Response: `Created task task-N [kind] "title" (Npt) under comp-N.` — o prefixo `[test]`/`[code]` do título vira `kind` e sai do título armazenado; sem prefixo nem `kind`, `other`. Tarefa nasce em `backlog`.
- Errors: resolução de id do pai (R5); `invalid-kind` (R9); `invalid-input` — título só-prefixo ou vazio (R9, R7); `kind-conflict` — prefixo contradiz `kind` (R9); `title-contract` (R7). A ordem test-antes-de-code não recusa a criação: ela é lida pelo gate `tdd → construction` (R24).

### scrum_item_update
- Request: `{ id: string (required), title: string (optional; rel-: o nome), description: string (optional; todos menos spr-), requirements | requirementsReview | design | validation: string (optional; comp-; "" apaga o artefato), estimate: number (optional; task-; sem validação de sinal na tool/Model — só a API recusa negativo), kind: string (optional; task-; enum test | code | other), targetDate: string (optional; rel-), status: string (optional; rel-/feat-/comp-), goal: string (optional; spr-; ≤ 120), releaseId: string (optional; spr-; "" desvincula), releaseIds: string[] (optional; spr-; substitui o conjunto, vence `releaseId`), wipLimits: { todo?, in_progress?, review?, done?: number } (optional; spr-; `additionalProperties: false`; 0 remove a coluna, {} remove todos) }`. Campos que não pertencem ao nível do prefixo são ignorados.
- Response: `Updated <id>.` seguido, só em comp-, de notas de aviso (nunca bloqueiam) separadas por ` | `: `review contract: ok | <razões> — will block requirements → design` (ao tocar `requirements`/`requirementsReview`); `trace matrix stale: without trace … · unknown …` (ao tocar `requirements`); `trace contract (design): … — will block design → tdd | — will block status done | (validation as-built is effective)`; `validation contract: ok | <razões> — will block status done`, `over budget: add a test task …`, `budget above default (Ns > 15s)`, `trace contract (validation): …` ou `trace contract: validation carries no traces array — the design matrix stays effective`.
- Errors: `invalid-id` — prefixo fora de rel-/feat-/comp-/task-/spr-; resolução de id (spr-: só `not-found`); `invalid-input` — título/nome/meta vazio, título só-prefixo, WIP limit não inteiro ≥ 0 (R7, R9, R14); `title-contract` — título > 80 / meta > 120 (R7); `invalid-status` — estado fora do conjunto do nível (R6; nunca se propaga aos pais — e nada o dispara automaticamente: um componente com todas as tarefas `done` fica em `construction` até `scrum_component_phase advance` levá-lo a `validation` e esta tool receber `status: done` com o artefato `validation`, ADR-016); `done-gate` — `status: done` em comp- com fase ≠ `validation`, sem tarefa, tarefa não `done`, `validation` fora do contrato (`validated_at`, `suite.tests`, `passed + skipped = tests`, `typecheck: clean`, `wall_seconds ≤ budget_seconds ≤` orçamento, `runs` ≥ 3 com a pior em `wall_seconds`) ou matriz que não fecha — todas as razões, avaliadas no estado *next* com os artefatos do próprio patch (R26, R27); `invalid-kind` / `kind-conflict` (R9); `invalid-column` — chave de `wipLimits` fora das colunas (R14; o envelope da tool já barra com `additionalProperties: false`; alcançável pela API, cujo `wipLimits` é `Record<string, number>`); resolução de id em cada `releaseIds`/`releaseId` (R5).

### scrum_component_review_brief
- Request: `{ id: string (required; comp-N) }`.
- Response: o brief do revisor de requisitos — requisitos (`version`, digest sha1 curto, `status`, corpo, ids `R<n>` declarados), revisão anterior quando existe, design quando a fase já passou de `requirements`, contagem de tarefas, orçamento da suite, convenções, perguntas e o formato de resposta com o frontmatter `{ reviewer, reviewed_version, reviewed_digest, verdict, round, findings }` pré-preenchido (R30). Colar o parecer em `requirementsReview` via `scrum_item_update`.
- Errors: resolução de id (R16); `review-brief` — `requirements` vazio; frontmatter sem `version` (ou inválido); corpo vazio (só frontmatter).

### scrum_component_phase
- Request: `{ id: string (required; comp-N), action: string (required; enum advance | set | check), phase: string (optional; enum requirements | design | tdd | construction | validation; obrigatória com set, recusada com advance/check) }`.
- Response: `check`: `comp-N [status · fase] → <próxima>: ok — advance when ready` | `… → done: ok — set status done with scrum_item_update` | `… → <próxima>: <razões; separadas por "; ">` | `comp-N [done · fase]: nothing to do` — a mesma readiness que o snapshot e o form leem. `advance`/`set`: `comp-N → <fase> [status]. Phase log: N movement(s).` — o primeiro avanço de `proposed` o torna `in_progress`; recuo é livre; mesma fase é no-op (R21). Nenhum movimento é automático (ADR-016): chegar a `validation` não torna o componente `done`, e a última tarefa `done` não avança a fase — um componente com todas as tarefas `done` fica em `construction` até alguém chamar `advance` e depois `scrum_item_update status: done`.
- Errors: envelope — `set` sem `phase`; `advance`/`check` com `phase`. Resolução de id (R16). `phase-gate` — já em `validation` (`advance`); componente `done`; pulo de mais de um passo; condições do gate do passo: requirements → design = contrato da revisão (R22), design → tdd = `design is empty` ou razões da matriz (R23), tdd → construction = sem tarefa / `no test task` / `code task(s) created before the first test task (ids)` (R24), construction → validation = `no task under the component` / `N task(s) not done (ids)` (R25). `invalid-phase` — fase fora do enum (o envelope já barra).

### scrum_trace
- Request: `{ path: string (optional; relativo ao workspace, "." = raiz, ou absoluto dentro dele), id: string (optional; comp-N) }` — exatamente um dos dois.
- Response: por `id`, a matriz do componente (fonte `design` | `validation` | nenhuma, entradas `{ req, files, tests }`, buracos `without trace` / `unproven` / `unknown` (o `nocode` da matriz só viaja no `state` da API — `tree[].traces` —, não no texto), `issues`); por `path`, o relatório de impacto: os hits (componente, `req`, `via files | tests | both`, caminhos casados; arquivados respondem, marcados), no máximo 40 impressos antes de `+N more`, `missing on disk` (rastreado e ausente no disco), `untraced on disk` (no disco sem rastro — buraco de cobertura; ≤ 60 nomes antes de ` +N`) e a nota de truncamento quando a sonda parou em 500 arquivos (P5); sem cwd, só a parte do quadro.
- Errors: envelope — ambos ou nenhum dos parâmetros; caminho absoluto sem workspace na sessão; caminho absoluto fora do workspace (S3). Model: `invalid-input` — caminho absoluto ou com segmento `..` (S3); `id` só não lixeira (`not-found` | `in-trash`). O `.gitignore` raiz é lido pela tool e reduzido pelo Model (S3, S5).

### scrum_item_delete
- Request: `{ id: string (required; rel-/feat-/comp-/task-), cascade: boolean (optional; default false) }`.
- Response: `Moved to trash: <ids, pais primeiro>. Restore with scrum_item_restore; purge to delete forever.` Vítimas arquivadas perdem `archivedAt` (estados exclusivos, R16); tarefa não `done` perde a sprint e volta a `backlog` (R19).
- Errors: `invalid-id` — spr-/cer-/prefixo desconhecido (R15); `not-found`; `in-trash` — já na lixeira; `task-in-active-sprint` — alguma tarefa da subárvore está na sprint ativa (R19); `has-children` — descendentes vivos sem `cascade` (R17).

### scrum_trash_list
- Request: `{}`.
- Response: uma linha por item, agrupado por nível, mais recente primeiro: `rel-N nome [release] <deletedAt>`, `feat-N título [feature, of rel-N] …`, `comp-N título [component, of feat-N] …`, `task-N [kind] título [task status, of comp-N] (Npt) …`; vazio: `The trash is empty.`
- Errors: nenhuma.

### scrum_item_restore
- Request: `{ id: string (required) }`.
- Response: `Restored: <ids>.` — ancestrais na lixeira ou no arquivo revivem e os descendentes excluídos pelo mesmo carimbo voltam juntos (R17).
- Errors: `invalid-id`; `not-found`; `not-in-trash` (R17).

### scrum_item_purge
- Request: `{ id: string (required) }`.
- Response: `Purged forever: <ids>.` — remove fisicamente o item e sua subárvore na lixeira; uma release purgada apenas desvincula as sprints (R18).
- Errors: `invalid-id`; `not-found`; `not-in-trash` — só item já na lixeira (R18).

### scrum_trash_empty
- Request: `{}`.
- Response: `Trash emptied; purged forever: <ids>.` ou `The trash was already empty.`
- Errors: nenhuma.

### scrum_archive_list
- Request: `{}`.
- Response: mesmo formato de `scrum_trash_list` com o carimbo `archivedAt`; vazio: `The archive is empty.`
- Errors: nenhuma.

### scrum_item_archive
- Request: `{ id: string (required; rel-/feat-/comp-/task-) }`.
- Response: `Archived: <ids, pais primeiro>. Bring back with scrum_item_unarchive.` — a subárvore viva vai junto; tarefa `done` arquivada continua contando nos totais da sprint encerrada e nos gates (R20); tarefa não `done` perde a sprint (R19).
- Errors: `invalid-id`; `not-found`; `in-trash` — restaure antes; `already-archived`; `task-in-active-sprint` (R19).

### scrum_item_unarchive
- Request: `{ id: string (required) }`.
- Response: `Unarchived: <ids>.` — ancestrais na lixeira ou no arquivo revivem; os arquivados pelo mesmo carimbo voltam juntos.
- Errors: `invalid-id`; `not-found`; `not-archived`.

### scrum_archive_completed
- Request: `{}`.
- Response: `Archived completed tasks: <ids>.` ou `Nothing to archive: no concluded tasks outside the active sprint.` — só tarefas `done` vivas fora da sprint ativa; funções e releases nunca em lote (R20).
- Errors: nenhuma.

### scrum_sprint_plan
- Request: `{ goal: string (required; ≤ 120), releaseId: string (optional; rel-N), releaseIds: string[] (optional; vence `releaseId`), startDate: string (optional; ISO), endDate: string (optional; ISO), taskIds: string[] (optional; tarefas do backlog) }`.
- Response: `Planned sprint spr-N #n "goal" for rel-… with N task(s). Start it with scrum_sprint_start.` — sprint `planned`; as tarefas selecionadas entram em `todo`.
- Errors: resolução de id de cada release e tarefa (R5); `task-already-in-sprint` (R12); `invalid-input` — meta vazia; `title-contract` — meta > 120 (R7). Tudo antes do id e do número (R4).

### scrum_sprint_assign
- Request: `{ sprintId: string (required), taskId: string (required), direction: string (required; enum add | remove) }`.
- Response: `Task task-N added to spr-N (todo).` ou `Task task-N returned to the backlog.` (sai da sprint, `status: backlog`, `doneAt` apagado).
- Errors: `not-found` — sprint ou tarefa; `sprint-completed` (R12); tarefa `in-trash`/`archived` (R16); `task-already-in-sprint` (add); `task-not-in-sprint` (remove) (R12).

### scrum_sprint_start
- Request: `{ sprintId: string (required) }`.
- Response: `Sprint spr-N #n "goal" is now active.` — `startDate` preenchida com agora se faltava.
- Errors: `not-found`; `invalid-transition` — sprint não `planned`; `sprint-already-active` — outra ativa (R10).

### scrum_sprint_end
- Request: `{ sprintId: string (optional; default: a sprint ativa) }`.
- Response: `Sprint spr-N completed; all tasks were done.` ou `Sprint spr-N completed; returned to backlog: <ids>.` — não `done` voltam ao backlog; `done` guardam o vínculo; `endDate` preenchida se faltava (R11).
- Errors: `not-found` — sem sprint ativa (sem `sprintId`) ou id desconhecido; `invalid-transition` — sprint não `active` (R10).

### scrum_sprint_status
- Request: `{ sprintId: string (optional; default: a sprint ativa) }`.
- Response: `spr-N #n "goal" [status] (releases)`, `d/t tasks done, p/P points, N day(s) remaining` (dias só com `endDate`), depois `  todo: …`, `  in_progress: …`, `  review: …`, `  done: …` (`—` quando vazia). Tarefas arquivadas `done` contam; na lixeira não (R20).
- Errors: `not-found` — `no active sprint` ou `sprint 'spr-N' does not exist`.

### scrum_task_move
- Request: `{ taskId: string (required), column: string (required; enum todo | in_progress | review | done) }`.
- Response: `Task task-N → <column>.` — entrar em `done` carimba `doneAt` (mantido se já havia); sair de `done` o apaga (R13). WIP limits nunca bloqueiam (R14). Nenhum efeito nos pais: fase e estado de componente/função/release são manuais (R6, ADR-016); com todas as tarefas `done` o componente continua em `construction` até `scrum_component_phase advance` e `scrum_item_update status: done`.
- Errors: `invalid-column` (o envelope já barra); `not-found`; `task-not-in-active-sprint` — sem sprint ativa ou tarefa fora dela (R13).

### scrum_ceremony_record
- Request: `{ type: string (required; enum planning | standup | review | retrospective), sprintId: string (optional; default: a sprint ativa), author: string (optional), notes: { category: string (required), text: string (required) }[] (required; ≥ 1) }`.
- Response: `Recorded <type> cer-N for spr-N (N note(s)).` — append-only (R15).
- Errors: `not-found` — sem sprint ativa (`pass an explicit sprintId`) ou sprint desconhecida; `invalid-input` — `notes` vazia (R15).

### scrum_ceremony_list
- Request: `{ sprintId: string (optional; restringe a uma sprint) }`.
- Response: mais antiga primeiro: `cer-N <type> @spr-N <at> by <author>` e uma linha `  [category] text` por nota; vazio: `No ceremonies recorded.`
- Errors: nenhuma (sprint desconhecida → lista vazia).

**Grupo B — a API HTTP (`scrum-api`, prefixo `/scrum-api`) e o comando `/scrum`.**

### GET /scrum-api/state
- Request: `GET /scrum-api/state?workspace=<caminho absoluto do workspace>`; sem `workspace`, o quadro global. Sem cabeçalhos exigidos.
- Response 200: `{ ok: true, state }` com `state = { tree, specs, sprints, ceremonies, activeSprintId, limits, trash, archive, stats }`:
  - `tree: { releases: [ Release & { titleOverflow?, features: [ Feature & { titleOverflow?, components: [ Component & { titleOverflow?, tasks: (Task & { titleOverflow? })[], readyForDone: boolean, readiness: { phase, status, next: fase | "done" | null, ok, reasons: string[] }, traces: TraceMatrixData } ] } ] } ] }` — só itens vivos; `readiness`, `readyForDone`, `traces` e `titleOverflow: { length, limit }` são calculados na leitura, nunca persistidos (R8). Os registros são os de `spec.ts`: Release `{ id, name, description?, targetDate?, status, order, createdAt, updatedAt, deletedAt?, archivedAt? }`; Feature `{ id, releaseId, title, description?, status, … }`; Component `{ id, featureId, title, description?, status, phase, requirements?, requirementsReview?, design?, validation?, phaseLog: { from, to, at }[], … }`; Task `{ id, componentId, title, description?, kind, estimate?, status, doneAt?, sprintId?, … }`.
  - `specs: SpecSetData | null` — `null` sem `workspace`; senão `{ exists, reason?: "absent" | "not-a-directory", entries: [{ file, owner?, minimal, state, version?, status?, digest?, ids, reasons, caseOf?, hint?, review? }], unknownReviews, summary: { minimal: { approved, total }, present, invalid, unknown, complete, reviewed } }` — metadados, nunca o texto (S3).
  - `sprints: (Sprint & { goalOverflow? })[]` mais recente primeiro; Sprint `{ id, number, goal, releaseIds, startDate?, endDate?, status, wipLimits?, createdAt, updatedAt }`.
  - `ceremonies: { id, type, sprintId, at, author?, notes: { category, text }[] }[]` mais antiga primeiro; `activeSprintId: string | null`; `limits: { title: 80, goal: 120 }` (a GUI lê daqui, nunca carrega número próprio).
  - `trash` / `archive`: itens planos, mais recente primeiro: `{ id, kind: "release" | "feature" | "component" | "task", taskKind?: test | code | other, title, parentId?, at, status, estimate? }` (`kind` é o nível; o kind da tarefa viaja em `taskKind`).
  - `stats: { sprintId, totals: { tasks, done, points, pointsDone }, tasks: { status, estimate?, doneAt? }[] }[]` — por sprint, de `sprintStatus` (arquivadas `done` contam), para burndown/velocity.
- Errors: nenhuma desta rota; caminho ou método diferente sob `/scrum-api` → 404 `{ ok: false, code: "no-such-route", message: "<METHOD> <path>" }`.

### POST /scrum-api/action
- Request: cabeçalho `Content-Type: application/json` obrigatório; corpo ≤ 262 144 bytes (256 KiB) — acima disso a conexão é destruída sem resposta JSON (S1; o handler ainda tenta um 400 `bad-json` com `message: "body too large"`, que normalmente não chega ao cliente); JSON `{ action: <nome>, ...campos, workspace?: string }` (`workspace` viaja ao lado do envelope; o schema o descarta e a rota o lê à parte). O envelope é uma união discriminada zod por `action`; enums importados do Model (S2). As 19 ações, seus campos e o `result`:
  - `createRelease { name: string (min 1), description?, targetDate? }` → Release. `createFeature { releaseId, title (min 1), description? }` → Feature. `createComponent { featureId, title (min 1), description? }` → Component. `createTask { componentId, title (min 1), description?, estimate?: number ≥ 0, kind?: test | code | other }` → Task.
  - `updateItem { id, title?, description?, estimate?: number ≥ 0, kind?: test | code | other, targetDate?, status?: string, goal?, releaseId?, releaseIds?: string[], wipLimits?: Record<string, number> (chaves validadas pelo Model — 409 `invalid-column` —, não pelo envelope), requirements?, requirementsReview?, design?, validation? }` → o registro atualizado (mesmas regras de `scrum_item_update`; sem as notas de aviso — a GUI lê `readiness`/`traces` do `state`).
  - `componentPhase { id, op: advance | set, phase?: <fase> }` → Component (`op`, não `action`, escolhe o verbo; não há `check`: a readiness vem no `state`).
  - `deleteItem { id, cascade?: boolean }` → `string[]`. `restoreItem { id }` → `string[]`. `purgeItem { id }` → `string[]`. `emptyTrash {}` → `string[]`. `archiveItem { id }` → `string[]`. `unarchiveItem { id }` → `string[]`. `archiveCompleted {}` → `string[]`.
  - `planSprint { goal (min 1), releaseId?, releaseIds?: string[], startDate?, endDate?, taskIds?: string[] }` → Sprint. `assignTask { sprintId, taskId, direction: add | remove }` → Task. `startSprint { sprintId }` → Sprint. `endSprint { sprintId? }` → `{ sprint, returnedToBacklog: string[] }`. `moveTask { taskId, column: <coluna> }` → Task.
  - `recordCeremony { type: <tipo>, sprintId?, author?, notes: { category (min 1), text (min 1) }[] (min 1) }` → Ceremony.
  - Sem equivalente HTTP: `scrum_suite_budget`, `scrum_trace` (impacto), os três briefs e `scrum_spec_status` — as leituras correspondentes viajam no `state` (`tree[].traces`, `specs`).
- Response 200: `{ ok: true, result, state }` — `result` é o valor que o método do Model devolveu; `state` é o estado fresco do mesmo quadro (mesma forma do GET).
- Errors (S1, S2): 415 `unsupported-media-type` — `Content-Type` não começa por `application/json` (antes de ler o corpo); 400 `bad-json` — corpo não parseável; 400 `bad-action` — envelope fora da união (ação desconhecida, campo faltante, tipo errado, enum fora do conjunto, `title`/`name`/`goal` iguais a `""`, `notes` vazia ou nota com `category`/`text` igual a `""`, `estimate` negativo), `message` = issues zod `path: message; …`; 404 `not-found`; 409 qualquer outro `ScrumError` (`phase-gate`, `done-gate`, `title-contract`, `invalid-status`, `invalid-input` — inclusive `title`/`name`/`goal` só-espaços, que passam o `min(1)` do envelope e o Model trima —, `invalid-phase` para `op: set` sem `phase`, `task-not-in-active-sprint`, …) sempre `{ ok: false, code, message }` com o `code` do Model intacto. `invalid-kind` é inalcançável por esta rota (o enum do envelope o transforma em 400 `bad-action`, S2); `invalid-column` só é inalcançável em `moveTask` (`column` é enum) — em `updateItem.wipLimits` (`Record<string, number>`) uma chave fora das colunas chega ao Model e volta 409 `invalid-column`. Erro que não é `ScrumError` não é traduzido — sobe ao host. Rota/método desconhecidos: 404 `no-such-route`.

### /scrum
- Request: `/scrum` sem argumento (verbo vazio). Quadro: o do cwd da sessão que invoca (R3).
- Response: `success` com o mesmo texto de `scrum_tree` (cabeçalho + hierarquia + `Sprints:` roster).
- Errors: um `ScrumError` vira `error` com texto `<code>: <message>`; verbo desconhecido → `error` com `Subcomando desconhecido: "<verbo>"` e o texto de uso.

### /scrum tree
- Request: `/scrum tree`.
- Response: `success` com o cabeçalho e a hierarquia (sem o roster).
- Errors: nenhuma além das gerais do comando.

### /scrum sprints
- Request: `/scrum sprints`.
- Response: `success` com o roster (`spr-N #n "meta" [status] início → fim (releases)`), ou `No sprints yet.`
- Errors: nenhuma além das gerais do comando.

### /scrum status [spr-N]
- Request: `/scrum status` (sprint ativa) ou `/scrum status spr-N`.
- Response: `success` com o texto de `scrum_sprint_status`.
- Errors: `not-found: no active sprint` / `not-found: sprint 'spr-N' does not exist` (como `error`).

### /scrum ceremonies [spr-N]
- Request: `/scrum ceremonies` (todas) ou `/scrum ceremonies spr-N`.
- Response: `success` com o texto de `scrum_ceremony_list`.
- Errors: nenhuma além das gerais do comando.

### /scrum trash
- Request: `/scrum trash`.
- Response: `success` com o texto de `scrum_trash_list`.
- Errors: nenhuma além das gerais do comando.

### /scrum archive
- Request: `/scrum archive`.
- Response: `success` com o texto de `scrum_archive_list`.
- Errors: nenhuma além das gerais do comando. O comando não tem verbo de mutação: escrever é das tools e da API.

## Ver também
- TESTS_SPEC.md — os casos críticos (CT) que provam cada endpoint, cada `code` e o mapeamento HTTP (dependente).
- ARCHITECTURE.md — o Controller que estes contratos expõem, o MVC da casa e os ADRs (ADR-001 workspace, ADR-003 regra no Model, ADR-016 estados manuais).
- RULES.md — as regras citadas inline em cada recusa (R1–R35, S1–S5, P5).
- GLOSSARY.md — os termos (quadro, espiral, gate, readiness, vivo, lixeira, arquivo, sonda, ScrumError).
- DATABASE_SCHEMA.md — as tabelas zod de `spec.ts` cujos registros viajam no `state` (dependente, a escrever).
- PRD.md — os objetivos que estas superfícies servem.
