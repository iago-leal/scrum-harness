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
