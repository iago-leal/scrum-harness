/**
 * SCRUM domain plugin for DeepSeek Harness. Default-exports the `ctx.scrum`
 * Service class (Cordis mounts it); re-exports the domain spec, record types
 * and service input types for the tool/command/API/UI consumers.
 * @module @scrum-harness/domain
 */

import { ScrumService } from './service.ts'

export * from './spec.ts'
export * from './service.ts'
export * from './format.ts'

export default ScrumService
