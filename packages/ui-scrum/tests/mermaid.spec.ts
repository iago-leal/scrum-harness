/**
 * The pure half of the mermaid preview (comp-44 R2/R3/R4/R5/R8a): the fence
 * grammar, the seed rule and the per-block render state machine. Written
 * BEFORE the implementation (TDD); no React, no DOM, no mermaid — `render`
 * is injected and settled by the test through deferred promises, exactly as
 * `settle.spec.ts` drives `createSettler`.
 *
 * The corpus fixture (R1/R11) is a frozen snapshot of the board's designs:
 * the assertion is that `mermaidBlocks` reproduces every frozen block byte
 * for byte, never that the board still looks like that.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createRenderer, EngineUnavailable, mermaidBlocks, previewByDefault, svgNaturalWidth } from '../src/client/mermaid.ts'
import type { Block, BlockState, RenderFn, RenderSink } from '../src/client/mermaid.ts'

// ---------------------------------------------------------------- R3 grammar

describe('mermaidBlocks — the R3 fence grammar', () => {
  it('no fence → []', () => {
    expect(mermaidBlocks('')).toEqual([])
    expect(mermaidBlocks('## Design\n\nplain text\n')).toEqual([])
  })

  it('one fence: index 0, kind = first non-empty line trimmed, code byte for byte, start/end line indexes', () => {
    const text = '---\ntraces: []\n---\n## Design\n```mermaid\nflowchart TD\n  A --> B\n```\nafter\n'
    const [block, ...rest] = mermaidBlocks(text)
    expect(rest).toEqual([])
    expect(block).toEqual({ index: 0, kind: 'flowchart TD', code: 'flowchart TD\n  A --> B', start: 5, end: 7 })
  })

  it('N fences in document order with consecutive indexes', () => {
    const text = '```mermaid\nclassDiagram\n  class A\n```\n\ntext\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n```mermaid\nstateDiagram-v2\n  [*] --> S\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks.map(b => b.index)).toEqual([0, 1, 2])
    expect(blocks.map(b => b.kind)).toEqual(['classDiagram', 'sequenceDiagram', 'stateDiagram-v2'])
  })

  it('```ts and bare ``` fences are ignored (only mermaid is interpreted)', () => {
    const text = '```ts\nconst x = 1\n```\n```\nplain\n```\n```mermaid\nflowchart LR\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].kind).toBe('flowchart LR')
  })

  it('trailing spaces after ```mermaid are tolerated', () => {
    expect(mermaidBlocks('```mermaid   \nflowchart TD\n```\n')).toHaveLength(1)
  })

  it('an unclosed fence runs to the end of the text', () => {
    const blocks = mermaidBlocks('intro\n```mermaid\nflowchart TD\n  A --> B')
    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe('flowchart TD\n  A --> B')
    expect(blocks[0].end).toBe(4)
  })

  it('fences outside the declared subset are ignored: indented, 4+ backticks, ~~~, info-string attributes', () => {
    const indented = '  ```mermaid\nflowchart TD\n  ```\n'
    const four = '````mermaid\nflowchart TD\n````\n'
    const tilde = '~~~mermaid\nflowchart TD\n~~~\n'
    const attrs = '```mermaid {theme: dark}\nflowchart TD\n```\n'
    expect(mermaidBlocks(indented)).toEqual([])
    expect(mermaidBlocks(four)).toEqual([])
    expect(mermaidBlocks(tilde)).toEqual([])
    expect(mermaidBlocks(attrs)).toEqual([])
  })

  it('a ``` line INSIDE a mermaid block closes it (named limitation)', () => {
    const text = '```mermaid\nflowchart TD\n```\n  still text\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks).toHaveLength(1)
    expect(blocks[0].code).toBe('flowchart TD')
  })

  it('a closing fence with trailing text still closes (starts with ```)', () => {
    expect(mermaidBlocks('```mermaid\nflowchart TD\n```   \n')[0].code).toBe('flowchart TD')
  })

  it('indentation, blank lines and tabs inside the block are preserved byte for byte (R3 invariant)', () => {
    const code = 'classDiagram\n\n    class A {\n\t+x: number\n    }\n\n  A --> B'
    const blocks = mermaidBlocks(`\`\`\`mermaid\n${code}\n\`\`\`\n`)
    expect(blocks[0].code).toBe(code)
  })

  it('kind: first non-empty line, trimmed and whitespace-collapsed; leading blank lines skipped', () => {
    expect(mermaidBlocks('```mermaid\n\n   flowchart    TD  \n  A\n```\n')[0].kind).toBe('flowchart TD')
    expect(mermaidBlocks('```mermaid\n```\n')[0].kind).toBe('')
  })

  it('a mermaid fence inside the YAML frontmatter is still a fence (the grammar reads lines, not YAML)', () => {
    const text = '---\nnote: |\n```mermaid\nflowchart TD\n```\n---\n'
    expect(mermaidBlocks(text)).toHaveLength(1)
  })

  it('does not mutate its input and never returns code that is not a substring of the input', () => {
    const text = '```mermaid\nflowchart TD\n  A --> B\n```\n'
    const copy = text
    for (const block of mermaidBlocks(text)) expect(text.includes(block.code)).toBe(true)
    expect(text).toBe(copy)
  })
})

// ------------------------------------------------------------ R1 the corpus

interface CorpusBlock { index: number; kind: string; code: string; start: number; end: number }
interface Corpus {
  frozenAt: string
  board: string
  total: number
  inventory: Record<string, string[]>
  components: { id: string; design: string; blocks: CorpusBlock[] }[]
}

const corpus = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'mermaid-corpus.json'), 'utf8')) as Corpus

describe('mermaidBlocks — the frozen corpus (R1 layer i)', () => {
  it('the fixture carries its provenance and a consistent inventory', () => {
    expect(corpus.frozenAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
    expect(corpus.board).toBe('scrum_ws_057e103e4a00')
    expect(Object.keys(corpus.inventory).length).toBe(corpus.components.length)
    expect(corpus.components.reduce((n, c) => n + c.blocks.length, 0)).toBe(corpus.total)
    expect(corpus.total).toBeGreaterThanOrEqual(19)
  })

  it('covers the four diagram kinds of the board', () => {
    const kinds = new Set(Object.values(corpus.inventory).flat().map(k => k.split(' ')[0]))
    expect([...kinds].sort()).toEqual(['classDiagram', 'flowchart', 'sequenceDiagram', 'stateDiagram-v2'])
  })

  for (const component of corpus.components) {
    it(`${component.id}: reproduces its ${component.blocks.length} frozen block(s) byte for byte`, () => {
      const extracted = mermaidBlocks(component.design)
      expect(extracted).toEqual(component.blocks)
      expect(extracted.map(b => b.kind)).toEqual(corpus.inventory[component.id])
    })
  }
})

// ---------------------------------------------------------- R2 the seed rule

describe('previewByDefault (R2)', () => {
  it('on only for design with blocks; off for every other artifact and for design without blocks', () => {
    expect(previewByDefault('design', true)).toBe(true)
    expect(previewByDefault('design', false)).toBe(false)
    for (const field of ['requirements', 'requirementsReview', 'validation'] as const) {
      expect(previewByDefault(field, true)).toBe(false)
      expect(previewByDefault(field, false)).toBe(false)
    }
  })
})

// ------------------------------------------------ R9 the natural svg width

describe('svgNaturalWidth (R9 — the svg at 1:1 inside the two-axis scroll container)', () => {
  it('reads the viewBox width of the root svg (mermaid emits width="100%", which would shrink a wide diagram to the form)', () => {
    const svg = '<svg id="scrum-mmd-0-1" width="100%" xmlns="http://www.w3.org/2000/svg" class="classDiagram" style="max-width: 2124.421875px;" viewBox="0 0 2124.421875 624" role="graphics-document document"><g/></svg>'
    expect(svgNaturalWidth(svg)).toBe(2124.421875)
  })

  it('a viewBox with a non-zero origin still answers its width (stateDiagram: viewBox="140.67 0 1078.41 478.14")', () => {
    expect(svgNaturalWidth('<svg viewBox="140.67381286621094 0 1078.416015625 478.1499938964844"></svg>')).toBe(1078.416015625)
  })

  it('only the ROOT svg counts: a nested <svg> viewBox is never read', () => {
    expect(svgNaturalWidth('<svg width="100%"><svg viewBox="0 0 50 50"/></svg>')).toBeNull()
  })

  it('no viewBox, a malformed one, or an empty string → null (the css fallback stays: width 100%)', () => {
    expect(svgNaturalWidth('')).toBeNull()
    expect(svgNaturalWidth('<svg width="100%"></svg>')).toBeNull()
    expect(svgNaturalWidth('<svg viewBox="0 0 x 10"></svg>')).toBeNull()
    expect(svgNaturalWidth('<svg viewBox="0 0 0 10"></svg>')).toBeNull()
    expect(svgNaturalWidth('<div>not an svg</div>')).toBeNull()
  })
})

// ----------------------------------------------- R4/R5 the render machine

/** A promise whose settlement the test controls. */
function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

/** A recording sink: the states as they were pushed, and the availability notices. */
function sink() {
  const states: Record<number, BlockState[]> = {}
  const unavailable: (string | null)[] = []
  const removed: number[] = []
  const face: RenderSink = {
    setState: (index, state) => { (states[index] ??= []).push(state) },
    remove: (index) => { removed.push(index) },
    setUnavailable: (reason) => { unavailable.push(reason) },
  }
  const last = (index: number): BlockState | undefined => states[index]?.at(-1)
  return { face, states, unavailable, removed, last }
}

/** A render function the test settles by hand, recording every call. */
function renderFn() {
  const calls: { code: string; id: string; theme: string; d: ReturnType<typeof deferred<string>> }[] = []
  const fn: RenderFn = (code, id, theme) => {
    const d = deferred<string>()
    calls.push({ code, id, theme, d })
    return d.promise
  }
  return { fn, calls }
}

const block = (index: number, code: string): Block => ({ index, kind: code.split('\n')[0], code, start: 0, end: 0 })
const flush = () => new Promise<void>(r => setTimeout(r, 0))

describe('createRenderer (R4/R5)', () => {
  afterEach(() => { vi.restoreAllMocks() })

  it('paints a new block: loading, then ready with the svg; the id carries the block index and the mount', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 7)
    renderer.update([block(0, 'flowchart TD\n A')], 'light')
    expect(s.last(0)).toEqual({ kind: 'loading' })
    expect(r.calls[0].id).toBe('scrum-mmd-0-7')
    expect(r.calls[0].theme).toBe('light')
    r.calls[0].d.resolve('<svg>a</svg>')
    await flush()
    expect(s.last(0)).toEqual({ kind: 'ready', svg: '<svg>a</svg>' })
  })

  it('two blocks in flight, the slower one landing last: BOTH paint (per-block watermark, never global)', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'flowchart TD\n A'), block(1, 'classDiagram\n B')], 'light')
    expect(r.calls).toHaveLength(2)
    r.calls[1].d.resolve('<svg>b</svg>')
    await flush()
    r.calls[0].d.resolve('<svg>a</svg>')
    await flush()
    expect(s.last(0)).toEqual({ kind: 'ready', svg: '<svg>a</svg>' })
    expect(s.last(1)).toEqual({ kind: 'ready', svg: '<svg>b</svg>' })
  })

  it('a result for stale code is dropped: the block text changed while the render was in flight', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'flowchart TD\n A')], 'light')
    renderer.update([block(0, 'flowchart TD\n B')], 'light')
    expect(r.calls).toHaveLength(2)
    r.calls[0].d.resolve('<svg>OLD</svg>')
    await flush()
    expect(s.last(0)).toEqual({ kind: 'loading' })
    r.calls[1].d.resolve('<svg>NEW</svg>')
    await flush()
    expect(s.last(0)).toEqual({ kind: 'ready', svg: '<svg>NEW</svg>' })
  })

  it('the same text does not repaint (string comparison, not identity — the 4s poll must not churn)', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'flowchart TD\n A')], 'light')
    r.calls[0].d.resolve('<svg>a</svg>')
    await flush()
    renderer.update([block(0, 'flowchart TD\n A')], 'light')
    renderer.update([{ ...block(0, 'flowchart TD\n A') }], 'light')
    expect(r.calls).toHaveLength(1)
    expect(s.states[0]).toHaveLength(2)
  })

  it('a theme change repaints every block even with the same text (R6c)', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'flowchart TD\n A')], 'light')
    r.calls[0].d.resolve('<svg>light</svg>')
    await flush()
    renderer.update([block(0, 'flowchart TD\n A')], 'dark')
    expect(r.calls).toHaveLength(2)
    expect(r.calls[1].theme).toBe('dark')
  })

  it('dispose() before the render settles: nothing reaches the sink afterwards', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'flowchart TD\n A')], 'light')
    const before = s.states[0].length
    renderer.dispose()
    r.calls[0].d.resolve('<svg>late</svg>')
    await flush()
    expect(s.states[0]).toHaveLength(before)
    renderer.update([block(0, 'flowchart TD\n Z')], 'light')
    expect(r.calls).toHaveLength(1)
  })

  it('a rejected render → error with the LITERAL message, siblings untouched, and a console.error carrying the block id (R5 observability)', async () => {
    const s = sink()
    const r = renderFn()
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer = createRenderer(s.face, r.fn, 3)
    renderer.update([block(0, 'flowchart TD\n A'), block(1, 'classDiagramx\n B')], 'light')
    r.calls[0].d.resolve('<svg>a</svg>')
    r.calls[1].d.reject(new Error('Parse error on line 1:\nclassDiagramx'))
    await flush()
    expect(s.last(0)).toEqual({ kind: 'ready', svg: '<svg>a</svg>' })
    expect(s.last(1)).toEqual({ kind: 'error', message: 'Parse error on line 1:\nclassDiagramx' })
    expect(spy).toHaveBeenCalledTimes(1)
    expect(String(spy.mock.calls[0][0])).toContain('scrum-mmd-1-3')
    expect(s.unavailable).toEqual([])
  })

  it('a non-Error rejection is stringified, never swallowed', async () => {
    const s = sink()
    const r = renderFn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'x')], 'light')
    r.calls[0].d.reject('boom')
    await flush()
    expect(s.last(0)).toEqual({ kind: 'error', message: 'boom' })
  })

  it('EngineUnavailable (initialize failed) → setUnavailable(reason), not a per-block error (R5ii)', async () => {
    const s = sink()
    const r = renderFn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'x'), block(1, 'y')], 'light')
    r.calls[0].d.reject(new EngineUnavailable('mermaid.initialize: theme not found'))
    r.calls[1].d.reject(new EngineUnavailable('mermaid.initialize: theme not found'))
    await flush()
    expect(s.unavailable).toEqual(['mermaid.initialize: theme not found'])
    expect(s.last(0)?.kind).not.toBe('error')
    expect(s.last(1)?.kind).not.toBe('error')
  })

  it('retry() clears the availability notice, forgets the last codes and re-renders the last blocks', async () => {
    const s = sink()
    const r = renderFn()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'x')], 'light')
    r.calls[0].d.reject(new EngineUnavailable('down'))
    await flush()
    expect(s.unavailable).toEqual(['down'])
    renderer.retry()
    expect(s.unavailable).toEqual(['down', null])
    expect(r.calls).toHaveLength(2)
    expect(r.calls[1].code).toBe('x')
    r.calls[1].d.resolve('<svg>ok</svg>')
    await flush()
    expect(s.last(0)).toEqual({ kind: 'ready', svg: '<svg>ok</svg>' })
  })

  it('blocks that disappeared from the text are removed from the sink; a returning index starts fresh', async () => {
    const s = sink()
    const r = renderFn()
    const renderer = createRenderer(s.face, r.fn, 1)
    renderer.update([block(0, 'a'), block(1, 'b')], 'light')
    r.calls[0].d.resolve('<svg>a</svg>')
    r.calls[1].d.resolve('<svg>b</svg>')
    await flush()
    renderer.update([block(0, 'a')], 'light')
    expect(s.removed).toEqual([1])
    expect(r.calls).toHaveLength(2)
    renderer.update([block(0, 'a'), block(1, 'b')], 'light')
    expect(r.calls).toHaveLength(3)
  })

  it('update() and retry() never reject, even when render throws synchronously', async () => {
    const s = sink()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing: RenderFn = () => { throw new Error('sync boom') }
    const renderer = createRenderer(s.face, throwing, 1)
    expect(() => { renderer.update([block(0, 'x')], 'light') }).not.toThrow()
    await flush()
    expect(s.last(0)).toEqual({ kind: 'error', message: 'sync boom' })
    expect(() => { renderer.retry() }).not.toThrow()
  })
})
