/**
 * View of the pipeline of the agents (v0.25, comp-60): the two briefs the
 * tools print — the author's (`formatSpecBrief`: role, inputs, current
 * version, template, house conventions, response format) and the reviewer's
 * (`formatSpecReviewBrief`). The roles are Table 6.4 of the chapter; the
 * templates are the six skeletons of "Por dentro de cada arquivo" with the
 * accents the book's typography lost restored, and the nine others by
 * analogy. Text only: every decision was taken in `specs.ts`.
 * @module @scrum-harness/domain/spec-brief
 */

import { SPEC_FILE_CAP, SpecCatalog } from './specs.ts'
import type { SpecBriefData, SpecBriefPredecessor, SpecOwner, SpecReview, SpecReviewBriefData } from './specs.ts'

/** Predecessor / current texts above this size are omitted from a brief (R6, R9a): the agent reads the file. */
export const BRIEF_SPEC_LIMIT = 12_000

/** Table 6.4 by owner; `agents` and `ops` are house roles (the chapter assigns them no agent). */
export const SPEC_ROLES: Readonly<Record<SpecOwner, { agent: string; responsibility: string }>> = Object.freeze({
  product: { agent: 'Product Agent', responsibility: 'defines what must exist and for whom: the problem, the user, the success criteria — before any technical decision' },
  domain: { agent: 'Domain Analyst', responsibility: 'models the business domain: entities, relations and the invariant rules, each with a stable id' },
  architect: { agent: 'Software Architect', responsibility: 'decides topology, layers and patterns, and records every decision with its context and consequences' },
  'api-data': { agent: 'API/Data Designer', responsibility: 'formalizes the contracts: inputs, outputs, formats and error codes of every API and data structure' },
  test: { agent: 'Test Agent', responsibility: 'writes the test strategy and the critical cases before any test exists, each case citing the rule it validates' },
  agents: { agent: 'Agents Steward (house role)', responsibility: 'defines how AI agents act in the project: persona, allowed and forbidden tools, output rules, hard constraints' },
  ops: { agent: 'Ops/Docs (house role)', responsibility: 'keeps the operational backlog and the entry point of the spec set: overview, links, onboarding' },
})

/** The skeleton of each file: the six of the chapter verbatim (accents restored), the nine others by analogy. */
export const SPEC_TEMPLATES: Readonly<Record<string, string>> = Object.freeze({
  'PRD.md': [
    '# PRD: <nome do produto>', '',
    '## Visão', '<o problema que estamos resolvendo, em uma frase>', '',
    '## Persona alvo', '<quem usa, em que contexto, com que frequência>', '',
    '## Jobs to be done', '- <tarefa principal que o usuário quer cumprir>', '- <tarefa secundária>', '',
    '## Objetivos do produto', '- <objetivo 1, mensurável>', '- <objetivo 2, mensurável>', '',
    '## Critérios de sucesso', '- <métrica observável após o lançamento>', '',
    '## Não objetivos', '- <o que esse produto NÃO vai fazer, para evitar escopo aberto>', '',
    '## Riscos conhecidos', '- <hipóteses que ainda não foram validadas>',
  ].join('\n'),
  'GLOSSARY.md': [
    '# Glossário do domínio', '',
    '## Termos', '- **<Termo>** — <definição em uma frase, no sentido que ESTE projeto usa; ver também RULES.md quando uma regra o restringe>',
    '- **<Termo>** — <definição>', '',
    '## Sinônimos proibidos', '- <palavra que NÃO se usa para este conceito, e por quê>',
  ].join('\n'),
  'RULES.md': [
    '# Regras invariantes', '',
    '## Domínio', 'R1. <regra imperativa, curta, testável>', 'R2. <…>', '',
    '## Segurança', 'S1. <…>', '',
    '## Performance', 'P1. <…>', '',
    '## Compliance', 'C1. <…>',
  ].join('\n'),
  'ARCHITECTURE.md': [
    '# Arquitetura do sistema', '',
    '## Topologia', '<visão de alto nível: clientes, serviços, bancos, filas>', '',
    '## Camadas', '- Apresentação: <responsabilidade>', '- Negócio:      <responsabilidade>', '- Persistência: <responsabilidade>', '',
    '## Componentes principais', '- <componente A>: <papel, dependências, owner>', '- <componente B>: <papel, dependências, owner>', '',
    '## Padrões adotados', '- <Repository, Strategy, Observer, etc>', '',
    '## Decisões arquiteturais (ADRs)', '- ADR-001: <decisão>', '  Contexto: <por que foi necessário decidir>', '  Opções:   <quais alternativas existiam>', '  Escolha:  <o que ficou>', '  Consequências: <o que ganhamos e o que perdemos>', '',
    '## Trade-offs aceitos', '- <ponto fraco assumido conscientemente>',
  ].join('\n'),
  'TECH_STACK.md': [
    '# Stack técnica', '',
    '## Linguagens', '- <linguagem e versão> — <justificativa breve>', '',
    '## Frameworks', '- <framework> — <o que resolve; alternativa descartada e por quê>', '',
    '## Bibliotecas', '- <biblioteca> — <papel; custo declarado (tamanho, licença)>', '',
    '## Ferramentas de build e teste', '- <ferramenta> — <papel>',
  ].join('\n'),
  'SECURITY.md': [
    '# Segurança', '',
    '## Modelo de ameaças', '- <ator, ativo, vetor, mitigação>', '',
    '## Autenticação', '<como o sistema sabe quem é o usuário>', '',
    '## Autorização', '<quem pode fazer o quê; onde a decisão é tomada>', '',
    '## Dados sensíveis', '- <dado> — <em repouso, em trânsito, em log>', '',
    '## Segredos', '- <onde vivem; o que nunca aparece em log ou output>',
  ].join('\n'),
  'API_SPEC.md': [
    '# API: <nome do serviço>', '',
    '## Convenções', '- Auth:         <Bearer Token, OAuth2, API Key>', '- Formato:      JSON', '- Versionamento: /v1', '- Erros padrão: <estrutura comum de payload de erro>', '',
    '## Endpoints', '',
    '### POST /tarefas', 'Cria uma tarefa.', '', '- Request:', '  { "texto": string (1..200) }', '- Response 201:', '  { "id": int, "texto": string, "estado": "pendente" }', '- Errors:', '  400 texto vazio ou maior que 200', '  401 sem autenticação', '',
    '### GET /tarefas', 'Lista tarefas em ordem de criação.', '- Response 200: [ Tarefa ]', '',
    '### PATCH /tarefas/{id}/feita', 'Marca tarefa como feita.', '- Response 200: Tarefa atualizada', '- Errors:', '  404 id não existe', '  409 tarefa já estava feita',
  ].join('\n'),
  'DATABASE_SCHEMA.md': [
    '# Esquema de dados', '',
    '## Entidades', '- <Entidade> — <campos, tipos, obrigatoriedade>', '',
    '## Relações', '- <A> 1..n <B> — <regra de integridade>', '',
    '## Índices', '- <tabela(colunas)> — <consulta que ele serve>', '',
    '## Restrições', '- <unicidade, checks, migrações>',
  ].join('\n'),
  'UI_UX_SPEC.md': [
    '# Interface e experiência', '',
    '## Telas', '- <Tela> — <propósito, quem a usa>', '',
    '## Estados', '- <Tela>: <vazio, carregando, erro, cheio>', '',
    '## Transições', '- <de → para, gatilho>', '',
    '## Componentes', '- <componente> — <comportamento; design system>',
  ].join('\n'),
  'TESTS_SPEC.md': [
    '# Estratégia de testes', '',
    '## Níveis', '- Unitários:    cobertura >= 80% por módulo', '- Integração:   caminhos críticos entre camadas', '- End-to-end:   jornadas principais do usuário', '',
    '## Casos críticos', '- CT-001: <caso> (valida R2)', '- CT-002: <caso> (valida R5)', '',
    '## Pyramid alvo', '- 70% unitários, 25% integração, 5% e2e', '',
    '## O que NÃO testar', '- Bibliotecas de terceiros (confiamos no upstream)', '- UI cosmética (tamanho exato de fonte, cor de borda)', '',
    '## Dados de teste', '- fixtures em <pasta>', '- factories em <arquivo>',
  ].join('\n'),
  'AGENTS.md': [
    '# Como os agentes devem atuar', '',
    '## Persona', '<postura, tom, idioma>', '',
    '## Ferramentas permitidas', '- <leitura de arquivos do projeto>', '- <execução de testes>', '',
    '## Ferramentas proibidas', '- <escrita em produção>', '- <instalação de pacotes globais>', '',
    '## Regras de output', '- toda resposta cita o arquivo:linha quando referencia código', '- <formato de diff, idioma>', '',
    '## Restrições obrigatórias', '- nunca commitar sem rodar os testes', '- nunca alterar RULES.md sem aprovação humana', '- nunca expor segredos no log ou no output',
  ].join('\n'),
  'WORKFLOW.md': [
    '# Pipeline operacional', '',
    '## Etapas', '1. <agente> → <artefato> (entrada: <specs>)', '2. <…>', '',
    '## Gates', '- <o que precisa estar aprovado antes de cada etapa>', '',
    '## Cerimônias', '- <planning, review, retro — quando e o que registram>',
  ].join('\n'),
  'PROMPTS.md': [
    '# Prompts reutilizáveis', '',
    '## <nome-do-prompt> (v1)', '- Uso: <quando>', '- Entrada: <o que recebe>', '- Prompt:', '  <texto>', '- Saída esperada: <forma>',
  ].join('\n'),
  'TASKS.md': [
    '# Backlog operacional', '',
    '## Em andamento', '- [ ] <tarefa> — <responsável, status>', '',
    '## Próximas', '- [ ] <tarefa, prioridade>', '',
    '## Concluídas', '- [x] <tarefa> — <data>',
  ].join('\n'),
  'README.md': [
    '# <Projeto> — spec set', '',
    '## Visão geral', '<uma frase; ver também PRD.md>', '',
    '## Arquivos', '- PRD.md — <propósito>', '- RULES.md — <propósito>', '- API_SPEC.md — <propósito>', '',
    '## Onboarding', '1. <o que ler primeiro>', '2. <como rodar e testar>',
  ].join('\n'),
})

/** A predecessor block: the whole file, or an omission notice above the limit. */
function predecessorBlock(p: SpecBriefPredecessor): string {
  const head = `### specs/${p.file} (version ${p.version ?? '?'}, digest ${p.digest ?? '?'})`
  if (p.text.length > BRIEF_SPEC_LIMIT) return `${head} — omitted (${p.text.length} chars > ${BRIEF_SPEC_LIMIT}): read specs/${p.file} directly`
  return `${head}\n\n${p.text}`
}

/** Text or an omission notice. */
function capped(label: string, text: string): string {
  return text.length > BRIEF_SPEC_LIMIT ? `${label} omitted (${text.length} chars > ${BRIEF_SPEC_LIMIT}): read the file directly` : text
}

function reviewBlock(review: SpecReview, title: string): string {
  const meta = [
    review.round !== undefined ? `round ${review.round}` : null,
    review.verdict !== undefined ? `verdict ${review.verdict}` : null,
  ].filter((x): x is string => x !== null).join(', ')
  const lines = [`${title} — ${review.state}${meta.length > 0 ? ` (${meta})` : ''}`]
  if (review.reasons.length > 0) lines.push(review.reasons.map(r => `- ${r}`).join('\n'))
  if (review.body !== undefined && review.body.length > 0) lines.push(capped('review body', review.body))
  return lines.join('\n\n')
}

/** The house conventions of a spec file (R6), as the author reads them. */
function conventions(owner: SpecOwner, dependents: string[]): string {
  return [
    '## House conventions',
    '- The file starts on line 1 with a YAML frontmatter carrying exactly these keys: `title` (quoted string), `purpose` (quoted string — the semantic router reads title and purpose to decide what to load),',
    `  \`version\` (bare integer ≥ 1), \`status: draft\` (ALWAYS draft — \`approved\` is the human stamp, never yours), \`owner: ${owner}\`.`,
    '- Stable ids at line start, one family per file kind (R<n> domain rules, S<n> security, P<n> performance, C<n> compliance, CT-<nnn> test cases), each declared ONCE,',
    '  in the shape `R1 — text` or `R1. text`. Never renumber an existing id on a new version: tests, commits and other specs cite them.',
    '- Cross-references are explicit: `ver também API_SPEC.md para o contrato do endpoint X`. Small, focused file (hard cap 256 KiB; aim far below).',
    `- Write in the project's language; keep the template's section names. Save the file as specs/<file>; then ask for its adversarial review with \`scrum_spec_review_brief\`.`,
    dependents.length > 0 ? `- Cross-references to consider: ver também ${dependents.join(', ')} (the files that depend on this one).` : '- No catalog file depends on this one.',
  ].join('\n')
}

/**
 * Render the author's brief (comp-60 R6).
 * @param data - what `SpecBrief.of` returned.
 */
export function formatSpecBrief(data: SpecBriefData): string {
  const { file, entry, predecessors, current, previousReview, nextVersion, dependents } = data
  const role = SPEC_ROLES[entry.owner]
  const blocks: string[] = []
  blocks.push(`# Spec brief — ${file} (${role.agent})\n\n${entry.purpose}${entry.minimal ? ' Part of the minimal set.' : ''}`)
  blocks.push(`## Your role\n\nYou are the ${role.agent}: ${role.responsibility}. You write the file, you do not stamp it: \`status: draft\`.`)
  blocks.push(predecessors.length === 0
    ? '## Inputs — predecessor specs\n\nNone: this file opens the chain.'
    : `## Inputs — predecessor specs\n\n${predecessors.map(predecessorBlock).join('\n\n')}`)
  if (current === undefined) {
    blocks.push('## This file does not exist yet\n\nWrite version 1 from the template below.')
  } else {
    const head = `## Current version — ${current.state}${current.version !== undefined ? ` (v${current.version})` : ''}`
    const reasons = current.reasons.length > 0 ? `Contract violations to fix:\n${current.reasons.map(r => `- ${r}`).join('\n')}\n\n` : ''
    blocks.push(`${head}\n\n${reasons}Rewrite the whole file; keep the ids stable; bump version to ${nextVersion}.\n\n${capped('current text', current.text)}`)
  }
  if (previousReview !== undefined) blocks.push(`${reviewBlock(previousReview, '## Previous review')}\n\nAnswer every finding in the new version.`)
  blocks.push(`## Template\n\n${SPEC_TEMPLATES[file] ?? '(no template)'}`)
  blocks.push(conventions(entry.owner, dependents))
  blocks.push([
    '## Response format',
    `Write the complete file specs/${file}, starting with this frontmatter (fill title and purpose; keep the rest exactly):`,
    '```yaml',
    '---',
    'title: "<…>"',
    'purpose: "<…>"',
    `version: ${nextVersion}`,
    'status: draft',
    `owner: ${entry.owner}`,
    '---',
    '```',
  ].join('\n'))
  return blocks.join('\n\n')
}

/** Reviewer questions by owner (R7). */
const QUESTIONS: Readonly<Record<SpecOwner, string[]>> = Object.freeze({
  product: ['Is the vision one sentence and the problem real? Is the persona concrete (who, context, frequency)?', 'Are the objectives and success criteria measurable? Are the non-goals explicit enough to refuse scope creep?'],
  domain: ['Is every rule imperative, short and testable, with exactly one stable id? Any duplicate or renumbered id?', 'Does any rule contradict the PRD or another rule? Is every term used defined once (GLOSSARY)?'],
  architect: ['Does every decision carry context, options, choice and consequences? Are the layers and their responsibilities explicit?', 'Are the accepted trade-offs stated? Does anything contradict RULES.md?'],
  'api-data': ['Does every endpoint / tool / entity declare input, output and every error code? Are formats and versioning stated?', 'Does the contract cover what ARCHITECTURE.md promises, and nothing it forbids?'],
  test: ['Does every critical case cite the rule it validates `(valida R2)`? Is the pyramid target stated and defensible?', 'Is "what NOT to test" explicit? Are the test data and fixtures located?'],
  agents: ['Are allowed and forbidden tools explicit? Are the output rules checkable? Are the hard constraints unambiguous?', 'Does anything here contradict RULES.md or ARCHITECTURE.md?'],
  ops: ['Do the links resolve to catalog files? Does the onboarding get a newcomer running and testing?', 'Is the backlog consistent with the board?'],
})

/**
 * Render the reviewer's brief (comp-60 R7).
 * @param data - what `SpecReviewBrief.of` returned.
 */
export function formatSpecReviewBrief(data: SpecReviewBriefData): string {
  const { file, entry, spec, predecessors, previousReview, round, orderWarnings, reviewPath, dependents } = data
  const blocks: string[] = []
  blocks.push(`# Adversarial review brief — specs/${file} (version ${spec.version}, digest ${spec.digest}) — status: ${spec.status}\n\n${entry.purpose} Owner: ${entry.owner} (${SPEC_ROLES[entry.owner].agent}).`)
  blocks.push(spec.ids.length === 0 ? 'Ids found: none' : `Ids found: ${spec.ids.join(', ')}`)
  blocks.push(`## The spec\n\n${capped('spec text', spec.text)}`)
  blocks.push(predecessors.length === 0
    ? '## Predecessor specs\n\nNone (this file opens the chain).'
    : `## Predecessor specs (check coherence with the chain)\n\n${predecessors.map(predecessorBlock).join('\n\n')}`)
  if (previousReview !== undefined) {
    const covered = previousReview.version !== undefined ? `covered version ${previousReview.version}` : 'no valid frontmatter'
    const meta = [covered, previousReview.round !== undefined ? `round ${previousReview.round}` : null, previousReview.verdict !== undefined ? `verdict ${previousReview.verdict}` : null]
      .filter((x): x is string => x !== null).join(', ')
    const body = previousReview.body !== undefined && previousReview.body.length > 0 ? `\n\n${capped('review body', previousReview.body)}` : ''
    blocks.push(`## Previous review — ${meta} (now ${previousReview.state})${body}\n\nConfirm item by item whether each earlier finding was absorbed by the current text.`)
  }
  if (orderWarnings.length > 0) blocks.push(`## Order warnings\n\nThe chain behind this file is not clean; weigh the findings accordingly:\n${orderWarnings.map(w => `- ${w}`).join('\n')}`)
  blocks.push(`Dependents (impact of a change): ${dependents.length === 0 ? 'none' : dependents.join(', ')}`)
  blocks.push([
    '## House conventions (checklist)',
    '- Frontmatter on line 1 with title, purpose, version (integer ≥ 1), status (draft | approved — approved is the human stamp), owner equal to the catalog\'s.',
    '- Stable ids at line start, declared once, never renumbered between versions; cross-references explicit (`ver também X.md`).',
    `- Small, focused file (cap ${SPEC_FILE_CAP / 1024} KiB); title and purpose precise enough for a semantic router.`,
  ].join('\n'))
  blocks.push(`## Guiding questions (do not stop at them)\n${QUESTIONS[entry.owner].map(q => `- ${q}`).join('\n')}\n- Logical gaps, contradictions, conditions that cannot be satisfied; anything an implementer would have to guess.`)
  blocks.push([
    '## Response format (mandatory)',
    'You are READ-ONLY on the project: do not modify files other than the report, do not run installers or builds.',
    'Prioritized findings — HIGH / MEDIUM / LOW — each with: the problem, why it matters, the concrete change (proposed text when it fits).',
    'Then a section "Sections I would keep", and the verdict (approved | needs-revision).',
    `Then save the report as \`${reviewPath}\` starting with this frontmatter, filling only reviewer, verdict and findings (the rest is pre-filled for this exact text):`,
    '```yaml',
    '---',
    `file: ${file}`,
    'reviewer: <who>',
    `reviewed_version: ${spec.version}`,
    `reviewed_digest: "${spec.digest}"`,
    'verdict: <approved | needs-revision>',
    `round: ${round}`,
    'findings: { high: <n>, medium: <n>, low: <n> }',
    '---',
    '```',
  ].join('\n'))
  return blocks.join('\n\n')
}

// Keep the catalog import live for the templates' completeness invariant (every catalog file has a template).
for (const entry of SpecCatalog.entries) {
  if (SPEC_TEMPLATES[entry.file] === undefined) throw new Error(`spec-brief: no template for ${entry.file}`)
}
