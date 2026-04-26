import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exchangeCodeForSessionIfPresent, signInWithGoogle } from '../lib/supabase'
import { useStore } from '../store'

export default function LoginPage() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const { setUser, setProfile } = useStore()
  const navigate = useNavigate()

  useEffect(() => {
    let mounted = true

    const redirectAuthenticatedUser = async () => {
      try {
        const { session, profile } = await exchangeCodeForSessionIfPresent()

        if (!mounted || !session?.user) return

        setUser(session.user)
        setProfile(profile)
        navigate(profile ? '/dashboard' : '/setup', { replace: true })
      } catch (error) {
        console.error('Failed to restore session on login page:', error)
      }
    }

    redirectAuthenticatedUser()

    return () => {
      mounted = false
    }
  }, [navigate, setProfile, setUser])

  const handleGoogle = async () => {
    setLoading(true)
    try { await signInWithGoogle() } catch { setLoading(false) }
  }

  const TICKER = ['🔨 Virat Kohli → ₹21 Cr · IPL','🔨 Pardeep Narwal → ₹1.65 Cr · PKL','🔨 Kylian Mbappé → €120M · Football','🔨 Jasprit Bumrah → ₹18 Cr · IPL','🔨 Erling Haaland → €110M · Football','🔨 Rashid Khan → ₹8.5 Cr · IPL']

  return (
    <div className="min-h-screen bg-bg flex relative">

      {/* LEFT PANEL */}
      <div className="hidden lg:flex flex-col justify-between flex-1 p-12 relative overflow-hidden" style={{borderRight:'0.5px solid rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.2)'}}>
        <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 80% 20%,rgba(255,90,0,0.07),transparent 60%)'}}/>
        <Link to="/" className="font-bebas text-2xl tracking-[4px] text-[#FF5A00] no-underline relative z-10">AUCTION<span className="text-white"> ARENA</span></Link>
        <div className="relative z-10">
          <h1 className="font-bebas leading-none mb-6" style={{fontSize:'clamp(4rem,7vw,6rem)',letterSpacing:'4px'}}>
            BID.<br/><span className="text-[#FF5A00]">WIN.</span><br/>
            <span style={{WebkitTextStroke:'1.5px rgba(255,90,0,0.5)',color:'transparent'}}>DOMINATE.</span>
          </h1>
          <p className="text-muted text-base leading-relaxed max-w-sm mb-8">Real-time IPL-style auctions. Voice announced. AI ranked. Built for serious fantasy players.</p>
          <div className="flex gap-2 flex-wrap mb-8">
            {['🏏 IPL Cricket','🤼 Kabaddi','⚽ Football'].map(s=>(
              <span key={s} className="text-xs font-semibold px-3 py-1.5 rounded-full" style={{background:'rgba(255,90,0,0.08)',color:'#FF5A00',border:'0.5px solid rgba(255,90,0,0.2)'}}>{s}</span>
            ))}
          </div>
          {/* Features */}
          <div className="space-y-2 mb-8">
            {[['⚡','Real-time bidding with 15s server timer'],['🎙️','Fast lady voice announces every bid & sale'],['🤖','Gemini ranks all squads after auction'],['📊','Export all squads to Excel instantly']].map(([ic,t])=>(
              <div key={t} className="flex items-center gap-3 text-sm text-muted px-4 py-2.5 rounded-xl" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.06)'}}>
                <span className="text-base">{ic}</span>{t}
              </div>
            ))}
          </div>
          {/* Live ticker */}
          <div className="overflow-hidden rounded-xl" style={{border:'0.5px solid rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.3)'}}>
            <div className="px-4 py-2 text-xs text-muted flex items-center gap-2" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
              <span className="w-2 h-2 rounded-full bg-orange-400" style={{animation:'pulse 2s infinite'}}/>Live Auction Results
            </div>
            <div className="overflow-hidden py-2">
              <div className="flex gap-10 whitespace-nowrap px-4" style={{animation:'tickerMove 20s linear infinite'}}>
                {[...TICKER,...TICKER].map((t,i)=><span key={i} className="text-xs text-muted flex-shrink-0">{t}</span>)}
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-muted relative z-10">By signing in you agree to our <a href="#" className="text-[#FF5A00] no-underline">Terms</a></p>
      </div>

      {/* RIGHT PANEL - EXACT ORIGINAL LAYOUT WITH EMBER FIRE COLOR */}
      <div className="flex-1 flex items-center justify-center p-8 relative z-10">
        <div className="w-full max-w-md anim-1">
          <div className="text-xs tracking-[3px] uppercase text-[#FF5A00] mb-6 flex items-center gap-3">
            Welcome Back<div className="flex-1 h-px" style={{background:'rgba(255,90,0,0.2)'}}/>
          </div>
          <h2 className="font-bebas text-5xl tracking-[3px] mb-2">Sign In to<br/><span className="text-[#FF5A00]">Arena</span></h2>
          <p className="text-muted text-sm mb-8">Your profile, teams and history are waiting.</p>

          <button onClick={handleGoogle} disabled={loading}
                  className="w-full flex items-center justify-center gap-3 py-4 rounded-xl font-semibold text-white text-sm transition-all hover:-translate-y-0.5 active:scale-95 disabled:opacity-50"
                  style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.12)',backdropFilter:'blur(8px)'}}>
            <svg width="20" height="20" viewBox="0 0 24 24">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            {loading ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.07)'}}/>
            <span className="text-muted text-xs">or join with a room code</span>
            <div className="flex-1 h-px" style={{background:'rgba(255,255,255,0.07)'}}/>
          </div>

          <div className="flex gap-2">
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} maxLength={6}
                   onKeyDown={e=>e.key==='Enter'&&code.length===6&&navigate(`/join?code=${code}`)}
                   className="aa-input flex-1 text-center font-mono text-xl tracking-[6px] uppercase" placeholder="AX94KL"/>
            
            <button onClick={()=>code.length===6&&navigate(`/join?code=${code}`)} 
                    className="flex items-center justify-center rounded-xl font-bold transition-all hover:-translate-y-0.5 active:scale-95" 
                    style={{padding:'0.8rem 1.2rem',whiteSpace:'nowrap',fontSize:'0.85rem', background:'#FF5A00', color:'#000000', border:'none'}}>
              Join →
            </button>
          </div>

          <p className="text-center text-xs text-muted mt-8 leading-relaxed">
            By continuing, you agree to our <a href="#" className="text-[#FF5A00] no-underline">Terms</a> and <a href="#" className="text-[#FF5A00] no-underline">Privacy Policy</a>.<br/>
            <span className="text-muted/60">First time? We'll set up your profile in 30 seconds.</span>
          </p>
        </div>
      </div>
    </div>
  )
}