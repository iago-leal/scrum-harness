/**
 * Off-screen notice for the moments the agent depends on the human: a pending
 * approval, a question, or the end of a turn. A macOS banner with a system
 * sound, fired only for the live root session and only once per reason every
 * two seconds.
 *
 * The package keeps the house's split: a pure Model that decides
 * (`./model.ts`), an injectable effect that renders (`./notifier.ts`), and a
 * plugin that only translates between them (`./plugin.ts`).
 * @module @scrum-harness/notify-scrum
 */

export {
  ASKING_TOOLS,
  DEDUP_WINDOW_MS,
  FIELD_CAP,
  NON_NOTIFYING_TURN_END,
  REASON_SOUND,
  REASON_SUBTITLE,
  TITLE,
  decide,
} from './model.ts'
export type { NotifyConfig, NotifyContext, NotifyPlan, NotifyReason } from './model.ts'

export { MacNotifier, OSASCRIPT, PROGRAM, SilentNotifier, createNotifier, sanitize } from './notifier.ts'
export type { MacNotifierOptions, Notifier, SpawnFn } from './notifier.ts'

export {
  apply,
  createSessionDisposedListener,
  createSessionEventListener,
  inject,
  name,
  normalizeConfig,
} from './plugin.ts'
export type { ApplyOptions, FiredWindow, ListenerDeps } from './plugin.ts'
