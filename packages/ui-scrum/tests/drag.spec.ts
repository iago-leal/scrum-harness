/**
 * The draggable work item form (comp-56): the numbers behind the drag —
 * `clampPlacement` keeps the dialog reachable (horizontally at least `margin`
 * px visible, vertically wholly inside the viewport, because the dialog's
 * scroll is internal and the footer would be lost) and `dragMove` always
 * derives the position from the drag origin, never accumulating.
 * Written BEFORE the implementation (TDD); pure module, no React, no DOM.
 */
import { describe, expect, it } from 'vitest'
import { clampPlacement, dragMove } from '../src/client/drag.ts'

const viewport = { width: 1600, height: 900 }
const size = { width: 660, height: 500 }

describe('clampPlacement (R2 / R4)', () => {
  it('returns the same reference when the placement already fits', () => {
    const p = { left: 400, top: 100 }
    expect(clampPlacement(p, size, viewport)).toBe(p)
  })

  it('keeps 24px visible on the right', () => {
    expect(clampPlacement({ left: 1700, top: 100 }, size, viewport)).toEqual({ left: 1576, top: 100 })
  })

  it('keeps 24px visible on the left', () => {
    expect(clampPlacement({ left: -900, top: 100 }, size, viewport)).toEqual({ left: -636, top: 100 })
  })

  it('never goes above the viewport', () => {
    expect(clampPlacement({ left: 400, top: -50 }, size, viewport)).toEqual({ left: 400, top: 0 })
  })

  it('never lets the dialog leave the bottom (the footer stays reachable)', () => {
    expect(clampPlacement({ left: 400, top: 800 }, size, viewport)).toEqual({ left: 400, top: 400 })
  })

  it('pins a dialog taller than the viewport to the top', () => {
    expect(clampPlacement({ left: 400, top: 300 }, { width: 660, height: 1200 }, viewport)).toEqual({ left: 400, top: 0 })
  })

  it('still has a valid horizontal range for a dialog wider than the viewport', () => {
    const wide = { width: 1000, height: 500 }
    const narrow = { width: 700, height: 900 }
    expect(clampPlacement({ left: -2000, top: 0 }, wide, narrow)).toEqual({ left: -976, top: 0 })
    expect(clampPlacement({ left: 2000, top: 0 }, wide, narrow)).toEqual({ left: 676, top: 0 })
  })

  it('lets lo win when a custom margin inverts the range', () => {
    expect(clampPlacement({ left: 300, top: 0 }, { width: 100, height: 100 }, { width: 700, height: 900 }, 500)).toEqual({ left: 400, top: 0 })
  })

  it('honours a custom margin', () => {
    expect(clampPlacement({ left: 1700, top: 100 }, size, viewport, 100)).toEqual({ left: 1500, top: 100 })
  })
})

describe('dragMove (R4)', () => {
  const origin = { left: 470, top: 200 }
  const start = { x: 600, y: 220 }

  it('adds the pointer delta to the origin', () => {
    expect(dragMove(origin, start, { x: 300, y: 250 }, size, viewport)).toEqual({ left: 170, top: 230 })
  })

  it('never accumulates: two moves are both measured against the origin', () => {
    const first = dragMove(origin, start, { x: 500, y: 220 }, size, viewport)
    const second = dragMove(origin, start, { x: 500, y: 220 }, size, viewport)
    expect(first).toEqual({ left: 370, top: 200 })
    expect(second).toEqual(first)
  })

  it('clamps a move past the edge', () => {
    expect(dragMove(origin, start, { x: 5000, y: 5000 }, size, viewport)).toEqual({ left: 1576, top: 400 })
  })
})
