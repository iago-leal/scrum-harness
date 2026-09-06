/**
 * The adapter over the mermaid library (comp-44 R6/R7/R8b). It owns three
 * things the pure renderer must not know: WHEN `initialize` runs (deferred
 * to the first render, redone on theme change — never at import time, never
 * in `apply`), HOW a render is called (`mermaid.render`, never `run()`/`init()`
 * which scan the document by selector and would rewrite nodes, R3), and the
 * CLEANUP mermaid does not do for us — it appends a temporary `<div id="d<id>">`
 * to `document.body` and, on a parse error, throws AND leaves it behind
 * (measured in the spike: 2 renders ⇒ 21 orphan nodes). The `finally` here
 * is the R6 hygiene.
 *
 * This module does NOT import the library (r5-M1): `mermaid` and `document`
 * arrive by parameter from the composition point (`index.ts`), which is what
 * lets `tests/mermaid-engine.spec.ts` prove the contract with doubles in Node
 * without pulling 3.4 MB — and what keeps the proof honest about its scope:
 * it proves the adapter, not the real engine (R6a-i vs R6a-ii).
 * @module @scrum-harness/ui/client/mermaid-engine
 */

import { EngineUnavailable } from './mermaid.ts'
import type { RenderFn, Theme } from './mermaid.ts'

/** The slice of `document` the adapter touches: the temp-node lookup, nothing else. */
export interface DocumentLike {
  getElementById: (id: string) => { remove: () => void } | null
}

/**
 * The slice of the mermaid module the adapter calls. `run`/`init` are listed
 * (as opaque members) so the test double can carry spies proving the adapter
 * never calls them — the adapter itself never types them as callable.
 */
export interface MermaidLike {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, code: string) => Promise<{ svg: string }>
  run?: unknown
  init?: unknown
}

/** The engine handle the view injects (R7): one per page. */
export interface MermaidEngine {
  render: RenderFn
}

/** The mermaid theme name for a panel theme. */
const themeOf = (theme: Theme): string => theme === 'dark' ? 'dark' : 'default'

/**
 * Create the engine over an injected document and mermaid module.
 * @param deps - `document` (temp-node cleanup) and the mermaid module.
 * @returns the engine.
 */
export function createMermaidEngine(deps: { document: DocumentLike; mermaid: MermaidLike }): MermaidEngine {
  const { document, mermaid } = deps
  /** The theme `initialize` last succeeded with; null until the first render. */
  let initialized: Theme | null = null

  const ensureInit = (theme: Theme): void => {
    if (initialized === theme) return
    try {
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: 'strict',
        suppressErrorRendering: true,
        theme: themeOf(theme),
      })
    } catch (error) {
      initialized = null
      throw new EngineUnavailable(error instanceof Error ? error.message : String(error))
    }
    initialized = theme
  }

  return {
    async render(code, id, theme) {
      ensureInit(theme)
      try {
        const { svg } = await mermaid.render(id, code)
        return svg
      } finally {
        document.getElementById(`d${id}`)?.remove()
      }
    },
  }
}
