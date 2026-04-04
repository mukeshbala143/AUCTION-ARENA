// AuthCallback.jsx
import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

export function AuthCallback() {
  const navigate = useNavigate()
  const { setUser, setProfile } = useStore()
  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) { navigate('/login'); return }
      setUser(session.user)
      const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single()
      if (data) { setProfile(data); navigate('/dashboard') }
      else navigate('/setup')
    })
  }, [])
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center anim-1">
        <div className="text-6xl mb-4" style={{animation:'spin 1s linear infinite'}}>⚡</div>
        <p className="text-muted font-mono text-sm tracking-widest">SIGNING YOU IN…</p>
      </div>
    </div>
  )
}
export default AuthCallback
