// ── UnsoldPage.jsx ──────────────────────────────────────────────────────────
import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { getSocket } from '../lib/socket'
import { useStore } from '../store'
import { announcePlayer, announceBid, announceSold, announceUnsold } from '../lib/voice'

const CIRC2 = 2 * Math.PI * 40
function fmt2(l){return l>=100?`₹${(l/100).toFixed(2).replace(/\.?0+$/,'')} Cr`:`₹${l} L`}

export function UnsoldPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useStore()
  const [room, setRoom] = useState(null)
  const [myTeam, setMyTeam] = useState(null)
  const [unsoldList, setUnsoldList] = useState([])
  const [player, setPlayer] = useState(null)
  const [lot, setLot] = useState(null)
  const [lotNum, setLotNum] = useState(0)
  const [totalUnsold, setTotalUnsold] = useState(0)
  const [bid, setBid] = useState(null)
  const [leader, setLeader] = useState(null)
  const [history, setHistory] = useState([])
  const [timer, setTimer] = useState(15)
  const [skipped, setSkipped] = useState(false)
  const [flash, setFlash] = useState(false)

  useEffect(() => {
    loadRoom()
    const socket = getSocket()
    socket.emit('room:join', { roomCode: code, userId: user?.id })
    socket.on('auction:player_up', ({player:p,lot:l,lotNumber,totalLots,basePriceLakhs})=>{
      setPlayer(p);setLot(l);setLotNum(lotNumber);setTotalUnsold(totalLots)
      setBid({amount:basePriceLakhs,teamId:null});setLeader(null);setHistory([]);setTimer(15);setSkipped(false)
      announcePlayer(p,lotNumber,totalLots)
    })
    socket.on('auction:bid_placed',({teamId,teamName,amountLakhs})=>{
      setBid({amount:amountLakhs,teamId});setLeader(teamName)
      setHistory(p=>[{teamId,teamName,amountLakhs,time:new Date()},...p].slice(0,8))
      setFlash(true);setTimeout(()=>setFlash(false),400)
      announceBid(teamName,amountLakhs)
    })
    socket.on('auction:timer_update',({secondsRemaining})=>setTimer(secondsRemaining))
    socket.on('auction:player_sold',({player:p,winnerTeam,finalPriceLakhs})=>{announceSold(p.name,winnerTeam.team_name,finalPriceLakhs)})
    socket.on('auction:player_unsold',({player:p})=>{announceUnsold(p.name)})
    socket.on('auction:phase_change',({phase})=>{ if(phase==='finished') setTimeout(()=>navigate(`/squads/${code}`),2000) })
    return ()=>socket.removeAllListeners()
  },[code])

  const loadRoom = async () => {
    const {data}=await supabase.from('rooms').select('*,room_teams(*,user:users(display_name))').eq('code',code).single()
    if(!data)return;setRoom(data)
    const my=data.room_teams?.find(t=>t.user_id===user?.id);if(my)setMyTeam(my)
    const {data:unsold}=await supabase.from('auction_lots').select('*,player:players(*)').eq('room_id',data.id).eq('status','unsold')
    setUnsoldList(unsold||[]);setTotalUnsold((unsold||[]).length)
  }

  const placeBid=(inc)=>{
    if(!lot||!myTeam)return
    const newAmt=(bid?.amount||0)+inc
    if(myTeam.purse_remaining_lakhs<newAmt)return
    getSocket().emit('bid:place',{roomCode:code,lotId:lot.id,teamId:myTeam.id,amountLakhs:newAmt,userId:user?.id})
  }
  const skipPlayer=()=>{if(!lot||!myTeam)return;setSkipped(true);getSocket().emit('bid:skip',{roomCode:code,lotId:lot.id,teamId:myTeam.id})}

  const red=timer<=5
  const offset=CIRC2*(1-timer/15)

  return (
    <div className="h-screen bg-bg flex flex-col overflow-hidden relative">
      <div className="orb" style={{width:500,height:500,background:'rgba(216,90,48,0.07)',top:-200,right:-150}}/>
      {/* TOP BAR */}
      <div className="flex items-center gap-4 px-5 py-3 flex-shrink-0 relative z-10" style={{background:'rgba(7,7,14,0.95)',borderBottom:'0.5px solid rgba(216,90,48,0.2)'}}>
        <span className="font-bebas text-xl tracking-[3px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <span className="font-mono text-xs px-2 py-0.5 rounded text-muted">{code}</span>
        <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold" style={{background:'rgba(216,90,48,0.12)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.35)'}}>
          <span className="w-2 h-2 rounded-full bg-crimson" style={{animation:'pulse 1.5s infinite'}}/>Unsold Players Round
        </div>
        <div className="flex-1 flex items-center gap-3">
          <span className="text-xs text-muted whitespace-nowrap">Unsold {lotNum}/{totalUnsold}</span>
          <div className="flex-1 h-0.5 rounded overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
            <div className="h-full rounded" style={{width:totalUnsold?`${(lotNum/totalUnsold)*100}%`:'0%',background:'linear-gradient(90deg,#993C1D,#D85A30)',transition:'width 0.5s'}}/>
          </div>
        </div>
      </div>

      <div className="flex-1 grid overflow-hidden relative z-10" style={{gridTemplateColumns:'220px 1fr 240px'}}>
        {/* LEFT: UNSOLD LIST */}
        <div className="overflow-y-auto border-r p-2 flex flex-col gap-1.5" style={{borderColor:'rgba(216,90,48,0.15)',background:'rgba(216,90,48,0.03)'}}>
          <div className="px-2 py-2 mb-1">
            <div className="text-[10px] tracking-[2px] uppercase" style={{color:'#F07050'}}>Unsold Players</div>
            <div className="font-bebas text-3xl tracking-[2px]" style={{color:'#F07050'}}>{totalUnsold}</div>
            <div className="text-muted text-[10px]">in re-auction queue</div>
          </div>
          {unsoldList.map((l,i)=>(
            <div key={l.id} className="flex items-center gap-2 px-3 py-2 rounded-xl transition-all" style={{border:`0.5px solid ${lot?.id===l.id?'rgba(216,90,48,0.4)':'rgba(255,255,255,0.07)'}`,background:lot?.id===l.id?'rgba(216,90,48,0.08)':'rgba(255,255,255,0.02)'}}>
              <span className="font-mono text-[10px] text-muted w-5 text-right">{i+1}</span>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold truncate">{l.player?.name}</div>
                <div className="text-[10px] text-muted truncate">{l.player?.role} · {l.player?.country}</div>
              </div>
              <div className="font-mono text-[10px] text-muted">{fmt2(l.base_price_lakhs)}</div>
            </div>
          ))}
        </div>

        {/* CENTER */}
        <div className="overflow-y-auto flex flex-col items-center py-5 px-6">
          <div className="p-4 rounded-xl mb-4 w-full max-w-[420px] flex items-center gap-3" style={{background:'rgba(216,90,48,0.08)',border:'0.5px solid rgba(216,90,48,0.25)'}}>
            <span className="text-2xl">🔄</span>
            <div>
              <div className="text-sm font-semibold" style={{color:'#F07050'}}>Unsold Players Round</div>
              <div className="text-xs text-muted">Skip tracking has reset. Teams can bid on previously-skipped players.</div>
            </div>
          </div>
          {player && (
            <div className="glass p-6 w-full max-w-[420px] flex flex-col items-center text-center" style={{borderColor:'rgba(216,90,48,0.3)'}}>
              <div className="text-[10px] tracking-[2px] uppercase mb-3" style={{color:'#F07050'}}>Re-Listed · Player {lotNum} of {totalUnsold}</div>
              <div className="w-20 h-20 rounded-full flex items-center justify-center text-4xl mb-4 flex-shrink-0" style={{background:'linear-gradient(135deg,#2a1a1a,#1a1a2a)',border:'2.5px solid rgba(216,90,48,0.5)',boxShadow:'0 0 35px rgba(216,90,48,0.2)'}}>
                {room?.sport==='ipl'?'🏏':room?.sport==='kabaddi'?'🤼':'⚽'}
              </div>
              <h2 className="font-bebas text-3xl tracking-[3px] mb-2">{player.name}</h2>
              <div className="flex flex-wrap gap-1.5 justify-center mb-3">
                <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:'rgba(216,90,48,0.1)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.25)'}}>{player.role}</span>
                <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:'rgba(216,90,48,0.08)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.2)'}}>↩ Re-Listed</span>
                <span className="text-[10px] tracking-widest uppercase font-bold px-2 py-1 rounded" style={{background:'rgba(76,175,125,0.08)',color:'#6DCFA0',border:'0.5px solid rgba(76,175,125,0.2)'}}>Base: {fmt2(player.base_price_lakhs)}</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5 w-full">
                {Object.entries(player.stats_total_ipl||{}).slice(0,9).map(([k,v])=>(
                  <div key={k} className="rounded-lg py-2 px-1 text-center" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
                    <div className="font-mono text-sm font-semibold">{v||'—'}</div>
                    <div className="text-muted text-[9px] uppercase tracking-wide mt-0.5">{k.replace(/_/g,' ')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT */}
        <div className="overflow-y-auto border-l flex flex-col items-center py-5 px-4" style={{borderColor:'rgba(216,90,48,0.15)',background:'rgba(216,90,48,0.02)'}}>
          <div className="text-[10px] tracking-[2px] uppercase text-muted mb-1">Current Bid</div>
          <div className={`font-bebas text-5xl tracking-[2px] text-gold ${flash?'scale-125':''}`} style={{transition:'transform 0.3s',textShadow:'0 0 40px rgba(242,166,35,0.5)'}}>
            {bid?fmt2(bid.amount):'—'}
          </div>
          <div className="text-xs text-muted mb-2">{leader?<>Led by <span className="text-gold font-semibold">{leader}</span></>:'No bids yet'}</div>
          <div className="relative w-24 h-24 mx-auto my-2">
            <svg className="w-full h-full" style={{transform:'rotate(-90deg)'}} viewBox="0 0 90 90">
              <circle cx="45" cy="45" r="40" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="5"/>
              <circle cx="45" cy="45" r="40" fill="none" stroke={red?'#E24B4A':'#D85A30'} strokeWidth="5" strokeDasharray={CIRC2} strokeDashoffset={offset} strokeLinecap="round" style={{transition:'stroke-dashoffset 1s linear'}}/>
            </svg>
            <div className="absolute inset-0 flex items-center justify-center font-mono text-xl font-bold" style={{color:red?'#E24B4A':'#F07050'}}>{timer}</div>
          </div>
          <div className="flex flex-col gap-2 w-full mb-3">
            <button onClick={()=>placeBid(25)} disabled={skipped} className="w-full py-3 rounded-xl font-bold text-bg text-xs tracking-widest uppercase disabled:opacity-40" style={{background:'linear-gradient(135deg,#F2A623,#BA7517)'}}>+ ₹25 Lakhs</button>
            {(bid?.amount||0)>=1000&&<button onClick={()=>placeBid(50)} disabled={skipped} className="w-full py-3 rounded-xl font-bold text-xs tracking-widest uppercase disabled:opacity-40" style={{background:'rgba(216,90,48,0.15)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.35)'}}>+ ₹50 Lakhs</button>}
            <button onClick={skipPlayer} disabled={skipped} className="w-full py-2.5 rounded-xl text-xs font-semibold text-muted disabled:opacity-30" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>{skipped?'✓ Passed':'Pass Player'}</button>
          </div>
          <div className="text-[10px] tracking-[2px] uppercase text-muted self-start mb-2">Bid History</div>
          <div className="w-full space-y-1">
            {history.map((h,i)=>(
              <div key={i} className="flex items-center gap-2 px-2 py-2 rounded-lg" style={{background:i===0?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.02)'}}>
                <span className="text-xs flex-1 truncate text-muted">{h.teamName}</span>
                <span className="font-mono text-xs text-gold font-bold">{fmt2(h.amountLakhs)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
export default UnsoldPage
