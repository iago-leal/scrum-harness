---
title: "Glossário — scrum-harness"
purpose: "Os termos do domínio definidos uma vez, no sentido que este projeto usa: hierarquia do backlog, sprint e board, espiral, contratos e artefatos, spec set, superfícies e processo."
version: 3
status: approved
owner: domain
---
# Glossário do domínio

Cada termo é definido uma única vez, em uma frase, no sentido que ESTE projeto usa; quando uma regra o restringe, ver também RULES.md. Nomes em pt-BR; o identificador em inglês entre parênteses é o que o código, as tools e o snapshot usam.

## Termos

### Hierarquia do backlog
- **Quadro (board)** — o estado SCRUM completo de um workspace (hierarquia, sprints, cerimônias, contadores e orçamento da suite), persistido em storage próprio e compartilhado por tools, `/scrum`, API HTTP e GUI.
- **Workspace** — o diretório de trabalho (cwd) da sessão, que resolve qual quadro se abre (`scrum_ws_<hash>`); é o único escopo de isolamento do produto.
- **Quadro global** — o quadro (`scrum_global`) que as sessões sem cwd compartilham.
- **Release** — o topo da hierarquia (`rel-N`): uma versão entregável do produto, com nome, data alvo e estado `planned | active | released`.
- **Função (feature)** — um agrupamento de valor dentro de uma release (`feat-N`), com estado `proposed | committed | in_progress | done`.
- **Componente (component)** — a entrada do backlog de produto (o conjunto dos componentes; ver "Backlog") sob uma função (`comp-N`): a unidade que caminha pela espiral e carrega os artefatos; estado `proposed | in_progress | done`, sendo `done` gateado (ver RULES.md).
- **Tarefa (task)** — a menor unidade de trabalho, sob um componente (`task-N`), com estimativa em pontos e um kind.
- **Kind** — a natureza de uma tarefa: `test` (escreve o teste), `code` (escreve o código) ou `other`; inferido do prefixo `[test]`/`[code]` do título, que sai do título armazenado.
- **Estado (status) por nível** — o workflow manual próprio de cada nível (release, função, componente, tarefa); nunca se propaga sozinho para os pais.
- **Ids de item** — os identificadores estáveis e sequenciais por tipo: `rel-`, `feat-`, `comp-`, `task-`, `spr-` (sprint) e `cer-` (cerimônia); uma recusa de gate nunca consome um id.
- **Título (title)** — a linha do QUÊ de um item, ≤ 80 code points sem quebra de linha; o COMO vai na descrição.
- **Meta de sprint (goal)** — a linha de propósito de uma sprint, ≤ 120 code points sem quebra de linha; o raciocínio vai na cerimônia de planning.
- **Migração no parse** — a técnica de evoluir o schema do quadro dentro do `parse` da mídia (transform com default), sem bump de versão nem script: mídia antiga carrega intacta.

### Sprint e board
- **Sprint** — uma janela de tempo (`spr-N`) que seleciona tarefas da hierarquia e pode vincular várias releases; estado `planned | active | completed`, com no máximo uma ativa por quadro.
- **Backlog (estado de tarefa `backlog`)** — o estado de uma tarefa fora de qualquer sprint (sem `sprintId`); com as quatro colunas do Kanban forma os cinco `status` de tarefa (`backlog | todo | in_progress | review | done`). Por extensão, "backlog de produto" é o conjunto dos componentes e "o quadro é o backlog" nomeia a hierarquia inteira.
- **Sprint Backlog** — o conjunto de tarefas selecionadas para uma sprint; ao encerrá-la, as não concluídas voltam ao estado `backlog` e só as `done` guardam o vínculo.
- **Kanban** — o board da sprint ativa, com as colunas `todo | in_progress | review | done`; mover tarefas só é permitido na sprint ativa.
- **WIP limit** — o teto opcional de tarefas por coluna do Kanban (`wipLimits`), que avisa ao estourar mas nunca bloqueia.
- **Raia (swimlane)** — a linha horizontal do Kanban que agrupa as tarefas de um componente, com rollup por raia (a soma de tarefas e pontos da raia).
- **Velocity** — os pontos concluídos por sprint encerrada, com a média das últimas três.
- **Burndown** — os pontos restantes de uma sprint ao longo do tempo, alimentado pelo carimbo `doneAt` de cada tarefa que entra em `done`.
- **Cerimônia (ceremony)** — um registro append-only (`cer-N`) de `planning | standup | review | retrospective` de uma sprint, com notas categorizadas; sprints e cerimônias são história e nunca vão à lixeira.
- **Vivo (live)** — o item que não está nem no Arquivo nem na Lixeira (sem `archivedAt` nem `deletedAt`); o único que as mutações aceitam — os três estados são mutuamente exclusivos.
- **Arquivo (archive)** — o depósito reversível dos itens concluídos (`archivedAt`), que saem das vistas principais mas continuam contando nos totais das sprints encerradas e nos gates de tarefas.
- **Lixeira (trash)** — o soft delete (`deletedAt`) de qualquer item da hierarquia, restaurável; excluir sempre passa por ela.
- **Purge** — a remoção física de um item já na lixeira (ou o esvaziamento dela), sem volta; uma release purgada apenas desvincula suas sprints.

### Espiral
- **Espiral (spiral)** — o ciclo de desenvolvimento de um componente pelas cinco fases `requirements → design → tdd → construction → validation`, fechadas pelo `status: done` (o `next` da readiness em `validation`), sempre um passo por vez.
- **Fase (phase)** — a posição atual de um componente na espiral; distinta do estado, que é o workflow do nível (ver "Sinônimos proibidos").
- **Gate** — a condição para avançar uma fase (ou fechar `done`), avaliada no Model dentro do mutador, que recusa nomeando todas as razões de uma vez; recuar é livre (salvo componente `done`, que não move fase), pular é sempre recusado.
- **phaseLog** — o histórico append-only de todo movimento de fase de um componente (`from`, `to`, `at`).
- **Readiness** — a leitura do gate sem mover nada (`{ phase, status, next, ok, reasons }`), com exatamente as razões que um avanço receberia; a mesma fonte do `check` da tool, do snapshot e da trilha do form.
- **TDD estrito** — a disciplina da fase `tdd`. Gate: ao menos uma tarefa `test` e nenhuma `code` criada antes da primeira `test` (ordem pelo número do id); convenção da casa, não verificada pelo gate: o teste vermelho antes do código.
- **Dogfood** — o uso do próprio produto para desenvolvê-lo: cada componente deste repositório passa pela espiral que ele entrega, e o agente que o desenvolve recebe o próprio snapshot.

### Contratos e artefatos
- **Artefato (artifact)** — um dos quatro textos de um componente (`requirements`, `requirementsReview`, `design`, `validation`), em markdown com frontmatter, guardados no quadro e lidos pelos gates.
- **Frontmatter** — o bloco YAML entre cercas `---` a partir da linha 1, no subset da casa (escalares, listas e objetos inline, blocos `- item`, um nível de aninhamento); um valor de texto composto só de dígitos (digest, data) viaja entre aspas, porque o parser lê dígitos nus como número; inteiros (`version`, `round`) viajam nus.
- **Contrato (contract)** — um objeto do Model, sem estado, que dá forma verificável a um texto e devolve todas as condições violadas com o caminho do campo.
- **ArtifactContract** — a família dos contratos sobre artefatos de componente: `RequirementsContract`, `ReviewContract`, `ValidationContract` e `TraceContract`.
- **RequirementsContract** — o contrato dos requisitos: `version` inteiro ≥ 1, carimbo humano `status: approved` e corpo não vazio; e a extração dos ids `R<n>[letra]` declarados no início de linha, que a matriz usa.
- **ReviewContract** — o contrato da revisão adversarial como par com os requisitos: estruturada, `verdict: approved` com `findings.high 0`, cobrindo a mesma versão e o mesmo digest.
- **ValidationContract** — o contrato da evidência do `done`: suite verde (`passed + skipped = tests`), `typecheck: clean` e `wall_seconds ≤ budget_seconds ≤` orçamento do quadro.
- **TraceContract** — o contrato da matriz de rastreabilidade: forma das entradas, caminhos relativos ao workspace e cobertura de todos os ids dos requisitos.
- **SpecContract / SpecReviewContract** — os irmãos por técnica (mesmo parser, mesmo digest) que contratam, respectivamente, uma spec e sua revisão lidas do disco.
- **TitleContract** — o contrato sobre uma string, não sobre um artefato: os tetos de título e meta, sem quebra de linha nem caractere de controle.
- **SuiteBudget** — o value object do orçamento da suite do quadro, com origem (`default | board`) e razão obrigatória acima do default.
- **Digest** — os 8 primeiros hex do sha1 do corpo (texto após o frontmatter) com espaços e quebras das pontas removidos (`trim`), que fixa uma revisão ao texto exato que cobriu.
- **Carimbo humano (stamp)** — o `status: approved` no frontmatter de requisitos ou de spec, decidido pelo humano de uma de duas formas: ele mesmo edita o campo (work item form ou git), ou responde «aprovar» a uma pergunta explícita do agente que nomeia o arquivo ou componente, a versão e o digest de um texto cuja revisão `current` tem 0 HIGH — e então o agente grava só esse campo; um pedido vago não é carimbo; o quadro o lê, nunca o escreve (ver PRD.md «Persona alvo» e «Riscos conhecidos», RULES.md R29).
- **Revisão adversarial (review)** — o parecer de um revisor independente sobre requisitos ou spec, em rodadas (`round`), com `findings` contados por `high | medium | low` e `verdict: approved | needs-revision`.
- **Matriz de rastreabilidade (traces)** — o `traces:` do frontmatter do design (o plano) ou da validação (o as-built, que vence): uma entrada inline por linha `{ req, files, tests }`, `files: []` para requisito sem código.
- **Orçamento da suite (suite budget)** — o teto de segundos da suite que o quadro impõe ao `budget_seconds` (default 15); com `suite.runs` (≥ 3 rodadas consecutivas) a pior rodada conta e `wall_seconds` deve reportá-la.

### Specs (SDD)
- **Spec** — um arquivo markdown de `<workspace>/specs/`, com frontmatter (`title`, `purpose`, `version`, `status`, `owner`) e ids estáveis, versionado com o código; o quadro lê, contrata e rastreia, nunca escreve.
- **Spec set** — o conjunto das specs de um workspace lido pela sonda e classificado pelo Model (`SpecSetData`).
- **Catálogo de specs (SpecCatalog)** — os 15 arquivos canônicos na ordem da cadeia de owners `product | domain | architect | api-data | test | agents | ops`, cada um com um dono.
- **Conjunto mínimo** — `PRD + RULES + API_SPEC`: os três que, `approved` e sem catálogo inválido, tornam o spec set `complete` (`TASKS.md` fica fora porque o quadro é o backlog).
- **Predecessor / cadeia dos agentes (SPEC_PREDECESSORS)** — o DAG direto entre specs (PRD ← ∅; GLOSSARY/RULES/TASKS/README ← PRD; ARCHITECTURE/TECH_STACK/SECURITY ← RULES; API_SPEC/DATABASE_SCHEMA/UI_UX_SPEC/AGENTS/WORKFLOW/PROMPTS ← ARCHITECTURE; TESTS_SPEC ← RULES + API_SPEC), sem transitividade.
- **Estado de spec** — a classificação de um arquivo do catálogo: `missing | draft | approved | invalid | unknown` (`unknown` é um arquivo fora do catálogo, nunca inválido).
- **Revisão de spec** — a revisão adversarial de uma spec, no disco em `specs/reviews/<stem>.review.md`, com estado por precedência `none > invalid > stale > needs-revision > current`: uma revisão bem formada de uma spec `missing`/`invalid` é `stale` sem comparar versão ou digest.
- **Gate de ordem (SpecOrder)** — a lista de razões do predecessor direto que não está `approved` com revisão `current`, nomeando todas de uma vez: recusa `scrum_spec_brief` (código `spec-order`) e viaja como avisos (`orderWarnings`) em `scrum_spec_review_brief`.
- **Brief** — o briefing que o quadro gera para um agente: `scrum_component_review_brief` (revisor de requisitos), `scrum_spec_brief` (autor de spec) e `scrum_spec_review_brief` (revisor de spec), com convenções da casa e frontmatter de resposta pré-preenchido.
- **Sonda (probe)** — a leitura pura do ambiente sem regra alguma (`listSpecFiles`, `listWorkspaceFiles`), que entrega ao Model o que está no disco.

### Superfícies e infraestrutura
- **MVC da casa** — a divisão obrigatória: Model = `scrum-domain` (toda regra), Controller = tools, API HTTP, comando e sonda (traduzem chamada → método, sem regra), View = `format.ts` e a GUI (imprimem, nunca decidem).
- **Tool** — uma função que o agente chama (`scrum_*`, 30 hoje), com saída textual id-first; a única superfície de escrita do agente no quadro (no disco ele escreve `specs/` e `specs/reviews/`).
- **Comando `/scrum`** — a superfície humana de leitura no chat (tree, sprints, status, ceremonies, trash, archive).
- **API HTTP (`/scrum-api`)** — as rotas `state` (GET, leitura) e `action` (POST, mutação) que a GUI consome, roteadas pelo workspace do cliente.
- **Snapshot** — o texto de contexto que o plugin `context-scrum` injeta no 1º step de um turno, só quando o texto mudou (o próprio texto é a chave), em modo sprint ativa (colunas, pais, readiness e a linha `Higiene:`) ou idle (há componente vivo, sem sprint ativa); nada em quadros sem componente vivo.
- **Linha Higiene** — a parte do snapshot que aponta tarefas abertas sem descrição e títulos na faixa de aviso ou acima do limite; some ao corrigir.
- **Work item form** — o modal da GUI com o conteúdo completo e editável de um item, incluindo a trilha da espiral, o checklist e os quatro artefatos de um componente.
- **Coluna details / cápsula ▦ SCRUM** — a coluna lateral do AppFrame onde o quadro renderiza ao lado do chat, aberta pela cápsula «▦ SCRUM» do cabeçalho da sessão.
- **ScrumError** — o erro do domínio com um `code` estável em kebab-case (`phase-gate`, `done-gate`, `title-contract`, `spec-order`, `not-found`…), que a API traduz em HTTP sem reinterpretar.

## Sinônimos proibidos
- **"epic"** — não se usa: o nível acima do componente é a Função (feature).
- **"story" / "issue" / "ticket"** — não se usa: conforme o nível, é Tarefa ou Componente; o vocabulário é o da hierarquia.
- **"status" por "fase"** — não confundir: estado é o workflow do nível (`proposed | in_progress | done`), fase é a posição na espiral; um componente tem os dois.
- **"aprovar" pelo agente** — o agente nunca decide um `approved`: entrega rascunhos, pede o carimbo com uma pergunta que nomeia arquivo ou componente, versão e digest, e só grava `status: approved` depois da resposta explícita do humano a essa pergunta — nunca por iniciativa própria, por pedido vago («pode seguir») nem sobre texto sem revisão `current` a 0 HIGH (ver «Carimbo humano»).
- **"revisão" sem qualificador** — toda revisão deste projeto é adversarial, com rodada, findings e verdict; "revisão" não é a coluna `review` do Kanban.
- **"backlog" como arquivo** — não existe um arquivo de backlog: o quadro é o backlog (por isso `TASKS.md` fica fora do conjunto mínimo).
- **"spec" para artefato de componente** — artefato é do quadro (requisitos, revisão, design, validação de um componente); spec é do disco (`specs/`).
- **"deletar" por "arquivar"** — arquivar guarda concluídos no Arquivo; excluir manda para a Lixeira; só purge apaga.
- **"painel" / "aba SCRUM"** — a aba foi aposentada na v0.23: o quadro vive na coluna details, aberto pela cápsula.

## Ver também
- PRD.md — a visão, as personas e os objetivos que estes termos nomeiam.
- RULES.md — as regras R/S/P/C que restringem os termos acima como contratos verificáveis.
