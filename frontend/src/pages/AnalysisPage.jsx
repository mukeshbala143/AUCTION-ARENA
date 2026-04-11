import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { API_BASE_URL } from '../lib/config'

const STEPS = ['Parsing all squad data and player statistics…','Evaluating batting depth and opening combinations…','Scoring bowling attack — pace, spin, powerplay, death…','Analysing overseas slot optimization and budget efficiency…','Ranking all teams and generating written insights…']
const fmt = l => l>=100?`₹${(l/100).toFixed(0)} Cr`:`${l} L`
const breakdownLabels = {
  player_quality: 'Player Quality',
  t20_record: 'T20 Record',
  five_year_ipl: '5Y IPL Proxy',
  recent_form: 'Last Season',
  current_form: 'Current Form',
  consistency: 'Consistency',
  fitness_availability: 'Availability',
  specialization: 'Specialization',
  role_balance: 'Role Balance',
  budget_efficiency: 'Budget',
  squad_completion: 'Squad Size',
  overseas_usage: 'Overseas Use',
  auction_timing: 'Buying Time',
}

function fmtDateTime(value) {
  if (!value) return 'Not available'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return 'Not available'
  return new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function hasValue(value) {
  return value !== null && value !== undefined
}

function getTeamActualSize(team) {
  return team?.squad_status?.actual_size ?? team?.roster_summary?.player_count ?? null
}

function getTeamTargetSize(team, room, roomSettings) {
  return team?.squad_status?.target_size ?? roomSettings?.squad_limit ?? room?.squad_limit ?? 25
}

function isMeaningfulTeam(team) {
  const actualSize = getTeamActualSize(team)
  if (hasValue(actualSize) && Number(actualSize) > 0) return true
  if ((team?.best_xi || []).length > 0) return true
  if ((team?.top_players || []).length > 0) return true
  return false
}

function Confetti() {
  const colors = ['#F2A623','#4CAF7D','#6495ED','#D85A30','#B57CF5','#fff']
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{zIndex:0}}>
      {Array.from({length:40}).map((_,i)=>(
        <div key={i} style={{position:'absolute',width:8,height:8,borderRadius:2,left:`${Math.random()*100}%`,background:colors[Math.floor(Math.random()*colors.length)],animation:`confetti ${2+Math.random()*3}s linear ${Math.random()*2}s infinite`,transform:`rotate(${Math.random()*360}deg)`}}/>
      ))}
    </div>
  )
}

export default function AnalysisPage() {
  const { code } = useParams()
  const [phase, setPhase] = useState('loading')
  const [stepIdx, setStepIdx] = useState(0)
  const [pct, setPct] = useState(0)
  const [analysis, setAnalysis] = useState(null)
  const [room, setRoom] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => { run() }, [code])

  const run = async () => {
    const { data: r } = await supabase.from('rooms').select('*').eq('code', code).single()
    if (!r) {
      setError('Room not found.');
      setPhase('error');
      return;
    }
    setRoom(r);

    // Animate steps
    let si = 0
    const iv = setInterval(() => { si++; setStepIdx(si); setPct(Math.min(90, si*20)); if(si>=STEPS.length) clearInterval(iv) }, 1800)

    try {
      // Securely call the backend, which in turn calls the Gemini API.
      // This avoids exposing the API key on the client-side.
      const res = await fetch(`${API_BASE_URL}/api/analysis/${code}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!res.ok) {
        const raw = await res.text();
        let errMsg = `Analysis failed with status: ${res.status}`

        try {
          const errData = JSON.parse(raw);
          errMsg = errData?.error || errData?.details || errMsg
        } catch {
          if (raw) errMsg = raw
        }

        throw new Error(errMsg);
      }

      const parsed = await res.json();
      clearInterval(iv); setPct(100); setStepIdx(STEPS.length);
      setTimeout(() => { setAnalysis(parsed); setPhase('results') }, 800);
    } catch(e) {
      clearInterval(iv);
      setError(e.message || 'Analysis failed. Check the backend server and your Gemini API key.');
      setPhase('error');
    }
  }

  const visibleTeams = (analysis?.ranked_teams || []).filter(isMeaningfulTeam)
  const rank1 = visibleTeams?.[0]
  const generatedBy = analysis?.generated_by || 'unknown'
  const participantCount = analysis?.participant_team_count || visibleTeams?.length || 0
  const isGemini = String(generatedBy).startsWith('gemini:')
  const roomSettings = analysis?.room_settings || {}
  const winnerSummary = analysis?.winner_summary
  const rankBadge = [null,'🥇','🥈','🥉']
  const predictColor = { 'Top 2':'#4CAF7D', 'Playoffs':'#F2A623', 'Top Half':'#F2A623', 'Bottom Half':'#7A7870', 'Last Place':'#D85A30' }

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="orb" style={{width:600,height:600,background:'rgba(76,175,125,0.08)',top:-200,right:-150}}/>
      {phase==='results'&&<Confetti/>}

      <nav className="fixed top-0 left-0 right-0 z-50 px-8 py-4 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex gap-2">
          <Link to={`/squads/${code}`} className="text-muted text-sm hover:text-gold transition-colors no-underline">← Squads</Link>
          <Link to={`/export/${code}`} className="btn-outline text-xs no-underline ml-2" style={{padding:'0.5rem 1rem'}}>📊 Export</Link>
        </div>
      </nav>

      <div className="relative z-10 max-w-6xl mx-auto px-4 sm:px-8 pt-24 pb-12">

        {/* LOADING */}
        {phase==='loading' && (
          <div className="min-h-[80vh] flex flex-col items-center justify-center gap-8 anim-1">
            <div className="relative w-32 h-32">
              <div className="absolute inset-0 rounded-full flex items-center justify-center text-5xl" style={{background:'rgba(76,175,125,0.1)',border:'1px solid rgba(76,175,125,0.3)'}}>🤖</div>
              <div className="absolute inset-[-12px] rounded-full" style={{border:'1px solid rgba(76,175,125,0.15)',animation:'ringPulse 2s ease infinite'}}/>
              <div className="absolute inset-[-24px] rounded-full" style={{border:'1px solid rgba(76,175,125,0.08)',animation:'ringPulse 2s 0.5s ease infinite'}}/>
            </div>
            <div className="text-center">
              <h2 className="font-bebas text-5xl tracking-[3px] mb-2">Gemini is<br/><span className="text-emerald">Analysing</span></h2>
              <p className="text-muted text-sm max-w-sm">Evaluating all final squads with Gemini to generate team rankings and expert comments.</p>
            </div>
            <div className="flex items-center gap-6 w-full max-w-lg">
              <div className="flex-1 space-y-2">
                {STEPS.map((s,i)=>(
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm transition-all" style={{background:i<stepIdx?'rgba(76,175,125,0.06)':i===stepIdx?'rgba(242,166,35,0.06)':'rgba(255,255,255,0.02)',border:`0.5px solid ${i<stepIdx?'rgba(76,175,125,0.2)':i===stepIdx?'rgba(242,166,35,0.25)':'rgba(255,255,255,0.07)'}`,color:i<stepIdx?'#6DCFA0':i===stepIdx?'#E8E2D9':'#7A7870'}}>
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{background:i<stepIdx?'#4CAF7D':i===stepIdx?'#F2A623':'rgba(255,255,255,0.2)',animation:i===stepIdx?'pulse 1.5s infinite':'none'}}/>
                    {s}
                  </div>
                ))}
              </div>
              <div className="font-bebas text-5xl tracking-[2px] text-emerald">{pct}%</div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase==='error' && (
          <div className="min-h-[80vh] flex items-center justify-center">
            <div className="text-center p-12 rounded-3xl" style={{background:'#13131f',border:'1px solid rgba(216,90,48,0.3)'}}>
              <div className="text-5xl mb-4">❌</div>
              <h2 className="font-bebas text-3xl tracking-[3px] text-crimson mb-3">Analysis Failed</h2>
              <p className="text-muted text-sm mb-6">{error}</p>
              <p className="text-xs text-muted mb-6">Make sure your Gemini API key is set in `backend/.env` as `GEMINI_API_KEY`.</p>
              <Link to={`/squads/${code}`} className="btn-outline no-underline">← Back to Squads</Link>
            </div>
          </div>
        )}

        {/* RESULTS */}
        {phase==='results' && analysis && (
          <div>
            <div className="text-xs tracking-[3px] uppercase flex items-center gap-3 mb-2 anim-1" style={{color:'#4CAF7D'}}>
              Gemini · Squad Intelligence<div className="flex-1 h-px" style={{background:'rgba(76,175,125,0.2)'}}/>
            </div>
            <div className="mb-3 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] tracking-[1px] uppercase"
                 style={{background:isGemini?'rgba(76,175,125,0.12)':'rgba(242,166,35,0.12)',border:isGemini?'0.5px solid rgba(76,175,125,0.3)':'0.5px solid rgba(242,166,35,0.3)',color:isGemini?'#6DCFA0':'#F2A623'}}>
              {isGemini ? `Live AI: ${generatedBy}` : `Fallback Mode: ${generatedBy}`}
            </div>
            <div className="mb-3 text-xs text-muted">Room: <span className="text-white font-mono">{analysis?.room_code || code?.toUpperCase()}</span> · Participating teams analysed: <span className="text-gold">{participantCount}</span></div>
            <h1 className="font-bebas text-5xl tracking-[3px] mb-1 anim-2">Team <span style={{color:'#4CAF7D'}}>Rankings</span></h1>
            <p className="text-muted text-sm mb-8 anim-3">Gemini now scores every team out of 100 using player performance, ranking strength, owner buying timing, budget efficiency, and whether the admin squad-size target was fully completed.</p>

            <div className="text-xs text-muted mb-6 anim-3">
              Best-team logic now gives extra weight to T20 record, last IPL output, current form, specialization, squad balance, and availability proxies from the stored player stats.
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8 anim-3">
              {[
                ['Teams Analysed', participantCount],
                ['Squad Target', `${roomSettings?.squad_limit || room?.squad_limit || 25} players`],
                ['Purse Per Team', fmt(roomSettings?.purse_lakhs || room?.purse_lakhs || 0)],
                ['Overseas Cap', roomSettings?.max_overseas || room?.max_overseas || 0],
              ].map(([label, value]) => (
                <div key={label} className="surface p-4">
                  <div className="text-[10px] tracking-[2px] uppercase text-muted mb-2">{label}</div>
                  <div className="font-bebas text-3xl tracking-[2px] text-white">{value}</div>
                </div>
              ))}
            </div>

            {!!analysis.analysis_criteria?.length && (
              <div className="surface p-5 mb-8 anim-4">
                <div className="text-[10px] tracking-[2px] uppercase text-gold mb-3">Scoring Criteria</div>
                <div className="flex flex-wrap gap-2">
                  {analysis.analysis_criteria.map((item) => (
                    <span key={item} className="px-3 py-2 rounded-full text-[11px]" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)',color:'#E8E2D9'}}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* WINNER BANNER */}
            {rank1 && (
              <div className="relative overflow-hidden rounded-3xl p-10 text-center mb-8 anim-3" style={{background:'rgba(242,166,35,0.06)',border:'1px solid rgba(242,166,35,0.3)'}}>
                <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 50% -20%,rgba(242,166,35,0.15),transparent 60%)'}}/>
                <div className="text-5xl mb-2 relative z-10" style={{animation:'float 3s ease infinite'}}>🏆</div>
                <div className="text-xs tracking-[3px] uppercase text-gold mb-2 relative z-10">Tournament Winner · {room?.sport?.toUpperCase()} Auction</div>
                <h2 className="font-bebas text-5xl tracking-[4px] mb-1 relative z-10">{rank1.team_name}</h2>
                <div className="font-mono text-xl text-gold relative z-10">Score: {rank1.overall_score} / 100</div>
                {rank1.squad_status && (
                  <div className="mt-4 flex flex-wrap items-center justify-center gap-2 relative z-10">
                    <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(255,255,255,0.05)',border:'0.5px solid rgba(255,255,255,0.09)'}}>
                      Squad: {rank1.squad_status.actual_size}/{rank1.squad_status.target_size}
                    </span>
                    <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(76,175,125,0.12)',border:'0.5px solid rgba(76,175,125,0.3)',color:'#6DCFA0'}}>
                      {rank1.squad_status.is_complete ? 'Full squad completed' : `${rank1.squad_status.missing_players} player short`}
                    </span>
                    {rank1.auction_strategy?.label && (
                      <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(100,149,237,0.12)',border:'0.5px solid rgba(100,149,237,0.28)',color:'#8ABCE8'}}>
                        Owner timing: {rank1.auction_strategy.label}
                      </span>
                    )}
                  </div>
                )}
                <p className="text-muted text-sm max-w-xl mx-auto mt-3 leading-relaxed relative z-10">{rank1.analysis}</p>
                {analysis.tournament_summary&&<div className="mt-4 p-4 rounded-xl text-xs text-muted relative z-10" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>{analysis.tournament_summary}</div>}
              </div>
            )}

            {winnerSummary && (
              <div className="surface p-6 mb-8 anim-4">
                <div className="text-[10px] tracking-[2px] uppercase text-gold mb-3">Why This Is The Best Team</div>
                <div className="grid grid-cols-1 lg:grid-cols-[1.1fr_0.9fr] gap-5">
                  <div>
                    <div className="text-sm text-muted mb-3">
                      Ranking priority: highest total points first. If two teams have the same points, the smaller squad size ranks higher.
                    </div>
                    <div className="space-y-2">
                      {winnerSummary.reasons?.map((reason, idx) => (
                        <div key={idx} className="px-4 py-3 rounded-xl text-sm" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
                          {idx + 1}. {reason}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs tracking-[2px] uppercase text-muted mb-3">Top 3 Players Behind Rank 1</div>
                    <div className="space-y-2">
                      {winnerSummary.top_players?.map((player, idx) => (
                        <div key={`${player.name}-${idx}`} className="rounded-xl p-4" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.07)'}}>
                          <div className="flex items-center justify-between gap-3 mb-1">
                            <div className="font-semibold text-sm">{player.name}</div>
                            <div className="font-bebas text-2xl tracking-[2px] text-gold">{player.impact_score}</div>
                          </div>
                          <div className="text-[10px] uppercase tracking-[1px] text-muted mb-1">{player.role}</div>
                          <div className="text-xs text-muted">{player.reason}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SPECIAL AWARDS */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8 anim-4">
              {analysis.most_valuable_pick&&(
                <div className="surface p-5 flex items-start gap-4">
                  <span className="text-3xl flex-shrink-0">💎</span>
                  <div>
                    <div className="text-xs tracking-[2px] uppercase text-gold mb-1">Most Valuable Pick</div>
                    <div className="font-semibold text-sm mb-0.5">{analysis.most_valuable_pick.player_name}</div>
                    <div className="text-gold font-mono text-xs mb-2">{fmt(analysis.most_valuable_pick.price_paid)}</div>
                    <div className="text-muted text-xs leading-relaxed">{analysis.most_valuable_pick.reason}</div>
                  </div>
                </div>
              )}
              {analysis.biggest_overpay&&(
                <div className="surface p-5 flex items-start gap-4">
                  <span className="text-3xl flex-shrink-0">💸</span>
                  <div>
                    <div className="text-xs tracking-[2px] uppercase mb-1" style={{color:'#F07050'}}>Biggest Overpay</div>
                    <div className="font-semibold text-sm mb-0.5">{analysis.biggest_overpay.player_name}</div>
                    <div className="font-mono text-xs mb-2" style={{color:'#F07050'}}>{fmt(analysis.biggest_overpay.price_paid)}</div>
                    <div className="text-muted text-xs leading-relaxed">{analysis.biggest_overpay.reason}</div>
                  </div>
                </div>
              )}
            </div>

            {/* FULL RANKINGS */}
            <div className="font-bebas text-3xl tracking-[3px] mb-5">Full Team Rankings</div>
            <div className="space-y-6">
              {visibleTeams?.map((team, i) => (
                <div key={i} className="rounded-2xl overflow-hidden transition-all hover:translate-x-1 anim-1" style={{background:'#13131f',border:`0.5px solid ${i===0?'rgba(242,166,35,0.35)':i===1?'rgba(192,192,192,0.25)':i===2?'rgba(205,127,50,0.25)':'rgba(255,255,255,0.07)'}`,animationDelay:`${i*0.07}s`, boxShadow:'0 12px 34px rgba(0,0,0,0.2)'}}>
                  <div className="flex items-center gap-4 p-5" style={{borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0" style={{background:i===0?'rgba(242,166,35,0.12)':i===1?'rgba(192,192,192,0.1)':i===2?'rgba(205,127,50,0.1)':'rgba(255,255,255,0.04)',border:`0.5px solid ${i===0?'rgba(242,166,35,0.35)':i===1?'rgba(192,192,192,0.25)':i===2?'rgba(205,127,50,0.25)':'rgba(255,255,255,0.1)'}`}}>
                      {rankBadge[team.rank]||<span className="font-bebas text-xl text-muted">{team.rank}</span>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-bebas text-2xl tracking-[2px]">{team.team_name}</div>
                      <div className="text-xs text-muted">{team.owner}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bebas text-3xl tracking-[2px] text-gold">{team.overall_score}</div>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-1 rounded overflow-hidden" style={{background:'rgba(255,255,255,0.07)'}}>
                          <div className="h-full rounded" style={{width:`${team.overall_score}%`,background:'linear-gradient(90deg,#BA7517,#F2A623)',transition:'width 1s ease'}}/>
                        </div>
                        <span className="text-[10px] px-2 py-0.5 rounded font-bold tracking-widest uppercase whitespace-nowrap" style={{background:`${predictColor[team.predicted_finish]||'#7A7870'}15`,color:predictColor[team.predicted_finish]||'#7A7870',border:`0.5px solid ${predictColor[team.predicted_finish]||'#7A7870'}40`}}>
                          {team.predicted_finish}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="p-5">
                    <div className="flex flex-wrap gap-2 mb-4">
                      <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                        Squad {hasValue(getTeamActualSize(team)) ? getTeamActualSize(team) : 'Not available'}/{getTeamTargetSize(team, room, roomSettings)}
                      </span>
                      <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                        Purse Left {hasValue(team?.roster_summary?.purse_remaining) ? fmt(team.roster_summary.purse_remaining) : 'Not available'}
                      </span>
                      <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(255,255,255,0.04)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                        Overseas {hasValue(team?.roster_summary?.overseas_count) ? team.roster_summary.overseas_count : 'Not available'}/{roomSettings?.max_overseas ?? room?.max_overseas ?? 0}
                      </span>
                      {!!team.roster_summary?.specialization_tags?.length && (
                        <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(76,175,125,0.08)',border:'0.5px solid rgba(76,175,125,0.18)',color:'#6DCFA0'}}>
                          {team.roster_summary.specialization_tags.join(' · ')}
                        </span>
                      )}
                      {team.auction_strategy?.label && (
                        <span className="px-3 py-1.5 rounded-full text-[11px]" style={{background:'rgba(100,149,237,0.12)',border:'0.5px solid rgba(100,149,237,0.25)',color:'#8ABCE8'}}>
                          {team.auction_strategy.label}
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                      <div className="rounded-xl p-4" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                        <div className="text-[10px] tracking-[2px] uppercase text-gold mb-3">Rule Compliance</div>
                        <div className="flex items-center justify-between gap-3 mb-3">
                          <div>
                            <div className="text-sm font-semibold">{team.squad_status?.is_complete ? 'Squad target completed' : 'Squad target not completed'}</div>
                            <div className="text-xs text-muted">
                              {hasValue(team?.squad_status?.actual_size) ? team.squad_status.actual_size : 'Not available'}/{team.squad_status?.target_size ?? roomSettings?.squad_limit ?? 25} players
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="font-bebas text-2xl tracking-[2px]" style={{color:team.squad_status?.is_complete ? '#4CAF7D' : '#F07050'}}>
                              {team.squad_status?.completion_pct ?? 0}%
                            </div>
                            {!!team.score_breakdown?.penalty_points && (
                              <div className="text-[10px] uppercase tracking-[1px]" style={{color:'#F07050'}}>
                                -{team.score_breakdown.penalty_points} penalty
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="w-full h-2 rounded-full overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
                          <div className="h-full rounded-full" style={{width:`${team.squad_status?.completion_pct ?? 0}%`,background:team.squad_status?.is_complete ? 'linear-gradient(90deg,#2f8f56,#4CAF7D)' : 'linear-gradient(90deg,#c4533b,#F07050)'}}/>
                        </div>
                      </div>

                      <div className="rounded-xl p-4" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.08)'}}>
                        <div className="text-[10px] tracking-[2px] uppercase text-gold mb-3">Owner Buying Timing</div>
                        <div className="text-sm font-semibold mb-1">{team.auction_strategy?.label || 'Not available'}</div>
                        <div className="text-xs text-muted leading-relaxed mb-3">{team.auction_strategy?.summary || 'No buy timing data available for this team.'}</div>
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div className="px-3 py-2 rounded-lg" style={{background:'rgba(255,255,255,0.04)'}}>
                            <div className="text-muted mb-1">First Buy</div>
                            <div>{fmtDateTime(team.auction_strategy?.first_buy_at)}</div>
                          </div>
                          <div className="px-3 py-2 rounded-lg" style={{background:'rgba(255,255,255,0.04)'}}>
                            <div className="text-muted mb-1">Last Buy</div>
                            <div>{fmtDateTime(team.auction_strategy?.last_buy_at)}</div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {!!team.score_breakdown && (
                      <div className="mb-4">
                        <div className="text-[10px] tracking-[2px] uppercase text-muted mb-2">Score Breakdown</div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {Object.entries(team.score_breakdown)
                            .filter(([key]) => key !== 'penalty_points' && key !== 'total_before_penalty')
                            .map(([key, value]) => (
                              <div key={key} className="rounded-xl p-3" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.06)'}}>
                                <div className="text-[10px] text-muted uppercase tracking-[1px] mb-1">{breakdownLabels[key] || key}</div>
                                <div className="font-bebas text-2xl tracking-[2px] text-white">{value}</div>
                              </div>
                            ))}
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <div className="text-[10px] tracking-[2px] uppercase mb-2" style={{color:'#4CAF7D'}}>✅ Strengths</div>
                        <div className="space-y-1.5">
                          {team.strengths?.map((s,j)=><div key={j} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg leading-relaxed" style={{background:'rgba(76,175,125,0.06)',border:'0.5px solid rgba(76,175,125,0.15)',color:'var(--text)'}}>⚡ {s}</div>)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] tracking-[2px] uppercase mb-2" style={{color:'#F07050'}}>⚠️ Weaknesses</div>
                        <div className="space-y-1.5">
                          {team.weaknesses?.map((w,j)=><div key={j} className="flex items-start gap-2 text-xs px-3 py-2 rounded-lg leading-relaxed" style={{background:'rgba(216,90,48,0.06)',border:'0.5px solid rgba(216,90,48,0.15)',color:'var(--text)'}}>⚠ {w}</div>)}
                        </div>
                      </div>
                    </div>

                    {team.best_xi?.length>0&&(
                      <div className="mb-4">
                        <div className="text-[10px] tracking-[2px] uppercase text-muted mb-2">Predicted Best XI</div>
                        <div className="grid grid-cols-4 gap-1.5">
                          {team.best_xi.map((p,j)=><div key={j} className="text-[10px] px-2 py-1.5 rounded-lg text-center text-muted truncate" style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.06)'}}>{p}</div>)}
                        </div>
                      </div>
                    )}

                    {team.analysis&&<div className="px-4 py-3 rounded-xl text-sm text-muted leading-relaxed italic" style={{background:'rgba(255,255,255,0.02)',border:'0.5px solid rgba(255,255,255,0.06)'}}>{team.analysis}</div>}
                  </div>
                </div>
              ))}
            </div>

            {visibleTeams.length === 0 && (
              <div className="surface p-6 text-center">
                <div className="font-bebas text-2xl tracking-[2px] mb-2">No Valid Team Data</div>
                <div className="text-sm text-muted">Analysis response did not include any team with real squad data yet. Please re-run analysis after backend refresh.</div>
              </div>
            )}

            <div className="mt-10 text-center">
              <button onClick={()=>window.print()} className="btn-gold">⬇ Download Analysis PDF</button>
            </div>
          </div>
        )}
      </div>
      <style>{`@keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}} @keyframes ringPulse{0%{transform:scale(1);opacity:0.6}100%{transform:scale(1.4);opacity:0}}`}</style>
    </div>
  )
}
