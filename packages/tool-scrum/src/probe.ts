/**
 * Re-export shim (v0.24, comp-59 R4): the `scrum_trace` probe moved to
 * `@scrum-harness/probe` so the command and the API can share it; this path
 * stays so comp-49's archived traceability matrix keeps resolving.
 * @module @scrum-harness/tool-scrum/probe
 */
export { listWorkspaceFiles, resolveWorkspacePath } from '@scrum-harness/probe'
