import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import type { ImportItem, Label, Member, NewTaskInput, Status, Task, TaskAssignee, TaskLabel } from '../types'

type Notify = (message: string) => void

/**
 * All board data plus the mutations that change it.
 * Every mutation is optimistic: local state changes first, then
 * Supabase is called, and the change is rolled back if it fails.
 */
export function useBoard(userId: string | null, notify: Notify) {
  const [tasks, setTasks] = useState<Task[]>([])
  const [members, setMembers] = useState<Member[]>([])
  const [labels, setLabels] = useState<Label[]>([])
  const [assignees, setAssignees] = useState<TaskAssignee[]>([])
  const [taskLabels, setTaskLabels] = useState<TaskLabel[]>([])
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const results = await Promise.all([
      supabase.from('tasks').select('*').order('position'),
      supabase.from('team_members').select('id, name, color').order('created_at'),
      supabase.from('labels').select('id, name, color').order('created_at'),
      supabase.from('task_assignees').select('task_id, member_id'),
      supabase.from('task_labels').select('task_id, label_id'),
      supabase.from('comments').select('task_id'),
    ])
    const failed = results.find((r) => r.error)
    if (failed?.error) {
      setError(failed.error.message)
      setLoading(false)
      return
    }
    const [t, m, l, a, tl, c] = results
    setTasks((t.data ?? []) as Task[])
    setMembers((m.data ?? []) as Member[])
    setLabels((l.data ?? []) as Label[])
    setAssignees((a.data ?? []) as TaskAssignee[])
    setTaskLabels((tl.data ?? []) as TaskLabel[])
    const counts: Record<string, number> = {}
    for (const row of (c.data ?? []) as { task_id: string }[]) counts[row.task_id] = (counts[row.task_id] ?? 0) + 1
    setCommentCounts(counts)
    setLoading(false)
  }, [])

  useEffect(() => {
    if (userId) void load()
  }, [userId, load])

  // ---------- tasks ----------

  const createTask = useCallback(
    async (input: NewTaskInput) => {
      if (!userId) return false
      const now = new Date().toISOString()
      const inColumn = tasks.filter((t) => t.status === input.status)
      const position = inColumn.length ? Math.max(...inColumn.map((t) => t.position)) + 1024 : 1024
      const task: Task = {
        id: crypto.randomUUID(),
        user_id: userId,
        title: input.title.trim(),
        description: input.description.trim() || null,
        status: input.status,
        priority: input.priority,
        due_date: input.due_date,
        position,
        source: 'manual',
        external_id: null,
        source_url: null,
        created_at: now,
        updated_at: now,
      }
      const newAssignees = input.memberIds.map((member_id) => ({ task_id: task.id, member_id }))
      const newLabels = input.labelIds.map((label_id) => ({ task_id: task.id, label_id }))

      setTasks((ts) => [...ts, task])
      setAssignees((xs) => [...xs, ...newAssignees])
      setTaskLabels((xs) => [...xs, ...newLabels])

      const { error: insertError } = await supabase.from('tasks').insert({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status,
        priority: task.priority,
        due_date: task.due_date,
        position: task.position,
      })
      if (insertError) {
        setTasks((ts) => ts.filter((t) => t.id !== task.id))
        setAssignees((xs) => xs.filter((x) => x.task_id !== task.id))
        setTaskLabels((xs) => xs.filter((x) => x.task_id !== task.id))
        notify(`Couldn't create task: ${insertError.message}`)
        return false
      }
      const linkErrors = await Promise.all([
        newAssignees.length ? supabase.from('task_assignees').insert(newAssignees) : Promise.resolve({ error: null }),
        newLabels.length ? supabase.from('task_labels').insert(newLabels) : Promise.resolve({ error: null }),
      ])
      if (linkErrors.some((r) => r.error)) notify('Task saved, but some assignees or labels did not save.')
      return true
    },
    [tasks, userId, notify],
  )

  /** Add Canvas assignments / Gmail messages as To Do cards. Returns how many were added. */
  const importTasks = useCallback(
    async (items: ImportItem[]) => {
      if (!userId) return 0
      const existing = new Set(tasks.filter((t) => t.external_id).map((t) => `${t.source}:${t.external_id}`))
      const fresh = items.filter((i) => !existing.has(`${i.source}:${i.externalId}`))
      if (fresh.length === 0) return 0

      const todo = tasks.filter((t) => t.status === 'todo')
      let position = todo.length ? Math.max(...todo.map((t) => t.position)) : 0
      const now = new Date().toISOString()
      const rows: Task[] = fresh.map((i) => {
        position += 1024
        return {
          id: crypto.randomUUID(),
          user_id: userId,
          title: (i.title.trim() || '(no title)').slice(0, 200),
          description: i.description.trim() || null,
          status: 'todo',
          priority: i.priority ?? 'normal',
          due_date: i.due,
          position,
          source: i.source,
          external_id: i.externalId,
          source_url: i.url,
          created_at: now,
          updated_at: now,
        }
      })

      setTasks((ts) => [...ts, ...rows])
      const { error: insertError } = await supabase.from('tasks').insert(
        rows.map((r) => ({
          id: r.id,
          title: r.title,
          description: r.description,
          status: r.status,
          priority: r.priority,
          due_date: r.due_date,
          position: r.position,
          source: r.source,
          external_id: r.external_id,
          source_url: r.source_url,
        })),
      )
      if (insertError) {
        const ids = new Set(rows.map((r) => r.id))
        setTasks((ts) => ts.filter((t) => !ids.has(t.id)))
        notify(`Couldn't import: ${insertError.message}`)
        return 0
      }
      return rows.length
    },
    [tasks, userId, notify],
  )

  const updateTask = useCallback(
    async (id: string, patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'due_date' | 'position'>>) => {
      const before = tasks.find((t) => t.id === id)
      if (!before) return false
      setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, ...patch } : t)))
      const { error: updateError } = await supabase.from('tasks').update(patch).eq('id', id)
      if (updateError) {
        setTasks((ts) => ts.map((t) => (t.id === id ? before : t)))
        notify(`Couldn't save change: ${updateError.message}`)
        return false
      }
      return true
    },
    [tasks, notify],
  )

  const moveTask = useCallback(
    (id: string, status: Status, position: number) => updateTask(id, { status, position }),
    [updateTask],
  )

  const deleteTask = useCallback(
    async (id: string) => {
      const before = tasks.find((t) => t.id === id)
      if (!before) return false
      setTasks((ts) => ts.filter((t) => t.id !== id))
      const { error: deleteError } = await supabase.from('tasks').delete().eq('id', id)
      if (deleteError) {
        setTasks((ts) => [...ts, before])
        notify(`Couldn't delete task: ${deleteError.message}`)
        return false
      }
      setAssignees((xs) => xs.filter((x) => x.task_id !== id))
      setTaskLabels((xs) => xs.filter((x) => x.task_id !== id))
      return true
    },
    [tasks, notify],
  )

  // ---------- assignees & labels on a task ----------

  const toggleAssignee = useCallback(
    async (taskId: string, memberId: string) => {
      const exists = assignees.some((a) => a.task_id === taskId && a.member_id === memberId)
      const row = { task_id: taskId, member_id: memberId }
      const remove = (xs: TaskAssignee[]) => xs.filter((a) => !(a.task_id === taskId && a.member_id === memberId))
      setAssignees((xs) => (exists ? remove(xs) : [...xs, row]))
      const { error: e } = exists
        ? await supabase.from('task_assignees').delete().match(row)
        : await supabase.from('task_assignees').insert(row)
      if (e) {
        setAssignees((xs) => (exists ? [...xs, row] : remove(xs)))
        notify(`Couldn't update assignees: ${e.message}`)
        return false
      }
      return true
    },
    [assignees, notify],
  )

  const toggleTaskLabel = useCallback(
    async (taskId: string, labelId: string) => {
      const exists = taskLabels.some((l) => l.task_id === taskId && l.label_id === labelId)
      const row = { task_id: taskId, label_id: labelId }
      const remove = (xs: TaskLabel[]) => xs.filter((l) => !(l.task_id === taskId && l.label_id === labelId))
      setTaskLabels((xs) => (exists ? remove(xs) : [...xs, row]))
      const { error: e } = exists
        ? await supabase.from('task_labels').delete().match(row)
        : await supabase.from('task_labels').insert(row)
      if (e) {
        setTaskLabels((xs) => (exists ? [...xs, row] : remove(xs)))
        notify(`Couldn't update labels: ${e.message}`)
        return false
      }
      return true
    },
    [taskLabels, notify],
  )

  // ---------- team members & labels ----------

  const addMember = useCallback(
    async (name: string, color: string) => {
      const { data, error: e } = await supabase.from('team_members').insert({ name: name.trim(), color }).select('id, name, color').single()
      if (e) {
        notify(`Couldn't add member: ${e.message}`)
        return false
      }
      setMembers((xs) => [...xs, data as Member])
      return true
    },
    [notify],
  )

  const removeMember = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('team_members').delete().eq('id', id)
      if (e) {
        notify(`Couldn't remove member: ${e.message}`)
        return
      }
      setMembers((xs) => xs.filter((m) => m.id !== id))
      setAssignees((xs) => xs.filter((a) => a.member_id !== id))
    },
    [notify],
  )

  const addLabel = useCallback(
    async (name: string, color: string) => {
      const { data, error: e } = await supabase.from('labels').insert({ name: name.trim(), color }).select('id, name, color').single()
      if (e) {
        notify(e.code === '23505' ? 'You already have a label with that name.' : `Couldn't add label: ${e.message}`)
        return false
      }
      setLabels((xs) => [...xs, data as Label])
      return true
    },
    [notify],
  )

  const removeLabel = useCallback(
    async (id: string) => {
      const { error: e } = await supabase.from('labels').delete().eq('id', id)
      if (e) {
        notify(`Couldn't remove label: ${e.message}`)
        return
      }
      setLabels((xs) => xs.filter((l) => l.id !== id))
      setTaskLabels((xs) => xs.filter((l) => l.label_id !== id))
    },
    [notify],
  )

  const bumpCommentCount = useCallback((taskId: string, delta: number) => {
    setCommentCounts((c) => ({ ...c, [taskId]: Math.max(0, (c[taskId] ?? 0) + delta) }))
  }, [])

  return {
    tasks,
    members,
    labels,
    assignees,
    taskLabels,
    commentCounts,
    loading,
    error,
    reload: load,
    createTask,
    importTasks,
    updateTask,
    moveTask,
    deleteTask,
    toggleAssignee,
    toggleTaskLabel,
    addMember,
    removeMember,
    addLabel,
    removeLabel,
    bumpCommentCount,
  }
}

export type BoardApi = ReturnType<typeof useBoard>
