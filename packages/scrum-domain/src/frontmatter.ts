/**
 * Frontmatter mini-parser (v0.12, comp-42 R9). Spiral artifacts are markdown
 * with an optional YAML block at the very top (`---` fences) carrying the
 * metadata agents query — phase, review verdicts, requirement ids, traces.
 * This is deliberately a subset of YAML, enough for those blocks and free of
 * any runtime dependency: scalars (strings, quoted strings, numbers,
 * booleans, null), inline lists `[a, b]`, inline objects `{ k: v }`, block
 * lists (`- item`) and ONE level of block objects. It never throws: a
 * malformed block yields `meta: null` and the whole text as body.
 * @module @scrum-harness/domain/frontmatter
 */

/** Parsed frontmatter: the metadata object (null when absent/malformed) and the markdown body. */
export interface Frontmatter {
  meta: Record<string, unknown> | null
  body: string
}

/** Thrown internally on a shape the subset does not cover; never escapes. */
class Malformed extends Error {}

/**
 * Split a frontmatter block off a markdown text.
 * @param text - the artifact text.
 * @returns the metadata and the body (the text after the closing fence).
 */
export function parseFrontmatter(text: string): Frontmatter {
  const none: Frontmatter = { meta: null, body: text }
  if (!text.startsWith('---\n') && text !== '---') return none
  const lines = text.split('\n')
  const close = lines.findIndex((line, index) => index > 0 && line.trim() === '---')
  if (close === -1) return none
  try {
    const meta = parseBlock(lines.slice(1, close))
    return { meta, body: lines.slice(close + 1).join('\n') }
  } catch (error) {
    if (error instanceof Malformed) return none
    throw error
  }
}

/** One meaningful line of the block: its indentation and trimmed text. */
interface Line { indent: number; text: string }

/** Drop blank and comment lines; measure indentation. */
function meaningful(raw: string[]): Line[] {
  const out: Line[] = []
  for (const line of raw) {
    const text = line.trim()
    if (text.length === 0 || text.startsWith('#')) continue
    out.push({ indent: line.length - line.trimStart().length, text })
  }
  return out
}

/**
 * Parse the top-level block: `key: value` lines, where an empty value opens
 * a nested block (list items or one level of `key: value` pairs).
 */
function parseBlock(raw: string[]): Record<string, unknown> {
  const lines = meaningful(raw)
  const meta: Record<string, unknown> = {}
  let i = 0
  while (i < lines.length) {
    const line = lines[i]!
    if (line.indent !== 0) throw new Malformed('unexpected indentation')
    const { key, rest } = splitPair(line.text)
    if (rest.length > 0) {
      meta[key] = parseValue(rest)
      i += 1
      continue
    }
    // Nested block: gather the indented lines that follow.
    const nested: Line[] = []
    i += 1
    while (i < lines.length && lines[i]!.indent > 0) nested.push(lines[i++]!)
    meta[key] = parseNested(nested)
  }
  return meta
}

/** A nested block is either a list of `- item` lines or a flat object. */
function parseNested(lines: Line[]): unknown {
  if (lines.length === 0) return null
  if (lines.every(l => l.text.startsWith('- '))) {
    return lines.map(l => parseValue(l.text.slice(2).trim()))
  }
  if (lines.some(l => l.text.startsWith('- '))) throw new Malformed('mixed list and map')
  const object: Record<string, unknown> = {}
  for (const line of lines) {
    const { key, rest } = splitPair(line.text)
    if (rest.length === 0) throw new Malformed('block nesting deeper than one level')
    object[key] = parseValue(rest)
  }
  return object
}

/** Split `key: value` at the first colon outside quotes; the key is required. */
function splitPair(text: string): { key: string; rest: string } {
  const at = text.indexOf(':')
  if (at <= 0) throw new Malformed(`no key in '${text}'`)
  const key = text.slice(0, at).trim()
  if (key.length === 0 || key.startsWith('"') || key.startsWith("'")) throw new Malformed('bad key')
  return { key, rest: text.slice(at + 1).trim() }
}

/** Parse one scalar or inline structure. */
function parseValue(text: string): unknown {
  const value = text.trim()
  if (value.startsWith('[')) {
    if (!value.endsWith(']')) throw new Malformed('unterminated list')
    return splitTop(value.slice(1, -1)).map(parseValue)
  }
  if (value.startsWith('{')) {
    if (!value.endsWith('}')) throw new Malformed('unterminated object')
    const object: Record<string, unknown> = {}
    for (const pair of splitTop(value.slice(1, -1))) {
      const { key, rest } = splitPair(pair)
      object[key] = parseValue(rest)
    }
    return object
  }
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.length >= 2 ? value.slice(1, -1) : value
  }
  if (value === 'true') return true
  if (value === 'false') return false
  if (value === 'null' || value === '~') return null
  if (/^-?\d+(\.\d+)?$/.test(value)) return Number(value)
  return value
}

/** Split on commas at bracket depth 0 and outside quotes; drop empty parts. */
function splitTop(text: string): string[] {
  const parts: string[] = []
  let depth = 0
  let quote: string | null = null
  let current = ''
  for (const char of text) {
    if (quote !== null) {
      current += char
      if (char === quote) quote = null
      continue
    }
    if (char === '"' || char === "'") { quote = char; current += char; continue }
    if (char === '[' || char === '{') depth += 1
    if (char === ']' || char === '}') depth -= 1
    if (char === ',' && depth === 0) { parts.push(current); current = ''; continue }
    current += char
  }
  parts.push(current)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}
