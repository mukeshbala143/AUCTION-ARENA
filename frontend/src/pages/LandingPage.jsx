import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { exchangeCodeForSessionIfPresent } from '../lib/supabase'
import { API_BASE_URL } from '../lib/config'
import { useStore } from '../store'
import { load } from '@cashfreepayments/cashfree-js' // ✅ ADDED: Cashfree SDK

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
  ['🤖','Gemini AI Analysis','Post-auction squad rankings with strengths, best XI, predictions.'],
  ['📊','Excel Export','Download all squads as .xlsx with full stats. Runs in browser.'],
  ['🔴','Real-Time Bidding','Socket.io powered — rival bids appear instantly with gold flash.'],
  ['🏳️','Overseas Cap Rules','Max 8 overseas enforced live. Auto-disabled when cap is hit.'],
  ['↩️','Unsold Round','All unsold players re-enter. Skip tracking resets entirely.'],
  ['💰','Purse Enforcement','Smart purse tracking — shows Insufficient Funds instantly.'],
]

// Naya STEPS array "How It Works" section ke liye
const STEPS = [
  ['1', 'Create a Room (Host)', 'Sign in and click "Create Room". Choose your sport, set the purse amount, squad limits, and player order.'],
  ['2', 'Invite Friends', 'Share the unique 6-character room code. Friends can join instantly from the landing page.'],
  ['3', 'Mark Ready & Start', 'Once all teams are in the lobby and have clicked "Mark Ready", the admin can start the auction.'],
  ['4', 'Bid to Win', 'Use the bid buttons (+₹25L, +₹50L) to place your bid. If no one bids before the 15s timer runs out, the player is yours!'],
  ['5', 'Analysis & Export', 'After the unsold round, view your AI squad analysis or download the full auction results as an Excel file.'],
]

// ✅ DONATION DATA (Removed popular tag)
const DONATION_TIERS = [
  { name: 'Supporter', amount: 20, icon: '🌱', color: '#4CAF7D' },
  { name: 'Backer', amount: 50, icon: '⭐', color: '#F2A623' },
  { name: 'Pro', amount: 100, icon: '🚀', color: '#60A5FA' },
  { name: 'Super Supporter', amount: 200, icon: '💜', color: '#A855F7' },
  { name: 'Champion', amount: 500, icon: '🏆', color: '#FCD34D' },
  { name: 'Legend', amount: 1000, icon: '🔥', color: '#EF4444' },
  { name: 'Papa 👤', amount: 5000, icon: '👑', color: '#F2A623' },
  { name: 'Bhagwan 🙏', amount: 10000, icon: '✨', color: '#FFFFFF' },
]

const WEB3FORMS_ACCESS_KEY = "5a7d81b6-3b40-470d-bf3c-8b4e3be462f3";

export default function LandingPage() {
  const [code, setCode] = useState('')
  const [totalUsers, setTotalUsers] = useState(0)
  // ✅ ADDED profile destructuring for payment details
  const { setUser, setProfile, profile } = useStore()
  const activeUsers = useStore(s => s.activeUsers)
  const navigate = useNavigate()
  const randomActiveUsers = useRef(Math.floor(Math.random() * (179 - 53 + 1)) + 53);
  const displayActiveUsers = activeUsers > 50 ? activeUsers : randomActiveUsers.current
  const join = () => { if (code.trim().length === 6) navigate(`/join?code=${code.trim().toUpperCase()}`) }

  // Modal States
  const [activeModal, setActiveModal] = useState(null)
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)
  const [showContactThankYou, setShowContactThankYou] = useState(false)
  
  // ✅ NEW STATE FOR DONATION AMOUNT
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
    // --- Fetch total registered users ---
    const fetchUserCount = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/stats`);
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

  // ✅ ADDED: Cashfree Payment Logic
  const handlePayment = async () => {
    try {
      // 1. Backend se Payment Session ID mango
      const res = await fetch('http://localhost:3001/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          amount: donationAmount,
          name: profile?.display_name || "Supporter",
          email: profile?.email || "supporter@auctionarena.com"
        })
      });

      const data = await res.json();

      if (data.payment_session_id) {
        // 2. Cashfree SDK load karo (TEST mode me)
        const cashfree = await load({
          mode: "sandbox" // 🔴 Jab real payment chahiye ho tab isko "production" kar dena
        });

        // 3. Checkout Modal open karo
        let checkoutOptions = {
          paymentSessionId: data.payment_session_id,
          redirectTarget: "_modal", // Isse same page par ek sundar popup khulega
        };

        cashfree.checkout(checkoutOptions).then((result) => {
          if(result.error){
              console.log("Payment failed or modal closed", result.error);
          }
          if(result.redirect){
              console.log("Payment will be redirected");
          }
          if(result.paymentDetails){
              console.log("Payment successful!", result.paymentDetails);
              // Payment success hone par alert dikhao aur modal band karo
              alert("Thank you so much for your donation! ❤️");
              setActiveModal(null); 
          }
        });
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
          <a href="#works" className="text-muted text-xs tracking-widest uppercase hover:text-gold transition-colors hidden sm:block">Works</a>
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

        {/* ✅ DONATION BUTTON */}
        <div className="flex flex-col items-center mt-12 w-full anim-4-5 px-4">
          <button
            onClick={() => setActiveModal('donate')}
            className="group flex items-center justify-center gap-3 px-6 py-3 rounded-full transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_0_20px_rgba(242,166,35,0.2)]"
            style={{background:'rgba(242,166,35,0.08)', border:'1px solid rgba(242,166,35,0.3)', backdropFilter:'blur(10px)'}}
          >
            <span className="text-lg group-hover:scale-125 transition-transform duration-300">❤️</span>
            <span className="text-gold text-xs sm:text-sm tracking-[2px] uppercase font-bold">Donate & Support</span>
          </button>
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

      {/* ✅ NAYA "HOW IT WORKS" SECTION */}
      <section id="works" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-20">
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">The Process<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h2 className="font-bebas text-4xl sm:text-5xl tracking-[3px] mb-8 sm:mb-12">How It <span className="text-gold">Works</span></h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {STEPS.map(([num, title, desc]) => (
            <div key={num} className="p-6 rounded-2xl relative overflow-hidden transition-transform duration-300 hover:-translate-y-1" style={{background:'#13131f', border:'0.5px solid rgba(255,255,255,0.05)'}}>
              <div className="font-bebas text-6xl text-white opacity-[0.03] absolute -top-3 -right-2 select-none">{num}</div>
              <div className="w-8 h-8 rounded-full bg-gold/10 text-gold flex items-center justify-center font-bold mb-4 border border-gold/20 text-sm">{num}</div>
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
        
        {/* Left Side: Logo & Copyright */}
        <div className="flex flex-col items-center sm:items-start w-full sm:w-auto order-1">
          <span className="font-bebas text-xl tracking-[4px] text-gold">AUCTION ARENA</span>
          <span className="block text-muted text-xs mt-2">© 2026 Auction Arena · All rights reserved</span>
        </div>
        
        {/* Middle: Developers Section with Social Links */}
        <div className="flex flex-row items-center justify-center gap-6 sm:gap-10 w-full sm:w-auto order-3 sm:order-2">
          
          {/* Subrata Bala */}
          <div className="flex flex-col items-center">
            <span className="text-muted text-[10px] uppercase tracking-widest mb-1 hidden sm:block">Developed By</span>
            <span className="text-white text-xs font-semibold mb-1.5">Subrata Bala</span>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/_itz.subrata" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#E1306C] transition-colors" title="Instagram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/subrata-bala-89516b302" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#0077B5] transition-colors" title="LinkedIn">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
              </a>
            </div>
          </div>

          {/* Divider */}
          <div className="w-px h-8" style={{background:'rgba(255,255,255,0.1)'}}/>

          {/* Mukesh Bala */}
          <div className="flex flex-col items-center">
            <span className="text-muted text-[10px] uppercase tracking-widest mb-1 opacity-0 sm:opacity-100 hidden sm:block">Developed By</span>
            <span className="text-white text-xs font-semibold mb-1.5">Mukesh Bala</span>
            <div className="flex items-center gap-3">
              <a href="https://www.instagram.com/mm__raj" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#E1306C] transition-colors" title="Instagram">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              </a>
              <a href="https://www.linkedin.com/in/mukeshbala143" target="_blank" rel="noopener noreferrer" className="text-muted hover:text-[#0077B5] transition-colors" title="LinkedIn">
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M4.98 3.5c0 1.381-1.11 2.5-2.48 2.5s-2.48-1.119-2.48-2.5c0-1.38 1.11-2.5 2.48-2.5s2.48 1.12 2.48 2.5zm.02 4.5h-5v16h5v-16zm7.982 0h-4.968v16h4.969v-8.399c0-4.67 6.029-5.052 6.029 0v8.399h4.988v-10.131c0-7.88-8.922-7.593-11.018-3.714v-2.155z"/></svg>
              </a>
            </div>
          </div>
        </div>
        
        {/* Right Side: Links */}
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
            
            {/* ✅ DONATE MODAL */}
            {activeModal === 'donate' && (
              <div className="w-full max-w-2xl flex flex-col mx-auto">
                <div className="text-center mb-6 sm:mb-8">
                   <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-red-500/10 text-red-500 mb-4 border border-red-500/20 text-2xl animate-pulse">❤️</div>
                   <h3 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-white uppercase mb-2">Your support means the world</h3>
                   <p className="text-muted text-xs sm:text-sm max-w-md mx-auto">Even the smallest donation helps us keep Auction Arena free, fast, and improving. Every rupee counts!</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                   {DONATION_TIERS.map(tier => {
                      const isSelected = Number(donationAmount) === tier.amount;
                      return (
                      <button key={tier.name}
                              type="button"
                              onClick={() => setDonationAmount(tier.amount)}
                              className={`relative flex flex-col items-center justify-center p-4 rounded-xl transition-all hover:-translate-y-1 group overflow-hidden ${isSelected ? 'shadow-[0_0_15px_rgba(242,166,35,0.3)]' : ''}`}
                              style={{
                                background: isSelected ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.02)', 
                                border: `1px solid ${isSelected ? '#F2A623' : 'rgba(255,255,255,0.08)'}`
                              }}>
                        
                        <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">{tier.icon}</span>
                        <span className="text-white text-[11px] sm:text-xs font-semibold mb-1 tracking-wider text-center">{tier.name}</span>
                        <span className="font-mono text-xs" style={{color: tier.color}}>₹{tier.amount}</span>
                      </button>
                   )})}
                </div>

                <div className="space-y-4 max-w-md mx-auto w-full">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[2px] text-muted mb-2 text-center">Your Name</label>
                    <input type="text" placeholder="e.g. Auction Arena" className="w-full px-4 py-3 rounded-xl text-sm text-center text-white outline-none focus:border-gold transition-colors" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-[2px] text-muted mb-2 text-center">Custom Amount (₹20 min)</label>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-gold font-mono">₹</span>
                       <input 
                         type="number" 
                         value={donationAmount}
                         onChange={(e) => setDonationAmount(e.target.value)}
                         min="20" 
                         className="w-full pl-8 pr-4 py-3 rounded-xl text-sm text-center text-white outline-none focus:border-gold transition-colors font-mono" 
                         style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} 
                       />
                    </div>
                  </div>

                  <button 
                    type="button"
                    onClick={handlePayment} 
                    className="w-full py-4 rounded-xl text-xs sm:text-sm font-bold tracking-[2px] uppercase transition-all hover:brightness-110 mt-4 text-black bg-white shadow-lg"
                  >
                     Donate ₹{donationAmount} via Cashfree
                  </button>
                  <p className="text-center text-[10px] text-muted tracking-widest uppercase mt-2">Powered by Cashfree · Secure & encrypted</p>
                </div>
              </div>
            )}

            {/* PRIVACY POLICY MODAL */}
            {activeModal === 'privacy' && (
              <div>
                <h3 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-gold mb-4 uppercase">🔐 Privacy Policy</h3>
                <div className="text-muted text-sm space-y-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                  <p><strong>Effective Date:</strong> April 2026</p>
                  <p>Welcome to Auction Arena! This Privacy Policy explains how we collect, use, and protect your information when you use our platform. Your privacy is our priority, and we are committed to keeping your data safe.</p>

                  <p><strong>1. Information We Collect</strong><br/>To provide you with the best gameplay experience, we collect the following types of information:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li><strong>Basic Account Information:</strong> Your display name, username, and email address (collected via secure authentication).</li>
                    <li><strong>Gameplay Data:</strong> Bids placed, auction participation history, team selections, and general game activity.</li>
                    <li><strong>Technical Data:</strong> Browser type, device information, and standard web analytics to ensure smooth performance.</li>
                  </ul>

                  <p><strong>2. How We Use Your Information</strong><br/>The data we collect is strictly used to:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Create and manage your Auction Arena profile.</li>
                    <li>Facilitate real-time auction gameplay and maintain leaderboards/squads.</li>
                    <li>Improve platform stability, user experience, and fix technical bugs.</li>
                    <li>Ensure fair play and monitor for any misuse of the system.</li>
                  </ul>

                  <p><strong>3. No Payment or Financial Data</strong><br/>Auction Arena is strictly an entertainment and simulation platform. We do not involve real money transactions, nor do we collect, process, or store any payment information, credit card details, or banking data.</p>

                  <p><strong>4. Data Sharing & Protection</strong><br/>We respect your privacy. We do not sell, rent, or trade your personal data to third parties. We may only disclose information if required by law or to protect the safety and security of our platform and its users.</p>

                  <p><strong>5. Cookies</strong><br/>We use minimal cookies and local storage to keep you logged into your session and save your basic preferences. You can choose to disable cookies through your browser settings, though this may affect your ability to stay logged in during an auction.</p>

                  <p><strong>6. Data Security</strong><br/>We implement industry-standard security measures to protect your data from unauthorized access. However, please note that no system transmitting data over the internet can be 100% secure.</p>

                  <p><strong>7. Age Policy</strong><br/>Auction Arena is intended for users aged 13 and older. Users under the age of 18 should use the platform under parental supervision.</p>

                  <p><strong>8. Your Rights</strong><br/>You retain the right to update your profile details or request the deletion of your account and associated data at any time by contacting our support team.</p>

                  <p><strong>9. Changes to This Policy</strong><br/>We reserve the right to update this Privacy Policy as our platform evolves. Any changes will be posted on this page with an updated "Effective Date."</p>

                  <p><strong>10. Contact Us</strong><br/>If you have any questions regarding this policy, please reach out to us at:<br/>📧 Email: <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support.auctionarena@gmail.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">support.auctionarena@gmail.com</a></p>
                </div>
              </div>
            )}

            {/* TERMS & CONDITIONS MODAL */}
            {activeModal === 'terms' && (
              <div>
                <h3 className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-gold mb-4 uppercase">📜 Terms & Conditions</h3>
                <div className="text-muted text-sm space-y-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                  <p><strong>Effective Date:</strong> April 2026</p>
                  <p>Welcome to Auction Arena. By accessing or using our platform, you agree to be bound by these Terms & Conditions. Please read them carefully.</p>

                  <p><strong>1. Eligibility & Acceptance</strong><br/>By using Auction Arena, you confirm that you are at least 13 years of age and that the information you provide during registration is accurate. Continued use of the platform constitutes your acceptance of these terms.</p>

                  <p><strong>2. Nature of the Platform (No Real Money)</strong><br/>Auction Arena is strictly a simulation and gaming platform designed for entertainment purposes.</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>No real money is wagered, won, or lost on this platform.</li>
                    <li>All "Purses," "Bids," and "Prices" are virtual and hold zero real-world financial value.</li>
                  </ul>

                  <p><strong>3. User Accounts & Security</strong><br/>You are responsible for maintaining the confidentiality of your login credentials. You agree not to share your account or use another person’s account. Auction Arena is not liable for any unauthorized activity on your account.</p>

                  <p><strong>4. Gameplay Rules & Fair Play</strong></p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>All auction bids placed within the system are final and cannot be reversed.</li>
                    <li>Auction results, player allocations, and timer resolutions are governed entirely by the platform's system logic.</li>
                    <li>Users are expected to maintain fair play and good sportsmanship.</li>
                  </ul>

                  <p><strong>5. Prohibited Activities</strong><br/>To maintain a healthy environment, users must NOT:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Create fake accounts to manipulate auction outcomes.</li>
                    <li>Exploit bugs, cheat, or use automated scripts/bots.</li>
                    <li>Attempt to hack, disrupt, or overload our servers.</li>
                    <li>Harass, abuse, or spam other users in the lobby or feedback forms.</li>
                  </ul>

                  <p><strong>6. Platform Rights & Enforcement</strong><br/>We reserve the right to monitor gameplay. If a user violates these terms, we may, at our sole discretion:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>Suspend or permanently ban the offending account.</li>
                    <li>Reset, cancel, or modify active auction rooms.</li>
                    <li>Update or remove game features without prior notice.</li>
                  </ul>

                  <p><strong>7. Limitation of Liability</strong><br/>Because Auction Arena is a free-to-play simulation:</p>
                  <ul className="list-disc pl-5 space-y-1">
                    <li>We bear no financial liability for any perceived "losses" in gameplay.</li>
                    <li>We are not responsible for internet disconnections, device compatibility issues, or temporary server downtimes that may interrupt an active auction.</li>
                  </ul>

                  <p><strong>8. Termination</strong><br/>We reserve the right to terminate or suspend your access to the platform at any time, for any reason, including violation of these Terms & Conditions.</p>

                  <p><strong>9. Governing Law & Jurisdiction</strong><br/>These terms shall be governed by and interpreted following the laws of India. Any disputes arising from the use of this platform shall be subject to the exclusive jurisdiction of the courts in Gunupur, Odisha.</p>

                  <p><strong>10. Contact Information</strong><br/>For any support requests or questions regarding these terms, contact us:<br/>📧 Email: <a href="https://mail.google.com/mail/?view=cm&fs=1&to=support.auctionarena@gmail.com" target="_blank" rel="noopener noreferrer" className="text-gold hover:underline">support.auctionarena@gmail.com</a></p>
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
                      <p className="text-sm text-white/80 leading-relaxed">Baharagora<br/>Jharkhand</p>
                    </div>
                    
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gold mb-1 font-bold flex items-center gap-2">
                        <span className="text-base">📞</span> CALL US
                      </div>
                      <p className="text-sm text-white/80">+91 9142473745, +91 9835656896</p>
                    </div>
                    
                    <div>
                      <div className="text-xs uppercase tracking-widest text-gold mb-1 font-bold flex items-center gap-2">
                        <span className="text-base">✉️</span> EMAIL US
                      </div>
                      <p className="text-sm text-white/80">support.auctionarena@gmail.com</p>
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