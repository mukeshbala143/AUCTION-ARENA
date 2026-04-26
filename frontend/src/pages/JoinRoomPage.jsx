import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useStore } from '../store'
import { API_BASE_URL } from '../lib/config'
import { getAccessToken } from '../lib/supabase'

export default function JoinRoomPage() {
  const [params] = useSearchParams()
  const { user } = useStore()
  const navigate = useNavigate()
  const [digits, setDigits] = useState(['','','','','',''])
  const [loading, setLoading] = useState(false)
  const [room, setRoom] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef(null)

  const code = digits.join('')

  useEffect(() => {
    const c = params.get('code')
    if (c && c.length === 6) {
      setDigits(c.toUpperCase().split(''))
      setTimeout(findRoom, 400)
    }
    setTimeout(() => inputRef.current?.focus(), 100)
  }, [])

  const handleInput = (e) => {
    const val = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'')
    const arr = val.slice(0,6).split('')
    while(arr.length < 6) arr.push('')
    setDigits(arr)
    setError(''); setRoom(null)
  }

  const findRoom = async () => {
    const c = digits.join('').trim()
    if (c.length !== 6) { setError('Please enter a 6-character room code.'); return }
    setLoading(true); setError('')
    try {
      const res = await fetch(`${API_BASE_URL}/api/rooms/${c}`)
      if (!res.ok) { setError('Room not found. Check the code and try again.'); setLoading(false); return }
      const data = await res.json()
      setRoom(data); setLoading(false)
    } catch { setError('Could not connect. Is the server running?'); setLoading(false) }
  }

  const joinRoom = async () => {
    if (!room || !user) return
    setLoading(true)
    try {
      const token = await getAccessToken()
      const res = await fetch(`${API_BASE_URL}/api/rooms/${room.code}/join`,{
        method:'POST', 
        headers:{'Content-Type':'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({ userId: user.id })
      })
      if (res.ok) {
        if (room.status === 'active' || room.status === 'paused') {
          navigate(`/auction/${room.code}`);
        } else if (room.status === 'unsold_selection') {
          navigate(`/unsold/${room.code}`);
        } else { // 'waiting'
          navigate(`/lobby/${room.code}`);
        }
      } else { 
        const d = await res.json()
        setError(d.error||'Failed to join')
        setLoading(false) 
      }
    } catch {
      setError('Could not connect to server.')
      setLoading(false)
    }
  }

  const sportIcon = { ipl:'🏏', kabaddi:'🤼', football:'⚽' }
  const sportName = { ipl:'IPL Cricket', kabaddi:'Pro Kabaddi', football:'World Football' }
  const statusColor = { waiting:'#F2A623', active:'#4CAF7D', paused:'#4CAF7D', finished:'#7A7870' }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 relative">
     

      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
      </nav>

      <div className="relative z-10 w-full max-w-md mt-16">
        
        {/* BACK BUTTON */}
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-xs font-bold tracking-[2px] uppercase text-muted hover:text-gold transition-colors mb-6 anim-1">
          <span className="text-lg leading-none">←</span> Back to Dashboard
        </Link>

        <div className="text-xs tracking-[3px] uppercase text-gold mb-3 flex items-center gap-3 anim-1">
          Join a Room<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/>
        </div>
        <h1 className="font-bebas text-5xl tracking-[3px] mb-1 anim-2">Enter the <span className="text-gold">Arena</span></h1>
        <p className="text-muted text-sm mb-8 anim-3">Enter the 6-character room code your friend shared.</p>

        {/* Code input */}
        <div className="glass p-6 mb-4 anim-3">
          <label className="text-xs tracking-[2px] uppercase text-muted block mb-4">Room Code</label>
          <div className="relative cursor-text" onClick={()=>inputRef.current?.focus()}>
            <div className="grid grid-cols-6 gap-2 mb-4">
              {digits.map((d,i)=>(
                <div key={i} className="aspect-square rounded-xl flex items-center justify-center font-mono text-2xl font-bold transition-all"
                     style={{border:`1.5px solid ${d?'rgba(242,166,35,0.5)':'rgba(255,255,255,0.08)'}`,background:d?'rgba(242,166,35,0.08)':'rgba(255,255,255,0.03)',color:d?'#F2A623':'#555'}}>
                  {d||'_'}
                </div>
              ))}
            </div>
            {/* The actual hidden input taking the keystrokes */}
            <input ref={inputRef} className="opacity-0 absolute inset-0 cursor-text w-full h-full" maxLength={6}
                   onChange={handleInput} onKeyDown={e=>e.key==='Enter'&&findRoom()}
                   value={digits.join('')} style={{caretColor:'transparent'}} autoComplete="off"/>
          </div>
          <button onClick={findRoom} disabled={code.length!==6||loading} className="btn-gold w-full justify-center">
            {loading?'Searching…':'Find Room →'}
          </button>
          {error && <p className="text-red-400 text-xs mt-3 text-center">{error}</p>}
        </div>

        {/* Room preview */}
        {room && (
          <div className="surface overflow-hidden anim-1 mt-6">
            <div className="p-5 flex items-center gap-4" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
              <div className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl flex-shrink-0"
                   style={{background:'rgba(242,166,35,0.1)',border:'0.5px solid rgba(242,166,35,0.25)'}}>
                {sportIcon[room.sport]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-mono font-bold tracking-[3px] text-gold">{room.code}</div>
                <div className="text-sm text-muted mt-0.5">{sportName[room.sport]}</div>
              </div>
              <div className="text-xs px-2.5 py-1 rounded font-bold tracking-widest uppercase"
                   style={{background:`${statusColor[room.status]}15`,color:statusColor[room.status],border:`0.5px solid ${statusColor[room.status]}50`}}>
                {room.status}
              </div>
            </div>

            <div className="p-5">
              {room.admin && (
                <div className="flex items-center gap-3 p-3 rounded-xl mb-4" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
                  <span className="text-2xl">{room.admin.avatar||'🦁'}</span>
                  <div>
                    <div className="font-semibold text-sm">{room.admin.display_name}</div>
                    <div className="text-xs text-gold">Room Admin</div>
                  </div>
                </div>
              )}

              {/* Players progress */}
              <div className="mb-4">
                <div className="flex justify-between text-xs mb-2">
                  <span className="text-muted">Players in Room</span>
                  <span className="font-bold">{room.room_teams?.length||0} / {room.max_teams||10} teams</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.07)'}}>
                  <div className="h-full rounded-full" style={{width:`${((room.room_teams?.length||0)/(room.max_teams||10))*100}%`,background:'linear-gradient(90deg,#BA7517,#F2A623)'}}/>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 mb-5">
                {[['Purse',`₹${(room.purse_lakhs||12000)/100} Cr`],['Squad',`${room.squad_limit||25} players`],['Overseas',`${room.max_overseas||8} max`],['Order',room.player_order||'Shuffled']].map(([k,v])=>(
                  <div key={k} className="p-3 rounded-xl" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
                    <div className="text-xs text-muted mb-0.5">{k}</div>
                    <div className="font-mono text-sm font-bold">{v}</div>
                  </div>
                ))}
              </div>

              {(() => {
                if (room.status === 'finished') {
                  return <div className="text-center text-muted text-sm py-3">This auction has finished. <Link to={`/squads/${code}`} className="text-gold">View Squads</Link></div>
                }
                if (room.status === 'waiting' || room.status === 'active' || room.status === 'paused' || room.status === 'unsold_selection') {
                  const isWaiting = room.status === 'waiting';
                  const isPaused = room.status === 'paused';
                  const isUnsoldSelect = room.status === 'unsold_selection';
                  return (
                    <button onClick={joinRoom} disabled={loading} className="btn-gold w-full justify-center">
                      {loading ? 'Joining…' : isWaiting ? 'Join Room & Enter Lobby →' : isUnsoldSelect ? 'Enter Unsold Round →' : isPaused ? 'Rejoin Paused Auction →' : 'Rejoin Auction →'}
                    </button>
                  )
                }
                return <div className="text-center text-muted text-sm py-3">This room is in an unknown state.</div>
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
