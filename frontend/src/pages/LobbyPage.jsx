import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom' 
import { getAccessToken, supabase } from '../lib/supabase'
import { getSocket } from '../lib/socket'
import { useStore } from '../store'

export default function LobbyPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useStore()
  const [room, setRoom] = useState(null)
  const [teams, setTeams] = useState([])
  const [activity, setActivity] = useState([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [myTeamId, setMyTeamId] = useState(null)
  
  // States for Edit feature
  const [isEditing, setIsEditing] = useState(false)
  const [editData, setEditData] = useState({})
  const [saving, setSaving] = useState(false)

  const addLog = (msg) => setActivity(p=>[{msg, time: new Date().toLocaleTimeString()},...p].slice(0,20))

  useEffect(() => {
    loadRoom()
    const socket = getSocket()

    const joinRoom = async () => {
      const token = await getAccessToken()
      if (!token) return
      socket.emit('room:join', { roomCode: code, userId: user?.id, token })
    }
    joinRoom()
    socket.on('connect', joinRoom)

    socket.on('lobby:teams', (newTeams) => { setTeams(newTeams); addLog(`🟢 A team joined or left the room`) })
    socket.on('lobby:ready', ({ teamId, isReady }) => {
      setTeams(p => p.map(t => t.id===teamId ? {...t, is_ready:isReady} : t))
      addLog(`✅ A team updated their ready status`)
    })
    socket.on('auction:started', () => navigate(`/auction/${code}`))
    return () => {
      socket.off('connect', joinRoom)
      socket.off('lobby:teams')
      socket.off('lobby:ready')
      socket.off('auction:started')
    }
  }, [code, user])

  const loadRoom = async () => {
    const { data } = await supabase
      .from('rooms')
      .select('*, admin:users!rooms_admin_id_fkey(display_name, avatar_url), room_teams(*, user:users(display_name,avatar_url))')
      .eq('code', code)
      .single()
      
    if (!data) return
    setRoom(data)
    setTeams(data.room_teams || [])
    setIsAdmin(data.admin_id === user?.id)
    const my = data.room_teams?.find(t=>t.user_id===user?.id)
    if (my) setMyTeamId(my.id)
    addLog(`🏟️ Room ${code} loaded`)
  }

  const toggleReady = async () => {
    const my = teams.find(t=>t.user_id===user?.id)
    if (!my) return
    const newReady = !my.is_ready
    const token = await getAccessToken()
    if (!token) return
    await supabase.from('room_teams').update({is_ready:newReady}).eq('id',my.id)
    getSocket().emit('room:ready', { roomCode: code, teamId: my.id, isReady: newReady, token })
  }

  const startAuction = async () => {
    const token = await getAccessToken()
    if (!token) return
    getSocket().emit('admin:start', { roomCode: code, userId: user?.id, token })
    addLog('🚀 Admin started the auction!')
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code).catch(()=>{})
    addLog('📋 Room code copied')
  }

  // --- EDIT LOGIC ---
  const startEditing = () => {
    setEditData({
      purse_cr: room.purse_lakhs / 100,
      squad_limit: room.squad_limit,
      max_overseas: room.max_overseas,
      player_order: room.player_order
    })
    setIsEditing(true)
  }

  const saveSettings = async () => {
    setSaving(true)
    const updates = {
      purse_lakhs: editData.purse_cr * 100,
      squad_limit: editData.squad_limit,
      max_overseas: editData.max_overseas,
      player_order: editData.player_order
    }
    
    const { error } = await supabase.from('rooms').update(updates).eq('id', room.id)
    
    if (!error) {
      setRoom({ ...room, ...updates })
      setIsEditing(false)
      addLog('⚙️ Admin updated room settings')
    } else {
      console.error("Failed to update settings", error)
      addLog('❌ Failed to update settings')
    }
    setSaving(false)
  }

  const readyCount = teams.filter(t=>t.is_ready).length
  const sportLabels = { ipl:'🏏 IPL Cricket', kabaddi:'🤼 Pro Kabaddi', football:'⚽ Football' }

  const displayRoomName = room?.room_name; 
  const actualAdminName = room?.admin?.display_name || 'Admin';

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="orb" style={{width:600,height:600,background:'rgba(242,166,35,0.07)',top:-180,right:-150}}/>
      <div className="orb" style={{width:500,height:500,background:'rgba(76,175,125,0.05)',bottom:'5%',left:-160}}/>

      {/* ✅ FIXED TOP NAVBAR FOR MOBILE (whitespace-nowrap added to profile badge) */}
      <nav className="fixed top-0 left-0 right-0 z-50 px-4 sm:px-8 py-3 sm:py-4 flex items-center justify-between gap-2" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-xl sm:text-2xl tracking-[2px] sm:tracking-[4px] text-gold shrink-0">AUCTION<span className="text-white"> ARENA</span></span>
        {profile&&(
          <div className="flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 rounded-full whitespace-nowrap shrink-0 max-w-[50vw] sm:max-w-none" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
            <span className="shrink-0">{profile.avatar_url||'🦁'}</span>
            <span className="text-xs sm:text-sm font-semibold truncate">{profile.display_name}</span>
            <span className="text-gold text-[10px] sm:text-xs shrink-0">· {profile.team_name}</span>
          </div>
        )}
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 pt-24 pb-12">
        
        {/* BACK BUTTON */}
        <Link to="/create-room" className="inline-flex items-center gap-2 text-xs font-bold tracking-[2px] uppercase text-muted hover:text-gold transition-colors mb-6 anim-1">
          <span className="text-lg leading-none">←</span> Back to Create Room
        </Link>

        {/* CODE BANNER */}
        <div className="glass p-6 mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6 anim-1">
          <div>
            {displayRoomName && (
              <h2 className="font-bebas text-3xl sm:text-4xl tracking-[2px] text-white mb-4 break-words">
                {displayRoomName}
              </h2>
            )}
            
            <div className="text-xs tracking-[2px] uppercase text-muted mb-1">Room Code</div>
            <div className="font-bebas text-5xl sm:text-6xl tracking-[10px] text-gold leading-none" style={{textShadow:'0 0 40px rgba(242,166,35,0.35)'}}>{code}</div>
            
            <div className="text-muted text-sm mt-3 flex flex-wrap items-center gap-2">
              <span>{room && sportLabels[room.sport]}</span>
              <span className="hidden sm:inline">·</span>
              <span>Created by <strong className="text-white/90 font-semibold">{actualAdminName}</strong></span>
            </div>
          </div>
          
          <div className="flex flex-row md:flex-col items-center md:items-end justify-between md:justify-center gap-4 border-t border-white/5 pt-4 md:pt-0 md:border-t-0">
            <button onClick={copyCode} className="flex items-center gap-2 px-5 py-2.5 rounded-full text-gold text-sm font-semibold transition-all hover:bg-gold/20"
                    style={{background:'rgba(242,166,35,0.1)',border:'0.5px solid rgba(242,166,35,0.3)'}}>
              📋 Copy Code
            </button>
            <div className="flex items-center gap-2 text-emerald text-xs font-bold tracking-widest uppercase">
              <span className="w-2 h-2 rounded-full bg-emerald" style={{animation:'pulse 2s infinite'}}/>
              Live Room · Waiting
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-6">
          {/* LEFT: TEAMS */}
          <div>
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs tracking-[2px] uppercase text-gold">{teams.length} Teams Joined</span>
              <span className="text-xs text-muted">{readyCount}/{teams.length} ready</span>
            </div>

            <div className="space-y-3 mb-6">
              {teams.map((t,i) => {
                const isMe = t.user_id === user?.id
                return (
                  <div key={t.id} className="flex items-center gap-4 px-4 sm:px-5 py-4 rounded-2xl transition-all anim-1"
                       style={{background:isMe?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.03)',border:isMe?'0.5px solid rgba(242,166,35,0.3)':'0.5px solid rgba(255,255,255,0.07)',animationDelay:`${i*0.05}s`}}>
                    <div className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center text-lg sm:text-xl flex-shrink-0"
                         style={{background:isMe?'rgba(242,166,35,0.12)':'rgba(255,255,255,0.05)',border:isMe?'1.5px solid rgba(242,166,35,0.4)':'1.5px solid rgba(255,255,255,0.08)'}}>
                      {t.user?.avatar_url||'🦁'}
                    </div>
                    
                    <div className="flex-1 min-w-0 mr-2">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        <span className="truncate">{t.user?.display_name||'Player'}</span>
                        {isMe && <span className="text-[10px] text-gold bg-gold/10 px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">You</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-gold text-xs truncate">{t.team_name}</span>
                        {room?.admin_id===t.user_id && <span className="text-[10px] text-yellow-400 bg-yellow-400/10 px-2 py-0.5 rounded font-bold uppercase tracking-wider shrink-0">👑 Admin</span>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {isMe ? (
                        <button onClick={toggleReady} className="px-3 sm:px-4 py-1.5 rounded-lg text-xs font-bold transition-all whitespace-nowrap"
                                style={{background:t.is_ready?'rgba(76,175,125,0.15)':'rgba(255,255,255,0.06)',color:t.is_ready?'#4CAF7D':'#F2A623',border:`0.5px solid ${t.is_ready?'rgba(76,175,125,0.3)':'rgba(242,166,35,0.3)'}`}}>
                          {t.is_ready?'✓ Ready':'Mark Ready'}
                        </button>
                      ) : (
                        <span className="text-xs px-3 sm:px-4 py-1.5 rounded-lg font-bold whitespace-nowrap"
                              style={{background:t.is_ready?'rgba(76,175,125,0.1)':'rgba(255,255,255,0.05)',color:t.is_ready?'#4CAF7D':'#7A7870',border:`0.5px solid ${t.is_ready?'rgba(76,175,125,0.25)':'rgba(255,255,255,0.07)'}`}}>
                          {t.is_ready?'✓ Ready':'Waiting…'}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
              {/* Empty slots */}
              {Array.from({length: Math.max(0,(room?.max_teams||6)-teams.length)}).map((_,i)=>(
                <div key={i} className="flex items-center gap-4 px-5 py-4 rounded-2xl" style={{border:'0.5px dashed rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.01)'}}>
                  <div className="w-11 h-11 rounded-full flex items-center justify-center text-muted" style={{border:'0.5px dashed rgba(255,255,255,0.1)'}}>+</div>
                  <span className="text-muted text-sm">Waiting for player {teams.length+i+1}…</span>
                </div>
              ))}
            </div>

            {/* Share instructions */}
            <div className="p-5 rounded-2xl" style={{background:'rgba(242,166,35,0.04)',border:'0.5px solid rgba(242,166,35,0.15)'}}>
              <div className="text-xs tracking-[2px] uppercase text-gold mb-3">📩 Invite Friends</div>
              <div className="space-y-2">
                {[`Share the code ${code} with friends`,`They visit auctionarena.org and enter the code`,'Once ready, admin starts the auction'].map((s,i)=>(
                  <div key={i} className="flex items-start gap-2 text-sm text-muted">
                    <span className="w-5 h-5 rounded-full bg-gold/10 text-gold text-xs flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">{i+1}</span>
                    <span style={{color:i===0?'#E8E2D9':'inherit'}}>{i===0?<><strong className="text-gold font-mono">{code}</strong>{' '}</>: null}{i===0?'— '+s.split(' ').slice(4).join(' '):s}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* RIGHT: ADMIN + ACTIVITY */}
          <div className="space-y-4">
            <div className="gold-card overflow-hidden anim-2">
              
              {/* Header with Edit Button */}
              <div className="px-5 py-4 flex items-center justify-between" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)', background:'rgba(255,255,255,0.02)'}}>
                <div className="flex items-center gap-2">
                  <span>👑</span>
                  <span className="text-xs tracking-[2px] uppercase text-gold">{isAdmin?'Admin Controls':'Room Settings'}</span>
                </div>
                {isAdmin && !isEditing && (
                  <button onClick={startEditing} className="text-[10px] tracking-widest font-bold text-muted hover:text-gold transition-colors px-2 py-1 rounded bg-white/5 border border-white/10 hover:border-gold/30">
                    ✏️ EDIT
                  </button>
                )}
              </div>

              <div className="p-5 space-y-2">
                {/* 1. VIEW MODE (Read Only) */}
                {room && !isEditing && [
                  ['Sport', {ipl:'🏏 IPL',kabaddi:'🤼 Kabaddi',football:'⚽ Football'}[room.sport]],
                  ['Purse', `₹${room.purse_lakhs/100} Cr`],
                  ['Squad Cap', `${room.squad_limit} players`],
                  ['Overseas', `${room.max_overseas} max`],
                  ['Order', room.player_order==='shuffled'?'Shuffled':'Serial'],
                ].map(([k,v])=>(
                  <div key={k} className="flex justify-between items-center py-2" style={{borderBottom:'0.5px solid rgba(255,255,255,0.06)'}}>
                    <span className="text-xs text-muted">{k}</span>
                    <span className="font-mono text-xs font-bold">{v}</span>
                  </div>
                ))}

                {/* 2. EDIT MODE (CreateRoomPage Style Sliders) */}
                {room && isEditing && (
                  <div className="space-y-5 py-2">
                    {/* Purse Slider */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs uppercase tracking-widest text-muted">Purse per Team</label>
                        <span className="font-mono text-gold font-bold text-sm">₹{editData.purse_cr} Cr</span>
                      </div>
                      <input type="range" min={50} max={200} step={5} value={editData.purse_cr} onChange={e=>setEditData({...editData, purse_cr: +e.target.value})} className="w-full accent-gold"/>
                      <div className="flex justify-between text-xs text-muted mt-1"><span>₹50 Cr</span><span>₹200 Cr</span></div>
                    </div>

                    {/* Squad Cap Slider */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs uppercase tracking-widest text-muted">Squad Size</label>
                        <span className="font-mono text-gold font-bold text-sm">{editData.squad_limit} players</span>
                      </div>
                      <input type="range" min={10} max={30} step={1} value={editData.squad_limit} onChange={e=>setEditData({...editData, squad_limit: +e.target.value})} className="w-full accent-gold"/>
                      <div className="flex justify-between text-xs text-muted mt-1"><span>10</span><span>30</span></div>
                    </div>

                    {/* Overseas Cap Slider */}
                    <div>
                      <div className="flex justify-between items-center mb-2">
                        <label className="text-xs uppercase tracking-widest text-muted">Overseas Cap</label>
                        <span className="font-mono text-gold font-bold text-sm">{editData.max_overseas} max</span>
                      </div>
                      <input type="range" min={4} max={11} step={1} value={editData.max_overseas} onChange={e=>setEditData({...editData, max_overseas: +e.target.value})} className="w-full accent-gold"/>
                      <div className="flex justify-between text-xs text-muted mt-1"><span>4</span><span>11</span></div>
                    </div>

                    {/* Player Order Toggle */}
                    <div>
                      <label className="text-xs uppercase tracking-widest text-muted mb-3 block">Player Order</label>
                      <div className="grid grid-cols-2 gap-2">
                        {[['shuffled','🎲 Shuffled'], ['serial','📋 Serial']].map(([v,label])=>(
                          <button key={v} onClick={()=>setEditData({...editData, player_order: v})} className="text-left p-3 rounded-lg transition-all"
                                  style={{border:editData.player_order===v?'0.5px solid rgba(242,166,35,0.4)':'0.5px solid rgba(255,255,255,0.08)',background:editData.player_order===v?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.02)'}}>
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full border transition-all flex-shrink-0"
                                   style={{borderColor:editData.player_order===v?'#F2A623':'#7A7870',background:editData.player_order===v?'#F2A623':'transparent'}}/>
                              <span className="text-xs font-semibold">{label}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Save / Cancel Buttons */}
                    <div className="flex gap-3 pt-4" style={{borderTop:'0.5px solid rgba(255,255,255,0.07)'}}>
                      <button onClick={()=>setIsEditing(false)} className="flex-1 py-2.5 rounded-lg text-xs font-semibold border border-white/10 text-muted hover:bg-white/5 transition-colors">
                        Cancel
                      </button>
                      <button onClick={saveSettings} disabled={saving} className="flex-1 py-2.5 rounded-lg text-xs font-bold bg-gold/20 text-gold border border-gold/30 hover:bg-gold/30 transition-colors disabled:opacity-50">
                        {saving ? 'Saving...' : '✓ Save Changes'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Start Auction Button */}
                {isAdmin && !isEditing && (
                  <div className="pt-3">
                    <button onClick={startAuction} disabled={teams.length < 1}
                            className="btn-gold w-full justify-center text-sm" style={{marginTop:'0.5rem'}}>
                      🔨 Start Auction
                    </button>
                    <p className="text-xs text-center text-muted mt-2">
                      {teams.length < 1 ? 'Need at least 1 team' : `${readyCount}/${teams.length} ready · Can start now`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Room Activity Log */}
            <div className="surface overflow-hidden anim-3">
              <div className="px-4 py-3 text-xs tracking-[2px] uppercase text-muted" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>Room Activity</div>
              <div className="p-3 space-y-1.5 max-h-56 overflow-y-auto custom-scrollbar">
                {activity.length===0&&<p className="text-xs text-muted text-center py-4">No activity yet</p>}
                {activity.map((a,i)=>(
                  <div key={i} className="flex justify-between text-xs py-1.5 px-2 rounded-lg" style={{background:'rgba(255,255,255,0.02)'}}>
                    <span className="text-muted leading-relaxed">{a.msg}</span>
                    <span className="text-muted/50 text-[10px] ml-2 flex-shrink-0">{a.time}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}