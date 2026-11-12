import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { format, parseISO } from 'date-fns'
import { dueSummary, focusList, notificationsSupported, notifyDueOnce, parseReminder } from '../lib/assistant'
import { defaultCanvasUrl, priorityFromDue } from '../lib/canvas'
import { timeAgo } from '../lib/dates'
import type { CanvasSync } from '../hooks/useCanvasSync'
import type { NewTaskInput, Task } from '../types'
import { STATUS_LABEL } from '../types'
import { BellIcon, CloseIcon, SparkIcon } from './Icons'

type CreateTask = (input: NewTaskInput) => Promise<boolean>

/** "Remind me to…" box: reads the date out of what you type and makes a task. */
function QuickReminder({ onCreate, notify }: { onCreate: CreateTask; notify: (message: string) => void }) {
  const [text, setText] = useState('')
  const [saving, setSaving] = useState(false)
  const parsed = useMemo(() => parseReminder(text), [text])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!parsed.title) return
    setSaving(true)
    const ok = await onCreate({
      title: parsed.title,
      description: '',
      status: 'todo',
      priority: priorityFromDue(parsed.due ? parseISO(parsed.due) : null),
      due_date: parsed.due,
      labelIds: [],
      memberIds: [],
    })
    setSaving(false)
    if (ok) {
      notify(parsed.due ? `Reminder set for ${format(parseISO(parsed.due), 'EEE, MMM d')}.` : 'Reminder added to To Do.')
      setText('')
    }
  }

  return (
    <form className="quick" onSubmit={submit}>
      <label className="grow">
        <span className="sr-only">Remind me to</span>
        <input value={text} maxLength={200} placeholder="Remind me to… e.g. email my professor Friday" onChange={(e) => setText(e.target.value)} />
      </label>
      <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !parsed.title}>Add</button>
      {text.trim() !== '' && (
        <span className="quick-preview" aria-live="polite">
          {parsed.title ? `“${parsed.title}”` : 'Type what to remember'}
          {parsed.title && (parsed.due ? ` · due ${format(parseISO(parsed.due), 'EEE, MMM d')}` : ' · no date found')}
        </span>
      )}
    </form>
  )
}

interface BarProps {
  tasks: Task[]
  canvas: CanvasSync
  onCreate: CreateTask
  onOpen: () => void
  notify: (message: string) => void
}

/** Strip above the board: what's due, plus the quick reminder box. */
export function AssistantBar({ tasks, canvas, onCreate, onOpen, notify }: BarProps) {
  const summary = useMemo(() => dueSummary(tasks), [tasks])
  const alert = summary.overdue + summary.today > 0

  // One browser notification per day when something is due.
  useEffect(() => {
    notifyDueOnce(summary)
  }, [summary])

  return (
    <section className={`assistant-bar${alert ? ' assistant-alert' : ''}`} aria-label="Assistant">
      <button type="button" className="assistant-summary" onClick={onOpen}>
        <span className="assistant-icon"><SparkIcon size={16} /></span>
        <span>
          <strong>Assistant</strong>
          <span className="assistant-text">
            {summary.text}
            {canvas.status.state === 'syncing' && ' · Checking Canvas…'}
          </span>
        </span>
      </button>
      <QuickReminder onCreate={onCreate} notify={notify} />
    </section>
  )
}

interface PanelProps {
  tasks: Task[]
  canvas: CanvasSync
  onOpenTask: (id: string) => void
  onClose: () => void
}

/** Side panel: what to do first, Canvas auto-sync and alert settings. */
export function AssistantPanel({ tasks, canvas, onOpenTask, onClose }: PanelProps) {
  const focus = useMemo(() => focusList(tasks), [tasks])
  const [permission, setPermission] = useState(() => (notificationsSupported() ? Notification.permission : 'unsupported'))

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const enableAlerts = async () => {
    const result = await Notification.requestPermission()
    setPermission(result)
    if (result === 'granted') notifyDueOnce(dueSummary(tasks))
  }

  return (
    <div className="overlay overlay-panel" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <aside className="panel" role="dialog" aria-modal="true" aria-label="Assistant">
        <div className="panel-head">
          <span className="status-pill"><SparkIcon size={13} /> Assistant</span>
          <span className="spacer" />
          <button type="button" className="icon-btn" aria-label="Close panel" onClick={onClose}><CloseIcon size={18} /></button>
        </div>

        <div className="panel-body">
          <section>
            <h3 className="section-title">Do these first</h3>
            {focus.length === 0 ? (
              <p className="hint">Nothing open right now. Add a task or connect Canvas.</p>
            ) : (
              <ol className="focus-list">
                {focus.map(({ task, reason, urgent }, index) => (
                  <li key={task.id}>
                    <button type="button" className="focus-item" onClick={() => onOpenTask(task.id)}>
                      <span className="focus-rank">{index + 1}</span>
                      <span className="grow">
                        <span className="focus-title">{task.title}</span>
                        <span className={`focus-reason${urgent ? ' is-urgent' : ''}`}>
                          {reason} · {STATUS_LABEL[task.status]}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <p className="hint">Ranked by due date, then priority, then what you've already started.</p>
          </section>

          <CanvasSection canvas={canvas} />

          <section>
            <h3 className="section-title">Due-date alerts</h3>
            {permission === 'granted' ? (
              <p className="hint"><BellIcon size={13} /> On. You'll get one notification a day when something is overdue or due within a day.</p>
            ) : permission === 'denied' ? (
              <p className="hint">Notifications are blocked for this site. Allow them from the lock icon in your browser's address bar.</p>
            ) : permission === 'unsupported' ? (
              <p className="hint">This browser doesn't support notifications. The bar above the board still shows what's due.</p>
            ) : (
              <>
                <p className="hint">Get one browser notification a day when something is overdue or due within a day.</p>
                <button type="button" className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => void enableAlerts()}>
                  <BellIcon size={14} /> Turn on notifications
                </button>
              </>
            )}
          </section>
        </div>
      </aside>
    </div>
  )
}

function CanvasSection({ canvas }: { canvas: CanvasSync }) {
  const { settings, status } = canvas
  const [address, setAddress] = useState(() => new URL(defaultCanvasUrl).host)
  const [token, setToken] = useState('')
  const [auto, setAuto] = useState(true)
  const busy = status.state === 'syncing'

  const connect = async (e: FormEvent) => {
    e.preventDefault()
    if (await canvas.connect(address, token, auto)) setToken('')
  }

  return (
    <section>
      <h3 className="section-title">Canvas auto-sync</h3>
      {settings ? (
        <>
          <p className="hint">
            Connected to {new URL(settings.url).host}. New, unsubmitted assignments are added to To Do with a priority based on the due date.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={settings.auto} onChange={(e) => canvas.setAuto(e.target.checked)} />
            Sync automatically when I open the board
          </label>
          <div className="row-actions">
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void canvas.syncNow()}>
              {busy ? 'Syncing…' : 'Sync now'}
            </button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={canvas.disconnect}>Disconnect</button>
          </div>
        </>
      ) : (
        <form className="form" style={{ padding: 0 }} onSubmit={connect}>
          <p className="hint">Connect once and the assistant keeps your board filled with upcoming Canvas work.</p>
          <label className="field">
            <span className="field-label">Canvas address</span>
            <input value={address} onChange={(e) => setAddress(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">Access token</span>
            <input type="password" value={token} placeholder="Paste token" onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </label>
          <p className="hint">
            In Canvas: Account → Settings → New Access Token. The token is saved in this browser on this computer only, so the
            assistant can sync without asking again. Disconnect removes it.
          </p>
          <label className="check-row">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} />
            Sync automatically when I open the board
          </label>
          <div>
            <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? 'Connecting…' : 'Connect Canvas'}</button>
          </div>
        </form>
      )}
      {status.message && (
        <div className={`notice${status.state === 'error' ? ' notice-error' : ''}`} role="status" style={{ marginTop: 10 }}>
          {status.message}
          {status.at && status.state !== 'syncing' && <span className="muted"> · {timeAgo(new Date(status.at).toISOString())}</span>}
        </div>
      )}
    </section>
  )
}
