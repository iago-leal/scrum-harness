/**
 * Shelf sections: the ARCHIVE (concluded items stowed away, revivable) and
 * the TRASH (soft-deleted items — restore or delete forever). One component
 * renders both modes; destructive actions ask for confirmation first. Pure
 * presentation over props, mutations funnel through the panel's `run`.
 * @module @scrum-harness/ui/client/Shelf
 */

import type { ReactNode } from 'react'
import type { ScrumState, WireShelfItem } from './api.ts'
import { KIND_META, KindChip, StateDot, TypeIcon } from './meta.tsx'

/** Callbacks the shelf drives (mutations funnel through the panel). */
export interface ShelfCallbacks {
  /** Run one wire action (panel wraps busy/error and refreshes the store). */
  run: (action: Record<string, unknown>) => void
}

/** Compact local rendering of one ISO stamp. */
function when(at: string): string {
  const parsed = new Date(at)
  return Number.isNaN(parsed.getTime()) ? at : parsed.toLocaleString()
}

/** One shelf row: kind, id, title, context, and the mode's actions. */
function ShelfRow(props: { item: WireShelfItem; actions: ReactNode }) {
  const { item } = props
  return (
    <div className="scrum-node">
      <div className="scrum-row lvl-task">
        <TypeIcon kind={item.kind} />
        <span className="scrum-muted">{KIND_META[item.kind].label}</span>
        <span className="scrum-id">{item.id}</span>
        <span className="scrum-title">{item.title}</span>
        <KindChip kind={item.taskKind} />
        {item.status !== undefined && <StateDot status={item.status} />}
        {item.estimate !== undefined && <span className="scrum-pts">{item.estimate}pt</span>}
        {item.parentId !== undefined && <span className="scrum-pts" title="Item pai">↑ {item.parentId}</span>}
        <span className="scrum-muted">{when(item.at)}</span>
        <span className="scrum-actions">{props.actions}</span>
      </div>
    </div>
  )
}

/** The Archive / Trash section. */
export function Shelf(props: { mode: 'archive' | 'trash'; state: ScrumState; callbacks: ShelfCallbacks }) {
  const { run } = props.callbacks
  const trash = props.mode === 'trash'
  // The ?? [] tolerates a pre-v0.2 server still running (state without shelves).
  const items = (trash ? props.state.trash : props.state.archive) ?? []

  const head = trash
    ? {
        title: 'Lixeira',
        hint: 'Itens apagados: restaure-os ou exclua de vez (sem volta).',
      }
    : {
        title: 'Arquivo',
        hint: 'Concluídos guardados fora das vistas principais; desarquive quando quiser.',
      }

  const emptyTrash = () => {
    if (window.confirm(`Esvaziar a lixeira? ${items.length} item(ns) serão excluídos DEFINITIVAMENTE.`)) {
      run({ action: 'emptyTrash' })
    }
  }
  const purge = (item: WireShelfItem) => {
    if (window.confirm(`Excluir ${item.id} "${item.title}" DEFINITIVAMENTE? Não há como desfazer.`)) {
      run({ action: 'purgeItem', id: item.id })
    }
  }

  return (
    <div>
      <div className="scrum-section-head">
        <h2>{head.title}</h2>
        <span className="scrum-muted">{head.hint}</span>
        <span style={{ flex: 1 }} />
        {trash
          ? items.length > 0 && (
            <button className="scrum-btn danger" onClick={emptyTrash}>Esvaziar lixeira</button>
          )
          : (
            <button
              className="scrum-btn"
              title="Arquiva todas as tarefas concluídas fora da sprint ativa"
              onClick={() => { run({ action: 'archiveCompleted' }) }}
            >Arquivar tarefas concluídas</button>
          )}
      </div>
      {items.length === 0
        ? (
          <div className="scrum-empty">
            {trash ? 'A lixeira está vazia.' : 'O arquivo está vazio. Arquive itens concluídos pelo Backlog.'}
          </div>
        )
        : items.map(item => (
          <ShelfRow
            key={item.id}
            item={item}
            actions={trash
              ? (
                <>
                  <button
                    className="scrum-btn ghost"
                    title="Restaurar (volta ao backlog; reativa os pais se preciso)"
                    onClick={() => { run({ action: 'restoreItem', id: item.id }) }}
                  >↩ Restaurar</button>
                  <button className="scrum-btn ghost danger" title="Excluir definitivamente" onClick={() => { purge(item) }}>✕ Excluir de vez</button>
                </>
              )
              : (
                <button
                  className="scrum-btn ghost"
                  title="Desarquivar (volta às vistas principais)"
                  onClick={() => { run({ action: 'unarchiveItem', id: item.id }) }}
                >↩ Desarquivar</button>
              )}
          />
        ))}
    </div>
  )
}
