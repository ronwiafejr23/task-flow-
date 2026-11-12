import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchCanvasAssignments,
  loadCanvasSettings,
  normalizeCanvasUrl,
  saveCanvasSettings,
  type CanvasSettings,
} from '../lib/canvas'
import type { ImportItem } from '../types'

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'ok' | 'error'
  message: string
  at: number | null
}

const SYNC_EVERY_MS = 30 * 60 * 1000

/**
 * The assistant's Canvas auto-pilot: once connected, it pulls upcoming
 * Canvas work when the board opens (and every 30 minutes after) and adds
 * anything new and unsubmitted to To Do.
 */
export function useCanvasSync(
  ready: boolean,
  importTasks: (items: ImportItem[]) => Promise<number>,
  notify: (message: string) => void,
) {
  const [settings, setSettings] = useState<CanvasSettings | null>(loadCanvasSettings)
  const [status, setStatus] = useState<SyncStatus>({ state: 'idle', message: '', at: null })

  // Always call the newest importTasks, so duplicates are checked against the current board.
  const importRef = useRef(importTasks)
  importRef.current = importTasks

  const run = useCallback(
    async (config: CanvasSettings) => {
      setStatus((s) => ({ ...s, state: 'syncing', message: 'Checking Canvas…' }))
      try {
        const items = await fetchCanvasAssignments(config.url, config.token)
        const added = await importRef.current(items.filter((i) => !i.done))
        setStatus({
          state: 'ok',
          message: added > 0 ? `Added ${added} new task${added === 1 ? '' : 's'} from Canvas.` : 'Canvas is up to date.',
          at: Date.now(),
        })
        if (added > 0) notify(`Assistant added ${added} Canvas task${added === 1 ? '' : 's'} to To Do.`)
        return true
      } catch (err) {
        setStatus({ state: 'error', message: err instanceof Error ? err.message : 'Canvas sync failed.', at: Date.now() })
        return false
      }
    },
    [notify],
  )

  const startedFor = useRef<string | null>(null)

  /** Test the connection; keep it only if Canvas accepts it. */
  const connect = useCallback(
    async (address: string, token: string, auto: boolean) => {
      const url = normalizeCanvasUrl(address)
      if (!url) {
        setStatus({ state: 'error', message: 'Enter your Canvas address, like yourschool.instructure.com', at: Date.now() })
        return false
      }
      if (!token.trim()) {
        setStatus({ state: 'error', message: 'Paste a Canvas access token.', at: Date.now() })
        return false
      }
      const config = { url, token: token.trim(), auto }
      const ok = await run(config)
      if (ok) {
        startedFor.current = config.token // already synced just now
        saveCanvasSettings(config)
        setSettings(config)
      }
      return ok
    },
    [run],
  )

  const disconnect = useCallback(() => {
    saveCanvasSettings(null)
    setSettings(null)
    setStatus({ state: 'idle', message: '', at: null })
  }, [])

  const setAuto = useCallback(
    (auto: boolean) => {
      if (!settings) return
      const next = { ...settings, auto }
      saveCanvasSettings(next)
      setSettings(next)
    },
    [settings],
  )

  const syncNow = useCallback(() => (settings ? run(settings) : Promise.resolve(false)), [settings, run])

  // Auto-pilot: on open, then every 30 minutes while the board stays open.
  useEffect(() => {
    if (!ready || !settings?.auto) return
    if (startedFor.current !== settings.token) {
      startedFor.current = settings.token
      void run(settings)
    }
    const timer = window.setInterval(() => void run(settings), SYNC_EVERY_MS)
    return () => window.clearInterval(timer)
  }, [ready, settings, run])

  return { settings, status, connect, disconnect, setAuto, syncNow }
}

export type CanvasSync = ReturnType<typeof useCanvasSync>
