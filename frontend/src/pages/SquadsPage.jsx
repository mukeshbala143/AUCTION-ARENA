import { useState, useEffect, useMemo } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SPORT_COLOR = { ipl:'#F2A623', kabaddi:'#D85A30', football:'#4CAF7D' }
const TC = ['#F2A623','#D85A30','#4CAF7D','#6495ED','#B57CF5','#4ECDC4','#FF6B6B','#FFE66D','#A8DADC','#F72585']
const FLAGS = {'India':'🇮🇳','Australia':'🇦🇺','England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','South Africa':'🇿🇦','New Zealand':'🇳🇿','West Indies':'🇯🇲','Sri Lanka':'🇱🇰','Afghanistan':'🇦🇫','France':'🇫🇷','Norway':'🇳🇴','Netherlands':'🇳🇱','Spain':'🇪🇸','Brazil':'🇧🇷','Iran':'🇮🇷','Bangladesh':'🇧🇩'}
const fmt = l => l>=100?`₹${(l/100).toFixed(0)} Cr`:`₹${l} L`
const roleIcon = (role) => role==='batsman'?'🏏':role==='bowler'?'🎳':role==='allrounder'?'🔄':role==='wicketkeeper'?'🥊':role==='raider'?'⚡':role==='defender'?'🛡️':'⚽'

export default function SquadsPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const [room, setRoom] = useState(null)
  const [squads, setSquads] = useState([])
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)
  const [busyAction, setBusyAction] = useState('')

  useEffect(() => { load() }, [code])

  const load = async () => {
    setLoading(true)
    const { data: room } = await supabase.from('rooms').select('*').eq('code', code).single()
    if (!room) {
      setLoading(false)
      return
    }
    setRoom(room)

    // Faster loading: fetch all teams + all picks in two queries (instead of one query per team).
    const [{ data: teams }, { data: picks }] = await Promise.all([
      supabase.from('room_teams').select('*, user:users(display_name,avatar_url)').eq('room_id', room.id),
      supabase
        .from('squad_picks')
        .select('*, player:players(*), lot:auction_lots(lot_number,is_unsold_round)')
        .eq('room_id', room.id)
        .order('picked_at', { ascending: false }),
    ])

    const picksByTeam = (picks || []).reduce((acc, pick) => {
      if (!acc[pick.team_id]) acc[pick.team_id] = []
      acc[pick.team_id].push(pick)
      return acc
    }, {})

    const allSquads = (teams || []).map((t, i) => ({
      ...t,
      players: picksByTeam[t.id] || [],
      color: TC[i % TC.length],
    }))

    setSquads(allSquads)
    setLoading(false)
  }

  const sportLabel = { ipl:'🏏 IPL Cricket', kabaddi:'🤼 Pro Kabaddi', football:'⚽ World Football' }
  const totalSpent = useMemo(
    () => squads.reduce((a, s) => a + ((room?.purse_lakhs || 0) - s.purse_remaining_lakhs), 0),
    [room?.purse_lakhs, squads]
  )

  const goTo = (path, action) => {
    setBusyAction(action)
    navigate(path)
  }

  if (loading) return (
    <div className="min-h-screen bg-bg flex items-center justify-center">
      <div className="text-center"><div className="text-5xl mb-3" style={{animation:'spin 1s linear infinite'}}>⚡</div><p className="text-muted font-mono text-sm tracking-widest">LOADING SQUADS…</p></div>
    </div>
  )

  return (
    <div className="min-h-screen bg-bg relative">
      
      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex gap-2">
          <button
            onClick={() => goTo(`/export/${code}`, 'export')}
            disabled={busyAction !== ''}
            className="btn-outline text-xs"
            style={{padding:'0.5rem 1rem', opacity: busyAction !== '' && busyAction !== 'export' ? 0.6 : 1}}
          >
            {busyAction === 'export' ? '⏳ Opening…' : '📊 Export Excel'}
          </button>
          <button
            onClick={() => goTo(`/analysis/${code}`, 'analysis')}
            disabled={busyAction !== ''}
            className="text-xs px-4 py-2 rounded-lg font-bold transition-all"
            style={{background:'rgba(76,175,125,0.12)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.25)', opacity: busyAction !== '' && busyAction !== 'analysis' ? 0.6 : 1}}
          >
            {busyAction === 'analysis' ? '⏳ Opening…' : '🤖 AI Analysis'}
          </button>
        </div>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto px-8 pt-24 pb-12">
        {/* BACK BUTTON */}
        <Link to="/dashboard" className="inline-flex items-center gap-2 text-xs font-bold tracking-[2px] uppercase text-muted hover:text-gold transition-colors mb-6 anim-1">
          <span className="text-lg leading-none">←</span> Back to Dashboard
        </Link>

        {/* COMPLETED BANNER */}
        <div className="flex items-center gap-4 p-5 rounded-2xl mb-8 anim-1" style={{background:'rgba(76,175,125,0.08)',border:'0.5px solid rgba(76,175,125,0.25)'}}>
          <span className="text-3xl">✅</span>
          <div>
            <div className="font-semibold text-sm" style={{color:'#6DCFA0'}}>Auction Complete — {code} · {sportLabel[room?.sport]} · {squads.length} Teams</div>
            <div className="text-muted text-xs mt-0.5">All players auctioned. Total spent: {fmt(totalSpent)} across all teams.</div>
          </div>
        </div>

        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">Final Results<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h1 className="font-bebas text-5xl tracking-[3px] mb-2 anim-2">Final <span className="text-gold">Squads</span></h1>

        {/* SUMMARY */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 anim-3">
          {[['Squads',squads.length],['Players Sold',squads.reduce((a,s)=>a+s.squad_count,0)],['Total Spent',fmt(totalSpent)],['Avg Purse',fmt(Math.round(totalSpent/Math.max(squads.length,1)))]].map(([l,v])=>(
            <div key={l} className="surface p-5">
              <div className="font-bebas text-3xl tracking-[2px] text-gold">{v}</div>
              <div className="text-xs text-muted tracking-widest uppercase mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* ROLE FILTER */}
        <div className="flex gap-2 mb-8 flex-wrap anim-3">
          {[['all','All Players'],['batsman','Batsmen'],['bowler','Bowlers'],['allrounder','All-Rounders'],['wicketkeeper','Wicket-Keepers'],['overseas','Overseas Only']].map(([k,l])=>(
            <button key={k} onClick={()=>setFilter(k)} className="text-xs px-4 py-2 rounded-lg font-semibold transition-all"
                    style={{background:filter===k?'rgba(242,166,35,0.15)':'rgba(255,255,255,0.04)',color:filter===k?'#F2A623':'#7A7870',border:filter===k?'0.5px solid rgba(242,166,35,0.35)':'0.5px solid rgba(255,255,255,0.07)'}}>
              {l}
            </button>
          ))}
        </div>

        {/* TEAMS GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {squads.map((sq,i)=>{
            const spent = (room?.purse_lakhs||0) - sq.purse_remaining_lakhs
            const filteredPlayers = filter==='all' ? sq.players
              : filter==='overseas' ? sq.players.filter(p=>p.player?.is_overseas)
              : sq.players.filter(p=>p.player?.role===filter)
            const roundGroups = filteredPlayers.reduce((acc, pick) => {
              const key = pick.lot?.is_unsold_round ? 'unsold' : 'main'
              if (!acc[key]) acc[key] = []
              acc[key].push(pick)
              return acc
            }, {})
            const roundSections = [
              { key: 'main', title: 'Main Round' },
              { key: 'unsold', title: 'Unsold Round' },
            ].filter(section => (roundGroups[section.key] || []).length > 0)
            return (
              <div key={sq.id} className="rounded-2xl overflow-hidden transition-all duration-300 anim-1" style={{border:`0.5px solid rgba(255,255,255,0.08)`,background:'#13131f',animationDelay:`${i*0.06}s`, boxShadow:'0 10px 30px rgba(0,0,0,0.18)'}}>
                {/* TEAM HEADER */}
                <div className="p-6 relative overflow-hidden" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
                  <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 pointer-events-none" style={{background:sq.color,filter:'blur(30px)',transform:'translate(30%,-30%)'}}/>
                  <div className="absolute top-4 right-5 font-bebas text-7xl opacity-[0.05] pointer-events-none leading-none">{i+1}</div>
                  <div className="flex items-center gap-3 mb-4 relative z-10">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-2xl" style={{background:`${sq.color}15`,border:`1.5px solid ${sq.color}50`}}>{sq.user?.avatar_url||'🦁'}</div>
                    <div>
                      <div className="font-bebas text-xl tracking-[2px]">{sq.team_name}</div>
                      <div className="text-xs text-muted">{sq.user?.display_name} · {sq.squad_count} players</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 relative z-10">
                    {[[fmt(spent),'Spent',sq.color],[fmt(sq.purse_remaining_lakhs),'Remaining','#4CAF7D'],[`${sq.overseas_count}/${room?.max_overseas||8}`,'Overseas','#F2A623']].map(([v,l,c])=>(
                      <div key={l} className="p-3 rounded-xl" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.06)'}}>
                        <div className="font-mono text-sm font-bold" style={{color:c}}>{v}</div>
                        <div className="text-muted text-[10px] uppercase tracking-wide">{l}</div>
                      </div>
                    ))}
                  </div>
                  {/* Purse bar */}
                  <div className="mt-3 h-1 rounded overflow-hidden relative z-10" style={{background:'rgba(255,255,255,0.06)'}}>
                    <div className="h-full rounded" style={{width:`${(spent/(room?.purse_lakhs||1))*100}%`,background:`linear-gradient(90deg,${sq.color}80,${sq.color})`}}/>
                  </div>
                </div>

                {/* PLAYER LIST */}
                <div className="max-h-72 overflow-y-auto">
                  {filteredPlayers.length===0
                    ? <div className="py-6 text-center text-muted text-xs">No players for this filter</div>
                    : roundSections.map(({ key, title }) => {
                      const picksInRound = [...(roundGroups[key] || [])].sort(
                        (a, b) => (b.lot?.lot_number || 0) - (a.lot?.lot_number || 0)
                      )
                      return (
                        <div key={key}>
                          <div className="sticky top-0 z-[1] px-4 py-2 text-[10px] tracking-[2px] uppercase font-semibold"
                               style={{background:'rgba(7,7,14,0.9)',color:'#F2A623',borderTop:'0.5px solid rgba(255,255,255,0.06)',borderBottom:'0.5px solid rgba(255,255,255,0.06)'}}>
                            {title} · Latest First
                          </div>
                          {picksInRound.map((pick,j)=>(
                            <div key={pick.id} className="flex items-center gap-3 px-4 py-2.5 transition-colors" style={{borderBottom:j<picksInRound.length-1?'0.5px solid rgba(255,255,255,0.04)':'none'}}
                                 onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.03)'}
                                 onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                              <span className="text-xs w-5 flex-shrink-0">{roleIcon(pick.player?.role)}</span>
                              <span className="text-sm flex-1 min-w-0 truncate">{pick.player?.name}</span>
                              <span className="text-base flex-shrink-0">{FLAGS[pick.player?.country]||'🌍'}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{background:'rgba(255,255,255,0.06)',color:'#7A7870'}}>
                                #{pick.lot?.lot_number || '—'}
                              </span>
                              <span className="font-mono text-xs flex-shrink-0 font-bold text-gold">{fmt(pick.price_paid_lakhs)}</span>
                            </div>
                          ))}
                        </div>
                      )
                    })
                  }
                </div>

                {/* FOOTER */}
                <div className="p-3 flex gap-2" style={{borderTop:'0.5px solid rgba(255,255,255,0.07)'}}>
                  <button
                    onClick={() => goTo(`/export/${code}`, 'export')}
                    disabled={busyAction !== ''}
                    className="flex-1 py-2 rounded-lg text-center text-xs font-bold transition-all"
                    style={{background:'rgba(242,166,35,0.08)',color:'#F2A623',border:'0.5px solid rgba(242,166,35,0.2)', opacity: busyAction !== '' && busyAction !== 'export' ? 0.6 : 1}}
                  >
                    {busyAction === 'export' ? '⏳ Opening…' : '📊 Export'}
                  </button>
                  <button
                    onClick={() => goTo(`/analysis/${code}`, 'analysis')}
                    disabled={busyAction !== ''}
                    className="flex-1 py-2 rounded-lg text-center text-xs font-bold transition-all"
                    style={{background:'rgba(76,175,125,0.08)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.2)', opacity: busyAction !== '' && busyAction !== 'analysis' ? 0.6 : 1}}
                  >
                    {busyAction === 'analysis' ? '⏳ Opening…' : '🤖 Analyse'}
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
