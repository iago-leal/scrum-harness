/**
 * Pure text renderers of SCRUM state for tool results: compact, id-first
 * listings the model can read and reference back.
 * @module @scrum-harness/domain/format
 */

import { DEFAULT_SUITE_BUDGET_SECONDS, ReviewContract, TitleContract } from './contracts.ts'
import type { Overflow, SuiteBudget } from './contracts.ts'
import type { Ceremony, Component, Sprint, Task } from './spec.ts'
import type { ImpactHit, ImpactReport, OverflowSummary, ReviewBriefData, ScrumTree, ShelfLists, SprintStatus, SprintView } from './service.ts'
import { TRACE_PROBE_CAP } from './traces.ts'
import type { TraceMatrixData } from './traces.ts'
import { SPEC_OWNERS, SPEC_UNKNOWN_CAP, SpecCatalog } from './specs.ts'
import type { SpecEntry, SpecSetData } from './specs.ts'

/** Release-name lookup used to render sprint→release links. */
export type ReleaseNames = ReadonlyMap<string, string>

/**
 * The task kind as the text views print it (v0.16, comp-45): `[test] ` /
 * `[code] ` before the title, nothing for `other`. The prefix left the
 * stored title on migration and comes back only here — so the tree of a
 * pre-v0.16 board renders exactly as before.
 * @param task - anything carrying a kind.
 * @returns the prefix with its trailing space, or the empty string.
 */
export function kindPrefix(task: Pick<Task, 'kind'>): string {
  return task.kind === 'other' ? '' : `[${task.kind}] `
}

/** " · review stale" when a valid review no longer covers the requirements (never on done components). */
/**
 * The read-time overflow mark of a title or goal (comp-53 R5): ` [título longo 338/80]`
 * / ` [meta longa 810/120]`, empty when the text fits — no noise otherwise.
 */
function overflowSuffix(over: Overflow | undefined, noun: 'título longo' | 'meta longa'): string {
  return over === undefined ? '' : ` [${noun} ${over.length}/${over.limit}]`
}

function staleSuffix(component: Component): string {
  if (component.status === 'done') return ''
  return new ReviewContract().stale(component) ? ' · review stale' : ''
}

/** Design artifacts above this size are omitted from the brief (R4 token ceiling). */
const BRIEF_DESIGN_LIMIT = 6000

/**
 * Render the reviewer's brief (v0.13, comp-48): the component's state in a
 * fixed block order, then the house conventions — which is how they travel
 * to any workspace — the guiding questions and the exact response format
 * with the contract's frontmatter pre-filled.
 * @param data - what `ScrumBoard.reviewBrief` returned.
 * @returns the brief text, ready to be handed to an adversarial reviewer.
 */
export function formatReviewBrief(data: ReviewBriefData): string {
  const { component, requirements, previousReview, design, taskCount } = data
  // Round: previous + 1 when the previous review is valid; 2 when a review
  // exists without a valid frontmatter (a round did happen); 1 when none.
  const round = previousReview === undefined ? 1 : previousReview.meta === null ? 2 : previousReview.meta.round + 1
  const blocks: string[] = []
  blocks.push(
    `# Adversarial review brief — ${component.id} "${component.title}"`,
    `${component.description === undefined ? '' : `${component.description}\n`}Phase: ${component.phase} · status: ${component.status}`,
  )
  blocks.push(`## Requirements version ${requirements.version} (digest ${requirements.digest}) — status: ${requirements.status ?? 'missing'}`)
  // comp-49 R2: what the traceability matrix will key on.
  blocks.push(requirements.ids.length === 0
    ? 'Requirement ids found: none — the matrix cannot key on this text (write "R1 — …" at line start)'
    : `Requirement ids found: ${requirements.ids.join(', ')}`)
  blocks.push(`## Requirements\n\n${requirements.body}`)
  if (previousReview !== undefined) {
    const label = previousReview.meta === null
      ? '## Previous review (no valid frontmatter)'
      : `## Previous review — covered version ${previousReview.meta.reviewed_version}, digest ${previousReview.meta.reviewed_digest}, verdict ${previousReview.meta.verdict}, round ${previousReview.meta.round}`
    blocks.push(`${label}\n\n${previousReview.body}\n\nConfirm item by item whether each earlier finding was absorbed by the current text.`)
  }
  if (design !== undefined) {
    blocks.push(design.length > BRIEF_DESIGN_LIMIT
      ? `## Design omitted (${design.length} chars > ${BRIEF_DESIGN_LIMIT}) — read the component's design artifact directly.`
      : `## Design\n\n${design}`)
  }
  blocks.push(`## Tasks under the component: ${taskCount}`)
  blocks.push([
    '## House conventions (check the spec against them)',
    '- Architecture: MVC and object-oriented design. Model = scrum-domain (classes own every rule and invariant);',
    '  Controller = tools / API / commands (translate calls to model methods, no rules of their own); View = format.ts and the GUI.',
    '  The design of every component must declare its Model/View/Controller split and the classes involved.',
    '- Artifacts (requirements, requirementsReview, design, validation) are markdown with a YAML frontmatter on line 1.',
    '- The spiral: requirements → design → tdd → construction → validation; forward steps go through gates evaluated in the',
    '  domain (inside the table mutator); every refusal names the missing condition; retreats are free and logged.',
    `- Tests before code (TDD); validation records the suite duration against the board budget (currently ${data.suiteBudgetSeconds ?? DEFAULT_SUITE_BUDGET_SECONDS}s; worst of ≥ 3 runs when \`suite.runs\` is given).`,
    '- Traceability: the design frontmatter carries the matrix — traces: then one indented entry per line "- { req: [R1], files: [<workspace-relative paths>], tests: [...] }" (all three keys);',
    '  every requirement id must appear (files: [] for a requirement without code); the validation frontmatter may carry the as-built traces (an array), which then close the matrix.',
    '  Gates: design → tdd and status done.',
    // comp-54 R6: the title rule travels with the brief, numbers from the Model.
    `- Titles: release/feature/component/task titles ≤ ${TitleContract.limits().title} chars and sprint goals ≤ ${TitleContract.limits().goal} (one line; the domain refuses more — TitleContract); the paragraph goes to description or the planning ceremony.`,
  ].join('\n'))
  blocks.push([
    '## Guiding questions (do not stop at them)',
    '- Logical gaps, contradictions between requirements, conditions that cannot be satisfied.',
    '- Interactions with status, phases, trash/archive, sprints, and legacy media (migration on parse, no version bump).',
    '- Which surface enforces each rule (tool, API, GUI drag/select) — can any bypass the domain?',
    '- Concurrency and idempotency; error codes and messages; what the tests must cover.',
    '- What this component must expose so the traceability matrix (requirement ↔ files ↔ tests) can be fed.',
  ].join('\n'))
  blocks.push([
    '## Response format (mandatory)',
    'You are READ-ONLY: do not modify files, do not run installers (npm/pnpm/yarn) or builds, do not run the test suite — read the code to ground your findings.',
    'Prioritized findings — HIGH / MEDIUM / LOW — each with: the problem, why it matters, the concrete change (proposed requirement text when it fits).',
    'Then a section "Requirements I would keep", and the verdict (approved | needs-revision).',
    'End with this frontmatter, filling only reviewer, verdict and findings (the rest is pre-filled for this exact text):',
    '```yaml',
    '---',
    `component: ${component.id}`,
    'reviewer: <who>',
    `reviewed_version: ${requirements.version}`,
    // Quoted: an all-digit digest would otherwise be parsed as a number (H1).
    `reviewed_digest: "${requirements.digest}"`,
    'verdict: <approved | needs-revision>',
    `round: ${round}`,
    'findings: { high: <n>, medium: <n>, low: <n> }',
    '---',
    '```',
  ].join('\n'))
  return blocks.join('\n\n')
}

/** Render one sprint's release links (empty when unlinked; many since v0.11). */
function releaseSuffix(sprint: Sprint, names?: ReleaseNames): string {
  if (sprint.releaseIds.length === 0) return ''
  const links = sprint.releaseIds.map((id) => {
    const name = names?.get(id)
    return `${id}${name === undefined ? '' : ` ${name}`}`
  })
  return ` → ${links.join(', ')}`
}

/**
 * Render the whole hierarchy as an indented id-first listing. When `sprints`
 * is passed, each release line also lists the sprints linked to it.
 * @param tree - the nested hierarchy.
 * @param sprints - sprint roster used to render release→sprint links.
 * @returns the multi-line listing (or a hint when empty).
 */
export function formatTree(tree: ScrumTree, sprints?: Sprint[]): string {
  if (tree.releases.length === 0) {
    return 'Empty backlog: no releases yet. Create one with scrum_release_create.'
  }
  const lines: string[] = []
  for (const release of tree.releases) {
    const target = release.targetDate === undefined ? '' : ` (target: ${release.targetDate})`
    const linked = (sprints ?? []).filter(s => s.releaseIds.includes(release.id))
    const sprintSuffix = linked.length === 0
      ? ''
      : ` (sprints: ${linked.map(s => `${s.id} ${s.status}`).join(', ')})`
    lines.push(`${release.id} ${release.name} [${release.status}]${target}${sprintSuffix}${overflowSuffix(release.titleOverflow, 'título longo')}`)
    for (const feature of release.features) {
      lines.push(`  ${feature.id} ${feature.title} [${feature.status}]${overflowSuffix(feature.titleOverflow, 'título longo')}`)
      for (const component of feature.components) {
        const ready = component.readyForDone ? ' · ready for done' : ''
        lines.push(`    ${component.id} ${component.title} [${component.status} · ${component.phase}${staleSuffix(component)}${ready}]${overflowSuffix(component.titleOverflow, 'título longo')}`)
        for (const task of component.tasks) {
          const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
          const sprint = task.sprintId === undefined ? '' : ` @${task.sprintId}`
          lines.push(`      ${task.id} ${kindPrefix(task)}${task.title} [${task.status}${sprint}]${points}${overflowSuffix(task.titleOverflow, 'título longo')}`)
        }
      }
    }
  }
  return lines.join('\n')
}

/**
 * Render the sprint roster, each line carrying its release link when set.
 * @param sprints - sprints newest first.
 * @param releaseNames - release-name lookup for the link rendering.
 * @returns one line per sprint.
 */
export function formatSprints(sprints: SprintView[], releaseNames?: ReleaseNames): string {
  if (sprints.length === 0) return 'No sprints yet.'
  return sprints
    .map((s) => {
      const window = [s.startDate, s.endDate].filter(Boolean).join(' → ')
      return `${s.id} #${s.number} "${s.goal}" [${s.status}]${window.length > 0 ? ` ${window}` : ''}${releaseSuffix(s, releaseNames)}${overflowSuffix(s.goalOverflow, 'meta longa')}`
    })
    .join('\n')
}

/**
 * Render one sprint's progress summary with its board grouped by column.
 * @param status - the sprint status snapshot.
 * @param releaseNames - release-name lookup for the link rendering.
 * @returns the multi-line summary.
 */
export function formatSprintStatus(status: SprintStatus, releaseNames?: ReleaseNames): string {
  const { sprint, tasks, totals } = status
  const head = `${sprint.id} #${sprint.number} "${sprint.goal}" [${sprint.status}]${releaseSuffix(sprint, releaseNames)}${overflowSuffix(sprint.goalOverflow, 'meta longa')}`
  const days = status.daysRemaining === undefined ? '' : `, ${status.daysRemaining} day(s) remaining`
  const progress = `${totals.done}/${totals.tasks} tasks done, ${totals.pointsDone}/${totals.points} points${days}`
  const columns = ['todo', 'in_progress', 'review', 'done'] as const
  const board = columns.map((column) => {
    const inColumn = tasks.filter(t => t.status === column)
    const list = inColumn.length === 0 ? '—' : inColumn.map(t => `${t.id} ${kindPrefix(t)}${t.title}`).join(', ')
    return `  ${column}: ${list}`
  })
  return [head, progress, ...board].join('\n')
}

/**
 * Render one shelf (the trash or the archive) as id-first lines grouped by
 * kind, newest stamp first (the service pre-sorts).
 * @param shelf - the per-kind lists.
 * @param kind - which shelf this is, for labels and the empty hint.
 * @returns the multi-line listing (or a hint when empty).
 */
export function formatShelf(shelf: ShelfLists, kind: 'trash' | 'archive'): string {
  const stampOf = (r: { deletedAt?: string; archivedAt?: string }): string =>
    (kind === 'trash' ? r.deletedAt : r.archivedAt) ?? ''
  const lines: string[] = []
  for (const release of shelf.releases) lines.push(`${release.id} ${release.name} [release] ${stampOf(release)}`)
  for (const feature of shelf.features) lines.push(`${feature.id} ${feature.title} [feature, of ${feature.releaseId}] ${stampOf(feature)}`)
  for (const component of shelf.components) lines.push(`${component.id} ${component.title} [component, of ${component.featureId}] ${stampOf(component)}`)
  for (const task of shelf.tasks) {
    const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
    lines.push(`${task.id} ${kindPrefix(task)}${task.title} [task ${task.status}, of ${task.componentId}]${points} ${stampOf(task)}`)
  }
  if (lines.length === 0) {
    return kind === 'trash'
      ? 'The trash is empty.'
      : 'The archive is empty.'
  }
  return lines.join('\n')
}

/**
 * Render ceremony records oldest first.
 * @param ceremonies - the records.
 * @returns the multi-line listing.
 */
export function formatCeremonies(ceremonies: Ceremony[]): string {
  if (ceremonies.length === 0) return 'No ceremonies recorded.'
  return ceremonies
    .map((c) => {
      const author = c.author === undefined ? '' : ` by ${c.author}`
      const notes = c.notes.map(n => `  [${n.category}] ${n.text}`).join('\n')
      return `${c.id} ${c.type} @${c.sprintId} ${c.at}${author}\n${notes}`
    })
    .join('\n')
}

/**
 * The board's suite budget as text (comp-50 R3).
 * @param budget - what `ScrumBoard.suiteBudget()` returned.
 * @param mode - `read`: the tool's one-line answer; `header`: the line the
 *   tree views prefix when the budget is the board's own (null on the default).
 * @returns the line, or null (header mode on the default budget).
 */
export function formatSuiteBudget(budget: SuiteBudget, mode: 'read' | 'header'): string | null {
  if (mode === 'read') {
    if (budget.source === 'default') return `suite budget: ${budget.seconds}s (default)`
    const reason = budget.reason === undefined ? '' : ` — reason: ${budget.reason}`
    return `suite budget: ${budget.seconds}s (board, set ${budget.setAt}${reason})`
  }
  if (budget.source === 'default') return null
  if (budget.aboveDefault) {
    return `Suite budget: ${budget.seconds}s (board — above default ${DEFAULT_SUITE_BUDGET_SECONDS}s: ${budget.reason})`
  }
  return `Suite budget: ${budget.seconds}s (board)`
}

// ── comp-49 R6: the matrix and the impact report as text ──────────────────

/** The most hits `formatImpact` prints before `+N more`. */
const IMPACT_HITS_CAP = 40
/** The most untraced names `formatImpact` prints before `+N`. */
const IMPACT_UNTRACED_CAP = 60

/** `[status · phase]`, with the archived marker inside the brackets. */
function stateTag(item: { status: string; phase: string }, archived: boolean): string {
  return `[${item.status} · ${item.phase}${archived ? ' (archived)' : ''}]`
}

/** A comma list, or the given placeholder when empty. */
function listOr(paths: string[], placeholder: string): string {
  return paths.length === 0 ? placeholder : paths.join(', ')
}

/**
 * Render one component's matrix (comp-49 R6): header with the source and
 * counts, one line per entry, the holes line only when there is a hole,
 * and the issues one per line.
 * @param component - id, title, status, phase and the archive stamp.
 * @param matrix - what `ScrumBoard.traceMatrix` returned.
 * @returns the multi-line text.
 */
export function formatTraceMatrix(
  component: Pick<Component, 'id' | 'title' | 'status' | 'phase' | 'archivedAt'>,
  matrix: TraceMatrixData,
): string {
  const tag = stateTag(component, component.archivedAt !== undefined)
  const source = matrix.source === null
    ? 'no matrix (source: none)'
    : `matrix from ${matrix.source} (${matrix.entries.length} entries, ${matrix.ids.length} ids)`
  const lines = [`${component.id} ${component.title} ${tag} — ${source}`]
  for (const entry of matrix.entries) {
    lines.push(`  ${entry.req.join(', ')} → ${listOr(entry.files, '(no code)')} ⇐ ${listOr(entry.tests, '(no test)')}`)
  }
  const holes = [
    matrix.untraced.length > 0 ? `without trace ${matrix.untraced.join(', ')}` : null,
    matrix.unproven.length > 0 ? `unproven ${matrix.unproven.join(', ')}` : null,
    matrix.unknown.length > 0 ? `unknown ${matrix.unknown.join(', ')}` : null,
  ].filter((part): part is string => part !== null)
  if (holes.length > 0) lines.push(`  holes: ${holes.join(' · ')}`)
  if (matrix.issues.length > 0) {
    lines.push('  issues:')
    for (const issue of matrix.issues) lines.push(`    - ${issue}`)
  }
  return lines.join('\n')
}

/** A traced path relative to the query (the whole path at the root; the basename when equal). */
function relativeTo(path: string, query: string): string {
  if (query === '') return path
  if (path === query) return path.slice(path.lastIndexOf('/') + 1)
  return path.slice(query.length + 1)
}

/** One hit line: id, title, state tag, ids, the via list on directory queries, and the proof sentence(s). */
function hitLine(hit: ImpactHit, report: ImpactReport): string {
  const parts: string[] = []
  if (hit.via !== 'tests') parts.push(`proved by ${listOr(hit.tests, '(no test)')}`)
  if (hit.via !== 'files') parts.push(`this is the proof; code: ${listOr(hit.files, '(no code)')}`)
  const via = report.form === 'directory' ? `via ${hit.matched.map(m => relativeTo(m, report.path)).join(', ')} — ` : ''
  return `  ${hit.id} ${hit.title} ${stateTag(hit, hit.archived)} ${hit.req.join(', ')} — ${via}${parts.join('; ')}`
}

/**
 * Render an impact report (comp-49 R6): a file with hits, a coverage hole,
 * or a directory with the counts of traced files — then the missing /
 * untraced lines relative to the query, or the truncation note.
 * @param report - what `ScrumBoard.impact` returned.
 * @returns the multi-line text.
 */
export function formatImpact(report: ImpactReport): string {
  const components = new Set(report.hits.map(h => h.id)).size
  const lines: string[] = []
  if (report.form === 'file') {
    if (!report.traced) return `${report.path} — no trace in any component (coverage hole)`
    lines.push(`${report.path} — traced by ${report.hits.length} entry(ies) in ${components} component(s)`)
  } else {
    const files = new Set(report.hits.flatMap(h => h.matched)).size
    lines.push(`${report.path === '' ? '(workspace root)' : `${report.path}/`} — ${files} traced file(s) in ${components} component(s)`)
  }
  for (const hit of report.hits.slice(0, IMPACT_HITS_CAP)) lines.push(hitLine(hit, report))
  if (report.hits.length > IMPACT_HITS_CAP) lines.push(`  +${report.hits.length - IMPACT_HITS_CAP} more`)
  if (report.missing !== undefined && report.missing.length > 0) {
    lines.push(`  missing on disk: ${report.missing.map(m => relativeTo(m, report.path)).join(', ')}`)
  }
  if (report.untracedOnDisk !== undefined && report.untracedOnDisk.length > 0) {
    const names = report.untracedOnDisk.map(m => relativeTo(m, report.path))
    const shown = names.slice(0, IMPACT_UNTRACED_CAP).join(', ')
    const rest = names.length > IMPACT_UNTRACED_CAP ? ` +${names.length - IMPACT_UNTRACED_CAP}` : ''
    lines.push(`  untraced on disk: ${shown}${rest}`)
  }
  if (report.onDiskTruncated === true) lines.push(`  disk listing truncated at ${TRACE_PROBE_CAP} files — missing/untraced are partial`)
  return lines.join('\n')
}

/**
 * Prefix a tree view with the budget header when the board set its own budget (comp-50 R3).
 * @param budget - the board's budget.
 * @param text - the rendered view.
 * @returns the view, headed by the budget line when there is one.
 */
export function withBudgetHeader(budget: SuiteBudget, text: string): string {
  return withBoardHeader(budget, { titles: 0, goals: 0, limits: { title: 0, goal: 0 } }, text)
}

/**
 * The title-limit header line (comp-53 R5): only when the board has at least
 * one title or goal over its limit — a clean board gets no line (the house
 * prints headers only off the default).
 * @param summary - the Model's overflow count with the limits.
 * @returns the line, or null when there is nothing to say.
 */
export function formatOverflowHeader(summary: OverflowSummary): string | null {
  if (summary.titles + summary.goals === 0) return null
  return `Title limit: ${summary.limits.title} chars (sprint goal ${summary.limits.goal}) — ${summary.titles} title(s) and ${summary.goals} goal(s) over`
}

/**
 * Head a tree view with the board's own lines (comp-50 R3, comp-53 R5): the
 * suite budget when the board set one, then the title-limit line when
 * something overflows; nothing at all on a default, clean board.
 * @param budget - the board's budget.
 * @param summary - the board's overflow summary.
 * @param text - the rendered view.
 * @returns the view, headed by the lines that apply.
 */
export function withBoardHeader(budget: SuiteBudget, summary: OverflowSummary, text: string, specs?: SpecSetData | null): string {
  const parts = [formatSuiteBudget(budget, 'header'), formatOverflowHeader(summary), specs == null ? null : specsHeader(specs)]
    .filter((p): p is string => p !== null)
  return parts.length === 0 ? text : `${parts.join('\n')}\n\n${text}`
}

// ── The spec set (comp-59 R6, R7): the View prints SpecSetData, never consults the catalog for a rule ──

/**
 * The one-line summary of the spec set: always `a/3 minimal approved`, then
 * present / invalid / unknown each only when above zero, `complete` last.
 * @param data - the set.
 * @returns the line, or null when there is no `specs/` directory (zero noise).
 */
export function specsHeader(data: SpecSetData): string | null {
  if (!data.exists) return null
  const s = data.summary
  const parts = [`Specs: ${s.minimal.approved}/${s.minimal.total} minimal approved`]
  if (s.present > 0) parts.push(`${s.present} present`)
  if (s.invalid > 0) parts.push(`${s.invalid} invalid`)
  if (s.unknown > 0) parts.push(`${s.unknown} unknown`)
  if (s.complete) parts.push('complete')
  return parts.join(' · ')
}

/**
 * The message of `scrum_spec_status` when there is no set to list.
 * @param reason - why: no session workspace, no `specs/`, or `specs` is not a directory.
 */
export function formatSpecsProbeMessage(reason: 'no-workspace' | 'absent' | 'not-a-directory'): string {
  switch (reason) {
    case 'no-workspace': return 'Specs: no workspace — the spec set lives in <workspace>/specs/'
    case 'not-a-directory': return 'Specs: specs is not a directory'
    case 'absent': {
      const minimal = SpecCatalog.minimal().map(e => e.file).join(', ')
      return `Specs: specs/ not found — the SDD spec set lives in specs/ (minimal: ${minimal}; owners in the order of the agents: ${SPEC_OWNERS.join(' → ')})`
    }
  }
}

/** One id-first line of the status view. */
function specLine(entry: SpecEntry): string {
  if (entry.state === 'unknown') {
    return `${entry.file} [unknown] — not in the catalog${entry.caseOf !== undefined ? ` (case: ${entry.caseOf}?)` : ''}`
  }
  const who = `${entry.owner ?? ''}${entry.minimal ? ' · minimal' : ''}`
  if (entry.state === 'missing') return `${entry.file} [missing] ${who}`
  if (entry.state === 'invalid') return `${entry.file} [invalid] ${who} — ${entry.reasons.join('; ')}`
  const ids = entry.ids.length === 0
    ? 'no ids'
    : entry.ids.length <= 6
      ? `${entry.ids.length} ids (${entry.ids.join(', ')})`
      : `${entry.ids.length} ids (${entry.ids[0]} … ${entry.ids[entry.ids.length - 1]})`
  return `${entry.file} [${entry.state} v${entry.version} · ${entry.digest}] ${who} — ${ids}`
}

/**
 * The status view: the header, then one line per entry in the set's order
 * (catalog, then unknown files capped at {@link SPEC_UNKNOWN_CAP}).
 * @param data - the set.
 */
export function formatSpecStatus(data: SpecSetData): string {
  if (!data.exists) return formatSpecsProbeMessage(data.reason ?? 'absent')
  const lines = [specsHeader(data)!]
  let unknownShown = 0
  let unknownHidden = 0
  for (const entry of data.entries) {
    if (entry.state === 'unknown') {
      if (unknownShown >= SPEC_UNKNOWN_CAP) { unknownHidden += 1; continue }
      unknownShown += 1
    }
    lines.push(specLine(entry))
  }
  if (unknownHidden > 0) lines.push(`  +${unknownHidden} unknown file(s) not shown`)
  return lines.join('\n')
}
