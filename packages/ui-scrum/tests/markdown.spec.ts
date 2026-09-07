/**
 * The pure half of the artifact markdown render (comp-58 R1/R2/R2b/R3/R4/R6):
 * the frontmatter split mirroring the domain's `parseFrontmatter`, the literal
 * frontmatter table rows, the body as segments (sanitized html interleaved
 * with the mermaid blocks paired BY POSITION with `mermaidBlocks` of the whole
 * text), the DOMPurify policy applied through an injected instance, and the
 * per-artifact mode rules. Written BEFORE the implementation (TDD); no React,
 * no DOM, no DOMPurify — `sanitize` and the purify instance are doubles.
 * `marked` itself runs in Node and is exercised for real.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  configureSanitizer, escapeHtml, followMode, FORBID_ATTR, FORBID_TAGS, frontmatterRows, modeByDefault, renderBody,
  splitFrontmatter,
} from '../src/client/markdown.ts'
import type { PurifyLike, Segment } from '../src/client/markdown.ts'
import { mermaidBlocks, OPEN } from '../src/client/mermaid.ts'

// -------------------------------------------------------- R3 splitFrontmatter

describe('splitFrontmatter (R3) — the domain fence, byte for byte', () => {
  it('recognized: frontmatter between the fences, body after, bodyStart = line after the close', () => {
    const text = '---\nversion: 1\nstatus: draft\n---\n## Requirements\n\nR1 — x\n'
    expect(splitFrontmatter(text)).toEqual({
      frontmatter: 'version: 1\nstatus: draft',
      body: '## Requirements\n\nR1 — x\n',
      bodyStart: 4,
      unrecognized: false,
    })
  })

  it('absent: the whole text is body, bodyStart 0, not unrecognized', () => {
    expect(splitFrontmatter('## Design\n\ntext')).toEqual({ frontmatter: null, body: '## Design\n\ntext', bodyStart: 0, unrecognized: false })
    expect(splitFrontmatter('')).toEqual({ frontmatter: null, body: '', bodyStart: 0, unrecognized: false })
  })

  it('opened but never closed → everything is body and the notice fires (r3-L1)', () => {
    const text = '---\nversion: 1\n## Requirements\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text, bodyStart: 0, unrecognized: true })
  })

  it('`--- ` with a trailing space does not open (the domain rule) → unrecognized', () => {
    const text = '--- \nversion: 1\n---\nbody\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text, bodyStart: 0, unrecognized: true })
  })

  it('CRLF does not open (startsWith("---\\n") fails on "---\\r\\n") → unrecognized', () => {
    const text = '---\r\nversion: 1\r\n---\r\nbody\r\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text, bodyStart: 0, unrecognized: true })
  })

  it('a blank line before the fence does not open → unrecognized', () => {
    const text = '\n---\nversion: 1\n---\nbody\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: null, body: text, bodyStart: 0, unrecognized: true })
  })

  it('exactly "---" is an empty frontmatter with an empty body', () => {
    expect(splitFrontmatter('---')).toEqual({ frontmatter: '', body: '', bodyStart: 1, unrecognized: false })
  })

  it('the close is the first later line whose trim() is "---" (trailing spaces tolerated, like the domain)', () => {
    const text = '---\na: 1\n---   \nbody\n'
    expect(splitFrontmatter(text)).toEqual({ frontmatter: 'a: 1', body: 'body\n', bodyStart: 3, unrecognized: false })
  })

  it('a body-only text with a later thematic break is neither frontmatter nor unrecognized', () => {
    expect(splitFrontmatter('intro\n\n---\n\nmore').unrecognized).toBe(false)
  })
})

// --------------------------------------------------------- R3 frontmatterRows

describe('frontmatterRows (R3) — literal rows, no YAML', () => {
  it('one row per top-level `key: value`, value literal with its quotes', () => {
    expect(frontmatterRows('version: 3\nstatus: approved\nreviewed_digest: "ce66b185"')).toEqual([
      { key: 'version', value: '3', block: [] },
      { key: 'status', value: 'approved', block: [] },
      { key: 'reviewed_digest', value: '"ce66b185"', block: [] },
    ])
  })

  it('a key whose value continues on indented lines keeps those lines intact in `block`', () => {
    const fm = 'traces:\n  - { req: [R1], files: [a.ts], tests: [] }\n  - { req: [R2], files: [], tests: [] }\nsuite: { tests: 3, passed: 3 }'
    expect(frontmatterRows(fm)).toEqual([
      { key: 'traces', value: '', block: ['  - { req: [R1], files: [a.ts], tests: [] }', '  - { req: [R2], files: [], tests: [] }'] },
      { key: 'suite', value: '{ tests: 3, passed: 3 }', block: [] },
    ])
  })

  it('blank lines and # comments produce no row', () => {
    expect(frontmatterRows('# note\n\nversion: 1\n\n# other\nstatus: draft')).toEqual([
      { key: 'version', value: '1', block: [] },
      { key: 'status', value: 'draft', block: [] },
    ])
  })

  it('a top-level line without `key:` is a row with an empty key and the literal text', () => {
    expect(frontmatterRows('version: 1\njust text here\nstatus: x')).toEqual([
      { key: 'version', value: '1', block: [] },
      { key: '', value: 'just text here', block: [] },
      { key: 'status', value: 'x', block: [] },
    ])
  })

  it('a malformed block (indented first line, two-level nesting) is still tabulated — the view never judges', () => {
    expect(frontmatterRows('  indented: first\nkey: v\n  a:\n    b: c')).toEqual([
      { key: '', value: '', block: ['  indented: first'] },
      { key: 'key', value: 'v', block: ['  a:', '    b: c'] },
    ])
  })

  it('empty frontmatter → no rows', () => {
    expect(frontmatterRows('')).toEqual([])
  })
})

// ---------------------------------------------------------------- helpers

/** A sanitize double: identity that records every html it was handed. */
function recorder() {
  const calls: string[] = []
  return { calls, sanitize: (html: string) => { calls.push(html); return html } }
}

const htmlOf = (segments: Segment[]): string => segments.map(s => s.kind === 'html' ? s.html : `<MERMAID ${s.block.index}>`).join('')
const render = (text: string, sanitize = recorder().sanitize) => renderBody(text, { sanitize, blocks: mermaidBlocks(text) })

// --------------------------------------------------------- R2/R4 renderBody

describe('renderBody (R2) — GFM through marked, every html group through sanitize', () => {
  it('headings, emphasis, inline code, lists and a paragraph', () => {
    const html = htmlOf(render('## Title\n\nA **bold** `code` _em_ ~~gone~~.\n\n- one\n- two\n  - nested\n\n1. first\n'))
    expect(html).toContain('<h2>Title</h2>')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<em>em</em>')
    expect(html).toContain('<del>gone</del>')
    expect(html).toContain('<ul>')
    expect(html).toContain('<ol>')
  })

  it('tables with alignment, task lists as disabled checkboxes, blockquotes, fenced and indented code', () => {
    const html = htmlOf(render('| a | b |\n|:--|--:|\n| 1 | 2 |\n\n- [ ] todo\n- [x] done\n\n> quote\n\n```ts\nconst x = 1\n```\n\n    indented\n'))
    expect(html).toContain('<table>')
    expect(html).toMatch(/<td align="left">1<\/td>/)
    expect(html).toMatch(/<input[^>]*type="checkbox"/)
    expect(html).toMatch(/<input[^>]*checked/)
    expect(html).toContain('<blockquote>')
    expect(html).toContain('<pre><code class="language-ts">const x = 1')
    expect(html).toContain('<pre><code>indented')
  })

  it('a reference link defined AFTER its use resolves (the lexer sees the whole body first)', () => {
    const html = htmlOf(render('see [the spec][s] here\n\n[s]: https://example.com/spec\n'))
    expect(html).toContain('<a href="https://example.com/spec">the spec</a>')
  })

  it('a thematic break in the body is an <hr>, never the literal ---', () => {
    const html = htmlOf(render('---\nversion: 1\n---\nabove\n\n---\n\nbelow\n'))
    expect(html).toContain('<hr>')
    expect(html).not.toContain('---')
  })

  it('every html group is handed to sanitize; the result is what sanitize returned', () => {
    const rec = recorder()
    const segments = renderBody('# a\n\n<div onclick="x()">raw</div>\n', { sanitize: (h) => { rec.calls.push(h); return '[clean]' }, blocks: [] })
    expect(rec.calls).toHaveLength(1)
    expect(rec.calls[0]).toContain('<div onclick="x()">raw</div>')
    expect(segments).toEqual([{ kind: 'html', html: '[clean]' }])
  })

  it('the frontmatter never reaches the body html', () => {
    const rec = recorder()
    renderBody('---\nsecret: 1\n---\nbody\n', { sanitize: rec.sanitize, blocks: [] })
    expect(rec.calls.join('')).not.toContain('secret')
  })

  it('empty text → no segments', () => {
    expect(render('')).toEqual([])
    expect(render('---\na: 1\n---\n')).toEqual([])
  })

  it('when marked throws, the body is one escaped <pre> segment and sanitize is NOT called', () => {
    const rec = recorder()
    const throwing = { lexer: () => { throw new Error('boom') }, parser: () => '' }
    const segments = renderBody('a <b> & c', { sanitize: rec.sanitize, blocks: [], marked: throwing })
    expect(segments).toEqual([{ kind: 'html', html: '<pre>a &lt;b&gt; &amp; c</pre>' }])
    expect(rec.calls).toEqual([])
  })
})

describe('renderBody (R4) — mermaid segments paired by position with mermaidBlocks(text)', () => {
  it('two fences interleaved with text: html, mermaid(0), html, mermaid(1), html — the Block of the whole text', () => {
    const text = 'intro\n\n```mermaid\nflowchart TD\n  A --> B\n```\n\nmiddle\n\n```mermaid\nsequenceDiagram\n  A->>B: hi\n```\n\nend\n'
    const blocks = mermaidBlocks(text)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.map(s => s.kind)).toEqual(['html', 'mermaid', 'html', 'mermaid', 'html'])
    const mermaid = segments.filter(s => s.kind === 'mermaid')
    expect(mermaid[0]).toEqual({ kind: 'mermaid', block: blocks[0] })
    expect(mermaid[1]).toEqual({ kind: 'mermaid', block: blocks[1] })
    expect(htmlOf(segments)).toContain('<p>intro</p>')
    expect(htmlOf(segments)).toContain('<p>middle</p>')
    expect(htmlOf(segments)).toContain('<p>end</p>')
  })

  it('a fence inside the frontmatter keeps counting in the numbering: the body diagrams are blocks 1 and 2', () => {
    const text = '---\nnote: |\n```mermaid\nflowchart TD\n```\n---\n```mermaid\nclassDiagram\n```\ntext\n```mermaid\nstateDiagram-v2\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks).toHaveLength(3)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.filter(s => s.kind === 'mermaid').map(s => s.kind === 'mermaid' ? s.block.index : -1)).toEqual([1, 2])
  })

  it('CRLF: marked normalizes, mermaidBlocks keeps \\r — the pairing is by line, so the Block (with \\r) is still the one shown', () => {
    const text = 'a\r\n\r\n```mermaid\r\nflowchart TD\r\n```\r\n\r\nb\r\n'
    const blocks = mermaidBlocks(text)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([{ kind: 'mermaid', block: blocks[0] }])
    expect(blocks[0].code).toBe('flowchart TD\r')
  })

  it('a ```js line INSIDE the block closes it for mermaidBlocks but not for marked: no candidate on that line → not inline', () => {
    // marked: one code token from line 0 to the closing ``` at the end; mermaidBlocks: block at line 1, closed by ```js.
    const text = '```mermaid\nflowchart TD\n```js\nx\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks).toHaveLength(1)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    // The candidate token starts at line 0 and the block's fence is line 0 too → paired.
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([{ kind: 'mermaid', block: blocks[0] }])
  })

  it('a closing fence indented up to 3 spaces closes for marked but not for mermaidBlocks — still paired at the opening line', () => {
    const text = '```mermaid\nflowchart TD\n   ```\nafter\n'
    const blocks = mermaidBlocks(text)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([{ kind: 'mermaid', block: blocks[0] }])
    expect(htmlOf(segments)).toContain('<p>after</p>')
  })

  it('an unclosed block runs to the end in both grammars → paired', () => {
    const text = 'x\n\n```mermaid\nflowchart TD\n  A --> B\n'
    const blocks = mermaidBlocks(text)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.map(s => s.kind)).toEqual(['html', 'mermaid'])
    expect(segments[1]).toEqual({ kind: 'mermaid', block: blocks[0] })
  })

  it('r3-M1 (i): ```mermaid inside a ~~~ fence is a mermaidBlock but not a top-level code token → not inline, the later fence still pairs right', () => {
    const text = '~~~\n```mermaid\nflowchart TD\n```\n~~~\n\n```mermaid\nclassDiagram\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks).toHaveLength(2)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    const inline = segments.filter(s => s.kind === 'mermaid')
    expect(inline).toEqual([{ kind: 'mermaid', block: blocks[1] }])
    expect(htmlOf(segments)).toContain('<pre><code>```mermaid')
  })

  it('r3-M1 (ii): ```mermaid inside a raw html block is swallowed by the html token → not inline, the next pairs right', () => {
    const text = '<div>\n```mermaid\nflowchart TD\n```\n</div>\n\n```mermaid\nclassDiagram\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks).toHaveLength(2)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([{ kind: 'mermaid', block: blocks[1] }])
  })

  it('r3-M1 (iii): a fence opened in the frontmatter that closes in the body swallows the first body fence; the second still pairs', () => {
    const text = '---\nnote: |\n```mermaid\nflowchart TD\n---\n```mermaid\nclassDiagram\n```\n\n```mermaid\nstateDiagram-v2\n```\n'
    const blocks = mermaidBlocks(text)
    // mermaidBlocks: block 0 opens in the frontmatter and closes at the body's first ```mermaid line;
    // then block 1 (stateDiagram). The body's first fence line has no block STARTING there.
    expect(blocks).toHaveLength(2)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    const inline = segments.filter(s => s.kind === 'mermaid')
    expect(inline).toEqual([{ kind: 'mermaid', block: blocks[1] }])
  })

  it('fences that are not the subset render as <pre><code>: ~~~mermaid, 4 backticks, indented, info string, inside a list', () => {
    const text = '~~~mermaid\nflowchart TD\n~~~\n\n````mermaid\nflowchart TD\n````\n\n ```mermaid\nflowchart TD\n ```\n\n```mermaid title=x\nflowchart TD\n```\n\n- item\n\n  ```mermaid\n  flowchart TD\n  ```\n'
    const blocks = mermaidBlocks(text)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([])
    expect((htmlOf(segments).match(/<pre><code/g) ?? []).length).toBeGreaterThanOrEqual(4)
  })

  it('a candidate line with no block starting there renders as <pre><code> (never a phantom figure)', () => {
    const text = '```mermaid\nflowchart TD\n```\n'
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks: [] })
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([])
    expect(htmlOf(segments)).toContain('<pre><code class="language-mermaid">flowchart TD')
  })

  it('OPEN is the exported comp-44 opening fence', () => {
    expect(OPEN.test('```mermaid')).toBe(true)
    expect(OPEN.test('```mermaid   ')).toBe(true)
    expect(OPEN.test('```mermaid x')).toBe(false)
    expect(OPEN.test(' ```mermaid')).toBe(false)
  })
})

// ------------------------------------------------------------ R6 the corpus

interface Corpus {
  components: { id: string; design: string; blocks: { index: number; code: string }[] }[]
}

const corpus = JSON.parse(readFileSync(resolve(__dirname, 'fixtures', 'mermaid-corpus.json'), 'utf8')) as Corpus

describe('renderBody — the frozen corpus (R6)', () => {
  it('every design renders without throwing and its inline diagrams are exactly the body blocks of mermaidBlocks', () => {
    for (const component of corpus.components) {
      const text = component.design
      const blocks = mermaidBlocks(text)
      const { bodyStart } = splitFrontmatter(text)
      const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
      const inline = segments.filter(s => s.kind === 'mermaid').map(s => s.kind === 'mermaid' ? s.block.code : '')
      const expected = blocks.filter(b => b.start - 1 >= bodyStart).map(b => b.code)
      expect(inline, component.id).toEqual(expected)
      expect(segments.length, component.id).toBeGreaterThan(0)
    }
  })

  it('the line-count hypothesis of the pairing: the raw of the top-level tokens covers the normalized body exactly', () => {
    // Exercised through renderBody's own bookkeeping: a fence placed on a known line pairs → the sum of raw newlines
    // before it equals its line. The corpus above proves it for 23 blocks; this is the minimal direct case.
    const text = '---\na: 1\n---\n# t\n\npara\n\n- a\n- b\n\n```mermaid\nflowchart TD\n```\n'
    const blocks = mermaidBlocks(text)
    expect(blocks[0].start - 1).toBe(10)
    const segments = renderBody(text, { sanitize: recorder().sanitize, blocks })
    expect(segments.filter(s => s.kind === 'mermaid')).toEqual([{ kind: 'mermaid', block: blocks[0] }])
  })
})

// ----------------------------------------------------- R2/R2b configureSanitizer

/** A fake DOM element: attributes in a map, a parent that records replace/remove. */
function element(tagName: string, attrs: Record<string, string> = {}, opts: { detached?: boolean } = {}) {
  const map = new Map(Object.entries(attrs))
  const parent = {
    replaced: [] as { oldNode: unknown; newNode: FakeEl }[],
    removed: [] as unknown[],
    replaceChild(newNode: FakeEl, oldNode: unknown) { this.replaced.push({ oldNode, newNode }) },
    removeChild(node: unknown) { this.removed.push(node) },
  }
  const created: FakeEl[] = []
  const el: FakeEl = {
    tagName: tagName.toUpperCase(),
    nodeType: 1,
    textContent: '',
    parentNode: opts.detached ? null : parent,
    ownerDocument: {
      createElement(tag: string) {
        const child = element(tag)
        created.push(child.el)
        return child.el
      },
    },
    getAttribute: (name: string) => map.get(name) ?? null,
    hasAttribute: (name: string) => map.has(name),
    setAttribute: (name: string, value: string) => { map.set(name, value) },
    removeAttribute: (name: string) => { map.delete(name) },
  }
  return { el, attrs: map, parent, created }
}

interface FakeEl {
  tagName: string
  nodeType: number
  textContent: string
  parentNode: { replaceChild(n: FakeEl, o: unknown): void; removeChild(n: unknown): void } | null
  ownerDocument: { createElement(tag: string): FakeEl }
  getAttribute(name: string): string | null
  hasAttribute(name: string): boolean
  setAttribute(name: string, value: string): void
  removeAttribute(name: string): void
}

/** A PurifyLike double that records the config and keeps the hooks callable. */
function purifyDouble() {
  const hooks = new Map<string, ((node: FakeEl, event?: { tagName: string }) => void)[]>()
  const double = {
    config: null as Record<string, unknown> | null,
    sanitized: [] as string[],
    setConfig(cfg: Record<string, unknown>) { double.config = cfg },
    addHook(name: string, fn: (node: FakeEl, event?: { tagName: string }) => void) {
      hooks.set(name, [...(hooks.get(name) ?? []), fn])
    },
    sanitize(html: string) { double.sanitized.push(html); return `clean(${html})` },
    run(name: string, node: FakeEl, event?: { tagName: string }) { for (const fn of hooks.get(name) ?? []) fn(node, event) },
    hookNames: () => [...hooks.keys()],
  }
  return double
}

describe('configureSanitizer (R2/R2b) — the policy on the injected instance', () => {
  it('sets the html-only profile, the forbid lists, and no data-/aria- attributes; returns a sanitize bound to the instance', () => {
    const purify = purifyDouble()
    const sanitize = configureSanitizer(purify as unknown as PurifyLike)
    expect(purify.config).toMatchObject({
      USE_PROFILES: { html: true },
      FORBID_TAGS,
      FORBID_ATTR,
      ALLOW_DATA_ATTR: false,
      ALLOW_ARIA_ATTR: false,
    })
    expect(FORBID_TAGS).toEqual(expect.arrayContaining(['style', 'form', 'button', 'select', 'textarea', 'audio', 'video', 'source', 'track', 'iframe', 'object', 'embed', 'dialog']))
    expect(FORBID_ATTR).toEqual(expect.arrayContaining(['style', 'id', 'name', 'class', 'srcset', 'poster', 'background']))
    expect(sanitize('<p>x</p>')).toBe('clean(<p>x</p>)')
    expect(purify.hookNames()).toEqual(expect.arrayContaining(['uponSanitizeElement', 'afterSanitizeAttributes']))
  })

  describe('afterSanitizeAttributes — href policy', () => {
    const configured = () => { const p = purifyDouble(); configureSanitizer(p as unknown as PurifyLike); return p }

    it('https: and http: → target _blank + rel noopener noreferrer (case-insensitive scheme)', () => {
      const p = configured()
      for (const href of ['https://example.com', 'http://x', 'HTTPS://Example.com/p']) {
        const { el, attrs } = element('a', { href })
        p.run('afterSanitizeAttributes', el)
        expect(attrs.get('href'), href).toBe(href)
        expect(attrs.get('target'), href).toBe('_blank')
        expect(attrs.get('rel'), href).toBe('noopener noreferrer')
      }
    })

    it('mailto:, tel: and #anchor keep the href, get rel, and never target', () => {
      const p = configured()
      for (const href of ['mailto:a@b.c', 'tel:+55', '#r1']) {
        const { el, attrs } = element('a', { href, target: '_blank' })
        p.run('afterSanitizeAttributes', el)
        expect(attrs.get('href'), href).toBe(href)
        expect(attrs.has('target'), href).toBe(false)
        expect(attrs.get('rel'), href).toBe('noopener noreferrer')
      }
    })

    it('any other href — javascript:, ftp:, relative, protocol-relative — is removed (the text stays)', () => {
      const p = configured()
      for (const href of ['javascript:alert(1)', 'ftp://x', '/local', 'page.md', '//evil.example/x', 'sms:1', ' JAVASCRIPT:x']) {
        const { el, attrs } = element('a', { href })
        p.run('afterSanitizeAttributes', el)
        expect(attrs.has('href'), href).toBe(false)
        expect(attrs.has('target'), href).toBe(false)
      }
    })

    it('applies to any element carrying href (area), and ignores elements without one', () => {
      const p = configured()
      const area = element('area', { href: '//x' })
      p.run('afterSanitizeAttributes', area.el)
      expect(area.attrs.has('href')).toBe(false)
      const span = element('span', { title: 't' })
      p.run('afterSanitizeAttributes', span.el)
      expect(span.attrs.get('title')).toBe('t')
    })

    it('tolerates a detached node and a text node', () => {
      const p = configured()
      const detached = element('a', { href: 'https://x' }, { detached: true })
      expect(() => { p.run('afterSanitizeAttributes', detached.el) }).not.toThrow()
      const text = { nodeType: 3 } as unknown as FakeEl
      expect(() => { p.run('afterSanitizeAttributes', text) }).not.toThrow()
    })
  })

  describe('uponSanitizeElement — img and input', () => {
    const configured = () => { const p = purifyDouble(); configureSanitizer(p as unknown as PurifyLike); return p }

    it('IMG with a remote src is replaced by a span "[alt]" titled with the src; data:image/ stays intact', () => {
      const p = configured()
      const remote = element('img', { src: 'https://example.invalid/p.gif', alt: 'pixel' })
      p.run('uponSanitizeElement', remote.el, { tagName: 'img' })
      expect(remote.parent.replaced).toHaveLength(1)
      const span = remote.parent.replaced[0].newNode
      expect(span.tagName).toBe('SPAN')
      expect(span.textContent).toBe('[pixel]')
      expect(span.getAttribute('title')).toBe('imagem remota não carregada: https://example.invalid/p.gif')
      expect(span.hasAttribute('class')).toBe(false)

      const data = element('img', { src: 'data:image/png;base64,AAAA', alt: 'ok' })
      p.run('uponSanitizeElement', data.el, { tagName: 'img' })
      expect(data.parent.replaced).toEqual([])
      expect(data.attrs.get('src')).toBe('data:image/png;base64,AAAA')
    })

    it('IMG without alt → "[imagem]"; IMG without src → replaced too (never a broken icon); DATA:IMAGE/ is case-insensitive', () => {
      const p = configured()
      const noAlt = element('img', { src: 'https://x/y.png' })
      p.run('uponSanitizeElement', noAlt.el, { tagName: 'img' })
      expect(noAlt.parent.replaced[0].newNode.textContent).toBe('[imagem]')
      const noSrc = element('img', { alt: 'a' })
      p.run('uponSanitizeElement', noSrc.el, { tagName: 'img' })
      expect(noSrc.parent.replaced).toHaveLength(1)
      const upper = element('img', { src: 'DATA:IMAGE/gif;base64,R0' })
      p.run('uponSanitizeElement', upper.el, { tagName: 'img' })
      expect(upper.parent.replaced).toEqual([])
    })

    it('INPUT type=text is removed; INPUT checkbox survives with disabled forced', () => {
      const p = configured()
      const text = element('input', { type: 'text' })
      p.run('uponSanitizeElement', text.el, { tagName: 'input' })
      expect(text.parent.removed).toEqual([text.el])
      const box = element('input', { type: 'checkbox', checked: '' })
      p.run('uponSanitizeElement', box.el, { tagName: 'input' })
      expect(box.parent.removed).toEqual([])
      expect(box.attrs.get('disabled')).toBe('')
      const noType = element('input', {})
      p.run('uponSanitizeElement', noType.el, { tagName: 'input' })
      expect(noType.parent.removed).toEqual([noType.el])
    })

    it('only acts on img/input by the event tagName; text nodes and detached nodes never throw', () => {
      const p = configured()
      const div = element('div', { src: 'https://x' })
      p.run('uponSanitizeElement', div.el, { tagName: 'div' })
      expect(div.attrs.get('src')).toBe('https://x')
      const text = { nodeType: 3 } as unknown as FakeEl
      expect(() => { p.run('uponSanitizeElement', text, { tagName: '#text' }) }).not.toThrow()
      const detached = element('img', { src: 'https://x' }, { detached: true })
      expect(() => { p.run('uponSanitizeElement', detached.el, { tagName: 'img' }) }).not.toThrow()
      const detachedInput = element('input', { type: 'text' }, { detached: true })
      expect(() => { p.run('uponSanitizeElement', detachedInput.el, { tagName: 'input' }) }).not.toThrow()
    })
  })
})

// ------------------------------------------------------------ R1 the modes

describe('modeByDefault / followMode (R1)', () => {
  it('modeByDefault: view when the text has content, write when empty or whitespace', () => {
    expect(modeByDefault('# x')).toBe('view')
    expect(modeByDefault('')).toBe('write')
    expect(modeByDefault('  \n ')).toBe('write')
  })

  it('followMode: an untouched, clean artifact going from empty to text moves to view', () => {
    expect(followMode('write', { touched: false, dirty: false, prevText: '', nextText: '# now' })).toBe('view')
  })

  it('followMode: touched keeps the mode; dirty keeps the mode', () => {
    expect(followMode('write', { touched: true, dirty: false, prevText: '', nextText: '# now' })).toBe('write')
    expect(followMode('write', { touched: false, dirty: true, prevText: '', nextText: '# now' })).toBe('write')
    expect(followMode('view', { touched: true, dirty: false, prevText: 'a', nextText: '' })).toBe('view')
  })

  it('followMode: text → text and text → empty keep the mode', () => {
    expect(followMode('view', { touched: false, dirty: false, prevText: 'a', nextText: 'b' })).toBe('view')
    expect(followMode('write', { touched: false, dirty: false, prevText: 'a', nextText: 'b' })).toBe('write')
    expect(followMode('view', { touched: false, dirty: false, prevText: 'a', nextText: '' })).toBe('view')
  })
})

describe('escapeHtml', () => {
  it('escapes the five characters', () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&#39;&lt;/a&gt;')
  })
})
