/**
 * The work item form, Azure DevOps-style: a modal dialog opened by clicking
 * any card (Board) or row title (Backlog) that shows the WHOLE item — title,
 * breadcrumb, state, description, estimate, target date, sprint — editable
 * and saved through `updateItem`. Since v0.19 (comp-43) a component's form
 * also carries the spiral: the trail of phases with advance / retreat, the
 * readiness checklist (the Model's verdict, printed), the four artifacts as
 * editable text with their frontmatter, the phase log, and the outcome of
 * every action rendered inline (the gate refusal never hides behind the
 * overlay). Since v0.23 (comp-58) each artifact has two modes, Visualizar
 * (markdown rendered Primer-style through markdown.ts, the mermaid fences
 * inline) and Escrever (the textarea). Drafts are local: they re-seed when the selection changes, a
 * clean field follows the server (the agent edited through a tool while the
 * form is open) and a dirty one keeps the draft. Every rule lives in
 * `form.ts`; this module only calls it.
 * @module @scrum-harness/ui/client/Details
 */

import { Fragment, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { CSSProperties } from 'react'
import type { ScrumState, WirePhase, WirePhaseReadiness, WireTaskKind, WireTraceMatrix } from './api.ts'
import { COMPONENT_FLOW, FEATURE_FLOW } from './api.ts'
import {
  ARTIFACT_FIELDS, ARTIFACT_LABELS, ARTIFACT_PLACEHOLDERS, PHASE_TITLES,
  artifactPatch, checklist, followServer, isDirty, openByDefault, phaseLogLines, phaseSteps, primaryAction,
} from './form.ts'
import type { ArtifactField, FormDrafts, FormServer, PhaseStep } from './form.ts'
import { followMode, frontmatterRows, modeByDefault, renderBody, splitFrontmatter } from './markdown.ts'
import type { ArtifactMode } from './markdown.ts'
import { createRenderer, mermaidBlocks, previewByDefault, svgNaturalWidth } from './mermaid.ts'
import type { Block, BlockState, Renderer, Theme } from './mermaid.ts'
import type { MermaidEngine } from './mermaid-engine.ts'
import { Counter, KIND_META, StateDot, TypeIcon } from './meta.tsx'
import type { RunOutcome } from './settle.ts'
import { clampPlacement, dragMove } from './drag.ts'
import type { Placement, Point, Size } from './drag.ts'
import type { Switch } from './side.ts'

/** Typing pause before the preview repaints (comp-44 R4). */
const PREVIEW_DEBOUNCE_MS = 300

/** Mount counter of the form: part of every block id (R6b — unique per block AND per remount). */
let mountCounter = 0

/** The three task kinds, in the order the form offers them. */
const TASK_KINDS: readonly WireTaskKind[] = ['test', 'code', 'other']

/** One phase-log entry on the wire. */
type PhaseLogEntry = { from: WirePhase; to: WirePhase; at: string }

/** The selected item, normalized across the four kinds. */
export interface DetailsNode {
  id: string
  kind: keyof typeof KIND_META
  title: string
  description?: string
  /** Current status, for kinds that have one. */
  status?: string
  /** Editable status choices; absent when status is not editable here. */
  statusOptions?: string[]
  estimate?: number
  /** Tasks only: the task kind (named apart from `kind`, the level — comp-45 L3). */
  taskKind?: WireTaskKind
  targetDate?: string
  sprintId?: string
  /** Ancestor path, e.g. "v0.3 › Grade do backlog". */
  crumb?: string
  /** Components only (comp-49 R7): the Model's traceability matrix, rendered read-only. */
  traces?: WireTraceMatrix
  /** Components only (comp-43 R1): the spiral as the wire carries it. */
  phase?: WirePhase
  phaseLog?: PhaseLogEntry[]
  readiness?: WirePhaseReadiness
  readyForDone?: boolean
  /** Components only (comp-43 R1): the four artifacts, absent when empty. */
  artifacts?: Partial<Record<ArtifactField, string>>
}

/**
 * Locate one item in the wire tree by id.
 * @param state - the wire state.
 * @param id - item id (rel-/feat-/comp-/task-).
 * @returns the normalized node, or null when it is not in the live tree.
 */
export function resolveNode(state: ScrumState, id: string): DetailsNode | null {
  for (const release of state.tree.releases) {
    if (release.id === id) {
      return {
        id, kind: 'release', title: release.name, description: release.description,
        status: release.status, statusOptions: ['planned', 'active', 'released'],
        targetDate: release.targetDate,
      }
    }
    for (const feature of release.features) {
      if (feature.id === id) {
        return {
          id, kind: 'feature', title: feature.title, description: feature.description,
          status: feature.status, statusOptions: [...FEATURE_FLOW],
          crumb: release.name,
        }
      }
      for (const component of feature.components) {
        if (component.id === id) {
          const artifacts: Partial<Record<ArtifactField, string>> = {}
          for (const field of ARTIFACT_FIELDS) {
            const value = component[field]
            if (value !== undefined) artifacts[field] = value
          }
          return {
            id, kind: 'component', title: component.title, description: component.description,
            status: component.status, statusOptions: [...COMPONENT_FLOW],
            crumb: `${release.name} › ${feature.title}`,
            traces: component.traces,
            phase: component.phase, phaseLog: component.phaseLog, readiness: component.readiness,
            readyForDone: component.readyForDone, artifacts,
          }
        }
        for (const task of component.tasks) {
          if (task.id === id) {
            return {
              id, kind: 'task', title: task.title, description: task.description,
              status: task.status, estimate: task.estimate, taskKind: task.kind, sprintId: task.sprintId,
              crumb: `${feature.title} › ${component.title}`,
            }
          }
        }
      }
    }
  }
  return null
}

/** The node as the form's server side (what the drafts compare against). */
function serverOf(node: DetailsNode): FormServer {
  return {
    kind: node.kind, title: node.title, description: node.description,
    estimate: node.estimate, targetDate: node.targetDate, artifacts: node.artifacts ?? {},
  }
}

/** Fresh drafts from the server. */
function seedDrafts(server: FormServer): FormDrafts {
  const artifacts = {} as Record<ArtifactField, string>
  for (const field of ARTIFACT_FIELDS) artifacts[field] = server.artifacts[field] ?? ''
  return {
    title: server.title, description: server.description ?? '',
    estimate: server.estimate?.toString() ?? '', targetDate: server.targetDate ?? '', artifacts,
  }
}

/** Every draft following the server where it is clean; the same object when nothing moves. */
function followAll(drafts: FormDrafts, prev: FormServer, next: FormServer): FormDrafts {
  const artifacts = {} as Record<ArtifactField, string>
  let moved = false
  for (const field of ARTIFACT_FIELDS) {
    artifacts[field] = followServer(drafts.artifacts[field], prev.artifacts[field], next.artifacts[field])
    if (artifacts[field] !== drafts.artifacts[field]) moved = true
  }
  const followed: FormDrafts = {
    title: followServer(drafts.title, prev.title, next.title, { trim: true }),
    description: followServer(drafts.description, prev.description, next.description),
    estimate: followServer(drafts.estimate, prev.estimate?.toString(), next.estimate?.toString()),
    targetDate: followServer(drafts.targetDate, prev.targetDate, next.targetDate),
    artifacts,
  }
  if (!moved && followed.title === drafts.title && followed.description === drafts.description
    && followed.estimate === drafts.estimate && followed.targetDate === drafts.targetDate) return drafts
  return followed
}

/** The open map seeded by the phase (the artifacts the current gate reads). */
function openMap(phase: WirePhase | undefined): Record<ArtifactField, boolean> {
  const open = phase === undefined ? [] : openByDefault(phase)
  const map = {} as Record<ArtifactField, boolean>
  for (const field of ARTIFACT_FIELDS) map[field] = open.includes(field)
  return map
}

/** The inline outcome of the last form action. */
interface Notice {
  tone: 'ok' | 'error'
  text: string
}

/** The blocks of every artifact draft (comp-44 R2): computed from the strings, cheap. */
function blocksOf(drafts: FormDrafts): Record<ArtifactField, Block[]> {
  const map = {} as Record<ArtifactField, Block[]>
  for (const field of ARTIFACT_FIELDS) map[field] = mermaidBlocks(drafts.artifacts[field])
  return map
}

/** The preview toggles seeded from the blocks (R2). */
function previewMap(blocks: Record<ArtifactField, Block[]>): Record<ArtifactField, boolean> {
  const map = {} as Record<ArtifactField, boolean>
  for (const field of ARTIFACT_FIELDS) map[field] = previewByDefault(field, blocks[field].length > 0)
  return map
}

/** The render states of every artifact's blocks, by block index. */
type BlockStates = Record<ArtifactField, Record<number, BlockState>>

/** The modes seeded from the server texts (comp-58 R1). */
function modeMap(server: FormServer): Record<ArtifactField, ArtifactMode> {
  const map = {} as Record<ArtifactField, ArtifactMode>
  for (const field of ARTIFACT_FIELDS) map[field] = modeByDefault(server.artifacts[field] ?? '')
  return map
}

const emptyStates = (): BlockStates => {
  const map = {} as BlockStates
  for (const field of ARTIFACT_FIELDS) map[field] = {}
  return map
}

/** The modal work item form. */
export function WorkItemForm(props: {
  node: DetailsNode
  run: (action: Record<string, unknown>) => Promise<RunOutcome>
  onClose: () => void
  /** The page's mermaid engine (comp-44 R7); the form renders through it. */
  engine: MermaidEngine
  /** The artifact sanitizer (comp-58 R2): the dedicated DOMPurify instance, configured in index.ts. */
  sanitize: (html: string) => string
  /** The panel theme (comp-44 R6c): a change repaints every diagram. */
  theme: Theme
  /** The title ceilings from the Model (comp-53 R6a); absent on an old server → no counter. */
  limits?: { title: number; goal: number }
  /** Where the user left the form (comp-56 R2): page-level; null = centered, modal. */
  placement: Switch<Placement | null>
}) {
  const { node, onClose, engine, theme } = props
  const server = serverOf(node)
  const [drafts, setDrafts] = useState<FormDrafts>(() => seedDrafts(server))
  const [open, setOpen] = useState<Record<ArtifactField, boolean>>(() => openMap(node.phase))
  const [pending, setPending] = useState(false)
  const [notice, setNotice] = useState<Notice | null>(null)
  const idRef = useRef(node.id)
  const phaseRef = useRef(node.phase)
  const serverRef = useRef(server)
  const mountedRef = useRef(true)
  const closeRef = useRef<() => void>(() => { onClose() })

  // comp-44: the preview toggles, the user's touches (precedence over any
  // re-seed, R2/r3-M1), the last hasBlocks per field (the false → true
  // transition re-seeds untouched fields), the render states and the
  // availability notice per artifact, and one renderer per mount.
  const blocks = blocksOf(drafts)
  const [preview, setPreview] = useState<Record<ArtifactField, boolean>>(() => previewMap(blocks))
  const touchedRef = useRef(new Set<ArtifactField>())
  // comp-58 R1: the mode of each artifact and the tabs the user touched — a
  // set of its own (r3-L6): the Mostrar/Ocultar toggle must not pin the mode.
  const [mode, setMode] = useState<Record<ArtifactField, ArtifactMode>>(() => modeMap(server))
  const modeTouchedRef = useRef(new Set<ArtifactField>())
  /** The drafts as of the last render — read by the poll effect without entering its deps. */
  const draftsRef = useRef(drafts)
  draftsRef.current = drafts
  const hadBlocksRef = useRef<Record<ArtifactField, boolean>>(
    Object.fromEntries(ARTIFACT_FIELDS.map(f => [f, blocks[f].length > 0])) as Record<ArtifactField, boolean>,
  )
  const [states, setStates] = useState<BlockStates>(emptyStates)
  const [unavailable, setUnavailable] = useState<Partial<Record<ArtifactField, string>>>({})
  const renderersRef = useRef<Record<ArtifactField, Renderer> | null>(null)
  if (renderersRef.current === null) {
    const mount = ++mountCounter
    const map = {} as Record<ArtifactField, Renderer>
    for (const field of ARTIFACT_FIELDS) {
      map[field] = createRenderer({
        setState: (index, state) => { setStates(s => ({ ...s, [field]: { ...s[field], [index]: state } })) },
        remove: (index) => {
          setStates(s => { const next = { ...s[field] }; delete next[index]; return { ...s, [field]: next } })
        },
        setUnavailable: (reason) => {
          setUnavailable(u => { const next = { ...u }; if (reason === null) delete next[field]; else next[field] = reason; return next })
        },
      }, engine.render, mount * 10 + ARTIFACT_FIELDS.indexOf(field))
    }
    renderersRef.current = map
  }

  // Selection changed → re-seed everything; same item → clean fields follow
  // the server (R4), and the open blocks re-seed when the phase moved (r2 L4).
  useEffect(() => {
    const next = serverOf(node)
    if (idRef.current !== node.id) {
      idRef.current = node.id
      phaseRef.current = node.phase
      serverRef.current = next
      const seeded = seedDrafts(next)
      setDrafts(seeded)
      setOpen(openMap(node.phase))
      setNotice(null)
      setPending(false)
      // comp-44 R2: a new selection clears the touches and re-seeds the previews.
      touchedRef.current.clear()
      const fresh = blocksOf(seeded)
      setPreview(previewMap(fresh))
      for (const field of ARTIFACT_FIELDS) hadBlocksRef.current[field] = fresh[field].length > 0
      // comp-58 R1: modes re-seed with the selection.
      modeTouchedRef.current.clear()
      setMode(modeMap(next))
      return
    }
    const prev = serverRef.current
    serverRef.current = next
    // comp-58 R1: an untouched, clean artifact that just gained its text on the
    // server (the review a subagent wrote while the form was open) opens in
    // Visualizar; `dirty` reads the current draft against the PREVIOUS server.
    const current = draftsRef.current
    setMode(m => {
      const merged = { ...m }
      for (const field of ARTIFACT_FIELDS) {
        merged[field] = followMode(m[field], {
          touched: modeTouchedRef.current.has(field),
          dirty: current.artifacts[field] !== (prev.artifacts[field] ?? ''),
          prevText: prev.artifacts[field] ?? '',
          nextText: next.artifacts[field] ?? '',
        })
      }
      return merged
    })
    setDrafts(d => followAll(d, prev, next))
    if (phaseRef.current !== node.phase) {
      phaseRef.current = node.phase
      // Untouched fields only (r3-M1): a toggle the user set survives the phase re-seed.
      setOpen(current => {
        const seeded = openMap(node.phase)
        const merged = { ...current }
        for (const field of ARTIFACT_FIELDS) if (!touchedRef.current.has(field)) merged[field] = seeded[field]
        return merged
      })
    }
  }, [node])

  // comp-44 R2: hasBlocks false → true re-seeds the preview of an untouched field
  // (a design that gains its first fence with the form open — by another agent
  // through the poll, or by this very textarea).
  useEffect(() => {
    for (const field of ARTIFACT_FIELDS) {
      const has = blocks[field].length > 0
      if (has && !hadBlocksRef.current[field] && !touchedRef.current.has(field)) {
        setPreview(p => ({ ...p, [field]: previewByDefault(field, true) }))
      }
      hadBlocksRef.current[field] = has
    }
  })

  // comp-44 R4: debounced repaint of every previewed artifact; the renderer
  // itself skips blocks whose text and theme did not change. `theme` in the
  // deps is what makes a theme flip repaint (R6c). Since comp-58 (R4) an
  // artifact in Visualizar paints regardless of the Mostrar/Ocultar toggle,
  // and the mode is in the deps so a switch calls `update` at once (a no-op
  // for unchanged code: the states survive the switch).
  const painted = (field: ArtifactField): boolean => mode[field] === 'view' || preview[field]
  const artifactsKey = ARTIFACT_FIELDS.map(f => (painted(f) ? drafts.artifacts[f] : '')).join('\u0000')
  useEffect(() => {
    const renderers = renderersRef.current
    if (renderers === null) return
    const timer = setTimeout(() => {
      for (const field of ARTIFACT_FIELDS) {
        if (painted(field)) renderers[field].update(blocks[field], theme)
        else renderers[field].update([], theme)
      }
    }, PREVIEW_DEBOUNCE_MS)
    return () => { clearTimeout(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- artifactsKey stands for the painted drafts
  }, [artifactsKey, theme, preview, mode])

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      // comp-44 R4: the three dispose triggers (close, resolveNode → null, remount)
      // all pass through this cleanup — nothing in flight touches state afterwards.
      const renderers = renderersRef.current
      if (renderers !== null) for (const field of ARTIFACT_FIELDS) renderers[field].dispose()
    }
  }, [])

  // comp-56: the draggable form. The placement is the page switch as the user
  // left it; the CLAMP IS ON READ (r2 M1) — `rendered` is derived from the
  // measured dialog size and viewport, and the switch is only written by the
  // drag (already clamped) and by «⌖ Centralizar» (null). Two mount points
  // therefore never fight over the value.
  const placement = useSyncExternalStore(props.placement.subscribe, props.placement.get)
  const dialogRef = useRef<HTMLDivElement | null>(null)
  const [measure, setMeasure] = useState<{ size: Size; viewport: Size } | null>(null)
  const [dragging, setDragging] = useState(false)
  const dragRef = useRef<{ origin: Placement; start: Point; size: Size; viewport: Size } | null>(null)
  const latestRef = useRef<Point>({ x: 0, y: 0 })
  const frameRef = useRef<number | null>(null)
  const moved = placement !== null
  const readMeasure = () => {
    const el = dialogRef.current
    if (el === null) return
    setMeasure({
      size: { width: el.offsetWidth, height: el.offsetHeight },
      viewport: { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight },
    })
  }
  // Re-measure when the form becomes floating, when the item changes (the
  // height follows the content) and on window resize — never writing back.
  useLayoutEffect(() => {
    if (!moved) return
    readMeasure()
    window.addEventListener('resize', readMeasure)
    return () => { window.removeEventListener('resize', readMeasure) }
  }, [moved, node.id])
  const rendered = placement === null || measure === null ? null : clampPlacement(placement, measure.size, measure.viewport)
  const viewportNow = (): Size => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight })
  /** The header is the handle (R1): pointer capture, rAF-throttled moves against the drag origin. */
  const onHandleDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || (e.target as Element).closest('button') !== null) return
    const el = dialogRef.current
    if (el === null) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    const rect = el.getBoundingClientRect()
    dragRef.current = {
      origin: { left: rect.left, top: rect.top },
      start: { x: e.clientX, y: e.clientY },
      size: { width: rect.width, height: rect.height },
      viewport: viewportNow(),
    }
    latestRef.current = { x: e.clientX, y: e.clientY }
    setDragging(true)
  }
  const flushDrag = () => {
    frameRef.current = null
    const d = dragRef.current
    if (d === null) return
    props.placement.set(dragMove(d.origin, d.start, latestRef.current, d.size, d.viewport))
  }
  const onHandleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId) || dragRef.current === null) return
    latestRef.current = { x: e.clientX, y: e.clientY }
    frameRef.current ??= requestAnimationFrame(flushDrag)
  }
  const onHandleUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return
    e.currentTarget.releasePointerCapture(e.pointerId)
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current)
    latestRef.current = { x: e.clientX, y: e.clientY }
    flushDrag()
    dragRef.current = null
    setDragging(false)
  }

  // Azure-style dialog: Escape closes from anywhere — through the discard guard, never mid-composition (r1 L7).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !e.isComposing) closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey) }
  }, [])

  const dirty = isDirty(server, drafts)

  /** The only way out: Esc, backdrop and Fechar all come here (R4). */
  const requestClose = () => {
    if (dirty.any && !window.confirm('Há alterações não salvas. Descartar?')) return
    onClose()
  }
  closeRef.current = requestClose

  /** Every mutation fired from inside the form (R5): pending while in flight, outcome inline. */
  const runInForm = async (action: Record<string, unknown>, okText: string): Promise<void> => {
    setPending(true)
    setNotice(null)
    const outcome = await props.run(action)
    if (!mountedRef.current) return
    setPending(false)
    setNotice(outcome.ok ? { tone: 'ok', text: okText } : { tone: 'error', text: outcome.message })
  }

  const save = () => {
    if (pending) return
    const patch = artifactPatch(server, drafts)
    if (Object.keys(patch).length === 0) {
      setNotice({ tone: 'ok', text: 'Nada a salvar.' })
      return
    }
    void runInForm({ action: 'updateItem', id: node.id, ...patch }, 'Salvo.')
  }

  const setArtifact = (field: ArtifactField, value: string) => {
    setDrafts(current => ({ ...current, artifacts: { ...current.artifacts, [field]: value } }))
  }

  const noticeEl = notice === null ? null : <div className={`scrum-notice is-${notice.tone}`}>{notice.text}</div>
  const isComponent = node.kind === 'component' && node.readiness !== undefined
  const dirtyTitle = dirty.artifacts ? 'Salve os rascunhos antes — o gate lê o que está no servidor' : undefined

  return (
    // Modal while centered; floating and click-through once the user moved it
    // (R3) — with pointer-events: none the overlay is never the mousedown target.
    <div className={`scrum-wi-overlay${moved ? ' is-moved' : ''}`} onMouseDown={(e) => { if (e.target === e.currentTarget) requestClose() }}>
      <div
        ref={dialogRef}
        className={`scrum-wi${node.kind === 'component' ? ' is-component' : ''}${moved ? ' is-moved' : ''}`}
        role="dialog"
        aria-modal={!moved}
        style={rendered === null ? undefined : { left: rendered.left, top: rendered.top } as CSSProperties}
      >
        <div
          className={`scrum-details-head${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onHandleDown}
          onPointerMove={onHandleMove}
          onPointerUp={onHandleUp}
          onPointerCancel={onHandleUp}
        >
          <TypeIcon kind={node.kind} />
          <span className="scrum-details-kind">{KIND_META[node.kind].label}</span>
          <span className="scrum-id">{node.id}</span>
          {node.status !== undefined && <StateDot status={node.status} />}
          {node.readyForDone === true && <span className="scrum-phase scrum-phase-ready" title="O gate de done está satisfeito">ready for done</span>}
          <span style={{ flex: 1 }} />
          {moved && <button className="scrum-close dark" title="Voltar ao centro (modal)" onClick={() => { props.placement.set(null) }}>⌖</button>}
          <button className="scrum-close dark" title="Fechar (Esc)" onClick={requestClose}>✕</button>
        </div>
        {node.crumb !== undefined && <div className="scrum-details-crumb">{node.crumb}</div>}

        <label className="scrum-field">
          <span>Título <Counter text={drafts.title} limit={props.limits?.title} /></span>
          <input
            value={drafts.title}
            onChange={(e) => { const title = e.target.value; setDrafts(current => ({ ...current, title })) }}
            onKeyDown={(e) => { if (e.key === 'Enter') save() }}
          />
        </label>

        <label className="scrum-field">
          <span>Descrição</span>
          <textarea
            rows={isComponent ? 5 : 9}
            placeholder="Sem descrição."
            value={drafts.description}
            onChange={(e) => { const description = e.target.value; setDrafts(current => ({ ...current, description })) }}
          />
        </label>

        <div className="scrum-wi-grid">
          {node.statusOptions !== undefined && node.status !== undefined && (
            <label className="scrum-field">
              <span>Estado</span>
              <select
                value={node.status}
                disabled={pending || (isComponent && dirty.artifacts)}
                title={isComponent ? dirtyTitle : undefined}
                onChange={(e) => {
                  const status = e.target.value
                  void runInForm({ action: 'updateItem', id: node.id, status }, status === 'done' ? 'Concluído.' : `Estado: ${status}.`)
                }}
              >
                {node.statusOptions.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}

          {node.kind === 'task' && node.taskKind !== undefined && (
            <label className="scrum-field">
              <span>Tipo</span>
              <select
                value={node.taskKind}
                disabled={pending}
                title="test = escreve/prova testes; code = faz os testes passarem; other = validação, spike, docs"
                onChange={(e) => { const kind = e.target.value; void runInForm({ action: 'updateItem', id: node.id, kind }, `Tipo: ${kind}.`) }}
              >
                {TASK_KINDS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
          )}

          {node.kind === 'task' && (
            <label className="scrum-field">
              <span>Estimativa (pontos)</span>
              <input
                inputMode="numeric"
                placeholder="—"
                value={drafts.estimate}
                onChange={(e) => { const estimate = e.target.value; setDrafts(current => ({ ...current, estimate })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              />
            </label>
          )}

          {node.kind === 'release' && (
            <label className="scrum-field">
              <span>Data alvo</span>
              <input
                placeholder="AAAA-MM-DD"
                value={drafts.targetDate}
                onChange={(e) => { const targetDate = e.target.value; setDrafts(current => ({ ...current, targetDate })) }}
                onKeyDown={(e) => { if (e.key === 'Enter') save() }}
              />
            </label>
          )}
        </div>

        {node.kind === 'task' && node.status !== undefined && (
          <div className="scrum-details-meta">
            <StateDot status={node.status} />
            <span className="scrum-muted">O estado da tarefa é a coluna do board da sprint.</span>
            {node.sprintId !== undefined && <span className="scrum-pts">{node.sprintId}</span>}
          </div>
        )}

        {isComponent && node.readiness !== undefined && (
          <SpiralSection
            id={node.id}
            status={node.status ?? ''}
            readiness={node.readiness}
            mask={{ dirty: dirty.artifacts, pending }}
            notice={noticeEl}
            run={runInForm}
          />
        )}

        {isComponent && (
          <ArtifactsSection
            drafts={drafts}
            server={server}
            open={open}
            onOpen={(field, value) => { setOpen(current => ({ ...current, [field]: value })) }}
            onChange={setArtifact}
            blocks={blocks}
            states={states}
            preview={preview}
            unavailable={unavailable}
            onTogglePreview={(field) => {
              touchedRef.current.add(field)
              setPreview(current => ({ ...current, [field]: !current[field] }))
            }}
            onRetry={(field) => { renderersRef.current?.[field].retry() }}
            mode={mode}
            onMode={(field, value) => {
              modeTouchedRef.current.add(field)
              setMode(current => ({ ...current, [field]: value }))
            }}
            sanitize={props.sanitize}
          />
        )}

        {isComponent && <PhaseLogSection log={node.phaseLog ?? []} />}

        {node.kind === 'component' && node.traces !== undefined && <TraceSection traces={node.traces} />}

        {!isComponent && noticeEl !== null && <div className="scrum-wi-notice">{noticeEl}</div>}

        <div className="scrum-details-foot">
          <button className="scrum-btn" onClick={requestClose}>Fechar</button>
          <button className="scrum-btn primary" disabled={pending} onClick={save}>Salvar</button>
        </div>
      </div>
    </div>
  )
}

/**
 * The spiral section of a component (comp-43 R2/R3/R5): the six-step trail,
 * the primary action with its reason, the readiness checklist and the inline
 * outcome. Every decision comes from `form.ts`; the click only dispatches.
 */
function SpiralSection(props: {
  id: string
  status: string
  readiness: WirePhaseReadiness
  mask: { dirty: boolean; pending: boolean }
  notice: JSX.Element | null
  run: (action: Record<string, unknown>, okText: string) => Promise<void>
}) {
  const { id, readiness, mask } = props
  const steps = phaseSteps(readiness, mask)
  const primary = primaryAction(readiness, mask)
  const list = checklist(readiness)

  const onStep = (step: PhaseStep) => {
    if (!step.clickable) return
    if (step.op === 'set') void props.run({ action: 'componentPhase', id, op: 'set', phase: step.id }, `Recuou para ${step.id}.`)
    else if (step.op === 'advance') void props.run({ action: 'componentPhase', id, op: 'advance' }, `Avançou para ${step.id}.`)
    else if (step.op === 'done') void props.run({ action: 'updateItem', id, status: 'done' }, 'Concluído.')
  }
  const onPrimary = () => {
    if (primary === null || primary.disabled) return
    if (primary.op === 'advance') void props.run({ action: 'componentPhase', id, op: 'advance' }, `Avançou para ${readiness.next}.`)
    else void props.run({ action: 'updateItem', id, status: 'done' }, 'Concluído.')
  }

  return (
    <div className="scrum-spiral-section">
      <div className="scrum-wi-section-head">Espiral</div>
      <div className="scrum-spiral">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && <span className="scrum-spiral-arrow">→</span>}
            <button
              type="button"
              className="scrum-spiral-step"
              data-state={step.state}
              disabled={!step.clickable}
              title={PHASE_TITLES[step.id]}
              onClick={() => { onStep(step) }}
            >{step.id}</button>
          </Fragment>
        ))}
      </div>
      <div className="scrum-spiral-actions">
        {primary !== null
          ? (
            <>
              <button className="scrum-btn primary" disabled={primary.disabled} title={primary.reason ?? primary.label} onClick={onPrimary}>{primary.label}</button>
              {primary.reason !== null && <span className="scrum-spiral-reason">{primary.reason}</span>}
            </>
          )
          : props.status === 'done' && <span className="scrum-spiral-reason">volte o estado para reabrir a espiral</span>}
      </div>
      <div className={`scrum-checklist is-${list.tone}`}>
        <div className="scrum-checklist-head">{list.head}</div>
        {list.lines.length > 0 && <ul>{list.lines.map(line => <li key={line}>{line}</li>)}</ul>}
      </div>
      {props.notice}
    </div>
  )
}

/**
 * The four artifacts as collapsible text (comp-43 R4), each in one of two
 * modes since v0.23 (comp-58 R1): Visualizar — the draft rendered as
 * markdown (ArtifactView) — or Escrever — the textarea and, for an artifact
 * with ```mermaid fences (comp-44 R2), the `Diagramas · N` faixa and the
 * rendered diagrams between the summary and the textarea. The textarea is
 * the only writer of the draft and stays mounted in both modes (`hidden`
 * in Visualizar: undo and resize survive); the frontmatter the gates read
 * stays editable in Escrever.
 */
function ArtifactsSection(props: {
  drafts: FormDrafts
  server: FormServer
  open: Record<ArtifactField, boolean>
  onOpen: (field: ArtifactField, open: boolean) => void
  onChange: (field: ArtifactField, value: string) => void
  blocks: Record<ArtifactField, Block[]>
  states: BlockStates
  preview: Record<ArtifactField, boolean>
  unavailable: Partial<Record<ArtifactField, string>>
  onTogglePreview: (field: ArtifactField) => void
  onRetry: (field: ArtifactField) => void
  mode: Record<ArtifactField, ArtifactMode>
  onMode: (field: ArtifactField, mode: ArtifactMode) => void
  sanitize: (html: string) => string
}) {
  return (
    <div className="scrum-artifacts">
      <div className="scrum-wi-section-head">Artefatos</div>
      {ARTIFACT_FIELDS.map((field) => {
        const draft = props.drafts.artifacts[field]
        const dirty = draft !== (props.server.artifacts[field] ?? '')
        const size = draft === '' ? 'vazio' : `${draft.split('\n').length} linhas`
        const blocks = props.blocks[field]
        const viewing = props.mode[field] === 'view'
        const panelId = `scrum-artifact-${field}`
        return (
          <details
            key={field}
            className="scrum-artifact"
            open={props.open[field]}
            onToggle={(e) => { props.onOpen(field, e.currentTarget.open) }}
          >
            <summary>
              <span>{ARTIFACT_LABELS[field]}</span>
              <span className="scrum-artifact-size">· {size}</span>
              {dirty && <span className="scrum-artifact-dirty" title="Rascunho não salvo">•</span>}
            </summary>
            <ArtifactTabs field={field} mode={props.mode[field]} panelId={panelId} onMode={(value) => { props.onMode(field, value) }} />
            {viewing && props.open[field] && (
              <ArtifactView
                panelId={panelId}
                text={draft}
                blocks={blocks}
                states={props.states[field]}
                unavailable={props.unavailable[field]}
                sanitize={props.sanitize}
                onRetry={() => { props.onRetry(field) }}
              />
            )}
            {!viewing && blocks.length > 0 && (
              <DiagramsBar
                count={blocks.length}
                dirty={dirty}
                on={props.preview[field]}
                unavailable={props.unavailable[field]}
                onToggle={() => { props.onTogglePreview(field) }}
                onRetry={() => { props.onRetry(field) }}
              />
            )}
            {!viewing && blocks.length > 0 && props.preview[field] && props.unavailable[field] === undefined && (
              <DiagramList blocks={blocks} states={props.states[field]} />
            )}
            <textarea
              id={viewing ? undefined : panelId}
              rows={14}
              spellCheck={false}
              hidden={viewing}
              placeholder={ARTIFACT_PLACEHOLDERS[field]}
              value={draft}
              onChange={(e) => { props.onChange(field, e.target.value) }}
            />
          </details>
        )
      })}
    </div>
  )
}

/** The two modes, in tab order (R1). */
const MODES: { mode: ArtifactMode; label: string }[] = [
  { mode: 'view', label: 'Visualizar' },
  { mode: 'write', label: 'Escrever' },
]

/**
 * The Visualizar | Escrever pair of one artifact (comp-58 R1), Write/Preview
 * style: a tablist with the two tabs, ←/→ switching, the pressed tab owning
 * the panel below (the rendered view or the textarea).
 */
function ArtifactTabs(props: { field: ArtifactField; mode: ArtifactMode; panelId: string; onMode: (mode: ArtifactMode) => void }) {
  const onKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    e.preventDefault()
    const next = props.mode === 'view' ? 'write' : 'view'
    props.onMode(next)
    const tab = e.currentTarget.querySelector<HTMLButtonElement>(`[data-mode="${next}"]`)
    tab?.focus()
  }
  return (
    <div className="scrum-artifact-tabs" role="tablist" aria-label={`${ARTIFACT_LABELS[props.field]}: modo`} onKeyDown={onKey}>
      {MODES.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          id={`${props.panelId}-tab-${mode}`}
          data-mode={mode}
          aria-selected={props.mode === mode}
          aria-controls={props.panelId}
          tabIndex={props.mode === mode ? 0 : -1}
          onClick={() => { props.onMode(mode) }}
        >{label}</button>
      ))}
    </div>
  )
}

/**
 * The rendered artifact (comp-58 R2/R3/R4): the frontmatter as a literal
 * table (React, never innerHTML) or the "not recognized" notice, then the
 * body as segments — html groups the dedicated DOMPurify instance sanitized
 * (this is one of the panel's two dangerouslySetInnerHTML; the other is the
 * mermaid svg of DiagramFigure — the policy lives in markdown.ts
 * `configureSanitizer`), interleaved with the mermaid figures carrying the
 * very Block the Escrever mode renders (same index, same state). Memoized
 * by the draft text: four instances, one cache each; a closed or
 * Escrever artifact does not mount this at all.
 */
function ArtifactView(props: {
  panelId: string
  text: string
  blocks: Block[]
  states: Record<number, BlockState>
  unavailable: string | undefined
  sanitize: (html: string) => string
  onRetry: () => void
}) {
  const { text, sanitize } = props
  const split = useMemo(() => splitFrontmatter(text), [text])
  const rows = useMemo(() => (split.frontmatter === null ? [] : frontmatterRows(split.frontmatter)), [split])
  // `blocks` derives from `text` (blocksOf), so the text is the whole key.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- blocks is a function of text
  const segments = useMemo(() => renderBody(text, { sanitize, blocks: props.blocks }), [text, sanitize])
  return (
    <div className="scrum-md" id={props.panelId} role="tabpanel">
      {split.unrecognized && (
        <p className="scrum-md-notice">frontmatter não reconhecido (espaço após <code>---</code>? CRLF? sem fechamento?) — o gate diria o mesmo</p>
      )}
      {split.frontmatter !== null && <FrontmatterTable rows={rows} />}
      {segments.map((segment, index) => segment.kind === 'html'
        ? <div key={index} className="scrum-md-html" dangerouslySetInnerHTML={{ __html: segment.html }} />
        : (
          <DiagramFigure
            key={`m${segment.block.index}`}
            block={segment.block}
            state={props.states[segment.block.index]}
            unavailable={props.unavailable}
            onRetry={props.onRetry}
          />
        ))}
    </div>
  )
}

/** The frontmatter as GitHub shows it (comp-58 R3): a literal key | value table, never judged. */
function FrontmatterTable(props: { rows: { key: string; value: string; block: string[] }[] }) {
  return (
    <div className="scrum-md-fm">
      <table title="Tabela literal do frontmatter — quem valida é o gate">
        <thead><tr><th>chave</th><th>valor</th></tr></thead>
        <tbody>
          {props.rows.map((row, index) => (
            <tr key={index}>
              <td><code>{row.key}</code></td>
              <td>
                {row.value}
                {row.block.length > 0 && <pre>{row.block.join('\n')}</pre>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * The `Diagramas · N` faixa of one artifact (comp-44 R2/R4/R5): the count,
 * the `rascunho` marker when the draft differs from the server (the preview
 * follows the DRAFT — the deliberate opposite of the trail's mask), the
 * toggle, and the unavailable notice with its retry when the engine failed.
 */
function DiagramsBar(props: {
  count: number
  dirty: boolean
  on: boolean
  unavailable: string | undefined
  onToggle: () => void
  onRetry: () => void
}) {
  return (
    <div className="scrum-diagrams-bar">
      <span className="scrum-diagrams-count">Diagramas · {props.count}</span>
      {props.dirty && <span className="scrum-diagrams-draft" title="O preview mostra o rascunho — o gate lê o que está no servidor">rascunho</span>}
      <span style={{ flex: 1 }} />
      {props.unavailable !== undefined
        ? (
          <>
            <span className="scrum-diagrams-unavailable">Diagramas indisponíveis: {props.unavailable}</span>
            <button type="button" className="scrum-btn" onClick={props.onRetry}>tentar de novo</button>
          </>
        )
        : (
          <button type="button" className="scrum-btn" aria-pressed={props.on} onClick={props.onToggle}>
            {props.on ? 'Ocultar' : 'Mostrar'}
          </button>
        )}
    </div>
  )
}

/** The rendered diagrams of one artifact in Escrever, in document order (comp-44 R2/R5): one figure per block. */
function DiagramList(props: { blocks: Block[]; states: Record<number, BlockState> }) {
  return (
    <div className="scrum-diagrams">
      {props.blocks.map((block) => <DiagramFigure key={block.index} block={block} state={props.states[block.index]} />)}
    </div>
  )
}

/**
 * One diagram (comp-44 R2/R5, shared by DiagramList and ArtifactView since
 * comp-58): the caption `#n · kind` and the body by state — loading, the
 * svg, or the engine's literal error beside intact siblings; with
 * `unavailable` set (Visualizar has no faixa to say it) the body is the
 * notice with its retry (R4). The svg is a string mermaid produced under
 * `securityLevel: 'strict'` (labels sanitized); this is one of the panel's
 * two dangerouslySetInnerHTML (the other is ArtifactView's html segment)
 * and it is scoped to that contract. The svg sits at its natural width
 * (R9, `svgNaturalWidth` from the viewBox — mermaid's own `width="100%"`
 * would shrink a wide diagram to the form) inside the two-axis scroll
 * container.
 */
function DiagramFigure(props: { block: Block; state: BlockState | undefined; unavailable?: string; onRetry?: () => void }) {
  const { block, state } = props
  const width = state?.kind === 'ready' ? svgNaturalWidth(state.svg) : null
  return (
    <figure className={`scrum-diagram is-${props.unavailable !== undefined ? 'unavailable' : state?.kind ?? 'idle'}`}>
      <figcaption>#{block.index + 1} · {block.kind || '(vazio)'}</figcaption>
      {props.unavailable !== undefined
        ? (
          <div className="scrum-diagram-unavailable">
            <span className="scrum-diagrams-unavailable">Diagramas indisponíveis: {props.unavailable}</span>
            {props.onRetry !== undefined && <button type="button" className="scrum-btn" onClick={props.onRetry}>tentar de novo</button>}
          </div>
        )
        : state === undefined || state.kind === 'loading'
          ? <div className="scrum-diagram-loading scrum-muted">Renderizando…</div>
          : state.kind === 'ready'
            ? (
              <div className="scrum-diagram-svg">
                <div className="scrum-diagram-natural" style={width === null ? undefined : { width }} dangerouslySetInnerHTML={{ __html: state.svg }} />
              </div>
            )
            : <pre className="scrum-diagram-error">{state.message}</pre>}
    </figure>
  )
}

/** The phase log, collapsed by default (comp-43 R6). */
function PhaseLogSection(props: { log: PhaseLogEntry[] }) {
  const lines = phaseLogLines(props.log)
  return (
    <details className="scrum-artifact scrum-history">
      <summary><span>Histórico de fases</span><span className="scrum-artifact-size">· {props.log.length} movimento(s)</span></summary>
      {lines.length === 0
        ? <div className="scrum-muted scrum-history-empty">Nenhum movimento ainda.</div>
        : <ul className="scrum-history-list">{lines.map((line, index) => <li key={index}>{line}</li>)}</ul>}
    </details>
  )
}

/** A source label for the matrix (comp-49 R7). */
function traceSourceLabel(source: WireTraceMatrix['source']): string {
  if (source === 'design') return 'matriz do design'
  if (source === 'validation') return 'matriz da validação (as-built)'
  return 'sem matriz (source: none)'
}

/** Paths one per line, or a muted placeholder. */
function PathList(props: { paths: string[]; empty: string }) {
  if (props.paths.length === 0) return <span className="scrum-muted">{props.empty}</span>
  return (
    <div className="scrum-trace-paths">
      {props.paths.map(path => <code key={path}>{path}</code>)}
    </div>
  )
}

/**
 * The traceability section of a component's work item form (comp-49 R7):
 * read-only — the source line, one row per entry (Req | Arquivos | Testes),
 * the holes as warning chips only when there are some, and the issues.
 */
export function TraceSection(props: { traces: WireTraceMatrix }) {
  const { traces } = props
  const holes: { label: string; ids: string[] }[] = [
    { label: 'Sem rastro', ids: traces.untraced },
    { label: 'Sem prova', ids: traces.unproven },
    { label: 'Desconhecidos', ids: traces.unknown },
  ].filter(hole => hole.ids.length > 0)
  return (
    <div className="scrum-trace-section">
      <div className="scrum-trace-head">
        <span>Rastreabilidade</span>
        <span className="scrum-trace-source">{traceSourceLabel(traces.source)}</span>
      </div>
      {traces.entries.length > 0 && (
        <table className="scrum-trace">
          <thead>
            <tr><th>Req</th><th>Arquivos</th><th>Testes</th></tr>
          </thead>
          <tbody>
            {traces.entries.map((entry, index) => (
              <tr key={index}>
                <td>
                  <div className="scrum-trace-reqs">
                    {entry.req.map(id => <span key={id} className="scrum-chip">{id}</span>)}
                  </div>
                </td>
                <td><PathList paths={entry.files} empty="— (sem código)" /></td>
                <td><PathList paths={entry.tests} empty="— (sem prova)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {holes.length > 0 && (
        <div className="scrum-trace-holes">
          {holes.map(hole => (
            <span key={hole.label} className="scrum-chip scrum-trace-hole">{hole.label}: {hole.ids.join(', ')}</span>
          ))}
        </div>
      )}
      {traces.issues.length > 0 && (
        <ul className="scrum-trace-issues scrum-muted">
          {traces.issues.map(issue => <li key={issue}>{issue}</li>)}
        </ul>
      )}
    </div>
  )
}
