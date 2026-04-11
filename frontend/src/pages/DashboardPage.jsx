import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase, signOut } from '../lib/supabase'
import { useStore } from '../store'
import AppFooter from '../components/AppFooter'

const SPORTS = [
  { id:'ipl', icon:'🏏', name:'IPL Cricket', full:'Indian Premier League', isComingSoon:false, color:'#F2A623', glow:'rgba(242,166,35,0.12)', border:'rgba(242,166,35,0.35)', stats:[['350','Players'],['₹120Cr','Purse'],['8','Overseas']] },
  { id:'kabaddi', icon:'🤼', name:'Pro Kabaddi', full:'Pro Kabaddi League', isComingSoon:true, color:'#D85A30', glow:'rgba(216,90,48,0.12)', border:'rgba(216,90,48,0.35)', stats:[['200+','Players'],['₹4Cr','Purse'],['3','Roles']] },
  { id:'football', icon:'⚽', name:'World Football', full:'World Football', isComingSoon:true, color:'#4CAF7D', glow:'rgba(76,175,125,0.12)', border:'rgba(76,175,125,0.35)', stats:[['500+','Players'],['₹200M','Budget'],['10','Positions']] },
]
const SC = { waiting:{bg:'rgba(242,166,35,0.1)',c:'#F2A623',l:'Waiting'}, active:{bg:'rgba(76,175,125,0.1)',c:'#4CAF7D',l:'Live'}, finished:{bg:'rgba(255,255,255,0.05)',c:'#7A7870',l:'Finished'} }

// Aapki Nayi Web3Forms Key
const WEB3FORMS_ACCESS_KEY = "5a7d81b6-3b40-470d-bf3c-8b4e3be462f3";

export default function DashboardPage() {
  const { user, profile, setProfile } = useStore()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [rooms, setRooms] = useState([])
  const [quickStats, setQuickStats] = useState([
    ['0', 'Auctions Played'],
    ['0', 'Finished Rooms'],
    ['0', 'Active Rooms'],
    ['0', 'Players Bought'],
  ])
  const [greeting, setGreeting] = useState('Good Evening')

  // States for Modal and Feedbacks
  const [activeModal, setActiveModal] = useState(null)
  const [feedbacks, setFeedbacks] = useState([]) 
  const [newFeedback, setNewFeedback] = useState('')

  // States for Form Submissions & Popups
  const [isSubmittingContact, setIsSubmittingContact] = useState(false)
  const [showContactThankYou, setShowContactThankYou] = useState(false)
  
  const [isSubmittingFeedback, setIsSubmittingFeedback] = useState(false)
  const [showFeedbackThankYou, setShowFeedbackThankYou] = useState(false)

  const handleLogout = async () => {
    await signOut();
    navigate('/');
  };

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening')
  }, [])

  useEffect(() => {
    const modal = searchParams.get('modal')
    if (modal === 'privacy' || modal === 'terms' || modal === 'contact') {
      setActiveModal(modal)
    }
  }, [searchParams])

  useEffect(() => {
    if (!user) return
    if (!profile) {
      supabase.from('users').select('*').eq('id', user.id).single().then(({ data }) => { if (data) setProfile(data) })
    }

    // Fetch user's recent rooms
    supabase.from('room_teams').select('room_id,rooms(code,sport,status,created_at,room_name)')
      .eq('user_id', user.id).order('joined_at',{ascending:false}).limit(5)
      .then(({ data }) => setRooms(data||[]))

    // Fetch real dashboard stats
    supabase
      .from('room_teams')
      .select('id,squad_count,rooms(status)')
      .eq('user_id', user.id)
      .then((teamsRes) => {
      const teams = teamsRes.data || []
      const played = teams.length
      const finished = teams.filter((t) => t.rooms?.status === 'finished').length
      const active = teams.filter((t) => t.rooms?.status === 'active' || t.rooms?.status === 'unsold_round').length
      const bought = teams.reduce((sum, t) => sum + (t.squad_count || 0), 0)

      setQuickStats([
        [played.toLocaleString(), 'Auctions Played'],
        [finished.toLocaleString(), 'Finished Rooms'],
        [active.toLocaleString(), 'Active Rooms'],
        [bought.toLocaleString(), 'Players Bought'],
      ])
    })

    // Fetch last 5 feedbacks from Database
    fetchFeedbacks()
  }, [user, profile, setProfile])

  const fetchFeedbacks = async () => {
    const { data, error } = await supabase
      .from('feedbacks')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(5)
    
    if (data) setFeedbacks(data)
  }

  const sColor = { ipl:'#F2A623', kabaddi:'#D85A30', football:'#4CAF7D' }

  // 1. Handle Feedback Submit (Save to DB AND Send Email with Thank You Popup)
  const handleFeedbackSubmit = async (e) => {
    e.preventDefault()
    if (!newFeedback.trim()) return

    setIsSubmittingFeedback(true)
    const userName = profile?.display_name || 'Anonymous'
    const textToSubmit = newFeedback

    // Insert into Supabase 'feedbacks' table
    const { error } = await supabase
      .from('feedbacks')
      .insert([{ user_name: userName, text: textToSubmit }])

    if (!error) {
       // Optimistic UI Update
       const newEntry = { id: Date.now(), user_name: userName, text: textToSubmit }
       setFeedbacks(prev => [newEntry, ...prev].slice(0, 5))
       setNewFeedback('')
    } else {
      console.error("Error saving feedback:", error)
      fetchFeedbacks()
    }

    // Background Email Notification for Feedback
    try {
      const formData = new FormData()
      formData.append("access_key", WEB3FORMS_ACCESS_KEY)
      formData.append("subject", "📢 New Feedback Received on Auction Arena!")
      formData.append("from_name", "Auction Arena System")
      formData.append("message", `User: ${userName}\nFeedback: ${textToSubmit}`)

      await fetch("https://api.web3forms.com/submit", {
        method: "POST",
        body: formData
      })
    } catch (emailErr) {
      console.error("Error sending feedback email:", emailErr)
    }

    setIsSubmittingFeedback(false)
    setShowFeedbackThankYou(true)

    // Hide Feedback "Thank You" after 2.5 seconds
    setTimeout(() => {
      setShowFeedbackThankYou(false)
    }, 2500)
  }

  // 2. Handle Contact Form Submit
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
    <div className="min-h-screen bg-bg relative overflow-hidden flex flex-col">
      <style>{`
        @keyframes scrollX {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
        }
        @keyframes comingSoonBlink {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 rgba(216,90,48,0); }
          50% { opacity: 0.35; box-shadow: 0 0 18px rgba(216,90,48,0.45); }
        }
        .animate-marquee {
          display: inline-flex;
          white-space: nowrap;
          animation: scrollX 25s linear infinite;
        }
        .animate-marquee:hover {
          animation-play-state: paused;
        }
        .custom-scrollbar::-webkit-scrollbar {
          width: 6px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: rgba(255, 255, 255, 0.02);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background: rgba(255, 255, 255, 0.1);
          border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background: rgba(255, 255, 255, 0.2);
        }
        .coming-soon-badge {
          animation: comingSoonBlink 1.2s ease-in-out infinite;
        }
      `}</style>

      {/* FEEDBACK SUCCESS POPUP (Global Overlay) */}
      {showFeedbackThankYou && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.6)', backdropFilter:'blur(5px)'}}>
          <div className="flex flex-col items-center justify-center p-8 rounded-2xl transform transition-all scale-100 opacity-100" 
               style={{
                 background: 'rgba(255, 255, 255, 0.08)', 
                 backdropFilter: 'blur(20px)', 
                 border: '1px solid rgba(255, 255, 255, 0.15)',
                 boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.4)',
                 maxWidth: '400px',
                 width: '100%'
               }}>
            <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background: 'rgba(242, 166, 35, 0.15)', border: '1px solid rgba(242, 166, 35, 0.3)'}}>
              <span className="text-3xl">⭐</span>
            </div>
            <h4 className="font-bebas text-3xl tracking-[2px] text-white mb-2">Feedback Sent!</h4>
            <p className="text-sm text-muted text-center leading-relaxed">Thank you for helping us improve Auction Arena.</p>
          </div>
        </div>
      )}

      <div className="orb" style={{width:600,height:600,background:'rgba(242,166,35,0.07)',top:-180,right:-150}}/>
      <div className="orb" style={{width:500,height:500,background:'rgba(216,90,48,0.05)',bottom:'5%',left:-160}}/>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-6 md:px-8 py-3 sm:py-4 flex items-center justify-between gap-2" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-lg sm:text-xl md:text-2xl tracking-[2px] sm:tracking-[4px] text-gold whitespace-nowrap">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          {profile&&(
            <div className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-full min-w-0" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
              <span className="text-lg sm:text-xl shrink-0">{profile.avatar_url||'🦁'}</span>
              <div className="leading-none hidden sm:block min-w-0">
                <div className="text-xs md:text-sm font-semibold text-white truncate max-w-[130px] md:max-w-[180px]">{profile.display_name}</div>
                <div className="text-[10px] md:text-xs text-gold mt-0.5 truncate max-w-[130px] md:max-w-[180px]">{profile.team_name}</div>
              </div>
            </div>
          )}
          <button onClick={handleLogout} className="text-[11px] sm:text-xs text-muted hover:text-crimson transition-colors px-2.5 sm:px-3 py-1.5 sm:py-2 rounded-lg whitespace-nowrap" style={{border:'0.5px solid rgba(255,255,255,0.07)'}}>Logout</button>
        </div>
      </nav>

      {/* MAIN CONTENT AREA */}
      <div className="relative z-10 w-full max-w-7xl mx-auto px-4 sm:px-6 md:px-8 pt-20 sm:pt-24 pb-10 sm:pb-12 flex-1">
        {/* GREETING */}
        <div className="mb-8 sm:mb-10 anim-1">
          <div className="text-xs tracking-[2px] uppercase text-gold mb-1">{greeting}</div>
          <h1 className="font-bebas text-3xl sm:text-4xl md:text-5xl tracking-[2px] sm:tracking-[3px] leading-none mb-1">Welcome back, <span className="text-gold">{profile?.display_name||'Champion'}</span></h1>
          <p className="text-muted text-xs sm:text-sm">Team <strong className="text-white">{profile?.team_name}</strong> is ready. Choose an arena below.</p>
        </div>

        {/* QUICK STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 anim-2">
          {quickStats.map(([v,l])=>(
            <div key={l} className="surface p-4 sm:p-5 text-center">
              <div className="font-bebas text-2xl sm:text-3xl tracking-[2px] text-gold">{v}</div>
              <div className="text-[10px] sm:text-xs text-muted tracking-widest uppercase mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* SPORT CARDS */}
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">Pick Your Arena<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h2 className="font-bebas text-3xl sm:text-4xl tracking-[2px] sm:tracking-[3px] mb-6 sm:mb-8">Select a Sport</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14 anim-3">
          {SPORTS.map(s=>{
            const isDisabled = s.isComingSoon
            return (
            <div key={s.id}
                 role="button"
                 tabIndex={isDisabled ? -1 : 0}
                 aria-disabled={isDisabled}
                 onClick={() => {
                   if (!isDisabled) navigate(`/create-room?sport=${s.id}`)
                 }}
                 onKeyDown={(e) => {
                   if (isDisabled) return
                   if (e.key === 'Enter' || e.key === ' ') {
                     e.preventDefault()
                     navigate(`/create-room?sport=${s.id}`)
                   }
                 }}
                 className="group relative rounded-2xl overflow-hidden transition-all duration-300"
                 style={{background:'#13131f',border:`0.5px solid rgba(255,255,255,0.08)`,minHeight:340,cursor:isDisabled?'not-allowed':'pointer',opacity:isDisabled?0.78:1}}
                 onMouseEnter={e=>{if(!isDisabled){e.currentTarget.style.border=`0.5px solid ${s.border}`;e.currentTarget.style.transform='translateY(-6px)';e.currentTarget.style.boxShadow=`0 20px 60px rgba(0,0,0,0.5),0 0 50px ${s.glow}`}}}
                 onMouseLeave={e=>{e.currentTarget.style.border='0.5px solid rgba(255,255,255,0.08)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none'}}>
              {isDisabled && (
                <div className="absolute top-4 right-4 z-20 text-[10px] tracking-[2px] uppercase font-bold px-2.5 py-1 rounded-md coming-soon-badge"
                     style={{background:'rgba(216,90,48,0.16)',color:'#ffb89f',border:'0.5px solid rgba(216,90,48,0.5)'}}>
                  Coming Soon
                </div>
              )}
              {isDisabled && (
                <div className="absolute inset-0 z-10 pointer-events-none" style={{background:'linear-gradient(180deg, rgba(7,7,14,0.08) 0%, rgba(7,7,14,0.45) 100%)'}} />
              )}
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{background:`radial-gradient(ellipse at 80% 10%,${s.glow},transparent 60%)`}}/>
              <div className="absolute top-4 right-6 font-bebas text-7xl opacity-[0.05] text-white pointer-events-none leading-none">{s.icon}</div>
              <div className="relative z-10 p-5 sm:p-7 flex flex-col h-full">
                <span className="text-4xl mb-4 block">{s.icon}</span>
                <span className="text-xs tracking-[2px] uppercase font-bold px-2 py-1 rounded mb-3 w-fit" style={{background:s.glow,color:s.color,border:`0.5px solid ${s.border}`}}>{s.name}</span>
                <span className="text-[10px] tracking-[2px] uppercase font-bold px-2 py-1 rounded mb-3 w-fit"
                      style={{background:isDisabled?'rgba(216,90,48,0.1)':'rgba(76,175,125,0.1)',color:isDisabled?'#ffb89f':'#4CAF7D',border:isDisabled?'0.5px solid rgba(216,90,48,0.35)':'0.5px solid rgba(76,175,125,0.25)'}}>
                  {isDisabled ? 'Coming Soon' : 'Live Now'}
                </span>
                <h3 className="font-bebas text-xl sm:text-2xl tracking-[2px] mb-3">{s.full}</h3>
                <div className="flex gap-4 mt-auto pt-4 mb-4" style={{borderTop:'0.5px solid rgba(255,255,255,0.07)'}}>
                  {s.stats.map(([v,l])=>(
                    <div key={l}>
                      <div className="font-mono text-sm font-bold" style={{color:s.color}}>{v}</div>
                      <div className="text-muted text-xs uppercase tracking-wide">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  {isDisabled ? (
                    <div className="flex-1 py-2.5 rounded-lg text-center text-[11px] sm:text-xs font-bold tracking-wide sm:tracking-widest uppercase"
                         style={{background:'rgba(255,255,255,0.06)',color:'#7A7870',border:'0.5px solid rgba(255,255,255,0.1)'}}>
                      Coming Soon
                    </div>
                  ) : (
                    <Link to={`/create-room?sport=${s.id}`} onClick={(e) => e.stopPropagation()} className="flex-1 py-2.5 rounded-lg text-center text-[11px] sm:text-xs font-bold tracking-wide sm:tracking-widest uppercase no-underline transition-all hover:brightness-110" style={{background:s.color,color:'#07070e'}}>Create Room</Link>
                  )}
                  <Link to="/join" onClick={(e) => e.stopPropagation()} className="flex-1 py-2.5 rounded-lg text-center text-[11px] sm:text-xs font-semibold text-muted hover:text-white transition-colors no-underline" style={{border:'0.5px solid rgba(255,255,255,0.1)',background:'transparent'}}>Join Room</Link>
                </div>
              </div>
            </div>
          )})}
        </div>

        {/* RECENT ROOMS */}
        <div className="anim-4 mb-16">
          <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">History<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
          <h2 className="font-bebas text-2xl sm:text-3xl tracking-[2px] sm:tracking-[3px] mb-5">Your Recent Rooms</h2>
          <div className="surface overflow-hidden hidden md:block">
            <div className="grid gap-0" style={{gridTemplateColumns:'1fr 90px 90px 100px 130px'}}>
              {['Room Code','Sport','Teams','Status','Action'].map(h=>(
                <div key={h} className="px-5 py-3 text-xs tracking-widest uppercase text-muted" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>{h}</div>
              ))}
            </div>
            {rooms.length === 0 && (
              <div className="py-12 text-center text-muted text-sm">
                <div className="text-3xl mb-3">🏟️</div>
                <p>No rooms yet. Create one above to get started!</p>
              </div>
            )}
            {rooms.map((r, i) => {
              const room = r.rooms; if (!room) return null
              const sc = SC[room.status]||SC.waiting
              return (
                <div key={i} className="grid cursor-pointer transition-colors" style={{gridTemplateColumns:'1fr 90px 90px 100px 130px',borderBottom:'0.5px solid rgba(255,255,255,0.05)'}}
                     onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.02)'}
                     onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                  <div className="px-5 py-4 flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full" style={{background:sColor[room.sport]||'#888'}}/>
                    <span className="font-mono font-bold tracking-[2px]">{room.code}</span>
                  </div>
                  <div className="px-3 py-4 text-sm text-muted capitalize">{room.sport==='ipl'?'IPL':room.sport==='kabaddi'?'Kabaddi':'Football'}</div>
                  <div className="px-3 py-4 text-sm">—</div>
                  <div className="px-3 py-4">
                    <span className="text-xs px-2 py-1 rounded font-bold tracking-widest uppercase" style={{background:sc.bg,color:sc.c}}>{sc.l}</span>
                  </div>
                  <div className="px-3 py-4">
                    <Link to={room.status==='finished'?`/squads/${room.code}`:room.status==='active'||room.status==='unsold_round'?`/auction/${room.code}`:`/lobby/${room.code}`}
                          className="text-xs text-gold font-bold no-underline hover:text-yellow-300 transition-colors whitespace-nowrap">
                      {room.status==='finished'?'View Squads →':room.status==='active'||room.status==='unsold_round'?'Rejoin Auction →':'Rejoin →'}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="md:hidden space-y-3">
            {rooms.length === 0 && (
              <div className="surface py-10 text-center text-muted text-sm">
                <div className="text-3xl mb-3">🏟️</div>
                <p>No rooms yet. Create one above to get started!</p>
              </div>
            )}
            {rooms.map((r, i) => {
              const room = r.rooms; if (!room) return null
              const sc = SC[room.status] || SC.waiting
              return (
                <div key={i} className="surface p-4">
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shrink-0" style={{background:sColor[room.sport]||'#888'}}/>
                        <span className="font-mono font-bold tracking-[2px] text-sm">{room.code}</span>
                      </div>
                      <div className="text-xs text-muted mt-1 capitalize">{room.sport==='ipl'?'IPL':room.sport==='kabaddi'?'Kabaddi':'Football'}</div>
                    </div>
                    <span className="text-[10px] px-2 py-1 rounded font-bold tracking-widest uppercase shrink-0" style={{background:sc.bg,color:sc.c}}>{sc.l}</span>
                  </div>
                  <Link
                    to={room.status==='finished'?`/squads/${room.code}`:room.status==='active'||room.status==='unsold_round'?`/auction/${room.code}`:`/lobby/${room.code}`}
                    className="block w-full text-center text-xs font-bold no-underline rounded-lg px-3 py-2 whitespace-nowrap"
                    style={{background:'rgba(242,166,35,0.12)', border:'0.5px solid rgba(242,166,35,0.4)', color:'#F2A623'}}
                  >
                    {room.status==='finished'?'View Squads →':room.status==='active'||room.status==='unsold_round'?'Rejoin Auction →':'Rejoin →'}
                  </Link>
                </div>
              )
            })}
          </div>
        </div>

        {/* FEEDBACK SECTION */}
        <div className="relative z-10 w-full mt-12 sm:mt-16 mb-8 flex flex-col items-center">
          <h3 className="font-bebas text-2xl tracking-[3px] text-gold mb-4 uppercase">Share Your Experience</h3>
          <div className="w-full max-w-2xl px-4 sm:px-4"> 
            {/* ✅ FORM CLASSES CHANGED: items-stretch to items-center */}
            <form onSubmit={handleFeedbackSubmit} className="flex flex-col sm:flex-row items-center gap-3 w-full">
              <input 
                type="text" 
                placeholder="Give us your feedback..." 
                value={newFeedback}
                onChange={(e) => setNewFeedback(e.target.value)}
                disabled={isSubmittingFeedback}
                /* ✅ INPUT CLASS CHANGED: w-full added to explicitly keep it full width */
                className="w-full sm:flex-1 px-4 sm:px-6 py-3 text-sm sm:text-base text-white rounded-xl outline-none transition-all shadow-md focus:border-gold disabled:opacity-50"
                style={{background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.12)'}}
              />
              {/* ✅ BUTTON CLASS CHANGED: w-auto added instead of w-full */}
              <button type="submit" disabled={isSubmittingFeedback} className="w-auto px-8 sm:px-8 py-3 text-xs sm:text-sm font-bold uppercase tracking-widest rounded-xl transition-all shadow-md hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={{background:'linear-gradient(135deg, #F2A623, #D85A30)', color:'#07070e'}}>
                {isSubmittingFeedback ? '⏳ Sending...' : 'Send Feedback'}
              </button>
            </form>
          </div>
        </div>

      </div>

      {/* FEEDBACK MARQUEE (SCROLLING TICKER) */}
      {feedbacks.length > 0 && (
        <div className="relative z-10 w-full overflow-hidden flex items-center py-3 sm:py-4 mt-auto" style={{borderTop:'1px solid rgba(255,255,255,0.04)', borderBottom:'1px solid rgba(255,255,255,0.04)', background:'rgba(0,0,0,0.4)'}}>
          <div className="animate-marquee gap-12 flex">
            {feedbacks.map((fb, idx) => (
              <span key={`${fb.id}-${idx}`} className="text-sm sm:text-base">
                <span className="text-gold font-bold">{fb.user_name}:</span> <span className="text-white/80">{fb.text}</span>
              </span>
            ))}
            {feedbacks.map((fb, idx) => (
              <span key={`dup-${fb.id}-${idx}`} className="text-sm sm:text-base">
                <span className="text-gold font-bold">{fb.user_name}:</span> <span className="text-white/80">{fb.text}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      <AppFooter />

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
                      <div className="flex flex-col items-center justify-center p-8 rounded-2xl transform transition-all scale-100 opacity-100" 
                           style={{
                             background: 'rgba(255, 255, 255, 0.05)', 
                             backdropFilter: 'blur(20px)', 
                             border: '1px solid rgba(255, 255, 255, 0.15)',
                             boxShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.3)',
                             maxWidth: '85%'
                           }}>
                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-4" style={{background: 'rgba(76, 175, 125, 0.15)', border: '1px solid rgba(76, 175, 125, 0.3)'}}>
                          <svg className="w-8 h-8 text-[#4CAF7D]" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        </div>
                        <h4 className="font-bebas text-3xl tracking-[2px] text-white mb-2">Thank You!</h4>
                        <p className="text-sm text-muted text-center leading-relaxed">Your message has been successfully sent.</p>
                      </div>
                    </div>
                  )}

                  <form onSubmit={handleContactSubmit} className="space-y-4">
                    
                    <input type="hidden" name="access_key" value={WEB3FORMS_ACCESS_KEY} />
                    <input type="hidden" name="subject" value="New Contact Message from Auction Arena!" />
                    <input type="hidden" name="from_name" value="Auction Arena Contact Form" />

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Your Name</label>
                      <input type="text" name="name" required placeholder="ABC" className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Email Address</label>
                      <input type="email" name="email" required placeholder="abc@example.com" className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Subject</label>
                      <input type="text" name="subject_user" required placeholder="Project Collaboration / Job Offer / Hi!" className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Message</label>
                      <textarea name="message" rows="3" required placeholder="Tell me about your project or opportunity..." className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold resize-none custom-scrollbar" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}}></textarea>
                    </div>
                    
                    <button type="submit" disabled={isSubmittingContact} className="w-full flex justify-center items-center gap-2 py-3.5 mt-2 rounded-lg text-sm font-bold tracking-[2px] uppercase transition-all hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed" style={{background:'#F2A623',color:'#07070e'}}>
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
