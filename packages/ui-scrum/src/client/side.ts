/**
 * The side-column switch (comp-55): pure decisions behind "SCRUM in the
 * AppFrame details column". A page-level external store (`createSwitch`,
 * the exact `subscribe/getSnapshot` pair `useSyncExternalStore` wants), the
 * gesture machine (`nextSideAction` / `applySideAction`), the registration
 * rule (`shouldRegister`), the poll gate by rendered width (`pollGate`) and
 * the page theme (`readTheme`). No React, no DOM: index.ts composes the
 * executor with ctx.layout / ctx.slots, the components only call.
 * @module @scrum-harness/ui/client/side
 */

import type { ScrumTheme } from './store.ts'

/** The subset of Storage the switch touches (localStorage or a test double). */
export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Persistence seat of a switch: seeded by `parse`, written by `print`. */
export interface Persist<T> {
  key: string
  storage: StorageLike | null
  parse: (raw: string | null) => T
  print: (value: T) => string
}

/** A minimal external store: same reference until `set`, notify on change. */
export interface Switch<T> {
  get(): T
  set(value: T): void
  subscribe(fn: () => void): () => void
}

/**
 * Create a page-level switch. `set` with an `Object.is`-equal value is a
 * no-op (no notify); notify iterates a copy of the listeners, so subscribing
 * or unsubscribing during a notification is safe; the storage is best-effort
 * (a throwing storage never loses the in-memory value).
 * @param initial - value when there is no persisted one.
 * @param opts - optional persistence seat.
 * @returns the switch.
 */
export function createSwitch<T>(initial: T, opts?: { persist?: Persist<T> }): Switch<T> {
  const persist = opts?.persist
  let value = initial
  if (persist?.storage) {
    try { value = persist.parse(persist.storage.getItem(persist.key)) } catch { value = initial }
  }
  const listeners = new Set<() => void>()
  return {
    get: () => value,
    set: (next) => {
      if (Object.is(next, value)) return
      value = next
      if (persist?.storage) {
        try { persist.storage.setItem(persist.key, persist.print(next)) } catch { /* keep the in-memory value */ }
      }
      for (const fn of [...listeners]) fn()
    },
    subscribe: (fn) => {
      listeners.add(fn)
      return () => { listeners.delete(fn) }
    },
  }
}

/** Side-column state: `on` is the user's switch, `visible` is the observer's truth. */
export interface SideState {
  on: boolean
  visible: boolean
}

/** The three gestures. */
export type SideAction = 'open' | 'reopen' | 'close'

/**
 * Decide the gesture a toggle click makes (R5): off → open (the transient
 * "closing" state included), on but hidden → reopen, on and shown → close.
 * @param state - current side state.
 * @returns the action.
 */
export function nextSideAction(state: SideState): SideAction {
  if (!state.on) return 'open'
  return state.visible ? 'close' : 'reopen'
}

/**
 * State after an action. Only `on` moves here — `visible` belongs to the
 * ResizeObserver (R4). Returns the same reference when nothing changes, so
 * `Switch.set` does not notify.
 * @param state - current state.
 * @param action - the gesture.
 * @returns the next state.
 */
export function applySideAction(state: SideState, action: SideAction): SideState {
  if (action === 'open') return state.on ? state : { on: true, visible: state.visible }
  if (action === 'close') return state.on ? { on: false, visible: state.visible } : state
  return state
}

/**
 * Whether the details registration must exist (R1): while on, or while the
 * column is still visible after a close (so the tool DetailsPanel does not
 * flash during the closing transition).
 * @param state - current state.
 * @returns true to register, false to dispose.
 */
export function shouldRegister(state: SideState): boolean {
  return state.on || state.visible
}

/** Titles of the three gestures, keyed by what the click will do (R6). */
const TITLES: Record<SideAction, string> = {
  open: 'Abrir ao lado',
  reopen: 'Reabrir a coluna',
  close: 'Fechar a coluna lateral',
}

/**
 * The `title` of a toggle in a given state.
 * @param state - current state.
 * @returns the title text.
 */
export function sideTitle(state: SideState): string {
  return TITLES[nextSideAction(state)]
}

/** Where the panel is mounted. */
export type PanelMode = 'tab' | 'side'

/**
 * Whether the panel should fetch and poll (R4): always in the tab (the ring
 * mounts only the active view), only at a positive rendered width in the
 * column (closed = mounted at 0px).
 * @param mode - mount point.
 * @param width - observed width in px (column only).
 * @returns true to poll.
 */
export function pollGate(mode: PanelMode, width: number): boolean {
  return mode === 'tab' || width > 0
}

/** localStorage key persisting the chosen theme (same value since v0.10). */
export const THEME_KEY = 'scrum-theme'

/**
 * Read the persisted theme (R3): dark only for the exact value; a missing,
 * unavailable or throwing storage reads light.
 * @param storage - localStorage or null.
 * @returns the theme.
 */
export function readTheme(storage: StorageLike | null): ScrumTheme {
  try {
    return storage?.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light'
  } catch {
    return 'light'
  }
}
