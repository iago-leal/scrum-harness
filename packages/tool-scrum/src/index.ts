/**
 * Model-facing SCRUM tools over `ctx.scrum`. Every tool validates through the
 * service's business rules and answers with a compact id-first text the model
 * can reference back (ids: rel-, feat-, comp-, task-, spr-, cer-).
 * @module @scrum-harness/tool-scrum
 */

import { existsSync, readFileSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  BOARD_COLUMNS,
  CEREMONY_TYPES,
  COMPONENT_PHASES,
  DEFAULT_SUITE_BUDGET_SECONDS,
  formatCeremonies,
  formatImpact,
  formatReviewBrief,
  formatShelf,
  formatSprints,
  formatSprintStatus,
  formatSuiteBudget,
  formatTraceMatrix,
  formatTree,
  gitignoreNames,
  kindPrefix,
  TASK_KINDS,
  TRACE_PROBE_CAP,
  withBudgetHeader,
} from '@scrum-harness/domain'
// Type-only: resolves ctx.scrum for the inject declaration.
import type {} from '@scrum-harness/domain'
import { listWorkspaceFiles, resolveWorkspacePath } from './probe.ts'

export const name = 'tool-scrum'
export const inject = ['tools', 'scrum']

/** Output spec shared by every mutating tool: one confirmation line. */
const TEXT_OUTPUT = {
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      text: { type: 'string', required: true },
    },
  },
  render: (_args: unknown, value: { text: string }) => [{ type: 'text' as const, text: value.text }],
} as const

/**
 * Register the SCRUM tool family on `ctx.tools`.
 * @param ctx - registrant context carrying the tool registry and scrum service.
 */
export function apply(ctx: Context): void {
  /**
   * Structural view of the tool run context (agent → session → header.cwd),
   * dependency-free on purpose: the Agent type lives in a host-only package.
   */
  interface ExecLike { agent?: { session: { header: { cwd?: string } } } }

  /**
   * Resolve the calling session's board: its workspace cwd selects the
   * per-workspace domain; a session without cwd shares the global board.
   */
  const boardOf = (exec: unknown) =>
    ctx.scrum.board((exec as ExecLike).agent?.session.header.cwd)
  /** The calling session's workspace, when it has one. */
  const cwdOf = (exec: unknown): string | undefined => (exec as ExecLike).agent?.session.header.cwd

  ctx.tools.register(defineTool({
    name: 'scrum_tree',
    description:
      'Read the whole SCRUM hierarchy — Release > Feature > Component > Task — plus the sprint roster (each release line lists its linked sprints, each sprint its releases). '
      + 'Every line starts with the item id (rel-, feat-, comp-, task-, spr-) used by the other scrum_* tools. '
      + 'Call this first to orient yourself before creating or changing items.',
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const board = await boardOf(exec)
      const sprints = board.sprints()
      const text = `${formatTree(board.tree(), sprints)}\n\nSprints:\n${formatSprints(sprints, board.releaseNames())}`
      // comp-50 R3: the board's own suite budget heads the view (never on the default).
      return Promise.resolve({ text: withBudgetHeader(board.suiteBudget(), text) })
    },
    presentCall: () => ({ card: 'generic', title: 'Read SCRUM tree', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_suite_budget',
    description:
      'Read or set this board\'s suite time budget (comp-50): the ceiling every validation artifact\'s `budget_seconds` is checked against '
      + '(default 15s). Without arguments it reads. With `seconds` it sets the board budget; `0` removes it (back to the default). '
      + 'Raising it above the default requires a `reason` (also when re-setting the same value) — the reason travels in the tree header. '
      + 'Lowering it never reopens done components; it only changes what is ready for done from now on.',
    parameters: {
      seconds: { type: 'number', description: 'New budget in seconds (> 0); 0 removes the board budget. Omit to read.' },
      reason: { type: 'string', description: 'Why the budget stands above the default (required above 15s).' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      if (args.seconds === undefined) return { text: formatSuiteBudget(board.suiteBudget(), 'read')! }
      // 0 is the transport for "remove"; the Model takes number | undefined.
      const budget = await board.setSuiteBudget(args.seconds === 0 ? undefined : args.seconds, args.reason)
      return { text: formatSuiteBudget(budget, 'read')! }
    },
    presentCall: args => (args.seconds === undefined
      ? { card: 'generic', title: 'Read suite budget', kind: 'read' }
      : { card: 'generic', title: `Set suite budget ${args.seconds}s`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_release_create',
    description: 'Create a Release (top of the SCRUM hierarchy): a shippable product version.',
    parameters: {
      name: { type: 'string', required: true, description: 'Release name, e.g. "v1.0".' },
      description: { type: 'string', description: 'What this release delivers.' },
      targetDate: { type: 'string', description: 'Target date, ISO format (YYYY-MM-DD).' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const release = await board.createRelease(args)
      return { text: `Created release ${release.id} "${release.name}" [${release.status}].` }
    },
    presentCall: args => ({ card: 'generic', title: `Create release "${args.name}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_feature_create',
    description: 'Create a Feature (função) under an existing Release.',
    parameters: {
      releaseId: { type: 'string', required: true, description: 'Parent release id (rel-N).' },
      title: { type: 'string', required: true },
      description: { type: 'string' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const feature = await board.createFeature(args)
      return { text: `Created feature ${feature.id} "${feature.title}" under ${feature.releaseId}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Create feature "${args.title}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_component_create',
    description: 'Create a Component (product-backlog entry, componente) under an existing Feature.',
    parameters: {
      featureId: { type: 'string', required: true, description: 'Parent feature id (feat-N).' },
      title: { type: 'string', required: true },
      description: { type: 'string' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const component = await board.createComponent(args)
      return { text: `Created component ${component.id} "${component.title}" under ${component.featureId}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Create component "${args.title}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_task_create',
    description:
      'Create a Task (tarefa) under an existing Component. Tasks start in the backlog. '
      + 'Tasks carry a kind (test | code | other): give `kind`, or start the title with [test]/[code] and it is inferred (the prefix leaves the stored title).',
    parameters: {
      componentId: { type: 'string', required: true, description: 'Parent component id (comp-N).' },
      title: { type: 'string', required: true },
      description: { type: 'string' },
      estimate: { type: 'number', description: 'Story points (relative estimation).' },
      kind: {
        type: 'string',
        enum: [...TASK_KINDS],
        description: 'Task kind. Omitted: inferred from a leading [test]/[code] in the title, else other. A prefix that contradicts an explicit kind is refused. In the tdd phase, test tasks must be created before code tasks.',
      },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const task = await board.createTask(args)
      const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
      return { text: `Created task ${task.id} ${kindPrefix(task)}"${task.title}"${points} under ${task.componentId}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Create task "${args.title}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_update',
    description:
      'Update fields of any SCRUM item by id. The id prefix selects the level: '
      + 'rel- (title→name, targetDate, status: planned|active|released), feat- (title, status: proposed|committed|in_progress|done), '
      + 'comp- (title, status: proposed|in_progress|done, and the spiral artifacts requirements / requirementsReview / '
      + 'design / validation — markdown with an optional YAML frontmatter; empty string deletes one), task- (title, estimate, kind: test|code|other — '
      + 'a [test]/[code] prefix in a new title moves the kind; one contradicting an explicit kind is refused), '
      + 'spr- (goal, releaseIds — replaces the linked set, releaseId as one-id shortcut, wipLimits). Description applies to all except sprints.',
    parameters: {
      id: { type: 'string', required: true },
      title: { type: 'string', description: 'New title / release name.' },
      description: { type: 'string' },
      requirements: { type: 'string', description: 'Components only: the requirements artifact — markdown with a YAML frontmatter on line 1 carrying `version: <int ≥ 1>` and, once the human approved them, `status: approved`; the body declares its ids as "R1 — …" at line start (the traceability matrix keys on them). Gate requirements → design.' },
      requirementsReview: { type: 'string', description: 'Components only: the adversarial review — markdown with frontmatter { reviewer, reviewed_version, reviewed_digest, verdict: approved|needs-revision, round, findings: { high, medium, low } } (get it pre-filled from scrum_component_review_brief). The gate needs verdict approved with findings.high 0, covering the current requirements version and digest.' },
      design: { type: 'string', description: 'Components only: the design artifact (text + mermaid) whose frontmatter carries the traceability matrix — `traces:` then one indented entry per line `  - { req: [R1], files: [<workspace-relative paths>], tests: [...] }` (all three keys; every requirement id must appear; files: [] for a requirement without code). Gate design → tdd.' },
      validation: { type: 'string', description: 'Components only: validation evidence — markdown with frontmatter { validated_at: "<ISO date>", suite: { tests, passed, skipped?, wall_seconds, budget_seconds ≤ the board\'s suite budget (see scrum_suite_budget; default 15), runs?: [a, b, c] }, typecheck: clean, traces?: <the as-built matrix, same shape as the design\'s — when present it replaces the design\'s for the done gate> } and a body (what was checked and how — command and machine). With `runs` (≥ 3 consecutive runs, written inline) the WORST run counts and wall_seconds must report it. Gate for status done.' },
      estimate: { type: 'number', description: 'Tasks only.' },
      kind: { type: 'string', enum: [...TASK_KINDS], description: 'Tasks only: the task kind (test | code | other).' },
      targetDate: { type: 'string', description: 'Releases only (ISO date).' },
      status: { type: 'string', description: 'Releases, features and components (each level has its own workflow). Component `done` is gated: phase validation, every task done, and a `validation` artifact honoring its contract — a refusal names every missing condition.' },
      goal: { type: 'string', description: 'Sprints only.' },
      releaseId: { type: 'string', description: 'Sprints only: shortcut for releaseIds with ONE release (rel-N); empty string removes every link.' },
      releaseIds: {
        type: 'array',
        description: 'Sprints only: REPLACE the whole set of linked releases (rel-N ids); empty array unlinks. Wins over the releaseId shortcut.',
        items: { type: 'string' },
      },
      wipLimits: {
        type: 'object',
        description: 'Sprints only: REPLACE the per-column WIP limits of the board, e.g. {"in_progress": 3}. A value of 0 drops that column\'s limit; {} removes them all.',
        additionalProperties: false,
        properties: {
          todo: { type: 'number' },
          in_progress: { type: 'number' },
          review: { type: 'number' },
          done: { type: 'number' },
        },
      },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const { id, ...patch } = args
      await board.updateItem(id, patch as Parameters<typeof board.updateItem>[1])
      // Early feedback on the artifact contracts (comp-48 R7, comp-47 R6): warn, never block —
      // one line per contract the patch touched.
      const notes: string[] = []
      if (id.startsWith('comp-') && (args.requirements !== undefined || args.requirementsReview !== undefined)) {
        const contract = board.reviewContract(id)
        notes.push(`review contract: ${contract.ok ? 'ok' : `${contract.reasons.join('; ')} — will block requirements → design`}`)
      }
      if (id.startsWith('comp-') && args.requirements !== undefined) {
        // comp-49 R8: the effective matrix may have stopped covering the ids — a warning, never a block.
        const matrix = board.traceMatrix(id)
        if (matrix.source !== null && (matrix.untraced.length > 0 || matrix.unknown.length > 0)) {
          const parts = [
            matrix.untraced.length > 0 ? `without trace ${matrix.untraced.join(', ')}` : null,
            matrix.unknown.length > 0 ? `unknown ${matrix.unknown.join(', ')}` : null,
          ].filter((part): part is string => part !== null)
          notes.push(`trace matrix stale: ${parts.join(' · ')}`)
        }
      }
      if (id.startsWith('comp-') && args.design !== undefined) {
        // comp-49 R8: the Model says which gate will read the design's matrix.
        const contract = board.traceContract(id, 'design')
        const gate = board.traceGate(id, 'design')
        const verdict = contract.ok ? 'ok' : contract.reasons.join('; ')
        const ending = gate === 'design → tdd' ? ' — will block design → tdd' : gate === 'done' ? ' — will block status done' : ' (validation as-built is effective)'
        notes.push(`trace contract (design): ${verdict}${ending}`)
      }
      if (id.startsWith('comp-') && args.validation !== undefined) {
        const contract = board.validationContract(id)
        notes.push(`validation contract: ${contract.ok ? 'ok' : `${contract.reasons.join('; ')} — will block status done`}`)
        // comp-50 R4: guidance from the Model's flags, never from the reasons' text.
        if (!contract.ok && contract.overBudget) notes.push('over budget: add a test task (kind test) refactoring the suite before done')
        const budget = board.suiteBudget()
        if (budget.aboveDefault) notes.push(`budget above default (${budget.seconds}s > ${DEFAULT_SUITE_BUDGET_SECONDS}s)`)
        // comp-49 R8: the as-built matrix, when the validation carries one.
        if (board.traceGate(id, 'validation') === 'done') {
          const traces = board.traceContract(id, 'validation')
          notes.push(`trace contract (validation): ${traces.ok ? 'ok' : traces.reasons.join('; ')} — will block status done`)
        } else {
          notes.push('trace contract: validation carries no traces array — the design matrix stays effective')
        }
      }
      return { text: notes.length === 0 ? `Updated ${id}.` : `Updated ${id}. ${notes.join(' | ')}` }
    },
    presentCall: args => ({ card: 'generic', title: `Update ${args.id}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_component_review_brief',
    description:
      'The briefing to hand to an adversarial reviewer (a subagent) of one component\'s requirements: the requirements '
      + '(version + digest), the previous review when one exists, the design once past requirements, the house conventions, '
      + 'guiding questions, and the mandatory response format with the review frontmatter PRE-FILLED for this exact text. '
      + 'Paste the reviewer\'s report into requirementsReview via scrum_item_update; the requirements → design gate needs an '
      + 'approved review (findings.high 0) covering the current version and digest, and requirements with `status: approved`.',
    parameters: {
      id: { type: 'string', required: true, description: 'Component id (comp-N). Its requirements must carry a frontmatter `version`.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      return { text: formatReviewBrief(board.reviewBrief(args.id)) }
    },
    presentCall: args => ({ card: 'generic', title: `Review brief for ${args.id}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_component_phase',
    description:
      'Move a component along the spiral: requirements → design → tdd → construction → validation. '
      + 'action "advance" takes the next step through its gate (requirements→design needs the review contract: `requirements` with '
      + 'frontmatter version + status approved and a body, `requirementsReview` approved with findings.high 0 covering that version and digest; '
      + 'design→tdd needs design carrying a complete trace matrix (frontmatter traces:); tdd→construction needs at least one test task and no code task created before the first test task; '
      + 'construction→validation needs every task done). '
      + 'action "set" with a phase retreats freely (the spiral revisits) or advances one step through the same gate; skipping is refused. '
      + 'action "check" reads the checklist without moving: the phase, the next step and exactly what a move would be refused with '
      + '(in validation the next step is scrum_item_update status done). '
      + 'A refused gate names the missing condition. Every movement is logged in the component\'s phaseLog.',
    parameters: {
      id: { type: 'string', required: true, description: 'Component id (comp-N).' },
      action: { type: 'string', required: true, enum: ['advance', 'set', 'check'], description: 'advance = next phase through its gate; set = go to `phase`; check = read the checklist, move nothing.' },
      phase: {
        type: 'string',
        enum: [...COMPONENT_PHASES],
        description: 'Target phase — required with action "set", refused with "advance" and "check".',
      },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      if (args.action === 'set' && args.phase === undefined) {
        throw new Error('action "set" requires a phase')
      }
      if (args.action !== 'set' && args.phase !== undefined) {
        throw new Error(`action "${args.action}" takes no phase (use "set" to pick one)`)
      }
      if (args.action === 'check') {
        // comp-46 R4: the Model's readiness, rendered in its four forms.
        const r = board.phaseReadiness(args.id)
        if (r.next === null) return { text: `${args.id} [${r.status} · ${r.phase}]: nothing to do` }
        const head = `${args.id} [${r.status} · ${r.phase}] → ${r.next}: `
        if (!r.ok) return { text: `${head}${r.reasons.join('; ')}` }
        return { text: `${head}ok — ${r.next === 'done' ? 'set status done with scrum_item_update' : 'advance when ready'}` }
      }
      const component = args.action === 'advance'
        ? await board.advancePhase(args.id)
        : await board.setPhase(args.id, args.phase!)
      return { text: `${component.id} → ${component.phase} [${component.status}]. Phase log: ${component.phaseLog.length} movement(s).` }
    },
    presentCall: args => (args.action === 'check'
      ? { card: 'generic', title: `Check phase of ${args.id}`, kind: 'read' }
      : { card: 'generic', title: `${args.action === 'advance' ? 'Advance' : 'Set'} phase of ${args.id}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_trace',
    description:
      'The traceability matrix (comp-49): requirement ↔ files ↔ tests, read from the frontmatter `traces:` of each component\'s design '
      + '(or of its validation, when that carries the as-built). Exactly one of: `path` — impact query: which requirements of which components '
      + 'a workspace-relative file or directory affects, which tests prove them, what is traced but missing on disk, and what exists on disk '
      + 'with no trace at all (coverage hole); `id` — one component\'s matrix with its holes (without trace / unproven / unknown) and issues. '
      + 'Archived components answer too (history); trashed ones never. An absolute path is resolved against the session workspace.',
    parameters: {
      path: { type: 'string', description: 'A file or directory, relative to the workspace root ("." = the root) or absolute inside it.' },
      id: { type: 'string', description: 'Component id (comp-N): print its matrix instead.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      if ((args.path === undefined) === (args.id === undefined)) throw new Error('scrum_trace takes exactly one of path | id')
      if (args.id !== undefined) {
        // The Model refuses trashed/unknown ids here; the record for the header is live or archived.
        const matrix = board.traceMatrix(args.id)
        const component = board.archive().components.find(c => c.id === args.id)
          ?? board.tree().releases.flatMap(r => r.features).flatMap(f => f.components).find(c => c.id === args.id)!
        return { text: formatTraceMatrix(component, matrix) }
      }
      const cwd = cwdOf(exec)
      let query = args.path!
      if (isAbsolute(query)) {
        if (cwd === undefined) throw new Error('an absolute path needs a workspace (this session has no cwd)')
        const relative = resolveWorkspacePath(cwd, query)
        if (relative === null) throw new Error(`path is outside the workspace (${cwd})`)
        query = relative
      }
      if (cwd === undefined) return { text: formatImpact(board.impact(query)) }
      // The disk probe (environment): the Model owns every rule about what it finds.
      const report = board.impact(query)
      const ignorePath = join(cwd, '.gitignore')
      const ignore = new Set(existsSync(ignorePath) ? gitignoreNames(readFileSync(ignorePath, 'utf8')) : [])
      const listing = listWorkspaceFiles(cwd, report.path, ignore, TRACE_PROBE_CAP)
      return { text: formatImpact(board.impact(query, { onDisk: listing.files, onDiskTruncated: listing.truncated })) }
    },
    presentCall: args => ({ card: 'generic', title: `Trace ${args.path ?? args.id ?? '?'}`, kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_delete',
    description:
      'Move a release, feature, component or task to the TRASH (soft delete: restorable with scrum_item_restore, '
      + 'definitive only via scrum_item_purge / scrum_trash_empty). A parent with live descendants is refused unless '
      + 'cascade is true (then the whole subtree is trashed together). Sprints and ceremonies are history and cannot '
      + 'be deleted; a task inside the active sprint must be moved out first.',
    parameters: {
      id: { type: 'string', required: true },
      cascade: { type: 'boolean', description: 'Also trash every live descendant. Defaults to false.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const trashed = await board.deleteItem(args.id, args.cascade ?? false)
      return { text: `Moved to trash: ${trashed.join(', ')}. Restore with scrum_item_restore; purge to delete forever.` }
    },
    presentCall: args => ({ card: 'generic', title: `Trash ${args.id}`, kind: 'delete' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_trash_list',
    description:
      'List the TRASH: soft-deleted releases/features/components/tasks, newest deletion first. '
      + 'Each line carries the id used by scrum_item_restore (bring back) and scrum_item_purge (delete forever).',
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const board = await boardOf(exec)
      return Promise.resolve({ text: formatShelf(board.trash(), 'trash') })
    },
    presentCall: () => ({ card: 'generic', title: 'List trash', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_restore',
    description:
      'Restore one item from the TRASH back to the live backlog. Shelved ancestors are revived too, and so are the '
      + 'descendants trashed by the same delete operation.',
    parameters: {
      id: { type: 'string', required: true, description: 'Id of a trashed item (see scrum_trash_list).' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const restored = await board.restoreItem(args.id)
      return { text: `Restored: ${restored.join(', ')}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Restore ${args.id}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_purge',
    description:
      'PERMANENTLY delete one trashed item (and its trashed subtree). Only works on items already in the trash — '
      + 'there is no way back. Sprints survive a purged release; they only lose the link.',
    parameters: {
      id: { type: 'string', required: true, description: 'Id of a trashed item (see scrum_trash_list).' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const purged = await board.purgeItem(args.id)
      return { text: `Purged forever: ${purged.join(', ')}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Purge ${args.id} (permanent)`, kind: 'delete' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_trash_empty',
    description: 'PERMANENTLY delete everything in the TRASH. There is no way back.',
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const board = await boardOf(exec)
      const purged = await board.emptyTrash()
      return { text: purged.length === 0 ? 'The trash was already empty.' : `Trash emptied; purged forever: ${purged.join(', ')}.` }
    },
    presentCall: () => ({ card: 'generic', title: 'Empty trash (permanent)', kind: 'delete' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_archive_list',
    description:
      'List the ARCHIVE: concluded items stowed away from the main views, newest first. '
      + 'Bring one back with scrum_item_unarchive.',
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const board = await boardOf(exec)
      return Promise.resolve({ text: formatShelf(board.archive(), 'archive') })
    },
    presentCall: () => ({ card: 'generic', title: 'List archive', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_archive',
    description:
      'ARCHIVE one item and its live subtree: concluded work leaves the main views but stays restorable and keeps '
      + 'counting in completed-sprint totals. Tasks in the active sprint cannot be archived.',
    parameters: {
      id: { type: 'string', required: true },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const archived = await board.archiveItem(args.id)
      return { text: `Archived: ${archived.join(', ')}. Bring back with scrum_item_unarchive.` }
    },
    presentCall: args => ({ card: 'generic', title: `Archive ${args.id}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_unarchive',
    description:
      'Bring one item back from the ARCHIVE to the live views (revives shelved ancestors and the items archived '
      + 'together with it).',
    parameters: {
      id: { type: 'string', required: true, description: 'Id of an archived item (see scrum_archive_list).' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const revived = await board.unarchiveItem(args.id)
      return { text: `Unarchived: ${revived.join(', ')}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Unarchive ${args.id}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_archive_completed',
    description:
      'Batch shortcut: archive every DONE task that is not on the active board (its sprint completed or none). '
      + 'Features and releases are archived explicitly with scrum_item_archive.',
    parameters: {},
    output: TEXT_OUTPUT,
    async execute(_args, exec) {
      const board = await boardOf(exec)
      const archived = await board.archiveCompleted()
      return { text: archived.length === 0 ? 'Nothing to archive: no concluded tasks outside the active sprint.' : `Archived completed tasks: ${archived.join(', ')}.` }
    },
    presentCall: () => ({ card: 'generic', title: 'Archive completed tasks', kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_sprint_plan',
    description:
      'Sprint Planning: create a new sprint (status planned) with a goal, optional time window, and an '
      + 'optional initial selection of backlog tasks (they become its sprint backlog, column todo).',
    parameters: {
      goal: { type: 'string', required: true, description: 'The sprint goal.' },
      releaseId: { type: 'string', description: 'Single release this sprint advances (rel-N); backward-compatible shortcut for releaseIds: [id].' },
      releaseIds: {
        type: 'array',
        description: 'Releases this sprint advances (rel-N ids); replaces/extends the single releaseId shortcut and wins over it when both are sent.',
        items: { type: 'string' },
      },
      startDate: { type: 'string', description: 'ISO date.' },
      endDate: { type: 'string', description: 'ISO date.' },
      taskIds: {
        type: 'array',
        description: 'Backlog task ids selected into the sprint.',
        items: { type: 'string' },
      },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const sprint = await board.planSprint(args)
      const selected = args.taskIds === undefined || args.taskIds.length === 0
        ? '' : ` with ${args.taskIds.length} task(s)`
      const linked = sprint.releaseIds.length === 0 ? '' : ` for ${sprint.releaseIds.join(', ')}`
      return { text: `Planned sprint ${sprint.id} #${sprint.number} "${sprint.goal}"${linked}${selected}. Start it with scrum_sprint_start.` }
    },
    presentCall: args => ({ card: 'generic', title: `Plan sprint "${args.goal}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_sprint_assign',
    description: 'Add a backlog task to a sprint (direction add) or return it to the backlog (direction remove).',
    parameters: {
      sprintId: { type: 'string', required: true },
      taskId: { type: 'string', required: true },
      direction: { type: 'string', required: true, enum: ['add', 'remove'] },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const task = await board.assignTask(args.sprintId, args.taskId, args.direction as 'add' | 'remove')
      return {
        text: args.direction === 'add'
          ? `Task ${task.id} added to ${args.sprintId} (todo).`
          : `Task ${task.id} returned to the backlog.`,
      }
    },
    presentCall: args => ({ card: 'generic', title: `Sprint ${args.direction}: ${args.taskId}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_sprint_start',
    description: 'Start a planned sprint. At most one sprint can be active at a time.',
    parameters: {
      sprintId: { type: 'string', required: true },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const sprint = await board.startSprint(args.sprintId)
      return { text: `Sprint ${sprint.id} #${sprint.number} "${sprint.goal}" is now active.` }
    },
    presentCall: args => ({ card: 'generic', title: `Start sprint ${args.sprintId}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_sprint_end',
    description:
      'End the active sprint (Sprint Review boundary): done tasks keep the sprint as history, '
      + 'unfinished tasks return to the backlog.',
    parameters: {
      sprintId: { type: 'string', description: 'Defaults to the active sprint.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const { sprint, returnedToBacklog } = await board.endSprint(args.sprintId)
      const returned = returnedToBacklog.length === 0
        ? 'all tasks were done'
        : `returned to backlog: ${returnedToBacklog.join(', ')}`
      return { text: `Sprint ${sprint.id} completed; ${returned}.` }
    },
    presentCall: () => ({ card: 'generic', title: 'End sprint', kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_sprint_status',
    description: 'Sprint progress: totals (tasks and story points done) and the Kanban board grouped by column.',
    parameters: {
      sprintId: { type: 'string', description: 'Defaults to the active sprint.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      return Promise.resolve({ text: formatSprintStatus(board.sprintStatus(args.sprintId), board.releaseNames()) })
    },
    presentCall: () => ({ card: 'generic', title: 'Sprint status', kind: 'read' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_task_move',
    description: 'Move a task across the Kanban board of the ACTIVE sprint.',
    parameters: {
      taskId: { type: 'string', required: true },
      column: { type: 'string', required: true, enum: [...BOARD_COLUMNS] },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const task = await board.moveTask(args.taskId, args.column)
      return { text: `Task ${task.id} → ${task.status}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Move ${args.taskId} → ${args.column}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_ceremony_record',
    description:
      'Record a SCRUM ceremony (append-only). Types: planning, standup, review, retrospective. '
      + 'Notes are categorized lines — standup: progress/impediment/next; retrospective: went-well/to-improve/action-item.',
    parameters: {
      type: { type: 'string', required: true, enum: [...CEREMONY_TYPES] },
      sprintId: { type: 'string', description: 'Defaults to the active sprint.' },
      author: { type: 'string', description: 'Who is recording (person or agent).' },
      notes: {
        type: 'array',
        required: true,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            category: { type: 'string', required: true },
            text: { type: 'string', required: true },
          },
        },
      },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      const ceremony = await board.recordCeremony({
        type: args.type as (typeof CEREMONY_TYPES)[number],
        sprintId: args.sprintId,
        author: args.author,
        notes: args.notes,
      })
      return { text: `Recorded ${ceremony.type} ${ceremony.id} for ${ceremony.sprintId} (${ceremony.notes.length} note(s)).` }
    },
    presentCall: args => ({ card: 'generic', title: `Record ${args.type}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_ceremony_list',
    description: 'List recorded ceremonies with their notes, oldest first.',
    parameters: {
      sprintId: { type: 'string', description: 'Restrict to one sprint.' },
    },
    output: TEXT_OUTPUT,
    async execute(args, exec) {
      const board = await boardOf(exec)
      return Promise.resolve({ text: formatCeremonies(board.ceremonies(args.sprintId)) })
    },
    presentCall: () => ({ card: 'generic', title: 'List ceremonies', kind: 'read' }),
  }))
}
