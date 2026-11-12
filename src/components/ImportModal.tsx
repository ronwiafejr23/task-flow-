import { useState, type FormEvent } from 'react'
import { defaultCanvasUrl, fetchCanvasAssignments, normalizeCanvasUrl } from '../lib/canvas'
import { fetchGmailMessages, gmailClientId, requestGmailToken } from '../lib/gmail'
import type { ImportItem } from '../types'
import { Modal } from './Modal'
import { ImportIcon } from './Icons'

interface Props {
  /** "source:externalId" keys for items that are already on the board */
  importedKeys: Set<string>
  onImport: (items: ImportItem[]) => Promise<number>
  onClose: () => void
}

const keyOf = (i: ImportItem) => `${i.source}:${i.externalId}`
const CANVAS_URL_KEY = 'taskflow.canvasUrl'

function savedCanvasUrl() {
  try {
    return localStorage.getItem(CANVAS_URL_KEY) ?? defaultCanvasUrl
  } catch {
    return defaultCanvasUrl
  }
}

export function ImportModal({ importedKeys, onImport, onClose }: Props) {
  const [tab, setTab] = useState<'canvas' | 'gmail'>('canvas')
  return (
    <Modal title="Import tasks" onClose={onClose} wide>
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'canvas'} className={`tab${tab === 'canvas' ? ' tab-on' : ''}`} onClick={() => setTab('canvas')}>
          Canvas
        </button>
        <button type="button" role="tab" aria-selected={tab === 'gmail'} className={`tab${tab === 'gmail' ? ' tab-on' : ''}`} onClick={() => setTab('gmail')}>
          Gmail
        </button>
      </div>
      {tab === 'canvas' ? (
        <CanvasTab importedKeys={importedKeys} onImport={onImport} onClose={onClose} />
      ) : (
        <GmailTab importedKeys={importedKeys} onImport={onImport} onClose={onClose} />
      )}
    </Modal>
  )
}

function CanvasTab({ importedKeys, onImport, onClose }: Props) {
  const [url, setUrl] = useState(savedCanvasUrl)
  const [token, setToken] = useState('')
  const [items, setItems] = useState<ImportItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    const baseUrl = normalizeCanvasUrl(url)
    if (!baseUrl) return setError('Enter your school Canvas address, like yourschool.instructure.com')
    if (!token.trim()) return setError('Paste a Canvas access token.')
    setLoading(true)
    try {
      setItems(await fetchCanvasAssignments(baseUrl, token.trim()))
      try {
        localStorage.setItem(CANVAS_URL_KEY, baseUrl)
      } catch {
        /* storage unavailable: fine, it is only a convenience */
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Canvas import failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="import-body">
      <form className="form" style={{ padding: 0 }} onSubmit={load}>
        <div className="field-row">
          <label className="field">
            <span className="field-label">Canvas address</span>
            <input value={url} placeholder="yourschool.instructure.com" onChange={(e) => setUrl(e.target.value)} autoComplete="off" />
          </label>
          <label className="field">
            <span className="field-label">Access token</span>
            <input type="password" value={token} placeholder="Paste token" onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          </label>
        </div>
        <p className="hint">
          In Canvas go to Account → Settings → New Access Token. The token is used for this request only and is never saved.
        </p>
        <div>
          <button type="submit" className="btn btn-ghost" disabled={loading}>
            {loading ? 'Loading…' : items ? 'Refresh' : 'Load assignments'}
          </button>
        </div>
      </form>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {items && (
        <ItemPicker items={items} importedKeys={importedKeys} emptyText="No upcoming Canvas work in the next 60 days." onImport={onImport} onClose={onClose} />
      )}
    </div>
  )
}

function GmailTab({ importedKeys, onImport, onClose }: Props) {
  const [items, setItems] = useState<ImportItem[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!gmailClientId) {
    return (
      <div className="import-body">
        <div className="notice">
          Gmail isn't connected yet. Create a Google OAuth client ID (steps in the README), add it to <code>.env.local</code> as{' '}
          <code>VITE_GOOGLE_CLIENT_ID</code>, then restart <code>npm run dev</code>.
        </div>
      </div>
    )
  }

  const connect = async () => {
    setError(null)
    setLoading(true)
    try {
      const token = await requestGmailToken()
      setItems(await fetchGmailMessages(token))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gmail import failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="import-body">
      <p className="hint">
        Turn unread emails from the last 14 days into tasks. Access is read-only, and nothing is stored except the emails you choose to import.
      </p>
      <div>
        <button type="button" className="btn btn-ghost" onClick={connect} disabled={loading}>
          {loading ? 'Connecting…' : items ? 'Refresh' : 'Connect Gmail'}
        </button>
      </div>
      {error && <div className="notice notice-error" role="alert">{error}</div>}
      {items && <ItemPicker items={items} importedKeys={importedKeys} emptyText="No unread emails in the last 14 days." onImport={onImport} onClose={onClose} />}
    </div>
  )
}

interface PickerProps extends Props {
  items: ImportItem[]
  emptyText: string
}

function ItemPicker({ items, importedKeys, emptyText, onImport, onClose }: PickerProps) {
  const available = items.filter((i) => !importedKeys.has(keyOf(i)))
  const [picked, setPicked] = useState<Set<string>>(() => new Set(available.filter((i) => !i.done).map(keyOf)))
  const [saving, setSaving] = useState(false)

  if (items.length === 0) return <p className="hint">{emptyText}</p>

  const toggle = (key: string) =>
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })

  const chosen = available.filter((i) => picked.has(keyOf(i)))

  const submit = async () => {
    setSaving(true)
    const added = await onImport(chosen)
    setSaving(false)
    if (added > 0) onClose()
  }

  return (
    <>
      <ul className="import-list">
        {items.map((item) => {
          const key = keyOf(item)
          const onBoard = importedKeys.has(key)
          return (
            <li key={key}>
              <label className={`import-item${onBoard ? ' is-disabled' : ''}`}>
                <input type="checkbox" checked={onBoard || picked.has(key)} disabled={onBoard} onChange={() => toggle(key)} />
                <span>
                  <span className="import-title">{item.title}</span>
                  <span className="import-sub" style={{ display: 'block' }}>
                    {onBoard ? 'Already on your board' : item.subtitle}
                  </span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
      <div className="import-foot">
        <span className="hint">{chosen.length} selected · added to To Do</span>
        <button type="button" className="btn btn-primary" disabled={saving || chosen.length === 0} onClick={submit}>
          <ImportIcon size={15} /> {saving ? 'Importing…' : `Import ${chosen.length}`}
        </button>
      </div>
    </>
  )
}
