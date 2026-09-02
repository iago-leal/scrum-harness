/**
 * Frontmatter mini-parser (comp-42, R9): artifacts are markdown with an
 * optional YAML frontmatter block that agents query. Written BEFORE the
 * implementation (TDD). The parser covers the subset the artifacts use —
 * scalars, inline lists, one-level objects, `- item` blocks — and never
 * throws: malformed input yields `meta: null` and the whole text as body.
 */
import { describe, expect, it } from 'vitest'
import { parseFrontmatter } from '../src/frontmatter.ts'

describe('parseFrontmatter', () => {
  it('returns meta null and the whole text when there is no frontmatter', () => {
    expect(parseFrontmatter('## Requisitos\nR1')).toEqual({ meta: null, body: '## Requisitos\nR1' })
    expect(parseFrontmatter('')).toEqual({ meta: null, body: '' })
    // A dash line that is not at the very top is just markdown.
    expect(parseFrontmatter('intro\n---\nkey: v\n---\n').meta).toBeNull()
  })

  it('parses scalars: strings, quoted strings, numbers, booleans, null', () => {
    const { meta, body } = parseFrontmatter([
      '---',
      'component: comp-42',
      'phase: tdd',
      'title: "quoted: with colon"',
      "single: 'a b'",
      'points: 3',
      'ratio: 1.5',
      'approved: true',
      'blocked: false',
      'reviewer: null',
      '---',
      '## Body',
    ].join('\n'))
    expect(meta).toEqual({
      component: 'comp-42', phase: 'tdd', title: 'quoted: with colon', single: 'a b',
      points: 3, ratio: 1.5, approved: true, blocked: false, reviewer: null,
    })
    expect(body).toBe('## Body')
  })

  it('parses inline lists and one-level inline objects', () => {
    const { meta } = parseFrontmatter([
      '---',
      'requirements: [R1, R2, R7b]',
      'empty: []',
      'findings: { high: 4, medium: 8, low: 6 }',
      'trace: { req: [R3, R4], files: [a.ts, b.ts] }',
      '---',
    ].join('\n'))
    expect(meta).toEqual({
      requirements: ['R1', 'R2', 'R7b'],
      empty: [],
      findings: { high: 4, medium: 8, low: 6 },
      trace: { req: ['R3', 'R4'], files: ['a.ts', 'b.ts'] },
    })
  })

  it('parses block lists (`- item`) including list items that are inline objects', () => {
    const { meta } = parseFrontmatter([
      '---',
      'feeds:',
      '  - comp-43',
      '  - comp-47',
      'traces:',
      '  - { req: [R1], files: [spec.ts], tests: [domain.spec.ts] }',
      '  - { req: [R9], files: [frontmatter.ts], tests: [frontmatter.spec.ts] }',
      'after: yes-a-string',
      '---',
    ].join('\n'))
    expect(meta).toEqual({
      feeds: ['comp-43', 'comp-47'],
      traces: [
        { req: ['R1'], files: ['spec.ts'], tests: ['domain.spec.ts'] },
        { req: ['R9'], files: ['frontmatter.ts'], tests: ['frontmatter.spec.ts'] },
      ],
      after: 'yes-a-string',
    })
  })

  it('parses one level of nested block objects', () => {
    const { meta } = parseFrontmatter([
      '---',
      'review:',
      '  by: subagent',
      '  verdict: needs-revision',
      '  findings: { high: 4 }',
      'phase: design',
      '---',
    ].join('\n'))
    expect(meta).toEqual({
      review: { by: 'subagent', verdict: 'needs-revision', findings: { high: 4 } },
      phase: 'design',
    })
  })

  it('ignores comments and blank lines inside the block; keeps the body verbatim', () => {
    const text = '---\n# a comment\nphase: tdd\n\n---\n\n## Body\n\nline with --- inside\n'
    const { meta, body } = parseFrontmatter(text)
    expect(meta).toEqual({ phase: 'tdd' })
    expect(body).toBe('\n## Body\n\nline with --- inside\n')
  })

  it('never throws: unterminated or malformed blocks yield meta null and the full text', () => {
    const open = '---\nphase: tdd\n## no closing fence'
    expect(parseFrontmatter(open)).toEqual({ meta: null, body: open })
    const bad = '---\nthis line has no colon\n---\nbody'
    expect(parseFrontmatter(bad)).toEqual({ meta: null, body: bad })
  })
})
