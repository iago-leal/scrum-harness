---
file: GLOSSARY.md
reviewer: <modelo> (subagente revisor adversarial)
reviewed_version: 2
reviewed_digest: "d4d9f35c"
verdict: approved
round: 2
findings: { high: 0, medium: 0, low: 0 }
---
# Revisão adversarial — specs/GLOSSARY.md v2 (digest d4d9f35c) — rodada 2

## Método
Versão e digest lidos pelo próprio Model (`SpecSet.of(listSpecFiles(...))` → `2 d4d9f35c draft`). A rodada 1 (v1, digest 3f25c29c: 0 HIGH, 5 MEDIUM, 8 LOW) foi conferida item por item contra o texto da v2, citando a frase absorvida. Em seguida, as frases novas ou reescritas foram confrontadas com `packages/scrum-domain/src/{contracts.ts,specs.ts,spec.ts,service.ts}` e com o PRD.md aprovado, procurando apenas problemas REAIS (definição falsa contra o código ou contradição com o PRD). O que a rodada 1 já deu por correto não foi reaberto.

## Absorção da rodada 1 (13/13)

### MEDIUM
- **M1 (Frontmatter / dígitos)** — absorvido. v2: "um valor **de texto** composto só de dígitos (digest, data) viaja entre aspas, porque o parser lê dígitos nus como número; inteiros (`version`, `round`) viajam nus." Bate com `specs.ts:246` ("version must be a bare integer ≥ 1 (not quoted)").
- **M2 (Digest / trim)** — absorvido. v2: "os 8 primeiros hex do sha1 do corpo (texto após o frontmatter) com espaços e quebras das pontas removidos (`trim`)". Bate com `ArtifactContract.digestOf` (`contracts.ts:51`).
- **M3 (Gate de ordem / só o brief do autor recusa)** — absorvido. v2: "recusa `scrum_spec_brief` (código `spec-order`) e viaja como avisos (`orderWarnings`) em `scrum_spec_review_brief`." Bate com `specs.ts:665` (throw `spec-order`) e `specs.ts:711` (`orderWarnings: SpecOrder.gate(...)`).
- **M4 (Revisão de spec / precedência)** — absorvido. v2: "com estado por precedência `none > invalid > stale > needs-revision > current`: uma revisão bem formada de uma spec `missing`/`invalid` é `stale` sem comparar versão ou digest."
- **M5 (estado de tarefa `backlog`)** — absorvido. Nova entrada em "Sprint e board": "**Backlog (estado de tarefa `backlog`)** — o estado de uma tarefa fora de qualquer sprint (sem `sprintId`); com as quatro colunas do Kanban forma os cinco `status` de tarefa (`backlog | todo | in_progress | review | done`). Por extensão, 'backlog de produto' é o conjunto dos componentes e 'o quadro é o backlog' nomeia a hierarquia inteira." A entrada "Componente" agora remete a ela ("ver 'Backlog'"). Bate com `TASK_STATUSES` e com `endSprint` (`service.ts:1566-1570`: não concluídas ganham `status: 'backlog'` e perdem `sprintId`).

### LOW
- **L1 (Espiral / `done` é status)** — absorvido: "cinco fases `requirements → design → tdd → construction → validation`, fechadas pelo `status: done` (o `next` da readiness em `validation`)".
- **L2 (Gate / recuar tem exceção)** — absorvido: "recuar é livre (salvo componente `done`, que não move fase), pular é sempre recusado". Bate com `service.ts:797`.
- **L3 (TDD estrito / vermelho não é gate)** — absorvido: "Gate: ao menos uma tarefa `test` e nenhuma `code` criada antes da primeira `test` (ordem pelo número do id); convenção da casa, não verificada pelo gate: o teste vermelho antes do código."
- **L4 (Snapshot / idle e silêncio)** — absorvido: "em modo sprint ativa (…) ou idle (há componente vivo, sem sprint ativa); nada em quadros sem componente vivo."
- **L5 (Tool / escrita no quadro)** — absorvido: "a única superfície de escrita do agente no quadro (no disco ele escreve `specs/` e `specs/reviews/`)".
- **L6 (RequirementsContract / ids são extração)** — absorvido: "corpo não vazio; e a extração dos ids `R<n>[letra]` declarados no início de linha, que a matriz usa."
- **L7 (Raia / rollup)** — absorvido: "com rollup por raia (a soma de tarefas e pontos da raia)".
- **L8 (Vivo)** — absorvido. Nova entrada: "**Vivo (live)** — o item que não está nem no Arquivo nem na Lixeira (sem `archivedAt` nem `deletedAt`); o único que as mutações aceitam — os três estados são mutuamente exclusivos." Bate com o comentário do `shelfFields` (`spec.ts:49-50`) e com `mustGetLive` em todos os mutadores.

Frontmatter da v2: `version: 2`, `status: draft`, `owner: domain` — forma correta; o `purpose` foi ampliado e continua fiel ao conteúdo.

## HIGH
Nenhum. Nenhuma definição nova ou reescrita é falsa contra `contracts.ts`, `specs.ts`, `spec.ts` ou `service.ts`; nenhuma contradiz o PRD.md aprovado (personas, objetivos, snapshot idle, conjunto mínimo, carimbo humano).

## MEDIUM
Nenhum.

## LOW
Nenhum. As precisões que restavam eram as da rodada 1 e todas entraram; não vejo motivo proporcional para abrir nova rodada.

## Seções que eu manteria
- **Termos › Sprint e board**: a nova entrada "Backlog" resolve a polissemia sem apagar os dois usos por extensão, e "Vivo" fecha o trio com Arquivo e Lixeira nas palavras do próprio schema.
- **Termos › Espiral**: Gate (com a exceção do `done`), Readiness e TDD estrito (gate vs. convenção) agora dizem exatamente o que o Model faz.
- **Termos › Contratos e artefatos**: Frontmatter e Digest são, agora, receitas reproduzíveis — RULES.md e API_SPEC.md podem citá-las literalmente.
- **Termos › Specs (SDD)**: Gate de ordem distingue recusa (autor) de aviso (revisor); Revisão de spec enuncia a precedência que o contrato aplica.
- **Sinônimos proibidos** e **Ver também**: inalterados e corretos.

## Veredito
**approved** — 0 HIGH, 0 MEDIUM, 0 LOW. Os 13 achados da rodada 1 foram absorvidos textualmente na v2 (digest d4d9f35c); nenhuma definição falsa contra o código, nenhuma contradição com o PRD. Pronto para o carimbo humano (`status: approved`).
