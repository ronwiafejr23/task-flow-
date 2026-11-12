import { useMemo, useState } from 'react'
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import type { CardMeta, Status, Task } from '../types'
import { COLUMNS } from '../types'
import { TaskCard } from './TaskCard'
import { PlusIcon } from './Icons'

type ColumnMap = Record<Status, string[]>
const STATUSES = COLUMNS.map((c) => c.id)
const GAP = 1024

function groupByStatus(tasks: Task[]): ColumnMap {
  const map: ColumnMap = { todo: [], in_progress: [], in_review: [], done: [] }
  for (const t of [...tasks].sort((a, b) => a.position - b.position)) map[t.status].push(t.id)
  return map
}

function findColumn(id: UniqueIdentifier, map: ColumnMap): Status | null {
  const key = String(id)
  if ((STATUSES as string[]).includes(key)) return key as Status
  return STATUSES.find((s) => map[s].includes(key)) ?? null
}

interface Props {
  tasks: Task[]
  loading: boolean
  getMeta: (taskId: string) => CardMeta
  onMove: (id: string, status: Status, position: number) => void
  onOpen: (id: string) => void
  onAdd: (status: Status) => void
}

export function Board({ tasks, loading, getMeta, onMove, onOpen, onAdd }: Props) {
  const base = useMemo(() => groupByStatus(tasks), [tasks])
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks])

  // While dragging we keep a temporary copy of the column order so cards
  // can move between columns live; it is dropped once the move is saved.
  const [dragCols, setDragCols] = useState<ColumnMap | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const cols = dragCols ?? base

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), // a click still opens the card
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const handleDragStart = ({ active }: DragStartEvent) => {
    setActiveId(String(active.id))
    setDragCols(base)
  }

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    if (!over) return
    setDragCols((prev) => {
      const map = prev ?? base
      const from = findColumn(active.id, map)
      const to = findColumn(over.id, map)
      if (!from || !to || from === to) return map
      const next: ColumnMap = { ...map, [from]: map[from].filter((id) => id !== active.id), [to]: [...map[to]] }
      const overIndex = next[to].indexOf(String(over.id))
      next[to].splice(overIndex >= 0 ? overIndex : next[to].length, 0, String(active.id))
      return next
    })
  }

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    const map = dragCols ?? base
    setActiveId(null)
    setDragCols(null)
    const task = byId.get(String(active.id))
    if (!over || !task) return

    const column = findColumn(active.id, map)
    if (!column) return
    let list = map[column]
    const from = list.indexOf(task.id)
    const to = list.indexOf(String(over.id))
    if (to >= 0 && from !== to) list = arrayMove(list, from, to)

    const index = list.indexOf(task.id)
    if (task.status === column && base[column].indexOf(task.id) === index) return // nothing changed

    // New position = midpoint between neighbours, so only this one row is updated.
    const before = index > 0 ? byId.get(list[index - 1]) : undefined
    const after = index < list.length - 1 ? byId.get(list[index + 1]) : undefined
    const position =
      before && after ? (before.position + after.position) / 2 : before ? before.position + GAP : after ? after.position - GAP : GAP

    onMove(task.id, column, position)
  }

  const activeTask = activeId ? byId.get(activeId) : undefined

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={() => {
        setActiveId(null)
        setDragCols(null)
      }}
    >
      <main className="board">
        {COLUMNS.map((col) => (
          <Column
            key={col.id}
            id={col.id}
            title={col.title}
            dot={col.dot}
            ids={cols[col.id]}
            byId={byId}
            loading={loading}
            dragging={activeId !== null}
            getMeta={getMeta}
            onOpen={onOpen}
            onAdd={onAdd}
          />
        ))}
      </main>
      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2, 0, 0, 1)' }}>
        {activeTask ? <TaskCard task={activeTask} meta={getMeta(activeTask.id)} overlay /> : null}
      </DragOverlay>
    </DndContext>
  )
}

interface ColumnProps {
  id: Status
  title: string
  dot: string
  ids: string[]
  byId: Map<string, Task>
  loading: boolean
  dragging: boolean
  getMeta: (taskId: string) => CardMeta
  onOpen: (id: string) => void
  onAdd: (status: Status) => void
}

function Column({ id, title, dot, ids, byId, loading, dragging, getMeta, onOpen, onAdd }: ColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id })

  return (
    <section className={`column${isOver ? ' column-over' : ''}`} aria-label={title}>
      <div className="column-head">
        <span className="dot dot-lg" style={{ background: dot }} />
        <h2 className="column-title">{title}</h2>
        <span className="count">{loading ? '–' : ids.length}</span>
        <span className="spacer" />
        <button type="button" className="icon-btn" aria-label={`Add task to ${title}`} onClick={() => onAdd(id)}>
          <PlusIcon size={16} />
        </button>
      </div>

      <SortableContext id={id} items={ids} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className="column-body">
          {loading ? (
            <>
              <div className="skeleton" />
              <div className="skeleton short" />
            </>
          ) : ids.length === 0 ? (
            <div className={`empty${dragging ? ' empty-drop' : ''}`}>{dragging ? 'Drop here' : 'No tasks yet'}</div>
          ) : (
            ids.map((taskId) => {
              const task = byId.get(taskId)
              return task ? <SortableCard key={taskId} task={task} meta={getMeta(taskId)} onOpen={onOpen} /> : null
            })
          )}
        </div>
      </SortableContext>

      <button type="button" className="add-btn" onClick={() => onAdd(id)}>
        <PlusIcon size={14} /> Add task
      </button>
    </section>
  )
}

function SortableCard({ task, meta, onOpen }: { task: Task; meta: CardMeta; onOpen: (id: string) => void }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <TaskCard
      task={task}
      meta={meta}
      ghost={isDragging}
      cardRef={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      aria-label={`${task.title}. Press space to move, O to open.`}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(task.id)}
      onKeyDown={(e) => {
        const keyDown = listeners?.onKeyDown as ((event: typeof e) => void) | undefined
        keyDown?.(e)
        if (e.key === 'o' || e.key === 'O') onOpen(task.id)
      }}
    />
  )
}
