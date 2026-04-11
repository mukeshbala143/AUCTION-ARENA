import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { downloadAllSquads, downloadMyTeam } from '../lib/excel'
import { useStore } from '../store'

const fmt = l => l>=100?`₹${(l/100).toFixed(0)} Cr`:`₹${l} L`

export default function ExportPage() {
  const { code } = useParams()
  const { user, profile } = useStore()
  const [room, setRoom] = useState(null)
  const [squads, setSquads] = useState([])
  const [mySquad, setMySquad] = useState(null)
  const [loading, setLoading] = useState(true)
  const [sport, setSport] = useState('ipl')
  const [activeTeam, setActiveTeam] = useState(0)

  useEffect(() => { load() }, [code, user?.id])

  const load = async () => {
    setLoading(true)
    setMySquad(null)

    try {
      const { data: room } = await supabase.from('rooms').select('*').eq('code', code).single()
      if (!room) {
        setRoom(null)
        setSquads([])
        return
      }

      setRoom(room)
      setSport(room.sport)

      // Resolve the real logged-in user even if store hydration is late.
      const { data: authData } = await supabase.auth.getUser()
      const resolvedUserId = user?.id || authData?.user?.id || null

      const { data: teams } = await supabase
        .from('room_teams')
        .select('*, user:users(display_name,avatar_url)')
        .eq('room_id', room.id)
        .order('joined_at', { ascending: true })

      const allSquads = await Promise.all((teams||[]).map(async t => {
        const { data: picks } = await supabase.from('squad_picks').select('*, player:players(*)').eq('team_id', t.id).order('price_paid_lakhs',{ascending:false})
        return { ...t, players: (picks||[]).map(p=>({...p.player, price_paid_lakhs:p.price_paid_lakhs})) }
      }))

      setSquads(allSquads)

      // Strict: My Team = team row mapped to the currently logged-in user only.
      const mine = resolvedUserId ? allSquads.find((s) => s.user_id === resolvedUserId) : null
      setMySquad(mine || null)
    } finally {
      setLoading(false)
    }
  }

  const dlAll = () => downloadAllSquads(squads, code)
  const dlMine = () => { if (mySquad) downloadMyTeam(mySquad, code) }
  const dlCSV = () => {
    const rows = squads.flatMap(sq=>sq.players.map(p=>[sq.team_name,p.name,p.role,p.country,p.is_overseas?'Yes':'No',p.is_capped?'Capped':'Uncapped',p.base_price_lakhs,p.price_paid_lakhs].join(',')))
    const csv = ['Team,Player,Role,Country,Overseas,Capped,Base(L),Sold(L)',...rows].join('\n')
    const b = new Blob([csv],{type:'text/csv'})
    const a = document.createElement('a'); a.href=URL.createObjectURL(b); a.download=`AuctionArena_${code}.csv`; a.click()
  }

  const cols = sport==='ipl'
    ? ['#','Player','Role','Country','Overseas','Capped','Batting','Bowling','Base(L)','Sold(L)','IPL M','IPL Runs','IPL Wkts','IPL Avg','IPL SR','T20 M','T20 Runs','T20 Wkts']
    : sport==='kabaddi'
    ? ['#','Player','Role','Country','Base(L)','Sold(L)','PKL M','Raid Pts','Tackle Pts','Super Raids']
    : ['#','Player','Position','Country','Base(L)','Sold(L)','Matches','Goals','Assists','CS','Rating']

  const getRow = (p, i) => sport==='ipl'
    ? [i+1,p.name,p.role,p.country,p.is_overseas?'Yes':'No',p.is_capped?'Capped':'Uncap',p.batting_style||'—',p.bowling_style||'—',p.base_price_lakhs,p.price_paid_lakhs,p.stats_total_ipl?.matches||0,p.stats_total_ipl?.runs||0,p.stats_total_ipl?.wickets||0,p.stats_total_ipl?.average||0,p.stats_total_ipl?.strike_rate||0,p.stats_total_t20?.matches||0,p.stats_total_t20?.runs||0,p.stats_total_t20?.wickets||0]
    : sport==='kabaddi'
    ? [i+1,p.name,p.role,p.country,p.base_price_lakhs,p.price_paid_lakhs,p.stats_total_ipl?.matches||0,p.stats_total_ipl?.raid_points||0,p.stats_total_ipl?.tackle_points||0,p.stats_total_ipl?.super_raids||0]
    : [i+1,p.name,p.role,p.country,p.base_price_lakhs,p.price_paid_lakhs,p.stats_total_ipl?.matches||0,p.stats_total_ipl?.goals||0,p.stats_total_ipl?.assists||0,p.stats_total_ipl?.clean_sheets||0,p.stats_total_ipl?.rating||0]

  if (loading) return <div className="min-h-screen bg-bg flex items-center justify-center"><div className="text-5xl" style={{animation:'spin 1s linear infinite'}}>⚡</div></div>

  const squad = squads[activeTeam] || squads[0]

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="orb" style={{width:500,height:500,background:'rgba(76,175,125,0.07)',top:-200,right:-150}}/>

      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <Link to={`/squads/${code}`} className="text-muted text-sm hover:text-gold transition-colors no-underline">← Final Squads</Link>
      </nav>

      <div className="relative z-10 max-w-7xl mx-auto px-8 pt-24 pb-12">
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2 anim-1">Export & Download<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h1 className="font-bebas text-5xl tracking-[3px] mb-1 anim-2">Excel <span className="text-gold">Export</span></h1>
        <p className="text-muted text-sm mb-10 anim-3">Download complete squad data with full player stats. Runs entirely in your browser via SheetJS — no server needed.</p>

        {/* DOWNLOAD CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10 anim-3">
          {/* All Teams */}
          <div className="glass p-6" style={{borderColor:'rgba(76,175,125,0.3)'}}>
            <span className="text-4xl block mb-4">📁</span>
            <div className="font-bebas text-2xl tracking-[2px] mb-2">All Teams</div>
            <p className="text-muted text-sm leading-relaxed mb-4">One Excel file with a separate sheet per team. Perfect for sharing complete auction results.</p>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {squads.map(sq=><span key={sq.id} className="text-[10px] px-2 py-0.5 rounded font-bold" style={{background:'rgba(76,175,125,0.1)',color:'#4CAF7D',border:'0.5px solid rgba(76,175,125,0.2)'}}>{sq.team_name.slice(0,12)}</span>)}
            </div>
            <div className="text-muted text-xs mb-4">📄 {squads.length} sheets · .xlsx format</div>
            <button onClick={dlAll} className="w-full py-3 rounded-xl font-bold text-bg text-sm tracking-widest uppercase transition-all hover:-translate-y-0.5" style={{background:'linear-gradient(135deg,#4CAF7D,#3A9060)',boxShadow:'0 0 25px rgba(76,175,125,0.2)'}}>⬇ Download All Teams</button>
          </div>

          {/* My Team */}
          <div className="glass p-6" style={{borderColor:'rgba(242,166,35,0.3)'}}>
            <span className="text-4xl block mb-4">🦁</span>
            <div className="font-bebas text-2xl tracking-[2px] mb-2">My Team Only</div>
            <p className="text-muted text-sm leading-relaxed mb-4">Single sheet for your team. Full player stats, prices paid and bidding details.</p>
            {mySquad&&<div className="flex flex-wrap gap-1.5 mb-4"><span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{background:'rgba(242,166,35,0.1)',color:'#F2A623',border:'0.5px solid rgba(242,166,35,0.2)'}}>{mySquad.team_name}</span><span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{background:'rgba(242,166,35,0.08)',color:'#F2A623',border:'0.5px solid rgba(242,166,35,0.15)'}}>{mySquad.squad_count} players</span></div>}
            {!mySquad && <div className="text-xs text-muted mb-4">No team is linked to this logged-in account in room <span className="font-mono text-white">{code?.toUpperCase()}</span>.</div>}
            <div className="text-muted text-xs mb-4">📄 1 sheet · .xlsx format</div>
            <button onClick={dlMine} disabled={!mySquad} className="btn-gold w-full justify-center text-sm">{mySquad ? '⬇ Download My Team' : 'No Team Found'}</button>
          </div>

          {/* CSV */}
          <div className="glass p-6">
            <span className="text-4xl block mb-4">📋</span>
            <div className="font-bebas text-2xl tracking-[2px] mb-2">All Players CSV</div>
            <p className="text-muted text-sm leading-relaxed mb-4">Flat CSV of all sold players combined. Import into Google Sheets, Notion, or any tool.</p>
            <div className="flex flex-wrap gap-1.5 mb-4"><span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{background:'rgba(100,149,237,0.1)',color:'#8ABCE8',border:'0.5px solid rgba(100,149,237,0.2)'}}>{squads.reduce((a,s)=>a+s.squad_count,0)} players</span><span className="text-[10px] px-2 py-0.5 rounded font-bold" style={{background:'rgba(100,149,237,0.1)',color:'#8ABCE8',border:'0.5px solid rgba(100,149,237,0.2)'}}>CSV format</span></div>
            <div className="text-muted text-xs mb-4">📄 1 file · .csv format</div>
            <button onClick={dlCSV} className="btn-outline w-full justify-center text-sm">⬇ Download CSV</button>
          </div>
        </div>

        {/* PREVIEW TABLE */}
        <div className="anim-4">
          <div className="flex items-center justify-between mb-4">
            <div className="font-bebas text-2xl tracking-[2px]">Preview — <span className="text-gold">{squad?.team_name}</span></div>
            <div className="flex gap-2 overflow-x-auto">
              {squads.map((sq,i)=>(
                <button key={sq.id} onClick={()=>setActiveTeam(i)} className="text-xs px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap transition-all"
                        style={{background:activeTeam===i?'rgba(242,166,35,0.15)':'rgba(255,255,255,0.04)',color:activeTeam===i?'#F2A623':'#7A7870',border:activeTeam===i?'0.5px solid rgba(242,166,35,0.35)':'0.5px solid rgba(255,255,255,0.07)'}}>
                  {sq.team_name.slice(0,10)}
                </button>
              ))}
            </div>
          </div>

          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full" style={{borderCollapse:'collapse',fontSize:'0.75rem'}}>
                <thead>
                  <tr style={{background:'rgba(255,255,255,0.03)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
                    {cols.map(c=><th key={c} className="px-3 py-2.5 text-left text-muted font-semibold whitespace-nowrap" style={{letterSpacing:'1px',fontSize:'0.65rem',textTransform:'uppercase'}}>{c}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {(squad?.players||[]).map((p,i)=>(
                    <tr key={i} style={{borderBottom:'0.5px solid rgba(255,255,255,0.04)'}} onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,0.025)'} onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                      {getRow(p,i).map((v,j)=>(
                        <td key={j} className="px-3 py-2 whitespace-nowrap" style={{color:j===1?'var(--text)':j===8||j===9?'#F2A623':'var(--muted)',fontFamily:typeof v==='number'?'JetBrains Mono,monospace':'inherit',fontWeight:j===1?600:400}}>
                          {v}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-muted text-xs mt-3 leading-relaxed">
            <strong className="text-white">Columns:</strong> Player · Role · Country · Overseas · Capped · Batting/Bowling Style · Base Price · Sold Price · Full IPL & T20 Stats (matches, runs, wickets, avg, SR, economy, HS, best bowling, 50s, 100s)
          </p>
        </div>
      </div>
    </div>
  )
}
