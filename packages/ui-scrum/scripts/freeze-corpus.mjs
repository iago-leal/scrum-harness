#!/usr/bin/env node
/**
 * Freeze the mermaid corpus of one board into a test fixture (comp-44 R1/R11).
 *
 * Reads the live board through the same HTTP API the GUI uses, extracts every
 * ```mermaid fence from every component's `design` artifact with the grammar of
 * R3 (opening fence at line start, trailing spaces tolerated; closing at the
 * first following line that starts with ```; an unclosed fence runs to the end),
 * and writes `tests/fixtures/mermaid-corpus.json` with its provenance header.
 *
 * The fixture is a HISTORICAL SNAPSHOT, not a mirror (r1 M5): diverging from
 * the live board is not a failure. What the spec proves against it is the
 * extraction grammar (`mermaidBlocks` must reproduce these blocks byte for
 * byte), never the board's state.
 *
 * Usage: node packages/ui-scrum/scripts/freeze-corpus.mjs [workspace-path] [host]
 *   workspace-path defaults to the repository root (the scrum-harness board)
 *   host defaults to http://127.0.0.1:3090
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..', '..', '..')
const workspace = process.argv[2] ?? root
const host = process.argv[3] ?? 'http://127.0.0.1:3090'
const out = resolve(here, '..', 'tests', 'fixtures', 'mermaid-corpus.json')

/** The R3 grammar, mirrored (the spec proves `mermaidBlocks` matches it). */
function fences(text) {
  const lines = text.split('\n')
  const blocks = []
  let open = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (open === null) {
      if (/^```mermaid\s*$/.test(line)) open = i + 1
      continue
    }
    if (line.startsWith('```')) {
      blocks.push({ start: open, end: i, code: lines.slice(open, i).join('\n') })
      open = null
    }
  }
  if (open !== null) blocks.push({ start: open, end: lines.length, code: lines.slice(open).join('\n') })
  return blocks.map((b, index) => {
    const first = b.code.split('\n').find(l => l.trim().length > 0) ?? ''
    return { index, kind: first.trim().replace(/\s+/g, ' '), code: b.code, start: b.start, end: b.end }
  })
}

const url = `${host}/scrum-api/state?workspace=${encodeURIComponent(workspace)}`
const response = await fetch(url)
if (!response.ok) throw new Error(`${url} → ${response.status}`)
const { state } = await response.json()

const components = []
for (const release of state.tree.releases) {
  for (const feature of release.features) {
    for (const component of feature.components) {
      if (typeof component.design !== 'string' || component.design.length === 0) continue
      const blocks = fences(component.design)
      if (blocks.length === 0) continue
      components.push({ id: component.id, title: component.title, design: component.design, blocks })
    }
  }
}
components.sort((a, b) => Number(a.id.slice(5)) - Number(b.id.slice(5)))

const inventory = Object.fromEntries(components.map(c => [c.id, c.blocks.map(b => b.kind)]))
const total = components.reduce((n, c) => n + c.blocks.length, 0)
const fixture = {
  frozenAt: new Date().toISOString(),
  workspace,
  board: 'scrum_ws_057e103e4a00',
  grammar: 'comp-44 R3: ^```mermaid\\s*$ opens; first following line starting with ``` closes; unclosed runs to the end',
  total,
  inventory,
  components,
}

await mkdir(dirname(out), { recursive: true })
await writeFile(out, `${JSON.stringify(fixture, null, 2)}\n`, 'utf8')
console.log(`froze ${total} mermaid block(s) from ${components.length} design(s) → ${out}`)
for (const [id, kinds] of Object.entries(inventory)) console.log(`  ${id}: ${kinds.join(', ')}`)
