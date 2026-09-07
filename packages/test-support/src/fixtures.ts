/**
 * Pure fixtures for the spiral's requirements gate (comp-46 R8 / L-c):
 * an approved v1 requirements artifact and an approved round-1 review that
 * covers a given digest. Shared by the domain and the context-scrum specs.
 * No imports on purpose — this package does not reference the domain and
 * `tsc --build` compiles `src/**`; the caller obtains the digest at runtime
 * through `board.reviewBrief(id).requirements.digest`.
 * @module @scrum-harness/test-support/fixtures
 */

/** An approved v1 requirements artifact (frontmatter version + status + a body). */
export const CONTRACT_REQ = '---\nversion: 1\nstatus: approved\n---\nR1 — the component must work.'

/**
 * An approved round-1 review covering CONTRACT_REQ.
 * @param digest - the requirements digest as `reviewBrief` reports it.
 * @returns the review artifact text.
 */
export function contractReview(digest: string): string {
  return `---\nreviewer: subagent\nreviewed_version: 1\nreviewed_digest: ${digest}\nverdict: approved\nround: 1\nfindings: { high: 0, medium: 0, low: 0 }\n---\nNo blocking finding.`
}

/**
 * A design whose frontmatter carries a complete traceability matrix for
 * CONTRACT_REQ's single R1 (comp-49 R11): the design → tdd gate reads it.
 */
export const CONTRACT_DESIGN = '---\ntraces:\n  - { req: [R1], files: [src/a.ts], tests: [tests/a.spec.ts] }\n---\nDesign.'

// ── comp-60: the project spec set on disk (specs/*.md + specs/reviews/*.review.md) ──

/** Owner of each canonical spec file (mirrors the domain's catalog; no import on purpose). */
const SPEC_OWNER: Record<string, string> = {
  'PRD.md': 'product', 'GLOSSARY.md': 'domain', 'RULES.md': 'domain',
  'ARCHITECTURE.md': 'architect', 'TECH_STACK.md': 'architect', 'SECURITY.md': 'architect',
  'API_SPEC.md': 'api-data', 'DATABASE_SCHEMA.md': 'api-data', 'UI_UX_SPEC.md': 'api-data',
  'TESTS_SPEC.md': 'test', 'AGENTS.md': 'agents', 'WORKFLOW.md': 'agents', 'PROMPTS.md': 'agents',
  'TASKS.md': 'ops', 'README.md': 'ops',
}

/**
 * A valid spec file text for `file` (comp-60 R11): frontmatter with the five
 * contract keys, then a body.
 * @param file - catalog file name.
 * @param over - version (1), status (draft), body ('Body.'), owner (the catalog's).
 */
export function specText(file: string, over: { version?: number; status?: 'draft' | 'approved'; body?: string; owner?: string } = {}): string {
  const owner = over.owner ?? SPEC_OWNER[file] ?? 'product'
  return `---\ntitle: "${file}"\npurpose: "What ${file} is for."\nversion: ${over.version ?? 1}\nstatus: ${over.status ?? 'draft'}\nowner: ${owner}\n---\n${over.body ?? 'Body.'}`
}

/**
 * A spec review file text (comp-60 R2): the review frontmatter covering one
 * version and digest of `file`, then a body.
 * @param file - the spec file the review covers.
 * @param over - version, digest (quoted by the fixture), verdict (approved), high (0), round (1), body.
 */
export function specReviewText(file: string, over: { version: number; digest: string; verdict?: 'approved' | 'needs-revision'; high?: number; round?: number; body?: string }): string {
  return `---\nfile: ${file}\nreviewer: subagent\nreviewed_version: ${over.version}\nreviewed_digest: "${over.digest}"\nverdict: ${over.verdict ?? 'approved'}\nround: ${over.round ?? 1}\nfindings: { high: ${over.high ?? 0}, medium: 0, low: 0 }\n---\n${over.body ?? 'No blocking finding.'}`
}
