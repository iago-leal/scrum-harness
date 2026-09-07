/**
 * Pure logic of the mermaid preview in the work item form (comp-44 R2/R3/R4/
 * R5/R8a): the fence grammar, the seed rule and the per-block render state
 * machine. No React, no DOM, no mermaid — `render` is injected, so
 * `tests/mermaid.spec.ts` drives everything with deferred promises in Node,
 * as `settle.spec.ts` does with `createSettler`.
 *
 * The one hard invariant lives here (R3): the artifact is NEVER rewritten by
 * the render path. `mermaidBlocks` only reads; `code` is the fenced lines
 * joined back byte for byte; nothing here ever produces text that flows back
 * into a draft. The ReviewContract digest and the `traces:` matrix the
 * design → tdd gate reads are byte-sensitive, and this module is the reason
 * they stay untouched while the preview exists.
 * @module @scrum-harness/ui/client/mermaid
 */

import type { ArtifactField } from './form.ts'

/** One fenced mermaid block, as found in an artifact's text. */
export interface Block {
  /** Position among the mermaid fences of the text, 0-based. */
  index: number
  /** The first non-empty line of the block, trimmed and whitespace-collapsed — the caption (`flowchart TD`). */
  kind: string
  /** The lines between the fences, joined with `\n`, untouched. */
  code: string
  /** First line of `code` in the text (0-based). */
  start: number
  /** Line index of the closing fence (exclusive end of `code`); the line count when unclosed. */
  end: number
}

/** The panel color theme, as the store carries it. */
export type Theme = 'light' | 'dark'

/** The render state of one block (R5: idle → loading → ready | error). */
export type BlockState =
  | { kind: 'loading' }
  | { kind: 'ready'; svg: string }
  | { kind: 'error'; message: string }

/** The failure of the engine itself (initialize), as opposed to one diagram's syntax (R5ii). */
export class EngineUnavailable extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'EngineUnavailable'
  }
}

/** What the renderer feeds: one state per block, and the availability notice of the faixa. */
export interface RenderSink {
  setState: (index: number, state: BlockState) => void
  /** The block at `index` left the text. */
  remove: (index: number) => void
  /** `null` clears the notice (retry); a string is the literal reason. */
  setUnavailable: (reason: string | null) => void
}

/** The injected render: engine.render bound — resolves to an svg string, rejects with the engine's error. */
export type RenderFn = (code: string, id: string, theme: Theme) => Promise<string>

/** The renderer of one form mount. */
export interface Renderer {
  /** The blocks of the current draft; repaints only what changed (text or theme). */
  update: (blocks: Block[], theme: Theme) => void
  /** Forget everything and repaint the last blocks (the "tentar de novo" button). */
  retry: () => void
  /** Nothing in flight touches the sink after this. */
  dispose: () => void
}

/** The opening fence of the declared subset: at line start, exactly three backticks, `mermaid`, trailing spaces tolerated. */
export const OPEN = /^```mermaid\s*$/

/**
 * Extract the mermaid fences of a text with the R3 grammar (the declared
 * subset: no indented fences, no 4+ backticks, no `~~~`, no attributes; a
 * ``` line inside a block closes it; an unclosed block runs to the end).
 * @param text - the artifact text, as typed.
 * @returns the blocks in document order; `[]` when there is none.
 */
export function mermaidBlocks(text: string): Block[] {
  if (text.length === 0) return []
  const lines = text.split('\n')
  const raw: { start: number; end: number }[] = []
  let open: number | null = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (open === null) {
      if (OPEN.test(line)) open = i + 1
      continue
    }
    if (line.startsWith('```')) {
      raw.push({ start: open, end: i })
      open = null
    }
  }
  if (open !== null) raw.push({ start: open, end: lines.length })
  return raw.map(({ start, end }, index) => {
    const body = lines.slice(start, end)
    const first = body.find(l => l.trim().length > 0) ?? ''
    return { index, kind: first.trim().replace(/\s+/g, ' '), code: body.join('\n'), start, end }
  })
}

/**
 * The seed of the preview toggle (R2): on for the design artifact when it has
 * blocks, off otherwise — independent of the phase.
 * @param field - the artifact.
 * @param hasBlocks - whether the current draft has at least one fence.
 * @returns the initial toggle value.
 */
export function previewByDefault(field: ArtifactField, hasBlocks: boolean): boolean {
  return field === 'design' && hasBlocks
}

/** The opening tag of the root svg (the first `<svg` of the string) and its attributes. */
const ROOT_SVG = /<svg\b([^>]*)>/
const VIEW_BOX = /\bviewBox\s*=\s*"([^"]*)"/

/**
 * The natural width of a rendered svg (R9): mermaid emits `width="100%"`
 * with `style="max-width: <W>px"`, so a diagram wider than the form is
 * scaled DOWN to fit — a 2 100 px class diagram becomes unreadable at 35%.
 * The view sets this width on the svg's wrapper, so the diagram shows at
 * 1:1 and the two-axis scroll container of the figure does the rest.
 * Reads the viewBox of the ROOT `<svg>` only; anything unreadable → null
 * (the css fallback — width 100% — stays).
 * @param svg - the svg string the engine resolved.
 * @returns the viewBox width in px, or null.
 */
export function svgNaturalWidth(svg: string): number | null {
  const root = ROOT_SVG.exec(svg)
  if (root === null) return null
  const box = VIEW_BOX.exec(root[1])
  if (box === null) return null
  const parts = box[1].trim().split(/[\s,]+/)
  if (parts.length !== 4) return null
  const width = Number(parts[2])
  return Number.isFinite(width) && width > 0 ? width : null
}

const messageOf = (error: unknown): string => error instanceof Error ? error.message : String(error)

/**
 * The per-block render machine of one form mount (R4/R5). Watermark PER
 * BLOCK: a result only paints if its ticket is still the current one of
 * that block (a sibling never discards another). Same text and same theme
 * never repaint (the 4s poll recreates `node`; strings do not change).
 * @param sink - where states and the availability notice go.
 * @param render - the injected engine render.
 * @param mount - the mount counter of the form, part of every block id (R6b).
 * @returns update / retry / dispose.
 */
export function createRenderer(sink: RenderSink, render: RenderFn, mount: number): Renderer {
  const tickets = new Map<number, number>()
  const last = new Map<number, { code: string; theme: Theme }>()
  let blocks: Block[] = []
  let theme: Theme = 'light'
  let disposed = false
  /** The engine failure already reported to the faixa (one notice per outage, not per block). */
  let unavailable: string | null = null

  const paint = (block: Block, current: Theme): void => {
    const ticket = (tickets.get(block.index) ?? 0) + 1
    tickets.set(block.index, ticket)
    last.set(block.index, { code: block.code, theme: current })
    sink.setState(block.index, { kind: 'loading' })
    const id = `scrum-mmd-${block.index}-${mount}`
    const stillMine = (): boolean => !disposed && tickets.get(block.index) === ticket
    let work: Promise<string>
    try {
      work = render(block.code, id, current)
    } catch (error) {
      work = Promise.reject(error)
    }
    void work.then(
      (svg) => { if (stillMine()) sink.setState(block.index, { kind: 'ready', svg }) },
      (error: unknown) => {
        if (!stillMine()) return
        if (error instanceof EngineUnavailable) {
          if (unavailable !== error.message) {
            unavailable = error.message
            sink.setUnavailable(error.message)
          }
          return
        }
        const message = messageOf(error)
        console.error(`[scrum-mmd] ${id}: ${message}`, error)
        sink.setState(block.index, { kind: 'error', message })
      },
    )
  }

  return {
    update(next, current) {
      if (disposed) return
      const seen = new Set<number>()
      for (const block of next) {
        seen.add(block.index)
        const previous = last.get(block.index)
        if (previous !== undefined && previous.code === block.code && previous.theme === current) continue
        paint(block, current)
      }
      for (const index of [...last.keys()]) {
        if (seen.has(index)) continue
        last.delete(index)
        tickets.delete(index)
        sink.remove(index)
      }
      blocks = next
      theme = current
    },
    retry() {
      if (disposed) return
      unavailable = null
      sink.setUnavailable(null)
      last.clear()
      for (const block of blocks) paint(block, theme)
    },
    dispose() {
      disposed = true
    },
  }
}
