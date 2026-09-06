/**
 * The adapter over the mermaid library (comp-44 R6a-i/R8b): `initialize`
 * deferred to the first render (and redone when the theme changes), `render`
 * wrapped in a `finally` that removes the temporary `d<id>` node mermaid
 * leaves behind — measured in the spike: 2 renders ⇒ 21 orphan nodes, and a
 * parse error throws AND leaves the node. Written BEFORE the implementation.
 *
 * What this suite proves (review r2 M1 / r3 H4): the CONTRACT OF THE ADAPTER
 * — it removes its temp node on both paths and never calls run()/init(). It
 * proves NOTHING about the real mermaid: `document` and `mermaid` are doubles.
 * The real engine is observed in the browser at validation (R6a-ii).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EngineUnavailable } from '../src/client/mermaid.ts'
import { createMermaidEngine } from '../src/client/mermaid-engine.ts'
import type { DocumentLike, MermaidLike } from '../src/client/mermaid-engine.ts'

/** A countable document double: every id ever looked up, and every node removed. */
function documentDouble(present: (id: string) => boolean = () => true) {
  const looked: string[] = []
  const removed: string[] = []
  const document: DocumentLike = {
    getElementById: (id) => {
      looked.push(id)
      if (!present(id)) return null
      return { remove: () => { removed.push(id) } }
    },
  }
  return { document, looked, removed }
}

/** A mermaid double: records initialize calls; render resolves, rejects, or throws as told. */
function mermaidDouble(options: {
  render?: (id: string, code: string) => Promise<{ svg: string }>
  initialize?: (config: Record<string, unknown>) => void
} = {}) {
  const inits: Record<string, unknown>[] = []
  const renders: { id: string; code: string }[] = []
  const forbidden: string[] = []
  const mermaid: MermaidLike = {
    initialize: (config) => {
      inits.push(config)
      options.initialize?.(config)
    },
    render: (id, code) => {
      renders.push({ id, code })
      return options.render?.(id, code) ?? Promise.resolve({ svg: `<svg id="${id}">${code}</svg>` })
    },
    run: () => { forbidden.push('run') },
    init: () => { forbidden.push('init') },
  }
  return { mermaid, inits, renders, forbidden }
}

describe('createMermaidEngine (R6a-i / R8b)', () => {
  it('a successful render returns the svg and removes the temporary d<id> node', async () => {
    const d = documentDouble()
    const m = mermaidDouble()
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    const svg = await engine.render('flowchart TD\n A', 'scrum-mmd-0-1', 'light')
    expect(svg).toBe('<svg id="scrum-mmd-0-1">flowchart TD\n A</svg>')
    expect(m.renders).toEqual([{ id: 'scrum-mmd-0-1', code: 'flowchart TD\n A' }])
    expect(d.looked).toEqual(['dscrum-mmd-0-1'])
    expect(d.removed).toEqual(['dscrum-mmd-0-1'])
  })

  it('a render that REJECTS also removes the temporary node, and the error passes through literally', async () => {
    const d = documentDouble()
    const m = mermaidDouble({ render: () => Promise.reject(new Error('Parse error on line 2')) })
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    await expect(engine.render('bad', 'scrum-mmd-0-1', 'light')).rejects.toThrow('Parse error on line 2')
    expect(d.removed).toEqual(['dscrum-mmd-0-1'])
  })

  it('a render that THROWS synchronously also removes the temporary node', async () => {
    const d = documentDouble()
    const m = mermaidDouble({ render: () => { throw new Error('sync') } })
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    await expect(engine.render('bad', 'scrum-mmd-0-1', 'light')).rejects.toThrow('sync')
    expect(d.removed).toEqual(['dscrum-mmd-0-1'])
  })

  it('a missing temporary node is not an error (mermaid already cleaned up)', async () => {
    const d = documentDouble(() => false)
    const m = mermaidDouble()
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    await expect(engine.render('x', 'scrum-mmd-0-1', 'light')).resolves.toContain('<svg')
    expect(d.removed).toEqual([])
  })

  it('initialize is deferred to the first render, called once, with the R6 config and the theme mapped', async () => {
    const d = documentDouble()
    const m = mermaidDouble()
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    expect(m.inits).toEqual([])
    await engine.render('a', 'scrum-mmd-0-1', 'light')
    await engine.render('b', 'scrum-mmd-1-1', 'light')
    expect(m.inits).toHaveLength(1)
    expect(m.inits[0]).toEqual({
      startOnLoad: false,
      securityLevel: 'strict',
      suppressErrorRendering: true,
      theme: 'default',
    })
  })

  it('initialize runs again only when the theme changes, and dark maps to the mermaid dark theme (R6c)', async () => {
    const d = documentDouble()
    const m = mermaidDouble()
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    await engine.render('a', 'scrum-mmd-0-1', 'light')
    await engine.render('a', 'scrum-mmd-0-1', 'dark')
    await engine.render('a', 'scrum-mmd-0-1', 'dark')
    expect(m.inits.map(c => c.theme)).toEqual(['default', 'dark'])
  })

  it('initialize that throws → EngineUnavailable with the literal message; nothing rendered; retried on the next call', async () => {
    const d = documentDouble()
    let fail = true
    const m = mermaidDouble({ initialize: () => { if (fail) throw new Error('theme "nope" not found') } })
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    const first = engine.render('a', 'scrum-mmd-0-1', 'light')
    await expect(first).rejects.toBeInstanceOf(EngineUnavailable)
    await expect(first).rejects.toThrow('theme "nope" not found')
    expect(m.renders).toEqual([])
    fail = false
    await expect(engine.render('a', 'scrum-mmd-0-1', 'light')).resolves.toContain('<svg')
    expect(m.inits).toHaveLength(2)
  })

  it('never calls run() or init() — they scan the document by selector and would violate R3', async () => {
    const d = documentDouble()
    const m = mermaidDouble()
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    await engine.render('a', 'scrum-mmd-0-1', 'light')
    expect(m.forbidden).toEqual([])
  })

  it('does not touch the document beyond the temp-node lookup (no body, no head)', async () => {
    const d = documentDouble()
    const m = mermaidDouble()
    const engine = createMermaidEngine({ document: d.document, mermaid: m.mermaid })
    await engine.render('a', 'scrum-mmd-0-1', 'light')
    expect(d.looked).toEqual(['dscrum-mmd-0-1'])
  })
})

describe('import seam (R7 / R8b / r5-M1)', () => {
  it('mermaid-engine.ts does not import the mermaid library — the static import lives only in index.ts', () => {
    const source = readFileSync(resolve(__dirname, '..', 'src', 'client', 'mermaid-engine.ts'), 'utf8')
    expect(source).not.toMatch(/from\s+['"]mermaid['"]/)
    expect(source).not.toMatch(/require\(\s*['"]mermaid['"]\s*\)/)
  })

  it('index.ts imports mermaid statically and disarms startOnLoad on the very next statement (the two synchronous acts)', () => {
    const source = readFileSync(resolve(__dirname, '..', 'src', 'client', 'index.ts'), 'utf8')
    expect(source).toMatch(/^import mermaid from ['"]mermaid['"]/m)
    expect(source).toMatch(/^mermaid\.startOnLoad = false/m)
    const importAt = source.search(/^import mermaid from ['"]mermaid['"]/m)
    const disarmAt = source.search(/^mermaid\.startOnLoad = false/m)
    expect(disarmAt).toBeGreaterThan(importAt)
  })
})
