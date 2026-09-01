/**
 * HTTP JSON surface of the SCRUM board, registered on the harness webserver:
 * `GET /scrum-api/state` answers the whole current state; `POST
 * /scrum-api/action` runs one validated mutation through `ctx.scrum` and
 * answers the fresh state in the same response. Mutating requests must
 * declare `application/json` (cross-site "simple" requests cannot, so they
 * are refused with 415 before dispatch, mirroring the `/api` posture).
 * @module @scrum-harness/scrum-api
 */

import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
// Type-only: resolves ctx.webServer for the inject declaration.
import type {} from '@deepseek-ai/dsh-host-webserver'
import { BOARD_COLUMNS, CEREMONY_TYPES, ScrumError } from '@scrum-harness/domain'
// Type-only: resolves ctx.scrum.
import type {} from '@scrum-harness/domain'

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
  z.object({ action: z.literal('updateItem'), id: z.string(), title: z.string().optional(), description: z.string().optional(), estimate: z.number().nonnegative().optional(), targetDate: z.string().optional(), status: z.string().optional(), goal: z.string().optional(), releaseId: z.string().optional() }),
  z.object({ action: z.literal('deleteItem'), id: z.string(), cascade: z.boolean().optional() }),
  z.object({ action: z.literal('planSprint'), goal: z.string().min(1), releaseId: z.string().optional(), startDate: z.string().optional(), endDate: z.string().optional(), taskIds: z.array(z.string()).optional() }),
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
])
type Action = z.infer<typeof actionSchema>

/**
 * Register the `/scrum-api/` prefix route.
 * @param ctx - registrant context carrying the webserver and scrum service.
 */
export function apply(ctx: Context): void {
  /** The whole current state, as one JSON-ready value. */
  const state = () => ({
    tree: ctx.scrum.tree(),
    sprints: ctx.scrum.sprints(),
    ceremonies: ctx.scrum.ceremonies(),
    activeSprintId: ctx.scrum.activeSprint()?.id ?? null,
  })

  /** Run one validated action against the service. */
  const dispatch = async (input: Action): Promise<unknown> => {
    switch (input.action) {
      case 'createRelease': return ctx.scrum.createRelease(input)
      case 'createFeature': return ctx.scrum.createFeature(input)
      case 'createComponent': return ctx.scrum.createComponent(input)
      case 'createTask': return ctx.scrum.createTask(input)
      case 'updateItem': return ctx.scrum.updateItem(input.id, input)
      case 'deleteItem': return ctx.scrum.deleteItem(input.id, input.cascade ?? false)
      case 'planSprint': return ctx.scrum.planSprint(input)
      case 'assignTask': return ctx.scrum.assignTask(input.sprintId, input.taskId, input.direction)
      case 'startSprint': return ctx.scrum.startSprint(input.sprintId)
      case 'endSprint': return ctx.scrum.endSprint(input.sprintId)
      case 'moveTask': return ctx.scrum.moveTask(input.taskId, input.column)
      case 'recordCeremony': return ctx.scrum.recordCeremony(input)
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
        json(res, 200, { ok: true, state: state() })
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
        try {
          const result = await dispatch(action.data)
          json(res, 200, { ok: true, result, state: state() })
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
