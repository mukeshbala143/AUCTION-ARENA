import { Routes, Route, Navigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { supabase } from './lib/supabase'
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
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user)
        const { data } = await supabase.from('users').select('*').eq('id', session.user.id).single()
        if (data) setProfile(data)
      }
      setReady(true)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => {
      setUser(session?.user ?? null)
    })
    return () => subscription.unsubscribe()
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
