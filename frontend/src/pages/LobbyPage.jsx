import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
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

  const addLog = (msg) => setActivity(p=>[{msg, time: new Date().toLocaleTimeString()},...p].slice(0,20))

  useEffect(() => {
    loadRoom()
    const socket = getSocket()
    socket.emit('room:join', { roomCode: code, userId: user?.id })
    socket.on('lobby:team_joined', ({ teams: t }) => { setTeams(t); addLog(`🟢 A new team joined the room`) })
    socket.on('lobby:team_ready', ({ team_id, is_ready }) => {
      setTeams(p => p.map(t => t.id===team_id ? {...t, is_ready} : t))
      addLog(`✅ A team updated their ready status`)
    })
    socket.on('auction:start', () => navigate(`/auction/${code}`))
    return () => { socket.off('lobby:team_joined'); socket.off('lobby:team_ready'); socket.off('auction:start') }
  }, [code])

  const loadRoom = async () => {
    const { data } = await supabase.from('rooms').select('*, room_teams(*, user:users(display_name,avatar_url))').eq('code', code).single()
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
    await supabase.from('room_teams').update({is_ready:newReady}).eq('id',my.id)
    getSocket().emit('room:ready', { roomCode: code, teamId: my.id, isReady: newReady })
  }

  const startAuction = () => {
    getSocket().emit('admin:start', { roomCode: code, userId: user?.id })
    addLog('🚀 Admin started the auction!')
  }

  const copyCode = () => {
    navigator.clipboard.writeText(code).catch(()=>{})
    addLog('📋 Room code copied')
  }

  const readyCount = teams.filter(t=>t.is_ready).length
  const sportLabels = { ipl:'🏏 IPL Cricket', kabaddi:'🤼 Pro Kabaddi', football:'⚽ Football' }

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="orb" style={{width:600,height:600,background:'rgba(242,166,35,0.07)',top:-180,right:-150}}/>
      <div className="orb" style={{width:500,height:500,background:'rgba(76,175,125,0.05)',bottom:'5%',left:-160}}/>

      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        {profile&&(
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
            <span>{profile.avatar_url||'🦁'}</span>
            <span className="text-sm font-semibold">{profile.display_name}</span>
            <span className="text-gold text-xs">· {profile.team_name}</span>
          </div>
        )}
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-8 pt-24 pb-12">
        {/* CODE BANNER */}
        <div className="glass p-6 mb-8 flex items-center justify-between anim-1">
          <div>
            <div className="text-xs tracking-[2px] uppercase text-muted mb-1">Room Code</div>
            <div className="font-bebas text-5xl tracking-[10px] text-gold" style={{textShadow:'0 0 40px rgba(242,166,35,0.35)'}}>{code}</div>
            <div className="text-muted text-sm mt-1">{room && sportLabels[room.sport]} · Created by {room?.admin?.display_name||'Admin'}</div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <button onClick={copyCode} className="flex items-center gap-2 px-4 py-2 rounded-full text-gold text-sm font-semibold transition-all hover:opacity-80"
                    style={{background:'rgba(242,166,35,0.1)',border:'0.5px solid rgba(242,166,35,0.3)'}}>
              📋 Copy Code
            </button>
            <div className="flex items-center gap-2 text-emerald text-xs">
              <span className="w-2 h-2 rounded-full bg-emerald" style={{animation:'pulse 2s infinite'}}/>
              Live Room · Waiting
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-6">
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
                  <div key={t.id} className="flex items-center gap-4 px-5 py-4 rounded-2xl transition-all anim-1"
                       style={{background:isMe?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.03)',border:isMe?'0.5px solid rgba(242,166,35,0.3)':'0.5px solid rgba(255,255,255,0.07)',animationDelay:`${i*0.05}s`}}>
                    <div className="w-11 h-11 rounded-full flex items-center justify-center text-xl flex-shrink-0"
                         style={{background:isMe?'rgba(242,166,35,0.12)':'rgba(255,255,255,0.05)',border:isMe?'1.5px solid rgba(242,166,35,0.4)':'1.5px solid rgba(255,255,255,0.08)'}}>
                      {t.user?.avatar_url||'🦁'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold text-sm flex items-center gap-2">
                        {t.user?.display_name||'Player'}
                        {isMe && <span className="text-xs text-gold bg-gold/10 px-2 py-0.5 rounded">You</span>}
                        {room?.admin_id===t.user_id && <span className="text-xs text-yellow-400">👑 Admin</span>}
                      </div>
                      <div className="text-gold text-xs mt-0.5">{t.team_name}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isMe && !isAdmin ? (
                        <button onClick={toggleReady} className="px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                                style={{background:t.is_ready?'rgba(76,175,125,0.15)':'rgba(255,255,255,0.06)',color:t.is_ready?'#4CAF7D':'#7A7870',border:`0.5px solid ${t.is_ready?'rgba(76,175,125,0.3)':'rgba(255,255,255,0.1)'}`}}>
                          {t.is_ready?'✓ Ready':'Mark Ready'}
                        </button>
                      ) : (
                        <span className="text-xs px-3 py-1 rounded-lg font-bold"
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
                {[`Share the code ${code} with friends`,`They visit auctionarena.gg and enter the code`,'Once ready, admin starts the auction'].map((s,i)=>(
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
              <div className="px-5 py-3 flex items-center gap-2" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
                <span>👑</span>
                <span className="text-xs tracking-[2px] uppercase text-gold">{isAdmin?'Admin Controls':'Room Settings'}</span>
              </div>
              <div className="p-5 space-y-2">
                {room && [
                  ['Sport', {ipl:'🏏 IPL',kabaddi:'🤼 Kabaddi',football:'⚽ Football'}[room.sport]],
                  ['Purse', `₹${room.purse_lakhs/100} Cr`],
                  ['Squad Cap', `${room.squad_limit} players`],
                  ['Overseas', `${room.max_overseas} max`],
                  ['Order', room.player_order],
                ].map(([k,v])=>(
                  <div key={k} className="flex justify-between items-center py-2" style={{borderBottom:'0.5px solid rgba(255,255,255,0.06)'}}>
                    <span className="text-xs text-muted">{k}</span>
                    <span className="font-mono text-xs font-bold">{v}</span>
                  </div>
                ))}
                {isAdmin && (
                  <div className="pt-3">
                    <button onClick={startAuction} disabled={teams.length<2}
                            className="btn-gold w-full justify-center text-sm" style={{marginTop:'0.5rem'}}>
                      🔨 Start Auction
                    </button>
                    <p className="text-xs text-center text-muted mt-2">
                      {teams.length<2?'Need at least 2 teams':`${readyCount}/${teams.length} ready · Can start now`}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="surface overflow-hidden anim-3">
              <div className="px-4 py-3 text-xs tracking-[2px] uppercase text-muted" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>Room Activity</div>
              <div className="p-3 space-y-1.5 max-h-56 overflow-y-auto">
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
