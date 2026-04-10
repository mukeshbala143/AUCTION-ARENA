import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exchangeCodeForSessionIfPresent } from '../lib/supabase'
import { useStore } from '../store'

const SPORTS = [
  { id:'ipl', icon:'🏏', tag:'IPL Cricket', name:'Indian Premier\nLeague', color:'#F2A623', glow:'rgba(242,166,35,0.12)', border:'rgba(242,166,35,0.4)',
    desc:'350+ elite players — capped legends, uncapped gems, overseas stars. ₹120 Crore purse per team.', stats:[['350+','Players'],['₹120Cr','Purse'],['8','Overseas Cap']] },
  { id:'kabaddi', icon:'🤼', tag:'Pro Kabaddi', name:'Pro Kabaddi\nLeague', color:'#D85A30', glow:'rgba(216,90,48,0.12)', border:'rgba(216,90,48,0.4)',
    desc:'200+ PKL stars — raiders, defenders & all-rounders. Build the most feared Kabaddi roster.', stats:[['200+','Players'],['₹4Cr','Purse'],['3','Roles']] },
  { id:'football', icon:'⚽', tag:'World Football', name:'World\nFootball', color:'#4CAF7D', glow:'rgba(76,175,125,0.12)', border:'rgba(76,175,125,0.4)',
    desc:'500+ global superstars from PL, La Liga, Serie A, ISL & beyond. Build your ultimate dream XI.', stats:[['500+','Players'],['€200M','Budget'],['10','Positions']] },
]
const FEATS = [
  ['⚡','Server-Side Timer','15s countdown on the server. No desync, no cheating.'],
  ['🎙️','Lady Voice Announcer','Fast female AI voice announces every bid and sale live.'],
  ['🤖','ChatGpt AI Analysis','Post-auction squad rankings with strengths, best XI, predictions.'],
  ['📊','Excel Export','Download all squads as .xlsx with full stats. Runs in browser.'],
  ['🔴','Real-Time Bidding','Socket.io powered — rival bids appear instantly with gold flash.'],
  ['🏳️','Overseas Cap Rules','Max 8 overseas enforced live. Auto-disabled when cap is hit.'],
  ['↩️','Unsold Round','All unsold players re-enter. Skip tracking resets entirely.'],
  ['💰','Purse Enforcement','Smart purse tracking — shows Insufficient Funds instantly.'],
]

const WEB3FORMS_ACCESS_KEY = "5a7d81b6-3b40-470d-bf3c-8b4e3be462f3";

export default function LandingPage() {
  const [code, setCode] = useState('')
  const [totalUsers, setTotalUsers] = useState(0)
  const { setUser, setProfile } = useStore()
  const activeUsers = useStore(s => s.activeUsers)
  const navigate = useNavigate()
  const randomActiveUsers = useRef(Math.floor(Math.random() * (179 - 53 + 1)) + 53);
  const displayActiveUsers = activeUsers > 50 ? activeUsers : randomActiveUsers.current
  const join = () => { if (code.trim().length === 6) navigate(`/join?code=${code.trim().toUpperCase()}`) }

  // Modal States
  const [activeModal, setActiveModal] = useState(null)
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)
  const [showContactThankYou, setShowContactThankYou] = useState(false)

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
        console.error('Failed to restore session on landing page:', error)
      }
    }

    redirectAuthenticatedUser()

    return () => {
      mounted = false
    }
  }, [navigate, setProfile, setUser])

  useEffect(() => {
    // --- Fetch total registered users ---
    const fetchUserCount = async () => {
      try {
        const res = await fetch(`${import.meta.env.VITE_SOCKET_URL}/api/stats`);
        if (res.ok) {
          const data = await res.json();
          setTotalUsers(data.totalUsers || 0);
        } else {
          console.error("Failed to fetch stats from server:", res.status);
          setTotalUsers(412); // Fallback on error
        }
      } catch (error) {
        console.error("Error fetching total user count:", error);
        setTotalUsers(412); // Fallback on error
      }
    };
    fetchUserCount();
  }, []);

  // Contact Form Submit Handler
  const handleContactSubmit = async (e) => {
    e.preventDefault()
    setIsSubmittingContact(true)

    const formData = new FormData(e.target)

    try {
      const response = await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData
      })

      if (response.ok) {
        setShowContactThankYou(true)
        e.target.reset()

        setTimeout(() => {
          setShowContactThankYou(false)
          setActiveModal(null)
        }, 2500)
      }
    } catch (error) {
      console.error("Error submitting contact form:", error)
    } finally {
      setIsSubmittingContact(false)
    }
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-x-hidden">
      
      {/* Custom CSS for Animations, Scrollbar and Responsive Hover/Touch Effects */}
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.02); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.1); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.2); }

        /* Arena Card Dynamic Hover & Touch Effect */
        .arena-card {
          transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        /* Desktop Hover */
        @media (hover: hover) {
          .arena-card:hover {
            border: 0.5px solid var(--card-border) !important;
            transform: translateY(-8px);
            box-shadow: 0 24px 80px rgba(0,0,0,0.5), 0 0 60px var(--card-glow);
          }
          .arena-card:hover .arena-card-bg {
            opacity: 1 !important;
          }
          .arena-card:hover .arena-icon {
            transform: scale(1.1) rotate(-6deg);
          }
        }

        /* Mobile Touch / Active State */
        @media (hover: none) {
          .arena-card:active {
            border: 0.5px solid var(--card-border) !important;
            transform: translateY(-4px) scale(0.98);
            box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 40px var(--card-glow);
          }
          .arena-card:active .arena-card-bg {
            opacity: 1 !important;
          }
          .arena-card:active .arena-icon {
            transform: scale(1.05) rotate(-3deg);
          }
        }
      `}</style>

      <div className="orb" style={{width:700,height:700,background:'rgba(242,166,35,0.08)',top:-250,right:-200}}/>
      <div className="orb" style={{width:600,height:600,background:'rgba(216,90,48,0.06)',bottom:-100,left:-220}}/>
      <div className="orb" style={{width:400,height:400,background:'rgba(76,175,125,0.05)',top:'38%',right:'5%'}}/>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-10 py-4"
           style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-xl sm:text-2xl tracking-[2px] sm:tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex items-center gap-4 md:gap-8">
          <a href="#sports" className="text-muted text-xs tracking-widest uppercase hover:text-gold transition-colors hidden sm:block">Arenas</a>
          <a href="#features" className="text-muted text-xs tracking-widest uppercase hover:text-gold transition-colors hidden sm:block">Features</a>
          <Link to="/login" className="btn-gold text-xs px-5 py-2.5 rounded-lg no-underline" style={{padding:'0.6rem 1.4rem',fontSize:'0.78rem'}}>Sign In →</Link>
        </div>
      </nav>

      {/* Live User Stats */}
      {totalUsers > 0 && (
        <div className="fixed top-20 sm:top-24 md:top-28 right-4 md:right-10 z-40" style={{backdropFilter:'blur(12px)'}}>
          <div className="flex items-center gap-4 rounded-lg p-2.5" style={{background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)'}}>
            <div className="text-center border-r border-white/10 pr-4">
              <div className="font-mono text-sm text-gold">{totalUsers.toLocaleString()}</div>
              <div className="text-muted text-[10px] uppercase tracking-widest">Users</div>
            </div>
            <div className="text-center flex items-center gap-2 pr-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <div>
                <div className="font-mono text-sm text-gold">{displayActiveUsers.toLocaleString()}</div>
                <div className="text-muted text-[10px] uppercase tracking-widest">Live</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-40 md:pt-48">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full mb-8 anim-1 max-w-full text-left sm:text-center"
             style={{background:'rgba(242,166,35,0.08)',border:'0.5px solid rgba(242,166,35,0.3)'}}>
          <span className="w-1.5 h-1.5 rounded-full bg-gold shrink-0" style={{animation:'pulse 2s infinite'}}/>
          <span className="text-gold text-[10px] sm:text-xs tracking-[1px] sm:tracking-[3px] uppercase font-semibold truncate">Real-time Multiplayer · Up to 10 Players · 3 Sports</span>
        </div>
        
        {/* Responsive Heading */}
        <h1 className="font-bebas leading-none anim-2" style={{fontSize:'clamp(4.5rem,14vw,12rem)',letterSpacing:'2px'}}>
          BID.<br/><span className="text-gold">WIN.</span><br/>
          <span style={{WebkitTextStroke:'2px rgba(242,166,35,0.55)',color:'transparent'}}>DOMINATE.</span>
        </h1>
        
        <p className="text-muted text-sm sm:text-lg max-w-lg mt-6 leading-relaxed anim-3 px-4">Host live IPL-style auctions with friends. Real bidding, AI announcer, Gemini analysis — just like the pros.</p>
        
        <div className="flex flex-col sm:flex-row gap-4 mt-8 sm:mt-10 w-full sm:w-auto justify-center anim-4 px-4">
          <Link to="/login" className="btn-gold no-underline w-full sm:w-auto justify-center" style={{padding:'0.95rem 2.4rem',fontSize:'0.9rem'}}>Start Auction →</Link>
          <a href="#sports" className="btn-outline w-full sm:w-auto justify-center">Explore Arenas</a>
        </div>

        {/* Fixed Mobile Stats Bar */}
        <div className="mt-14 w-full max-w-4xl mx-auto anim-5 px-4">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-px rounded-2xl overflow-hidden" style={{background:'rgba(255,255,255,0.07)', border:'0.5px solid rgba(255,255,255,0.07)'}}>
            {[['350+','IPL Players'],['10','Teams Max'],['15s','Bid Timer'],['3','Sport Arenas'],['AI','Post-Analysis']].map(([v,l], i)=>(
              <div key={l} className={`px-4 py-4 text-center bg-[#13131f] ${i===4 ? 'col-span-2 md:col-span-1' : ''}`}>
                <div className="font-bebas text-2xl sm:text-3xl tracking-widest text-gold">{v}</div>
                <div className="text-muted text-[10px] sm:text-xs tracking-widest uppercase mt-0.5">{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex-col items-center gap-2 text-muted text-xs tracking-[3px] uppercase hidden sm:flex">
          Scroll<div className="w-px h-10" style={{background:'linear-gradient(to bottom,#F2A623,transparent)'}}/>
        </div>
      </section>

      {/* SPORTS */}
      <section id="sports" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-20 sm:py-24">
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">
          Choose Your Arena<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/>
        </div>
        <h2 className="font-bebas text-4xl sm:text-5xl md:text-6xl tracking-[2px] sm:tracking-[3px] mb-2">Three <span className="text-gold">Arenas.</span> One Platform.</h2>
        <p className="text-muted text-sm sm:text-base mb-10 max-w-xl">Configure room, invite friends, bid live. Same premium auction experience across all three sports.</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {SPORTS.map(s=>{
            const isDisabled = s.isComingSoon;
            return (
            <div key={s.id} 
                 role="button"
                 onClick={() => { if (!isDisabled) navigate(`/create-room?sport=${s.id}`) }}
                 className={`group relative rounded-2xl overflow-hidden ${isDisabled ? '' : 'arena-card'}`}
                 style={{
                   background: 'rgba(255,255,255,0.03)',
                   border: '0.5px solid rgba(255,255,255,0.08)',
                   minHeight: 420,
                   cursor: isDisabled ? 'not-allowed' : 'pointer',
                   opacity: isDisabled ? 0.78 : 1,
                   '--card-border': s.border,
                   '--card-glow': s.glow
                 }}>
                 
              <div className="arena-card-bg absolute inset-0 opacity-0 transition-opacity duration-500 pointer-events-none"
                   style={{background:`radial-gradient(ellipse at 80% 10%,${s.glow},transparent 65%)`}}/>
              <div className="absolute top-5 right-6 font-bebas text-8xl opacity-[0.04] text-white pointer-events-none leading-none">{SPORTS.indexOf(s)+1}</div>
              <div className="relative z-10 p-6 sm:p-8 flex flex-col h-full">
                <span className="arena-icon text-5xl mb-4 block transition-transform duration-300">{s.icon}</span>
                <span className="text-[10px] sm:text-xs tracking-[2px] uppercase font-bold px-2 py-1 rounded mb-3 w-fit"
                      style={{background:`${s.glow}`,color:s.color,border:`0.5px solid ${s.border}`}}>{s.tag}</span>
                <h3 className="font-bebas text-2xl sm:text-3xl tracking-[2px] mb-3 whitespace-pre-line">{s.name}</h3>
                <p className="text-muted text-sm leading-relaxed mb-auto">{s.desc}</p>
                <div className="flex flex-wrap gap-4 mt-6 pt-5" style={{borderTop:'0.5px solid rgba(255,255,255,0.07)'}}>
                  {s.stats.map(([v,l])=>(
                    <div key={l}>
                      <div className="font-mono text-sm sm:text-base font-bold" style={{color:s.color}}>{v}</div>
                      <div className="text-muted text-[10px] sm:text-xs uppercase tracking-wide">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-5">
                  {isDisabled ? (
                    <div className="flex-1 py-2.5 rounded-lg text-center text-[11px] sm:text-xs font-bold tracking-wide sm:tracking-widest uppercase"
                         style={{background:'rgba(255,255,255,0.06)',color:'#7A7870',border:'0.5px solid rgba(255,255,255,0.1)'}}>
                      Coming Soon
                    </div>
                  ) : (
                    <Link to={`/create-room?sport=${s.id}`} className="flex-1 py-2.5 rounded-lg text-center text-xs font-bold tracking-widest uppercase no-underline transition-all hover:brightness-110"
                          style={{background:s.color,color:'#07070e'}} onClick={e=>e.stopPropagation()}>Create Room</Link>
                  )}
                  <Link to="/join" className="flex-1 py-2.5 rounded-lg text-center text-xs font-semibold tracking-wide text-muted hover:text-white transition-colors no-underline"
                        style={{border:'0.5px solid rgba(255,255,255,0.1)',background:'transparent'}} onClick={e=>e.stopPropagation()}>Join Room</Link>
                </div>
              </div>
            </div>
          )})}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-20">
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">Platform Features<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h2 className="font-bebas text-4xl sm:text-5xl tracking-[3px] mb-8 sm:mb-12">Built for the <span className="text-gold">Real</span> Experience</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
          {FEATS.map(([icon,title,desc])=>(
            <div key={title} className="p-6 transition-colors" style={{background:'#13131f'}}
                 onMouseEnter={e=>e.currentTarget.style.background='#1a1a2a'}
                 onMouseLeave={e=>e.currentTarget.style.background='#13131f'}>
              <div className="text-3xl mb-4">{icon}</div>
              <div className="font-semibold text-sm mb-2 text-white">{title}</div>
              <div className="text-muted text-xs leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* JOIN BOX */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-16">
        <div className="rounded-3xl p-6 sm:p-8 md:p-16 text-center relative overflow-hidden" style={{background:'#13131f',border:'0.5px solid rgba(242,166,35,0.15)'}}>
          <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 50% -20%,rgba(242,166,35,0.1),transparent 60%)'}}/>
          <h2 className="font-bebas text-4xl sm:text-5xl md:text-6xl tracking-[3px] sm:tracking-[5px] mb-3 relative z-10">Ready to <span className="text-gold">Dominate?</span></h2>
          <p className="text-muted text-sm sm:text-base mb-8 relative z-10">Jump straight into a live room with a code, or create your own arena.</p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-sm mx-auto mb-8 relative z-10">
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&join()}
                   className="aa-input flex-1 text-center font-mono uppercase" maxLength={6} placeholder="CODE"
                   style={{fontSize: 'clamp(0.9rem, 4vw, 1.1rem)', letterSpacing: 'clamp(0.2em, 2vw, 0.4em)'}}/>
            <button onClick={join} className="btn-gold w-full sm:w-auto justify-center" style={{padding:'0.85rem 1.4rem',fontSize:'0.85rem',whiteSpace:'nowrap'}}>Join →</button>
          </div>
          <div className="flex gap-4 justify-center relative z-10 flex-wrap">
            <Link to="/login" className="btn-gold no-underline">Sign In with Google →</Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t px-4 sm:px-10 py-6 flex items-center justify-between flex-wrap gap-6 mt-4" style={{borderColor:'rgba(255,255,255,0.07)', background:'rgba(0,0,0,0.2)'}}>
        <span className="font-bebas text-xl tracking-[4px] text-gold w-full text-center sm:w-auto sm:text-left">AUCTION ARENA</span>
        
        <div className="text-center w-full sm:w-auto order-3 sm:order-2">
          <span className="block text-muted text-xs">© 2026 Auction Arena · All rights reserved</span>
          <span className="block text-muted text-[11px] mt-1">Developed by Subrata Bala & Mukesh Bala</span>
        </div>
        
        <div className="flex flex-wrap justify-center gap-4 sm:gap-6 order-2 sm:order-3 w-full sm:w-auto">
          <button onClick={() => setActiveModal('privacy')} className="text-muted text-xs hover:text-gold transition-colors">Privacy</button>
          <button onClick={() => setActiveModal('terms')} className="text-muted text-xs hover:text-gold transition-colors">Terms</button>
          <button onClick={() => setActiveModal('contact')} className="text-muted text-xs hover:text-gold transition-colors">Contact</button>
          <Link to="/admin" className="text-muted text-xs hover:text-gold transition-colors no-underline">Admin</Link>
        </div>
      </footer>

      {/* POPUP MODALS */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-3 sm:p-4 overflow-y-auto" style={{background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)'}}>
          
          <div 
            className={`relative w-full ${activeModal === 'contact' ? 'max-w-4xl' : 'max-w-lg'} rounded-xl p-5 sm:p-8 overflow-hidden transform transition-all my-6 max-h-[90vh] overflow-y-auto custom-scrollbar`} 
            style={{background:'#111118', border:'1px solid rgba(255,255,255,0.05)', boxShadow:'0 25px 50px -12px rgba(0, 0, 0, 0.8)'}}
          >
            <button onClick={() => setActiveModal(null)} className="absolute top-3 right-3 sm:top-4 sm:right-4 text-muted hover:text-white text-2xl leading-none h-9 w-9 grid place-items-center rounded-lg" aria-label="Close modal">&times;</button>
            
            {/* PRIVACY POLICY MODAL */}
            {activeModal === 'privacy' && (
              <div>
                <h3 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-gold mb-4 uppercase">Privacy Policy</h3>
                <div className="text-muted text-sm space-y-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                  <p><strong>Last updated:</strong> April 9, 2026</p>
                  <p>Your privacy matters to us. This policy explains what information Auction Arena stores and how we use it.</p>
                  <p><strong>1. What We Collect:</strong> We collect account details required for gameplay, such as display name, team name, avatar, login email, room activity, bids, and squad records.</p>
                  <p><strong>2. Why We Use It:</strong> Your data is used to run auctions, show live room activity, calculate team stats, generate analysis, and improve app performance.</p>
                  <p><strong>3. Data Sharing:</strong> We do not sell personal data. Information is only processed by required infrastructure providers (for example authentication/database and contact form delivery).</p>
                  <p><strong>4. Data Retention:</strong> Auction and profile records may be retained to keep room history, rankings, exports, and analytics available to participating users.</p>
                  <p><strong>5. Security:</strong> We use standard access controls and protected services, but no internet system can be guaranteed 100% secure.</p>
                  <p><strong>6. Contact:</strong> For privacy-related questions, use the Contact form in this page.</p>
                </div>
              </div>
            )}

            {/* TERMS & CONDITIONS MODAL */}
            {activeModal === 'terms' && (
              <div>
                <h3 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-gold mb-4 uppercase">Terms & Conditions</h3>
                <div className="text-muted text-sm space-y-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                  <p><strong>Last updated:</strong> April 9, 2026</p>
                  <p>By using Auction Arena, you agree to these terms:</p>
                  <p><strong>1. Fair Use:</strong> Attempting to manipulate bids, exploit bugs, or disrupt live auctions is not allowed.</p>
                  <p><strong>2. Account Responsibility:</strong> You are responsible for activities performed through your account and for keeping login access secure.</p>
                  <p><strong>3. Room Conduct:</strong> Hosts and participants must use respectful names/content and avoid abusive or illegal behavior.</p>
                  <p><strong>4. Service Availability:</strong> Features may change, pause, or be removed as the product evolves.</p>
                  <p><strong>5. Rankings & Analysis:</strong> AI insights and rankings are informational and can vary based on available squad/player data.</p>
                  <p><strong>6. Limitation:</strong> The platform is provided "as is" without guarantees of uninterrupted operation.</p>
                  <p><strong>7. Termination:</strong> We may restrict access for policy violations or harmful activity.</p>
                </div>
              </div>
            )}

            {/* CONTACT US MODAL */}
            {activeModal === 'contact' && (
              <div className="flex flex-col md:flex-row gap-6 sm:gap-10">
                
                {/* Left Side: Contact Info */}
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="font-bebas text-3xl sm:text-4xl tracking-[2px] text-gold mb-2">CONTACT US</h3>
                  <p className="text-sm text-muted mb-6 sm:mb-8 leading-relaxed">Have questions? Need support? We're here to help. Reach out to us through any channel below or use the form.</p>

                  <div className="space-y-6">
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gold mb-1 font-bold flex items-center gap-2">
                        <span className="text-base">📍</span> FIND US
                      </div>
                      <p className="text-sm text-white/80 leading-relaxed">GIET University, Gunupur<br/>Odisha - 765022</p>
                    </div>
                    
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gold mb-1 font-bold flex items-center gap-2">
                        <span className="text-base">📞</span> CALL US
                      </div>
                      <p className="text-sm text-white/80">+91 9876543210</p>
                    </div>
                    
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gold mb-1 font-bold flex items-center gap-2">
                        <span className="text-base">✉️</span> EMAIL US
                      </div>
                      <p className="text-sm text-white/80">support@auctionarena.com</p>
                    </div>
                  </div>
                </div>

                {/* Right Side: Functional Form */}
                <div className="relative flex-[1.2] p-4 sm:p-6 rounded-xl" style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}>
                  
                  {/* GLASSMORPHISM SUCCESS POPUP OVERLAY */}
                  {showContactThankYou && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl" style={{background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)'}}>
                      <div className="flex flex-col items-center justify-center p-6 sm:p-8 rounded-2xl transform transition-all scale-100 opacity-100" 
                           style={{
                             background: 'rgba(255, 255, 255, 0.05)', 
                             backdropFilter: 'blur(20px)', 
                             border: '1px solid rgba(255, 255, 255, 0.15)',
                             boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                             maxWidth: '85%'
                           }}>
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-full flex items-center justify-center mb-4" style={{background: 'rgba(76, 175, 125, 0.15)', border: '1px solid rgba(76, 175, 125, 0.3)'}}>
                          <svg className="w-6 h-6 sm:w-8 sm:h-8 text-[#4CAF7D]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h4 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-white mb-2">Thank You!</h4>
                        <p className="text-xs sm:text-sm text-muted text-center leading-relaxed">Your message has been successfully sent.</p>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleContactSubmit} className="space-y-4">
                    
                    <input type="hidden" name="access_key" value={WEB3FORMS_ACCESS_KEY} />
                    <input type="hidden" name="subject" value="New Contact Message from Auction Arena!" />
                    <input type="hidden" name="from_name" value="Auction Arena Contact Form" />

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Your Name</label>
                      <input type="text" name="name" required placeholder="ABC" className="w-full px-4 py-2.5 sm:py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Email Address</label>
                      <input type="email" name="email" required placeholder="abc@example.com" className="w-full px-4 py-2.5 sm:py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Subject</label>
                      <input type="text" name="subject_user" required placeholder="Project Collaboration / Job Offer / Hi!" className="w-full px-4 py-2.5 sm:py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Message</label>
                      <textarea name="message" rows="3" required placeholder="Tell me about your project or opportunity..." className="w-full px-4 py-2.5 sm:py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold resize-none custom-scrollbar" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}}></textarea>
                    </div>
                    
                    <button type="submit" disabled={isSubmittingContact} className="w-full flex justify-center items-center gap-2 py-3 mt-2 rounded-lg text-xs sm:text-sm font-bold tracking-[2px] uppercase transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={{background:'#F2A623',color:'#07070e'}}>
                      <span className="text-lg">{isSubmittingContact ? '⏳' : '✈'}</span> 
                      {isSubmittingContact ? 'Sending...' : 'Send Message'}
                    </button>
                  </form>
                </div>

              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
