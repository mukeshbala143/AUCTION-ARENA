import { createClient } from '@supabase/supabase-js'
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
)

function hasAuthHashParams() {
  const hash = window.location.hash.startsWith('#')
    ? window.location.hash.slice(1)
    : window.location.hash

  const params = new URLSearchParams(hash)

  return [
    'access_token',
    'refresh_token',
    'expires_in',
    'token_type',
    'error',
    'error_description',
  ].some(key => params.has(key))
}

export const signInWithGoogle = () =>
  supabase.auth.signInWithOAuth({ provider:'google', options:{ redirectTo:`${window.location.origin}/auth/callback` } })

export const signOut = () => supabase.auth.signOut()

export async function getSessionWithProfile() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error

  if (!session?.user) {
    return { session: null, profile: null }
  }

  const { data: profile, error: profileError } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .maybeSingle()

  if (profileError) throw profileError

  return { session, profile: profile || null }
}

export async function exchangeCodeForSessionIfPresent() {
  if (typeof window !== 'undefined' && hasAuthHashParams() && window.location.pathname !== '/auth/callback') {
    window.location.replace(`${window.location.origin}/auth/callback${window.location.hash}`)
    return { session: null, profile: null }
  }

  const code = new URL(window.location.href).searchParams.get('code')

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) throw error

    window.history.replaceState({}, document.title, window.location.pathname)
  }

  return getSessionWithProfile()
}
