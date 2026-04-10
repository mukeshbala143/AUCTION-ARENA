// AuthCallback.jsx
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { exchangeCodeForSessionIfPresent } from '../lib/supabase'
import { useStore } from '../store'

export function AuthCallback() {
  const navigate = useNavigate()
  const { setUser, setProfile } = useStore()
  const [error, setError] = useState('')

  useEffect(() => {
    let mounted = true

    const finishLogin = async () => {
      try {
        const { session, profile } = await exchangeCodeForSessionIfPresent()

        if (!mounted) return
        if (!session?.user) {
          navigate('/login', { replace: true })
          return
        }

        setUser(session.user)
        setProfile(profile)
        navigate(profile ? '/dashboard' : '/setup', { replace: true })
      } catch (err) {
        if (!mounted) return
        setError(err.message || 'Login failed. Please try again.')
        setTimeout(() => navigate('/login', { replace: true }), 1500)
      }
    }

    finishLogin()

    return () => {
      mounted = false
    }
  }, [navigate, setProfile, setUser])

  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center anim-1">
        <div className="text-6xl mb-4" style={{animation:'spin 1s linear infinite'}}>⚡</div>
        <p className="text-muted font-mono text-sm tracking-widest">{error || 'SIGNING YOU IN…'}</p>
      </div>
    </div>
  )
}
export default AuthCallback
