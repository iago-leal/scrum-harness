/**
 * Board-aware agent context (the "live board" discipline, automated). At the
 * FIRST step of each agent turn this plugin resolves the calling session's
 * SCRUM board (workspace cwd → per-workspace domain) and, when that board
 * has an ACTIVE sprint whose snapshot changed since the last injection,
 * appends one durable, source-attributed context message: the sprint's
 * columns, the parents' explicit states, and the instruction to keep them
 * updated while working. Follows the `time-context` pre-step pattern.
 * @module @scrum-harness/context-scrum
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Agent, PreStepDecision } from '@deepseek-ai/dsh-agent'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import { renderSprintContext } from './snapshot.ts'
// Type-only: resolves ctx.scrum for the inject declaration.
import type {} from '@scrum-harness/domain'

export { renderSprintContext } from './snapshot.ts'

/** Cordis plugin name used by loader diagnostics and message sources. */
export const name = 'context-scrum'

/** The agent registry owns pre-step processing; scrum owns the boards. */
export const inject = ['agents', 'scrum']

/** The pre-step payload subset this plugin reads. */
export interface PreStepView {
  agent: Agent
  step: number
  signal: AbortSignal
}

/**
 * Build the pre-step decision wrapper. Exported for direct testing: the
 * listener is pure over (payload, next) plus the scrum service on `ctx`.
 * @param ctx - plugin context carrying `ctx.scrum`.
 * @returns the waterfall listener.
 */
export function createPreStepListener(ctx: Context) {
  /** Last injected snapshot per live agent (weak: agents come and go). */
  const lastInjected = new WeakMap<Agent, string>()

  return async (
    { agent, step, signal }: PreStepView,
    next: () => Promise<PreStepDecision>,
  ): Promise<PreStepDecision> => {
    const decision = await next()
    if (decision.kind === 'reject' || signal.aborted) return decision
    // First step of the turn only: one snapshot per turn at most.
    if (step !== 1) return decision
    const board = await ctx.scrum.board(agent.session.header.cwd)
    const text = renderSprintContext(board)
    if (text === null) return decision
    // Same snapshot as last time → nothing new to say.
    if (lastInjected.get(agent) === text) return decision
    lastInjected.set(agent, text)
    return {
      kind: 'enter',
      messages: [
        ...decision.messages,
        createUserMessage({
          content: [{ type: 'text', text }],
          source: { kind: 'plugin', plugin: name, form: 'snapshot', sections: [{ name, text }] },
        }),
      ],
    }
  }
}

/**
 * Register the pre-step listener.
 * @param ctx - plugin context; the listener is disposed with it.
 */
export function apply(ctx: Context): void {
  ctx.on('agent/pre-step', createPreStepListener(ctx), { prepend: true })
}
