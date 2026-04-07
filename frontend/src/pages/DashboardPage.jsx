import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase, signOut } from '../lib/supabase'
import { useStore } from '../store'

const SPORTS = [
  { id:'ipl', icon:'🏏', name:'IPL Cricket', full:'Indian Premier League', color:'#F2A623', glow:'rgba(242,166,35,0.12)', border:'rgba(242,166,35,0.35)', stats:[['350','Players'],['₹120Cr','Purse'],['8','Overseas']] },
  { id:'kabaddi', icon:'🤼', name:'Pro Kabaddi', full:'Pro Kabaddi League', color:'#D85A30', glow:'rgba(216,90,48,0.12)', border:'rgba(216,90,48,0.35)', stats:[['200+','Players'],['₹4Cr','Purse'],['3','Roles']] },
  { id:'football', icon:'⚽', name:'World Football', full:'World Football', color:'#4CAF7D', glow:'rgba(76,175,125,0.12)', border:'rgba(76,175,125,0.35)', stats:[['500+','Players'],['€200M','Budget'],['10','Positions']] },
]
const SC = { waiting:{bg:'rgba(242,166,35,0.1)',c:'#F2A623',l:'Waiting'}, active:{bg:'rgba(76,175,125,0.1)',c:'#4CAF7D',l:'Live'}, finished:{bg:'rgba(255,255,255,0.05)',c:'#7A7870',l:'Finished'} }

// Mock Feedback Data (Last 5)
const INITIAL_FEEDBACKS = [
  { id: 1, user: "Rahul", text: "Amazing platform for IPL auctions! 🔥" },
  { id: 2, user: "Sneha", text: "Very smooth UI. Love it." },
  { id: 3, user: "Amit", text: "Can't wait to play the Kabaddi arenas." },
  { id: 4, user: "Vikram", text: "Best auction simulator out there." },
  { id: 5, user: "Priya", text: "Needs more football players, but great effort!" }
];

export default function DashboardPage() {
  const { user, profile, setProfile } = useStore()
  const navigate = useNavigate()
  const [rooms, setRooms] = useState([])
  const [greeting, setGreeting] = useState('Good Evening')

  // States for Modal and Feedbacks
  const [activeModal, setActiveModal] = useState(null) // 'privacy', 'terms', 'contact'
  const [feedbacks, setFeedbacks] = useState(INITIAL_FEEDBACKS)
  const [newFeedback, setNewFeedback] = useState('')

  useEffect(() => {
    const h = new Date().getHours()
    setGreeting(h<12?'Good Morning':h<17?'Good Afternoon':'Good Evening')
  }, [])

  useEffect(() => {
    if (!user) return
    if (!profile) {
      supabase.from('users').select('*').eq('id', user.id).single().then(({ data }) => { if (data) setProfile(data) })
    }
    supabase.from('room_teams').select('room_id,rooms(code,sport,status,created_at,room_name)')
      .eq('user_id', user.id).order('joined_at',{ascending:false}).limit(5)
      .then(({ data }) => setRooms(data||[]))
  }, [user])

  const sColor = { ipl:'#F2A623', kabaddi:'#D85A30', football:'#4CAF7D' }

  // Handle Feedback Submit
  const handleFeedbackSubmit = (e) => {
    e.preventDefault()
    if (!newFeedback.trim()) return
    const newEntry = {
      id: Date.now(),
      user: profile?.display_name || 'Anonymous',
      text: newFeedback
    }
    // Update local state (keep last 5)
    setFeedbacks(prev => [newEntry, ...prev].slice(0, 5))
    setNewFeedback('')
  }

  return (
    <div className="min-h-screen bg-bg relative overflow-hidden">
      {/* Inline styles for Marquee Animation */}
      <style>{`
        @keyframes scrollX {
          0% { transform: translateX(100vw); }
          100% { transform: translateX(-100%); }
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
      `}</style>

      <div className="orb" style={{width:600,height:600,background:'rgba(242,166,35,0.07)',top:-180,right:-150}}/>
      <div className="orb" style={{width:500,height:500,background:'rgba(216,90,48,0.05)',bottom:'5%',left:-160}}/>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex items-center gap-3">
          {profile&&(
            <div className="flex items-center gap-2 px-3 py-2 rounded-full" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
              <span className="text-xl">{profile.avatar_url||'🦁'}</span>
              <div className="leading-none">
                <div className="text-sm font-semibold text-white">{profile.display_name}</div>
                <div className="text-xs text-gold mt-0.5">{profile.team_name}</div>
              </div>
            </div>
          )}
          <button onClick={()=>{signOut();navigate('/login')}} className="text-xs text-muted hover:text-crimson transition-colors px-3 py-2 rounded-lg" style={{border:'0.5px solid rgba(255,255,255,0.07)'}}>Logout</button>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto px-8 pt-24 pb-12">
        {/* GREETING */}
        <div className="mb-10 anim-1">
          <div className="text-xs tracking-[2px] uppercase text-gold mb-1">{greeting}</div>
          <h1 className="font-bebas text-5xl tracking-[3px] leading-none mb-1">Welcome back, <span className="text-gold">{profile?.display_name||'Champion'}</span></h1>
          <p className="text-muted text-sm">Team <strong className="text-white">{profile?.team_name}</strong> is ready. Choose an arena below.</p>
        </div>

        {/* QUICK STATS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-12 anim-2">
          {[['3','Auctions Played'],['1','Auctions Won'],['0','Active Rooms'],['47','Players Bought']].map(([v,l])=>(
            <div key={l} className="surface p-5">
              <div className="font-bebas text-3xl tracking-[2px] text-gold">{v}</div>
              <div className="text-xs text-muted tracking-widest uppercase mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* SPORT CARDS */}
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">Pick Your Arena<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h2 className="font-bebas text-4xl tracking-[3px] mb-8">Select a Sport</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-14 anim-3">
          {SPORTS.map(s=>(
            <div key={s.id} className="group relative rounded-2xl overflow-hidden transition-all duration-300 cursor-pointer" style={{background:'#13131f',border:`0.5px solid rgba(255,255,255,0.08)`,minHeight:340}}
                 onMouseEnter={e=>{e.currentTarget.style.border=`0.5px solid ${s.border}`;e.currentTarget.style.transform='translateY(-6px)';e.currentTarget.style.boxShadow=`0 20px 60px rgba(0,0,0,0.5),0 0 50px ${s.glow}`}}
                 onMouseLeave={e=>{e.currentTarget.style.border='0.5px solid rgba(255,255,255,0.08)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none'}}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" style={{background:`radial-gradient(ellipse at 80% 10%,${s.glow},transparent 60%)`}}/>
              <div className="absolute top-4 right-6 font-bebas text-7xl opacity-[0.05] text-white pointer-events-none leading-none">{s.icon}</div>
              <div className="relative z-10 p-7 flex flex-col h-full">
                <span className="text-4xl mb-4 block">{s.icon}</span>
                <span className="text-xs tracking-[2px] uppercase font-bold px-2 py-1 rounded mb-3 w-fit" style={{background:s.glow,color:s.color,border:`0.5px solid ${s.border}`}}>{s.name}</span>
                <h3 className="font-bebas text-2xl tracking-[2px] mb-3">{s.full}</h3>
                <div className="flex gap-4 mt-auto pt-4 mb-4" style={{borderTop:'0.5px solid rgba(255,255,255,0.07)'}}>
                  {s.stats.map(([v,l])=>(
                    <div key={l}>
                      <div className="font-mono text-sm font-bold" style={{color:s.color}}>{v}</div>
                      <div className="text-muted text-xs uppercase tracking-wide">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <Link to={`/create-room?sport=${s.id}`} className="flex-1 py-2.5 rounded-lg text-center text-xs font-bold tracking-widest uppercase no-underline transition-all hover:brightness-110" style={{background:s.color,color:'#07070e'}}>Create Room</Link>
                  <Link to="/join" className="flex-1 py-2.5 rounded-lg text-center text-xs font-semibold text-muted hover:text-white transition-colors no-underline" style={{border:'0.5px solid rgba(255,255,255,0.1)',background:'transparent'}}>Join Room</Link>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* RECENT ROOMS */}
        <div className="anim-4 mb-16">
          <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">History<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
          <h2 className="font-bebas text-3xl tracking-[3px] mb-5">Your Recent Rooms</h2>
          <div className="surface overflow-hidden">
            <div className="grid gap-0" style={{gridTemplateColumns:'1fr 90px 90px 110px 120px'}}>
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
                <div key={i} className="grid cursor-pointer transition-colors" style={{gridTemplateColumns:'1fr 90px 90px 110px 120px',borderBottom:'0.5px solid rgba(255,255,255,0.05)'}}
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
                    <Link to={room.status==='finished'?`/squads/${room.code}`:`/lobby/${room.code}`}
                          className="text-xs text-gold font-bold no-underline hover:text-yellow-300 transition-colors">
                      {room.status==='finished'?'View Squads →':'Rejoin →'}
                    </Link>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* FEEDBACK SECTION */}
      <div className="relative z-10 w-full mb-6">
        <div className="max-w-7xl mx-auto px-8 mb-4">
          <form onSubmit={handleFeedbackSubmit} className="flex items-center gap-3 w-full max-w-lg">
            <input 
              type="text" 
              placeholder="Give us your feedback..." 
              value={newFeedback}
              onChange={(e) => setNewFeedback(e.target.value)}
              className="flex-1 px-4 py-2 text-sm text-white rounded-lg outline-none transition-colors"
              style={{background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)'}}
            />
            <button type="submit" className="px-5 py-2 text-xs font-bold uppercase tracking-widest rounded-lg transition-colors hover:bg-gold hover:text-black" style={{background:'rgba(242,166,35,0.15)', color:'#F2A623', border:'0.5px solid rgba(242,166,35,0.3)'}}>
              Send
            </button>
          </form>
        </div>

        {/* FEEDBACK MARQUEE (SCROLLING TICKER) */}
        <div className="w-full overflow-hidden flex items-center py-3" style={{borderTop:'0.5px solid rgba(255,255,255,0.05)', borderBottom:'0.5px solid rgba(255,255,255,0.05)', background:'rgba(0,0,0,0.2)'}}>
          <div className="animate-marquee gap-10 flex">
            {feedbacks.map((fb, idx) => (
              <span key={`${fb.id}-${idx}`} className="text-sm">
                <span className="text-gold font-bold">{fb.user}:</span> <span className="text-muted">{fb.text}</span>
              </span>
            ))}
            {/* Duplicating for infinite seamless loop effect */}
             {feedbacks.map((fb, idx) => (
              <span key={`dup-${fb.id}-${idx}`} className="text-sm">
                <span className="text-gold font-bold">{fb.user}:</span> <span className="text-muted">{fb.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <footer className="relative z-10 px-10 py-6 flex items-center justify-between flex-wrap gap-4">
        <span className="font-bebas text-xl tracking-[4px] text-gold">AUCTION ARENA</span>
        <span className="text-muted text-xs">© 2026 Auction Arena · All rights reserved</span>
        <div className="flex gap-6">
          <button onClick={() => setActiveModal('privacy')} className="text-muted text-xs hover:text-gold transition-colors">Privacy</button>
          <button onClick={() => setActiveModal('terms')} className="text-muted text-xs hover:text-gold transition-colors">Terms</button>
          <button onClick={() => setActiveModal('contact')} className="text-muted text-xs hover:text-gold transition-colors">Contact</button>
        </div>
      </footer>

      {/* POPUP MODALS (Solid Dark Overlay) */}
      {activeModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)'}}>
          
          {/* Modal Container - Dark Theme */}
          <div 
            className={`relative w-full ${activeModal === 'contact' ? 'max-w-4xl' : 'max-w-lg'} rounded-xl p-8 overflow-hidden transform transition-all`} 
            style={{background:'#111118', border:'1px solid rgba(255,255,255,0.05)', boxShadow:'0 25px 50px -12px rgba(0, 0, 0, 0.8)'}}
          >
            {/* Close Button */}
            <button onClick={() => setActiveModal(null)} className="absolute top-4 right-4 text-muted hover:text-white text-2xl leading-none">&times;</button>
            
            {/* PRIVACY POLICY MODAL */}
            {activeModal === 'privacy' && (
              <div>
                <h3 className="font-bebas text-3xl tracking-[2px] text-gold mb-4 uppercase">Privacy Policy</h3>
                <div className="text-muted text-sm space-y-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                  <p>Your privacy is important to us. This policy explains how we collect, use, and protect your data.</p>
                  <p><strong>1. Data Collection:</strong> We collect only essential profile information like your display name, team name, and email for authentication via Supabase.</p>
                  <p><strong>2. Usage:</strong> Your data is solely used to maintain your session and statistics within the Auction Arena rooms.</p>
                  <p><strong>3. Protection:</strong> We do not share your personal information with third parties. All data is securely stored.</p>
                </div>
              </div>
            )}

            {/* TERMS & CONDITIONS MODAL */}
            {activeModal === 'terms' && (
              <div>
                <h3 className="font-bebas text-3xl tracking-[2px] text-gold mb-4 uppercase">Terms & Conditions</h3>
                <div className="text-muted text-sm space-y-4 h-64 overflow-y-auto pr-2 custom-scrollbar">
                  <p>By using Auction Arena, you agree to the following terms:</p>
                  <p><strong>1. Fair Play:</strong> Users are expected to maintain fair play. Abuse of the auction system or exploitation of bugs is prohibited.</p>
                  <p><strong>2. Account:</strong> You are responsible for maintaining the confidentiality of your login credentials.</p>
                  <p><strong>3. Modifications:</strong> We reserve the right to modify or terminate the service for any reason, without notice, at any time.</p>
                </div>
              </div>
            )}

            {/* CONTACT US MODAL */}
            {activeModal === 'contact' && (
              <div className="flex flex-col md:flex-row gap-10">
                
                {/* Left Side: Contact Info */}
                <div className="flex-1 flex flex-col justify-center">
                  <h3 className="font-bebas text-4xl tracking-[2px] text-gold mb-2">CONTACT US</h3>
                  <p className="text-sm text-muted mb-8 leading-relaxed">Have questions? Need support? We're here to help. Reach out to us through any channel below or use the form.</p>

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
                <div className="flex-[1.2] p-6 rounded-xl" style={{background:'rgba(255,255,255,0.02)', border:'1px solid rgba(255,255,255,0.05)'}}>
                  
                  {/* UPDATE YOUR EMAIL HERE 👇 */}
                  <form action="https://formsubmit.co/apna_email@gmail.com" method="POST" target="_blank" className="space-y-4">
                    
                    {/* Hidden inputs for FormSubmit configuration */}
                    <input type="hidden" name="_captcha" value="false" />
                    <input type="hidden" name="_template" value="table" />
                    <input type="hidden" name="_subject" value="New Contact Message from Auction Arena!" />

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
                      <input type="text" name="subject" required placeholder="Project Collaboration / Job Offer / Hi!" className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}} />
                    </div>
                    
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-[2px] text-muted mb-1.5">Message</label>
                      <textarea name="message" rows="3" required placeholder="Tell me about your project or opportunity..." className="w-full px-4 py-3 rounded-lg text-sm text-white outline-none transition-colors focus:border-gold resize-none custom-scrollbar" style={{background:'#161622', border:'1px solid rgba(255,255,255,0.08)'}}></textarea>
                    </div>
                    
                    <button type="submit" className="w-full flex justify-center items-center gap-2 py-3.5 mt-2 rounded-lg text-sm font-bold tracking-[2px] uppercase transition-all hover:brightness-110" style={{background:'#F2A623',color:'#07070e'}}>
                      <span className="text-lg">✈</span> Send Message
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