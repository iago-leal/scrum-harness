---
title: "Arquitetura — scrum-harness"
purpose: "A topologia dos seis plugins DSH e do pacote compartilhado (@scrum-harness/probe), o MVC da casa (Model = scrum-domain, Controller = tools/API/comando/sonda, View = format + ui-scrum), os padrões adotados e as decisões já tomadas (ADRs) com contexto, opções e consequências."
version: 2
status: approved
owner: architect
---
# Arquitetura do sistema

Este documento registra a estrutura que realiza as regras de RULES.md (v3) no vocabulário de GLOSSARY.md: onde cada regra vive, como as superfícies a alcançam e por que cada decisão foi tomada. As decisões abaixo já estão implementadas; a fonte primária de cada uma é a seção de versão correspondente do `README.md` do repositório e o código citado.

## Topologia

O produto é um **bundle de plugins do DeepSeek Harness** (`packages/bundle-scrum/cordis.patch.yml`, aplicado sobre `dsh-base + dsh-web-app`) que insere seis linhas no grafo do host; a ordem das linhas não carrega semântica de carga — a ativação é dirigida por disponibilidade de serviço (`inject`).

```mermaid
flowchart LR
  subgraph node [Processo DSH]
    domain["@scrum-harness/domain\nctx.scrum (Model)"]
    tools["tool-scrum\n30 tools scrum_*"] --> domain
    cmd["command-scrum\n/scrum (leitura)"] --> domain
    ctxp["context-scrum\nagent/pre-step"] --> domain
    api["scrum-api\n/scrum-api/state|action"] --> domain
    probe["probe\n(pacote plano)"]
    tools --> probe
    cmd --> probe
    api --> probe
    domain --> sd["ctx.storageDomain\nscrum_ws_<hash>.json | scrum_global"]
  end
  subgraph browser [GUI web do DSH]
    ui["ui-scrum (lib/client.js)\ncoluna details + cápsula ▦ SCRUM"] -- fetch same-origin + poll --> api
  end
  probe -. só leitura .-> disk["<workspace>/specs/*.md\nspecs/reviews/*.review.md"]
  tools -. .gitignore raiz (S3) .-> disk
  git["git"] --- disk
```

- **Seis plugins e um pacote compartilhado**: os plugins são `@scrum-harness/domain` (o serviço `ctx.scrum`, um gerente de quadros), `tool-scrum` (registra em `ctx.tools`), `command-scrum` (registra em `ctx.commands`), `context-scrum` (listener `agent/pre-step`, `prepend: true`), `scrum-api` (registra em `ctx.webServer`) e `ui-scrum` (bundle de browser declarado por `dsh.client`; a metade Node é um `apply` vazio) — as seis linhas do patch. `@scrum-harness/probe` não é plugin: é um pacote plano, sem `apply` e fora do patch, importado por tools, comando e API. `@scrum-harness/test-support` é privado e só existe nas suites.
- **Um quadro por workspace** (R3): `ScrumService.board(cwd)` resolve `boardNameOf(cwd)` — caminho canônico (`realpath`) → `sha256` → `scrum_ws_<12 hex>` — e abre sob demanda, cacheado, um domínio `storage-domain` próprio (`scrumDomainSpec(name)`, `version: 1`, seis tabelas zod + `global` com contadores e `suiteBudget`). Sem cwd, o **quadro global** `scrum_global`. Tools e `/scrum` roteiam por `agent.session.header.cwd`; a API recebe o workspace do cliente (`?workspace=` / campo `workspace`, S4); a GUI segue a sessão da coluna.
- **A GUI** é o shell web do DSH: conversation view (chat), coluna `details` do AppFrame (onde o quadro renderiza, prioridade −1) e a cápsula «▦ SCRUM» em `conversation.session.header.utilities`. Não há servidor próprio: `fetch` same-origin nas rotas do `scrum-api`, com poll enquanto a coluna tem largura > 0.
- **O disco e o git**: `specs/` e `specs/reviews/` são lidos pela sonda e classificados pelo Model; o quadro nunca os escreve (R31). A única outra leitura de disco fora da sonda é a tool `scrum_trace`, que lê o `.gitignore` raiz do workspace (`existsSync`/`readFileSync` em `tool-scrum/src/index.ts`) e o reduz pelo Model (`gitignoreNames`, S3) — ambiente no Controller, regra no Model. O JSON do quadro vive em `DSH_HOME/storages/`, fora do git; as specs e revisões são versionadas com o código.

## Camadas

O MVC da casa (GLOSSARY «MVC da casa»; convenção desde a rel-17) é a única divisão em camadas, e a unidade dessa divisão é o **módulo/classe, não o pacote**: um pacote pode hospedar Model e View texto (`scrum-domain` abriga `service.ts` e também `format.ts`/`spec-brief.ts`), ou Controller e View texto (`context-scrum` abriga o listener e `snapshot.ts`); o desenho de cada componente declara qual módulo é o quê, e a revisão confere (C5).

- **Negócio = Model = `scrum-domain`.** Toda regra vive aqui (R1): as classes `ScrumService`/`ScrumBoard` (`service.ts`), os contratos (`contracts.ts`, `traces.ts`, `specs.ts`), o parser de frontmatter da casa, `boards.ts`, `kind.ts` e o schema da mídia (`spec.ts`). Gates rodam **dentro do mutador** do `table.update`, sobre o estado *next*, e recusam com `ScrumError` de `code` estável nomeando todas as condições (R2). Leituras são síncronas sobre o estado em memória; escritas aguardam durabilidade; `nextId` e `setSuiteBudget` compartilham a `globalChain` serializada (R4, P4).
- **Apresentação = View.** Duas formas do mesmo dado: texto (`format.ts` — `formatTree`, `formatSprints`, `formatReviewBrief`, `formatSpecStatus`…, e `spec-brief.ts` — `formatSpecBrief`/`formatSpecReviewBrief`, ambos módulos de `scrum-domain`; e `snapshot.ts` em `context-scrum`) consumido por tools, `/scrum` e o contexto do agente; e React (`ui-scrum`) consumido no browser. A View imprime o que o Model já decidiu (`readiness`, `readyForDone`, `titleOverflow`, `traces`, `SpecSetData`); affordances que espelham uma regra (contador `N/80`, cerca do frontmatter) são declaradas no desenho e conferidas na revisão (C5).
- **Controller.** `tool-scrum`, `scrum-api`, `command-scrum`, `context-scrum` e `probe` traduzem chamada → método e nunca decidem: enums do envelope importados do Model (`BOARD_COLUMNS`, `TASK_KINDS`, `COMPONENT_PHASES`), números lidos de `TitleContract.limits()` no registro, erros do domínio traduzidos sem reinterpretar (S2). A sonda entrega dados do ambiente e nunca lança (S5).
- **Persistência.** `@deepseek-ai/dsh-storage-domain` sobre o hub `dsh-storage` (backend JSON com `writeAtomic`); nas suites, o mesmo hub com o backend `memory` de `test-support`. Nenhum consumidor toca o domínio de storage diretamente: só `ScrumBoard`.

## Componentes principais

| Pacote | Camada (por módulo) | Papel | Depende de | Owner (spec) |
|---|---|---|---|---|
| `scrum-domain` (`@scrum-harness/domain`) | Model (`service.ts`, contratos, `spec.ts`…) + View texto (`format.ts`, `spec-brief.ts`) | `ctx.scrum`, `ScrumBoard`, contratos, matriz, spec set, briefs | `cordis`, `dsh-storage-domain`, `zod` | architect / domain |
| `scrum-probe` (`@scrum-harness/probe`) | Controller (sonda) | `listSpecFiles`, `listWorkspaceFiles`, `resolveWorkspacePath` — só ambiente | nenhuma | architect |
| `tool-scrum` | Controller | 30 tools `scrum_*`, saída id-first; única escrita do agente no quadro | `domain`, `probe`, `dsh-tools` | api-data |
| `command-scrum` | Controller | `/scrum` somente leitura (tree, sprints, status, ceremonies, trash, archive) | `domain`, `probe`, `dsh-commands` | api-data |
| `context-scrum` | Controller (`index.ts`) + View texto (`snapshot.ts`) | snapshot no 1º step do turno, só quando muda (P2, P3); `snapshot.ts` puro | `domain`, `dsh-agent`, `dsh-llm` | agents |
| `scrum-api` | Controller | `GET /scrum-api/state`, `POST /scrum-api/action`; 415/400/404/409 (S1, S2) | `domain`, `probe`, `zod`, `dsh-host-webserver` | api-data |
| `ui-scrum` (`@scrum-harness/ui`) | View | coluna `details`, cápsula, work item form, Kanban, Sprints, Arquivo, Lixeira; markdown + mermaid | `dsh-client-*` (tipos), `marked`, `dompurify`, `mermaid`, `@primer/primitives` | api-data (UI_UX_SPEC) |
| `bundle-scrum` | instalação | `dsh.bundle` com o `cordis.patch.yml` | os seis plugins | ops |
| `test-support` (privado) | teste | backend KV `memory`; fixtures puras (`CONTRACT_REQ`, `CONTRACT_DESIGN`) | `dsh-storage` | test |

## Padrões adotados

- **Contratos como classes** (GLOSSARY «Contrato»): a família `ArtifactContract<M>` — `RequirementsContract`, `ReviewContract`, `ValidationContract`, `TraceContract` — sobre os artefatos do componente; `SpecContract`/`SpecReviewContract` são irmãos **por técnica** (mesmo `parseFrontmatter`, mesmo `digestOf`, mesmo `describeIssue`) sobre texto do disco. Sem estado; `check` devolve todas as razões em ordem fixa (R2, R22–R26, R32–R33).
- **Value objects**: `TitleContract` (tetos 80/120, `tone`, `limits()` — R7, R8) e `SuiteBudget` (`fromGlobal`, `validate`, razão acima do default — R28).
- **Gates dentro do mutador**: `phaseGate`/`doneGate` avaliam o estado *next* dentro do `table.update`; `phaseReadiness`/`doneReadiness` são a mesma lógica lida sem mutar — uma fonte para `check`, snapshot e trilha do form (R21, R27).
- **Migração no parse** (R35): `phase`, `kind` e `releaseIds` nascem em `.transform` dos schemas zod, sem bump da mídia; `splitKindPrefix` é total.
- **Read models deep-frozen**: `tree()` anota `readiness`, `readyForDone`, `traces` e `titleOverflow` na leitura, nunca persistidos; `TraceMatrix.of` e `SpecSet.of` devolvem objetos `deepFreeze`.
- **Briefs gerados pelo Model, renderizados pela View**: `ScrumBoard.reviewBrief` → `formatReviewBrief`; `SpecBrief.of`/`SpecReviewBrief.of` → `formatSpecBrief`/`formatSpecReviewBrief`; a tool só entrega. É assim que as convenções da casa viajam a qualquer workspace (R29, R34).
- **Sondas que nunca lançam** (S5): erro vira `absent`/`not-a-directory`/`unreadable`; caps (`SPEC_FILE_CAP`, `TRACE_PROBE_CAP`) e `truncated` em vez de exceção (P5).
- **Interruptores de página puros na GUI**: `createSwitch<T>` (`side.ts`) — `side` transiente, `theme` persistido em `localStorage`, `placement` do form — com a máquina de gestos `nextSideAction`/`applySideAction`/`shouldRegister` e `pollGate(width)`; a registração no slot é *efeito* do interruptor.
- **Settler para ordenação do wire** (`settle.ts`): ticket monotônico no disparo, marca d'água `applied`, resultado mais antigo descartado, `run` devolve `RunOutcome` e nunca rejeita.
- **Lógica pura fora do React**: `side.ts`, `drag.ts`, `settle.ts`, `form.ts`, `mermaid.ts`, `markdown.ts` testam em Node sem jsdom; adaptadores (`mermaid-engine.ts`) recebem `document` e a lib por parâmetro.

## Decisões arquiteturais (ADRs)

- ADR-001: Um quadro por workspace, resolvido pelo cwd da sessão (v0.5).
  Contexto: até a v0.4 havia um único `scrum.json`; sessões de repositórios diferentes compartilhavam o mesmo quadro.
  Opções: quadro único com campo `workspace` por item; um domínio de storage por workspace; um DSH_HOME por projeto.
  Escolha: `ctx.scrum` vira gerente de quadros — `boardNameOf(cwd)` (canônico → hash) abre um domínio por workspace, cacheado; sem cwd, `scrum_global`.
  Consequências: R3 vale em toda superfície pelo mesmo `board(cwd)`; a API precisa receber o workspace do cliente (S4); a GUI segue a sessão; a migração do quadro único foi um script único (`scripts/migrate-v0.5.mjs`).
- ADR-002: Persistência em storage-domain JSON; KV em memória nas suites (origem do projeto — seção «Arquitetura» do README, anterior à primeira seção datada; v0.15).
  Contexto: os dados devem sobreviver às conversas e ser compartilhados por tools, `/scrum` e GUI; a suite media 14,15 s porque cada mutação pagava ~17 ms de `fsync` (`writeAtomic`).
  Opções: SQLite; arquivo próprio; `defineDomain` do DSH; nas suites, mocks do domínio ou um backend em memória atrás do mesmo facet.
  Escolha: `defineDomain` com tabelas zod e `global`; `test-support` registra o backend `memory` (mesmo facet `kv`) — as suites atravessam hub + storage-domain + `ScrumService` reais.
  Consequências: durabilidade e schema-on-read de graça; a suite caiu para 1,21 s (pior de 3) e o orçamento do quadro foi fixado em 10 s (R28); as suites de close/reopen seguem no JSON.
- ADR-003: Toda regra no Model; controllers traduzem (rel-17).
  Contexto: até a rel-17 tool, API e GUI podiam decidir de forma divergente (ex.: `status: done` passava livre pela API e pelo drag).
  Opções: validar em cada superfície; middleware compartilhado; um Model único com gates dentro do mutador.
  Escolha: MVC da casa — `ScrumBoard` decide; tools/API/comando/sonda traduzem; View imprime; o desenho de todo componente declara M/V/C e a revisão confere.
  Consequências: R1, R2, S2, C5; enums e limites importados do Model; readiness anotada no `tree()` para a API levar de graça; custo: `service.ts` concentra ~1 800 linhas.
- ADR-004: Artefatos como markdown com frontmatter, contratados por objetos (comp-42, comp-48).
  Contexto: (a) v0.12, «Motor da espiral» (comp-42) — os artefatos de um componente precisavam ser consultáveis por agentes e editáveis por humanos, sem inflar o schema do quadro com campos estruturados; (b) v0.13 (comp-48) — o gate `requirements → design` aceitava "qualquer texto", e `version` manual e `verdict: resolved` deixavam o gate contornável pelo próprio agente.
  Opções: campos estruturados no schema do quadro; JSON separado; markdown + frontmatter YAML no subset da casa, verificado por contrato.
  Escolha: no comp-42, quatro campos de texto (`requirements`, `requirementsReview`, `design`, `validation`) em markdown com frontmatter e `parseFrontmatter` próprio (mini-parser sem dependência: escalares, listas inline, objetos de um nível, blocos `- item`); no comp-48, a família `ArtifactContract` com digest sha1 curto que fixa a revisão ao texto, dando dentes ao gate.
  Consequências: R22, R26, R30; o texto continua legível e editável por agente e humano; digest e `traces:` são byte-sensíveis (render nunca reescreve o artefato); valores só-dígitos viajam entre aspas.
- ADR-005: A espiral com gates avaliados dentro do mutador e recuo livre (comp-42, comp-47).
  Contexto: a disciplina requisitos → revisão → design → TDD → construção → validação era hábito do agente, não contrato.
  Opções: fases como convenção de título; workflow configurável; cinco fases fixas com gate por passo.
  Escolha: `phase` no componente com `.transform`, `advancePhase`/`setPhase` com gate no `table.update` (sem janela ler-verificar-escrever), recuo livre e `phaseLog` append-only; `done` só pela transição, com `ValidationContract`.
  Consequências: R21–R27; a leitura do gate (`phaseReadiness`) alimenta tool, snapshot e form; o dogfood é obrigatório (C1); o hotfix da v0.23 mostrou que só o que nasce como componente é disciplinado (risco do PRD).
- ADR-006: Matriz de rastreabilidade no frontmatter do design; as-built na validação vence (comp-49).
  Contexto: todo desenho já trazia `traces:` por convenção, mas nenhum gate a lia, e os cinco componentes `done` que traziam `traces:` (comp-42, 45, 46, 47, 48) tinham requisitos sem rastro e entradas que não eram caminhos.
  Opções: tabela própria no schema; arquivo externo; o `traces:` que já existia, lido por contrato.
  Escolha: `TraceContract` sobre o `design` (plano) e a `validation` (as-built, quando traz `traces:` array); `TraceMatrix.of` leniente para leitura; `impact` puro no Model, sonda no Controller.
  Consequências: R23, R26, S3; gates `design → tdd` e `done` com dentes; `scrum_trace` responde impacto por caminho sem o Model tocar o filesystem.
- ADR-007: Tokens Primer escopados sob as raízes do quadro na GUI; tema como interruptor de página (v0.8, v0.10, v0.22).
  Contexto: o quadro na GUI precisava de um design system sem vazar para o shell; depois, dois pontos de montagem visíveis ao mesmo tempo.
  Opções: `@primer/css` (reescrita BEM); `@primer/react` (bundle desproporcional); `@primer/primitives` como tokens re-escopados de `:root` para as raízes do quadro (`.scrum-view`, `.scrum-wi-overlay`).
  Escolha: `primer.ts` embarca as duas folhas de tema atrás de `data-color-mode`; `styles.ts` fala só tokens semânticos; o tema saiu do store e virou `createSwitch` persistido (`scrum-theme`).
  Consequências: dark mode a um atributo; SVG, chips e markdown (`.scrum-md`) flipam de graça; o CSS como string é o grosso do bundle pré-mermaid.
- ADR-008: SCRUM na coluna `details` por registro alternável em prioridade −1; cápsula no cabeçalho da sessão (comp-55, v0.23).
  Contexto: "ficar indo e voltando está muito ruim" — a aba do anel `conversation.view` era exclusiva com o chat; 14 fatos do shell medidos (coluna `details` ocupada pelo `DetailsPanel`, slot `single` com shadowing por prioridade, coluna nunca desmonta, `ctx.layout` sem leitura); o slot `sidebar.footer.action` é um flex ocupado pelo trigger do Cordis e não comporta um segundo botão.
  Opções: sidebar; aba lado a lado no ring; ocupar `details` com registro permanente; registro **alternável** como efeito de um interruptor.
  Escolha: `ctx.slots.inject('details')` sincroniza um `register({ priority: -1 })` enquanto `shouldRegister(side)`; a cápsula «▦ SCRUM» em `conversation.session.header.utilities`; store dedicado por ponto de montagem (postmortem de 01/09: *one handle, one scope*); o hotfix v0.23 aposentou a aba e o botão «⇥ Ao lado».
  Consequências: poll por visibilidade (coluna fechada = zero requisições); os detalhes de tool ficam sombreados com o modo ligado; o form modal cobre a página a partir da coluna; `DETAILS_MAX` subiu para 900 no DSH (comp-57, outro repositório).
- ADR-009: Instâncias dedicadas de `marked` e `DOMPurify` com política explícita (comp-58).
  Contexto: mermaid registra hooks globais na instância padrão do DOMPurify (reescreve `rel`) e `marked.use` no singleton contaminaria o `lexer` do motor; `<svg><image href>` furava o "sem rede".
  Opções: reusar os singletons; renderer próprio; instâncias dedicadas com `USE_PROFILES`, `FORBID_TAGS`/`FORBID_ATTR`, `href` só `https?:`/`mailto:`/`tel:`/`#`, `<img>` só `data:`.
  Escolha: `new Marked()` e `DOMPurify(window)` configurados em `markdown.ts`, injetados pela mesma costura do engine; frontmatter como tabela literal; segmentos com diagramas emparelhados por posição.
  Consequências: Visualizar nunca dispara rede a partir do conteúdo; +12 KB no bundle; o `textarea` continua o único escritor.
- ADR-010: Um motor mermaid embarcado no bundle (~3,8 MB) (comp-44).
  Contexto: 19 blocos ```mermaid nos desenhos nunca lidos como diagrama; a plataforma não tem lazy-load de bundle de plugin (`boot.ts` cria toda linha; `assertEntriesActive` derruba o boot) e o loader aceita um só CJS.
  Opções: pacote separado (derrubado em três rodadas: só download paralelo, irrelevante em localhost, mais uma causa de falha total); CDN; sem render; embutir com `minify`.
  Escolha: `mermaid` inlinado em `lib/client.js` (3 798 331 bytes / 1 010 662 gz), `startOnLoad = false` na linha seguinte ao import, `initialize` adiado ao primeiro render, adaptador sem importar a lib.
  Consequências: factory do plugin ~75 ms no boot, primeiro render ~240 ms; o `.map` de 13 MB só com DevTools; risco declarado no PRD.
- ADR-011: Sonda como pacote próprio (comp-59).
  Contexto: a sonda do `scrum_trace` morava em `tool-scrum/src/probe.ts`, inalcançável por `command-scrum` e `scrum-api` (HIGH da rodada 1).
  Opções: duplicar em cada controller; mover para o Model (que não pode tocar o filesystem); pacote plano compartilhado.
  Escolha: `@scrum-harness/probe` sem dependências e sem `apply`; `tool-scrum/src/probe.ts` vira shim de re-export (a matriz arquivada do comp-49 continua válida).
  Consequências: R31, S3, S5 valem igualmente para tools, comando e API; o Model recebe `SpecsProbe` como dado.
- ADR-012: Specs no disco; o quadro nunca escreve; revisões em `specs/reviews/`; carimbo humano (comp-59, comp-60).
  Contexto: o cap. 6 do livro faz da spec "o ativo durável", versionada com o código; decisão do usuário: o quadro lê, contrata e rastreia, nunca é a fonte.
  Opções: specs como artefatos do quadro; specs no disco com o quadro escrevendo; specs e revisões no git, briefs gerados pelo quadro, escrita pelos agentes.
  Escolha: `SpecCatalog` (15 arquivos, cadeia de owners), `SpecContract`/`SpecReviewContract`, `SPEC_PREDECESSORS` (DAG direto), `SpecOrder.gate`; `scrum_spec_brief`/`scrum_spec_review_brief` não escrevem arquivo; `status: approved` só humano.
  Consequências: R29–R34; C4 impõe o spec set deste repositório pelo teste `repo-specs.spec.ts`; nada detecta deriva spec ↔ código além da revisão adversarial (risco do PRD).
- ADR-013: `TASKS.md` fora do conjunto mínimo porque o quadro é o backlog (comp-59).
  Contexto: a Tabela 6.3 lista `TASKS.md` como backlog operacional; aqui o backlog já é dado durável do quadro.
  Opções: exigir `TASKS.md` gerado do quadro; exigi-lo escrito à mão; declarar o desvio.
  Escolha: conjunto mínimo `PRD + RULES + API_SPEC`; `TASKS.md` continua no catálogo (owner `ops`) mas não pesa em `complete`.
  Consequências: R34; GLOSSARY proíbe "backlog como arquivo"; o PRD registra o desvio.
- ADR-014: Tetos de título e meta como gate do domínio; legado lido e marcado (comp-53).
  Contexto: p50 de 75 e máximo de 532 chars de título, 18 de 19 metas acima de 80 — o snapshot escondia o vício cortando na leitura.
  Opções: cortar na View; rejeitar na leitura (inviabilizaria abrir quadros antigos); gate na escrita com marcação do legado.
  Escolha: `TitleContract` (80/120 code points, sem controle nem quebra) nas sete escritas, antes do `nextId`; `titleOverflow`/`goalOverflow` só em leitura; GUI lê `state.limits`.
  Consequências: R7, R8, C3; recusa nunca queima id; a linha `Higiene:` do snapshot e as descrições de parâmetro (comp-54) fecham causa e leitura.
- ADR-015: Orçamento da suite por quadro com pior de 3 rodadas (comp-50).
  Contexto: o gate do comp-47 barrou o próprio comp-47 (15,65 s contra 15 constante) e a medição ruidosa convidava a escolher a rodada boa.
  Opções: constante no domínio; orçamento por componente; orçamento por quadro no `global`, com `suite.runs` e razão para subir.
  Escolha: `SuiteBudget` em `BoardGlobal` (mídia antiga carrega), `scrum_suite_budget`, `ValidationContract` nascendo com `{ budgetSeconds }`, `runs ≥ 3` com a pior reportada em `wall_seconds`.
  Consequências: R26, R28, P1; este quadro está em 10 s; a evidência continua auto-declarada (ver trade-offs).
- ADR-016: Estados de pai são workflow manual por nível, nunca propagados (v0.4, v0.6).
  Contexto: desde a v0.4 cada nível tem workflow próprio (componente `proposed → in_progress → done`, função `proposed → committed → in_progress → done`, release `planned → active → released`) e o Backlog/Board da GUI mostram rollup de progresso (barra + pontos concluídos/total) nos pais, à la Azure DevOps; fechar a última tarefa de um componente levantava a pergunta de se o componente (e a função) deveriam fechar sozinhos.
  Opções: propagar ao fechar a última tarefa (última `done` fecha o pai); propagar só para `in_progress` (primeira tarefa iniciada abre o pai); manter os estados de pai manuais e mostrar o rollup como leitura.
  Escolha: manuais, por decisão de produto (v0.6, estilo Azure): componente/função só mudam de coluna por arrasto no board do nível, pelo work item form ou por `scrum_item_update` (release, que não tem board, pelo form ou pela tool); o rollup é só visual. O `done` do componente ganhou depois um gate próprio (ADR-005, comp-47), que continua sendo avaliado apenas na transição pedida explicitamente — nunca disparada por uma tarefa.
  Consequências: R6 (estado fora do conjunto recusado com `invalid-status`; nada se propaga aos pais); a linha «Disciplina do board» do snapshot (`snapshot.ts`) pede ao agente que mantenha os estados dos pais em dia com `scrum_item_update`; a GUI mostra rollup sem decidir (C5); um componente com todas as tarefas `done` fica em `construction → validation` até alguém avançar a fase e pedir `done` — o que API_SPEC e AGENTS precisam explicar.

## Trade-offs aceitos

- **Dois polls quando aba e coluna estavam visíveis** (v0.22, histórico): dois stores por escopo `session` compartilhavam por dados, não por handle; o custo sumiu com a aposentadoria da aba na v0.23.
- **Tamanho do bundle**: ~3,8 MB (1 MB gz) dominados pelo mermaid, sem lazy-load na plataforma; medido só em dogfood local.
- **Interruptor lateral transiente**: reload = coluna desligada, espelhando o store de layout do DSH; o tema e a posição do form seguem regras próprias (persistido / nunca persistido).
- **Nenhum verificador roda a suite**: `validation` é evidência auto-declarada pelo agente; o gate confere a forma e a aritmética, não a execução (risco do PRD, candidato do cap. 7 «verifier»).
- **Dependência de APIs internas do DSH**: slot system, coluna `details`, `ctx.layout`, waterfall `agent/pre-step`, `defineStore`, `storage-domain` — podem mudar sem aviso; os e2e (`scripts/e2e-side.mjs`) medem o shell vivo.
- **JSON do quadro fora do git**: processo (fases, cerimônias, sprints) vive em `DSH_HOME/storages/`; só specs e revisões são versionadas — o histórico de decisões de processo depende do `README.md` e dos artefatos dos componentes.
- **Sem autenticação nem multiusuário** (S4): o único isolamento é o workspace escolhido pelo cliente, servido pelo DSH da própria máquina.

## Ver também
- API_SPEC.md — as 30 tools e as rotas `/scrum-api` que este Controller expõe (dependente).
- DATABASE_SCHEMA.md — as tabelas zod de `spec.ts` e o `global` do quadro (dependente).
- UI_UX_SPEC.md — coluna `details`, cápsula, work item form e telas do `ui-scrum` (dependente).
- AGENTS.md — como o agente opera a espiral, as tools e as restrições que os gates impõem (dependente).
- WORKFLOW.md — o pipeline entre agentes: briefs, revisão adversarial, carimbo (dependente).
- PROMPTS.md — os briefs gerados pelo Model como prompts versionados (dependente).
- RULES.md — as regras que cada ADR realiza, citadas inline por id.
- GLOSSARY.md — o vocabulário usado aqui (quadro, espiral, gate, contrato, sonda, MVC da casa).
- PRD.md — os objetivos e riscos que estas decisões atendem ou declaram.
