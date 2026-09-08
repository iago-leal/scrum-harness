/**
 * The Controller: it owns no rule. It translates a session event into the
 * {@link NotifyContext} the Model needs — is this the live root, what is this
 * session called, what time is it, what has already fired — asks {@link decide},
 * and hands whatever comes back to the {@link Notifier}. Which events notify,
 * with what sound and under what quiet window are all decided in the Model.
 * @module @scrum-harness/notify-scrum/plugin
 */

import type { Context } from '@deepseek-ai/cordis'
import type { Session, SessionEvent } from '@deepseek-ai/dsh-session'
// A runtime value: the pure fold that reads the title out of a session's own
// events, so no optional service has to be injected for it.
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title'
import { decide } from './model.ts'
import type { NotifyConfig, NotifyReason } from './model.ts'
import { createNotifier } from './notifier.ts'
import type { Notifier } from './notifier.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'notify-scrum'

/**
 * The agent registry owns the root bridge. Neither peer dependency is an
 * inject entry: `dsh-user-approval` is type-only, and `dsh-session-title`
 * contributes a pure function, not a service.
 */
export const inject = ['agents']

/** Reason → epoch ms of the last notice fired, per session. */
export type FiredWindow = Map<string, Partial<Record<NotifyReason, number>>>

/** What the session-event listener needs to do its translation. */
export interface ListenerDeps {
  /** The live agent registry: the bridge from session id to runtime root. */
  agents: { get(id: string): unknown; roots(): unknown[] }
  /** Where a decided plan goes. */
  notifier: Notifier
  /** Epoch milliseconds; injected so tests advance time without sleeping. */
  clock: () => number
  /** The quiet-window bookkeeping, owned here and read by the Model. */
  window: FiredWindow
  /** The plugin's configuration. */
  config: NotifyConfig
}

/**
 * Decide whether a session is the live runtime root — the same bridge
 * `ctx.userQuestions.ask()` uses. Durable lineage does not settle this: a fork
 * resumed as a runtime root notifies normally.
 * @param agents - the live agent registry.
 * @param sessionId - the session's id.
 * @returns true only when a live agent with that id is a root.
 */
function isRootSession(agents: ListenerDeps['agents'], sessionId: string): boolean {
  const agent = agents.get(sessionId)
  if (agent === undefined || agent === null) return false
  return agents.roots().includes(agent)
}

/**
 * Read the session's title from its own events. Absent is the normal case:
 * the title is produced asynchronously by an LLM, so a session's first notice
 * usually falls through to the cwd or the id.
 * @param session - the session whose log to fold.
 * @returns the title, or undefined.
 */
function titleOf(session: Session): string | undefined {
  try {
    return foldSessionTitle(session.events)?.title
  } catch {
    return undefined
  }
}

/**
 * Build the `session/event` listener. Exported as a factory so the tests can
 * drive it directly with stub payloads and an in-memory notifier — no noise,
 * no process, no harness.
 * @param deps - the registry, the effect, the clock and the window.
 * @returns the listener.
 */
export function createSessionEventListener(deps: ListenerDeps) {
  return (session: Session, event: SessionEvent): void => {
    try {
      const sessionId = String(session.id)
      const now = deps.clock()
      const plan = decide(event, {
        now,
        isRoot: isRootSession(deps.agents, sessionId),
        sessionId,
        sessionTitle: titleOf(session),
        cwd: session.header?.cwd,
        config: deps.config,
        lastFiredAt: deps.window.get(sessionId) ?? {},
      })
      if (plan === null) return
      // Record before firing: the window must close even if the effect is slow
      // to be observed, and `notify` itself never throws.
      const fired = deps.window.get(sessionId) ?? {}
      fired[plan.reason] = now
      deps.window.set(sessionId, fired)
      deps.notifier.notify(plan)
    } catch {
      // A notice is never worth disturbing a turn.
    }
  }
}

/**
 * Build the `session/disposed` listener: the only guard against the window
 * map growing without bound, since a session id is a string and cannot be a
 * WeakMap key.
 * @param deps - the window to prune.
 * @returns the listener.
 */
export function createSessionDisposedListener(deps: { window: FiredWindow }) {
  return (session: Session): void => {
    try {
      deps.window.delete(String(session.id))
    } catch {
      // Nothing to recover: an unpruned entry is a leak, not a failure.
    }
  }
}

/**
 * Read the configuration defensively. It arrives from `cordis.patch.yml` and
 * escapes the closed types, so a malformed value must be ignored rather than
 * stop the plugin from loading.
 * @param raw - whatever was configured.
 * @returns a usable configuration.
 */
export function normalizeConfig(raw: unknown): NotifyConfig {
  if (typeof raw !== 'object' || raw === null) return {}
  const source = raw as { enabled?: unknown; reasons?: unknown }
  const config: NotifyConfig = {}
  if (typeof source.enabled === 'boolean') config.enabled = source.enabled
  if (Array.isArray(source.reasons)) {
    config.reasons = source.reasons.filter((entry): entry is string => typeof entry === 'string')
  }
  return config
}

/** Construction seams; the defaults are the real system. */
export interface ApplyOptions extends Partial<NotifyConfig> {
  notifier?: Notifier
  clock?: () => number
}

/**
 * Register the two listeners. Both are disposed with the context.
 * @param ctx - the plugin context, carrying `ctx.agents`.
 * @param config - optional configuration from the bundle.
 */
export function apply(ctx: Context, config: ApplyOptions = {}): void {
  const window: FiredWindow = new Map()
  const deps: ListenerDeps = {
    agents: (ctx as unknown as { agents: ListenerDeps['agents'] }).agents,
    notifier: config.notifier ?? createNotifier(),
    clock: config.clock ?? Date.now,
    window,
    config: normalizeConfig(config),
  }
  ctx.on('session/event', createSessionEventListener(deps))
  ctx.on('session/disposed', createSessionDisposedListener({ window }))
}
