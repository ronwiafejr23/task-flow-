import { addDays, differenceInCalendarDays, format } from 'date-fns'
import { supabase } from './supabase'
import type { ImportItem, Priority } from '../types'

interface CanvasAssignment {
  id: string
  title: string
  kind: string
  course: string
  dueAt: string | null
  url: string | null
  submitted: boolean
}

/** Canvas address used when running on your own computer. */
export const defaultCanvasUrl = __CANVAS_URL__

/** "lincolnu.instructure.com" → "https://lincolnu.instructure.com" (null if invalid). */
export function normalizeCanvasUrl(input: string): string | null {
  const raw = input.trim()
  if (!raw) return null
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`)
    return url.protocol === 'https:' ? url.origin : null
  } catch {
    return null
  }
}

/** The closer the due date, the higher the priority. */
export function priorityFromDue(due: Date | null): Priority {
  if (!due) return 'normal'
  const days = differenceInCalendarDays(due, new Date())
  if (days <= 2) return 'high'
  if (days <= 7) return 'normal'
  return 'low'
}

// ---------- saved connection (this computer only) ----------

export interface CanvasSettings {
  url: string
  token: string
  auto: boolean
}

const SETTINGS_KEY = 'taskflow.canvas'

export function loadCanvasSettings(): CanvasSettings | null {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<CanvasSettings>
    if (typeof parsed.url !== 'string' || typeof parsed.token !== 'string' || !parsed.token) return null
    return { url: parsed.url, token: parsed.token, auto: parsed.auto !== false }
  } catch {
    return null
  }
}

export function saveCanvasSettings(settings: CanvasSettings | null) {
  try {
    if (settings) localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings))
    else localStorage.removeItem(SETTINGS_KEY)
  } catch {
    /* storage unavailable: the connection just won't be remembered */
  }
}

// ---------- fetching ----------

const KINDS: Record<string, string> = { assignment: 'Assignment', quiz: 'Quiz', discussion_topic: 'Discussion' }

interface PlannerItem {
  plannable_type?: string
  plannable_id?: number | string
  plannable?: { title?: string; due_at?: string | null }
  plannable_date?: string | null
  context_name?: string
  html_url?: string
  submissions?: { submitted?: boolean } | false | null
}

/** Local mode: through the Vite dev proxy (see vite.config.ts). */
async function fetchLocal(baseUrl: string, token: string): Promise<CanvasAssignment[]> {
  if (baseUrl !== defaultCanvasUrl) {
    throw new Error(
      `This computer is set up for ${new URL(defaultCanvasUrl).host}. To use a different Canvas, set VITE_CANVAS_URL in .env.local and restart npm run dev.`,
    )
  }
  const start = new Date()
  const query = new URLSearchParams({
    start_date: format(start, 'yyyy-MM-dd'),
    end_date: format(addDays(start, 60), 'yyyy-MM-dd'),
    per_page: '100',
  })
  let res: Response
  try {
    res = await fetch(`/canvas-local/api/v1/planner/items?${query.toString()}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
  } catch {
    throw new Error('Could not reach Canvas. Check your internet connection.')
  }
  if (res.status === 401) throw new Error('Canvas rejected the access token. Generate a new one in Canvas and reconnect.')
  if (!res.ok) throw new Error(`Canvas returned an error (${res.status}).`)
  if (!(res.headers.get('content-type') ?? '').includes('json')) {
    throw new Error("Canvas didn't answer as expected. Stop the app (Ctrl + C), run npm run dev again, and retry.")
  }

  const items = (await res.json()) as PlannerItem[]
  return items
    .filter((i) => i.plannable_type !== undefined && i.plannable_type in KINDS && i.plannable?.title)
    .map((i) => ({
      id: `${i.plannable_type}-${i.plannable_id}`,
      title: String(i.plannable?.title),
      kind: KINDS[i.plannable_type as string],
      course: i.context_name ?? '',
      dueAt: i.plannable?.due_at ?? i.plannable_date ?? null,
      url: typeof i.html_url === 'string' ? new URL(i.html_url, baseUrl).toString() : null,
      submitted: Boolean(i.submissions && i.submissions.submitted),
    }))
}

/** Deployed site: through the `canvas-proxy` Supabase Edge Function. */
async function fetchViaFunction(baseUrl: string, token: string): Promise<CanvasAssignment[]> {
  const { data, error } = await supabase.functions.invoke('canvas-proxy', { body: { baseUrl, token } })
  if (error) {
    throw new Error("Couldn't reach the Canvas connection. Make sure the canvas-proxy Edge Function is deployed (see README).")
  }
  const result = data as { ok: boolean; error?: string; assignments?: CanvasAssignment[] }
  if (!result?.ok) throw new Error(result?.error ?? 'Canvas import failed.')
  return result.assignments ?? []
}

/** Upcoming Canvas work for the next 60 days. */
export async function fetchCanvasAssignments(baseUrl: string, token: string): Promise<ImportItem[]> {
  const assignments = import.meta.env.DEV ? await fetchLocal(baseUrl, token) : await fetchViaFunction(baseUrl, token)

  return assignments.map((a) => {
    const parsed = a.dueAt ? new Date(a.dueAt) : null
    const due = parsed && !Number.isNaN(parsed.getTime()) ? parsed : null
    return {
      source: 'canvas' as const,
      externalId: a.id,
      title: a.title,
      subtitle: [a.course, a.kind, due ? `Due ${format(due, 'EEE, MMM d')}` : 'No due date', a.submitted ? 'Submitted' : '']
        .filter(Boolean)
        .join(' · '),
      description: [a.course && `Course: ${a.course}`, `Type: ${a.kind}`].filter(Boolean).join('\n'),
      due: due ? format(due, 'yyyy-MM-dd') : null,
      url: a.url,
      done: a.submitted,
      priority: priorityFromDue(due),
    }
  })
}
