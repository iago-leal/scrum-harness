/**
 * The spec set of THIS repository (comp-61 R4): the only suite that reads
 * the real disk — `<repo>/specs` through the real probe — and the drift
 * detector of chapter 7: a spec edited without a version bump and a fresh
 * review turns its review `stale` and this file red. Written BEFORE the
 * specs existed (TDD): red on `exists` until the PRD is written, red on the
 * reviews until the seventh human stamp.
 *
 * Test-only exception to comp-59 D5 ("neither package imports the other"):
 * the domain's tests import the probe through its `./src/*` export, the
 * same mechanism `test-support` fixtures already use.
 */
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { listSpecFiles } from '@scrum-harness/probe/src/specs.ts'
import { SPEC_FILE_CAP, SpecSet } from '../src/specs.ts'

const REPO_ROOT = fileURLToPath(new URL('../../..', import.meta.url))
const PIPELINE = ['PRD.md', 'GLOSSARY.md', 'RULES.md', 'ARCHITECTURE.md', 'API_SPEC.md', 'TESTS_SPEC.md', 'AGENTS.md'] as const

describe('specs/ of this repository (comp-61 R4)', () => {
  const set = SpecSet.of(listSpecFiles(REPO_ROOT, SPEC_FILE_CAP))

  it('exists and is complete: the minimal set approved, nothing invalid, nothing unknown', () => {
    expect(set.exists, 'specs/ ausente — comp-61 em andamento (scrum_spec_status)').toBe(true)
    expect(set.summary.invalid, `invalid: ${set.entries.filter(e => e.state === 'invalid').map(e => `${e.file}: ${e.reasons.join('; ')}`).join(' | ')}`).toBe(0)
    expect(set.summary.unknown).toBe(0)
    expect(set.unknownReviews).toEqual([])
    expect(set.summary.complete, 'minimal set not approved — comp-61 em andamento').toBe(true)
  })

  it('the seven files of the pipeline are approved, each with a current review', () => {
    for (const file of PIPELINE) {
      const entry = set.entries.find(e => e.file === file)!
      expect(entry.state, `${file} is ${entry.state} — comp-61 em andamento`).toBe('approved')
      expect(entry.review?.state, `${file} review: ${entry.review?.state ?? 'none'} ${entry.review?.reasons.join('; ') ?? ''}`).toBe('current')
    }
    expect(set.summary.reviewed).toBe(set.summary.present)
  })
})
