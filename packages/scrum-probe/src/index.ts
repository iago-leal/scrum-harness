/**
 * Workspace probes for the SCRUM plugins (v0.24, comp-59 R4): the
 * Controller-side "only look" layer shared by the tools, the `/scrum`
 * command and the HTTP API. Nothing here is a rule — every judgement lives
 * in `@scrum-harness/domain`, which receives the plain data these return.
 * @module @scrum-harness/probe
 */

export { listWorkspaceFiles, resolveWorkspacePath } from './files.ts'
export { listSpecFiles } from './specs.ts'
export type { SpecFile, SpecsProbe } from './specs.ts'
