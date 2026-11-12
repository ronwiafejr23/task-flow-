import { useState, type FormEvent } from 'react'
import type { Label, Member, NewTaskInput, Priority, Status } from '../types'
import { COLUMNS, PRIORITY_LABEL } from '../types'
import { Modal } from './Modal'
import { Avatar } from './Avatar'

interface Props {
  initialStatus: Status
  labels: Label[]
  members: Member[]
  onCreate: (input: NewTaskInput) => Promise<boolean>
  onClose: () => void
}

export function TaskModal({ initialStatus, labels, members, onCreate, onClose }: Props) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<Status>(initialStatus)
  const [priority, setPriority] = useState<Priority>('normal')
  const [due, setDue] = useState('')
  const [labelIds, setLabelIds] = useState<string[]>([])
  const [memberIds, setMemberIds] = useState<string[]>([])
  const [touched, setTouched] = useState(false)
  const [saving, setSaving] = useState(false)

  const titleError = touched && title.trim() === '' ? 'Give the task a title.' : null
  const toggle = (xs: string[], id: string) => (xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (!title.trim()) return
    setSaving(true)
    const ok = await onCreate({ title, description, status, priority, due_date: due || null, labelIds, memberIds })
    setSaving(false)
    if (ok) onClose()
  }

  return (
    <Modal title="New task" onClose={onClose}>
      <form className="form" onSubmit={submit} noValidate>
        <label className="field">
          <span className="field-label">Title</span>
          <input
            autoFocus
            value={title}
            maxLength={200}
            placeholder="What needs to be done?"
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() => setTouched(true)}
            aria-invalid={Boolean(titleError)}
          />
          {titleError && <span className="field-error">{titleError}</span>}
        </label>

        <label className="field">
          <span className="field-label">Description <span className="optional">optional</span></span>
          <textarea rows={3} value={description} placeholder="Add more detail…" onChange={(e) => setDescription(e.target.value)} />
        </label>

        <div className="field-row">
          <label className="field">
            <span className="field-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value as Status)}>
              {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </label>
          <label className="field">
            <span className="field-label">Due date</span>
            <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          </label>
        </div>

        <fieldset className="field">
          <legend className="field-label">Priority</legend>
          <div className="segmented">
            {(['low', 'normal', 'high'] as Priority[]).map((p) => (
              <button key={p} type="button" className={`seg${priority === p ? ' seg-on' : ''}`} aria-pressed={priority === p} onClick={() => setPriority(p)}>
                {PRIORITY_LABEL[p]}
              </button>
            ))}
          </div>
        </fieldset>

        {labels.length > 0 && (
          <fieldset className="field">
            <legend className="field-label">Labels</legend>
            <div className="chips">
              {labels.map((l) => (
                <button key={l.id} type="button" className={`chip${labelIds.includes(l.id) ? ' chip-on' : ''}`} aria-pressed={labelIds.includes(l.id)} onClick={() => setLabelIds((xs) => toggle(xs, l.id))}>
                  <span className="dot" style={{ background: l.color }} />{l.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        {members.length > 0 && (
          <fieldset className="field">
            <legend className="field-label">Assignees</legend>
            <div className="chips">
              {members.map((m) => (
                <button key={m.id} type="button" className={`chip chip-person${memberIds.includes(m.id) ? ' chip-on' : ''}`} aria-pressed={memberIds.includes(m.id)} onClick={() => setMemberIds((xs) => toggle(xs, m.id))}>
                  <Avatar member={m} size={20} />{m.name}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="modal-foot">
          <button type="button" className="btn btn-ghost" onClick={onClose}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={saving}>{saving ? 'Creating…' : 'Create task'}</button>
        </div>
      </form>
    </Modal>
  )
}
