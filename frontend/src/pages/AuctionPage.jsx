import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSocket } from '../lib/socket'
import { useStore } from '../store'
import { speak, setMuted, getMuted, announcePlayer, announceBid, announceSold, announceUnsold, announcePhase } from '../lib/voice'

const CIRC = 2 * Math.PI * 40

function TimerRing({ sec }) {
  const offset = CIRC * (1 - sec / 15)
  const red = sec <= 5
  return (
    <div className="relative w-20 h-20 sm:w-24 sm:h-24 mx-auto my-2">
      <svg className="w-full h-full" style={{transform:'rotate(-90deg)'}} viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
        <circle cx="45" cy="45" r="40" fill="none"
          stroke={red?'#E24B4A':'#F2A623'} strokeWidth="5"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          strokeLinecap="round" style={{transition:'stroke-dashoffset 1s linear,stroke 0.3s'}}/>
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-mono text-lg sm:text-xl font-bold ${red?'text-red-400':'text-gold'}`}
           style={{animation:red?'pulse 1s infinite':'none'}}>{sec}</div>
    </div>
  )
}

function fmt(l) { return l>=100?`₹${(l/100).toFixed(2).replace(/\.?0+$/,'')} Cr`:`₹${l} L` }

// Helper function to format batting/bowling style (e.g. right_hand -> Right Hand)
const formatStyle = (str) => {
  if (!str || str === 'none') return '';
  return str.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

const FLAGS = {'India':'🇮🇳','Australia':'🇦🇺','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','South Africa':'🇿🇦','New Zealand':'🇳🇿','West Indies':'🇯🇲','Sri Lanka':'🇱🇰','Afghanistan':'🇦🇫','France':'🇫🇷','Norway':'🇳🇴','Netherlands':'🇳🇱','Spain':'🇪🇸','Brazil':'🇧🇷','Iran':'🇮🇷','Bangladesh':'🇧🇩','Pakistan':'🇵🇰'}
const ROLE_COLORS = {batsman:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},bowler:{c:'#F2A623',bg:'rgba(242,166,35,0.1)',b:'rgba(242,166,35,0.2)'},allrounder:{c:'#6DCFA0',bg:'rgba(76,175,125,0.1)',b:'rgba(76,175,125,0.2)'},wicketkeeper:{c:'#F07050',bg:'rgba(216,90,48,0.1)',b:'rgba(216,90,48,0.2)'},raider:{c:'#F07050',bg:'rgba(216,90,48,0.12)',b:'rgba(216,90,48,0.25)'},defender:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},st:{c:'#F2A623',bg:'rgba(242,166,35,0.1)',b:'rgba(242,166,35,0.2)'},cm:{c:'#6DCFA0',bg:'rgba(76,175,125,0.1)',b:'rgba(76,175,125,0.2)'},cb:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},gk:{c:'#C99EF5',bg:'rgba(181,124,245,0.1)',b:'rgba(181,124,245,0.2)'}}
const TEAM_COLORS = ['#F2A623','#D85A30','#4CAF7D','#6495ED','#B57CF5','#4ECDC4','#FF6B6B','#FFE66D','#A8DADC','#F72585']

export default function AuctionPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user, profile } = useStore()
  const [room, setRoom] = useState(null)
  const [teams, setTeams] = useState([])
  const [myTeam, setMyTeam] = useState(null)
  const [player, setPlayer] = useState(null)
  const [lot, setLot] = useState(null)
  const [lotNum, setLotNum] = useState(0)
  const [total, setTotal] = useState(0)          
  const [soldCount, setSoldCount] = useState(0)   
  const [unsoldCount, setUnsoldCount] = useState(0) 
  const [bid, setBid] = useState(null)
  const [leader, setLeader] = useState(null)
  const [history, setHistory] = useState([])
  const [timer, setTimer] = useState(15)
  const [phase, setPhase] = useState('main')
  const [tab, setTab] = useState('last_ipl')
  const [muted, setMutedState] = useState(false)
  const [soldOverlay, setSoldOverlay] = useState(null)
  const [flash, setFlash] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [skipCount, setSkipCount] = useState(0)
  const [paused, setPaused] = useState(false)
  const isAdmin = room?.admin_id === user?.id

  useEffect(() => {
    loadRoom()
    const socket = getSocket()
    socket.emit('room:join', { roomCode: code, userId: user?.id })

    socket.on('auction:player_up', ({ player: p, lot: l, lotNumber, totalLots, basePriceLakhs, soldCount: sc, unsoldCount: uc }) => {
      setPlayer(p)
      setLot(l)
      setLotNum(lotNumber)
      setTotal(totalLots)                          
      if (sc !== undefined) setSoldCount(sc)       
      if (uc !== undefined) setUnsoldCount(uc)
      setBid({ amount: basePriceLakhs, teamId: null })
      setLeader(null)
      setHistory([])
      setTimer(15)
      setSoldOverlay(null)
      setSkipped(false)
      setSkipCount(0)
      announcePlayer(p, lotNumber, totalLots)
    })

    socket.on('auction:bid', ({ teamId, teamName, amountLakhs }) => {
      setBid({ amount: amountLakhs, teamId })
      setLeader(teamName)
      setHistory(prev => [{ teamId, teamName, amountLakhs, time: new Date() }, ...prev].slice(0, 10))
      setFlash(true)
      setTimeout(() => setFlash(false), 400)
      announceBid(teamName, amountLakhs)
    })

    socket.on('auction:timer', ({ seconds }) => setTimer(seconds))

    socket.on('auction:sold', ({ player: p, winnerTeam, finalPrice: finalPriceLakhs, soldCount: sc, unsoldCount: uc, totalPlayers: tp }) => {
      setSoldOverlay({ player: p, team: winnerTeam, price: finalPriceLakhs })
      if (sc !== undefined) setSoldCount(sc)
      if (uc !== undefined) setUnsoldCount(uc)
      if (tp !== undefined) setTotal(tp)
      setTeams(prev => prev.map(t => t.id === winnerTeam.id ? {
        ...t,
        purse_remaining_lakhs: winnerTeam.purse_remaining_lakhs,
        squad_count: winnerTeam.squad_count,
        overseas_count: winnerTeam.overseas_count,
        picks: [...(t.picks || []), { player: p, price_paid_lakhs: finalPriceLakhs }]
      } : t))
      announceSold(p.name, winnerTeam.team_name, finalPriceLakhs)
    })

    socket.on('auction:skip', ({ teamId, skipCount: sc }) => {
      setSkipCount(sc)
    })

    socket.on('auction:unsold', ({ player: p, soldCount: sc, unsoldCount: uc, totalPlayers: tp }) => {
      announceUnsold(p.name)
      setSoldOverlay({ player: p, team: null, price: null })
      if (sc !== undefined) setSoldCount(sc)
      if (uc !== undefined) setUnsoldCount(uc)
      if (tp !== undefined) setTotal(tp)
    })

    socket.on('auction:phase', ({ phase: ph, soldCount: sc, unsoldCount: uc, totalPlayers: tp }) => {
      setPhase(ph)
      if (sc !== undefined) setSoldCount(sc)
      if (uc !== undefined) setUnsoldCount(uc)
      if (tp !== undefined) setTotal(tp)
      if (ph === 'unsold_round') announcePhase(0)
      if (ph === 'finished') { setTimeout(() => navigate(`/squads/${code}`), 3000) }
    })

    socket.on('auction:paused', () => setPaused(true))
    socket.on('auction:resumed', () => setPaused(false))
    return () => socket.removeAllListeners()
  }, [code])

  const loadRoom = async () => {
    const { data } = await supabase.from('rooms').select('*, room_teams(*, user:users(display_name,avatar_url))').eq('code', code).single()
    if (!data) return
    setRoom(data)
    setTeams(data.room_teams || [])
    const my = data.room_teams?.find(t => t.user_id === user?.id)
    if (my) setMyTeam(my)
  }

  const placeBid = (inc) => {
    if (!lot || !myTeam) return
    const newAmt = (bid?.amount || 0) + inc
    if (myTeam.purse_remaining_lakhs < newAmt) return
    getSocket().emit('bid:place', { roomCode: code, lotId: lot.id, teamId: myTeam.id, amountLakhs: newAmt, userId: user?.id })
  }

  const skipPlayer = () => {
    if (!lot || !myTeam) return
    setSkipped(true)
    getSocket().emit('bid:skip', { roomCode: code, lotId: lot.id, teamId: myTeam.id })
  }

  const toggleMute = () => { const m = !muted; setMutedState(m); setMuted(m) }
  const togglePause = () => {
    const socket = getSocket()
    if (paused) socket.emit('auction:resume', { roomCode: code, userId: user?.id })
    else socket.emit('auction:pause', { roomCode: code, userId: user?.id })
  }

  const rc = ROLE_COLORS[player?.role] || ROLE_COLORS.allrounder
  const canBid = myTeam && !skipped && myTeam.squad_count < (room?.squad_limit || 25) && myTeam.purse_remaining_lakhs > (bid?.amount || 0)
  const overseasFull = myTeam && player?.is_overseas && myTeam.overseas_count >= (room?.max_overseas || 8)
  const squadFull = myTeam && myTeam.squad_count >= (room?.squad_limit || 25)
  const purseInsuff = myTeam && myTeam.purse_remaining_lakhs <= (bid?.amount || 0)

  const statsObj = tab === 'last_ipl' ? (player?.stats_last_ipl || {}) : tab === 'total_ipl' ? (player?.stats_total_ipl || {}) : (player?.stats_total_t20 || {})
  
  // ✅ Added 'hundreds' to the stat fields for IPL
  const statFields = room?.sport === 'ipl'
    ? [['matches','M'],['runs','Runs'],['wickets','Wkts'],['average','Avg'],['strike_rate','SR'],['economy','Eco'],['highest_score','HS'],['best_bowling','BB'],['fifties','50s'], ['hundreds','100s']]
    : room?.sport === 'kabaddi'
    ? [['matches','M'],['raid_points','Raid Pts'],['tackle_points','Tkl Pts'],['super_raids','S.Raids'],['super_tackles','S.Tackles'],['high_5s','High-5s']]
    : [['matches','M'],['goals','Goals'],['assists','Assists'],['clean_sheets','CS'],['pass_accuracy','Pass%'],['rating','Rating']]

  const TABS = room?.sport === 'ipl' ? [['last_ipl','Last IPL'],['total_ipl','IPL Career'],['total_t20','T20 Total']] : room?.sport === 'kabaddi' ? [['total_ipl','PKL Career']] : [['total_ipl','Career']]

  const decidedCount = soldCount + unsoldCount

  return (
    <div className="h-[100dvh] bg-bg flex flex-col overflow-hidden relative">
      <div className="orb" style={{width:500,height:500,background:'rgba(242,166,35,0.06)',top:-200,right:-150}}/>

      {/* ── TOP BAR ── */}
      <div className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 sm:px-5 py-2.5 sm:py-3 flex-shrink-0 relative z-10"
           style={{background:'rgba(7,7,14,0.95)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-lg sm:text-xl tracking-[2px] sm:tracking-[3px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <span className="font-mono text-[10px] sm:text-xs px-2 py-0.5 rounded text-muted tracking-[2px]"
              style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>{code}</span>

        <div className="order-3 sm:order-none basis-full sm:basis-auto sm:flex-1 flex items-center gap-2 sm:gap-3">
          <span className="text-[10px] sm:text-xs text-muted whitespace-nowrap font-mono">
            {decidedCount}/{total > 0 ? total : '…'}
          </span>

          <div className="flex-1 h-1.5 rounded overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full float-left rounded-l"
                 style={{
                   width:`${total > 0 ? (soldCount/total)*100 : 0}%`,
                   background:'linear-gradient(90deg,#2a7a4a,#4CAF7D)',
                   transition:'width 0.5s'
                 }}/>
            <div className="h-full float-left"
                 style={{
                   width:`${total > 0 ? (unsoldCount/total)*100 : 0}%`,
                   background:'linear-gradient(90deg,#8a2a2a,#D85A30)',
                   transition:'width 0.5s'
                 }}/>
          </div>

          <div className="hidden sm:flex items-center gap-2 flex-shrink-0">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{background:'rgba(76,175,125,0.12)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.25)'}}>
              ✓ {soldCount} Sold
            </span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{background:'rgba(216,90,48,0.12)',color:'#D85A30',border:'0.5px solid rgba(216,90,48,0.25)'}}>
              ✗ {unsoldCount} Unsold
            </span>
          </div>

          <span className="text-[10px] sm:text-xs px-2 py-0.5 rounded font-bold tracking-wider sm:tracking-widest uppercase text-gold"
                style={{background:'rgba(242,166,35,0.08)',border:'0.5px solid rgba(242,166,35,0.2)'}}>
            {phase === 'unsold_round' ? 'Unsold Round' : 'Main Auction'}
          </span>
        </div>

        <button onClick={() => navigate('/dashboard')} className="text-[10px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-lg text-muted transition-colors"
                style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>
          ← Dashboard
        </button>
        {room?.admin_id === user?.id && (
          <button onClick={togglePause} className="text-[10px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-lg font-bold transition-colors"
                  style={{background:paused?'rgba(76,175,125,0.15)':'rgba(242,166,35,0.1)',color:paused?'#4CAF7D':'#F2A623',border:`0.5px solid ${paused?'rgba(76,175,125,0.3)':'rgba(242,166,35,0.25)'}`}}>
            {paused ? '▶ Resume' : '⏸ Pause'}
          </button>
        )}
        <button onClick={toggleMute} className="text-[10px] sm:text-xs px-2.5 sm:px-3 py-1.5 rounded-lg text-muted transition-colors"
                style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>
          {muted ? '🔇 Muted' : '🔊 Sound'}
        </button>
      </div>

      {/* ── MAIN 3-COL LAYOUT ── */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[210px_minmax(0,1fr)_250px] overflow-hidden relative z-10">

        {/* LEFT SIDEBAR: TEAMS */}
        <div className="order-2 lg:order-1 overflow-y-auto border-t lg:border-t-0 lg:border-r p-2 flex flex-col gap-1.5 custom-scrollbar max-h-48 lg:max-h-none"
             style={{borderColor:'rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.2)'}}>
          <div className="text-[10px] tracking-[2px] uppercase text-muted px-2 py-1.5 mb-1">Teams</div>
          {teams.map((t, i) => {
            const isLeading = leader && t.team_name === leader
            const isFull = t.squad_count >= (room?.squad_limit || 25)
            const tColor = TEAM_COLORS[i % TEAM_COLORS.length]
            return (
              <div key={t.id} className="rounded-xl overflow-hidden transition-all"
                   style={{border:`0.5px solid ${isLeading ? tColor+'60' : 'rgba(255,255,255,0.07)'}`,background:isLeading?`${tColor}08`:'rgba(255,255,255,0.02)',opacity:isFull?0.4:1}}>
                <div className="flex items-center gap-2 px-3 py-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:tColor}}/>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1">
                      <div className="text-xs font-semibold truncate">{t.team_name}</div>
                      {t.user_id === user?.id && <span className="text-[8px] bg-gold/20 text-gold px-1 py-0.5 rounded font-bold">YOU</span>}
                    </div>
                    <div className="font-mono text-[10px] text-muted">{fmt(t.purse_remaining_lakhs)} left</div>
                  </div>
                  {isLeading && <span className="text-[9px] text-gold tracking-widest uppercase">↑</span>}
                </div>
                <div className="px-3 pb-1 text-[10px] text-muted">{t.squad_count}/{room?.squad_limit||25} · {t.overseas_count} OS</div>
                {t.picks && t.picks.length > 0 && (
                  <div className="px-3 pb-2 flex flex-col gap-0.5 max-h-24 overflow-y-auto custom-scrollbar">
                    {t.picks.map((pk, pi) => (
                      <div key={pi} className="flex flex-col text-[9px] py-0.5 border-b border-white/5">
                        <div className="flex items-center justify-between">
                          <span className="truncate text-white/80 font-semibold">{pk.player?.name}</span>
                          <span className="text-gold font-mono ml-1 flex-shrink-0">{fmt(pk.price_paid_lakhs)}</span>
                        </div>
                        <span className="text-white/40 capitalize">{pk.player?.role?.replace('_', ' ')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* CENTER: PLAYER CARD */}
        <div className="order-1 lg:order-2 overflow-y-auto flex flex-col items-center justify-start px-3 sm:px-6 py-3 sm:py-5 custom-scrollbar">
          {!player ? (
            <div className="flex flex-col items-center justify-center h-full text-muted">
              <div className="text-5xl mb-4">⏳</div>
              <p className="font-mono text-sm tracking-widest">WAITING FOR AUCTION TO START…</p>
            </div>
          ) : (
            <div className="glass p-4 sm:p-6 w-full max-w-[460px] flex flex-col items-center text-center">
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-32 rounded-full pointer-events-none"
                   style={{background:`radial-gradient(circle,${rc.bg},transparent 70%)`,filter:'blur(24px)',top:-20}}/>
              
              <div className="text-[10px] tracking-[2px] uppercase text-muted mb-3 relative z-10">
                Lot #{lotNum} of {total > 0 ? total : '…'}
              </div>

              {/* ✅ FIXED Image Logic With Error Fallback */}
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4 relative z-10 flex-shrink-0"
                   style={{background:'linear-gradient(135deg,#1a2535,#2a1a2a)',border:`2.5px solid ${rc.b}`,boxShadow:`0 0 35px ${rc.bg}`}}>
                
                {player.photo_url && (
                  <img 
                    src={player.photo_url} 
                    alt={player.name} 
                    className="w-full h-full rounded-full object-cover"
                    onError={(e) => {
                      // Agar photo link break ho toh hide karke default icon dikha do
                      e.target.style.display = 'none';
                      if(e.target.nextSibling) e.target.nextSibling.style.display = 'block';
                    }}
                  />
                )}
                
                {/* Fallback Emoji */}
                <span style={{ display: player.photo_url ? 'none' : 'block' }}>
                  {room?.sport==='ipl'?'🏏':room?.sport==='kabaddi'?'🤼':'⚽'}
                </span>
                
                <span className="absolute -bottom-1 -right-1 text-base"
                      style={{background:'#13131f',borderRadius:'50%',padding:'2px'}}>{FLAGS[player.country]||'🌍'}</span>
              </div>

              <h2 className="font-bebas text-2xl sm:text-3xl tracking-[2px] sm:tracking-[3px] leading-none mb-1 relative z-10">{player.name}</h2>

              {/* ✅ NEW: Batting and Bowling Style Text */}
              <div className="text-[10px] uppercase tracking-[2px] text-muted mb-3 flex flex-wrap items-center justify-center gap-2 font-semibold relative z-10">
                {player.batting_style && player.batting_style !== 'none' && (
                  <span className="text-white/70">{formatStyle(player.batting_style)} Bat</span>
                )}
                
                {player.batting_style && player.batting_style !== 'none' && player.bowling_style && player.bowling_style !== 'none' && (
                  <span className="opacity-40">•</span>
                )}
                
                {player.bowling_style && player.bowling_style !== 'none' && (
                  <span className="text-white/70">{formatStyle(player.bowling_style)}</span>
                )}
              </div>

              <div className="flex flex-wrap gap-1.5 justify-center mb-4 relative z-10">
                <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded"
                      style={{background:rc.bg,color:rc.c,border:`0.5px solid ${rc.b}`}}>{player.role?.replace('_',' ')}</span>
                {player.is_capped && <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded"
                      style={{background:'rgba(100,149,237,0.08)',color:'#8ABCE8',border:'0.5px solid rgba(100,149,237,0.2)'}}>Capped</span>}
                {player.is_overseas && <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded"
                      style={{background:'rgba(242,166,35,0.08)',color:'#F2A623',border:'0.5px solid rgba(242,166,35,0.2)'}}>Overseas</span>}
                <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded"
                      style={{background:'rgba(76,175,125,0.08)',color:'#6DCFA0',border:'0.5px solid rgba(76,175,125,0.2)'}}>Base: {fmt(player.base_price_lakhs)}</span>
              </div>

              {/* Stats tabs */}
              {TABS.length > 1 && (
                <div className="flex w-full rounded-lg overflow-hidden mb-3 relative z-10"
                     style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>
                  {TABS.map(([k, l]) => (
                    <button key={k} onClick={() => setTab(k)}
                            className="flex-1 py-1.5 text-[10px] tracking-wider uppercase transition-colors"
                            style={{background:tab===k?'rgba(242,166,35,0.1)':'transparent',color:tab===k?'#F2A623':'#7A7870',borderRight:'0.5px solid rgba(255,255,255,0.07)'}}>
                      {l}
                    </button>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 w-full relative z-10">
                {statFields.map(([key, label]) => (
                  <div key={key} className="rounded-lg py-2 px-1 text-center"
                       style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
                    <div className="font-mono text-sm font-semibold">{statsObj[key] ?? '—'}</div>
                    <div className="text-muted text-[9px] uppercase tracking-wide mt-0.5">{label}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT: BIDDING */}
        <div className="order-3 overflow-y-auto border-t lg:border-t-0 lg:border-l flex flex-col items-center py-4 sm:py-5 px-3 sm:px-4 custom-scrollbar max-h-[48vh] lg:max-h-none"
             style={{borderColor:'rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.15)'}}>
          <div className="text-[10px] tracking-[2px] uppercase text-muted mb-1">Current Bid</div>
          <div className={`font-bebas text-4xl sm:text-5xl tracking-[2px] text-gold transition-transform ${flash ? 'scale-125' : ''}`}
               style={{textShadow:'0 0 50px rgba(242,166,35,0.6)',animation:'pulseGold 2s ease infinite',transition:'transform 0.3s'}}>
            {bid ? fmt(bid.amount) : '—'}
          </div>
          <div className="text-xs text-muted mb-2 text-center leading-tight">
            {leader ? <>Led by <br/><span className="text-gold font-semibold text-sm">{leader}</span></> : 'No bids yet'}
          </div>

          <TimerRing sec={timer}/>

          {/* BID BUTTONS */}
          <div className="flex flex-col gap-2 w-full mb-3 mt-2">
            {squadFull ? (
              <div className="w-full py-3 rounded-xl text-center text-xs font-bold text-muted"
                   style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>Squad Full</div>
            ) : overseasFull ? (
              <div className="w-full py-3 rounded-xl text-center text-xs font-bold"
                   style={{background:'rgba(216,90,48,0.08)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.2)'}}>Overseas Cap Reached</div>
            ) : purseInsuff ? (
              <div className="w-full py-3 rounded-xl text-center text-xs font-bold text-muted"
                   style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>Insufficient Funds</div>
            ) : (
              <>
                <button onClick={() => placeBid(25)} disabled={!canBid || skipped}
                        className="w-full py-2.5 sm:py-3 rounded-xl font-bold text-bg text-[11px] sm:text-xs tracking-wide sm:tracking-widest uppercase transition-all disabled:opacity-40"
                        style={{background:'linear-gradient(135deg,#F2A623,#BA7517)',boxShadow:'0 0 20px rgba(242,166,35,0.2)'}}>
                  + ₹25 Lakhs
                </button>
                {(bid?.amount || 0) >= 500 && (
                  <button onClick={() => placeBid(50)} disabled={!canBid || skipped}
                          className="w-full py-2.5 sm:py-3 rounded-xl font-bold text-[11px] sm:text-xs tracking-wide sm:tracking-widest uppercase transition-all disabled:opacity-40"
                          style={{background:'rgba(216,90,48,0.15)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.35)'}}>
                    + ₹50 Lakhs
                  </button>
                )}
                {(bid?.amount || 0) >= 700 && (
                  <button onClick={() => placeBid(100)} disabled={!canBid || skipped}
                          className="w-full py-2.5 sm:py-3 rounded-xl font-bold text-[11px] sm:text-xs tracking-wide sm:tracking-widest uppercase transition-all disabled:opacity-40"
                          style={{background:'rgba(181,124,245,0.15)',color:'#B57CF5',border:'0.5px solid rgba(181,124,245,0.35)'}}>
                    + ₹1 Crore
                  </button>
                )}
              </>
            )}
            <button onClick={skipPlayer} disabled={skipped}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted transition-all disabled:opacity-30"
                    style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
              {skipped ? `✓ Skipped` : 'Skip Player'}{skipCount > 0 && <span className='ml-2 text-white/40'>{skipCount}/{teams.length}</span>}
            </button>
          </div>

          {/* BID HISTORY */}
          <div className="text-[10px] tracking-[2px] uppercase text-muted self-start mb-2">Bid History</div>
          <div className="w-full space-y-1 pb-4">
            {history.length === 0 && <p className="text-xs text-muted text-center py-4">No bids on this player yet</p>}
            {history.map((h, i) => (
              <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg"
                   style={{background:i===0?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.02)',border:i===0?'0.5px solid rgba(242,166,35,0.15)':'none'}}>
                <div className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                     style={{background:TEAM_COLORS[teams.findIndex(t=>t.id===h.teamId)%TEAM_COLORS.length]||'#888'}}/>
                <span className="text-xs flex-1 truncate text-muted">{h.teamName}</span>
                <span className="font-mono text-xs text-gold font-bold">{fmt(h.amountLakhs)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SOLD / UNSOLD OVERLAY ── */}
      {soldOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(0,0,0,0.85)',backdropFilter:'blur(8px)'}}>
          <div className="text-center p-6 sm:p-12 rounded-3xl w-full max-w-[400px]"
               style={{background:'#13131f',border:`1px solid ${soldOverlay.team?'rgba(76,175,125,0.4)':'rgba(216,90,48,0.4)'}`,animation:'soldPop 0.5s ease both',maxWidth:400}}>
            {soldOverlay.team ? (
              <>
                <div className="text-5xl mb-3">🔨</div>
                <div className="font-bebas text-5xl tracking-[5px] text-emerald mb-2">SOLD!</div>
                <div className="font-bebas text-3xl tracking-[2px] mb-3">{soldOverlay.player?.name}</div>
                <p className="text-muted text-sm mb-1">Goes to <strong className="text-white">{soldOverlay.team?.team_name}</strong></p>
                <div className="font-bebas text-4xl text-gold tracking-[2px]">{fmt(soldOverlay.price)}</div>
              </>
            ) : (
              <>
                <div className="text-5xl mb-3">❌</div>
                <div className="font-bebas text-5xl tracking-[5px] mb-2" style={{color:'#D85A30'}}>UNSOLD!</div>
                <div className="font-bebas text-3xl tracking-[2px] mb-3">{soldOverlay.player?.name}</div>
                <p className="text-muted text-sm">No bids — moving on</p>
              </>
            )}
            <div className="mt-4 flex justify-center gap-4">
              <span className="text-[11px] font-bold px-2 py-1 rounded"
                    style={{background:'rgba(76,175,125,0.1)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.2)'}}>
                ✓ {soldCount} Sold
              </span>
              <span className="text-[11px] font-bold px-2 py-1 rounded"
                    style={{background:'rgba(216,90,48,0.1)',color:'#D85A30',border:'0.5px solid rgba(216,90,48,0.2)'}}>
                ✗ {unsoldCount} Unsold
              </span>
              <span className="text-[11px] text-muted px-2 py-1 rounded"
                    style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                {total - soldCount - unsoldCount} left
              </span>
            </div>
            <p className="text-muted text-xs mt-3">Next player coming up…</p>
          </div>
        </div>
      )}

      {/* ── PAUSE OVERLAY (non-admin) ── */}
      {paused && room?.admin_id !== user?.id && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(0,0,0,0.85)',backdropFilter:'blur(8px)'}}>
          <div className="text-center p-6 sm:p-12 rounded-3xl w-full max-w-[400px]"
               style={{background:'#13131f',border:'1px solid rgba(242,166,35,0.3)',maxWidth:400}}>
            <div className="text-5xl mb-4">⏸</div>
            <div className="font-bebas text-4xl tracking-[3px] text-gold mb-2">Auction Paused</div>
            <p className="text-muted text-sm">Admin ne auction pause kiya hai. Resume hone ka wait karo…</p>
          </div>
        </div>
      )}

      {/* ── FINISHED OVERLAY ── */}
      {phase === 'finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
             style={{background:'rgba(0,0,0,0.9)',backdropFilter:'blur(8px)'}}>
          <div className="text-center p-6 sm:p-12 rounded-3xl w-full max-w-[400px]"
               style={{background:'#13131f',border:'1px solid rgba(242,166,35,0.4)',maxWidth:400}}>
            <div className="text-5xl mb-3">🏆</div>
            <div className="font-bebas text-4xl tracking-[3px] text-gold mb-2">Auction Complete!</div>
            <div className="flex justify-center gap-4 mb-4">
              <span className="text-sm font-bold" style={{color:'#4CAF7D'}}>✓ {soldCount} Sold</span>
              <span className="text-sm font-bold" style={{color:'#D85A30'}}>✗ {unsoldCount} Unsold</span>
            </div>
            <p className="text-muted text-sm mb-6">Redirecting to Final Squads…</p>
          </div>
        </div>
      )}
    </div>
  )
}
