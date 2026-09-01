/**
 * HTTP JSON surface of the SCRUM board, registered on the harness webserver:
 * `GET /scrum-api/state` answers the whole current state; `POST
 * /scrum-api/action` runs one validated mutation through `ctx.scrum` and
 * answers the fresh state in the same response. Since v0.5 both routes are
 * per-workspace: the client sends the workspace path (`?workspace=` on GET,
 * `workspace` field on POST) and the request resolves that workspace's
 * board — absent workspace falls back to the global board. Mutating
 * requests must declare `application/json` (cross-site "simple" requests
 * cannot, so they are refused with 415 before dispatch, mirroring the
 * `/api` posture).
 * @module @scrum-harness/scrum-api
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
// Type-only: resolves ctx.webServer for the inject declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BOARD_COLUMNS, CEREMONY_TYPES, ScrumError } from '@scrum-harness/domain'
// Type-only: resolves ctx.scrum.
import type { ScrumBoard, ShelfLists } from '@scrum-harness/domain'

export const name = 'scrum-api'
export const inject = ['webServer', 'scrum']

/** Largest accepted action body, in bytes. */
const MAX_BODY_BYTES = 262_144

/** One mutation envelope: the action name plus its payload. */
const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('createRelease'), name: z.string().min(1), description: z.string().optional(), targetDate: z.string().optional() }),
  z.object({ action: z.literal('createFeature'), releaseId: z.string(), title: z.string().min(1), description: z.string().optional() }),
  z.object({ action: z.literal('createComponent'), featureId: z.string(), title: z.string().min(1), description: z.string().optional() }),
  z.object({ action: z.literal('createTask'), componentId: z.string(), title: z.string().min(1), description: z.string().optional(), estimate: z.number().nonnegative().optional() }),
  z.object({ action: z.literal('updateItem'), id: z.string(), title: z.string().optional(), description: z.string().optional(), estimate: z.number().nonnegative().optional(), targetDate: z.string().optional(), status: z.string().optional(), goal: z.string().optional(), releaseId: z.string().optional(), releaseIds: z.array(z.string()).optional(), wipLimits: z.record(z.string(), z.number()).optional() }),
  z.object({ action: z.literal('deleteItem'), id: z.string(), cascade: z.boolean().optional() }),
  z.object({ action: z.literal('planSprint'), goal: z.string().min(1), releaseId: z.string().optional(), releaseIds: z.array(z.string()).optional(), startDate: z.string().optional(), endDate: z.string().optional(), taskIds: z.array(z.string()).optional() }),
  z.object({ action: z.literal('assignTask'), sprintId: z.string(), taskId: z.string(), direction: z.enum(['add', 'remove']) }),
  z.object({ action: z.literal('startSprint'), sprintId: z.string() }),
  z.object({ action: z.literal('endSprint'), sprintId: z.string().optional() }),
  z.object({ action: z.literal('moveTask'), taskId: z.string(), column: z.enum(BOARD_COLUMNS) }),
  z.object({
    action: z.literal('recordCeremony'),
    type: z.enum(CEREMONY_TYPES),
    sprintId: z.string().optional(),
    author: z.string().optional(),
    notes: z.array(z.object({ category: z.string().min(1), text: z.string().min(1) })).min(1),
  }),
  z.object({ action: z.literal('restoreItem'), id: z.string() }),
  z.object({ action: z.literal('purgeItem'), id: z.string() }),
  z.object({ action: z.literal('emptyTrash') }),
  z.object({ action: z.literal('archiveItem'), id: z.string() }),
  z.object({ action: z.literal('unarchiveItem'), id: z.string() }),
  z.object({ action: z.literal('archiveCompleted') }),
])
type Action = z.infer<typeof actionSchema>

/**
 * Register the `/scrum-api/` prefix route.
 * @param ctx - registrant context carrying the webserver and scrum service.
 */
export function apply(ctx: Context): void {
  /** Flatten one shelf (trash or archive) into wire items, newest first. */
  const shelfItems = (lists: ShelfLists, field: 'deletedAt' | 'archivedAt') => [
    ...lists.releases.map(r => ({ id: r.id, kind: 'release' as const, title: r.name, at: r[field] ?? '', status: r.status })),
    ...lists.features.map(f => ({ id: f.id, kind: 'feature' as const, title: f.title, parentId: f.releaseId, at: f[field] ?? '', status: f.status })),
    ...lists.components.map(c => ({ id: c.id, kind: 'component' as const, title: c.title, parentId: c.featureId, at: c[field] ?? '', status: c.status })),
    ...lists.tasks.map(t => ({
      id: t.id, kind: 'task' as const, title: t.title, parentId: t.componentId, at: t[field] ?? '',
      status: t.status, ...t.estimate === undefined ? {} : { estimate: t.estimate },
    })),
  ].sort((a, b) => b.at.localeCompare(a.at))

  /**
   * Per-sprint metrics for the charts: burndown totals plus a slim task list
   * (estimate/status/doneAt). Sourced from `sprintStatus`, which — unlike the
   * live tree — keeps counting archived done tasks of historical sprints.
   */
  const sprintStats = (board: ScrumBoard) => board.sprints().map((sprint) => {
    const status = board.sprintStatus(sprint.id)
    return {
      sprintId: sprint.id,
      totals: status.totals,
      tasks: status.tasks.map(task => ({
        status: task.status,
        ...task.estimate === undefined ? {} : { estimate: task.estimate },
        ...task.doneAt === undefined ? {} : { doneAt: task.doneAt },
      })),
    }
  })

  /** The whole current state of one board, as one JSON-ready value. */
  const state = (board: ScrumBoard) => ({
    tree: board.tree(),
    sprints: board.sprints(),
    ceremonies: board.ceremonies(),
    activeSprintId: board.activeSprint()?.id ?? null,
    trash: shelfItems(board.trash(), 'deletedAt'),
    archive: shelfItems(board.archive(), 'archivedAt'),
    stats: sprintStats(board),
  })

  /** Run one validated action against one board. */
  const dispatch = async (board: ScrumBoard, input: Action): Promise<unknown> => {
    switch (input.action) {
      case 'createRelease': return board.createRelease(input)
      case 'createFeature': return board.createFeature(input)
      case 'createComponent': return board.createComponent(input)
      case 'createTask': return board.createTask(input)
      case 'updateItem': return board.updateItem(input.id, input)
      case 'deleteItem': return board.deleteItem(input.id, input.cascade ?? false)
      case 'planSprint': return board.planSprint(input)
      case 'assignTask': return board.assignTask(input.sprintId, input.taskId, input.direction)
      case 'startSprint': return board.startSprint(input.sprintId)
      case 'endSprint': return board.endSprint(input.sprintId)
      case 'moveTask': return board.moveTask(input.taskId, input.column)
      case 'recordCeremony': return board.recordCeremony(input)
      case 'restoreItem': return board.restoreItem(input.id)
      case 'purgeItem': return board.purgeItem(input.id)
      case 'emptyTrash': return board.emptyTrash()
      case 'archiveItem': return board.archiveItem(input.id)
      case 'unarchiveItem': return board.unarchiveItem(input.id)
      case 'archiveCompleted': return board.archiveCompleted()
    }
  }

  const json = (res: ServerResponse, status: number, body: unknown): void => {
    const payload = JSON.stringify(body)
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
    res.end(payload)
  }

  const readBody = (req: IncomingMessage): Promise<string> => new Promise((resolve, reject) => {
    let size = 0
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > MAX_BODY_BYTES) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })

  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: '/scrum-api',
    handler: async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://localhost')
      if (req.method === 'GET' && url.pathname === '/scrum-api/state') {
        const workspace = url.searchParams.get('workspace') ?? undefined
        const board = await ctx.scrum.board(workspace)
        json(res, 200, { ok: true, state: state(board) })
        return
      }
      if (req.method === 'POST' && url.pathname === '/scrum-api/action') {
        const contentType = req.headers['content-type'] ?? ''
        if (!contentType.toLowerCase().startsWith('application/json')) {
          json(res, 415, { ok: false, code: 'unsupported-media-type', message: 'application/json required' })
          return
        }
        let parsed: unknown
        try {
          parsed = JSON.parse(await readBody(req))
        } catch (error) {
          json(res, 400, { ok: false, code: 'bad-json', message: error instanceof Error ? error.message : 'unreadable body' })
          return
        }
        const action = actionSchema.safeParse(parsed)
        if (!action.success) {
          json(res, 400, { ok: false, code: 'bad-action', message: action.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join('; ') })
          return
        }
        // Workspace rides beside the action envelope (schema strips it).
        const workspace = typeof parsed === 'object' && parsed !== null && typeof (parsed as { workspace?: unknown }).workspace === 'string'
          ? (parsed as { workspace: string }).workspace
          : undefined
        const board = await ctx.scrum.board(workspace)
        try {
          const result = await dispatch(board, action.data)
          json(res, 200, { ok: true, result, state: state(board) })
        } catch (error) {
          if (error instanceof ScrumError) {
            const status = error.code === 'not-found' ? 404 : 409
            json(res, status, { ok: false, code: error.code, message: error.message })
            return
          }
          throw error
        }
        return
      }
      json(res, 404, { ok: false, code: 'no-such-route', message: `${req.method ?? '?'} ${url.pathname}` })
    },
  }), 'scrum-api: route registration')
}
