// Supabase Edge Function: canvas-proxy
//
// Canvas does not allow browsers to call its API directly (no CORS), so the
// app sends the request here and this function forwards it to Canvas.
// The Canvas token is passed through for this one request and is never
// stored or logged. Only signed-in app users can call it (JWT verification
// is on by default for Edge Functions).
//
// Deploy:  npx supabase functions deploy canvas-proxy
// (or paste this file into Supabase Dashboard → Edge Functions → Deploy a new function)

declare const Deno: {
  serve(handler: (req: Request) => Response | Promise<Response>): void
  env: {
    get(name: string): string | undefined
  }
}

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const json = (body: unknown) =>
  new Response(JSON.stringify(body), { headers: { ...cors, 'Content-Type': 'application/json' } })

// Only forward to real Canvas hosts, so this can't be used to reach other servers.
// Schools on a custom domain: set the CANVAS_ALLOWED_HOSTS secret, e.g. "canvas.myschool.edu".
function isAllowedHost(hostname: string) {
  if (hostname.endsWith('.instructure.com')) return true
  const extra = (Deno.env.get('CANVAS_ALLOWED_HOSTS') ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  return extra.includes(hostname.toLowerCase())
}

const KINDS: Record<string, string> = { assignment: 'Assignment', quiz: 'Quiz', discussion_topic: 'Discussion' }

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ ok: false, error: 'Use POST.' })

  let baseUrl = ''
  let token = ''
  try {
    const body = await req.json()
    baseUrl = String(body.baseUrl ?? '')
    token = String(body.token ?? '').trim()
  } catch {
    return json({ ok: false, error: 'Invalid request.' })
  }

  let origin: URL
  try {
    origin = new URL(baseUrl)
  } catch {
    return json({ ok: false, error: 'That Canvas address is not a valid URL.' })
  }
  if (origin.protocol !== 'https:' || !isAllowedHost(origin.hostname)) {
    return json({ ok: false, error: 'Canvas address must look like https://yourschool.instructure.com' })
  }
  if (!token) return json({ ok: false, error: 'Canvas access token is missing.' })

  const start = new Date()
  const end = new Date(start.getTime() + 60 * 24 * 60 * 60 * 1000)
  const url = new URL('/api/v1/planner/items', origin.origin)
  url.searchParams.set('start_date', start.toISOString().slice(0, 10))
  url.searchParams.set('end_date', end.toISOString().slice(0, 10))
  url.searchParams.set('per_page', '100')

  let res: Response
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'manual' })
  } catch {
    return json({ ok: false, error: 'Could not reach Canvas. Check the address and try again.' })
  }
  if (res.status === 401) return json({ ok: false, error: 'Canvas rejected the access token. Generate a new one and try again.' })
  if (!res.ok) return json({ ok: false, error: `Canvas returned an error (${res.status}).` })

  const items = (await res.json()) as Array<Record<string, any>>
  const assignments = items
    .filter((i) => i.plannable_type in KINDS && i.plannable?.title)
    .map((i) => ({
      id: `${i.plannable_type}-${i.plannable_id}`,
      title: String(i.plannable.title),
      kind: KINDS[i.plannable_type],
      course: i.context_name ? String(i.context_name) : '',
      dueAt: i.plannable?.due_at ?? i.plannable_date ?? null,
      url: typeof i.html_url === 'string' ? new URL(i.html_url, origin.origin).toString() : null,
      submitted: Boolean(i.submissions && i.submissions.submitted),
    }))

  return json({ ok: true, assignments })
})
