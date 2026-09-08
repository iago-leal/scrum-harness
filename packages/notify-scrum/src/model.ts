/**
 * The Model: which session event becomes an off-screen notice, and with what
 * content. Pure and total — no I/O, no clock, no environment. Every variable
 * input arrives in the {@link NotifyContext}, so the same (event, context)
 * pair always yields the same result and the tests drive it directly.
 * @module @scrum-harness/notify-scrum/model
 */

import type { SessionEvent } from '@deepseek-ai/dsh-session'
// Type-only: widens SessionEventMap with `approval/asked`. Without the plugin
// loaded the event simply never occurs; nothing here needs it at runtime.
import type {} from '@deepseek-ai/dsh-user-approval'

/** Why the human is being interrupted. */
export type NotifyReason = 'approval' | 'question' | 'turn-end'

/**
 * Tools that block the turn inside `ctx.userQuestions.ask()` waiting for a
 * human answer. A new blocking tool joins by one line here plus one test case.
 */
export const ASKING_TOOLS: ReadonlySet<string> = new Set([
  'ask_user_question',
  'exit_plan_mode',
])

/**
 * Turn-end reasons that must stay silent. A denylist, not an allowlist: any
 * reason kind added later (including one merged in by a plugin) notifies by
 * default, because the human did get the turn back. `interrupted` is written
 * by persistence repair when it closes a turn orphaned by a crash — no live
 * loop emits it, so reopening an old session must not make noise.
 */
export const NON_NOTIFYING_TURN_END: ReadonlySet<string> = new Set(['interrupted'])

/** Fixed banner title: which program is asking. */
export const TITLE = 'SCRUM Harness'

/** Human-language subtitle per reason. */
export const REASON_SUBTITLE: Readonly<Record<NotifyReason, string>> = {
  approval: 'aprovação pendente',
  question: 'pergunta ao humano',
  'turn-end': 'turno encerrado',
}

/**
 * macOS system sound per reason (`/System/Library/Sounds/<name>.aiff`).
 * `Glass` for the two states where the agent is blocked right now; `Tink` —
 * shorter, discreeter — for the end of a turn, so the ear alone tells them
 * apart. A name outside the system set does not fail the call: the banner
 * shows without sound (measured), so a wrong constant degrades to silence,
 * never to a lost notice.
 */
export const REASON_SOUND: Readonly<Record<NotifyReason, string>> = {
  approval: 'Glass',
  question: 'Glass',
  'turn-end': 'Tink',
}

/** Per-reason, per-session quiet window in milliseconds. */
export const DEDUP_WINDOW_MS = 2000

/** Display cap for every plan field, measured in code points. */
export const FIELD_CAP = 120

/** Optional plugin configuration, as it arrives from `cordis.patch.yml`. */
export interface NotifyConfig {
  /** `false` silences everything. Absent or `true` keeps the plugin live. */
  enabled?: boolean
  /**
   * Allowlist of live reasons. Absent enables all three; `[]` silences all
   * three. Unknown entries are ignored rather than rejected — this value
   * escapes the closed {@link NotifyReason} type on its way in from YAML.
   */
  reasons?: readonly string[]
}

/** Everything variable the decision needs, supplied by the caller. */
export interface NotifyContext {
  /** Epoch milliseconds, from the caller's clock — never read here. */
  now: number
  /** Whether this session is the live runtime root (see the plugin's bridge). */
  isRoot: boolean
  /** The session's id, used as the last fallback for the message. */
  sessionId: string
  /** The session's title when one exists — already resolved to a string. */
  sessionTitle?: string
  /** The session's working directory, when known. */
  cwd?: string
  /** The plugin's configuration. */
  config: NotifyConfig
  /** Reason → epoch ms of the last notice already fired for this session. */
  lastFiredAt: Partial<Record<NotifyReason, number>>
}

/** A decided notice, ready for the effect to render. */
export interface NotifyPlan {
  reason: NotifyReason
  title: string
  subtitle: string
  body: string
  sound: string
}

/**
 * Classify an event into the reason it notifies for, or `null` for the vast
 * majority that never do.
 * @param event - the session event.
 * @returns the reason, or `null` when this event is not a trigger.
 */
function classify(event: SessionEvent): NotifyReason | null {
  switch (event.type) {
    case 'approval/asked':
      return 'approval'
    case 'tool/call':
      return ASKING_TOOLS.has(event.data.name) ? 'question' : null
    case 'turn/end':
      return NON_NOTIFYING_TURN_END.has(event.data.reason.kind) ? null : 'turn-end'
    default:
      return null
  }
}

/**
 * Trim a field and cut it at {@link FIELD_CAP} code points, appending `…`.
 * Counting uses `Array.from` so an emoji costs one, not two.
 * @param text - the raw field.
 * @returns the display-safe field.
 */
function capField(text: string): string {
  const trimmed = text.trim()
  const points = Array.from(trimmed)
  if (points.length <= FIELD_CAP) return trimmed
  return `${points.slice(0, FIELD_CAP - 1).join('')}…`
}

/**
 * Identify which work the notice is about: the session title, else the
 * basename of the working directory, else the head of the session id. The
 * title is generated asynchronously by an LLM, so it is usually absent for a
 * session's first notice — the cascade is the normal path, not the exception.
 * @param context - the decision context.
 * @returns a non-empty identifying string.
 */
function describeSession(context: NotifyContext): string {
  const title = context.sessionTitle?.trim()
  if (title !== undefined && title !== '') return title
  const cwd = context.cwd?.trim()
  if (cwd !== undefined && cwd !== '') {
    const parts = cwd.split('/').filter((part) => part !== '')
    const base = parts[parts.length - 1]
    if (base !== undefined && base !== '') return base
  }
  return context.sessionId.slice(0, 8)
}

/**
 * Decide whether an event becomes a notice, and what it says.
 *
 * Total and pure: it performs no I/O, reads neither `Date.now()` nor
 * `process.env`, mutates none of its arguments and keeps no state between
 * calls. The cuts run in a fixed order — disabled, non-root, not a trigger,
 * reason not allowed, still inside the quiet window — and only then is a plan
 * built. Configuration is applied here, inside the one decision, rather than
 * short-circuiting ahead of it.
 * @param event - the session event to judge.
 * @param context - every variable input the decision needs.
 * @returns the plan to render, or `null` to stay silent.
 */
export function decide(event: SessionEvent, context: NotifyContext): NotifyPlan | null {
  if (context.config.enabled === false) return null
  if (!context.isRoot) return null

  const reason = classify(event)
  if (reason === null) return null

  const { reasons } = context.config
  if (reasons !== undefined && !reasons.includes(reason)) return null

  const last = context.lastFiredAt[reason]
  if (last !== undefined && context.now - last < DEDUP_WINDOW_MS) return null

  return {
    reason,
    title: capField(TITLE),
    subtitle: capField(REASON_SUBTITLE[reason]),
    body: capField(describeSession(context)),
    sound: REASON_SOUND[reason],
  }
}
