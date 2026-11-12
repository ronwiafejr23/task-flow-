import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { longDate, timeAgo } from '../lib/dates'
import type { Activity, Comment, Label, Member, Priority, Status, Task } from '../types'
import { COLUMNS, PRIORITY_LABEL, SOURCE_LABEL, STATUS_LABEL } from '../types'
import { Avatar } from './Avatar'
import { CloseIcon, ExternalIcon, TrashIcon } from './Icons'

interface Props {
  task: Task
  members: Member[]
  labels: Label[]
  assignedIds: string[]
  labelIds: string[]
  onClose: () => void
  onUpdate: (patch: Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'due_date'>>) => Promise<boolean>
  onToggleAssignee: (memberId: string) => Promise<boolean>
  onToggleLabel: (labelId: string) => Promise<boolean>
  onDelete: () => Promise<boolean>
  onCommentAdded: () => void
  notify: (msg: string) => void
}

export function TaskPanel(p: Props) {
  const { task } = p
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description ?? '')
  const [comments, setComments] = useState<Comment[]>([])
  const [activity, setActivity] = useState<Activity[]>([])
  const [loadingFeed, setLoadingFeed] = useState(true)
  const [draft, setDraft] = useState('')
  const [posting, setPosting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const loadActivity = useCallback(async () => {
    const { data } = await supabase
      .from('task_activity')
      .select('*')
      .eq('task_id', task.id)
      .order('created_at', { ascending: false })
    setActivity((data ?? []) as Activity[])
  }, [task.id])

  useEffect(() => {
    let active = true
    const load = async () => {
      setLoadingFeed(true)
      const [c] = await Promise.all([
        supabase.from('comments').select('id, task_id, body, created_at').eq('task_id', task.id).order('created_at'),
        loadActivity(),
      ])
      if (!active) return
      setComments((c.data ?? []) as Comment[])
      setLoadingFeed(false)
    }
    void load()
    return () => {
      active = false
    }
  }, [task.id, loadActivity])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && p.onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [p])

  // Every change goes through here so the activity feed refreshes after the
  // database trigger has written its log row.
  const run = async (action: Promise<boolean>) => {
    if (await action) void loadActivity()
  }

  const saveTitle = () => {
    const next = title.trim()
    if (!next) return setTitle(task.title)
    if (next !== task.title) void run(p.onUpdate({ title: next }))
  }

  const saveDescription = () => {
    const next = description.trim() || null
    if (next !== task.description) void p.onUpdate({ description: next })
  }

  const postComment = async (e: FormEvent) => {
    e.preventDefault()
    const body = draft.trim()
    if (!body) return
    setPosting(true)
    const { data, error } = await supabase.from('comments').insert({ task_id: task.id, body }).select('id, task_id, body, created_at').single()
    setPosting(false)
    if (error) return p.notify(`Couldn't post comment: ${error.message}`)
    setComments((cs) => [...cs, data as Comment])
    setDraft('')
    p.onCommentAdded()
  }

  const statusDot = COLUMNS.find((c) => c.id === task.status)?.dot

  return (
    <div className="overlay overlay-panel" onMouseDown={(e) => e.target === e.currentTarget && p.onClose()}>
      <aside className="panel" role="dialog" aria-modal="true" aria-label="Task details">
        <div className="panel-head">
          <span className="status-pill"><span className="dot" style={{ background: statusDot }} />{STATUS_LABEL[task.status]}</span>
          <span className="spacer" />
          <button
            type="button"
            className={`btn btn-sm ${confirmDelete ? 'btn-danger' : 'btn-ghost'}`}
            onClick={async () => {
              if (!confirmDelete) return setConfirmDelete(true)
              if (await p.onDelete()) p.onClose()
            }}
            onBlur={() => setConfirmDelete(false)}
          >
            <TrashIcon size={14} /> {confirmDelete ? 'Click to confirm' : 'Delete'}
          </button>
          <button type="button" className="icon-btn" aria-label="Close panel" onClick={p.onClose}><CloseIcon size={18} /></button>
        </div>

        <div className="panel-body">
          <label>
            <span className="sr-only">Title</span>
            <input
              className="title-input"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </label>

          {task.source !== 'manual' && (
            <div className="due-edit">
              <span className={`source-badge source-${task.source}`}>{SOURCE_LABEL[task.source]}</span>
              {task.source_url?.startsWith('https://') && (
                <a className="source-link" href={task.source_url} target="_blank" rel="noopener noreferrer">
                  Open in {SOURCE_LABEL[task.source]} <ExternalIcon size={13} />
                </a>
              )}
            </div>
          )}

          <dl className="props">
            <dt>Status</dt>
            <dd>
              <select value={task.status} onChange={(e) => void run(p.onUpdate({ status: e.target.value as Status }))} aria-label="Status">
                {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
              </select>
            </dd>
            <dt>Priority</dt>
            <dd>
              <select value={task.priority} onChange={(e) => void run(p.onUpdate({ priority: e.target.value as Priority }))} aria-label="Priority">
                {(['low', 'normal', 'high'] as Priority[]).map((x) => <option key={x} value={x}>{PRIORITY_LABEL[x]}</option>)}
              </select>
            </dd>
            <dt>Due date</dt>
            <dd className="due-edit">
              <input type="date" value={task.due_date ?? ''} onChange={(e) => void run(p.onUpdate({ due_date: e.target.value || null }))} aria-label="Due date" />
              {task.due_date && (
                <button type="button" className="link-btn" onClick={() => void run(p.onUpdate({ due_date: null }))}>Clear</button>
              )}
            </dd>
            {p.members.length > 0 && (
              <>
            <dt>Assignees</dt>
            <dd>
                <div className="chips">
                  {p.members.map((m) => {
                    const on = p.assignedIds.includes(m.id)
                    return (
                      <button key={m.id} type="button" className={`chip chip-person${on ? ' chip-on' : ''}`} aria-pressed={on} onClick={() => void run(p.onToggleAssignee(m.id))}>
                        <Avatar member={m} size={20} />{m.name}
                      </button>
                    )
                  })}
                </div>
            </dd>
              </>
            )}
            <dt>Labels</dt>
            <dd>
              {p.labels.length === 0 ? (
                <span className="hint">Create labels with the Labels button.</span>
              ) : (
                <div className="chips">
                  {p.labels.map((l) => {
                    const on = p.labelIds.includes(l.id)
                    return (
                      <button key={l.id} type="button" className={`chip${on ? ' chip-on' : ''}`} aria-pressed={on} onClick={() => void p.onToggleLabel(l.id)}>
                        <span className="dot" style={{ background: l.color }} />{l.name}
                      </button>
                    )
                  })}
                </div>
              )}
            </dd>
          </dl>
          {task.due_date && <p className="hint">Due {longDate(task.due_date)}</p>}

          <section>
            <h3 className="section-title">Description</h3>
            <label>
              <span className="sr-only">Description</span>
              <textarea rows={4} value={description} placeholder="Add more detail…" onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription} />
            </label>
          </section>

          <section>
            <h3 className="section-title">Activity</h3>
            {loadingFeed ? (
              <div className="skeleton short" />
            ) : activity.length === 0 ? (
              <p className="hint">No activity yet.</p>
            ) : (
              <ol className="timeline">
                {activity.map((a) => (
                  <li key={a.id}>
                    <span className="timeline-dot" />
                    <span>{describe(a)} <span className="muted">· {timeAgo(a.created_at)}</span></span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section>
            <h3 className="section-title">Comments <span className="muted">{comments.length}</span></h3>
            {!loadingFeed && comments.length === 0 && <p className="hint">No comments yet. Start the conversation.</p>}
            <ul className="comments">
              {comments.map((c) => (
                <li key={c.id}>
                  <div className="comment-meta">You <span className="muted">· {timeAgo(c.created_at)}</span></div>
                  <p>{c.body}</p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <form className="comment-form" onSubmit={postComment}>
          <label className="grow">
            <span className="sr-only">Write a comment</span>
            <textarea
              rows={2}
              value={draft}
              maxLength={2000}
              placeholder="Write a comment…"
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void postComment(e)
              }}
            />
          </label>
          <button type="submit" className="btn btn-primary" disabled={posting || !draft.trim()}>Send</button>
        </form>
      </aside>
    </div>
  )
}

function describe(a: Activity): string {
  const status = (v: string | null) => (v && v in STATUS_LABEL ? STATUS_LABEL[v as Status] : v ?? '')
  const prio = (v: string | null) => (v && v in PRIORITY_LABEL ? PRIORITY_LABEL[v as Priority] : v ?? '')
  switch (a.action) {
    case 'created':
      return `Created in ${status(a.to_value)}`
    case 'status_changed':
      return `Moved ${status(a.from_value)} → ${status(a.to_value)}`
    case 'title_changed':
      return `Renamed to “${a.to_value ?? ''}”`
    case 'priority_changed':
      return `Priority ${prio(a.from_value)} → ${prio(a.to_value)}`
    case 'due_date_changed':
      return a.to_value ? `Due date set to ${longDate(a.to_value)}` : 'Due date removed'
    case 'assigned':
      return `Assigned ${a.to_value ?? 'someone'}`
    case 'unassigned':
      return `Unassigned ${a.from_value ?? 'someone'}`
  }
}
