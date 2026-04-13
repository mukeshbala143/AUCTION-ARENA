const express = require('express')
const { createClient } = require('@supabase/supabase-js')

// Helper function to generate a random 6-character code for the room.
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ123456789'
  let result = ''
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

module.exports = (supabase, requireHttpUser) => {
  const router = express.Router()

  // POST /api/rooms — Create room
  router.post('/', async (req, res) => {
    try {
      const result = await requireHttpUser(req, res)
      if (!result) return
      const { user, profile } = result

      const { sport, teamName, settings, roomName } = req.body
      const authHeader = req.headers.authorization || ''

      // --- FIX: USER IMPERSONATION ---
      // Create a new Supabase client FOR THIS REQUEST ONLY, authenticated as the actual user.
      const supabaseForUser = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_ANON_KEY, // Use the anon key for this client
        { global: { headers: { Authorization: authHeader } } }
      )

      const newRoom = {
        code: generateRoomCode(),
        sport,
        admin_id: user.id,
        room_name: roomName,
        squad_limit: settings?.squadLimit || 25,
        purse_lakhs: settings?.purseLakhs || 12000,
        max_overseas: settings?.maxOverseas || 8,
        player_order: settings?.playerOrder || 'shuffled',
      }

      const { data: room, error: roomError } = await supabaseForUser
        .from('rooms')
        .insert(newRoom)
        .select()
        .single()

      if (roomError) {
        console.error('Create room error:', roomError)
        return res.status(500).json(roomError)
      }

      const { error: teamError } = await supabase.from('room_teams').insert({
        room_id: room.id,
        user_id: user.id,
        team_name: teamName || profile?.team_name || 'My Team',
        purse_remaining_lakhs: room.purse_lakhs,
      })

      if (teamError) {
        console.error('Create host team error:', teamError)
        return res.status(500).json(teamError)
      }

      res.status(201).json(room)
    } catch (err) {
      console.error('Create room error:', err)
      res.status(500).json({ error: err.message })
    }
  })

  // GET /api/rooms/:code
  router.get('/:code', async (req, res) => {
    const { data, error } = await supabase
      .from('rooms')
      .select('*, admin:users(display_name,team_name,avatar_url), room_teams(*, user:users(display_name,avatar_url))')
      .eq('code', req.params.code.toUpperCase())
      .single()
    if (error) return res.status(404).json({ error: 'Room not found' })
    res.json(data)
  })

  // POST /api/rooms/:code/join
  router.post('/:code/join', async (req, res) => {
    try {
      const result = await requireHttpUser(req, res)
      if (!result) return
      const { user, profile } = result

      const { data: room } = await supabase.from('rooms').select('*').eq('code', req.params.code.toUpperCase()).single()
      if (!room) return res.status(404).json({ error: 'Room not found' })
      if (room.status !== 'waiting') return res.status(400).json({ error: 'Auction already started' })

      const { data: existing } = await supabase.from('room_teams').select('id').eq('room_id', room.id).eq('user_id', user.id).single()
      if (existing) return res.json({ message: 'Already in room' })

      const { count } = await supabase.from('room_teams').select('id', { count: 'exact' }).eq('room_id', room.id)
      if (count >= 10) return res.status(400).json({ error: 'Room full (max 10 teams)' })

      const { data: team, error: err } = await supabase
        .from('room_teams')
        .insert({
          room_id: room.id,
          user_id: user.id,
          team_name: profile?.team_name || 'Team',
          purse_remaining_lakhs: room.purse_lakhs,
          is_ready: false,
        })
        .select()
        .single()

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

      const squads = await Promise.all(
        (teams || []).map(async (t) => {
          const { data: picks } = await supabase.from('squad_picks').select('*, player:players(*)').eq('team_id', t.id)
          return { ...t, players: picks || [] }
        })
      )

      res.json({ room, squads })
    } catch (e) {
      res.status(500).json({ error: e.message })
    }
  })

  return router
}