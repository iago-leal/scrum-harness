---
title: "PRD — scrum-harness"
purpose: "Por que o scrum-harness existe, para quem, e como medimos sucesso: o processo ágil (SCRUM + espiral) executável pelo agente, consultado e operado por humanos e persistido por workspace."
version: 3
status: approved
owner: product
---
# PRD: scrum-harness

## Visão
Fazer do processo ágil um contrato executável, não um hábito: um SCRUM com espiral de desenvolvimento por componente que o agente de IA opera por tools, que humanos **consultam** pelo comando `/scrum` e **operam** pelo quadro na GUI web do DeepSeek Harness, e que fica persistido fora das conversas, um quadro por workspace — para que o processo sobreviva à conversa que o criou.

## Persona alvo
- **O desenvolvedor que trabalha com um agente de IA num repositório.** Usa o quadro várias vezes por dia, ao lado do chat: planeja releases e sprints, acompanha o Kanban, abre o work item form, carimba requisitos como `approved` no work item form e carimba specs editando o frontmatter em `specs/` (git); o quadro reflete os dois carimbos, nunca os escreve por conta própria. Quer que o plano, o histórico e as decisões existam quando a sessão acabar — e que sejam os mesmos vistos pelo agente, pelo `/scrum` e pela GUI.
- **O próprio agente de IA que desenvolve o repositório.** Opera em todo turno: recebe o snapshot do quadro no 1º step, move tarefas ao começar e terminar, avança componentes pela espiral e escreve specs pelo pipeline. Precisa de contexto (o que está aberto, em que fase, o que falta) e de disciplina que não dependa de obediência ao prompt: gates que recusam com toda razão nomeada.

## Jobs to be done
- Planejar o produto na hierarquia Release → Função → Componente → Tarefa e selecionar tarefas em sprints com metas, cerimônias e vínculo a releases.
- Acompanhar o quadro ao vivo ao lado do chat (Backlog, Board, Sprints, Arquivo, Lixeira), com o mesmo estado que as tools e o `/scrum` leem.
- Disciplinar cada componente pela espiral — requisitos → revisão adversarial → design → TDD → construção → validação — com um gate por passo e o `done` gateado por evidência (suite, typecheck, matriz de rastreabilidade).
- Produzir e manter o spec set do projeto (SDD) em `specs/`, na ordem dos agentes (Product → Domain → Architect → API/Data → Test, mais os papéis da casa Agents e Ops), com briefs gerados pelo quadro, revisão adversarial no disco e carimbo humano.
- Manter tudo persistido por workspace e versionável: o quadro em storage próprio, as specs e revisões no git.

## Objetivos do produto
- Toda regra de negócio vive no Model (`scrum-domain`); tools, API HTTP, `/scrum` e GUI encontram a mesma regra. Zero regras fora do Model, qualificado: nenhuma tool, rota ou componente React recusa ou aceita o que o domínio decidiria diferente; affordances que espelham uma regra do Model (contador de título, cerca do frontmatter) são declaradas no desenho do componente.
- Toda recusa de gate (fase, done, título, contrato de artefato, ordem de specs) nomeia **todas** as condições faltantes de uma vez — com o caminho do campo quando a condição vive num frontmatter.
- Um quadro por workspace, resolvido pelo cwd da sessão; sessões sem cwd compartilham o quadro global.
- Suite de testes dentro do orçamento do quadro, em duas camadas: o gate exige `wall_seconds ≤ budget_seconds ≤ orçamento do quadro` (10 s hoje; default 15 s) e, quando o artefato traz `suite.runs`, ≥ 3 rodadas consecutivas com a pior contando; a convenção da casa é sempre trazer as 3 rodadas. Nenhum componente fecha `done` fora do orçamento.
- Títulos ≤ 80 caracteres e metas de sprint ≤ 120, sem quebra de linha — o domínio recusa acima disso; o QUÊ no título, o COMO na descrição.
- Snapshot de contexto do agente sem sprint ativa (idle) ≤ 1 800 caracteres; injetado só quando o texto do snapshot muda.
- Specs lidas do disco (`specs/`, `specs/reviews/`): o quadro lê, contrata e rastreia, nunca as escreve.

## Critérios de sucesso
- 100% dos componentes fechados desde o comp-47 (v0.14, gate hard de done) passaram pelo gate (fase `validation`, todas as tarefas `done`, artefato `validation` válido); os dois anteriores da rel-17 (comp-42, comp-48) foram fechados à mão antes de o gate existir e ficam declarados como legado.
- Toda sprint encerrada a partir da spr-11 (rel-17) tem Planning, Review e Retrospectiva registradas como cerimônias, com uma exceção declarada: a spr-21 não tem Planning registrada (aberta a partir dos action-items da retrospectiva da spr-20); spr-1 a spr-10 são legado anterior à disciplina (a spr-1 não tem cerimônia; spr-2 a spr-7 não têm retrospectiva; spr-8 a spr-10 já têm as três, mas ficam no legado por serem anteriores à espiral).
- O `specs/` deste próprio repositório completo pelo pipeline. Piso: 3/3 do conjunto mínimo (PRD, RULES, API_SPEC) `approved` com revisão `current` e `scrum_spec_status` reportando `complete`. Meta da rel-21: os sete arquivos do pipeline (PRD, GLOSSARY, RULES, ARCHITECTURE, API_SPEC, TESTS_SPEC, AGENTS) `approved` com revisão `current` — o teste de aceitação (`repo-specs.spec.ts`) confere esses sete e ainda que nada em `specs/` esteja inválido, desconhecido ou sem revisão `current`.
- Zero regras fora do Model, na qualificação do objetivo 1, conferido em cada revisão adversarial de desenho (divisão M/V/C declarada, affordances espelhadas listadas).
- O agente que desenvolve o repositório recebe o snapshot no 1º step de todo turno em que o texto do snapshot mudou (provado por CT do context-scrum), e a linha `Higiene:` do snapshot está vazia no encerramento de cada sprint (0 tarefas abertas sem descrição, 0 títulos acima do limite).

## Não objetivos
- Não ser um Jira ou Azure DevOps completo: sem permissões, workflows customizáveis, campos arbitrários ou relatórios gerenciais.
- Não ser multiusuário nem multi-tenant: um quadro por workspace, uma pessoa e seu agente.
- Não ter backend em nuvem nem autenticação: o storage é local, servido pelo DSH da própria máquina.
- Não substituir o git: o histórico de código e das specs é o git; o quadro guarda processo (fases, cerimônias, sprints), não diffs.
- Não escrever specs pelo quadro: `specs/` é escrito pelos agentes e carimbado por humanos no frontmatter; o quadro só lê.
- Não estimar por tempo: estimativas são pontos de história; velocity e burndown derivam deles.

## Riscos conhecidos
- A disciplina por gate melhora a qualidade sem sufocar o ritmo — hipótese não validada: o hotfix da v0.23 foi feito **fora** da espiral (sem componente, sem gate), e não há regra que impeça isso; hoje a espiral só disciplina o que nasce como componente.
- O agente respeita "nunca carimbar `approved`": o carimbo é humano por convenção de tool e brief, não por verificação de identidade.
- `specs/` fica em sincronia com o código: nada detecta deriva silenciosa entre spec aprovada e implementação além da revisão adversarial.
- O bundle do quadro (≈ 3,8 MB, dominado pelo mermaid) não pesa no boot da GUI — medido só em dogfood local.
- Dependência de APIs internas do DeepSeek Harness (slot system, coluna `details`, `ctx.layout`, waterfall `agent/pre-step`) que podem mudar sem aviso.
- A evidência do `done` (suite, typecheck, `suite.runs`) é auto-declarada pelo agente; ainda não há verificador determinístico que rode a suite e confronte o artefato.

## Ver também
- GLOSSARY.md — os termos deste PRD (release, função, componente, espiral, gate, carimbo) com uma definição cada.
- RULES.md — as regras R/S/P/C que os objetivos acima viram como contratos verificáveis no domínio.
- TASKS.md — o backlog operacional; neste repo, o próprio quadro (desvio declarado do conjunto mínimo). Fora da rel-21: a escrever em release posterior.
- `specs/README.md` — o mapa do spec set: quais arquivos existem, em que ordem se escrevem e quem é dono de cada um (não confundir com o README do repositório). Fora da rel-21: a escrever em release posterior.
