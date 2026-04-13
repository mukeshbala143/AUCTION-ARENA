const express = require('express')

module.exports = (supabase, requireHttpUser) => {
  const router = express.Router()

  // POST /api/rooms — Create room
  router.post('/', async (req, res) => {
    try {
      const user = await requireHttpUser(req, res)
      if (!user) return
      
      // ✅ YAHAN FIX HAI: Frontend ke bheje hue EXACT parameters nikal liye
      const { sport, adminId, teamName, roomName, code, settings } = req.body

      const { data: room, error } = await supabase
        .from('rooms')
        .insert({
          code: code, // Frontend ka bheja code use ho raha hai
          sport: sport,
          admin_id: adminId || user.id, 
          room_name: roomName, // Database me room_name save hoga
          squad_limit: settings?.squadLimit || 25,
          purse_lakhs: settings?.purseLakhs || 12000,
          max_overseas: settings?.maxOverseas || 8,
          player_order: settings?.playerOrder || 'shuffled',
        })
        .select()
        .single()

      if (error) throw error;

      const { error: teamError } = await supabase.from('room_teams').insert({
        room_id: room.id,
        user_id: user.id,
        team_name: teamName || 'Host Team',
        purse_remaining_lakhs: settings?.purseLakhs || 12000,
      })
      
      if (teamError) throw teamError;

      res.json({ room })
      
    } catch (err) {
      console.error('Create room fatal error:', err)
      res.status(500).json({ error: err.message || 'Failed to create room' })
    }
  })

  // GET /api/rooms/:code
  router.get('/:code', async (req, res) => {
    try {
        const { data, error } = await supabase.from('rooms')
        .select('*, admin:users(display_name,team_name,avatar_url), room_teams(*, user:users(display_name,avatar_url))')
        .eq('code', req.params.code.toUpperCase()).single()
        
        if (error) return res.status(404).json({ error: 'Room not found' })
        res.json(data)
    } catch (e) {
        res.status(500).json({ error: e.message })
    }
  })

  // POST /api/rooms/:code/join
  router.post('/:code/join', async (req, res) => {
    try {
      const user = await requireHttpUser(req, res)
      if (!user) return
      
      const { data: room } = await supabase.from('rooms').select('*').eq('code', req.params.code.toUpperCase()).single()
      if (!room) return res.status(404).json({ error: 'Room not found' })
      if (room.status !== 'waiting') return res.status(400).json({ error: 'Auction already started' })

      const { data: existing } = await supabase.from('room_teams').select('id').eq('room_id', room.id).eq('user_id', user.id).single()
      if (existing) return res.json({ message: 'Already in room' })

      const { count } = await supabase.from('room_teams').select('id', { count: 'exact' }).eq('room_id', room.id)
      if (count >= 10) return res.status(400).json({ error: 'Room full (max 10 teams)' })

      const { data: profile } = await supabase.from('users').select('*').eq('id', user.id).single()
      const { data: team, error: err } = await supabase.from('room_teams').insert({
        room_id: room.id,
        user_id: user.id,
        team_name: profile?.team_name || 'Team',
        purse_remaining_lakhs: room.purse_lakhs,
        is_ready: false
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

      const { data: teams } = await supabase.from('room_teams')
        .select('*, user:users(display_name,avatar_url)').eq('room_id', room.id)

      const squads = await Promise.all((teams || []).map(async t => {
        const { data: picks } = await supabase.from('squad_picks')
          .select('*, player:players(*)').eq('team_id', t.id)
        return { ...t, players: picks || [] }
      }))

      res.json({ room, squads })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}