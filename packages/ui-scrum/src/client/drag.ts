/**
 * The numbers behind the draggable work item form (comp-56): a placement in
 * viewport px, clamped so the dialog stays reachable — horizontally at least
 * `margin` px remain visible ("out of the way" is sideways), vertically the
 * dialog never leaves the viewport (its scroll is internal: a footer below
 * the fold would be unreachable) — and a drag that is always measured
 * against its origin. Pure: no React, no DOM; the component only calls.
 * @module @scrum-harness/ui/client/drag
 */

/** Dialog position in viewport px (its top-left corner). */
export interface Placement {
  left: number
  top: number
}

/** A rendered box size in px. */
export interface Size {
  width: number
  height: number
}

/** A pointer position in viewport px. */
export interface Point {
  x: number
  y: number
}

/** Horizontal margin that must stay visible (px). */
export const DRAG_MARGIN = 24

/** `lo` wins when the range is inverted (only reachable with a custom margin). */
const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v))

/**
 * Clamp a placement into the viewport (R2). Returns the same reference when
 * nothing changes, so a render fed by it does not churn.
 * @param p - requested placement.
 * @param size - rendered dialog size.
 * @param viewport - viewport size (`documentElement.clientWidth/Height`).
 * @param margin - px of the dialog that must stay visible sideways.
 * @returns the clamped placement.
 */
export function clampPlacement(p: Placement, size: Size, viewport: Size, margin = DRAG_MARGIN): Placement {
  const left = clamp(p.left, margin - size.width, viewport.width - margin)
  const top = clamp(p.top, 0, Math.max(0, viewport.height - size.height))
  return left === p.left && top === p.top ? p : { left, top }
}

/**
 * Placement during a drag (R4): the origin plus the pointer delta since the
 * drag started, clamped — never accumulated across moves.
 * @param origin - dialog placement when the drag started.
 * @param start - pointer position when the drag started.
 * @param pointer - current pointer position.
 * @param size - dialog size measured at drag start.
 * @param viewport - viewport size measured at drag start.
 * @param margin - see clampPlacement.
 * @returns the placement to render.
 */
export function dragMove(origin: Placement, start: Point, pointer: Point, size: Size, viewport: Size, margin = DRAG_MARGIN): Placement {
  return clampPlacement({ left: origin.left + pointer.x - start.x, top: origin.top + pointer.y - start.y }, size, viewport, margin)
}
