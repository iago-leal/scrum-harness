/**
 * The side-column switch of comp-55 (SCRUM in the AppFrame details column):
 * a page-level external store (`createSwitch`, the `subscribe/getSnapshot`
 * pair of useSyncExternalStore), the gesture machine (`nextSideAction` /
 * `applySideAction`), the registration rule (`shouldRegister = on || visible`,
 * R1 — the registration outlives 'close' until the column is really at 0px),
 * the poll gate by rendered width (R4) and the page theme (R3).
 * Written BEFORE the implementation (TDD); pure module, no React, no DOM.
 */
import { describe, expect, it } from 'vitest'
import {
  applySideAction, createSwitch, nextSideAction, pollGate, readTheme, shouldRegister, sideTitle, THEME_KEY,
} from '../src/client/side.ts'
import type { SideState } from '../src/client/side.ts'

/** A minimal localStorage double; `throwOn` makes one method throw. */
function storage(seed: Record<string, string> = {}, throwOn?: 'getItem' | 'setItem') {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (key: string) => {
      if (throwOn === 'getItem') throw new Error('denied')
      return map.get(key) ?? null
    },
    setItem: (key: string, value: string) => {
      if (throwOn === 'setItem') throw new Error('quota')
      map.set(key, value)
    },
  }
}

describe('createSwitch (R8 / R3)', () => {
  it('starts at the initial value and hands out the same reference until set', () => {
    const initial = { on: false, visible: false }
    const sw = createSwitch(initial)
    expect(sw.get()).toBe(initial)
    expect(sw.get()).toBe(sw.get())
  })

  it('notifies every subscriber on set', () => {
    const sw = createSwitch(1)
    const seen: number[] = []
    sw.subscribe(() => { seen.push(sw.get()) })
    sw.subscribe(() => { seen.push(sw.get() * 10) })
    sw.set(2)
    expect(seen).toEqual([2, 20])
  })

  it('does not notify when set with the same value (Object.is)', () => {
    const value = { on: true, visible: true }
    const sw = createSwitch(value)
    let calls = 0
    sw.subscribe(() => { calls += 1 })
    sw.set(value)
    expect(calls).toBe(0)
    sw.set({ on: true, visible: true })
    expect(calls).toBe(1)
  })

  it('unsubscribes idempotently', () => {
    const sw = createSwitch(0)
    let calls = 0
    const off = sw.subscribe(() => { calls += 1 })
    off()
    off()
    sw.set(1)
    expect(calls).toBe(0)
  })

  it('tolerates subscribing and unsubscribing during a notify', () => {
    const sw = createSwitch(0)
    const seen: string[] = []
    let offB: () => void = () => {}
    sw.subscribe(() => {
      seen.push('a')
      offB()
      sw.subscribe(() => { seen.push('late') })
    })
    offB = sw.subscribe(() => { seen.push('b') })
    sw.set(1)
    // The notify iterated a copy: b was still called this round, late was not.
    expect(seen).toEqual(['a', 'b'])
    sw.set(2)
    expect(seen.filter(s => s === 'late').length).toBe(1)
  })

  it('persists through print/parse when a storage is given', () => {
    const store = storage({ [THEME_KEY]: 'dark' })
    const sw = createSwitch<'light' | 'dark'>('light', {
      persist: { key: THEME_KEY, storage: store, parse: raw => (raw === 'dark' ? 'dark' : 'light'), print: v => v },
    })
    expect(sw.get()).toBe('dark')
    sw.set('light')
    expect(store.map.get(THEME_KEY)).toBe('light')
  })

  it('keeps the in-memory value when the storage throws', () => {
    const throwing = storage({}, 'setItem')
    const sw = createSwitch<'light' | 'dark'>('light', {
      persist: { key: THEME_KEY, storage: throwing, parse: raw => (raw === 'dark' ? 'dark' : 'light'), print: v => v },
    })
    let calls = 0
    sw.subscribe(() => { calls += 1 })
    sw.set('dark')
    expect(sw.get()).toBe('dark')
    expect(calls).toBe(1)
    const reading = storage({}, 'getItem')
    expect(createSwitch<'light' | 'dark'>('light', {
      persist: { key: THEME_KEY, storage: reading, parse: () => 'dark', print: v => v },
    }).get()).toBe('light')
  })
})

describe('nextSideAction / applySideAction (R5 / R6)', () => {
  const off: SideState = { on: false, visible: false }
  const hidden: SideState = { on: true, visible: false }
  const shown: SideState = { on: true, visible: true }
  const closing: SideState = { on: false, visible: true }

  it('decides the gesture from the four states', () => {
    expect(nextSideAction(off)).toBe('open')
    expect(nextSideAction(hidden)).toBe('reopen')
    expect(nextSideAction(shown)).toBe('close')
    expect(nextSideAction(closing)).toBe('open')
  })

  it('open turns on and keeps visible', () => {
    expect(applySideAction(off, 'open')).toEqual({ on: true, visible: false })
    expect(applySideAction(closing, 'open')).toEqual({ on: true, visible: true })
  })

  it('close turns off and preserves visible (the observer owns it)', () => {
    expect(applySideAction(shown, 'close')).toEqual({ on: false, visible: true })
    expect(applySideAction(hidden, 'close')).toEqual({ on: false, visible: false })
  })

  it('returns the same reference when nothing changes', () => {
    expect(applySideAction(hidden, 'reopen')).toBe(hidden)
    expect(applySideAction(shown, 'reopen')).toBe(shown)
    expect(applySideAction(closing, 'close')).toBe(closing)
    expect(applySideAction(off, 'close')).toBe(off)
    expect(applySideAction(shown, 'open')).toBe(shown)
    expect(applySideAction(hidden, 'open')).toBe(hidden)
  })

  it('titles the gesture the click will make', () => {
    expect(sideTitle(off)).toBe('Abrir ao lado')
    expect(sideTitle(hidden)).toBe('Reabrir a coluna')
    expect(sideTitle(shown)).toBe('Fechar a coluna lateral')
  })
})

describe('shouldRegister and the lifecycle sequences (R1 / R4)', () => {
  it('registers while on or still visible', () => {
    expect(shouldRegister({ on: false, visible: false })).toBe(false)
    expect(shouldRegister({ on: true, visible: false })).toBe(true)
    expect(shouldRegister({ on: true, visible: true })).toBe(true)
    expect(shouldRegister({ on: false, visible: true })).toBe(true)
  })

  it('keeps the registration after close until the observer sees width 0', () => {
    let s = applySideAction({ on: false, visible: false }, 'open')
    expect(shouldRegister(s)).toBe(true)
    s = { on: s.on, visible: true } // observer: 360px
    s = applySideAction(s, 'close')
    expect(shouldRegister(s)).toBe(true)
    s = { on: s.on, visible: false } // observer: 0px
    expect(shouldRegister(s)).toBe(false)
  })

  it('after a cleanup the next gesture is reopen, never close', () => {
    let s = applySideAction({ on: false, visible: false }, 'open')
    s = { on: s.on, visible: true }
    s = { on: s.on, visible: false } // effect cleanup (unmount / session remount)
    expect(nextSideAction(s)).toBe('reopen')
    expect(shouldRegister(s)).toBe(true)
  })
})

describe('pollGate (R4)', () => {
  it('polls only at a positive rendered width (closed column = 0px = no poll)', () => {
    expect(pollGate(0)).toBe(false)
    expect(pollGate(-1)).toBe(false)
    expect(pollGate(1)).toBe(true)
    expect(pollGate(360)).toBe(true)
  })
})

describe('readTheme (R3)', () => {
  it('reads dark only for the exact value, light otherwise', () => {
    expect(readTheme(storage({ [THEME_KEY]: 'dark' }))).toBe('dark')
    expect(readTheme(storage({ [THEME_KEY]: 'light' }))).toBe('light')
    expect(readTheme(storage({}))).toBe('light')
    expect(readTheme(storage({ [THEME_KEY]: 'Dark' }))).toBe('light')
    expect(readTheme(null)).toBe('light')
    expect(readTheme(storage({}, 'getItem'))).toBe('light')
  })
})
