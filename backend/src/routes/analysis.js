const express = require('express')

const GEMINI_API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

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

function avg(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return 0
  return arr.reduce((sum, value) => sum + toNum(value), 0) / arr.length
}

function roundScore(value) {
  return Math.round(clamp(toNum(value), 0, 100))
}

function textIncludes(value, pattern) {
  return String(value || '').toLowerCase().includes(pattern)
}

function sortTeamsForRanking(teams) {
  teams.sort((a, b) => {
    const scoreDiff = toNum(b.overall_score) - toNum(a.overall_score)
    if (scoreDiff !== 0) return scoreDiff

    const completionA = toNum(a?.squad_status?.completion_pct)
    const completionB = toNum(b?.squad_status?.completion_pct)
    if (completionA !== completionB) return completionB - completionA

    const sizeA = toNum(a?.squad_status?.actual_size ?? a?.roster_summary?.player_count)
    const sizeB = toNum(b?.squad_status?.actual_size ?? b?.roster_summary?.player_count)
    if (sizeA !== sizeB) return sizeA - sizeB

    return String(a.team_name || '').localeCompare(String(b.team_name || ''))
  })
}

function getAuctionTimingInsights(buyEvents, totalLots) {
  const events = Array.isArray(buyEvents) ? [...buyEvents].sort((a, b) => toNum(a.lot_number) - toNum(b.lot_number)) : []
  if (!events.length || totalLots <= 0) {
    return {
      score: 50,
      label: 'No completed buys',
      average_phase: 'No data',
      summary: 'No completed player purchases were available to evaluate owner buying timing.',
      total_buys: 0,
      first_buy_at: null,
      last_buy_at: null,
    }
  }

  const lotPercents = events.map((event) => clamp(toNum(event.lot_number) / Math.max(totalLots, 1), 0, 1))
  const averagePercent = avg(lotPercents)
  const spread = Math.max(...lotPercents) - Math.min(...lotPercents)
  const timingScore = clamp(62 + spread * 28 - Math.abs(averagePercent - 0.52) * 42, 35, 100)

  let label = 'Balanced timing'
  let averagePhase = 'Mid auction'
  let summary = 'Owner spread purchases across the auction and avoided overcommitting to one phase.'

  if (averagePercent <= 0.34) {
    label = 'Early aggression'
    averagePhase = 'Early auction'
    summary = 'Owner secured a large share of players early, which can build a fast core but leaves less room for late value.'
  } else if (averagePercent >= 0.68) {
    label = 'Late value hunt'
    averagePhase = 'Late auction'
    summary = 'Owner waited deeper into the auction for buys, suggesting value hunting and selective bidding.'
  } else if (spread < 0.18) {
    label = 'Clustered buying'
    averagePhase = 'Compressed window'
    summary = 'Most buys came in a narrow auction window, so flexibility across the full auction looked limited.'
  }

  return {
    score: roundScore(timingScore),
    label,
    average_phase: averagePhase,
    summary,
    total_buys: events.length,
    first_buy_at: events[0]?.sold_at || null,
    last_buy_at: events[events.length - 1]?.sold_at || null,
  }
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

function getCricketSpecializationSignals(player) {
  const role = String(player?.role || '').toLowerCase()
  const battingStyle = String(player?.batting_style || '').toLowerCase()
  const bowlingStyle = String(player?.bowling_style || '').toLowerCase()
  const t20 = player?.stats_total_t20 || {}
  const last = player?.stats_last_ipl || {}

  let score = 44
  const tags = []

  if (role === 'batsman') {
    score += 10
    if (toNum(t20.strike_rate) >= 135 || toNum(last.strike_rate) >= 135) {
      score += 12
      tags.push('T20 aggressor')
    }
    if (toNum(t20.average) >= 28 || toNum(last.average) >= 28) {
      score += 8
      tags.push('stability batter')
    }
  }

  if (role === 'wicketkeeper') {
    score += 10
    tags.push('keeper-batter option')
  }

  if (role === 'allrounder') {
    score += 14
    tags.push('multi-skill balance')
    if (toNum(t20.runs) > 500 && toNum(t20.wickets) > 20) score += 10
  }

  if (role === 'bowler') {
    score += 12
    if (toNum(t20.economy) > 0 && toNum(t20.economy) <= 8.2) {
      score += 10
      tags.push('economy control')
    }
    if (toNum(t20.wickets) >= 35 || toNum(last.wickets) >= 14) {
      score += 10
      tags.push('strike bowler')
    }
  }

  if (textIncludes(bowlingStyle, 'left-arm')) {
    score += 6
    tags.push('left-arm variation')
  }
  if (textIncludes(bowlingStyle, 'spin') || textIncludes(bowlingStyle, 'orthodox') || textIncludes(bowlingStyle, 'legbreak')) {
    score += 6
    tags.push('spin option')
  }
  if (textIncludes(bowlingStyle, 'fast')) {
    score += 6
    tags.push('pace option')
  }
  if (textIncludes(battingStyle, 'left')) {
    score += 4
    tags.push('left-hand matchup')
  }

  return {
    score: roundScore(score),
    tags: uniqueText(tags, 3),
  }
}

function getCricketRecordSignals(player) {
  const ipl = player?.stats_total_ipl || {}
  const t20 = player?.stats_total_t20 || {}
  const last = player?.stats_last_ipl || {}
  const perf = getPlayerPerformanceSignals(player, 'ipl')

  const iplMatches = toNum(ipl.matches)
  const t20Matches = toNum(t20.matches)
  const battingVolume = toNum(t20.runs) + toNum(ipl.runs) * 0.6
  const bowlingVolume = toNum(t20.wickets) * 22 + toNum(ipl.wickets) * 15

  const t20Record = clamp(
    28 +
      Math.min(t20Matches / 2.4, 26) +
      Math.min(battingVolume / 260, 24) +
      Math.min(bowlingVolume / 55, 22) +
      Math.min(toNum(t20.strike_rate) / 18, 8) +
      Math.min(toNum(last.economy) > 0 ? (8.6 - toNum(last.economy)) * 7 : 0, 8),
    0,
    100
  )

  const fiveYearIplProxy = clamp(
    24 +
      Math.min(iplMatches / 1.6, 32) +
      Math.min(toNum(ipl.runs) / 140, 20) +
      Math.min(toNum(ipl.wickets) * 1.8, 18) +
      Math.min(toNum(last.runs) / 45, 8) +
      Math.min(toNum(last.wickets) * 0.9, 8),
    0,
    100
  )

  const consistency = clamp(
    40 +
      Math.min(iplMatches / 4, 12) +
      Math.min(t20Matches / 8, 10) -
      Math.abs(perf.current_score - perf.recent_score) * 1.6 +
      Math.min(toNum(ipl.average) / 6, 8) +
      Math.min(toNum(t20.average) / 6, 8),
    0,
    100
  )

  const availability = clamp(
    36 +
      Math.min(t20Matches / 3.2, 28) +
      Math.min(iplMatches / 3, 20) +
      Math.min(toNum(last.matches) * 2.2, 12) +
      Math.max(0, perf.current_score - 45) * 0.4,
    0,
    100
  )

  return {
    t20_record: roundScore(t20Record),
    five_year_ipl_proxy: roundScore(fiveYearIplProxy),
    consistency: roundScore(consistency),
    fitness_availability: roundScore(availability),
  }
}

function getPlayerRankValue(player) {
  const perf = player?.performance || {}
  const record = player?.record || {}
  const specialization = player?.specialization || {}

  return roundScore(
    toNum(perf.recent_score) * 0.2 +
      toNum(perf.current_score) * 0.24 +
      toNum(record.t20_record) * 0.22 +
      toNum(record.five_year_ipl_proxy) * 0.12 +
      toNum(record.consistency) * 0.1 +
      toNum(record.fitness_availability) * 0.06 +
      toNum(specialization.score) * 0.06
  )
}

function buildTopPlayers(players, limit = 3) {
  return [...(players || [])]
    .sort((a, b) => getPlayerRankValue(b) - getPlayerRankValue(a))
    .slice(0, limit)
    .map((player) => ({
      name: player.name,
      role: player.role,
      impact_score: getPlayerRankValue(player),
      reason: uniqueText([
        toNum(player?.record?.t20_record) >= 65 ? 'strong T20 record' : '',
        toNum(player?.performance?.current_score) >= 60 ? 'current form is strong' : '',
        toNum(player?.performance?.recent_score) >= 60 ? 'last IPL season was productive' : '',
        toNum(player?.specialization?.score) >= 62 ? (player?.specialization?.tags || [])[0] || 'specialist skill value' : '',
      ], 2).join(' + ') || 'balanced player profile',
    }))
}

function buildWinnerSummary(team) {
  if (!team) return null
  const reasons = uniqueText([
    ...(team.strengths || []),
    toNum(team?.score_breakdown?.t20_record) >= 65 ? 'Team holds one of the strongest T20 record profiles in the room.' : '',
    toNum(team?.score_breakdown?.current_form) >= 60 ? 'Current form score keeps this squad ahead of rivals.' : '',
    team?.squad_status?.is_complete ? 'Team satisfied the full squad-size target set by the admin.' : '',
  ], 3)

  return {
    team_name: team.team_name,
    overall_score: team.overall_score,
    squad_size: team?.squad_status?.actual_size ?? team?.roster_summary?.player_count ?? 0,
    reasons,
    top_players: team.top_players || [],
  }
}

function calculateOverallTeamScore(scoreBreakdown, squadPenalty) {
  const metricValues = Object.entries(scoreBreakdown).map(([, value]) => toNum(value))
  const averageScore = metricValues.length ? avg(metricValues) : 0

  return {
    average_score: roundScore(averageScore),
    adjusted_score: clamp(Math.round(averageScore) - toNum(squadPenalty?.penalty), 1, 100),
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
    const avgRecord =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.record?.t20_record), 0) / sq.players.length
        : 0
    const avgFiveYear =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.record?.five_year_ipl_proxy), 0) / sq.players.length
        : 0
    const avgConsistency =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.record?.consistency), 0) / sq.players.length
        : 0
    const avgAvailability =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.record?.fitness_availability), 0) / sq.players.length
        : 0
    const avgSpecialization =
      sq.players.length > 0
        ? sq.players.reduce((a, p) => a + toNum(p.specialization?.score), 0) / sq.players.length
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
    const timing = getAuctionTimingInsights(sq.buy_events, sq.total_lots)

    const scoreBreakdown = {
      player_quality: roundScore(avgValue),
      t20_record: roundScore(avgRecord),
      five_year_ipl: roundScore(avgFiveYear),
      recent_form: roundScore(avgRecent),
      current_form: roundScore(avgCurrent),
      consistency: roundScore(avgConsistency),
      fitness_availability: roundScore(avgAvailability),
      specialization: roundScore(avgSpecialization),
      role_balance: roundScore(roleCoverage * 100),
      budget_efficiency: roundScore(budgetScore),
      squad_completion: roundScore(depthScore),
      overseas_usage: roundScore(overseasScore),
      auction_timing: roundScore(timing.score),
    }

    const squadPenalty = getSquadCompletionPenalty(sq.squad_count, room.squad_limit)
    const overallSummary = calculateOverallTeamScore(scoreBreakdown, squadPenalty)
    const adjustedScore = overallSummary.adjusted_score

    const topPlayers = [...sq.players]
      .sort((a, b) => estimatePlayerValue(b, room.sport) - estimatePlayerValue(a, room.sport))
      .slice(0, 11)
      .map((p) => p.name)
    const topContributors = buildTopPlayers(sq.players, 3)

    const strengths = []
    const weaknesses = []
    if (avgValue >= 58) strengths.push('Strong core players with high combined-impact metrics')
    if (avgRecord >= 64) strengths.push('Squad carries strong T20 record across domestic, franchise, and international sample')
    if (avgFiveYear >= 62) strengths.push('Past IPL body of work is strong across the group')
    if (avgRecent >= 62) strengths.push('Last-season player performances are consistently strong')
    if (avgCurrent >= 60) strengths.push('Current-form signals across picks are above average')
    if (avgSpecialization >= 62) strengths.push('Team has strong T20 specialization coverage across batting and bowling roles')
    if (roleCoverage >= 0.85) strengths.push('Well-balanced role distribution for match flexibility')
    if (budgetScore >= 70) strengths.push('Healthy purse efficiency with value-focused buys')
    if (depthScore < 70) weaknesses.push('Squad depth is below ideal for long tournament runs')
    if (avgRecord < 52) weaknesses.push('Overall T20 record of the squad trails stronger rivals')
    if (roleCoverage < 0.75) weaknesses.push('Role imbalance may create tactical gaps in key phases')
    if (budgetScore < 50) weaknesses.push('Spend pattern suggests a few expensive risk picks')
    if (avgCurrent < 48) weaknesses.push('Current-form trend of picks is below top contenders')
    if (avgAvailability < 50) weaknesses.push('Availability and match-readiness signals are weaker than top teams')
    if (squadPenalty.missing > 0) {
      weaknesses.push(
        `Incomplete squad: ${squadPenalty.actual}/${squadPenalty.target} players (missing ${squadPenalty.missing})`
      )
    }
    if (timing.score < 55) weaknesses.push(`Owner buying pattern was less balanced (${timing.label.toLowerCase()})`)
    if (timing.score >= 75) strengths.push(`Owner managed buying timing well with a ${timing.label.toLowerCase()} approach`)
    if (strengths.length === 0) strengths.push('Competitive foundation with multiple usable combinations')
    if (weaknesses.length === 0) weaknesses.push('Ceiling depends on consistency from secondary picks')

    return {
      team_name: sq.team_name,
      owner: sq.owner || 'Unknown',
      overall_score: Math.max(40, Math.min(96, adjustedScore)),
      strengths: strengths.slice(0, 3),
      weaknesses: weaknesses.slice(0, 2),
      best_xi: topPlayers,
      top_players: topContributors,
      score_breakdown: {
        ...scoreBreakdown,
        penalty_points: squadPenalty.penalty,
        total_before_penalty: overallSummary.average_score,
      },
      squad_status: {
        target_size: squadPenalty.target,
        actual_size: squadPenalty.actual,
        missing_players: squadPenalty.missing,
        is_complete: squadPenalty.missing === 0,
        completion_pct: roundScore((squadPenalty.actual / Math.max(squadPenalty.target, 1)) * 100),
      },
      auction_strategy: timing,
      roster_summary: {
        player_count: sq.squad_count,
        overseas_count: sq.overseas_count,
        purse_spent: sq.purse_spent,
        purse_remaining: sq.purse_remaining,
        role_counts,
        specialization_tags: uniqueText(sq.players.flatMap((p) => p.specialization?.tags || []), 5),
      },
      analysis:
        squadPenalty.missing > 0
          ? `This team is penalized for not reaching full squad size (${squadPenalty.actual}/${squadPenalty.target}), which directly lowers ranking points.`
          : avgRecord >= 62 && avgCurrent >= 58
          ? 'This squad ranks high due to a strong T20 record base, recent IPL output, and dependable current-form indicators across key picks.'
          : 'This squad can compete, but final rank depends on whether its T20 record and recent-form indicators translate under tournament pressure.',
      predicted_finish: 'Top Half',
      _metrics: { avgRecent, avgCurrent, roleCoverage, budgetScore, depthScore, avgRecord, avgFiveYear, avgAvailability, avgSpecialization },
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
  const rRecord = rankMetric('avgRecord')
  const rFiveYear = rankMetric('avgFiveYear')
  const rAvailability = rankMetric('avgAvailability')
  const rSpecialization = rankMetric('avgSpecialization')
  const rRole = rankMetric('roleCoverage')
  const rBudget = rankMetric('budgetScore')
  const rDepth = rankMetric('depthScore')
  const topCut = Math.max(1, Math.ceil(total / 3))
  const lowCut = Math.max(1, Math.ceil(total / 3))

  const teams = drafts.map((t) => {
    const strengths = []
    const weaknesses = []
    const m = t._metrics

    if (rRecord.get(t.team_name) <= topCut) strengths.push(`T20 record profile ranks among the best (${m.avgRecord.toFixed(1)} score)`)
    if (rFiveYear.get(t.team_name) <= topCut) strengths.push(`Past IPL body of work is one of the strongest groups (${m.avgFiveYear.toFixed(1)} score)`)
    if (rRecent.get(t.team_name) <= topCut) strengths.push(`Last-season impact among the best (${m.avgRecent.toFixed(1)} score)`)
    if (rCurrent.get(t.team_name) <= topCut) strengths.push(`Current form is a clear advantage (${m.avgCurrent.toFixed(1)} score)`)
    if (rAvailability.get(t.team_name) <= topCut) strengths.push('Availability and match-readiness signals are strong')
    if (rSpecialization.get(t.team_name) <= topCut) strengths.push('Specialist skill coverage is better than most squads')
    if (rRole.get(t.team_name) <= topCut) strengths.push('Role balance is strong across the likely first XI')
    if (rBudget.get(t.team_name) <= topCut) strengths.push('Budget usage is efficient relative to other teams')
    if (rDepth.get(t.team_name) <= topCut) strengths.push('Squad depth supports rotation and tactical flexibility')

    if (rRecord.get(t.team_name) > total - lowCut) weaknesses.push(`T20 record base is below the leading teams (${m.avgRecord.toFixed(1)} score)`)
    if (rFiveYear.get(t.team_name) > total - lowCut) weaknesses.push(`Past IPL strength is lighter than the strongest squads (${m.avgFiveYear.toFixed(1)} score)`)
    if (rRecent.get(t.team_name) > total - lowCut) weaknesses.push(`Last-season output trails most teams (${m.avgRecent.toFixed(1)} score)`)
    if (rCurrent.get(t.team_name) > total - lowCut) weaknesses.push(`Current form trend is below the top teams (${m.avgCurrent.toFixed(1)} score)`)
    if (rAvailability.get(t.team_name) > total - lowCut) weaknesses.push('Availability and readiness profile is weaker than rivals')
    if (rSpecialization.get(t.team_name) > total - lowCut) weaknesses.push('Specialist role coverage is thinner than the top teams')
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
      score_breakdown: t.score_breakdown,
      squad_status: t.squad_status,
      auction_strategy: t.auction_strategy,
      roster_summary: t.roster_summary,
      top_players: t.top_players,
      analysis:
        coreA && coreB
          ? `${t.analysis} Key upside comes from ${coreA} and ${coreB}, whose recent/current indicators lift this squad profile.`
          : t.analysis,
    }
  })

  sortTeamsForRanking(teams)
  teams.forEach((t, i) => {
    t.rank = i + 1
    t.predicted_finish = finishLabel(i, total)
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

  const winnerSummary = buildWinnerSummary(teams[0])

  return {
    ranked_teams: teams,
    winner_summary: winnerSummary,
    tournament_summary:
      'Rankings were generated from every final pick using T20 record strength, recent IPL impact, current-form indicators, specialization, role balance, squad completion, and budget efficiency.',
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
      score_breakdown: fb?.score_breakdown,
      squad_status: fb?.squad_status,
      auction_strategy: fb?.auction_strategy,
      roster_summary: fb?.roster_summary,
      top_players: fb?.top_players,
      analysis,
      predicted_finish: item.predicted_finish || 'Top Half',
    })
  }

  for (const sq of squads) {
    if (!normalized.find((t) => t.team_name === sq.team_name)) {
      const fb = fallback.ranked_teams.find((t) => t.team_name === sq.team_name)
      if (fb) normalized.push(fb)
    }
  }

  sortTeamsForRanking(normalized)
  const total = normalized.length || 1
  normalized.forEach((t, i) => {
    t.rank = i + 1
    t.predicted_finish = finishLabel(i, total)
    if (!t.strengths?.length) t.strengths = ['Competitive foundation with useful combinations']
    if (!t.weaknesses?.length) t.weaknesses = ['Needs consistent output from secondary picks']
  })

  return {
    ranked_teams: normalized,
    winner_summary: buildWinnerSummary(normalized[0]),
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

module.exports = (supabase) => {
  const router = express.Router()

  router.post('/:code', async (req, res) => {
    try {
      const roomCode = String(req.params.code || '').toUpperCase()
      const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
      if (!room) return res.status(404).json({ error: 'Room not found' })
      if (room.status !== 'finished') {
        return res.status(400).json({ error: 'Analysis is available after auction completion.' })
      }

      const { data: teams, error: teamsError } = await supabase
        .from('room_teams')
        .select('*, user:users(display_name)')
        .eq('room_id', room.id)

      if (teamsError) {
        throw new Error(`Failed to load room teams: ${teamsError.message}`)
      }

      const [{ data: picks, error: picksError }, { data: lots, error: lotsError }] = await Promise.all([
        supabase
          .from('squad_picks')
          .select('team_id, price_paid_lakhs, player:players(*)')
          .eq('room_id', room.id),
        supabase
          .from('auction_lots')
          .select('*')
          .eq('room_id', room.id),
      ])

      if (picksError) {
        throw new Error(`Failed to load squad picks: ${picksError.message}`)
      }

      if (lotsError) {
        throw new Error(`Failed to load auction lots: ${lotsError.message}`)
      }

      let bids = []
      const lotIds = (lots || []).map((l) => l.id)
      if (lotIds.length > 0) {
        const { data: roomBids, error: bidsError } = await supabase
          .from('bids')
          .select('team_id')
          .in('lot_id', lotIds)
        if (bidsError) {
          throw new Error(`Failed to load bids: ${bidsError.message}`)
        }
        bids = roomBids || []
      }

      const picksByTeam = (picks || []).reduce((acc, p) => {
        if (!acc[p.team_id]) acc[p.team_id] = []
        acc[p.team_id].push(p)
        return acc
      }, {})
      const buysByTeam = (lots || []).reduce((acc, lot) => {
        if (!lot?.winner_team_id || (lot?.status && lot.status !== 'sold')) return acc
        if (!acc[lot.winner_team_id]) acc[lot.winner_team_id] = []
        acc[lot.winner_team_id].push({
          lot_number: lot.lot_number,
          sold_at: lot.sold_at,
        })
        return acc
      }, {})

      const activeTeamIds = new Set([
        ...(picks || []).map((p) => p.team_id),
        ...(bids || []).map((b) => b.team_id),
      ])

      const participantTeams = (teams || []).filter((t) => {
        const teamPickCount = (picksByTeam[t.id] || []).length
        return teamPickCount > 0 || toNum(t.squad_count) > 0
      })

      const squads = participantTeams.map((t) => {
        const teamPicks = picksByTeam[t.id] || []
        return {
          team_name: t.team_name,
          owner: t.user?.display_name,
          purse_spent: room.purse_lakhs - t.purse_remaining_lakhs,
          purse_remaining: t.purse_remaining_lakhs,
          overseas_count: t.overseas_count,
          squad_count: t.squad_count,
          total_lots: (lots || []).length,
          buy_events: buysByTeam[t.id] || [],
          players: teamPicks.map((p) => {
            const player = {
              name: p.player?.name,
              role: p.player?.role,
              country: p.player?.country,
              is_overseas: p.player?.is_overseas,
              is_capped: p.player?.is_capped,
              batting_style: p.player?.batting_style,
              bowling_style: p.player?.bowling_style,
              price_paid: p.price_paid_lakhs,
              base_price: p.player?.base_price_lakhs,
              stats_last_ipl: p.player?.stats_last_ipl,
              stats_total_ipl: p.player?.stats_total_ipl,
              stats_total_t20: p.player?.stats_total_t20,
            }
            return {
              ...player,
              performance: getPlayerPerformanceSignals(player, room.sport),
              record: getCricketRecordSignals(player),
              specialization: getCricketSpecializationSignals(player),
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
Important ranking rules:
1. room squad size target is ${room.squad_limit}. If any team has fewer players than this target, apply a clear score penalty and mention it in weaknesses and analysis reason.
2. consider owner buying timing/auction strategy along with player performance, budget usage, and squad balance.
3. prioritize T20 suitability: international T20, domestic T20, and franchise T20 signals are more important than non-T20 reputation.
4. use past IPL strength, current form, specialist roles, and likely availability/readiness when ranking the best team.
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
      const model = process.env.GEMINI_MODEL || 'gemini-1.5-flash'

      let result = fallback
      let generatedBy = 'local-heuristic'

      if (apiKey) {
        try {
          const content = await fetchGeminiAnalysis({
            apiKey,
            model,
            systemPrompt,
            userPrompt,
          })

          const parsed = safeJsonParse(content)
          result = normalizeAnalysis(parsed, squads, fallback, room)
          generatedBy = `gemini:${model}`
        } catch (aiErr) {
          console.error('Gemini analysis failed, using fallback:', aiErr.message)
        }
      } else {
        console.warn('GEMINI_API_KEY not set, using fallback analysis.')
      }

      res.json({
        ...result,
        room_code: roomCode,
        participant_team_count: squads.length,
        generated_by: generatedBy,
        room_settings: {
          squad_limit: room.squad_limit,
          purse_lakhs: room.purse_lakhs,
          max_overseas: room.max_overseas,
          sport: room.sport,
        },
        analysis_criteria: [
          'Player quality based on picked squad',
          'T20 record across franchise, domestic, and international sample',
          'Five-year IPL strength proxy from stored IPL stats',
          'Last-season and current-form performance',
          'Consistency and availability proxy',
          'Player specialization and skill coverage',
          'Role balance and first-XI coverage',
          'Budget efficiency and purse management',
          'Squad-size completion against admin target',
          'Owner buying timing across the auction',
        ],
      })
    } catch (e) {
      console.error('Analysis error:', e)
      res.status(500).json({
        error: e.message || 'Analysis failed',
        details: process.env.NODE_ENV === 'production' ? undefined : e.stack,
      })
    }
  })

  return router
}
