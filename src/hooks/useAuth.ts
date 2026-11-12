import { useEffect, useState } from 'react'
import { isConfigured, supabase } from '../lib/supabase'

/**
 * Guest accounts: reuse the saved session if there is one,
 * otherwise create an anonymous Supabase user on first visit.
 */
export function useAuth() {
  const [userId, setUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false)
      return
    }
    let active = true

    const init = async () => {
      try {
        const { data } = await supabase.auth.getSession()
        if (data.session) {
          if (active) setUserId(data.session.user.id)
          return
        }
        const { data: signIn, error: signInError } = await supabase.auth.signInAnonymously()
        if (!active) return
        if (signInError) setError(signInError.message)
        else setUserId(signIn.user?.id ?? null)
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : 'Could not start a guest session.')
      } finally {
        if (active) setLoading(false)
      }
    }
    void init()

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) setUserId(session.user.id)
    })
    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [])

  return { userId, loading, error }
}
