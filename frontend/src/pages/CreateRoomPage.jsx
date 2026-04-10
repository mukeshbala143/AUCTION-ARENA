import { useState, useEffect } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

const SPORTS = [
  { id:'ipl',      icon:'🏏', label:'IPL Cricket',   color:'#F2A623', glow:'rgba(242,166,35,0.12)', border:'rgba(242,166,35,0.4)' },
  { id:'kabaddi',  icon:'🤼', label:'Pro Kabaddi',   color:'#D85A30', glow:'rgba(216,90,48,0.12)',  border:'rgba(216,90,48,0.4)' },
  { id:'football', icon:'⚽', label:'World Football',color:'#4CAF7D', glow:'rgba(76,175,125,0.12)', border:'rgba(76,175,125,0.4)' },
]

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({length:6}, () => chars[Math.floor(Math.random()*chars.length)]).join('')
}

export default function CreateRoomPage() {
  const [params] = useSearchParams()
  const { user, profile } = useStore()
  const navigate = useNavigate()

  const [sport, setSport]       = useState(params.get('sport')||'ipl')
  const [teams, setTeams]       = useState(6)
  const [purse, setPurse]       = useState(120)
  const [squad, setSquad]       = useState(25)
  const [overseas, setOverseas] = useState(8)
  const [order, setOrder]       = useState('shuffled')
  const [roomName, setRoomName] = useState('')
  const [loading, setLoading]   = useState(false)
  const [code] = useState(genCode)

  const sc = SPORTS.find(s => s.id === sport) || SPORTS[0]

  const handleCreate = async () => {
    if (!user || !profile) return
    setLoading(true)
    const res = await fetch(`${import.meta.env.VITE_SOCKET_URL}/api/rooms`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ sport, adminId:user.id, teamName:profile?.team_name, roomName:roomName||null, code, settings:{ squadLimit:squad, purseLakhs:purse*100, maxOverseas:overseas, playerOrder:order } })
    })
    const data = await res.json()
    const roomCode = data?.room?.code || data?.code
    if (roomCode) navigate(`/lobby/${roomCode}`)
    else setLoading(false)
  }

  const copyCode = () => { navigator.clipboard.writeText(code); }

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="orb" style={{width:600,height:600,background:'rgba(242,166,35,0.07)',top:-200,right:-150}}/>
      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <Link to="/dashboard" className="text-muted text-xs no-underline hover:text-gold transition-colors">← Dashboard</Link>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 pt-24 pb-12">
        <div className="text-xs tracking-[3px] uppercase text-gold mb-2 flex items-center gap-3 anim-1">Room Configuration<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h1 className="font-bebas text-4xl sm:text-5xl tracking-[3px] mb-1 anim-2">Create Your <span className="text-gold">Auction Room</span></h1>
        <p className="text-muted text-sm mb-10 anim-3">Configure settings, share the code, and let the bidding begin. You're automatically added as Team 1.</p>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 items-start">
          {/* LEFT FORM */}
          <div className="space-y-5">
            {/* Sport selector */}
            <div className="surface p-5 sm:p-6 anim-3">
              <div className="text-xs tracking-[2px] uppercase text-muted mb-4 flex items-center gap-2">🏟️ Select Sport</div>
              {/* Responsive grid for sport selection */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {SPORTS.map(s=>(
                  <button key={s.id} onClick={()=>setSport(s.id)}
                          className="relative py-4 sm:py-5 px-4 rounded-xl transition-all text-center flex flex-row sm:flex-col items-center justify-center gap-3 sm:gap-0"
                          style={{border:sport===s.id?`0.5px solid ${s.border}`:' 0.5px solid rgba(255,255,255,0.08)',background:sport===s.id?s.glow:'rgba(255,255,255,0.02)'}}>
                    {sport===s.id&&<div className="absolute top-2 right-2 w-4 h-4 rounded-full bg-gold flex items-center justify-center text-bg text-[10px] font-bold">✓</div>}
                    <div className="text-2xl sm:text-3xl sm:mb-2">{s.icon}</div>
                    <div className="text-xs font-bold" style={{color:sport===s.id?s.color:'#7A7870'}}>{s.label}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Teams & Purse */}
            <div className="surface p-5 sm:p-6 anim-4">
              <div className="text-xs tracking-[2px] uppercase text-muted mb-4">👥 Teams & Budget</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="text-xs uppercase tracking-widest text-muted block mb-2">Number of Teams</label>
                  <select className="aa-select w-full" value={teams} onChange={e=>setTeams(+e.target.value)}>
                    {[2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n} Teams</option>)}
                  </select>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs uppercase tracking-widest text-muted">Purse per Team</label>
                    <span className="font-mono text-gold font-bold text-sm">₹{purse} Cr</span>
                  </div>
                  <input type="range" className="w-full accent-gold" min={50} max={200} step={5} value={purse} onChange={e=>setPurse(+e.target.value)}/>
                  <div className="flex justify-between text-xs text-muted mt-1"><span>₹50 Cr</span><span>₹200 Cr</span></div>
                </div>
              </div>
            </div>

            {/* Squad settings */}
            <div className="surface p-5 sm:p-6 anim-4">
              <div className="text-xs tracking-[2px] uppercase text-muted mb-4">📋 Squad Settings</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs uppercase tracking-widest text-muted">Squad Size</label>
                    <span className="font-mono text-gold font-bold text-sm">{squad} players</span>
                  </div>
                  <input type="range" className="w-full accent-gold" min={10} max={30} step={1} value={squad} onChange={e=>setSquad(+e.target.value)}/>
                  <div className="flex justify-between text-xs text-muted mt-1"><span>10</span><span>30</span></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-xs uppercase tracking-widest text-muted">Overseas Cap</label>
                    <span className="font-mono text-gold font-bold text-sm">{overseas} max</span>
                  </div>
                  <input type="range" className="w-full accent-gold" min={4} max={11} step={1} value={overseas} onChange={e=>setOverseas(+e.target.value)}/>
                  <div className="flex justify-between text-xs text-muted mt-1"><span>4</span><span>11</span></div>
                </div>
              </div>
            </div>

            {/* Player order - FIXED RESPONSIVE GRID */}
            <div className="surface p-5 sm:p-6 anim-5">
              <div className="text-xs tracking-[2px] uppercase text-muted mb-4">🔀 Player Order</div>
              {/* grid-cols-1 for mobile, sm:grid-cols-2 for tablets/desktops */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[['shuffled','🎲','Shuffled (Random)','All players randomised at auction start. Maximum unpredictability.'],
                  ['serial','📋','Serial (By Role)','Batsmen → All-Rounders → Bowlers → Keepers, sorted by price.']].map(([v,ic,title,desc])=>(
                  <button key={v} onClick={()=>setOrder(v)} className="text-left p-4 rounded-xl transition-all"
                          style={{border:order===v?'0.5px solid rgba(242,166,35,0.4)':'0.5px solid rgba(255,255,255,0.08)',background:order===v?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.02)'}}>
                    <div className="flex items-center gap-2 mb-2">
                      <div className="w-3 h-3 rounded-full border transition-all flex-shrink-0"
                           style={{borderColor:order===v?'#F2A623':'#7A7870',background:order===v?'#F2A623':'transparent'}}/>
                      <span className="text-sm font-semibold">{ic} {title}</span>
                    </div>
                    <p className="text-xs text-muted leading-relaxed sm:ml-5">{desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Room Name optional */}
            <div className="surface p-5 sm:p-6 anim-5">
              <div className="text-xs tracking-[2px] uppercase text-muted mb-4">🏷️ Room Name (Optional)</div>
              <input className="aa-input w-full" value={roomName} onChange={e=>setRoomName(e.target.value)} placeholder="e.g. Friday Night Auction, IPL Fantasy 2026…" maxLength={40}/>
              <p className="text-muted text-xs mt-2">Shown in the lobby header. Leave blank for default.</p>
            </div>
          </div>

          {/* RIGHT PREVIEW */}
          <div className="sticky top-24">
            <div className="glass p-5 sm:p-7">
              <div className="space-y-2 mb-6">
                {[
                  ['Sport', `${sc.icon} ${sc.label}`],
                  ['Teams', teams],
                  ['Purse', `₹${purse} Cr`],
                  ['Squad', `${squad} players`],
                  ['Overseas', `${overseas} max`],
                  ['Order', order==='shuffled'?'Shuffled':'Serial'],
                ].map(([k,v])=>(
                  <div key={k} className="flex justify-between items-center py-2 px-3 rounded-lg" style={{background:'rgba(255,255,255,0.03)'}}>
                    <span className="text-xs text-muted">{k}</span>
                    <span className="font-mono text-xs font-bold">{v}</span>
                  </div>
                ))}
              </div>

              <button onClick={handleCreate} disabled={loading} className="btn-gold w-full justify-center">
                {loading ? '⏳ Creating…' : '🔨 Create Room & Enter Lobby →'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}