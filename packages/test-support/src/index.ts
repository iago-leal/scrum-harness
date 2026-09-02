/**
 * Test-only storage backend for the SCRUM suites (comp-50 R5).
 *
 * The JSON backend publishes every mutation with `writeAtomic` — temp file,
 * fsync, rename, fsync of the directory — which costs ~17ms per write on an
 * APFS SSD. A domain test performs dozens of mutations, so a suite of a few
 * hundred writes spends its wall time in fsync, not in the code under test.
 * This backend keeps units in memory behind the SAME `kv` facet, so a suite
 * still exercises the real storage hub, storage-domain and ScrumService —
 * only the medium is a Map. Persistence and close/reopen suites keep using
 * the JSON backend: durability is what they prove.
 *
 * Registered under the backend name `memory`; route domains to it with
 * `ctx.plugin(StorageDomain, { backend: 'memory' })`.
 * @module @scrum-harness/test-support
 */

import type { Context } from '@deepseek-ai/cordis'
import type { KvUnit, KvUnitDescriptor, StorageBackend } from '@deepseek-ai/dsh-storage'
import { storageBackendServiceKey } from '@deepseek-ai/dsh-storage'

/** Cordis plugin name. */
export const name = 'storage-memory'
/** Needs the storage hub to register on. */
export const inject = ['storage']

/** The backend name domains are routed to. */
export const MEMORY_BACKEND = 'memory'

/** One in-memory unit: tables of records plus the optional global value. */
class MemoryUnit implements KvUnit {
  private readonly tables = new Map<string, Map<string, unknown>>()
  private global: unknown = null

  constructor(descriptor: KvUnitDescriptor) {
    for (const table of descriptor.tables) this.tables.set(table, new Map())
  }

  async loadAll(): Promise<{ tables: Record<string, Record<string, unknown>>; global: unknown }> {
    const tables: Record<string, Record<string, unknown>> = {}
    for (const [table, records] of this.tables) tables[table] = Object.fromEntries(records)
    return { tables, global: this.global }
  }

  async putRecord(table: string, key: string, value: unknown): Promise<void> {
    this.tables.get(table)?.set(key, structuredClone(value))
  }

  async deleteRecord(table: string, key: string): Promise<void> {
    this.tables.get(table)?.delete(key)
  }

  async setGlobal(value: unknown): Promise<void> {
    this.global = structuredClone(value)
  }

  async close(): Promise<void> {}
}

/** Memory backend: serves the `kv` facet from a Map of units, one per unit name. */
export class MemoryStorageBackend implements StorageBackend {
  private readonly units = new Map<string, MemoryUnit>()

  readonly kv = {
    open: async (descriptor: KvUnitDescriptor): Promise<KvUnit> => {
      let unit = this.units.get(descriptor.name)
      if (unit === undefined) {
        unit = new MemoryUnit(descriptor)
        this.units.set(descriptor.name, unit)
      }
      return unit
    },
  }

  async close(): Promise<void> {
    this.units.clear()
  }
}

/**
 * Register the `memory` backend on the storage hub.
 * @param ctx - plugin context.
 */
export function apply(ctx: Context): void {
  const backend = new MemoryStorageBackend()
  ctx.effect(() => {
    const unregister = ctx.storage.backend.register(MEMORY_BACKEND, backend)
    return async () => {
      unregister()
      await backend.close()
    }
  })
  ctx.provide(storageBackendServiceKey(MEMORY_BACKEND), backend)
}
