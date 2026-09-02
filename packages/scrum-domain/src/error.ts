/**
 * The domain's error type, in its own module so both the service and the
 * contracts can throw it without importing each other.
 * @module @scrum-harness/domain/error
 */

/** Stable machine-routable error for a rejected SCRUM operation. */
export class ScrumError extends Error {
  /**
   * @param code - stable kebab-case classification (e.g. `not-found`,
   * `sprint-already-active`, `task-not-in-active-sprint`, `validation`).
   * @param message - human-readable explanation.
   */
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ScrumError'
  }
}
