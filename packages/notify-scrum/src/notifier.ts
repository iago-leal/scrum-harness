/**
 * The View/effect: turning an already-decided {@link NotifyPlan} into a macOS
 * banner. It holds no rule — it does not choose the sound, does not filter and
 * does not deduplicate; the plan arrives complete. Its whole job is to reach
 * `osascript` without ever letting the notice text become code, and without
 * letting a failed notice disturb the session.
 * @module @scrum-harness/notify-scrum/notifier
 */

import { spawn } from 'node:child_process'
import type { NotifyPlan } from './model.ts'

/** The seam every notice passes through; the tests inject their own. */
export interface Notifier {
  /** Render the plan. Synchronous, and never throws. */
  notify(plan: NotifyPlan): void
}

/** Absolute path: never resolved through PATH. */
export const OSASCRIPT = '/usr/bin/osascript'

/**
 * The AppleScript, a module constant that interpolates nothing. Every field
 * arrives as an argument in `argv`, so text containing quotes, backslashes,
 * `$(...)`, backticks or newlines reaches the banner as data.
 *
 * `argv` is 1-based in AppleScript, and the four items are read in the order
 * the effect passes them: title, subtitle, body, sound.
 */
export const PROGRAM = [
  'on run argv',
  'display notification (item 3 of argv) with title (item 1 of argv) subtitle (item 2 of argv) sound name (item 4 of argv)',
  'end run',
].join('\n')

/** Injection seam for the tests: the shape of `child_process.spawn` we use. */
export type SpawnFn = (
  file: string,
  args: readonly string[],
  options: { detached: boolean; stdio: 'ignore' },
) => { on(event: 'error', listener: () => void): unknown; unref(): unknown }

/** Construction options; the defaults are the real system. */
export interface MacNotifierOptions {
  spawnFn?: SpawnFn
  platform?: string
}

/**
 * Strip C0 control characters. The NUL is the structural case: Node's
 * `child_process` rejects an argument containing one synchronously, before the
 * child exists (`ERR_INVALID_ARG_VALUE`), so `osascript` would never be
 * reached. The remaining C0 travel through `argv` intact and are removed here
 * purely as display hygiene.
 * @param text - a plan field.
 * @returns the field without control characters.
 */
export function sanitize(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001F\u007F]/g, '')
}

/**
 * The macOS notifier. Outside darwin it loads and stays silent (R10), so the
 * bundle is identical on every platform and no test needs the operating
 * system to run.
 */
export class MacNotifier implements Notifier {
  readonly #spawn: SpawnFn
  readonly #enabled: boolean

  /**
   * @param options - injection seams; defaults are the real spawn and platform.
   */
  constructor(options: MacNotifierOptions = {}) {
    this.#spawn = options.spawnFn ?? (spawn as unknown as SpawnFn)
    this.#enabled = (options.platform ?? process.platform) === 'darwin'
  }

  /**
   * Fire the banner. Detached, with no pipes and unreferenced, so nothing
   * holds the event loop; the child is never awaited and no exit code is read.
   *
   * `execFile` is forbidden here: it creates stdout/stderr pipes even with
   * `stdio: 'ignore'` (it must, for `maxBuffer`), and those keep the loop
   * alive regardless of `unref()`.
   * @param plan - the decided notice.
   */
  notify(plan: NotifyPlan): void {
    if (!this.#enabled) return
    try {
      const child = this.#spawn(
        OSASCRIPT,
        [
          '-e',
          PROGRAM,
          // Mandatory: without it a field starting with `-` is eaten as an
          // option and the whole call fails.
          '--',
          sanitize(plan.title),
          sanitize(plan.subtitle),
          sanitize(plan.body),
          sanitize(plan.sound),
        ],
        { detached: true, stdio: 'ignore' },
      )
      // Without this listener a missing binary becomes an uncaught exception
      // on the process, not a rejected promise we could ignore.
      child.on('error', () => {})
      child.unref()
    } catch {
      // A notice that cannot be delivered is not worth an aborted turn.
    }
  }
}

/** A notifier that does nothing — the safe fallback and the no-op platform. */
export class SilentNotifier implements Notifier {
  /** Ignore the plan. */
  notify(): void {}
}

/**
 * Build the production notifier, degrading to silence if construction throws:
 * a notifier that cannot be built must not stop the plugin from loading.
 * @param options - injection seams, forwarded to {@link MacNotifier}.
 * @returns a notifier that never throws.
 */
export function createNotifier(options: MacNotifierOptions = {}): Notifier {
  try {
    return new MacNotifier(options)
  } catch {
    return new SilentNotifier()
  }
}
