import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { getProfileByUserId, getSessionWithProfile, supabase } from './lib/supabase'
import { useStore } from './store'

import LandingPage    from './pages/LandingPage'
import LoginPage      from './pages/LoginPage'
import AuthCallback   from './pages/AuthCallback'
import SetupPage      from './pages/SetupPage'
import DashboardPage  from './pages/DashboardPage'
import CreateRoomPage from './pages/CreateRoomPage'
import JoinRoomPage   from './pages/JoinRoomPage'
import LobbyPage      from './pages/LobbyPage'
import AuctionPage    from './pages/AuctionPage'
import UnsoldPage     from './pages/UnsoldPage'
import AdminPage      from './pages/AdminPage'
import SquadsPage     from './pages/SquadsPage'
import ExportPage     from './pages/ExportPage'
import AnalysisPage   from './pages/AnalysisPage'

function Guard({ children }) {
  const [ready, setReady] = useState(false)
  const { user, setUser, setProfile } = useStore()

  useEffect(() => {
    let mounted = true
    let activeSyncId = 0

    const syncAuth = async (incomingSession) => {
      const syncId = ++activeSyncId

      try {
        let session = incomingSession
        let profile = null

        if (typeof session === 'undefined') {
          const restored = await getSessionWithProfile()
          session = restored.session
          profile = restored.profile
        } else if (session?.user) {
          profile = await getProfileByUserId(session.user.id)
        }

        if (!mounted || syncId !== activeSyncId) return

        setUser(session?.user ?? null)
        setProfile(profile)
      } finally {
        if (mounted && syncId === activeSyncId) setReady(true)
      }
    }

    syncAuth()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      syncAuth(session)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [])

  if (!ready) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-3" style={{ animation:'spin 1s linear infinite' }}>⚡</div>
        <p className="text-muted font-mono text-xs tracking-widest">LOADING…</p>
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const setActiveUsers = useStore(s => s.setActiveUsers)

  useEffect(() => {
    // This effect runs for every visitor to the site, making them "present".
    const channel = supabase.channel('online-users', {
      config: {
        presence: {
          // Each browser tab will have a unique key, counting as one "live" user.
          key: Math.random().toString(36).slice(2),
        },
      },
    });

    const updateActiveUsers = () => {
      const presenceState = channel.presenceState()
      const realCount = Object.keys(presenceState).length
      setActiveUsers(realCount)
    }

    channel
      .on('presence', { event: 'sync' }, updateActiveUsers)
      .on('presence', { event: 'join' }, updateActiveUsers)
      .on('presence', { event: 'leave' }, updateActiveUsers)

    channel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        // Announce that this user is online.
        await channel.track({ online_at: new Date().toISOString() });
      }
    });

    return () => supabase.removeChannel(channel);
  }, [setActiveUsers]);

  return (
    <Routes>
      <Route path="/"                    element={<LandingPage />} />
      <Route path="/login"               element={<LoginPage />} />
      <Route path="/auth/callback"       element={<AuthCallback />} />
      <Route path="/setup"               element={<Guard><SetupPage /></Guard>} />
      <Route path="/dashboard"           element={<Guard><DashboardPage /></Guard>} />
      <Route path="/create-room"         element={<Guard><CreateRoomPage /></Guard>} />
      <Route path="/join"                element={<Guard><JoinRoomPage /></Guard>} />
      <Route path="/lobby/:code"         element={<Guard><LobbyPage /></Guard>} />
      <Route path="/auction/:code"       element={<Guard><AuctionPage /></Guard>} />
      <Route path="/unsold/:code"        element={<Guard><UnsoldPage /></Guard>} />
      <Route path="/admin"               element={<Guard><AdminPage /></Guard>} />
      <Route path="/squads/:code"        element={<Guard><SquadsPage /></Guard>} />
      <Route path="/export/:code"        element={<Guard><ExportPage /></Guard>} />
      <Route path="/analysis/:code"      element={<Guard><AnalysisPage /></Guard>} />
    </Routes>
  )
}
