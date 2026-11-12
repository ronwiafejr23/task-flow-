import { useCallback, useMemo, useRef, useState, type ReactNode } from 'react'
import { useAuth } from './hooks/useAuth'
import { useBoard } from './hooks/useBoard'
import { useCanvasSync } from './hooks/useCanvasSync'
import { isConfigured } from './lib/supabase'
import type { CardMeta, Label, Member, Status } from './types'
import { Header } from './components/Header'
import { StatsBar } from './components/StatsBar'
import { EMPTY_FILTERS, FilterBar, type Filters } from './components/FilterBar'
import { Board } from './components/Board'
import { TaskModal } from './components/TaskModal'
import { TaskPanel } from './components/TaskPanel'
import { ManageModal } from './components/ManageModal'
import { ImportModal } from './components/ImportModal'
import { AssistantBar, AssistantPanel } from './components/Assistant'
import { Toast } from './components/Toast'

export default function App() {
  const auth = useAuth()
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number>()
  const notify = useCallback((message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 5000)
  }, [])

  const board = useBoard(auth.userId, notify)
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)
  const [createIn, setCreateIn] = useState<Status | null>(null)
  const [openTaskId, setOpenTaskId] = useState<string | null>(null)
  const [manageOpen, setManageOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)

  // Assistant auto-pilot: keeps To Do filled with upcoming Canvas work
  const canvas = useCanvasSync(Boolean(auth.userId) && !board.loading && !board.error, board.importTasks, notify)

  // Canvas/Gmail items already on the board, so they aren't imported twice
  const importedKeys = useMemo(
    () => new Set(board.tasks.filter((t) => t.external_id).map((t) => `${t.source}:${t.external_id}`)),
    [board.tasks],
  )

  // Lookup maps for card metadata
  const meta = useMemo(() => {
    const memberById = new Map(board.members.map((m) => [m.id, m]))
    const labelById = new Map(board.labels.map((l) => [l.id, l]))
    const membersByTask = new Map<string, Member[]>()
    const labelsByTask = new Map<string, Label[]>()
    for (const a of board.assignees) {
      const m = memberById.get(a.member_id)
      if (m) membersByTask.set(a.task_id, [...(membersByTask.get(a.task_id) ?? []), m])
    }
    for (const tl of board.taskLabels) {
      const l = labelById.get(tl.label_id)
      if (l) labelsByTask.set(tl.task_id, [...(labelsByTask.get(tl.task_id) ?? []), l])
    }
    return { membersByTask, labelsByTask }
  }, [board.members, board.labels, board.assignees, board.taskLabels])

  const getMeta = useCallback(
    (taskId: string): CardMeta => ({
      labels: meta.labelsByTask.get(taskId) ?? [],
      members: meta.membersByTask.get(taskId) ?? [],
      comments: board.commentCounts[taskId] ?? 0,
    }),
    [meta, board.commentCounts],
  )

  const visibleTasks = useMemo(() => {
    const q = filters.search.trim().toLowerCase()
    return board.tasks.filter((t) => {
      if (q && !t.title.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false
      if (filters.priority !== 'all' && t.priority !== filters.priority) return false
      if (filters.labelId !== 'all' && !(meta.labelsByTask.get(t.id) ?? []).some((l) => l.id === filters.labelId)) return false
      if (filters.memberId !== 'all' && !(meta.membersByTask.get(t.id) ?? []).some((m) => m.id === filters.memberId)) return false
      return true
    })
  }, [board.tasks, filters, meta])

  const openTask = openTaskId ? board.tasks.find((t) => t.id === openTaskId) : undefined

  if (!isConfigured) return <SetupScreen />
  if (auth.loading) return <CenterScreen title="Starting your guest session…" spinner />
  if (auth.error)
    return (
      <CenterScreen
        title="Couldn't start a guest session"
        body={`${auth.error}. Make sure Anonymous sign-ins are enabled in Supabase → Authentication.`}
        action={<button className="btn btn-primary" onClick={() => window.location.reload()}>Try again</button>}
      />
    )

  return (
    <div className="app">
      <Header onNewTask={() => setCreateIn('todo')} onManage={() => setManageOpen(true)} onImport={() => setImportOpen(true)} onAssistant={() => setAssistantOpen(true)} />
      <StatsBar tasks={board.tasks} />
      {!board.loading && !board.error && (
        <AssistantBar tasks={board.tasks} canvas={canvas} onCreate={board.createTask} onOpen={() => setAssistantOpen(true)} notify={notify} />
      )}
      <FilterBar filters={filters} onChange={setFilters} labels={board.labels} members={[]} shown={visibleTasks.length} total={board.tasks.length} />

      {board.error && (
        <div className="error-banner" role="alert">
          <span>Couldn't load your board: {board.error}</span>
          <button type="button" className="btn btn-sm btn-ghost" onClick={() => void board.reload()}>Retry</button>
        </div>
      )}

      {!board.loading && !board.error && board.tasks.length === 0 && (
        <div className="welcome">
          <strong>Your board is empty.</strong> Create your first task, or import assignments from Canvas and emails from Gmail.
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setCreateIn('todo')}>Create a task</button>
        </div>
      )}

      <Board
        tasks={visibleTasks}
        loading={board.loading}
        getMeta={getMeta}
        onMove={(id, status, position) => void board.moveTask(id, status, position)}
        onOpen={setOpenTaskId}
        onAdd={setCreateIn}
      />

      {createIn && (
        <TaskModal
          initialStatus={createIn}
          labels={board.labels}
          members={[]}
          onCreate={board.createTask}
          onClose={() => setCreateIn(null)}
        />
      )}

      {openTask && (
        <TaskPanel
          key={openTask.id}
          task={openTask}
          members={[]}
          labels={board.labels}
          assignedIds={(meta.membersByTask.get(openTask.id) ?? []).map((m) => m.id)}
          labelIds={(meta.labelsByTask.get(openTask.id) ?? []).map((l) => l.id)}
          onClose={() => setOpenTaskId(null)}
          onUpdate={(patch) => board.updateTask(openTask.id, patch)}
          onToggleAssignee={(memberId) => board.toggleAssignee(openTask.id, memberId)}
          onToggleLabel={(labelId) => board.toggleTaskLabel(openTask.id, labelId)}
          onDelete={() => board.deleteTask(openTask.id)}
          onCommentAdded={() => board.bumpCommentCount(openTask.id, 1)}
          notify={notify}
        />
      )}

      {manageOpen && (
        <ManageModal
          labels={board.labels}
          onAddLabel={board.addLabel}
          onRemoveLabel={(id) => void board.removeLabel(id)}
          onClose={() => setManageOpen(false)}
        />
      )}

      {assistantOpen && (
        <AssistantPanel
          tasks={board.tasks}
          canvas={canvas}
          onOpenTask={(id) => {
            setAssistantOpen(false)
            setOpenTaskId(id)
          }}
          onClose={() => setAssistantOpen(false)}
        />
      )}

      {importOpen && (
        <ImportModal
          importedKeys={importedKeys}
          onImport={async (items) => {
            const added = await board.importTasks(items)
            if (added > 0) notify(`Added ${added} task${added === 1 ? '' : 's'} to To Do.`)
            return added
          }}
          onClose={() => setImportOpen(false)}
        />
      )}

      <Toast message={toast} onClose={() => setToast(null)} />
    </div>
  )
}

function CenterScreen({ title, body, action, spinner }: { title: string; body?: string; action?: ReactNode; spinner?: boolean }) {
  return (
    <div className="center-screen">
      {spinner && <div className="spinner" aria-hidden="true" />}
      <h1>{title}</h1>
      {body && <p>{body}</p>}
      {action}
    </div>
  )
}

function SetupScreen() {
  return (
    <CenterScreen
      title="Connect Supabase to get started"
      body="Copy .env.example to .env.local, paste your project URL and anon key from Supabase → Project Settings → API, then restart npm run dev."
    />
  )
}
