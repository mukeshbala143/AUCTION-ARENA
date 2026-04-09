import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSocket } from '../lib/socket'
import { useStore } from '../store'
import { setMuted, announcePlayer, announceBid, announceSold, announceUnsold, announcePhase } from '../lib/voice'

const CIRC = 2 * Math.PI * 40

function TimerRing({ sec, small }) {
  const offset = CIRC * (1 - sec / 15)
  const red = sec <= 5
  const size = small ? 'w-16 h-16' : 'w-24 h-24'
  return (
    <div className={`relative ${size} mx-auto my-1`}>
      <svg className="w-full h-full" style={{transform:'rotate(-90deg)'}} viewBox="0 0 90 90">
        <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
        <circle cx="45" cy="45" r="40" fill="none"
          stroke={red?'#E24B4A':'#F2A623'} strokeWidth="5"
          strokeDasharray={CIRC} strokeDashoffset={offset}
          strokeLinecap="round" style={{transition:'stroke-dashoffset 1s linear,stroke 0.3s'}}/>
      </svg>
      <div className={`absolute inset-0 flex items-center justify-center font-mono font-bold ${small?'text-lg':'text-xl'} ${red?'text-red-400':'text-gold'}`}
           style={{animation:red?'pulse 1s infinite':'none'}}>{sec}</div>
    </div>
  )
}

function fmt(l) { return l>=100?`₹${(l/100).toFixed(2).replace(/\.?0+$/,'')} Cr`:`₹${l} L` }
const formatStyle = (str) => {
  if (!str || str === 'none') return ''
  return str.split('_').map(w => w.charAt(0).toUpperCase()+w.slice(1)).join(' ')
}

const FLAGS = {'India':'🇮🇳','Australia':'🇦🇺','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','South Africa':'🇿🇦','New Zealand':'🇳🇿','West Indies':'🇯🇲','Sri Lanka':'🇱🇰','Afghanistan':'🇦🇫','France':'🇫🇷','Norway':'🇳🇴','Netherlands':'🇳🇱','Spain':'🇪🇸','Brazil':'🇧🇷','Iran':'🇮🇷','Bangladesh':'🇧🇩','Pakistan':'🇵🇰'}
const ROLE_COLORS = {batsman:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},bowler:{c:'#F2A623',bg:'rgba(242,166,35,0.1)',b:'rgba(242,166,35,0.2)'},allrounder:{c:'#6DCFA0',bg:'rgba(76,175,125,0.1)',b:'rgba(76,175,125,0.2)'},wicketkeeper:{c:'#F07050',bg:'rgba(216,90,48,0.1)',b:'rgba(216,90,48,0.2)'},raider:{c:'#F07050',bg:'rgba(216,90,48,0.12)',b:'rgba(216,90,48,0.25)'},defender:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},st:{c:'#F2A623',bg:'rgba(242,166,35,0.1)',b:'rgba(242,166,35,0.2)'},cm:{c:'#6DCFA0',bg:'rgba(76,175,125,0.1)',b:'rgba(76,175,125,0.2)'},cb:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},gk:{c:'#C99EF5',bg:'rgba(181,124,245,0.1)',b:'rgba(181,124,245,0.2)'}}
const TEAM_COLORS = ['#F2A623','#D85A30','#4CAF7D','#6495ED','#B57CF5','#4ECDC4','#FF6B6B','#FFE66D','#A8DADC','#F72585']

export default function AuctionPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useStore()
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
  const [mobileTab, setMobileTab] = useState('player') 
  const [expandedTeam, setExpandedTeam] = useState(null) 

  const isAdmin = room?.admin_id === user?.id

  useEffect(() => {
    loadRoom()
    const socket = getSocket()
    
    // ✅ BUG FIX: Agar connection drop ho jaye, toh reconnect par wapas room join karein
    const joinRoom = () => socket.emit('room:join', { roomCode: code, userId: user?.id })
    joinRoom()
    socket.on('connect', joinRoom)

    socket.on('auction:player_up', ({ player:p, lot:l, lotNumber, totalLots, basePriceLakhs, soldCount:sc, unsoldCount:uc }) => {
      setPlayer(p); setLot(l); setLotNum(lotNumber); setTotal(totalLots)
      if (sc !== undefined) setSoldCount(sc)
      if (uc !== undefined) setUnsoldCount(uc)
      setBid({ amount:basePriceLakhs, teamId:null })
      setLeader(null); setHistory([]); setTimer(15); setSoldOverlay(null)
      setSkipped(false); setSkipCount(0)
      setMobileTab('player') 
      announcePlayer(p, lotNumber, totalLots)
    })
    
    socket.on('auction:bid', ({ teamId, teamName, amountLakhs }) => {
      setBid({ amount:amountLakhs, teamId }); setLeader(teamName)
      setHistory(prev => [{ teamId, teamName, amountLakhs, time:new Date() }, ...prev].slice(0,10))
      setFlash(true); setTimeout(()=>setFlash(false), 400)
      announceBid(teamName, amountLakhs)
    })
    
    socket.on('auction:timer', ({ seconds }) => setTimer(seconds))
    socket.on('auction:skip', ({ skipCount:sc }) => setSkipCount(sc))
    
    socket.on('auction:sold', ({ player:p, winnerTeam, finalPrice:fp, soldCount:sc, unsoldCount:uc, totalPlayers:tp }) => {
      setSoldOverlay({ player:p, team:winnerTeam, price:fp })
      if (sc!==undefined) setSoldCount(sc)
      if (uc!==undefined) setUnsoldCount(uc)
      if (tp!==undefined) setTotal(tp)
      
      setTeams(prev => prev.map(t => t.id===winnerTeam.id ? {
        ...t, purse_remaining_lakhs:winnerTeam.purse_remaining_lakhs,
        squad_count:winnerTeam.squad_count, overseas_count:winnerTeam.overseas_count,
        picks:[...(t.picks||[]), { player:p, price_paid_lakhs:fp }]
      } : t))
      announceSold(p.name, winnerTeam.team_name, fp)
    })
    
    socket.on('auction:unsold', ({ player:p, soldCount:sc, unsoldCount:uc, totalPlayers:tp }) => {
      announceUnsold(p.name); setSoldOverlay({ player:p, team:null, price:null })
      if (sc!==undefined) setSoldCount(sc)
      if (uc!==undefined) setUnsoldCount(uc)
      if (tp!==undefined) setTotal(tp)
    })
    
    socket.on('auction:phase', ({ phase:ph, soldCount:sc, unsoldCount:uc, totalPlayers:tp }) => {
      setPhase(ph)
      if (sc!==undefined) setSoldCount(sc)
      if (uc!==undefined) setUnsoldCount(uc)
      if (tp!==undefined) setTotal(tp)
      if (ph==='unsold_round') announcePhase(0)
      if (ph==='finished') setTimeout(()=>navigate(`/squads/${code}`), 3000)
    })
    
    socket.on('auction:paused', () => setPaused(true))
    socket.on('auction:resumed', () => setPaused(false))
    
    return () => {
      socket.off('connect', joinRoom)
      socket.removeAllListeners()
    }
  }, [code])

  // ✅ BUG FIX: Refresh par persistent squad fetch karna (Teams Box update)
  const loadRoom = async () => {
    const { data } = await supabase.from('rooms')
      .select(`
        *, 
        room_teams(
          *, 
          user:users(display_name,avatar_url),
          squad_picks(
            price_paid_lakhs,
            player:players(name, role)
          )
        )
      `)
      .eq('code', code)
      .single()
      
    if (!data) return
    setRoom(data)
    
    const formattedTeams = (data.room_teams || []).map(t => ({
      ...t,
      picks: t.squad_picks || []
    }))
    
    setTeams(formattedTeams)
    const my = formattedTeams.find(t=>t.user_id===user?.id)
    if (my) setMyTeam(my)
  }

  const placeBid = (inc) => {
    if (!lot || !myTeam || paused) return
    const newAmt = (bid?.amount||0) + inc
    if (myTeam.purse_remaining_lakhs < newAmt) return
    // Optimistic UI Update (Lag feel nahi hoga)
    setBid({ amount: newAmt, teamId: myTeam.id })
    getSocket().emit('bid:place', { roomCode:code, lotId:lot.id, teamId:myTeam.id, amountLakhs:newAmt, userId:user?.id })
  }
  
  const skipPlayer = () => {
    if (!lot || !myTeam || paused) return
    setSkipped(true)
    getSocket().emit('bid:skip', { roomCode:code, lotId:lot.id, teamId:myTeam.id })
  }
  
  const toggleMute = () => { const m=!muted; setMutedState(m); setMuted(m) }
  
  const togglePause = () => {
    const s = getSocket()
    if (paused) s.emit('auction:resume', { roomCode:code, userId:user?.id })
    else s.emit('auction:pause', { roomCode:code, userId:user?.id })
  }

  const rc = ROLE_COLORS[player?.role] || ROLE_COLORS.allrounder
  const isLeading = myTeam && leader === myTeam.team_name
  const canBid = myTeam && !skipped && myTeam.squad_count<(room?.squad_limit||25) && myTeam.purse_remaining_lakhs>(bid?.amount||0) && !paused
  const overseasFull = myTeam && player?.is_overseas && myTeam.overseas_count>=(room?.max_overseas||8)
  const squadFull = myTeam && myTeam.squad_count>=(room?.squad_limit||25)
  const purseInsuff = myTeam && myTeam.purse_remaining_lakhs<=(bid?.amount||0)
  
  const statsObj = tab==='last_ipl'?(player?.stats_last_ipl||{}):tab==='total_ipl'?(player?.stats_total_ipl||{}):(player?.stats_total_t20||{})
  const statFields = room?.sport==='ipl'
    ?[['matches','M'],['runs','Runs'],['wickets','Wkts'],['average','Avg'],['strike_rate','SR'],['economy','Eco'],['highest_score','HS'],['best_bowling','BB'],['fifties','50s'],['hundreds','100s']]
    :room?.sport==='kabaddi'
    ?[['matches','M'],['raid_points','Raid Pts'],['tackle_points','Tkl Pts'],['super_raids','S.Raids'],['super_tackles','S.Tackles'],['high_5s','High-5s']]
    :[['matches','M'],['goals','Goals'],['assists','Assists'],['clean_sheets','CS'],['pass_accuracy','Pass%'],['rating','Rating']]
  const TABS = room?.sport==='ipl'?[['last_ipl','Last IPL'],['total_ipl','IPL Career'],['total_t20','T20 Total']]:room?.sport==='kabaddi'?[['total_ipl','PKL Career']]:[['total_ipl','Career']]
  const decidedCount = soldCount + unsoldCount
  const sportIcon = room?.sport==='kabaddi'?'🤼':room?.sport==='football'?'⚽':'🏏'

  // ─── SUB-COMPONENTS ────────────────────────────────────────────────────

  const PlayerCard = ({ compact }) => !player ? (
    <div className="flex flex-col items-center justify-center h-48 text-muted">
      <div className="text-4xl mb-3">⏳</div>
      <p className="font-mono text-xs tracking-widest text-center">WAITING FOR AUCTION TO START…</p>
    </div>
  ) : (
    <div className={`glass ${compact?'p-4':'p-6'} w-full flex flex-col items-center text-center`}>
      <div className="text-[10px] tracking-[2px] uppercase text-muted mb-2">
        Lot #{lotNum} of {total>0?total:'…'}
      </div>
      <div className={`${compact?'w-16 h-16':'w-20 h-20'} rounded-full flex items-center justify-center text-3xl mb-3 relative flex-shrink-0`}
           style={{background:'linear-gradient(135deg,#1a2535,#2a1a2a)',border:`2.5px solid ${rc.b}`,boxShadow:`0 0 35px ${rc.bg}`}}>
        {player.photo_url && (
          <img src={player.photo_url} alt={player.name} className="w-full h-full rounded-full object-cover"
               onError={e=>{ e.target.style.display='none'; if(e.target.nextSibling) e.target.nextSibling.style.display='block' }}/>
        )}
        <span style={{display:player.photo_url?'none':'block'}}>{sportIcon}</span>
        <span className="absolute -bottom-1 -right-1 text-sm"
              style={{background:'#13131f',borderRadius:'50%',padding:'2px'}}>{FLAGS[player.country]||'🌍'}</span>
      </div>
      <h2 className={`font-bebas ${compact?'text-2xl':'text-3xl'} tracking-[3px] leading-none mb-1`}>{player.name}</h2>
      <div className="text-[10px] uppercase tracking-[2px] text-muted mb-2 flex flex-wrap items-center justify-center gap-1.5 font-semibold">
        {player.batting_style && player.batting_style!=='none' && <span className="text-white/70">{formatStyle(player.batting_style)} Bat</span>}
        {player.batting_style && player.batting_style!=='none' && player.bowling_style && player.bowling_style!=='none' && <span className="opacity-40">•</span>}
        {player.bowling_style && player.bowling_style!=='none' && <span className="text-white/70">{formatStyle(player.bowling_style)}</span>}
      </div>
      <div className="flex flex-wrap gap-1.5 justify-center mb-3">
        <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:rc.bg,color:rc.c,border:`0.5px solid ${rc.b}`}}>{player.role?.replace('_',' ')}</span>
        {player.is_capped && <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:'rgba(100,149,237,0.08)',color:'#8ABCE8',border:'0.5px solid rgba(100,149,237,0.2)'}}>Capped</span>}
        {player.is_overseas && <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:'rgba(242,166,35,0.08)',color:'#F2A623',border:'0.5px solid rgba(242,166,35,0.2)'}}>Overseas</span>}
        <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:'rgba(76,175,125,0.08)',color:'#6DCFA0',border:'0.5px solid rgba(76,175,125,0.2)'}}>Base: {fmt(player.base_price_lakhs)}</span>
      </div>
      {TABS.length>1 && (
        <div className="flex w-full rounded-lg overflow-hidden mb-3" style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>
          {TABS.map(([k,l])=>(
            <button key={k} onClick={()=>setTab(k)} className="flex-1 py-1.5 text-[10px] tracking-wider uppercase transition-colors"
                    style={{background:tab===k?'rgba(242,166,35,0.1)':'transparent',color:tab===k?'#F2A623':'#7A7870',borderRight:'0.5px solid rgba(255,255,255,0.07)'}}>
              {l}
            </button>
          ))}
        </div>
      )}
      <div className="grid grid-cols-3 gap-1.5 w-full">
        {statFields.map(([key,label])=>(
          <div key={key} className="rounded-lg py-2 px-1 text-center" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
            <div className="font-mono text-sm font-semibold">{statsObj[key]??'—'}</div>
            <div className="text-muted text-[9px] uppercase tracking-wide mt-0.5">{label}</div>
          </div>
        ))}
      </div>
    </div>
  )

  const BidButtons = () => (
    <div className="flex flex-col gap-2 w-full">
      {squadFull ? (
        <div className="w-full py-3 rounded-xl text-center text-xs font-bold text-muted" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>Squad Full</div>
      ) : overseasFull ? (
        <div className="w-full py-3 rounded-xl text-center text-xs font-bold" style={{background:'rgba(216,90,48,0.08)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.2)'}}>Overseas Cap Reached</div>
      ) : purseInsuff ? (
        <div className="w-full py-3 rounded-xl text-center text-xs font-bold text-muted" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>Insufficient Funds</div>
      ) : (
        <>
          <button onClick={()=>placeBid(25)} disabled={!canBid||skipped||isLeading}
                  className="w-full py-3 rounded-xl font-bold text-bg text-sm tracking-widest uppercase transition-all disabled:opacity-40"
                  style={{background:'linear-gradient(135deg,#F2A623,#BA7517)',boxShadow:'0 0 20px rgba(242,166,35,0.2)',opacity:isLeading?0.35:1}}>
            + ₹25 Lakhs
          </button>
          {(bid?.amount||0)>=500 && (
            <button onClick={()=>placeBid(50)} disabled={!canBid||skipped||isLeading}
                    className="w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all disabled:opacity-40"
                    style={{background:'rgba(216,90,48,0.15)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.35)',opacity:isLeading?0.35:1}}>
              + ₹50 Lakhs
            </button>
          )}
          {(bid?.amount||0)>=700 && (
            <button onClick={()=>placeBid(100)} disabled={!canBid||skipped||isLeading}
                    className="w-full py-3 rounded-xl font-bold text-sm tracking-widest uppercase transition-all disabled:opacity-40"
                    style={{background:'rgba(181,124,245,0.15)',color:'#B57CF5',border:'0.5px solid rgba(181,124,245,0.35)',opacity:isLeading?0.35:1}}>
              + ₹1 Crore
            </button>
          )}
        </>
      )}
      {/* ✅ UPDATED: Disable if user is already leading the bid */}
      <button onClick={skipPlayer} disabled={skipped || paused || isLeading}
              className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted transition-all disabled:opacity-30"
              style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
        {skipped?'✓ Skipped':'Skip Player'}{skipCount>0&&<span className='ml-2 text-white/40'>{skipCount}/{teams.length}</span>}
      </button>
    </div>
  )

  // ✅ BUG FIX: Accordion Style Expandable Teams List
  const TeamsList = () => (
    <div className="flex flex-col gap-2 p-2 pb-6">
      <div className="text-[10px] tracking-[2px] uppercase text-muted px-2 py-1">Teams</div>
      {teams.map((t,i)=>{
        const isLead = leader && t.team_name===leader
        const isFull = t.squad_count>=(room?.squad_limit||25)
        const isExpanded = expandedTeam === t.id
        const tColor = TEAM_COLORS[i%TEAM_COLORS.length]
        
        return (
          <div key={t.id} className="rounded-xl overflow-hidden transition-all duration-300"
               style={{border:`0.5px solid ${isLead?tColor+'60':'rgba(255,255,255,0.07)'}`,background:isLead?`${tColor}08`:'rgba(255,255,255,0.02)',opacity:isFull?0.6:1}}>
            
            <div 
              className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5 transition-colors"
              onClick={() => setExpandedTeam(isExpanded ? null : t.id)}
            >
              <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:tColor}}/>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1">
                  <div className="text-sm font-semibold truncate">{t.team_name}</div>
                  {t.user_id===user?.id && <span className="text-[8px] bg-gold/20 text-gold px-1 py-0.5 rounded font-bold">YOU</span>}
                </div>
                <div className="font-mono text-[10px] text-muted flex items-center justify-between mt-0.5">
                  <span>{fmt(t.purse_remaining_lakhs)} left</span>
                  <span>{t.squad_count}/{room?.squad_limit||25}</span>
                </div>
              </div>
              
              <div className="flex flex-col items-center justify-center pl-1">
                {isLead && <span className="text-[10px] text-gold font-bold mb-0.5 animate-pulse">↑</span>}
                {t.picks?.length > 0 && (
                  <span className="text-[10px] text-muted transition-transform duration-300" style={{transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)'}}>▼</span>
                )}
              </div>
            </div>

            <div className={`transition-all duration-300 ease-in-out ${isExpanded ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
              {t.picks && t.picks.length>0 && (
                <div className="px-3 pb-3 pt-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar" style={{maxHeight:'15rem', background:'rgba(0,0,0,0.2)', borderTop:'0.5px solid rgba(255,255,255,0.03)'}}>
                  <div className="flex justify-between text-[8px] tracking-widest uppercase text-muted py-1">
                    <span>Squad ({t.picks.length})</span>
                    <span>Price</span>
                  </div>
                  {t.picks.map((pk,pi)=>(
                    <div key={pi} className="flex flex-col text-[10px] py-1 border-b border-white/5">
                      <div className="flex items-center justify-between">
                        <span className="truncate text-white/90 font-medium">{pk.player?.name}</span>
                        <span className="text-gold font-mono ml-2 flex-shrink-0">{fmt(pk.price_paid_lakhs)}</span>
                      </div>
                      <span className="text-white/40 capitalize text-[8px] mt-0.5">{pk.player?.role?.replace('_',' ')}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )

  // ─── TOP BAR ────────────────────────────────────────────────────────────
  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden relative">
      <div className="orb" style={{width:500,height:500,background:'rgba(242,166,35,0.06)',top:-200,right:-150}}/>

      {/* ✅ FIXED RESPONSIVE TOP BAR (Two Rows on Mobile, One Row on Desktop) */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-y-2 px-3 py-2 flex-shrink-0 relative z-10"
           style={{background:'rgba(7,7,14,0.95)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        
        {/* ROW 1 (Mobile) / Left Side (Desktop): Logo and Back Button */}
        <div className="flex items-center justify-between w-full md:w-auto md:justify-start gap-2">
          <span className="font-bebas text-xl tracking-[3px] text-gold">AUCTION<span className="text-white hidden sm:inline"> ARENA</span></span>
          <button onClick={()=>navigate('/dashboard')} className="text-[10px] px-2 py-1.5 rounded-lg text-muted whitespace-nowrap md:hidden"
                  style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>← Dashboard</button>
        </div>

        {/* ROW 2 (Mobile) / Right Side (Desktop): Stats and Controls */}
        <div className="flex items-center justify-between md:justify-end w-full md:w-auto gap-2">
          
          <div className="flex items-center gap-1.5 md:gap-2">
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded text-muted"
                  style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>{code}</span>
            <span className="text-xs text-muted font-mono whitespace-nowrap">{decidedCount}/{total>0?total:'…'}</span>
            
            <div className="w-24 h-1.5 rounded overflow-hidden hidden lg:block mx-2" style={{background:'rgba(255,255,255,0.06)'}}>
              <div className="h-full float-left" style={{width:`${total>0?(soldCount/total)*100:0}%`,background:'linear-gradient(90deg,#2a7a4a,#4CAF7D)',transition:'width 0.5s'}}/>
              <div className="h-full float-left" style={{width:`${total>0?(unsoldCount/total)*100:0}%`,background:'linear-gradient(90deg,#8a2a2a,#D85A30)',transition:'width 0.5s'}}/>
            </div>

            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{background:'rgba(76,175,125,0.12)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.25)'}}>✓{soldCount}</span>
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{background:'rgba(216,90,48,0.12)',color:'#D85A30',border:'0.5px solid rgba(216,90,48,0.25)'}}>✗{unsoldCount}</span>
          </div>

          <div className="flex items-center gap-1.5 ml-auto md:ml-2">
            <button onClick={()=>navigate('/dashboard')} className="text-[10px] px-2 py-1.5 rounded-lg text-muted whitespace-nowrap hidden md:inline-block"
                    style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>← Dashboard</button>
            {isAdmin && (
              <button onClick={togglePause} className="text-[10px] px-2 py-1.5 rounded-lg font-bold"
                      style={{background:paused?'rgba(76,175,125,0.15)':'rgba(242,166,35,0.1)',color:paused?'#4CAF7D':'#F2A623',border:`0.5px solid ${paused?'rgba(76,175,125,0.3)':'rgba(242,166,35,0.25)'}`}}>
                {paused?'▶':'⏸'}
              </button>
            )}
            <button onClick={toggleMute} className="text-[10px] px-2 py-1.5 rounded-lg text-muted"
                    style={{border:'0.5px solid rgba(255,255,255,0.08)'}}>{muted?'🔇':'🔊'}</button>
          </div>
        </div>
      </div>

      {/* ══ DESKTOP 3-COL ══ */}
      <div className="hidden md:grid flex-1 overflow-hidden relative z-10"
           style={{gridTemplateColumns:'210px 1fr 250px'}}>
        <div className="overflow-y-auto border-r custom-scrollbar" style={{borderColor:'rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.2)'}}>
          <TeamsList/>
        </div>
        <div className="overflow-y-auto flex flex-col items-center justify-start px-6 py-5 custom-scrollbar">
          <div className="w-full max-w-[460px]"><PlayerCard compact={false}/></div>
        </div>
        <div className="overflow-y-auto border-l flex flex-col items-center py-5 px-4 custom-scrollbar"
             style={{borderColor:'rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.15)'}}>
          <div className="text-[10px] tracking-[2px] uppercase text-muted mb-1">Current Bid</div>
          <div className={`font-bebas text-5xl tracking-[2px] text-gold ${flash?'scale-125':''}`}
               style={{textShadow:'0 0 50px rgba(242,166,35,0.6)',transition:'transform 0.3s'}}>
            {bid?fmt(bid.amount):'—'}
          </div>
          <div className="text-xs text-muted mb-2 text-center leading-tight">
            {leader?<>Led by<br/><span className="text-gold font-semibold text-sm">{leader}</span></>:'No bids yet'}
          </div>
          <TimerRing sec={timer}/>
          <div className="w-full mt-2"><BidButtons/></div>
          <div className="text-[10px] tracking-[2px] uppercase text-muted self-start mt-3 mb-2">Bid History</div>
          <div className="w-full space-y-1 pb-4">
            {history.length===0&&<p className="text-xs text-muted text-center py-4">No bids on this player yet</p>}
            {history.map((h,i)=>(
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

      {/* ══ MOBILE LAYOUT ══ */}
      <div className="flex md:hidden flex-col flex-1 overflow-hidden relative z-10">
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {mobileTab==='player' && <div className="px-3 py-3"><PlayerCard compact={true}/></div>}

          {mobileTab==='bid' && (
            <div className="px-4 py-4 flex flex-col gap-3">
              {player && (
                <div className="flex items-center gap-3 p-3 rounded-2xl mb-1 anim-1" style={{background:'rgba(255,255,255,0.02)', border:'0.5px solid rgba(255,255,255,0.08)'}}>
                  <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl flex-shrink-0 relative"
                       style={{background:'linear-gradient(135deg,#1a2535,#2a1a2a)', border:`2px solid ${rc.b}`, boxShadow:`0 0 15px ${rc.bg}`}}>
                    {player.photo_url && (
                      <img src={player.photo_url} alt={player.name} className="w-full h-full rounded-full object-cover"
                           onError={e=>{ e.target.style.display='none'; if(e.target.nextSibling) e.target.nextSibling.style.display='block' }}/>
                    )}
                    <span style={{display:player.photo_url?'none':'block'}}>{sportIcon}</span>
                    <span className="absolute -bottom-1 -right-1 text-[10px]" style={{background:'#13131f',borderRadius:'50%',padding:'2px'}}>{FLAGS[player.country]||'🌍'}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[9px] tracking-[2px] uppercase text-muted mb-0.5">Lot #{lotNum}</div>
                    <h3 className="font-bebas text-2xl tracking-[2px] leading-none mb-1 truncate text-white">{player.name}</h3>
                    <div className="flex flex-wrap gap-1.5 mt-1.5">
                      <span className="text-[9px] tracking-widest uppercase font-bold px-1.5 py-0.5 rounded" style={{background:rc.bg,color:rc.c,border:`0.5px solid ${rc.b}`}}>{player.role?.replace('_',' ')}</span>
                      <span className="text-[9px] tracking-widest uppercase font-bold px-1.5 py-0.5 rounded" style={{background:'rgba(76,175,125,0.08)',color:'#6DCFA0',border:'0.5px solid rgba(76,175,125,0.2)'}}>Base: {fmt(player.base_price_lakhs)}</span>
                    </div>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3"
                   style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.08)',borderRadius:14,padding:'12px 16px'}}>
                <div className="flex-1">
                  <div className="text-[10px] tracking-[2px] uppercase text-muted mb-0.5">Current Bid</div>
                  <div className={`font-bebas text-4xl tracking-[2px] text-gold leading-none ${flash?'scale-110':''}`}
                       style={{textShadow:'0 0 30px rgba(242,166,35,0.5)',transition:'transform 0.2s'}}>{bid?fmt(bid.amount):'—'}</div>
                  <div className="text-xs text-muted mt-0.5">{leader?<>Led by <span className="text-gold font-semibold">{leader}</span></>:'No bids yet'}</div>
                </div>
                <TimerRing sec={timer} small/>
              </div>
              <BidButtons/>
              {history.length>0 && (
                <div>
                  <div className="text-[10px] tracking-[2px] uppercase text-muted mb-2">Recent Bids</div>
                  <div className="space-y-1">
                    {history.slice(0,5).map((h,i)=>(
                      <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg"
                           style={{background:i===0?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.02)',border:i===0?'0.5px solid rgba(242,166,35,0.15)':'none'}}>
                        <div className="w-1.5 h-1.5 rounded-full" style={{background:TEAM_COLORS[teams.findIndex(t=>t.id===h.teamId)%TEAM_COLORS.length]||'#888'}}/>
                        <span className="text-xs flex-1 truncate text-muted">{h.teamName}</span>
                        <span className="font-mono text-xs text-gold font-bold">{fmt(h.amountLakhs)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {mobileTab==='teams' && <TeamsList/>}
        </div>

        {/* ── MOBILE BOTTOM TAB BAR ── */}
        <div className="flex-shrink-0 flex relative z-20"
             style={{background:'rgba(7,7,14,0.98)',borderTop:'0.5px solid rgba(255,255,255,0.09)'}}>
          <button onClick={()=>setMobileTab('player')}
                  className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative transition-colors"
                  style={{color:mobileTab==='player'?'#F2A623':'#555'}}>
            <span className="text-lg leading-none">{sportIcon}</span>
            <span className="text-[10px] font-semibold">Player</span>
            {mobileTab==='player' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gold"/>}
          </button>
          <button onClick={()=>setMobileTab('bid')}
                  className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative transition-colors"
                  style={{color:mobileTab==='bid'?'#F2A623':'#555'}}>
            <span className="absolute top-2 right-4 w-2 h-2 rounded-full"
                  style={{background:timer<=5?'#E24B4A':timer<=10?'#F2A623':'#4CAF7D',
                          boxShadow:`0 0 5px ${timer<=5?'#E24B4A':timer<=10?'#F2A623':'#4CAF7D'}`}}/>
            <span className="font-bebas text-base leading-none" style={{color:mobileTab==='bid'?'#F2A623':bid?.teamId?'#F2A623aa':'#555'}}>
              {bid?fmt(bid.amount):'BID'}
            </span>
            <span className="text-[10px] font-semibold">Bid</span>
            {mobileTab==='bid' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gold"/>}
          </button>
          <button onClick={()=>setMobileTab('teams')}
                  className="flex-1 flex flex-col items-center justify-center py-2.5 gap-0.5 relative transition-colors"
                  style={{color:mobileTab==='teams'?'#F2A623':'#555'}}>
            <span className="absolute top-2 right-3 text-[9px] font-bold px-1 rounded"
                  style={{background:'rgba(255,255,255,0.07)',color:'#777'}}>{teams.length}</span>
            <span className="text-lg leading-none">👥</span>
            <span className="text-[10px] font-semibold">Teams</span>
            {mobileTab==='teams' && <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-gold"/>}
          </button>
        </div>
      </div>

      {/* ══ OVERLAYS ══ */}
      {soldOverlay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{background:'rgba(0,0,0,0.85)',backdropFilter:'blur(8px)'}}>
          <div className="text-center p-8 rounded-3xl w-full"
               style={{background:'#13131f',border:`1px solid ${soldOverlay.team?'rgba(76,175,125,0.4)':'rgba(216,90,48,0.4)'}`,animation:'soldPop 0.5s ease both',maxWidth:380}}>
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
            <div className="mt-4 flex justify-center gap-3 flex-wrap">
              <span className="text-[11px] font-bold px-2 py-1 rounded" style={{background:'rgba(76,175,125,0.1)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.2)'}}>✓ {soldCount} Sold</span>
              <span className="text-[11px] font-bold px-2 py-1 rounded" style={{background:'rgba(216,90,48,0.1)',color:'#D85A30',border:'0.5px solid rgba(216,90,48,0.2)'}}>✗ {unsoldCount} Unsold</span>
              <span className="text-[11px] text-muted px-2 py-1 rounded" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                {total-soldCount-unsoldCount} left
              </span>
            </div>
            <p className="text-muted text-xs mt-3">Next player coming up…</p>
          </div>
        </div>
      )}

      {paused && !isAdmin && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{background:'rgba(0,0,0,0.85)',backdropFilter:'blur(8px)'}}>
          <div className="text-center p-10 rounded-3xl" style={{background:'#13131f',border:'1px solid rgba(242,166,35,0.3)',maxWidth:380}}>
            <div className="text-5xl mb-4">⏸</div>
            <div className="font-bebas text-4xl tracking-[3px] text-gold mb-2">Auction Paused</div>
            <p className="text-muted text-sm">Admin ne auction pause kiya hai. Resume hone ka wait karo…</p>
          </div>
        </div>
      )}

      {phase==='finished' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4"
             style={{background:'rgba(0,0,0,0.9)',backdropFilter:'blur(8px)'}}>
          <div className="text-center p-10 rounded-3xl" style={{background:'#13131f',border:'1px solid rgba(242,166,35,0.4)',maxWidth:380}}>
            <div className="text-5xl mb-3">🏆</div>
            <div className="font-bebas text-4xl tracking-[3px] text-gold mb-2">Auction Complete!</div>
            <div className="flex justify-center gap-4 mb-4">
              <span className="text-sm font-bold" style={{color:'#4CAF7D'}}>✓ {soldCount} Sold</span>
              <span className="text-sm font-bold" style={{color:'#D85A30'}}>✗ {unsoldCount} Unsold</span>
            </div>
            <p className="text-muted text-sm">Redirecting to Final Squads…</p>
          </div>
        </div>
      )}
    </div>
  )
}