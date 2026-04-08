import { Link, useNavigate } from 'react-router-dom'
import { signOut } from '../../lib/supabase'
import { useStore } from '../../store'

export default function Navbar({ backTo, backLabel }) {
  const profile = useStore(s => s.profile)
  const navigate = useNavigate()

  const handleLogout = async () => {
    await signOut()
    navigate('/')
  }

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-8 py-4"
         style={{ background:'rgba(7,7,14,0.9)', backdropFilter:'blur(24px)', borderBottom:'0.5px solid rgba(255,255,255,0.07)' }}>
      <Link to="/dashboard" className="font-bebas text-2xl tracking-[4px] text-gold no-underline">
        AUCTION<span className="text-white"> ARENA</span>
      </Link>

      <div className="flex items-center gap-3">
        {backTo && (
          <button onClick={() => navigate(backTo)}
                  className="text-muted text-sm hover:text-gold transition-colors flex items-center gap-1.5">
            ← {backLabel || 'Back'}
          </button>
        )}

        {profile && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-full"
               style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)' }}>
            <span className="text-xl">{profile.avatar_url || '🦁'}</span>
            <div className="leading-none">
              <div className="text-sm font-semibold text-white">{profile.display_name}</div>
              <div className="text-xs text-gold mt-0.5">{profile.team_name}</div>
            </div>
          </div>
        )}

        <button onClick={handleLogout}
                className="text-xs text-muted hover:text-crimson transition-colors px-3 py-2 rounded-lg"
                style={{ border:'0.5px solid rgba(255,255,255,0.07)' }}>
          Logout
        </button>
      </div>
    </nav>
  )
}
