/**
 * Pure text renderers of SCRUM state for tool results: compact, id-first
 * listings the model can read and reference back.
 * @module @scrum-harness/domain/format
 */

import { DEFAULT_SUITE_BUDGET_SECONDS, ReviewContract } from './contracts.ts'
import type { SuiteBudget } from './contracts.ts'
import type { Ceremony, Component, Sprint, Task } from './spec.ts'
import type { ReviewBriefData, ScrumTree, ShelfLists, SprintStatus } from './service.ts'

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
    lines.push(`${release.id} ${release.name} [${release.status}]${target}${sprintSuffix}`)
    for (const feature of release.features) {
      lines.push(`  ${feature.id} ${feature.title} [${feature.status}]`)
      for (const component of feature.components) {
        const ready = component.readyForDone ? ' · ready for done' : ''
        lines.push(`    ${component.id} ${component.title} [${component.status} · ${component.phase}${staleSuffix(component)}${ready}]`)
        for (const task of component.tasks) {
          const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
          const sprint = task.sprintId === undefined ? '' : ` @${task.sprintId}`
          lines.push(`      ${task.id} ${kindPrefix(task)}${task.title} [${task.status}${sprint}]${points}`)
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
export function formatSprints(sprints: Sprint[], releaseNames?: ReleaseNames): string {
  if (sprints.length === 0) return 'No sprints yet.'
  return sprints
    .map((s) => {
      const window = [s.startDate, s.endDate].filter(Boolean).join(' → ')
      return `${s.id} #${s.number} "${s.goal}" [${s.status}]${window.length > 0 ? ` ${window}` : ''}${releaseSuffix(s, releaseNames)}`
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
  const head = `${sprint.id} #${sprint.number} "${sprint.goal}" [${sprint.status}]${releaseSuffix(sprint, releaseNames)}`
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

/**
 * Prefix a tree view with the budget header when the board set its own budget (comp-50 R3).
 * @param budget - the board's budget.
 * @param text - the rendered view.
 * @returns the view, headed by the budget line when there is one.
 */
export function withBudgetHeader(budget: SuiteBudget, text: string): string {
  const header = formatSuiteBudget(budget, 'header')
  return header === null ? text : `${header}\n\n${text}`
}
