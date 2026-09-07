/**
 * The pure half of the artifact markdown render (comp-58): the frontmatter
 * split that mirrors the domain's `parseFrontmatter` byte for byte (R3), the
 * literal frontmatter table rows (R3), the body as SEGMENTS — sanitized html
 * groups interleaved with the mermaid blocks paired BY POSITION with
 * `mermaidBlocks` of the whole text (R4, review r3-M1) — the DOMPurify
 * policy applied to an injected instance (R2/R2b), and the per-artifact
 * mode rules (R1). No React, no DOM: `marked` runs here (a dedicated
 * `Marked` instance — never the singleton the mermaid engine consults),
 * `sanitize` and the purify instance are injected, so the suite drives
 * everything in Node with doubles.
 * @module @scrum-harness/ui/client/markdown
 */

import { Marked } from 'marked'
import type { Token } from 'marked'
import { OPEN } from './mermaid.ts'
import type { Block } from './mermaid.ts'

/** How one artifact is shown: rendered (`view`) or the textarea (`write`). */
export type ArtifactMode = 'view' | 'write'

/** The frontmatter split of one artifact text (R3). */
export interface Split {
  /** The lines between the fences, or null when the domain rule does not open. */
  frontmatter: string | null
  /** The text after the closing fence (the whole text when not recognized). */
  body: string
  /** 0-based line index of the first body line in the ORIGINAL text. */
  bodyStart: number
  /** The text looks like it wanted a frontmatter (`---` first) but the domain rule would not read one. */
  unrecognized: boolean
}

/** One literal row of the frontmatter table (R3). */
export interface Row {
  key: string
  value: string
  /** The indented continuation lines, untouched. */
  block: string[]
}

/** One piece of the rendered body (R4). */
export type Segment =
  | { kind: 'html'; html: string }
  | { kind: 'mermaid'; block: Block }

/** The two calls of `marked` the render uses (a test injects a throwing one). */
export interface MarkedLike {
  lexer: (src: string) => Token[]
  parser: (tokens: Token[]) => string
}

/** What `renderBody` needs besides the text. */
export interface RenderOptions {
  /** The sanitizer bound to the dedicated DOMPurify instance (identity in tests). */
  sanitize: (html: string) => string
  /** `mermaidBlocks(text)` of the WHOLE text — the numbering the form already uses. */
  blocks: Block[]
  /** Override of the module's `Marked` instance. */
  marked?: MarkedLike
}

/**
 * The subset of a DOMPurify instance the policy touches (R6: a double in
 * tests). Method signatures on purpose: they are bivariant, so the real
 * instance's overloaded `addHook`/`setConfig(cfg?: Config)` fit.
 */
export interface PurifyLike {
  setConfig(config: Record<string, unknown>): unknown
  addHook(name: 'uponSanitizeElement', hook: (node: unknown, event: { tagName: string }) => void): unknown
  addHook(name: 'afterSanitizeAttributes', hook: (node: unknown) => void): unknown
  sanitize(html: string): string
}

/** The minimal element surface the hooks read and write (fakes in tests, real nodes in the browser). */
interface ElementLike {
  tagName?: string
  nodeType?: number
  textContent: string | null
  parentNode: { replaceChild: (n: ElementLike, o: ElementLike) => unknown; removeChild: (n: ElementLike) => unknown } | null
  ownerDocument: { createElement: (tag: string) => ElementLike } | null
  getAttribute: (name: string) => string | null
  hasAttribute: (name: string) => boolean
  setAttribute: (name: string, value: string) => void
  removeAttribute: (name: string) => void
}

// ---------------------------------------------------------------- R3 split

/**
 * Split an artifact into frontmatter and body with the domain's rule
 * (`frontmatter.ts`): opens only when the text starts with `---\n` (or is
 * exactly `---`), closes at the first later line whose trim() is `---`.
 * Anything else — `--- `, CRLF, a blank line first, no close — is body, and
 * `unrecognized` says whether the text looked like it wanted a frontmatter.
 * @param text - the artifact text, as typed.
 * @returns the split.
 */
export function splitFrontmatter(text: string): Split {
  const looksLikeOne = (): boolean => {
    const first = text.split('\n').find(line => line.trim().length > 0) ?? ''
    return first.trim() === '---'
  }
  if (text === '---') return { frontmatter: '', body: '', bodyStart: 1, unrecognized: false }
  if (!text.startsWith('---\n')) return { frontmatter: null, body: text, bodyStart: 0, unrecognized: looksLikeOne() }
  const lines = text.split('\n')
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      return {
        frontmatter: lines.slice(1, i).join('\n'),
        body: lines.slice(i + 1).join('\n'),
        bodyStart: i + 1,
        unrecognized: false,
      }
    }
  }
  return { frontmatter: null, body: text, bodyStart: 0, unrecognized: true }
}

/**
 * The literal rows of a frontmatter (R3): one per top-level line, indented
 * lines go to the previous row's `block`, blank lines and `#` comments are
 * skipped. No YAML is parsed; quotes stay as typed.
 * @param frontmatter - the text between the fences.
 * @returns the rows in order.
 */
export function frontmatterRows(frontmatter: string): Row[] {
  const rows: Row[] = []
  for (const line of frontmatter.split('\n')) {
    if (line.trim().length === 0 || line.trimStart().startsWith('#')) continue
    if (/^\s/.test(line)) {
      if (rows.length === 0) rows.push({ key: '', value: '', block: [] })
      rows[rows.length - 1].block.push(line)
      continue
    }
    const colon = line.indexOf(':')
    if (colon > 0 && /^[^\s:]+$/.test(line.slice(0, colon))) {
      rows.push({ key: line.slice(0, colon), value: line.slice(colon + 1).trim(), block: [] })
    } else {
      rows.push({ key: '', value: line, block: [] })
    }
  }
  return rows
}

// ------------------------------------------------------------- R2/R4 body

/** Escape the five html-significant characters. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/**
 * The module's own `Marked` (R2): GFM, no `breaks` (a .md, not a comment),
 * synchronous. A dedicated instance — `marked.use`/`setOptions` on the
 * singleton would leak into the mermaid engine's `marked.lexer`.
 */
const engine = new Marked({ gfm: true, breaks: false, async: false })

const defaultMarked: MarkedLike = {
  lexer: (src) => engine.lexer(src),
  parser: (tokens) => engine.parser(tokens),
}

const countNewlines = (raw: string): number => {
  let n = 0
  for (let i = 0; i < raw.length; i++) if (raw.charCodeAt(i) === 10) n++
  return n
}

/**
 * Render the body of an artifact as segments (R4): the top-level tokens of
 * the body are walked with a line counter (`bodyStart` + the newlines of
 * every `raw` before — the lexer consumes exactly `raw.length` per token and
 * its CRLF normalization keeps the `\n` count); a top-level `code` token
 * whose fence line matches `OPEN` AND has a block of `blocks` starting right
 * there becomes a mermaid segment carrying that very Block (same index, same
 * code, same render state as the Escrever mode); everything else is grouped,
 * parsed and handed to `sanitize`. If `marked` throws, the body is one
 * escaped `<pre>` (sanitize not needed: nothing is markup).
 * @param text - the whole artifact text (frontmatter included).
 * @param options - sanitize, the blocks of the whole text, an optional marked override.
 * @returns the segments in document order; `[]` for an empty body.
 */
export function renderBody(text: string, options: RenderOptions): Segment[] {
  const marked = options.marked ?? defaultMarked
  const { body, bodyStart } = splitFrontmatter(text)
  if (body.trim().length === 0) return []
  let tokens: Token[]
  try {
    tokens = marked.lexer(body)
  } catch {
    return [{ kind: 'html', html: `<pre>${escapeHtml(body)}</pre>` }]
  }
  const byLine = new Map<number, Block>()
  for (const block of options.blocks) byLine.set(block.start - 1, block)

  const segments: Segment[] = []
  let group: Token[] = []
  const flush = (): void => {
    if (group.length === 0) return
    let html: string
    try {
      html = marked.parser(group)
    } catch {
      html = `<pre>${escapeHtml(group.map(t => t.raw).join(''))}</pre>`
      group = []
      segments.push({ kind: 'html', html })
      return
    }
    group = []
    if (html.trim().length === 0) return
    segments.push({ kind: 'html', html: options.sanitize(html) })
  }

  let line = bodyStart
  for (const token of tokens) {
    const raw = token.raw ?? ''
    if (token.type === 'code') {
      const fence = raw.split('\n', 1)[0]
      const block = OPEN.test(fence) ? byLine.get(line) : undefined
      if (block !== undefined) {
        flush()
        segments.push({ kind: 'mermaid', block })
        line += countNewlines(raw)
        continue
      }
    }
    group.push(token)
    line += countNewlines(raw)
  }
  flush()
  return segments
}

// ------------------------------------------------------ R2/R2b sanitizer

/** Tags the policy forbids on top of the html profile (R2). */
export const FORBID_TAGS = ['style', 'form', 'button', 'select', 'textarea', 'audio', 'video', 'source', 'track', 'iframe', 'object', 'embed', 'dialog'] as const

/** Attributes the policy forbids (R2): no styling, no identity, no class to wear the panel's sheet. */
export const FORBID_ATTR = ['style', 'id', 'name', 'class', 'srcset', 'poster', 'background'] as const

const SAFE_HREF = /^\s*(https?:|mailto:|tel:|#)/i
const OPENS_TAB = /^\s*https?:/i
const DATA_IMAGE = /^\s*data:image\//i

const isElement = (node: unknown): node is ElementLike =>
  typeof node === 'object' && node !== null && typeof (node as ElementLike).getAttribute === 'function'

/**
 * Apply the policy (R2/R2b) to a DEDICATED DOMPurify instance and return its
 * sanitize. Only the html profile (no svg, no MathML — the mermaid svg never
 * passes here), the forbid lists, no data-/aria- attributes (marked emits
 * none), an `uponSanitizeElement` hook that keeps `<input>` only as a
 * disabled checkbox and replaces any `<img>` that is not `data:image/` by a
 * `[alt]` span titled with the src (the DOM iterator visits the span, which
 * carries only `title`), and an `afterSanitizeAttributes` hook that keeps
 * `href` only for `https?:`, `mailto:`, `tel:` and `#`, opening `https?:`
 * in a new tab with `rel="noopener noreferrer"`. Nothing here touches the
 * default instance (the mermaid engine's).
 * @param purify - the dedicated instance (`DOMPurify(window)`), or a double.
 * @returns `(html) => purify.sanitize(html)`.
 */
export function configureSanitizer(purify: PurifyLike): (html: string) => string {
  purify.setConfig({
    USE_PROFILES: { html: true },
    FORBID_TAGS: [...FORBID_TAGS],
    FORBID_ATTR: [...FORBID_ATTR],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: false,
  })

  purify.addHook('uponSanitizeElement', (node, event) => {
    if (!isElement(node)) return
    const tag = event.tagName
    if (tag === 'input') {
      if ((node.getAttribute('type') ?? '').toLowerCase() !== 'checkbox') {
        node.parentNode?.removeChild(node)
      } else {
        node.setAttribute('disabled', '')
      }
      return
    }
    if (tag === 'img') {
      const src = node.getAttribute('src') ?? ''
      if (DATA_IMAGE.test(src)) return
      const parent = node.parentNode
      const doc = node.ownerDocument
      if (parent === null || doc === null) return
      const span = doc.createElement('span')
      const alt = (node.getAttribute('alt') ?? '').trim()
      span.textContent = `[${alt.length > 0 ? alt : 'imagem'}]`
      span.setAttribute('title', `imagem remota não carregada: ${src}`)
      parent.replaceChild(span, node)
    }
  })

  purify.addHook('afterSanitizeAttributes', (node) => {
    if (!isElement(node) || !node.hasAttribute('href')) return
    const href = node.getAttribute('href') ?? ''
    if (!SAFE_HREF.test(href)) {
      node.removeAttribute('href')
      node.removeAttribute('target')
      return
    }
    if (OPENS_TAB.test(href)) node.setAttribute('target', '_blank')
    else node.removeAttribute('target')
    node.setAttribute('rel', 'noopener noreferrer')
  })

  return (html) => purify.sanitize(html)
}

// ----------------------------------------------------------------- R1 modes

/**
 * The mode an artifact opens in (R1): rendered when there is text, the
 * textarea when there is nothing to see.
 * @param text - the server text.
 * @returns the mode.
 */
export function modeByDefault(text: string): ArtifactMode {
  return text.trim().length === 0 ? 'write' : 'view'
}

/**
 * The mode after a poll (R1): an untouched, clean artifact that just gained
 * its text on the server moves to `view` (the review the subagent wrote
 * while the form was open); a touched artifact or a dirty draft never moves.
 * @param mode - current mode.
 * @param ctx - touched (the user clicked its tabs), dirty (draft ≠ previous server), the previous and next server texts.
 * @returns the next mode.
 */
export function followMode(
  mode: ArtifactMode,
  ctx: { touched: boolean; dirty: boolean; prevText: string; nextText: string },
): ArtifactMode {
  if (ctx.touched || ctx.dirty) return mode
  if (ctx.prevText.trim().length === 0 && ctx.nextText.trim().length > 0) return 'view'
  return mode
}
