const express = require('express')

module.exports = (supabase) => {
  const router = express.Router()

  // GET /api/rooms/:code
  router.get('/:code', async (req, res) => {
    const { data, error } = await supabase.from('rooms')
      .select('*, admin:users(display_name,team_name,avatar_url), room_teams(*, user:users(display_name,avatar_url))')
      .eq('code', req.params.code.toUpperCase()).single()
    if (error) return res.status(404).json({ error: 'Room not found' })
    res.json(data)
  })

  // POST /api/rooms/:code/join
  router.post('/:code/join', async (req, res) => {
    try {
      const { userId } = req.body
      const { data: room } = await supabase.from('rooms').select('*').eq('code', req.params.code.toUpperCase()).single()
      if (!room) return res.status(404).json({ error: 'Room not found' })
      if (room.status !== 'waiting') return res.status(400).json({ error: 'Auction already started' })

      const { data: existing } = await supabase.from('room_teams').select('id').eq('room_id', room.id).eq('user_id', userId).single()
      if (existing) return res.json({ message: 'Already in room' })

      const { count } = await supabase.from('room_teams').select('id', { count: 'exact' }).eq('room_id', room.id)
      if (count >= 10) return res.status(400).json({ error: 'Room full (max 10 teams)' })

      const { data: profile } = await supabase.from('users').select('*').eq('id', userId).single()
      const { data: team, error: err } = await supabase.from('room_teams').insert({
        room_id: room.id, user_id: userId,
        team_name: profile?.team_name || 'Team',
        purse_remaining_lakhs: room.purse_lakhs, is_ready: false
      }).select().single()
      if (err) return res.status(400).json({ error: err.message })
      res.json(team)
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  // GET /api/rooms/:code/squads
  router.get('/:code/squads', async (req, res) => {
    try {
      const { data: room } = await supabase.from('rooms').select('*').eq('code', req.params.code.toUpperCase()).single()
      if (!room) return res.status(404).json({ error: 'Room not found' })
      const { data: teams } = await supabase.from('room_teams').select('*, user:users(display_name,avatar_url)').eq('room_id', room.id)
      const squads = await Promise.all((teams||[]).map(async t => {
        const { data: picks } = await supabase.from('squad_picks').select('*, player:players(*)').eq('team_id', t.id)
        return { ...t, players: picks || [] }
      }))
      res.json({ room, squads })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}
