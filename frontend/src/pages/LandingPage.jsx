import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exchangeCodeForSessionIfPresent } from '../lib/supabase'
import { API_BASE_URL } from '../lib/config'
import { useStore } from '../store'

// SPORTS CARDS WITH DIFFERENT COLORS AS REQUESTED
const SPORTS = [
  { id:'ipl', icon:'🏏', tag:'IPL Cricket', name:'Indian Premier\nLeague', color:'#FF5A00', glow:'rgba(255,90,0,0.15)', border:'rgba(255,90,0,0.3)',
    desc:'350+ elite players — capped legends, uncapped gems, overseas stars. ₹120 Crore purse per team.', stats:[['350+','Players'],['₹120Cr','Purse'],['8','Overseas Cap']] },
  { id:'kabaddi', icon:'🤼', tag:'Pro Kabaddi', name:'Pro Kabaddi\nLeague', color:'#EF4444', glow:'rgba(239,68,68,0.15)', border:'rgba(239,68,68,0.3)',
    desc:'200+ PKL stars — raiders, defenders & all-rounders. Build the most feared Kabaddi roster.', stats:[['200+','Players'],['₹4Cr','Purse'],['3','Roles']] },
  { id:'football', icon:'⚽', tag:'World Football', name:'World\nFootball', color:'#10B981', glow:'rgba(16,185,129,0.15)', border:'rgba(16,185,129,0.3)',
    desc:'500+ global superstars from PL, La Liga, Serie A, ISL & beyond. Build your ultimate dream XI.', stats:[['500+','Players'],['€200M','Budget'],['10','Positions']] },
]

const FEATS = [
  ['⚡','Server-Side Timer','15s countdown on the server. No desync, no cheating.'],
  ['🎙️','Lady Voice Announcer','Fast female AI voice announces every bid and sale live.'],
  ['🤖','Gemini AI Analysis','Post-auction squad rankings with strengths, best XI, predictions.'],
  ['📊','Excel Export','Download all squads as .xlsx with full stats. Runs in browser.'],
  ['🔴','Real-Time Bidding','Socket.io powered — rival bids appear instantly with a flash.'],
  ['🏳️','Overseas Cap Rules','Max 8 overseas enforced live. Auto-disabled when cap is hit.'],
  ['↩️','Unsold Round','All unsold players re-enter. Skip tracking resets entirely.'],
  ['💰','Purse Enforcement','Smart purse tracking — shows Insufficient Funds instantly.'],
]

const STEPS = [
  ['1', 'Create a Room (Host)', 'Sign in and click "Create Room". Choose your sport, set the purse amount, squad limits, and player order.'],
  ['2', 'Invite Friends', 'Share the unique 6-character room code. Friends can join instantly from the landing page.'],
  ['3', 'Mark Ready & Start', 'Once all teams are in the lobby and have clicked "Mark Ready", the admin can start the auction.'],
  ['4', 'Bid to Win', 'Use the bid buttons (+₹25L, +₹50L) to place your bid. If no one bids before the 15s timer runs out, the player is yours!'],
  ['5', 'Analysis & Export', 'After the unsold round, view your AI squad analysis or download the full auction results as an Excel file.'],
]

const DONATION_TIERS = [
  { name: 'Supporter', amount: 20, icon: '🌱', color: '#A1A1AA' },
  { name: 'Backer', amount: 50, icon: '⭐', color: '#FF5A00' },
  { name: 'Pro', amount: 100, icon: '🚀', color: '#3B82F6' },
  { name: 'Super Supporter', amount: 200, icon: '💜', color: '#A855F7' },
  { name: 'Champion', amount: 500, icon: '🏆', color: '#F59E0B' },
  { name: 'Legend', amount: 1000, icon: '🔥', color: '#EF4444' },
  { name: 'Papa 👤', amount: 5000, icon: '👑', color: '#FF5A00' },
  { name: 'Bhagwan 🙏', amount: 10000, icon: '✨', color: '#FFFFFF' },
]

const WEB3FORMS_ACCESS_KEY = "5a7d81b6-3b40-470d-bf3c-8b4e3be462f3";

const loadRazorpayCheckout = () => {
  if (window.Razorpay) return Promise.resolve(true)

  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })
}

export default function LandingPage() {
  const [code, setCode] = useState('')
  const [totalUsers, setTotalUsers] = useState(0)
  const { setUser, setProfile, profile } = useStore()
  const activeUsers = useStore(s => s.activeUsers)
  const navigate = useNavigate()
  const randomActiveUsers = useRef(Math.floor(Math.random() * (179 - 53 + 1)) + 53);
  const displayActiveUsers = activeUsers > 50 ? activeUsers : randomActiveUsers.current
  const join = () => { if (code.trim().length === 6) navigate(`/join?code=${code.trim().toUpperCase()}`) }

  const [activeModal, setActiveModal] = useState(null)
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)
  const [showContactThankYou, setShowContactThankYou] = useState(false)
  const [donationAmount, setDonationAmount] = useState(200)

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
    const fetchUserCount = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stats`);
        if (res.ok) {
          const data = await res.json();
          setTotalUsers(data.totalUsers || 0);
        } else {
          console.error("Failed to fetch stats from server:", res.status);
          setTotalUsers(412); 
        }
      } catch (error) {
        console.error("Error fetching total user count:", error);
        setTotalUsers(412); 
      }
    };
    fetchUserCount();
  }, []);

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

  const handlePayment = async () => {
    try {
      const amount = Number(donationAmount)
      if (!Number.isFinite(amount) || amount < 20) {
        alert("Minimum donation amount is ₹20.");
        return;
      }

      const isRazorpayLoaded = await loadRazorpayCheckout()
      if (!isRazorpayLoaded) {
        alert("Unable to load Razorpay. Please check your connection and try again.");
        return;
      }

      const res = await fetch(`${API_BASE_URL}/api/create-order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount,
          name: profile?.display_name || "Supporter",
          email: profile?.email || "supporter@auctionarena.com"
        })
      });

      const data = await res.json();

      if (data.order_id && data.key_id) {
        const razorpay = new window.Razorpay({
          key: data.key_id,
          amount: data.amount,
          currency: data.currency || 'INR',
          name: 'Auction Arena',
          description: 'Donation Support',
          order_id: data.order_id,
          prefill: {
            name: profile?.display_name || "Supporter",
            email: profile?.email || "supporter@auctionarena.com",
          },
          theme: {
            color: '#FF5A00',
          },
          handler: async (response) => {
            const verifyRes = await fetch(`${API_BASE_URL}/api/verify-payment`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(response),
            });

            if (!verifyRes.ok) {
              alert("Payment could not be verified. Please contact support.");
              return;
            }

            alert("Thank you so much for your donation! ❤️");
            setActiveModal(null);
          },
          modal: {
            ondismiss: () => console.log("Razorpay checkout closed"),
          }
        });

        razorpay.on('payment.failed', (response) => {
          console.log("Payment failed", response.error);
        });

        razorpay.open();
      } else {
        alert("Failed to initiate payment. Please try again.");
      }
    } catch (error) {
      console.error("Error starting payment:", error);
      alert("Something went wrong!");
    }
  };

  return (
    <div className="min-h-screen bg-bg relative overflow-x-hidden">
      
      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: rgba(255, 255, 255, 0.01); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.08); border-radius: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(255, 255, 255, 0.15); }

        .arena-card {
          transition: all 0.4s cubic-bezier(0.25, 1, 0.5, 1);
        }
        
        @media (hover: hover) {
          .arena-card:hover {
            border: 0.5px solid var(--card-border) !important;
            transform: translateY(-6px);
            box-shadow: 0 20px 60px rgba(0,0,0,0.8), 0 0 40px var(--card-glow);
          }
          .arena-card:hover .arena-card-bg {
            opacity: 1 !important;
          }
          .arena-card:hover .arena-icon {
            transform: scale(1.08) rotate(-4deg);
          }
        }

        @media (hover: none) {
          .arena-card:active {
            border: 0.5px solid var(--card-border) !important;
            transform: translateY(-2px) scale(0.99);
            box-shadow: 0 10px 30px rgba(0,0,0,0.8), 0 0 20px var(--card-glow);
          }
          .arena-card:active .arena-card-bg {
            opacity: 1 !important;
          }
          .arena-card:active .arena-icon {
            transform: scale(1.05) rotate(-2deg);
          }
        }
      `}</style>

      {/* MASSIVE EMBER FIRE GLOWS */}
      <div className="orb" style={{width:'150vw', height:'80vh', background:'radial-gradient(ellipse at center, rgba(255, 90, 0, 0.15) 0%, rgba(204, 72, 0, 0.05) 50%, transparent 70%)', top:'-10%', left:'-25%', filter:'blur(120px)'}}/>
      <div className="orb" style={{width:'120vw', height:'70vh', background:'radial-gradient(ellipse at bottom, rgba(255, 120, 0, 0.2) 0%, rgba(204, 72, 0, 0.05) 40%, transparent 70%)', bottom:'-20%', left:'-10%', filter:'blur(140px)'}}/>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-10 py-5"
           style={{background:'rgba(10,5,0,0.7)',backdropFilter:'blur(24px)',borderBottom:'1px solid rgba(255,255,255,0.05)'}}>
        <span className="font-bebas text-xl sm:text-2xl tracking-[2px] sm:tracking-[4px] text-white">AUCTION<span className="text-[#FF5A00]"> ARENA</span></span>
        <div className="flex items-center gap-4 md:gap-8">
          <a href="#sports" className="text-muted text-xs font-semibold tracking-wide hover:text-white transition-colors hidden sm:block">Arenas</a>
          <a href="#features" className="text-muted text-xs font-semibold tracking-wide hover:text-white transition-colors hidden sm:block">Features</a>
          <a href="#works" className="text-muted text-xs font-semibold tracking-wide hover:text-white transition-colors hidden sm:block">Works</a>
          <Link to="/login" className="btn-theme text-xs px-5 py-2.5 rounded-full no-underline" style={{padding:'0.6rem 1.4rem',fontSize:'0.8rem'}}>Log in</Link>
        </div>
      </nav>

      {/* Virtual Coin Notice */}
      <div className="relative z-40 px-4 md:px-10 pt-24 sm:pt-28 md:pt-32" style={{backdropFilter:'blur(12px)'}}>
        <div className=" py-2 px-5 w-full max-w-3xl mx-auto overflow-hidden" style={{background:'#FFFFFF', border:'1px solid rgba(255,255,255,0.1)'}}>
          <marquee className="text-[#FF5A00] text-xs sm:text-sm uppercase tracking-[1px] font-semibold">
            This website does not use real money for purchasing or bidding on players. All bidding uses virtual coins provided by Auction Arena.
          </marquee>
        </div>
      </div>

      {/* HERO */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-4 sm:px-6 pt-16 md:pt-20">

        <h1 style={{display:"none"}}>
          IPL Auction App Cricket Auction Online Fantasy Cricket Auction Game India
        </h1>

        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 anim-1 max-w-full text-left sm:text-center"
            style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(255,255,255,0.1)'}}>
          <span className="w-1.5 h-1.5 rounded-full bg-[#FF5A00] shrink-0" style={{animation:'pulse 2s infinite'}}/>
          <span className="text-[#FF5A00] text-[10px] sm:text-xs tracking-[1px] uppercase font-semibold truncate">
            Real-time Multiplayer · Up to 10 Players · 3 Sports
          </span>
        </div>
        
        <h1 className="font-sans font-semibold leading-[1.1] anim-2 text-white" style={{fontSize:'clamp(3.5rem,10vw,7rem)',letterSpacing:'-0.03em'}}>
          Effortless Bidding<br/>
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#FF5A00] to-[#F59E0B]">for Everyone.</span>
        </h1>
        
        <p className="text-muted text-sm sm:text-lg max-w-2xl mt-6 leading-relaxed anim-3 px-4 font-medium">Host live IPL-style auctions with friends. Real bidding, AI announcer, Gemini analysis — just like the pros, without touching a spreadsheet.</p>
        
        <div className="flex flex-col sm:flex-row gap-4 mt-10 w-full sm:w-auto justify-center anim-4 px-4">
          <Link to="/login" className="btn-theme no-underline w-full sm:w-auto justify-center" style={{padding:'1rem 2.4rem',fontSize:'1rem'}}>Get started</Link>
          <a href="#sports" className="btn-outline w-full sm:w-auto justify-center">Explore arenas</a>
        </div>

        <div className="relative z-10 flex flex-col items-center mt-6 mb-8 w-full px-4">
          <button
            onClick={() => setActiveModal('donate')}
            className="group flex items-center justify-center gap-3 px-6 py-3 rounded-full transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(242,166,35,0.2)]"
            style={{background:'rgba(242,166,35,0.08)', border:'1px solid rgba(242,166,35,0.3)', backdropFilter:'blur(10px)'}}
          >
            <span className="text-lg group-hover:scale-125 transition-transform duration-300">❤️</span>
            <span className="text-white text-xs sm:text-sm tracking-[2px] uppercase font-bold">Donate & Support</span>
          </button>
          <p className="text-muted text-sm sm:text-base mt-5 mb-8 relative z-10">Donate to help us keep this project alive and bring new updates ❤️</p>

        </div>

        <div className="mt-20 w-full max-w-5xl mx-auto anim-5 px-4 pb-20">
          <div className="flex flex-wrap justify-center gap-8 md:gap-16 items-center opacity-50 grayscale hover:grayscale-0 transition-all duration-500">
             <span className="font-bebas text-2xl tracking-widest text-white">350+ PLAYERS</span>
             <span className="font-bebas text-2xl tracking-widest text-white">10 TEAMS</span>
             <span className="font-bebas text-2xl tracking-widest text-white">15s TIMER</span>
             <span className="font-bebas text-2xl tracking-widest text-white">GEMINI AI</span>
          </div>
        </div>
      </section>

      {/* SPORTS */}
      <section id="sports" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-20 sm:py-32">
        <h2 className="font-sans font-semibold text-4xl sm:text-5xl md:text-6xl tracking-tight mb-4 text-white">The Arenas</h2>
        <p className="text-muted text-sm sm:text-base mb-12 max-w-xl font-medium">Configure your room, invite friends, and bid live. Experience premium auction mechanics across three distinct sports.</p>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {SPORTS.map(s=>{
            const isDisabled = s.isComingSoon;
            return (
            <div key={s.id} 
                 role="button"
                 onClick={() => { if (!isDisabled) navigate(`/create-room?sport=${s.id}`) }}
                 className={`group relative rounded-2xl overflow-hidden ${isDisabled ? '' : 'arena-card'}`}
                 style={{
                   background: 'rgba(255,255,255,0.02)',
                   border: '1px solid rgba(255,255,255,0.08)',
                   minHeight: 420,
                   cursor: isDisabled ? 'not-allowed' : 'pointer',
                   opacity: isDisabled ? 0.78 : 1,
                   '--card-border': s.border,
                   '--card-glow': s.glow
                 }}>
                 
              <div className="arena-card-bg absolute inset-0 opacity-0 transition-opacity duration-500 pointer-events-none"
                   style={{background:`radial-gradient(ellipse at 80% 10%,${s.glow},transparent 65%)`}}/>
              <div className="relative z-10 p-8 flex flex-col h-full">
                <span className="arena-icon text-5xl mb-6 block transition-transform duration-300">{s.icon}</span>
                <span className="text-[10px] sm:text-xs font-bold px-3 py-1.5 rounded-full mb-4 w-fit"
                      style={{background:`${s.glow}`,color:s.color,border:`1px solid ${s.border}`}}>{s.tag}</span>
                <h3 className="font-sans font-semibold text-2xl sm:text-3xl mb-3 text-white whitespace-pre-line">{s.name}</h3>
                <p className="text-muted text-sm leading-relaxed mb-auto font-medium">{s.desc}</p>
                <div className="flex flex-wrap gap-6 mt-8 pt-6" style={{borderTop:'1px solid rgba(255,255,255,0.05)'}}>
                  {s.stats.map(([v,l])=>(
                    <div key={l}>
                      <div className="font-mono text-sm sm:text-base font-bold text-white">{v}</div>
                      <div className="text-muted text-[10px] sm:text-xs font-medium mt-1">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-3 mt-8">
                  {isDisabled ? (
                    <div className="flex-1 py-3 rounded-full text-center text-xs font-semibold"
                         style={{background:'rgba(255,255,255,0.03)',color:'#A1A1AA',border:'1px solid rgba(255,255,255,0.08)'}}>
                      Coming Soon
                    </div>
                  ) : (
                    <Link to={`/create-room?sport=${s.id}`} className="flex-1 py-3 rounded-full text-center text-xs font-bold no-underline transition-all hover:brightness-110"
                          style={{background:s.color,color:'#0A0500'}} onClick={e=>e.stopPropagation()}>Create Room</Link>
                  )}
                  <Link to="/join" className="flex-1 py-3 rounded-full text-center text-xs font-semibold text-white hover:bg-white/5 transition-colors no-underline"
                        style={{border:'1px solid rgba(255,255,255,0.15)',background:'transparent'}} onClick={e=>e.stopPropagation()}>Join Room</Link>
                </div>
              </div>
            </div>
          )})}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-32">
        <h2 className="font-sans font-semibold text-4xl sm:text-5xl tracking-tight mb-12 text-white text-center">Built for performance.</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          {FEATS.map(([icon,title,desc])=>(
            <div key={title} className="p-6 rounded-2xl transition-colors" style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}
                 onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.04)'}
                 onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}>
              <div className="text-3xl mb-4">{icon}</div>
              <div className="font-semibold text-sm mb-2 text-white">{title}</div>
              <div className="text-muted text-xs leading-relaxed font-medium">{desc}</div>
            </div>
          ))}
        </div>
      </section>
    
      <section className="relative z-10 max-w-5xl mx-auto px-4 md:px-8 pb-32 text-center">
        <h1 className="font-sans font-semibold text-3xl sm:text-4xl tracking-tight mb-6 text-white">
          The ultimate live auction experience.
        </h1>
        <p className="text-muted text-sm sm:text-base leading-relaxed mb-6 font-medium max-w-2xl mx-auto">
          Auction Arena is a real-time platform where users can experience IPL-style bidding with friends. Join or create a room, manage your purse, and outsmart your rivals.
        </p>
      </section>

      <section id="works" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-32">
        <h2 className="font-sans font-semibold text-4xl sm:text-5xl tracking-tight mb-12 text-white">How it works.</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {STEPS.map(([num, title, desc]) => (
            <div key={num} className="p-6 rounded-2xl relative overflow-hidden transition-transform duration-300 hover:-translate-y-1" style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}>
              <div className="font-sans font-bold text-6xl text-white opacity-[0.02] absolute -top-2 -right-2 select-none">{num}</div>
              <div className="w-8 h-8 rounded-full bg-[#FF5A00]/20 text-[#FF5A00] flex items-center justify-center font-bold mb-4 border border-[#FF5A00]/30 text-sm">{num}</div>
              <div className="font-semibold text-sm mb-2 text-white">{title}</div>
              <div className="text-muted text-xs leading-relaxed font-medium">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* JOIN BOX */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-20">
        <div className="rounded-3xl p-8 sm:p-12 md:p-20 text-center relative overflow-hidden" style={{background:'linear-gradient(180deg, rgba(255,90,0,0.1) 0%, rgba(0,0,0,0) 100%)',border:'1px solid rgba(255,90,0,0.2)'}}>
          <h2 className="font-sans font-semibold text-4xl sm:text-5xl md:text-6xl tracking-tight mb-4 relative z-10 text-white">Ready to dominate?</h2>
          <p className="text-muted text-sm sm:text-base mb-10 relative z-10 font-medium">Jump straight into a live room with a code, or log in to create your own.</p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto mb-8 relative z-10">
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&join()}
                   className="aa-input flex-1 text-center font-mono uppercase rounded-full" maxLength={6} placeholder="ENTER CODE"
                   style={{fontSize: 'clamp(0.9rem, 4vw, 1rem)', letterSpacing: '0.2em', padding:'1rem'}}/>
            <button onClick={join} className="btn-theme w-full sm:w-auto justify-center" style={{padding:'1rem 2rem',fontSize:'0.9rem',whiteSpace:'nowrap'}}>Join Room</button>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="relative z-10 border-t px-4 sm:px-10 py-8 flex items-center justify-between flex-wrap gap-6 mt-10" style={{borderColor:'rgba(255,255,255,0.05)', background:'transparent'}}>
        
        <div className="flex flex-col items-center sm:items-start w-full sm:w-auto order-1">
          <span className="font-bebas text-xl tracking-[4px] text-white">AUCTION<span className="text-[#FF5A00]"> ARENA</span></span>
          <span className="block text-muted text-xs mt-2 font-medium">© 2026 Auction Arena. All rights reserved.</span>
        </div>
        
        <div className="flex flex-row items-center justify-center gap-8 sm:gap-12 w-full sm:w-auto order-3 sm:order-2">
          
          <div className="flex flex-col items-center">
            <span className="text-muted text-[10px] uppercase tracking-widest mb-1.5 hidden sm:block">Developed By</span>
            <span className="text-white text-xs font-semibold mb-2">Subrata Bala</span>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/_itz.subrata" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#FF5A00] transition-colors" title="Instagram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/subrata-bala-89516b302" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#FF5A00] transition-colors" title="LinkedIn">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
              </a>
            </div>
          </div>

          <div className="w-px h-10" style={{background:'rgba(255,255,255,0.1)'}}/>

          <div className="flex flex-col items-center">
            <span className="text-muted text-[10px] uppercase tracking-widest mb-1.5 opacity-0 sm:opacity-100 hidden sm:block">Developed By</span>
            <span className="text-white text-xs font-semibold mb-2">Mukesh Bala</span>
            <div className="flex items-center gap-4">
              <a href="https://www.instagram.com/mm__raj" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#FF5A00] transition-colors" title="Instagram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/mukeshbala143" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#FF5A00] transition-colors" title="LinkedIn">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
              </a>
            </div>
          </div>
        </div>
        
        <div className="flex flex-wrap justify-center gap-6 sm:gap-8 order-2 sm:order-3 w-full sm:w-auto">
          <button onClick={() => setActiveModal('privacy')} className="text-muted text-xs font-medium hover:text-white transition-colors">Privacy</button>
          <button onClick={() => setActiveModal('terms')} className="text-muted text-xs font-medium hover:text-white transition-colors">Terms</button>
          <button onClick={() => setActiveModal('contact')} className="text-muted text-xs font-medium hover:text-white transition-colors">Contact</button>
          <Link to="/admin" className="text-muted text-xs font-medium hover:text-white transition-colors no-underline">Admin</Link>
        </div>
      </footer>

      {/* POPUP MODALS */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-start md:items-center justify-center p-3 sm:p-4 overflow-y-auto" style={{background:'rgba(0,0,0,0.8)', backdropFilter:'blur(8px)'}}>
          
          <div 
            className={`relative w-full ${activeModal === 'contact' ? 'max-w-4xl' : 'max-w-lg'} rounded-2xl p-6 sm:p-10 overflow-hidden transform transition-all my-6 max-h-[90vh] overflow-y-auto custom-scrollbar`} 
            style={{background:'#140A00', border:'1px solid rgba(255,255,255,0.1)', boxShadow:'0 25px 50px -12px rgba(0, 0, 0, 1)'}}
          >
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 sm:top-5 sm:right-5 text-muted hover:text-white text-2xl leading-none h-10 w-10 flex items-center justify-center rounded-full hover:bg-white/5 transition-colors" aria-label="Close modal">&times;</button>
            
            {activeModal === 'donate' && (
              <div className="w-full max-w-2xl flex flex-col mx-auto mt-2">
                <div className="text-center mb-8 sm:mb-10">
                   <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-orange-500/10 text-orange-400 mb-5 border border-orange-500/20 text-2xl">🔥</div>
                   <h3 className="font-sans font-semibold text-2xl sm:text-3xl text-white mb-3">Support the project</h3>
                   <p className="text-muted text-sm max-w-md mx-auto leading-relaxed">Even the smallest donation helps us keep Auction Arena free, fast, and improving. Every bit counts!</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                   {DONATION_TIERS.map(tier => {
                      const isSelected = Number(donationAmount) === tier.amount;
                      return (
                      <button key={tier.name}
                              type="button"
                              onClick={() => setDonationAmount(tier.amount)}
                              className={`relative flex flex-col items-center justify-center p-5 rounded-xl transition-all group overflow-hidden ${isSelected ? 'bg-white/10 border-white/30' : 'bg-white/5 border-white/5 hover:bg-white/10'}`}
                              style={{borderWidth: '1px'}}>
                        <span className="text-2xl mb-3 group-hover:scale-110 transition-transform">{tier.icon}</span>
                        <span className="text-white text-[11px] sm:text-xs font-semibold mb-1.5 text-center">{tier.name}</span>
                        <span className="font-mono text-xs" style={{color: tier.color}}>₹{tier.amount}</span>
                      </button>
                   )})}
                </div>

                <div className="space-y-5 max-w-md mx-auto w-full">
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-2">Your Name</label>
                    <input type="text" placeholder="e.g. Auction Arena" className="w-full px-5 py-3.5 rounded-xl text-sm text-white outline-none focus:border-orange-500 transition-colors bg-white/5 border-white/10" style={{borderWidth: '1px'}} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-muted mb-2">Custom Amount (₹20 min)</label>
                    <div className="relative">
                       <span className="absolute left-5 top-1/2 -translate-y-1/2 text-orange-400 font-mono">₹</span>
                       <input 
                         type="number" 
                         value={donationAmount}
                         onChange={(e) => setDonationAmount(e.target.value)}
                         min="20" 
                         className="w-full pl-9 pr-5 py-3.5 rounded-xl text-sm text-white outline-none focus:border-orange-500 transition-colors font-mono bg-white/5 border-white/10" 
                         style={{borderWidth: '1px'}} 
                       />
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={handlePayment} 
                    className="w-full py-4 rounded-full text-sm font-bold transition-all mt-4 text-black bg-white hover:bg-gray-200"
                  >
                     Donate ₹{donationAmount} via Razorpay
                  </button>
                  <p className="text-center text-xs text-muted mt-3">Powered by Razorpay · Secure & encrypted</p>
                </div>
              </div>
            )}

            {/* PRIVACY POLICY MODAL */}
            {activeModal === 'privacy' && (
              <div>
                <h3 className="font-sans font-semibold text-2xl sm:text-3xl text-white mb-6">Privacy Policy</h3>
                <div className="text-muted text-sm space-y-5 h-72 overflow-y-auto pr-4 custom-scrollbar font-medium leading-relaxed">
                  <p><strong>Effective Date:</strong> April 2026</p>
                  <p>Welcome to Auction Arena! This Privacy Policy explains how we collect, use, and protect your information when you use our platform. Your privacy is our priority, and we are committed to keeping your data safe.</p>

                  <p className="text-white font-semibold">1. Information We Collect</p>
                  <p>To provide you with the best gameplay experience, we collect the following types of information:</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li><strong>Basic Account Information:</strong> Your display name, username, and email address (collected via secure authentication).</li>
                    <li><strong>Gameplay Data:</strong> Bids placed, auction participation history, team selections, and general game activity.</li>
                    <li><strong>Technical Data:</strong> Browser type, device information, and standard web analytics to ensure smooth performance.</li>
                  </ul>

                  <p className="text-white font-semibold mt-4">2. How We Use Your Information</p>
                  <p>The data we collect is strictly used to:</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>Create and manage your Auction Arena profile.</li>
                    <li>Facilitate real-time auction gameplay and maintain leaderboards/squads.</li>
                    <li>Improve platform stability, user experience, and fix technical bugs.</li>
                    <li>Ensure fair play and monitor for any misuse of the system.</li>
                  </ul>

                  <p className="text-white font-semibold mt-4">3. No Payment or Financial Data</p>
                  <p>Auction Arena is strictly an entertainment and simulation platform. We do not involve real money transactions, nor do we collect, process, or store any payment information, credit card details, or banking data.</p>

                  <p className="text-white font-semibold mt-4">Contact Us</p>
                  <p>If you have any questions regarding this policy, please reach out to us at:<br/>📧 Email: <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support.auctionarena@gmail.com" target="_blank" rel="noopener noreferrer" className="text-orange-400 hover:text-white">support.auctionarena@gmail.com</a></p>
                </div>
              </div>
            )}

            {/* TERMS & CONDITIONS MODAL */}
            {activeModal === 'terms' && (
              <div>
                <h3 className="font-sans font-semibold text-2xl sm:text-3xl text-white mb-6">Terms & Conditions</h3>
                <div className="text-muted text-sm space-y-5 h-72 overflow-y-auto pr-4 custom-scrollbar font-medium leading-relaxed">
                  <p><strong>Effective Date:</strong> April 2026</p>
                  <p>Welcome to Auction Arena. By accessing or using our platform, you agree to be bound by these Terms & Conditions. Please read them carefully.</p>

                  <p className="text-white font-semibold mt-4">1. Eligibility & Acceptance</p>
                  <p>By using Auction Arena, you confirm that you are at least 13 years of age and that the information you provide during registration is accurate. Continued use of the platform constitutes your acceptance of these terms.</p>

                  <p className="text-white font-semibold mt-4">2. Nature of the Platform (No Real Money)</p>
                  <p>Auction Arena is strictly a simulation and gaming platform designed for entertainment purposes.</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>No real money is wagered, won, or lost on this platform.</li>
                    <li>All "Purses," "Bids," and "Prices" are virtual and hold zero real-world financial value.</li>
                  </ul>

                  <p className="text-white font-semibold mt-4">3. Gameplay Rules & Fair Play</p>
                  <ul className="list-disc pl-5 space-y-2">
                    <li>All auction bids placed within the system are final and cannot be reversed.</li>
                    <li>Auction results, player allocations, and timer resolutions are governed entirely by the platform's system logic.</li>
                    <li>Users are expected to maintain fair play and good sportsmanship.</li>
                  </ul>

                  <p className="text-white font-semibold mt-4">4. Limitation of Liability</p>
                  <p>Because Auction Arena is a free-to-play simulation we bear no financial liability for any perceived "losses" in gameplay, nor are we responsible for internet disconnections, device compatibility issues, or temporary server downtimes.</p>
                </div>
              </div>
            )}
            
            {/* CONTACT US MODAL */}
            {activeModal === 'contact' && (
              <div className="flex flex-col md:flex-row gap-8 sm:gap-12 mt-2">
                
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="font-sans font-semibold text-3xl sm:text-4xl text-white mb-4">Get in touch</h3>
                  <p className="text-sm text-muted mb-8 leading-relaxed font-medium">Have questions? Need support? We're here to help. Reach out to us through any channel below or use the form.</p>

                  <div className="space-y-6">
                    <div>
                      <div className="text-xs font-semibold text-muted mb-1 flex items-center gap-2">📍 FIND US</div>
                      <p className="text-sm text-white leading-relaxed">Baharagora, Jharkhand</p>
                    </div>
                    
                    <div>
                      <div className="text-xs font-semibold text-muted mb-1 flex items-center gap-2">📞 CALL US</div>
                      <p className="text-sm text-white">+91 9142473745, +91 9835656896</p>
                    </div>
                    
                    <div>
                      <div className="text-xs font-semibold text-muted mb-1 flex items-center gap-2">✉️ EMAIL US</div>
                      <p className="text-sm text-white">support.auctionarena@gmail.com</p>
                    </div>
                  </div>
                </div>

                <div className="relative flex-[1.2] p-6 sm:p-8 rounded-2xl" style={{background:'rgba(255,255,255,0.03)', border:'1px solid rgba(255,255,255,0.05)'}}>
                  
                  {showContactThankYou && (
                    <div className="absolute inset-0 z-20 flex items-center justify-center rounded-2xl" style={{background:'rgba(10,5,0,0.8)', backdropFilter:'blur(8px)'}}>
                      <div className="flex flex-col items-center justify-center p-8 text-center">
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-5 bg-green-500/10 border border-green-500/20">
                          <svg className="w-8 h-8 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                        </div>
                        <h4 className="font-sans font-semibold text-2xl text-white mb-2">Message Sent</h4>
                        <p className="text-sm text-muted">We'll get back to you shortly.</p>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleContactSubmit} className="space-y-5">
                    
                    <input type="hidden" name="access_key" value={WEB3FORMS_ACCESS_KEY} />
                    <input type="hidden" name="subject" value="New Contact Message from Auction Arena!" />
                    <input type="hidden" name="from_name" value="Auction Arena Contact Form" />

                    <div>
                      <label className="block text-xs font-semibold text-muted mb-2">Your Name</label>
                      <input type="text" name="name" required placeholder="Jane Doe" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none focus:border-orange-500 transition-colors bg-white/5 border border-white/10" />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-2">Email Address</label>
                      <input type="email" name="email" required placeholder="jane@example.com" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none focus:border-orange-500 transition-colors bg-white/5 border border-white/10" />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-muted mb-2">Subject</label>
                      <input type="text" name="subject_user" required placeholder="How can we help?" className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none focus:border-orange-500 transition-colors bg-white/5 border border-white/10" />
                    </div>
                    
                    <div>
                      <label className="block text-xs font-semibold text-muted mb-2">Message</label>
                      <textarea name="message" rows="3" required placeholder="Tell us more..." className="w-full px-4 py-3 rounded-xl text-sm text-white outline-none focus:border-orange-500 transition-colors resize-none custom-scrollbar bg-white/5 border border-white/10"></textarea>
                    </div>
                    
                    <button type="submit" disabled={isSubmittingContact} className="w-full py-4 mt-2 rounded-full text-sm font-bold transition-all text-black bg-white hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed">
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


