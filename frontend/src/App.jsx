import { lazy, Suspense, useEffect, useState } from 'react'
import { Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useStore } from './store'

const LandingPage = lazy(() => import('./pages/LandingPage'))
const LoginPage = lazy(() => import('./pages/LoginPage'))
const AuthCallback = lazy(() => import('./pages/AuthCallback'))
const SetupPage = lazy(() => import('./pages/SetupPage'))
const DashboardPage = lazy(() => import('./pages/DashboardPage'))
const CreateRoomPage = lazy(() => import('./pages/CreateRoomPage'))
const JoinRoomPage = lazy(() => import('./pages/JoinRoomPage'))
const LobbyPage = lazy(() => import('./pages/LobbyPage'))
const AuctionPage = lazy(() => import('./pages/AuctionPage'))
const UnsoldPage = lazy(() => import('./pages/UnsoldPage'))
const ReAuctionPage = lazy(() => import('./pages/ReAuctionPage'))
const AdminPage = lazy(() => import('./pages/AdminPage'))
const SquadsPage = lazy(() => import('./pages/SquadsPage'))
const ExportPage = lazy(() => import('./pages/ExportPage'))
const AnalysisPage = lazy(() => import('./pages/AnalysisPage'))

function PageLoader() {
  return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center">
        <div className="text-5xl mb-3" style={{ animation:'spin 1s linear infinite' }}>⚡</div>
        <p className="text-muted font-mono text-xs tracking-widest">LOADING...</p>
      </div>
    </div>
  )
}

function Guard({ children }) {
  const [ready, setReady] = useState(false)
  const { user, setUser, setProfile } = useStore()

  useEffect(() => {
    let mounted = true
    let activeSyncId = 0

    const syncAuth = async (incomingSession) => {
      const syncId = ++activeSyncId

      try {
        const { getProfileByUserId, getSessionWithProfile } = await import('./lib/supabase')
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

    let subscription

    import('./lib/supabase').then(({ supabase }) => {
      if (!mounted) return

      const authListener = supabase.auth.onAuthStateChange((_e, session) => {
        syncAuth(session)
      })

      subscription = authListener.data.subscription
    })

    return () => {
      mounted = false
      subscription?.unsubscribe()
    }
  }, [])

  if (!ready) return <PageLoader />
  if (!user) return <Navigate to="/login" replace />
  return children
}

export default function App() {
  const setActiveUsers = useStore(s => s.setActiveUsers)
  const { pathname } = useLocation()

  useEffect(() => {
    if (pathname === '/') return

    let channel
    let cancelled = false

    import('./lib/supabase').then(({ supabase }) => {
      if (cancelled) return

      channel = supabase.channel('online-users', {
        config: {
          presence: {
            key: Math.random().toString(36).slice(2),
          },
        },
      })

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
          await channel.track({ online_at: new Date().toISOString() })
        }
      })
    })

    return () => {
      cancelled = true
      if (!channel) return
      import('./lib/supabase').then(({ supabase }) => supabase.removeChannel(channel))
    }
  }, [pathname, setActiveUsers])

  return (
    <Suspense fallback={<PageLoader />}>
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
        <Route path="/reauction/:code"     element={<Guard><ReAuctionPage /></Guard>} />
        <Route path="/unsold/:code"        element={<Guard><UnsoldPage /></Guard>} />
        <Route path="/admin"               element={<Guard><AdminPage /></Guard>} />
        <Route path="/squads/:code"        element={<Guard><SquadsPage /></Guard>} />
        <Route path="/export/:code"        element={<Guard><ExportPage /></Guard>} />
        <Route path="/analysis/:code"      element={<Guard><AnalysisPage /></Guard>} />
      </Routes>
    </Suspense>
  )
}
