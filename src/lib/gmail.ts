import type { ImportItem } from '../types'

// Gmail is read straight from the browser with Google Identity Services.
// The access token lives in memory only: it is never saved or sent to Supabase.

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly'
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export const gmailClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined) || ''

interface TokenResponse {
  access_token?: string
  error?: string
  error_description?: string
}
interface TokenClient {
  requestAccessToken: (options?: { prompt?: string }) => void
}
declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string
            scope: string
            callback: (response: TokenResponse) => void
            error_callback?: (error: { type?: string; message?: string }) => void
          }) => TokenClient
        }
      }
    }
  }
}

let gisLoading: Promise<void> | null = null
function loadGis(): Promise<void> {
  if (window.google?.accounts?.oauth2) return Promise.resolve()
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = GIS_SRC
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        gisLoading = null
        reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."))
      }
      document.head.appendChild(script)
    })
  }
  return gisLoading
}

/** Opens Google's consent popup and resolves with a short-lived, read-only token. */
export async function requestGmailToken(): Promise<string> {
  if (!gmailClientId) throw new Error('VITE_GOOGLE_CLIENT_ID is not set.')
  await loadGis()
  return new Promise<string>((resolve, reject) => {
    const client = window.google!.accounts.oauth2.initTokenClient({
      client_id: gmailClientId,
      scope: SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token)
        else reject(new Error(response.error_description || response.error || 'Google sign-in was cancelled.'))
      },
      error_callback: (error) => reject(new Error(error.message || 'Google sign-in was cancelled.')),
    })
    client.requestAccessToken()
  })
}

interface GmailMessage {
  id: string
  threadId: string
  snippet?: string
  payload?: { headers?: { name: string; value: string }[] }
}

async function gmailGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401) throw new Error('Your Gmail session expired. Connect again.')
  if (!res.ok) throw new Error(`Gmail returned an error (${res.status}).`)
  return (await res.json()) as T
}

function decodeEntities(text: string) {
  return new DOMParser().parseFromString(text, 'text/html').documentElement.textContent ?? text
}

/** Unread inbox mail from the last 14 days (up to 20 messages). */
export async function fetchGmailMessages(token: string): Promise<ImportItem[]> {
  const query = encodeURIComponent('in:inbox is:unread newer_than:14d')
  const list = await gmailGet<{ messages?: { id: string }[] }>(`/messages?maxResults=20&q=${query}`, token)
  const ids = (list.messages ?? []).map((m) => m.id)

  const messages = await Promise.all(
    ids.map((id) =>
      gmailGet<GmailMessage>(`/messages/${id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From`, token),
    ),
  )

  return messages.map((m) => {
    const header = (name: string) =>
      m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
    const from = header('From').replace(/<[^>]*>/g, '').replace(/"/g, '').trim() || header('From')
    const snippet = decodeEntities(m.snippet ?? '')
    return {
      source: 'gmail' as const,
      externalId: m.id,
      title: header('Subject') || '(no subject)',
      subtitle: from ? `From ${from}` : 'Gmail',
      description: [from && `From: ${from}`, snippet].filter(Boolean).join('\n\n'),
      due: null,
      url: `https://mail.google.com/mail/u/0/#inbox/${m.threadId}`,
    }
  })
}
