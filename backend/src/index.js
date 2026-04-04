require('dotenv').config()
const express  = require('express')
const http     = require('http')
const { Server } = require('socket.io')
const cors     = require('cors')
const { createClient } = require('@supabase/supabase-js')

const app    = express()
const server = http.createServer(app)
const io     = new Server(server, {
  cors: { origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }
})

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:5173', credentials: true }))
app.use(express.json())

// Keep-alive ping (prevents Railway cold starts during auctions)
app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }))

// ── API Routes ─────────────────────────────────────────────────────────────
app.use('/api/rooms',    require('./routes/rooms')(supabase))
app.use('/api/analysis', require('./routes/analysis')(supabase))

// ── Per-room auction state (in-memory) ────────────────────────────────────
const roomStates = {}

function getState(code) {
  if (!roomStates[code]) roomStates[code] = {
    timer: null, currentBid: { amount: 0, teamId: null, teamName: null },
    lotQueue: [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'main'
  }
  return roomStates[code]
}

function fmtPrice(lakhs) {
  return lakhs >= 100 ? `${(lakhs/100).toFixed(2)} Cr` : `${lakhs} L`
}

// ── SOCKET.IO ──────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('🔌 Socket connected:', socket.id)

  // Join room channel
  socket.on('room:join', async ({ roomCode, userId }) => {
    socket.join(roomCode)
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomCode).single()
    if (!room) return
    const { data: teams } = await supabase.from('room_teams')
      .select('*, user:users(display_name, avatar_url)')
      .eq('room_id', room.id)
    io.to(roomCode).emit('lobby:teams', teams || [])
  })

  // Toggle ready
  socket.on('room:ready', async ({ roomCode, teamId, isReady }) => {
    await supabase.from('room_teams').update({ is_ready: isReady }).eq('id', teamId)
    io.to(roomCode).emit('lobby:ready', { teamId, isReady })
  })

  // Admin starts auction
  socket.on('admin:start', async ({ roomCode, userId }) => {
    const { data: room } = await supabase.from('rooms')
      .select('*, room_teams(*)').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return

    const state = getState(roomCode)
    state.teamCount = room.room_teams.length

    // Get players ordered per config
    const { data: players } = await supabase.from('players')
      .select('*').eq('sport', room.sport)

    let ordered = [...(players || [])]
    if (room.player_order === 'shuffled') {
      for (let i = ordered.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [ordered[i], ordered[j]] = [ordered[j], ordered[i]]
      }
    } else {
      const roleOrder = { batsman:0, allrounder:1, bowler:2, wicketkeeper:3, raider:0, defender:1, st:0, lw:1, rw:1, cm:2, cdm:2, cam:2, cb:3, lb:3, rb:3, gk:4 }
      ordered.sort((a,b) => {
        const ar = roleOrder[a.role] ?? 5, br = roleOrder[b.role] ?? 5
        return ar !== br ? ar - br : b.base_price_lakhs - a.base_price_lakhs
      })
    }

    // Create lots in DB
    const lots = ordered.map((p, i) => ({
      room_id: room.id, player_id: p.id, lot_number: i+1,
      status: 'pending', base_price_lakhs: p.base_price_lakhs
    }))
    await supabase.from('auction_lots').delete().eq('room_id', room.id) // clear if restart
    await supabase.from('auction_lots').insert(lots)
    await supabase.from('rooms').update({ status: 'active' }).eq('code', roomCode)

    const { data: createdLots } = await supabase.from('auction_lots')
      .select('*, player:players(*)').eq('room_id', room.id).order('lot_number')
    state.lotQueue = createdLots || []
    state.lotIdx   = -1
    state.skips    = {}
    state.phase    = 'main'

    io.to(roomCode).emit('auction:started')
    await advanceLot(roomCode, room)
  })

  // Place bid
  socket.on('bid:place', async ({ roomCode, lotId, teamId, amountLakhs }) => {
    const state = getState(roomCode)
    const lot = state.lotQueue[state.lotIdx]
    if (!lot || lot.id !== lotId) return
    if (amountLakhs <= state.currentBid.amount) return

    // Validate purse
    const { data: team } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
    if (!team || team.purse_remaining_lakhs < amountLakhs) return

    // Validate overseas cap
    const { data: room } = await supabase.from('rooms').select('max_overseas').eq('code', roomCode).single()
    if (lot.player?.is_overseas && team.overseas_count >= (room?.max_overseas || 8)) return

    // Validate squad cap
    const { data: r } = await supabase.from('rooms').select('squad_limit').eq('code', roomCode).single()
    if (team.squad_count >= (r?.squad_limit || 25)) return

    state.currentBid = { amount: amountLakhs, teamId, teamName: team.team_name }

    // Save to DB
    await supabase.from('bids').insert({ lot_id: lotId, team_id: teamId, amount_lakhs: amountLakhs })

    io.to(roomCode).emit('auction:bid', {
      teamId, teamName: team.team_name, amountLakhs, timestamp: Date.now()
    })
    startTimer(roomCode, lot)
  })

  // Skip player
  socket.on('bid:skip', async ({ roomCode, lotId, teamId }) => {
    const state = getState(roomCode)
    if (!state.skips[lotId]) state.skips[lotId] = new Set()
    state.skips[lotId].add(teamId)

    try { await supabase.from('skips').insert({ lot_id: lotId, team_id: teamId }) } catch {}

    io.to(roomCode).emit('auction:skip', { teamId })

    if (state.skips[lotId].size >= state.teamCount) {
      clearTimeout(state.timer)
      await markUnsold(roomCode)
    }
  })

  socket.on('disconnect', () => console.log('🔌 Socket disconnected:', socket.id))
})

// ── Timer ──────────────────────────────────────────────────────────────────
function startTimer(roomCode, lot) {
  const state = getState(roomCode)
  clearTimeout(state.timer)
  let secs = 15

  const tick = async () => {
    io.to(roomCode).emit('auction:timer', { seconds: secs })
    if (secs <= 0) {
      if (state.currentBid.teamId) await sellPlayer(roomCode, lot)
      else await markUnsold(roomCode)
      return
    }
    secs--
    state.timer = setTimeout(tick, 1000)
  }
  state.timer = setTimeout(tick, 1000)
}

// ── Sell player ────────────────────────────────────────────────────────────
async function sellPlayer(roomCode, lot) {
  const state = getState(roomCode)
  const { amount, teamId, teamName } = state.currentBid

  await supabase.from('auction_lots').update({
    status: 'sold', final_price_lakhs: amount,
    winner_team_id: teamId, sold_at: new Date().toISOString()
  }).eq('id', lot.id)

  // Deduct purse & update counts
  const isOverseas = lot.player?.is_overseas || false
  await supabase.from('room_teams').update({
    purse_remaining_lakhs: supabase.raw(`purse_remaining_lakhs - ${amount}`),
    squad_count: supabase.raw('squad_count + 1'),
    overseas_count: isOverseas ? supabase.raw('overseas_count + 1') : undefined,
  }).eq('id', teamId)

  // Add to squad picks
  const { data: room } = await supabase.from('rooms').select('id').eq('code', roomCode).single()
  await supabase.from('squad_picks').insert({
    room_id: room?.id, team_id: teamId, player_id: lot.player_id,
    lot_id: lot.id, price_paid_lakhs: amount
  })

  // Get updated team
  const { data: updatedTeam } = await supabase.from('room_teams').select('*').eq('id', teamId).single()

  io.to(roomCode).emit('auction:sold', {
    player: lot.player, winnerTeam: updatedTeam,
    finalPrice: amount, lotNumber: lot.lot_number
  })

  const { data: r } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
  setTimeout(() => advanceLot(roomCode, r), 4000)
}

// ── Mark unsold ────────────────────────────────────────────────────────────
async function markUnsold(roomCode) {
  const state = getState(roomCode)
  const lot = state.lotQueue[state.lotIdx]
  if (!lot) return
  await supabase.from('auction_lots').update({ status: 'unsold' }).eq('id', lot.id)
  io.to(roomCode).emit('auction:unsold', { player: lot.player, lotNumber: lot.lot_number })
  const { data: r } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
  setTimeout(() => advanceLot(roomCode, r), 2500)
}

// ── Advance to next lot ────────────────────────────────────────────────────
async function advanceLot(roomCode, room) {
  const state = getState(roomCode)
  state.lotIdx++
  state.currentBid = { amount: 0, teamId: null, teamName: null }

  if (state.lotIdx >= state.lotQueue.length) {
    if (state.phase === 'main') {
      // Check for unsold players
      const { data: unsold } = await supabase.from('auction_lots')
        .select('*, player:players(*)').eq('room_id', room.id)
        .eq('status', 'unsold').eq('is_unsold_round', false)

      if (unsold && unsold.length > 0) {
        await supabase.from('auction_lots').update({ is_unsold_round: true, status: 'pending' })
          .in('id', unsold.map(l => l.id))
        state.lotQueue  = unsold
        state.lotIdx    = -1
        state.skips     = {}
        state.phase     = 'unsold_round'
        io.to(roomCode).emit('auction:phase', { phase: 'unsold_round', count: unsold.length })
        setTimeout(() => advanceLot(roomCode, room), 3000)
        return
      }
    }
    // All done
    await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode)
    io.to(roomCode).emit('auction:phase', { phase: 'finished' })
    return
  }

  const lot = state.lotQueue[state.lotIdx]
  await supabase.from('auction_lots').update({ status: 'active', started_at: new Date().toISOString() }).eq('id', lot.id)

  state.currentBid.amount = lot.base_price_lakhs

  io.to(roomCode).emit('auction:player_up', {
    player: lot.player, lot, lotNumber: lot.lot_number,
    totalLots: state.lotQueue.length, basePriceLakhs: lot.base_price_lakhs
  })

  startTimer(roomCode, lot)
}

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`🚀 Auction Arena backend on port ${PORT}`))
