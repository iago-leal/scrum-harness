---
title: "Regras invariantes — scrum-harness"
purpose: "As regras que o código impõe hoje, uma por linha e testável: domínio (hierarquia, sprint, espiral, contratos, specs), segurança, performance e compliance; convenções da casa marcadas como tal."
version: 3
status: approved
owner: domain
---
# Regras invariantes

Cada regra é imperativa, curta e testável; os termos são os de GLOSSARY.md e os objetivos que elas concretizam estão em PRD.md. Toda regra sem marca é comportamento que o código impõe hoje, na superfície que a regra nomeia: por default o Model (`scrum-domain`); quando é outra (API HTTP, sonda, plugin de contexto, View, teste), a regra a nomeia. As marcadas "(convenção da casa, não gate)" são disciplina de brief e revisão, não código.

## Domínio
R1. Nenhuma regra fora do Model: tools, API HTTP, comando `/scrum`, sonda e GUI só traduzem chamada → método e imprimem; nenhuma delas aceita ou recusa o que o domínio decidiria diferente.
R2. Toda recusa de gate (fase, done, título, contrato de artefato, ordem de specs) nomeia todas as condições faltantes de uma vez, com o caminho do campo quando a condição vive num frontmatter, e viaja como `ScrumError` com `code` estável.
R3. Um quadro por workspace, resolvido pelo cwd canônico da sessão (`scrum_ws_<hash>`); sessões e requisições sem cwd compartilham o quadro global.
R4. Ids de item são monotônicos e nunca reusados (`rel-`, `feat-`, `comp-`, `task-`, `spr-`, `cer-`), alocados numa cadeia serializada; título, nome, meta e kind são validados antes do `nextId`, logo uma recusa nunca consome um id.
R5. Função nasce sob release, componente sob função, tarefa sob componente; o pai deve existir e estar vivo (nem na lixeira nem no arquivo), senão `not-found`, `in-trash` ou `archived`.
R6. O estado de cada nível é workflow manual próprio (release `planned | active | released`; função `proposed | committed | in_progress | done`; componente `proposed | in_progress | done`), nunca se propaga aos pais e fora do conjunto é recusado (`invalid-status`).
R7. Título (release, função, componente, tarefa) tem ≤ 80 code points e meta de sprint ≤ 120, sem quebra de linha nem caractere de controle, medidos sobre o texto a gravar (trimado, sem prefixo de kind); vazio é `invalid-input`; controle/quebra de linha e excesso são `title-contract`, nomeados juntos na mesma recusa (controle primeiro, comprimento depois).
R8. Títulos e metas legados acima do limite são lidos e marcados na leitura (`titleOverflow`, `goalOverflow`, nunca persistidos), nunca rejeitados; a faixa de aviso começa em 80% do limite (64 e 96).
R9. Kind de tarefa é `test | code | other`; o prefixo `[test]`/`[code]` do título infere o kind e sai do título armazenado; prefixo que contradiz um kind explícito é `kind-conflict`; título que é só prefixo é `invalid-input`; kind fora do conjunto é `invalid-kind`.
R10. Há no máximo uma sprint ativa por quadro: só uma sprint `planned` começa (`sprint-already-active` se outra estiver ativa) e só uma `active` encerra.
R11. Encerrar uma sprint devolve ao backlog toda tarefa não `done` (sem `sprintId`) e as `done` guardam o vínculo como história; a sprint fica `completed` com `endDate` preenchida se faltava.
R12. Uma tarefa pertence a no máximo uma sprint; entrar e sair só de sprint não `completed`; sair devolve ao backlog e apaga `doneAt`.
R13. Mover tarefa no Kanban só na sprint ativa e só para `todo | in_progress | review | done`; entrar em `done` carimba `doneAt` (mantido se já havia), sair de `done` o apaga.
R14. WIP limits têm chaves entre as colunas do board e valores inteiros ≥ 0 (0 remove a coluna, `{}` remove todos); o domínio só os valida e guarda, nunca bloqueia um movimento por eles.
R15. Cerimônias são append-only (`cer-N`): exigem ≥ 1 nota e uma sprint (a ativa por default); sprints e cerimônias são história e nunca vão à lixeira nem ao arquivo.
R16. Todo item da hierarquia está em exatamente um de três estados — vivo, arquivado (`archivedAt`) ou na lixeira (`deletedAt`) — e só o vivo aceita mutações de conteúdo e de fase; restaurar e desarquivar são as únicas escritas sobre item na prateleira (sprints não têm prateleira).
R17. Excluir passa sempre pela lixeira: um pai com descendentes vivos exige `cascade`; restaurar revive os ancestrais na prateleira e os descendentes excluídos pelo mesmo carimbo.
R18. Purge só remove item já na lixeira (e sua subárvore na lixeira); purgar uma release apenas desvincula suas sprints, que sobrevivem.
R19. Tarefa na sprint ativa não vai à lixeira nem ao arquivo (`task-in-active-sprint`); tarefa não `done` que vai à lixeira ou ao arquivo perde a sprint e volta ao backlog.
R20. Arquivar exige item vivo; tarefa `done` arquivada continua contando nos totais da sprint encerrada e nos gates de tarefas; `archiveCompleted` arquiva só tarefas `done` fora da sprint ativa.
R21. A espiral é `requirements → design → tdd → construction → validation`: avanço um passo por vez pelo gate, pular é recusado, recuo é livre, mesma fase é no-op, todo movimento vai ao `phaseLog`; o primeiro avanço de `proposed` o torna `in_progress`; componente `done` não move fase.
R22. Gate requirements → design: `requirements` com `version` inteiro ≥ 1, `status: approved` e corpo; `requirementsReview` estruturada com corpo, `verdict: approved`, `findings.high` 0, `reviewed_version` igual à versão e `reviewed_digest` igual ao digest dos requisitos.
R23. Gate design → tdd: `design` não vazio cujo frontmatter traz `traces:` (uma entrada inline `{ req, files, tests }` por linha): todo id `R<n>[letra]` declarado no início de linha do corpo dos requisitos aparece em alguma entrada, nenhum id desconhecido, `req` nunca vazio, caminhos relativos ao workspace (sem vazio, absoluto, `..` nem espaço); `files: []` declara requisito sem código; `tests: []` deixa o requisito "unproven" e nunca bloqueia.
R24. Gate tdd → construction: ≥ 1 tarefa `test` e nenhuma `code` criada antes da primeira `test`, na ordem do número do id; `other` é livre; tarefas na lixeira não contam, arquivadas contam.
R25. Gate construction → validation: ≥ 1 tarefa sob o componente e todas `done`.
R26. Gate done: fase `validation`, ≥ 1 tarefa e todas `done`, `validation` com corpo não vazio, `validated_at` ISO-8601 entre aspas, `suite.tests` ≥ 1, `passed + skipped = tests`, `typecheck: clean`, `wall_seconds ≤ budget_seconds ≤` orçamento do quadro e, com `suite.runs`, ≥ 3 rodadas com a pior reportada em `wall_seconds`; a matriz de rastreabilidade fecha sobre a fonte efetiva (o as-built da validação vence o design).
R27. O gate de done só roda na transição para `done`: `done → done` é no-op e sair de `done` é livre.
R28. Orçamento da suite: default 15 s; o quadro pode fixar outro (> 0) e subir acima de 15 exige razão, também ao regravar o mesmo valor; baixar nunca reabre um componente `done`. Este quadro está em 10 s (hoje — estado do quadro, mutável por `scrum_suite_budget`, não invariante).
R29. O carimbo `status: approved` (requisitos no work item form, specs no git) é humano: o quadro o lê e nunca o escreve; os briefs pré-preenchem tudo menos o carimbo (convenção da casa, não gate — nenhuma verificação de identidade).
R30. Digest é os 8 primeiros hex do sha1 do corpo trimado; uma revisão cobre exatamente uma versão e um digest, e texto mudado a torna stale.
R31. O quadro nunca escreve `specs/`; para specs, a sonda (`scrum-probe`) lê só `<workspace>/specs/*.md` e `specs/reviews/*.review.md`, plano, arquivos regulares, extensão exata, nomes com ponto ignorados, ordem por comparação de string (`<`, unidade UTF-16 — igual a code point salvo entre um astral e um BMP acima de U+D7FF) (a sonda de rastreabilidade lê mais: S3); a sonda entrega dados, o Model classifica.
R32. Uma spec é válida com frontmatter na linha 1 trazendo `title`, `purpose`, `version` inteiro ≥ 1, `status: draft | approved` e `owner` igual ao dono do catálogo, corpo não vazio, cada id (`R`, `S`, `P`, `C`, `CT-`) declarado uma vez e ≤ 256 KiB; arquivo fora do catálogo é `unknown`, nunca inválido.
R33. A revisão de spec tem um estado por precedência `none > invalid > stale > needs-revision > current`; spec `missing` ou `invalid` torna a revisão stale sem comparar versão ou digest.
R34. O brief de autor é recusado (`spec-order`) enquanto um predecessor direto não estiver `approved` com revisão `current`; o brief de revisor é recusado (`spec-review-brief`) só para spec `missing` ou `invalid` — a ordem, nele, só avisa; o spec set é `complete` com PRD, RULES e API_SPEC `approved` e nenhum arquivo do catálogo inválido.
R35. A mídia do quadro está em `version: 1` e evolui por migração no parse, sem bump: componente sem `phase` carrega em `requirements` (`validation` se `done`) com `phaseLog: []`; tarefa sem `kind` deriva o kind do prefixo `[test]`/`[code]` pelo mesmo `splitKindPrefix` do serviço (total: título só-prefixo fica `other` intacto); sprint com `releaseId` legado vira `releaseIds: [id]`. Toda migração nova segue esse padrão e carrega mídia antiga intacta (convenção da casa, não gate).

## Segurança
S1. Na API HTTP (`scrum-api`), mutação só com `Content-Type: application/json` (415 `unsupported-media-type` antes do dispatch) e corpo ≤ 262 144 bytes (256 KiB): acima, a conexão é destruída; a tool e o comando `/scrum` não passam por ela.
S2. A API HTTP (`scrum-api`) traduz sem reinterpretar: 400 (`bad-json`, `bad-action`) para transporte, 404 para `not-found`, 409 para qualquer outro `ScrumError`, sempre com `code` e `message`; erro que não é `ScrumError` não é traduzido. Os enums do envelope (`kind`, `column`, `phase`, `type`) são importados do Model; um valor fora deles, `notes` vazia ou título vazio é 400 `bad-action` (mesma decisão, código de transporte); `op: set` sem `phase` é `invalid-phase` (409).
S3. A API HTTP lê o disco só em `<workspace>/specs/*.md` e `specs/reviews/*.review.md` do workspace da requisição (metadados no wire, nunca o texto). A consulta de rastreabilidade (`scrum_trace`) lê ainda o `.gitignore` raiz e lista a árvore do workspace sob a query; um caminho absoluto é resolvido lexicalmente contra o workspace da sessão — dentro dele vira relativo, fora dele a tool recusa —; o Model (`impact`) recusa absoluto e segmento `..` com `invalid-input`.
S4. A API HTTP (`scrum-api`) não tem autenticação nem multiusuário: o único isolamento é o workspace, escolhido pelo cliente (`?workspace=` / campo `workspace`), servido pelo DSH da própria máquina.
S5. As sondas (`scrum-probe`) nunca lançam: erro de leitura vira `absent`, `not-a-directory`, listagem vazia ou `unreadable` (por arquivo), nunca exceção; `node_modules`, `.git`, nomes com ponto e os nomes simples do `.gitignore` raiz nunca são listados.

## Performance
P1. A evidência do `done` respeita R26 contra o orçamento de R28; trazer sempre as 3 rodadas em `suite.runs` (convenção da casa, não gate).
P2. O snapshot (`context-scrum`) tem dois modos. Idle: `Em andamento` ≤ 5 componentes com razões cortadas em 100, `Backlog` ≤ 6, e o texto inteiro cabe em 1 800 unidades UTF-16 (`text.length`) — teto derivado dos caps e provado por CT do context-scrum (pior caso construído), não por corte no código. Ativo: `Pais:` sem teto (um item por componente com task na sprint, razões em 160), `Em andamento (sem task na sprint)` ≤ 5 com razões em 160, `Higiene:` com 3 ids por parte antes de ` +N`; o modo ativo não tem teto total (pior caso medido: 3 855). Em ambos, título e meta válidos nunca são truncados (corte só nos limites do Model, R7).
P3. O plugin `context-scrum` injeta o snapshot só no 1º step do turno e só quando o texto mudou desde a última injeção àquele agente (o próprio texto é a chave, por agente); nada é injetado num quadro sem sprint ativa e sem componente vivo.
P4. Leituras são síncronas sobre o estado em memória do domínio; escritas aguardam durabilidade; contadores de id e orçamento da suite escrevem numa única cadeia serializada.
P5. Spec acima de 256 KiB não tem o texto lido pela sonda (`scrum-probe`) e o Model a marca inválida; o `formatSpecStatus` (View, `format.ts`) lista ≤ 20 arquivos `unknown` antes de ` +N`; a sonda de rastreabilidade para em 500 arquivos e sinaliza `truncated`.

## Compliance
C1. Todo componente fecha `done` pelo gate desde o comp-47 (v0.14); comp-42 e comp-48 são legado declarado no PRD.md e não se repetem (convenção da casa, não gate).
C2. Toda sprint encerrada a partir da spr-11 tem planning, review e retrospectiva registradas como cerimônias, salvo exceção declarada no PRD.md (convenção da casa, não gate).
C3. A linha `Higiene:` do snapshot está vazia no encerramento de cada sprint: 0 tarefas abertas sem descrição, 0 títulos acima do limite (convenção da casa, não gate).
C4. Critério de aceitação da rel-21, imposto pelo teste `repo-specs.spec.ts` (vermelho até ser verdade, não gate do Model): o `specs/` deste repositório tem PRD, GLOSSARY, RULES, ARCHITECTURE, API_SPEC, TESTS_SPEC e AGENTS `approved` com revisão `current`, `summary.complete`, nenhum arquivo do catálogo `invalid`, nenhum `unknown`, nenhuma revisão desconhecida, e todo arquivo presente com revisão `current` (`reviewed = present`).
C5. Toda revisão de desenho confere a divisão M/V/C declarada e lista as affordances que espelham uma regra do Model (contador de título, cerca do frontmatter) (convenção da casa, não gate).

## Ver também
- ARCHITECTURE.md — as decisões (ADRs) que realizam estas regras: MVC da casa, um quadro por workspace, contratos como objetos do Model.
- TECH_STACK.md — as escolhas (storage-domain, zod, parser YAML da casa) que dão forma aos contratos.
- SECURITY.md — o modelo de ameaça por trás de S1–S5.
- TESTS_SPEC.md — os casos críticos que provam cada regra e o orçamento de P1.
- PRD.md — os objetivos e critérios de sucesso que estas regras tornam verificáveis.
- GLOSSARY.md — o vocabulário usado aqui (quadro, espiral, gate, carimbo, digest, sonda).
