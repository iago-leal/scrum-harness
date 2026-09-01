/**
 * Model-facing SCRUM tools over `ctx.scrum`. Every tool validates through the
 * service's business rules and answers with a compact id-first text the model
 * can reference back (ids: rel-, feat-, comp-, task-, spr-, cer-).
 * @module @scrum-harness/tool-scrum
 */

import type { Context } from '@deepseek-ai/cordis'
import { defineTool } from '@deepseek-ai/dsh-tools'
import {
  BOARD_COLUMNS,
  CEREMONY_TYPES,
  formatCeremonies,
  formatSprints,
  formatSprintStatus,
  formatTree,
} from '@scrum-harness/domain'
// Type-only: resolves ctx.scrum for the inject declaration.
import type {} from '@scrum-harness/domain'

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
  const scrum = () => ctx.scrum

  ctx.tools.register(defineTool({
    name: 'scrum_tree',
    description:
      'Read the whole SCRUM hierarchy — Release > Feature > Component > Task — plus the sprint roster (each release line lists its linked sprints, each sprint its release). '
      + 'Every line starts with the item id (rel-, feat-, comp-, task-, spr-) used by the other scrum_* tools. '
      + 'Call this first to orient yourself before creating or changing items.',
    parameters: {},
    output: TEXT_OUTPUT,
    execute() {
      const sprints = scrum().sprints()
      const text = `${formatTree(scrum().tree(), sprints)}\n\nSprints:\n${formatSprints(sprints, scrum().releaseNames())}`
      return Promise.resolve({ text })
    },
    presentCall: () => ({ card: 'generic', title: 'Read SCRUM tree', kind: 'read' }),
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
    async execute(args) {
      const release = await scrum().createRelease(args)
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
    async execute(args) {
      const feature = await scrum().createFeature(args)
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
    async execute(args) {
      const component = await scrum().createComponent(args)
      return { text: `Created component ${component.id} "${component.title}" under ${component.featureId}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Create component "${args.title}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_task_create',
    description: 'Create a Task (tarefa) under an existing Component. Tasks start in the backlog.',
    parameters: {
      componentId: { type: 'string', required: true, description: 'Parent component id (comp-N).' },
      title: { type: 'string', required: true },
      description: { type: 'string' },
      estimate: { type: 'number', description: 'Story points (relative estimation).' },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const task = await scrum().createTask(args)
      const points = task.estimate === undefined ? '' : ` (${task.estimate}pt)`
      return { text: `Created task ${task.id} "${task.title}"${points} under ${task.componentId}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Create task "${args.title}"`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_update',
    description:
      'Update fields of any SCRUM item by id. The id prefix selects the level: '
      + 'rel- (title→name, targetDate, status: planned|active|released), feat- (title, status: proposed|committed|done), '
      + 'comp- (title), task- (title, estimate), spr- (goal, releaseId — empty string unlinks). Description applies to all except sprints.',
    parameters: {
      id: { type: 'string', required: true },
      title: { type: 'string', description: 'New title / release name.' },
      description: { type: 'string' },
      estimate: { type: 'number', description: 'Tasks only.' },
      targetDate: { type: 'string', description: 'Releases only (ISO date).' },
      status: { type: 'string', description: 'Releases and features only.' },
      goal: { type: 'string', description: 'Sprints only.' },
      releaseId: { type: 'string', description: 'Sprints only: link to a release (rel-N); empty string removes the link.' },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const { id, ...patch } = args
      await scrum().updateItem(id, patch)
      return { text: `Updated ${id}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Update ${args.id}`, kind: 'edit' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_item_delete',
    description:
      'Delete a release, feature, component or task by id. A parent with children is refused '
      + 'unless cascade is true (then the whole subtree goes). Sprints and ceremonies are history and cannot be deleted; '
      + 'a task inside the active sprint must be moved out first.',
    parameters: {
      id: { type: 'string', required: true },
      cascade: { type: 'boolean', description: 'Also delete every descendant. Defaults to false.' },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const deleted = await scrum().deleteItem(args.id, args.cascade ?? false)
      return { text: `Deleted: ${deleted.join(', ')}.` }
    },
    presentCall: args => ({ card: 'generic', title: `Delete ${args.id}`, kind: 'delete' }),
  }))

  ctx.tools.register(defineTool({
    name: 'scrum_sprint_plan',
    description:
      'Sprint Planning: create a new sprint (status planned) with a goal, optional time window, and an '
      + 'optional initial selection of backlog tasks (they become its sprint backlog, column todo).',
    parameters: {
      goal: { type: 'string', required: true, description: 'The sprint goal.' },
      releaseId: { type: 'string', description: 'Release this sprint advances (rel-N); shown in every view.' },
      startDate: { type: 'string', description: 'ISO date.' },
      endDate: { type: 'string', description: 'ISO date.' },
      taskIds: {
        type: 'array',
        description: 'Backlog task ids selected into the sprint.',
        items: { type: 'string' },
      },
    },
    output: TEXT_OUTPUT,
    async execute(args) {
      const sprint = await scrum().planSprint(args)
      const selected = args.taskIds === undefined || args.taskIds.length === 0
        ? '' : ` with ${args.taskIds.length} task(s)`
      const linked = sprint.releaseId === undefined ? '' : ` for ${sprint.releaseId}`
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
    async execute(args) {
      const task = await scrum().assignTask(args.sprintId, args.taskId, args.direction as 'add' | 'remove')
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
    async execute(args) {
      const sprint = await scrum().startSprint(args.sprintId)
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
    async execute(args) {
      const { sprint, returnedToBacklog } = await scrum().endSprint(args.sprintId)
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
    execute(args) {
      return Promise.resolve({ text: formatSprintStatus(scrum().sprintStatus(args.sprintId), scrum().releaseNames()) })
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
    async execute(args) {
      const task = await scrum().moveTask(args.taskId, args.column)
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
    async execute(args) {
      const ceremony = await scrum().recordCeremony({
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
    execute(args) {
      return Promise.resolve({ text: formatCeremonies(scrum().ceremonies(args.sprintId)) })
    },
    presentCall: () => ({ card: 'generic', title: 'List ceremonies', kind: 'read' }),
  }))
}
