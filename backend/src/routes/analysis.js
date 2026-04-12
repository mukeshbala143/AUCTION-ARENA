const express = require('express')

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'
const DEFAULT_GEMINI_MODELS = [
  'gemini-2.5-flash-lite',
  'gemini-2.0-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash-lite',
  'gemini-2.0-flash-lite-001',
]

function safeJsonParse(text, fallback = null) {
  try {
    return JSON.parse(text)
  } catch {
    return fallback
  }
}

function toNum(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v))
}

function uniqueText(arr, limit = 3) {
  const seen = new Set()
  const out = []
  for (const raw of arr || []) {
    const s = String(raw || '').trim()
    if (!s) continue
    const key = s.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(s)
    if (out.length >= limit) break
  }
  return out
}

function getSquadCompletionPenalty(squadCount, targetCount) {
  const target = Math.max(1, toNum(targetCount) || 1)
  const actual = Math.max(0, toNum(squadCount))
  const missing = Math.max(0, target - actual)
  // Strong enough to matter in rankings; capped to avoid excessive punishment.
  const penalty = clamp(Math.round(missing * 2.5), 0, 18)
  return { missing, penalty, target, actual }
}

function finishLabel(index, total) {
  if (index === 0) return 'Top 2'
  if (index <= Math.max(1, Math.floor(total * 0.35))) return 'Playoffs'
  if (index < Math.floor(total * 0.7)) return 'Top Half'
  if (index === total - 1) return 'Last Place'
  return 'Bottom Half'
}

function getPlayerPerformanceSignals(player, sport) {
  const last = player?.stats_last_ipl || {}
  const total = player?.stats_total_ipl || {}
  const t20 = player?.stats_total_t20 || {}
  let recent = 40
  let current = 40

  if (sport === 'ipl') {
    recent += Math.min(toNum(last.runs) / 20, 24)
    recent += Math.min(toNum(last.wickets) * 2.5, 18)
    recent += Math.min(toNum(last.strike_rate) / 8, 16)
    recent += Math.min(toNum(last.economy) > 0 ? (10 - toNum(last.economy)) * 4 : 0, 14)
    current += Math.min(toNum(t20.runs) / 200, 18)
    current += Math.min(toNum(t20.wickets) / 8, 16)
    current += Math.min(toNum(t20.strike_rate) / 10, 12)
    current += Math.min(toNum(t20.economy) > 0 ? (10 - toNum(t20.economy)) * 3 : 0, 10)
    current += Math.min(toNum(total.matches) / 15, 8)
  } else if (sport === 'kabaddi') {
    recent += Math.min(toNum(last.raid_points) / 12, 24)
    recent += Math.min(toNum(last.tackle_points) / 10, 18)
    recent += Math.min(toNum(last.super_raids) * 2.5, 14)
    current += Math.min(toNum(total.raid_points) / 20, 22)
    current += Math.min(toNum(total.tackle_points) / 14, 18)
    current += Math.min(toNum(total.super_raids) * 1.5, 10)
    current += Math.min(toNum(total.matches) / 12, 8)
  } else {
    recent += Math.min(toNum(last.goals) * 5, 22)
    recent += Math.min(toNum(last.assists) * 4, 16)
    recent += Math.min(toNum(last.clean_sheets) * 4, 14)
    recent += Math.min(toNum(last.rating) * 8, 18)
    current += Math.min(toNum(total.goals) / 3, 20)
    current += Math.min(toNum(total.assists) / 3, 16)
    current += Math.min(toNum(total.clean_sheets) / 3, 14)
    current += Math.min(toNum(total.rating) * 6, 18)
    current += Math.min(toNum(total.matches) / 15, 8)
  }

  recent = clamp(recent, 0, 100)
  current = clamp(current, 0, 100)
  const trend = clamp((current - recent) / 12, -5, 5)
  return {
    recent_score: recent,
    current_score: current,
    trend_score: trend,
  }
}

function estimatePlayerValue(player, sport) {
  const perf = getPlayerPerformanceSignals(player, sport)
  let value = perf.recent_score * 0.52 + perf.current_score * 0.43 + (perf.trend_score + 5) * 0.5
  if (player?.is_capped) value += 4
  if (player?.is_overseas) value += 2
  return clamp(value, 0, 100)
}

function getRoleTargets(sport) {
  if (sport === 'ipl') return { batsman: 3, bowler: 3, allrounder: 2, wicketkeeper: 1 }
  if (sport === 'kabaddi') return { raider: 2, defender: 3, allrounder: 1 }
  return { st: 1, lw: 1, rw: 1, cm: 1, cdm: 1, cam: 1, cb: 2, lb: 1, rb: 1, gk: 1 }
}

function buildFallbackAnalysis(room, squads) {
  const roleTargets = getRoleTargets(room.sport)
  const drafts = squads.map((sq) => {
    const roleCounts = {}
    for (const p of sq.players) {
      roleCounts[p.role] = (roleCounts[p.role] || 0) + 1
    }

    const roleCoverage = Object.entries(roleTargets).reduce((acc, [role, target]) => {
      return acc + Math.min((roleCounts[role] || 0) / target, 1)
    }, 0) / Math.max(Object.keys(roleTargets).length, 1)

    const avgValue =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + estimatePlayerValue(p, room.sport), 0) / sq.players.length
        : 0
    const avgRecent =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.performance?.recent_score), 0) / sq.players.length
        : 0
    const avgCurrent =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.performance?.current_score), 0) / sq.players.length
        : 0

    const spentRatio = sq.purse_spent / Math.max(room.purse_lakhs || 1, 1)
    const budgetScore = Math.max(0, 100 - Math.abs(spentRatio - 0.82) * 120)
    const depthScore = Math.min((sq.squad_count / Math.max(room.squad_limit || 1, 1)) * 100, 100)
    const overseasScore = room.max_overseas
      ? Math.max(0, 100 - Math.abs(sq.overseas_count - Math.min(6, room.max_overseas)) * 14)
      : 60

    const overallScore = Math.round(
      avgValue * 0.33 +
      avgRecent * 0.2 +
      avgCurrent * 0.14 +
      roleCoverage * 100 * 0.18 +
      budgetScore * 0.1 +
      depthScore * 0.03 +
      overseasScore * 0.02
    )
    const squadPenalty = getSquadCompletionPenalty(sq.squad_count, room.squad_limit)
    const adjustedScore = clamp(overallScore - squadPenalty.penalty, 1, 100)

    const topPlayers = [...sq.players]
      .sort((a, b) => estimatePlayerValue(b, room.sport) - estimatePlayerValue(a, room.sport))
      .slice(0, 11)
      .map((p) => p.name)

    const strengths = []
    const weaknesses = []
    if (avgValue >= 58) strengths.push('Strong core players with high combined-impact metrics')
    if (avgRecent >= 62) strengths.push('Last-season player performances are consistently strong')
    if (avgCurrent >= 60) strengths.push('Current-form signals across picks are above average')
    if (roleCoverage >= 0.85) strengths.push('Well-balanced role distribution for match flexibility')
    if (budgetScore >= 70) strengths.push('Healthy purse efficiency with value-focused buys')
    if (depthScore < 70) weaknesses.push('Squad depth is below ideal for long tournament runs')
    if (roleCoverage < 0.75) weaknesses.push('Role imbalance may create tactical gaps in key phases')
    if (budgetScore < 50) weaknesses.push('Spend pattern suggests a few expensive risk picks')
    if (avgCurrent < 48) weaknesses.push('Current-form trend of picks is below top contenders')
    if (squadPenalty.missing > 0) {
      weaknesses.push(
        `Incomplete squad: ${squadPenalty.actual}/${squadPenalty.target} players (missing ${squadPenalty.missing})`
      )
    }
    if (strengths.length === 0) strengths.push('Competitive foundation with multiple usable combinations')
    if (weaknesses.length === 0) weaknesses.push('Ceiling depends on consistency from secondary picks')

    return {
      team_name: sq.team_name,
      owner: sq.owner || 'Unknown',
      overall_score: Math.max(40, Math.min(96, adjustedScore)),
      strengths: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 2),
      best_xi: topPlayers,
      analysis:
        squadPenalty.missing > 0
          ? `This team is penalized for not reaching full squad size (${squadPenalty.actual}/${squadPenalty.target}), which directly lowers ranking points.`
          : avgValue >= 60
          ? 'This squad ranks high due to strong last-season returns and dependable current-form indicators across key picks.'
          : 'This squad can compete, but final rank depends on whether recent performers sustain current form under pressure.',
      predicted_finish: 'Top Half',
      _roleCounts: roleCounts,
      _metrics: { avgRecent, avgCurrent, roleCoverage, budgetScore, depthScore },
    }
  })

  const total = drafts.length || 1
  const rankMetric = (key) => {
    const sorted = [...drafts].sort((a, b) => toNum(b._metrics[key]) - toNum(a._metrics[key]))
    const idx = new Map(sorted.map((t, i) => [t.team_name, i + 1]))
    return idx
  }
  const rRecent = rankMetric('avgRecent')
  const rCurrent = rankMetric('avgCurrent')
  const rRole = rankMetric('roleCoverage')
  const rBudget = rankMetric('budgetScore')
  const rDepth = rankMetric('depthScore')
  const topCut = Math.max(1, Math.ceil(total / 3))
  const lowCut = Math.max(1, Math.ceil(total / 3))

  const teams = drafts.map((t) => {
    const strengths = []
    const weaknesses = []
    const m = t._metrics

    if (rRecent.get(t.team_name) <= topCut) strengths.push(`Last-season impact among the best (${m.avgRecent.toFixed(1)} score)`)
    if (rCurrent.get(t.team_name) <= topCut) strengths.push(`Current form is a clear advantage (${m.avgCurrent.toFixed(1)} score)`)
    if (rRole.get(t.team_name) <= topCut) strengths.push('Role balance is strong across the likely first XI')
    if (rBudget.get(t.team_name) <= topCut) strengths.push('Budget usage is efficient relative to other teams')
    if (rDepth.get(t.team_name) <= topCut) strengths.push('Squad depth supports rotation and tactical flexibility')

    if (rRecent.get(t.team_name) > total - lowCut) weaknesses.push(`Last-season output trails most teams (${m.avgRecent.toFixed(1)} score)`)
    if (rCurrent.get(t.team_name) > total - lowCut) weaknesses.push(`Current form trend is below the top teams (${m.avgCurrent.toFixed(1)} score)`)
    if (rRole.get(t.team_name) > total - lowCut) weaknesses.push('Role distribution has some tactical gaps')
    if (rBudget.get(t.team_name) > total - lowCut) weaknesses.push('Budget conversion is weaker than rivals')
    if (rDepth.get(t.team_name) > total - lowCut) weaknesses.push('Depth looks thinner for a long tournament')

    const mergedStrengths = uniqueText([...strengths, ...t.strengths], 3)
    const mergedWeaknesses = uniqueText([...weaknesses, ...t.weaknesses], 2)
    const coreA = t.best_xi?.[0]
    const coreB = t.best_xi?.[1]

    return {
      ...t,
      strengths: mergedStrengths.length ? mergedStrengths : ['Competitive foundation with useful combinations'],
      weaknesses: mergedWeaknesses.length ? mergedWeaknesses : ['Ceiling depends on consistency from secondary picks'],
      roster_summary: {
        player_count: t.best_xi?.length || 0,
        role_counts: t._roleCounts || {},
      },
      analysis:
        coreA && coreB
          ? `${t.analysis} Key upside comes from ${coreA} and ${coreB}, whose recent/current indicators lift this squad profile.`
          : t.analysis,
    }
  })

  teams.sort((a, b) => b.overall_score - a.overall_score)
  teams.forEach((t, i) => {
    t.rank = i + 1
    t.predicted_finish = finishLabel(i, total)
    delete t._roleCounts
    delete t._metrics
  })

  const allPicks = squads.flatMap((s) =>
    s.players.map((p) => ({
      team_name: s.team_name,
      player_name: p.name,
      price_paid: p.price_paid,
      value: estimatePlayerValue(p, room.sport),
    }))
  )

  const byValue = [...allPicks]
    .filter((p) => p.price_paid > 0)
    .map((p) => ({
      ...p,
      value_per_lakh: p.value / p.price_paid,
    }))

  byValue.sort((a, b) => b.value_per_lakh - a.value_per_lakh)
  const mvp = byValue[0]
  byValue.sort((a, b) => a.value_per_lakh - b.value_per_lakh)
  const overpay = byValue[0]

  return {
    ranked_teams: teams,
    tournament_summary:
      'Rankings were generated from every final pick using last-season impact, current-form indicators, role balance, and budget efficiency.',
    most_valuable_pick: mvp
      ? {
          player_name: mvp.player_name,
          team_name: mvp.team_name,
          price_paid: mvp.price_paid,
          reason: 'Delivered strong projected impact for the purchase price.',
        }
      : null,
    biggest_overpay: overpay
      ? {
          player_name: overpay.player_name,
          team_name: overpay.team_name,
          price_paid: overpay.price_paid,
          reason: 'Price paid appears high relative to projected impact.',
        }
      : null,
  }
}

function normalizeAnalysis(raw, squads, fallback, room) {
  if (!raw || typeof raw !== 'object') return fallback
  const list = Array.isArray(raw.ranked_teams) ? raw.ranked_teams : []
  if (list.length === 0) return fallback

  const byTeam = new Map(squads.map((s) => [String(s.team_name).toLowerCase(), s]))
  const fbByTeam = new Map((fallback?.ranked_teams || []).map((t) => [String(t.team_name).toLowerCase(), t]))
  const normalized = []

  for (const item of list) {
    const teamName = String(item.team_name || '').trim()
    if (!teamName) continue
    const sq = byTeam.get(teamName.toLowerCase())
    if (!sq) continue
    const fb = fbByTeam.get(teamName.toLowerCase())
    const aiScore = Math.max(1, Math.min(100, Math.round(toNum(item.overall_score) || 60)))
    const squadPenalty = getSquadCompletionPenalty(sq.squad_count, room?.squad_limit)
    const blended = fb ? Math.round(aiScore * 0.65 + toNum(fb.overall_score) * 0.35) : aiScore
    const stableScore = clamp(blended - squadPenalty.penalty, 1, 100)
    const bestXI = Array.isArray(item.best_xi)
      ? item.best_xi.slice(0, 11)
      : sq.players.slice(0, 11).map((p) => p.name)
    const firstTwo = bestXI.slice(0, 2).filter(Boolean)
    let analysis = String(item.analysis || '').trim()
    if (!analysis) analysis = fb?.analysis || 'Balanced squad with clear upside if key players perform consistently.'
    if (firstTwo.length === 2 && !firstTwo.some((n) => analysis.toLowerCase().includes(String(n).toLowerCase()))) {
      analysis = `${analysis} Key players: ${firstTwo[0]} and ${firstTwo[1]}.`
    }
    if (squadPenalty.missing > 0 && !analysis.toLowerCase().includes('squad size')) {
      analysis = `${analysis} Ranking penalty applied for incomplete squad size (${squadPenalty.actual}/${squadPenalty.target}, missing ${squadPenalty.missing}).`
    }

    normalized.push({
      team_name: sq.team_name,
      owner: item.owner || sq.owner || 'Unknown',
      overall_score: stableScore,
      strengths: uniqueText([...(fb?.strengths || []), ...(item.strengths || [])], 3),
      weaknesses: uniqueText(
        [
          ...(fb?.weaknesses || []),
          ...(item.weaknesses || []),
          ...(squadPenalty.missing > 0
            ? [`Incomplete squad: ${squadPenalty.actual}/${squadPenalty.target} players (missing ${squadPenalty.missing})`]
            : []),
        ],
        2
      ),
      best_xi: bestXI,
      analysis,
      predicted_finish: item.predicted_finish || 'Top Half',
    })
  }

  for (const sq of squads) {
    if (!normalized.find((t) => t.team_name === sq.team_name)) {
      const fallbackTeam = fallback?.ranked_teams?.find((t) => t.team_name === sq.team_name)
      if (fallbackTeam) normalized.push(fallbackTeam)
    }
  }

  normalized.sort((a, b) => b.overall_score - a.overall_score)
  const total = normalized.length || 1
  normalized.forEach((t, i) => {
    t.rank = i + 1
    t.predicted_finish = finishLabel(i, total)
    if (!t.strengths?.length) t.strengths = ['Competitive foundation with useful combinations']
    if (!t.weaknesses?.length) t.weaknesses = ['Needs consistent output from secondary picks']
  })

  return {
    ranked_teams: normalized,
    tournament_summary:
      String(raw.tournament_summary || '').trim() ||
      fallback.tournament_summary,
    most_valuable_pick: raw.most_valuable_pick || fallback.most_valuable_pick,
    biggest_overpay: raw.biggest_overpay || fallback.biggest_overpay,
  }
}

async function fetchGeminiAnalysis({ apiKey, model, systemPrompt, userPrompt }) {
  const prompt = `${systemPrompt}\n\n${userPrompt}\n\nReturn valid JSON only.`
  const response = await fetch(`${GEMINI_API_BASE}/${encodeURIComponent(model)}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: 'application/json',
      },
    }),
  })

  if (!response.ok) {
    const errText = await response.text()
    throw new Error(`Gemini request failed (${response.status}): ${errText}`)
  }

  const data = await response.json()
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
  if (!text) throw new Error('Gemini returned empty response content.')
  return text
}

function buildGeminiModelCandidates(primaryModel) {
  return [...new Set([primaryModel, ...DEFAULT_GEMINI_MODELS].filter(Boolean))]
}

async function fetchGeminiAnalysisWithFallback({ apiKey, model, systemPrompt, userPrompt }) {
  const candidates = buildGeminiModelCandidates(model)
  let lastError = null

  for (const candidate of candidates) {
    try {
      const content = await fetchGeminiAnalysis({
        apiKey,
        model: candidate,
        systemPrompt,
        userPrompt,
      })
      return { content, model: candidate }
    } catch (error) {
      lastError = error
      console.warn(`[analysis][gemini] model=${candidate} failed: ${error.message}`)

      const isMissingModel =
        /\b404\b/.test(String(error.message || '')) ||
        /not found/i.test(String(error.message || '')) ||
        /not supported/i.test(String(error.message || ''))

      if (!isMissingModel) break
    }
  }

  throw lastError || new Error('Gemini request failed for all configured models.')
}

module.exports = (supabase) => {
  const router = express.Router()

  router.post('/:code', async (req, res) => {
    const roomCode = String(req.params.code || '').toUpperCase()
    try {
      const { data: room, error: roomError } = await supabase
        .from('rooms')
        .select('*')
        .eq('code', roomCode)
        .single()
      if (roomError) throw roomError
      if (!room) return res.status(404).json({ error: 'Room not found' })
      if (room.status !== 'finished') {
        return res.status(400).json({ error: 'Analysis is available after auction completion.' })
      }

      const { data: teams, error: teamsError } = await supabase
        .from('room_teams')
        .select('*, user:users(display_name)')
        .eq('room_id', room.id)
      if (teamsError) throw teamsError

      const [{ data: picks, error: picksError }, { data: lots, error: lotsError }] = await Promise.all([
        supabase
          .from('squad_picks')
          .select('team_id, price_paid_lakhs, player:players(*)')
          .eq('room_id', room.id),
        supabase
          .from('auction_lots')
          .select('id')
          .eq('room_id', room.id),
      ])
      if (picksError) throw picksError
      if (lotsError) throw lotsError

      let bids = []
      const lotIds = (lots || []).map((l) => l.id)
      if (lotIds.length > 0) {
        const { data: roomBids, error: bidsError } = await supabase
          .from('bids')
          .select('team_id')
          .in('lot_id', lotIds)
        if (bidsError) throw bidsError
        bids = roomBids || []
      }

      const picksByTeam = (picks || []).reduce((acc, p) => {
        if (!acc[p.team_id]) acc[p.team_id] = []
        acc[p.team_id].push(p)
        return acc
      }, {})

      const activeTeamIds = new Set([
        ...(picks || []).map((p) => p.team_id),
        ...(bids || []).map((b) => b.team_id),
      ])

      const participantTeams = (teams || []).filter((t) =>
        activeTeamIds.size > 0 ? activeTeamIds.has(t.id) : true
      )

      const squads = participantTeams.map((t) => {
        const teamPicks = picksByTeam[t.id] || []
        return {
          team_name: t.team_name,
          owner: t.user?.display_name,
          purse_spent: room.purse_lakhs - t.purse_remaining_lakhs,
          purse_remaining: t.purse_remaining_lakhs,
          overseas_count: t.overseas_count,
          squad_count: t.squad_count,
          players: teamPicks.map((p) => {
            const player = {
              name: p.player?.name,
              role: p.player?.role,
              country: p.player?.country,
              is_overseas: p.player?.is_overseas,
              is_capped: p.player?.is_capped,
              price_paid: p.price_paid_lakhs,
              base_price: p.player?.base_price_lakhs,
              stats_last_ipl: p.player?.stats_last_ipl,
              stats_total_ipl: p.player?.stats_total_ipl,
              stats_total_t20: p.player?.stats_total_t20,
            }
            return {
              ...player,
              performance: getPlayerPerformanceSignals(player, room.sport),
            }
          }),
        }
      })

      if (squads.length === 0) {
        return res.status(400).json({ error: 'No participating teams found for this bidding room.' })
      }

      const fallback = buildFallbackAnalysis(room, squads)

      const sportPrompts = {
        ipl: 'You are an elite IPL analyst. Rank final squads using ALL picked players. Evaluate each pick with last-IPL performance and current-form signals, then combine with role balance, batting depth, bowling quality, overseas optimization, and budget efficiency.',
        kabaddi:
          'You are an elite Pro Kabaddi analyst. Rank final squads using ALL picked players. Evaluate each pick with last-season output and current-form signals, then combine with raider/defender balance, all-round depth, reliability, and budget efficiency.',
        football:
          'You are an elite football analyst. Rank final squads using ALL picked players. Evaluate each pick with recent-season output and current-form signals, then combine with attack, midfield, defense, goalkeeper quality, depth, and budget efficiency.',
      }

      const systemPrompt = `${sportPrompts[room.sport] || sportPrompts.ipl}
Important ranking rule: room squad size target is ${room.squad_limit}. If any team has fewer players than this target, apply a clear score penalty and mention it in weaknesses and analysis reason.
Return only valid JSON using this exact shape:
{
  "ranked_teams": [
    {
      "rank": 1,
      "team_name": "string",
      "owner": "string",
      "overall_score": 85,
      "strengths": ["string","string","string"],
      "weaknesses": ["string","string"],
      "best_xi": ["Player1","Player2","Player3"],
      "analysis": "2-3 sentence explanation of rank that cites at least 2 specific picked players, references recent/current form, and mentions squad-size penalty when applicable",
      "predicted_finish": "Top 2"
    }
  ],
  "tournament_summary": "string",
  "most_valuable_pick": { "player_name":"string", "team_name":"string", "price_paid":0, "reason":"string" },
  "biggest_overpay": { "player_name":"string", "team_name":"string", "price_paid":0, "reason":"string" }
}`

      const userPrompt = `Analyse and rank these final ${room.sport.toUpperCase()} squads.
Important: evaluate every picked player in each team. Give higher weight to last-season performance and current-form signals from the provided performance object. Explain rank with player-specific reasons.
\n${JSON.stringify(
        squads,
        null,
        2
      )}`

      const apiKey = process.env.GEMINI_API_KEY
      const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite'

      let result = fallback
      let generatedBy = 'local-heuristic'

      let aiContent = null;
      let resolvedModel = model
      if (apiKey) {
        try {
          const geminiResult = await fetchGeminiAnalysisWithFallback({
            apiKey,
            model,
            systemPrompt,
            userPrompt,
          })
          aiContent = geminiResult.content
          resolvedModel = geminiResult.model
        } catch (aiErr) {
          console.error('Gemini analysis failed, using fallback:', aiErr.message)
          // The AI call failed, so we'll proceed with the local fallback.
        }
      } else {
        console.warn('GEMINI_API_KEY not set, using fallback analysis.')
      }

      if (aiContent) {
        const parsed = safeJsonParse(aiContent);
        result = normalizeAnalysis(parsed, squads, fallback, room);
        generatedBy = `gemini:${resolvedModel}`;
      }

      res.json({
        ...result,
        room_code: roomCode,
        participant_team_count: squads.length,
        generated_by: generatedBy,
      })
    } catch (e) {
      console.error('--- ANALYSIS ROUTE CRASH ---')
      console.error(`Error processing room: ${roomCode}`)
      console.error('Error message:', e.message)
      console.error('Error stack:', e.stack)
      console.error('--- END ANALYSIS CRASH ---')
      res.status(500).json({
        error: 'An unexpected error occurred during analysis.',
        details: e.message,
      })
    }
  })

  return router
}
