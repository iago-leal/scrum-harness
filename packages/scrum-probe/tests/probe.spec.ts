/**
 * The workspace probes (v0.24, comp-59 R4): environment only — they look at
 * the disk and hand plain data to the Model, which owns every rule.
 * `listSpecFiles` reads `<cwd>/specs/*.md` flat; `listWorkspaceFiles` /
 * `resolveWorkspacePath` are the `scrum_trace` probe moved here from
 * tool-scrum (comp-49 R6), tests carried along unchanged.
 * Written BEFORE the code (TDD).
 */
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listSpecFiles, listWorkspaceFiles, resolveWorkspacePath } from '../src/index.ts'

const CAP = 256 * 1024

describe('listSpecFiles (comp-59 R4)', () => {
  let ws: string
  beforeEach(() => { ws = mkdtempSync(join(tmpdir(), 'scrum-specs-')) })
  afterEach(() => { rmSync(ws, { recursive: true, force: true }) })

  it('absent when specs/ does not exist or is a broken symlink; not-a-directory when it is a file', () => {
    expect(listSpecFiles(ws, CAP)).toEqual({ kind: 'absent' })
    symlinkSync(join(ws, 'nowhere'), join(ws, 'specs'))
    expect(listSpecFiles(ws, CAP)).toEqual({ kind: 'absent' })
    unlinkSync(join(ws, 'specs'))
    writeFileSync(join(ws, 'specs'), 'a file named specs')
    expect(listSpecFiles(ws, CAP)).toEqual({ kind: 'not-a-directory' })
  })

  it('lists only regular .md files (exact extension), flat, dot-names skipped, code-point order, with size and text', () => {
    mkdirSync(join(ws, 'specs', 'nested'), { recursive: true })
    writeFileSync(join(ws, 'specs', 'RULES.md'), 'R1 — a')
    writeFileSync(join(ws, 'specs', 'PRD.md'), 'prd')
    writeFileSync(join(ws, 'specs', 'notes.md'), 'ñ')
    writeFileSync(join(ws, 'specs', 'UPPER.MD'), 'upper ext') // a distinct name: macOS's FS is case-insensitive
    writeFileSync(join(ws, 'specs', 'X.markdown'), 'other ext')
    writeFileSync(join(ws, 'specs', 'README'), 'no ext')
    writeFileSync(join(ws, 'specs', '.hidden.md'), 'dot')
    writeFileSync(join(ws, 'specs', 'nested', 'DEEP.md'), 'deep')
    writeFileSync(join(ws, 'target.md'), 'linked')
    symlinkSync(join(ws, 'target.md'), join(ws, 'specs', 'LINK.md'))
    expect(listSpecFiles(ws, CAP)).toEqual({
      kind: 'dir',
      files: [
        { name: 'PRD.md', size: 3, text: 'prd' },
        { name: 'RULES.md', size: Buffer.byteLength('R1 — a'), text: 'R1 — a' },
        { name: 'notes.md', size: 2, text: 'ñ' },
      ],
    })
  })

  it('an empty specs/ is a dir with no files; specs as a symlink to a directory is followed', () => {
    mkdirSync(join(ws, 'real'))
    writeFileSync(join(ws, 'real', 'PRD.md'), 'x')
    symlinkSync(join(ws, 'real'), join(ws, 'specs'))
    expect(listSpecFiles(ws, CAP)).toEqual({ kind: 'dir', files: [{ name: 'PRD.md', size: 1, text: 'x' }] })
    unlinkSync(join(ws, 'specs')) // the symlink itself, not its target
    mkdirSync(join(ws, 'specs'))
    expect(listSpecFiles(ws, CAP)).toEqual({ kind: 'dir', files: [] })
  })

  it('above the cap the text is not read (size travels); at the cap it is', () => {
    mkdirSync(join(ws, 'specs'))
    writeFileSync(join(ws, 'specs', 'BIG.md'), 'x'.repeat(11))
    writeFileSync(join(ws, 'specs', 'OK.md'), 'x'.repeat(10))
    expect(listSpecFiles(ws, 10)).toEqual({
      kind: 'dir',
      files: [{ name: 'BIG.md', size: 11 }, { name: 'OK.md', size: 10, text: 'x'.repeat(10) }],
    })
  })

  it.skipIf(process.platform === 'win32' || process.getuid?.() === 0)(
    'a file that cannot be read is reported unreadable with size 0 and no text — the error never propagates (D2)',
    () => {
      mkdirSync(join(ws, 'specs'))
      writeFileSync(join(ws, 'specs', 'PRD.md'), 'secret')
      chmodSync(join(ws, 'specs', 'PRD.md'), 0o000)
      try {
        expect(listSpecFiles(ws, CAP)).toEqual({ kind: 'dir', files: [{ name: 'PRD.md', size: 0, unreadable: true }] })
      } finally {
        chmodSync(join(ws, 'specs', 'PRD.md'), 0o644)
      }
    },
  )
})

describe('listWorkspaceFiles / resolveWorkspacePath (comp-49 R6, moved from tool-scrum)', () => {
  let ws: string
  beforeEach(() => {
    ws = mkdtempSync(join(tmpdir(), 'scrum-trace-'))
    for (const dir of ['src', 'tests', 'dist', 'lib', 'node_modules', '.hidden', 'src/nested']) mkdirSync(join(ws, dir), { recursive: true })
    for (const file of ['src/a.ts', 'src/untraced.ts', 'src/nested/deep.ts', 'tests/a.spec.ts', 'dist/out.js', 'lib/l.js', 'node_modules/x.js', '.hidden/y.ts', 'keep', 'debug.log', 'README.md']) {
      writeFileSync(join(ws, file), '')
    }
  })
  afterEach(() => { rmSync(ws, { recursive: true, force: true }) })

  it('the probe is environment only', () => {
    const ignore = new Set(['dist', 'lib'])
    expect(listWorkspaceFiles(ws, 'src', ignore, 500)).toEqual({ files: ['src/a.ts', 'src/nested/deep.ts', 'src/untraced.ts'], truncated: false })
    expect(listWorkspaceFiles(ws, 'src/a.ts', ignore, 500)).toEqual({ files: ['src/a.ts'], truncated: false })
    expect(listWorkspaceFiles(ws, 'src/gone.ts', ignore, 500)).toEqual({ files: [], truncated: false })
    expect(listWorkspaceFiles(ws, 'nowhere', ignore, 500)).toEqual({ files: [], truncated: false })
    expect(listWorkspaceFiles(ws, '', new Set(), 500).files).toEqual([
      'README.md', 'debug.log', 'dist/out.js', 'keep', 'lib/l.js', 'src/a.ts', 'src/nested/deep.ts', 'src/untraced.ts', 'tests/a.spec.ts',
    ])
    const capped = listWorkspaceFiles(ws, '', ignore, 3)
    expect(capped.files).toHaveLength(3)
    expect(capped.truncated).toBe(true)

    expect(resolveWorkspacePath('/w/s', '/w/s/src/a.ts')).toBe('src/a.ts')
    expect(resolveWorkspacePath('/w/s/', '/w/s')).toBe('')
    expect(resolveWorkspacePath('/w/s', '/w/s2/a.ts')).toBeNull()
    expect(resolveWorkspacePath('/w/s', '/w/s/../x.ts')).toBeNull()
    expect(resolveWorkspacePath('/var/folders/x', '/var/folders/x/y.ts')).toBe('y.ts')
  })
})
