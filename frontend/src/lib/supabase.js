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

export async function getAccessToken() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error
  return session?.access_token || null
}

async function withTimeout(promise, ms, fallbackValue) {
  let timeoutId

  const timeoutPromise = new Promise((resolve) => {
    timeoutId = setTimeout(() => resolve(fallbackValue), ms)
  })

  try {
    return await Promise.race([promise, timeoutPromise])
  } finally {
    clearTimeout(timeoutId)
  }
}

export async function getSessionWithProfile() {
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error) throw error

  if (!session?.user) {
    return { session: null, profile: null }
  }

  const profile = await getProfileByUserId(session.user.id)
  return { session, profile }
}

export async function getProfileByUserId(userId) {
  if (!userId) return null

  try {
    const profileResult = await withTimeout(
      supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .maybeSingle(),
      5000,
      { data: null, error: null }
    )

    if (profileResult?.error) {
      console.error('Profile fetch failed during session restore:', profileResult.error)
    }

    return profileResult?.data || null
  } catch (profileError) {
    console.error('Profile fetch crashed during session restore:', profileError)
    return null
  }
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
