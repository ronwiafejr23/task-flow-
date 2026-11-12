import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/** False until .env.local holds the project URL and anon key. */
export const isConfigured = Boolean(url && anonKey)

// Only the public anon key is used in the browser. Row Level Security
// in supabase/schema.sql is what keeps each guest's data private.
export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true },
})
