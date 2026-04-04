const express  = require('express')
const Anthropic = require('@anthropic-ai/sdk')

module.exports = (supabase) => {
  const router = express.Router()
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

  router.post('/:code', async (req, res) => {
    try {
      const { data: room } = await supabase.from('rooms').select('*').eq('code', req.params.code).single()
      if (!room) return res.status(404).json({ error: 'Room not found' })

      const { data: teams } = await supabase.from('room_teams')
        .select('*, user:users(display_name)').eq('room_id', room.id)

      const squads = await Promise.all((teams||[]).map(async t => {
        const { data: picks } = await supabase.from('squad_picks')
          .select('*, player:players(*)').eq('team_id', t.id)
        return {
          team_name: t.team_name, owner: t.user?.display_name,
          purse_spent: room.purse_lakhs - t.purse_remaining_lakhs,
          purse_remaining: t.purse_remaining_lakhs,
          overseas_count: t.overseas_count, squad_count: t.squad_count,
          players: (picks||[]).map(p => ({
            name: p.player?.name, role: p.player?.role,
            country: p.player?.country, is_overseas: p.player?.is_overseas,
            is_capped: p.player?.is_capped, price_paid: p.price_paid_lakhs,
            base_price: p.player?.base_price_lakhs,
            stats_last_ipl:  p.player?.stats_last_ipl,
            stats_total_ipl: p.player?.stats_total_ipl,
            stats_total_t20: p.player?.stats_total_t20,
          }))
        }
      }))

      const sportPrompts = {
        ipl: `You are an elite IPL cricket analyst. Evaluate squads on: batting depth, bowling attack (pace+spin), all-rounder value, overseas slot optimization (max 8), wicketkeeper quality, XI flexibility, player form (weight recent IPL stats heavily), budget efficiency.`,
        kabaddi: `You are an expert Pro Kabaddi analyst. Evaluate squads on: raider quality (super-10s, raid success rate), defender quality (high-5s, tackle success), all-rounder balance, team depth, star player value, budget efficiency.`,
        football: `You are an elite football scout and team analyst. Evaluate squads on: attacking threat (goals+assists), defensive solidity (clean sheets, tackles), midfield control (pass accuracy, creativity), goalkeeper quality, squad depth, budget efficiency.`,
      }

      const message = await client.messages.create({
        model: 'claude-opus-4-5',
        max_tokens: 4000,
        system: `${sportPrompts[room.sport] || sportPrompts.ipl}
Return ONLY valid JSON in this exact format, no markdown:
{
  "ranked_teams": [
    {
      "rank": 1,
      "team_name": "string",
      "owner": "string",
      "overall_score": 85,
      "strengths": ["strength 1","strength 2","strength 3"],
      "weaknesses": ["weakness 1","weakness 2"],
      "best_xi": ["Player1","Player2","Player3","Player4","Player5","Player6","Player7","Player8","Player9","Player10","Player11"],
      "analysis": "2-3 sentence expert analysis",
      "predicted_finish": "Top 2"
    }
  ],
  "tournament_summary": "Overall summary of the auction",
  "most_valuable_pick": { "player_name":"string", "team_name":"string", "price_paid":0, "reason":"string" },
  "biggest_overpay": { "player_name":"string", "team_name":"string", "price_paid":0, "reason":"string" }
}`,
        messages: [{ role: 'user', content: `Analyse these ${room.sport.toUpperCase()} auction squads and rank them:\n${JSON.stringify(squads, null, 2)}` }]
      })

      const text = message.content[0]?.text || '{}'
      const clean = text.replace(/```json|```/g, '').trim()
      const result = JSON.parse(clean)
      res.json(result)
    } catch (e) {
      console.error('Analysis error:', e)
      res.status(500).json({ error: e.message })
    }
  })

  return router
}
