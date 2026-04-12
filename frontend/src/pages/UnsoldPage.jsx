import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getAccessToken, supabase } from '../lib/supabase'
import { getSocket } from '../lib/socket'
import { useStore } from '../store'

const fmt = (l) => l >= 100 ? `₹${(l/100).toFixed(2).replace(/\.?0+$/, '')} Cr` : `₹${l} L`
const ROLES = ['all', 'batsman', 'allrounder', 'bowler', 'wicketkeeper']
const ROLE_COLORS = {batsman:{c:'#8ABCE8',bg:'rgba(100,149,237,0.12)',b:'rgba(100,149,237,0.25)'},bowler:{c:'#F2A623',bg:'rgba(242,166,35,0.1)',b:'rgba(242,166,35,0.2)'},allrounder:{c:'#6DCFA0',bg:'rgba(76,175,125,0.1)',b:'rgba(76,175,125,0.2)'},wicketkeeper:{c:'#F07050',bg:'rgba(216,90,48,0.1)',b:'rgba(216,90,48,0.2)'}}
const TEAM_COLORS = ['#F2A623','#D85A30','#4CAF7D','#6495ED','#B57CF5','#4ECDC4','#FF6B6B','#FFE66D']
const MAX_UNSOLD_SELECTIONS = 5
const CRICKET_ROLE_ORDER = ['batsman', 'bowler', 'wicketkeeper', 'allrounder']
const CRICKET_ROLE_LABELS = {
  batsman: 'Batsman',
  bowler: 'Bowler',
  wicketkeeper: 'Wicketkeeper',
  allrounder: 'All-Rounder',
}
const CRICKET_ROLE_SHORT_LABELS = {
  batsman: 'BAT',
  bowler: 'BWL',
  wicketkeeper: 'WK',
  allrounder: 'AR',
}

function normalizeRole(role) {
  const rawRole = String(role || '').toLowerCase()
  if (rawRole === 'wicket_keeper') return 'wicketkeeper'
  if (rawRole === 'all_rounder') return 'allrounder'
  return rawRole
}

function getTeamRoleSummary(picks = []) {
  const counts = { batsman: 0, bowler: 0, wicketkeeper: 0, allrounder: 0 }
  const grouped = { batsman: [], bowler: [], wicketkeeper: [], allrounder: [] }
  const others = []

  for (const pick of picks) {
    const normalizedRole = normalizeRole(pick?.player?.role)
    if (grouped[normalizedRole]) {
      grouped[normalizedRole].push(pick)
      counts[normalizedRole] += 1
    } else {
      others.push(pick)
    }
  }

  return { counts, grouped, others }
}

function getSafePlayerImage(url) {
  if (!url || typeof url !== 'string') return null

  try {
    const parsed = new URL(url)
    const proxyHosts = new Set([
      'external-content.duckduckgo.com',
      'duckduckgo.com'
    ])

    if (proxyHosts.has(parsed.hostname)) {
      const actualUrl = parsed.searchParams.get('u')
      if (!actualUrl) return null
      return getSafePlayerImage(decodeURIComponent(actualUrl))
    }

    return parsed.toString()
  } catch {
    if (url.startsWith('/')) return url
    return null
  }
}

function getPlayerImage(player) {
  return getSafePlayerImage(player?.image_url || player?.photo_url)
}

export default function UnsoldPage() {
  const { code } = useParams()
  const navigate = useNavigate()
  const { user } = useStore()
  const [room, setRoom] = useState(null)
  const [myTeam, setMyTeam] = useState(null)
  const [teams, setTeams] = useState([])
  const [unsoldList, setUnsoldList] = useState([])
  const [selected, setSelected] = useState([]) 
  const [roleFilter, setRoleFilter] = useState('all')
  const [searchTerm, setSearchTerm] = useState('')
  const [isDone, setIsDone] = useState(false)
  const [doneTeams, setDoneTeams] = useState([]) 
  const [loading, setLoading] = useState(false)
  const [expandedTeam, setExpandedTeam] = useState(null)
  const [selectionError, setSelectionError] = useState('')

  useEffect(() => {
    loadData()
    const socket = getSocket()

    const joinRoom = async () => {
      const token = await getAccessToken()
      if (!token) return
      socket.emit('room:join', { roomCode: code, userId: user?.id, token })
    }
    joinRoom()
    socket.on('connect', joinRoom)

    socket.on('unsold:team_done', ({ teamId }) => {
      setDoneTeams(prev => [...new Set([...prev, teamId])])
    })

    socket.on('unsold:start_auction', () => {
      navigate(`/auction/${code}`)
    })

    return () => {
      socket.off('connect', joinRoom)
      socket.off('unsold:team_done')
      socket.off('unsold:start_auction')
    }
  }, [code, user])

  const loadData = async () => {
    const { data: roomData } = await supabase.from('rooms')
      .select(`
        *, 
        room_teams(
          *, 
          user:users(display_name),
          squad_picks(
            price_paid_lakhs,
            player:players(name, role)
          )
        )
      `)
      .eq('code', code).single()
      
    if (!roomData) return
    setRoom(roomData)
    
    const formattedTeams = (roomData.room_teams || []).map(t => ({
      ...t,
      picks: t.squad_picks || []
    }))
    
    setTeams(formattedTeams)
    
    const my = formattedTeams.find(t => t.user_id === user?.id)
    if (my) setMyTeam(my)

    const { data: unsold } = await supabase.from('auction_lots')
      .select('*, player:players(*)')
      .eq('room_id', roomData.id)
      .eq('status', 'unsold')
    setUnsoldList(unsold || [])

    const { data: doneData } = await supabase.from('room_teams')
      .select('id').eq('room_id', roomData.id).eq('unsold_ready', true)
    setDoneTeams((doneData || []).map(t => t.id))

    if (my) {
      const { data: mySelections } = await supabase.from('unsold_selections')
        .select('lot_id').eq('team_id', my.id)
      setSelected((mySelections || []).map(s => s.lot_id).slice(0, MAX_UNSOLD_SELECTIONS))
      const alreadyDone = (doneData || []).find(t => t.id === my.id)
      if (alreadyDone) setIsDone(true)
    }
  }

  const toggleSelect = async (lotId) => {
    if (isDone || !myTeam || mySquadFull || myPurseEmpty) return
    const isSelected = selected.includes(lotId)
    if (isSelected) {
      setSelectionError('')
      setSelected(prev => prev.filter(id => id !== lotId))
      const { error } = await supabase.from('unsold_selections')
        .delete().eq('team_id', myTeam.id).eq('lot_id', lotId)
      if (error) {
        console.error("Error removing selection:", error.message)
        setSelected(prev => [...prev, lotId]) // Revert UI on failure
      }
    } else {
      if (selected.length >= MAX_UNSOLD_SELECTIONS) {
        setSelectionError(`Each team can select only ${MAX_UNSOLD_SELECTIONS} unsold players for re-auction.`)
        return
      }
      setSelectionError('')
      setSelected(prev => [...prev, lotId])
      const { error } = await supabase.from('unsold_selections')
        .upsert({ room_id: room.id, team_id: myTeam.id, lot_id: lotId })
      if (error) {
        console.error("Error adding selection:", error.message)
        setSelected(prev => prev.filter(id => id !== lotId)) // Revert UI on failure
      }
    }
  }

  const handleDone = async () => {
    if (!myTeam || isDone) return
    setLoading(true)
    const token = await getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }
    await supabase.from('room_teams')
      .update({ unsold_ready: true }).eq('id', myTeam.id)
    getSocket().emit('unsold:team_done', { roomCode: code, teamId: myTeam.id, token })
    setIsDone(true)
    setLoading(false)
  }

  const handleStartAuction = async () => {
    if (!room) return
    setLoading(true)
    const token = await getAccessToken()
    if (!token) {
      setLoading(false)
      return
    }

    const { data: selections } = await supabase.from('unsold_selections')
      .select('lot_id').eq('room_id', room.id)
    
    const selectedLotIds = [...new Set((selections || []).map(s => s.lot_id))]

    if (selectedLotIds.length === 0) {
      await supabase.from('rooms').update({ status: 'finished' }).eq('id', room.id)
      navigate(`/squads/${code}`)
      return
    }

    await supabase.from('auction_lots')
      .update({ status: 'pending', is_unsold_round: true })
      .in('id', selectedLotIds)

    await supabase.from('room_teams')
      .update({ unsold_ready: false }).eq('room_id', room.id)

    getSocket().emit('unsold:start_auction', { roomCode: code, userId: user?.id, lotIds: selectedLotIds, token })
    setLoading(false)
  }

  const isAdmin = room?.admin_id === user?.id
  const squadLimit = room?.squad_limit || 25
  const mySquadFull = myTeam && myTeam.squad_count >= squadLimit
  const myPurseEmpty = myTeam && myTeam.purse_remaining_lakhs <= 0

  const filteredList = unsoldList
    .filter(l => {
      const matchesRole =
        roleFilter === 'all'
          ? true
          : roleFilter === 'uncapped'
            ? !l.player?.is_capped
            : l.player?.role === roleFilter

      const matchesSearch = l.player?.name?.toLowerCase().includes(searchTerm.trim().toLowerCase())

      return matchesRole && matchesSearch
    })
    .sort((a, b) => {
      const aIsSelected = selected.includes(a.id)
      const bIsSelected = selected.includes(b.id)
      if (aIsSelected !== bIsSelected) return aIsSelected ? -1 : 1
      return (a.lot_number || 0) - (b.lot_number || 0)
    })

  const allTeamsDone = teams.length > 0 && teams.every(t => doneTeams.includes(t.id))

  return (
    <div className="min-h-screen bg-bg flex flex-col" style={{maxWidth:"100vw",overflowX:"hidden"}}>
      <div className="orb" style={{width:500,height:500,background:'rgba(216,90,48,0.06)',top:-200,right:-150}}/>

      {/* TOP BAR */}
      <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0 relative z-10 flex-wrap"
           style={{background:'rgba(7,7,14,0.95)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        
        <button onClick={() => navigate('/dashboard')} 
                className="text-[10px] md:text-xs px-2 py-1.5 md:px-3 md:py-2 rounded-lg text-muted hover:text-gold transition-colors"
                style={{border:'0.5px solid rgba(255,255,255,0.08)', background:'rgba(255,255,255,0.02)'}}>
          ← <span className="hidden sm:inline">Dashboard</span>
        </button>

        <span className="font-bebas text-lg md:text-xl tracking-[3px] text-gold hidden sm:block">AUCTION<span className="text-white"> ARENA</span></span>
        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded text-muted hidden sm:block">{code}</span>
        
        <div className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider"
             style={{background:'rgba(216,90,48,0.12)',color:'#F07050',border:'0.5px solid rgba(216,90,48,0.3)'}}>
          🔄 Unsold Selection
        </div>
        
        <div className="flex-1"/>
        <span className="text-[10px] text-muted font-mono">{doneTeams.length}/{teams.length} Ready</span>
      </div>

      <div className="flex-1 flex flex-col md:flex-row gap-0 relative z-10" style={{minHeight:0}}>

        {/* LEFT: Teams status */}
        <div className="md:w-60 flex-shrink-0 md:border-r border-b overflow-x-auto md:overflow-y-auto p-3 flex md:flex-col flex-row gap-2 custom-scrollbar"
             style={{borderColor:'rgba(255,255,255,0.07)',background:'rgba(0,0,0,0.2)'}}>
          <div className="text-[10px] tracking-[2px] uppercase text-muted px-2 py-1 hidden md:block">Teams Status</div>
          
          {teams.map((t, i) => {
            const done = doneTeams.includes(t.id)
            const full = t.squad_count >= squadLimit
            const isMe = t.user_id === user?.id
            const { counts, grouped, others } = getTeamRoleSummary(t.picks || [])
            return (
              <div key={t.id} className="rounded-xl flex-shrink-0 overflow-hidden transition-all duration-300"
                   style={{background: done ? 'rgba(76,175,125,0.08)' : 'rgba(255,255,255,0.02)',
                           border: `0.5px solid ${done ? 'rgba(76,175,125,0.3)' : 'rgba(255,255,255,0.07)'}`,
                           width: 'min-[160px]'}}> 
                
                <div className="flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-white/5" onClick={() => setExpandedTeam(expandedTeam===t.id?null:t.id)}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background: TEAM_COLORS[i % TEAM_COLORS.length]}}/>
                  <span className="text-xs font-semibold truncate flex-1">{t.team_name}</span>
                  {isMe && <span className="text-[8px] bg-gold/20 text-gold px-1 py-0.5 rounded font-bold">YOU</span>}
                  {done && <span className="text-[10px] text-emerald font-bold">✓</span>}
                  <span className="text-[10px] text-muted transition-transform duration-300" style={{transform: expandedTeam===t.id ? 'rotate(180deg)' : 'rotate(0deg)'}}>▼</span>
                </div>
                
                <div className="px-3 pb-2 text-[10px] text-muted flex justify-between">
                  <span>{t.squad_count}/{squadLimit}</span>
                  <span className="font-mono text-gold">{fmt(t.purse_remaining_lakhs)}</span>
                </div>
                <div className="px-3 pb-2 grid grid-cols-2 gap-1">
                  {CRICKET_ROLE_ORDER.map((role) => {
                    const rc = ROLE_COLORS[role] || ROLE_COLORS.allrounder
                    return (
                      <div key={role} className="rounded-md px-2 py-1 min-w-0"
                           style={{background:rc.bg,color:rc.c,border:`0.5px solid ${rc.b}`}}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[8px] font-bold uppercase tracking-[1px] truncate">{CRICKET_ROLE_SHORT_LABELS[role]}</span>
                          <span className="text-[10px] font-mono font-bold leading-none flex-shrink-0">{counts[role]}</span>
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className={`transition-all duration-300 ease-in-out ${expandedTeam === t.id ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'} overflow-hidden`}>
                  {t.picks && t.picks.length > 0 ? (
                    <div className="px-3 pb-3 pt-1 flex flex-col gap-1 overflow-y-auto custom-scrollbar" style={{maxHeight:'15rem', background:'rgba(0,0,0,0.15)', borderTop:'0.5px solid rgba(255,255,255,0.03)'}}>
                      <div className="flex justify-between text-[8px] tracking-widest uppercase text-muted py-1">
                        <span>Squad</span><span>Price</span>
                      </div>
                      {CRICKET_ROLE_ORDER.map((role) => {
                        const rolePicks = grouped[role]
                        const rc = ROLE_COLORS[role] || ROLE_COLORS.allrounder
                        if (!rolePicks.length) return null

                        return (
                          <div key={role} className="pt-1">
                            <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[1px] px-2 py-1 rounded-md mb-1"
                                 style={{background:rc.bg,color:rc.c,border:`0.5px solid ${rc.b}`}}>
                              <span>{CRICKET_ROLE_LABELS[role]}</span>
                              <span>{rolePicks.length}</span>
                            </div>
                            {rolePicks.map((pk, pi) => (
                              <div key={`${role}-${pi}`} className="flex flex-col text-[10px] py-1 border-b border-white/5">
                                <div className="flex items-center justify-between">
                                  <span className="truncate text-white/90 font-medium">{pk.player?.name}</span>
                                  <span className="text-gold font-mono ml-2 flex-shrink-0">{fmt(pk.price_paid_lakhs)}</span>
                                </div>
                                <span className="text-white/40 capitalize text-[8px] mt-0.5">{CRICKET_ROLE_LABELS[role]}</span>
                              </div>
                            ))}
                          </div>
                        )
                      })}
                      {others.length > 0 && (
                        <div className="pt-1">
                          <div className="flex items-center justify-between text-[9px] font-bold uppercase tracking-[1px] px-2 py-1 rounded-md mb-1"
                               style={{background:'rgba(255,255,255,0.05)',color:'#B8B6AE',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                            <span>Other Roles</span>
                            <span>{others.length}</span>
                          </div>
                          {others.map((pk, pi) => (
                            <div key={`other-${pi}`} className="flex flex-col text-[10px] py-1 border-b border-white/5">
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
                  ) : (
                    <div className="px-3 py-2 text-[9px] text-muted text-center italic bg-black/20 border-t border-white/5">No players bought</div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* CENTER: Player selection */}
        <div className="flex-1 flex flex-col overflow-hidden">
          
          {/* Role filter tabs */}
          <div className="flex flex-col gap-3 px-4 py-3 flex-shrink-0"
               style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
            <div
              className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3"
              style={{background:'rgba(216,90,48,0.14)',border:'1px solid rgba(240,112,80,0.45)',boxShadow:'0 0 0 1px rgba(240,112,80,0.08), 0 12px 28px rgba(216,90,48,0.12)'}}
            >
              <div>
                <div className="text-[11px] tracking-[2px] uppercase font-bold" style={{color:'#ffb19e'}}>Important Restriction</div>
                <div className="text-sm font-semibold mt-1" style={{color:'#ffd7cd'}}>
                  Each team can select only {MAX_UNSOLD_SELECTIONS} unsold players for re-auction.
                </div>
              </div>
              <div className="px-3 py-2 rounded-xl text-lg font-bold shrink-0" style={{background:'rgba(255,255,255,0.08)',color:'#fff',border:'1px solid rgba(255,255,255,0.08)'}}>
                {selected.length}/{MAX_UNSOLD_SELECTIONS}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted">🔍</span>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Search player name"
                  className="w-full rounded-xl pl-9 pr-10 py-2.5 text-sm text-white placeholder:text-white/30 outline-none"
                  style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.08)'}}
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted hover:text-white transition-colors"
                  >
                    ✕
                  </button>
                )}
              </div>
              <span className="text-[10px] sm:text-xs text-gold font-bold px-2 py-1 rounded bg-gold/10 whitespace-nowrap shrink-0 hidden sm:block">
                {selected.length}/{MAX_UNSOLD_SELECTIONS} Selected
              </span>
            </div>

            <div className="flex items-center gap-1 overflow-x-auto custom-scrollbar">
              <span className="text-xs text-muted mr-2 flex-shrink-0 tracking-widest uppercase">Filter:</span>
              {['all', ...ROLES.filter(r=>r!=='all'), 'uncapped'].map(r => (
                <button key={r} onClick={() => setRoleFilter(r)}
                        className="px-3 py-1.5 text-[10px] sm:text-[11px] font-bold tracking-wider uppercase transition-all rounded-lg flex-shrink-0 whitespace-nowrap"
                        style={{background: roleFilter===r ? 'rgba(242,166,35,0.15)' : 'rgba(255,255,255,0.03)',
                                color: roleFilter===r ? '#F2A623' : '#7A7870',
                                border: `0.5px solid ${roleFilter===r ? 'rgba(242,166,35,0.3)' : 'rgba(255,255,255,0.05)'}`}}>
                  {r}
                </button>
              ))}
            </div>
          </div>

          {/* ✅ MOBILE ACTION BAR (Top View for mobile only) */}
          <div className="flex md:hidden flex-col gap-3 px-4 py-3 flex-shrink-0 z-10 shadow-md"
               style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)', background:'rgba(0,0,0,0.2)'}}>
            
            {!isDone ? (
              <>
                {/* Badge Left, Text Right */}
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[11px] text-gold font-bold px-3 py-1.5 rounded-lg bg-gold/10 whitespace-nowrap shrink-0 border border-gold/20">
                    {selected.length}/{MAX_UNSOLD_SELECTIONS} Selected
                  </span>
                  <span className="text-[10px] text-muted text-right leading-tight">
                    {mySquadFull ? 'Squad full — Please submit.' : myPurseEmpty ? 'Purse empty — Please submit.' : `You have selected ${selected.length} players to bring back.`}
                  </span>
                </div>
                
                {/* ✅ Button Right-Aligned, Half Width */}
                <div className="flex justify-end">
                  <button onClick={handleDone} disabled={loading} 
                          className="w-1/2 px-2 py-2.5 rounded-xl font-bold text-[11px] tracking-wider uppercase disabled:opacity-50 shadow-lg hover:brightness-110"
                          style={{background: 'linear-gradient(135deg,#F2A623,#BA7517)', color: '#13131f'}}>
                    {loading ? 'Processing...' : '✓ Submit'}
                  </button>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 w-full">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald animate-pulse"/>
                  <span className="text-xs font-bold text-emerald tracking-wide">Selections Submitted</span>
                </div>
                <span className="text-[10px] text-muted font-mono">Waiting for others: {doneTeams.length}/{teams.length} Ready</span>
                {isAdmin && (
                  <button onClick={handleStartAuction}
                          disabled={!allTeamsDone || loading}
                          className="w-full mt-1 px-6 py-2.5 rounded-xl font-bold text-[11px] tracking-widest uppercase transition-all"
                          style={{background: allTeamsDone ? 'linear-gradient(135deg,#4CAF7D,#2a7a4a)' : 'rgba(255,255,255,0.06)',
                                  color: allTeamsDone ? '#fff' : '#555',
                                  border: `0.5px solid ${allTeamsDone ? 'rgba(76,175,125,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                  cursor: allTeamsDone ? 'pointer' : 'not-allowed'}}>
                    {loading ? 'Starting...' : allTeamsDone ? '🚀 Start Unsold Round' : 'Waiting for Teams...'}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Player grid */}
          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            {mySquadFull || myPurseEmpty ? (
              <div className="flex flex-col items-center justify-center h-full min-h-[300px] text-center">
                <div className="text-5xl mb-4">{mySquadFull ? '✅' : '💸'}</div>
                <div className="font-bebas text-3xl text-gold tracking-widest mb-1">
                  {mySquadFull ? 'Squad Full!' : 'Purse Empty!'}
                </div>
                <p className="text-sm text-muted">
                  {mySquadFull ? 'You have reached the maximum squad limit.' : 'You have no funds left to bid.'}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
                {filteredList.map(l => {
                  const isSelected = selected.includes(l.id)
                  const rc = ROLE_COLORS[l.player?.role] || ROLE_COLORS.allrounder
                  const imageUrl = getPlayerImage(l.player)
                  
                  return (
                    <div key={l.id}
                         onClick={() => toggleSelect(l.id)}
                         className="rounded-xl p-4 cursor-pointer transition-all relative flex flex-col items-center justify-center"
                         style={{background: isSelected ? 'rgba(242,166,35,0.08)' : 'rgba(255,255,255,0.02)',
                                 border: `0.5px solid ${isSelected ? 'rgba(242,166,35,0.4)' : 'rgba(255,255,255,0.05)'}`,
                                 opacity: isDone ? 0.6 : 1,
                                 transform: isSelected && !isDone ? 'scale(1.02)' : 'scale(1)'}}>
                      
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold shadow-lg"
                             style={{background:'#F2A623',color:'#13131f'}}>✓</div>
                      )}
                      
                      <div className="w-14 h-14 rounded-full flex items-center justify-center text-2xl mb-3"
                           style={{background:'linear-gradient(135deg,#1a2535,#2a1a2a)', border:`1.5px solid ${rc.b}`, boxShadow:`0 0 15px ${rc.bg}`}}>
                        {imageUrl
                          ? <img src={imageUrl} alt={l.player?.name || 'Player'} className="w-full h-full rounded-full object-cover" onError={e=>e.target.style.display='none'}/>
                          : '🏏'}
                      </div>
                      
                      <div className="text-sm font-bold text-center truncate w-full text-white/90">{l.player?.name}</div>
                      <div className="text-[10px] font-bold tracking-widest text-center mt-1 uppercase"
                           style={{color: rc.c}}>{l.player?.role?.replace('_',' ')}</div>
                      <div className="text-xs font-mono font-bold text-muted text-center mt-1.5 px-2 py-0.5 rounded" style={{background:'rgba(255,255,255,0.04)'}}>{fmt(l.base_price_lakhs)}</div>
                    </div>
                  )
                })}
                {filteredList.length === 0 && (
                  <div className="col-span-full flex flex-col items-center justify-center py-20 text-muted text-sm">
                    <div className="text-4xl mb-3 opacity-50">🔍</div>
                    <p>No unsold players found for this filter or search.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ✅ DESKTOP FIXED ACTION BAR (Hidden on Mobile) */}
          <div className="hidden md:flex flex-shrink-0 px-4 py-3 items-center gap-4"
               style={{borderTop:'0.5px solid rgba(255,255,255,0.07)',background:'rgba(7,7,14,0.9)'}}>
            
            {!isDone ? (
              <>
                <span className="text-xs text-muted flex-1 text-left">
                  {mySquadFull ? 'Squad full — Please submit your status.' : myPurseEmpty ? 'Purse empty — Please submit your status.' : `You have selected ${selected.length} players to bring back.`}
                </span>
                <span className="text-xs font-semibold" style={{color:'#F07050'}}>
                  Max {MAX_UNSOLD_SELECTIONS} players per team
                </span>
                {!!selectionError && (
                  <span className="text-xs font-semibold" style={{color:'#ff9d8b'}}>
                    {selectionError}
                  </span>
                )}
                <button onClick={handleDone} disabled={loading}
                        className="w-auto px-6 py-2.5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all disabled:opacity-50 shadow-lg hover:brightness-110"
                        style={{background:'linear-gradient(135deg,#F2A623,#BA7517)',color:'#13131f'}}>
                  {loading ? 'Processing...' : '✓ Submit Selections'}
                </button>
              </>
            ) : (
              <div className="flex-1 flex flex-row items-center justify-between gap-3 w-full">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald animate-pulse"/>
                  <span className="text-xs font-bold text-emerald tracking-wide">Selections Submitted</span>
                </div>
                <span className="text-xs text-muted font-mono">Waiting for others: {doneTeams.length}/{teams.length} Ready</span>
                {isAdmin && (
                  <button onClick={handleStartAuction}
                          disabled={!allTeamsDone || loading}
                          className="w-auto px-6 py-2.5 rounded-xl font-bold text-sm tracking-widest uppercase transition-all"
                          style={{background: allTeamsDone ? 'linear-gradient(135deg,#4CAF7D,#2a7a4a)' : 'rgba(255,255,255,0.06)',
                                  color: allTeamsDone ? '#fff' : '#555',
                                  border: `0.5px solid ${allTeamsDone ? 'rgba(76,175,125,0.4)' : 'rgba(255,255,255,0.08)'}`,
                                  cursor: allTeamsDone ? 'pointer' : 'not-allowed'}}>
                    {loading ? 'Starting...' : allTeamsDone ? '🚀 Start Unsold Round' : 'Waiting for Teams...'}
                  </button>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
