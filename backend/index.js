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

app.get('/ping', (_req, res) => res.json({ ok: true, ts: Date.now() }))

app.use('/api/rooms',    require('./src/routes/rooms')(supabase))
app.use('/api/analysis', require('./src/routes/analysis')(supabase))

// GET /api/stats - Public stats endpoint
app.get('/api/stats', async (_req, res) => {
  try {
    const { count, error } = await supabase
      .from('users')
      .select('*', { count: 'exact', head: true });

    if (error) throw error;

    res.json({ totalUsers: count });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch stats', details: error.message });
  }
});

// ── Per-room auction state (in-memory) ──────────────────────────────────
const roomStates = {}
function getState(code) {
  if (!roomStates[code]) roomStates[code] = {
    timer: null,
    currentBid: { amount: 0, teamId: null, teamName: null },
    lotQueue: [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'main',
    // ✅ NEW: track real totals
    totalPlayers: 0,   // total players in this auction
    soldCount: 0,      // players sold so far
    unsoldCount: 0,    // players unsold so far
  }
  return roomStates[code]
}

function fmtPrice(lakhs) {
  return lakhs >= 100 ? `${(lakhs/100).toFixed(2)} Cr` : `${lakhs} L`
}

// ── SOCKET.IO ────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('🔌 Socket connected:', socket.id)

  socket.on('room:join', async ({ roomCode, userId }) => {
    socket.join(roomCode)
    const { data: room } = await supabase.from('rooms').select('id').eq('code', roomCode).single()
    if (!room) return
    const { data: teams } = await supabase.from('room_teams')
      .select('*, user:users(display_name, avatar_url)')
      .eq('room_id', room.id)
    io.to(roomCode).emit('lobby:teams', teams || [])
  })

  socket.on('room:ready', async ({ roomCode, teamId, isReady }) => {
    await supabase.from('room_teams').update({ is_ready: isReady }).eq('id', teamId)
    io.to(roomCode).emit('lobby:ready', { teamId, isReady })
  })

  socket.on('admin:start', async ({ roomCode, userId }) => {
    const { data: room } = await supabase.from('rooms')
      .select('*, room_teams(*)').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return

    const state = getState(roomCode)
    state.teamCount = room.room_teams.length

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
      ordered.sort((a, b) => {
        const ar = roleOrder[a.role] ?? 5, br = roleOrder[b.role] ?? 5
        return ar !== br ? ar - br : b.base_price_lakhs - a.base_price_lakhs
      })
    }

    const lots = ordered.map((p, i) => ({
      room_id: room.id, player_id: p.id, lot_number: i + 1,
      status: 'pending', base_price_lakhs: p.base_price_lakhs
    }))

    await supabase.from('auction_lots').delete().eq('room_id', room.id)
    await supabase.from('auction_lots').insert(lots)
    await supabase.from('rooms').update({ status: 'active' }).eq('code', roomCode)

    const { data: createdLots } = await supabase.from('auction_lots')
      .select('*, player:players(*)').eq('room_id', room.id).order('lot_number')

    state.lotQueue     = createdLots || []
    state.lotIdx       = -1
    state.skips        = {}
    state.phase        = 'main'
    // ✅ Set real total once at start
    state.totalPlayers = (createdLots || []).length
    state.soldCount    = 0
    state.unsoldCount  = 0

    io.to(roomCode).emit('auction:started')
    await advanceLot(roomCode, room)
  })

  socket.on('bid:place', async ({ roomCode, lotId, teamId, amountLakhs }) => {
    const state = getState(roomCode)
    const lot = state.lotQueue[state.lotIdx]
    if (!lot || lot.id !== lotId) return
    if (amountLakhs <= state.currentBid.amount) return

    const { data: team } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
    if (!team || team.purse_remaining_lakhs < amountLakhs) return

    const { data: room } = await supabase.from('rooms').select('max_overseas,squad_limit').eq('code', roomCode).single()
    if (lot.player?.is_overseas && team.overseas_count >= (room?.max_overseas || 8)) return
    if (team.squad_count >= (room?.squad_limit || 25)) return

    state.currentBid = { amount: amountLakhs, teamId, teamName: team.team_name }
    await supabase.from('bids').insert({ lot_id: lotId, team_id: teamId, amount_lakhs: amountLakhs })

    io.to(roomCode).emit('auction:bid', {
      teamId, teamName: team.team_name, amountLakhs, timestamp: Date.now()
    })
    startTimer(roomCode, lot)
  })

  socket.on('bid:skip', async ({ roomCode, lotId, teamId }) => {
    const state = getState(roomCode)
    if (!state.skips[lotId]) state.skips[lotId] = new Set()
    state.skips[lotId].add(teamId)
    try { await supabase.from('skips').insert({ lot_id: lotId, team_id: teamId }) } catch {}
    io.to(roomCode).emit('auction:skip', { teamId, skipCount: state.skips[lotId].size, teamCount: state.teamCount })
    if (state.skips[lotId].size >= state.teamCount) {
      clearTimeout(state.timer)
      await markUnsold(roomCode)
    }
  })

  socket.on('auction:pause', async ({ roomCode, userId }) => {
    const { data: room } = await supabase.from('rooms').select('admin_id').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return
    const state = getState(roomCode)
    clearTimeout(state.timer)
    state.paused = true
    io.to(roomCode).emit('auction:paused')
  })

  socket.on('auction:resume', async ({ roomCode, userId }) => {
    const { data: room } = await supabase.from('rooms').select('admin_id').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return
    const state = getState(roomCode)
    state.paused = false
    io.to(roomCode).emit('auction:resumed')
    const lot = state.lotQueue[state.lotIdx]
    if (lot) startTimer(roomCode, lot)
  })

  socket.on('disconnect', () => console.log('🔌 Socket disconnected:', socket.id))
})

// ── Timer ────────────────────────────────────────────────────────────────
function startTimer(roomCode, lot) {
  const state = getState(roomCode)
  clearTimeout(state.timer)
  state.timerRunning = false
  let secs = 15
  state.timerRunning = true
  const tick = async () => {
    const state = getState(roomCode)
    if (!state.timerRunning) return
    if (state.paused) return
    if (secs <= 0) {
      state.timerRunning = false
      if (state.currentBid.teamId) await sellPlayer(roomCode, lot)
      else await markUnsold(roomCode)
      return
    }
    io.to(roomCode).emit('auction:timer', { seconds: secs })
    secs--
    state.timer = setTimeout(tick, 1000)
  }
  state.timer = setTimeout(tick, 1000)
}

// ── Sell player ──────────────────────────────────────────────────────────
async function sellPlayer(roomCode, lot) {
  const state = getState(roomCode)
  if (state.selling) return
  state.selling = true
  const { amount, teamId } = state.currentBid

  await supabase.from('auction_lots').update({
    status: 'sold', final_price_lakhs: amount,
    winner_team_id: teamId, sold_at: new Date().toISOString()
  }).eq('id', lot.id)

  const isOverseas = lot.player?.is_overseas || false
  const { data: currentTeam } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
  await supabase.from('room_teams').update({
    purse_remaining_lakhs: currentTeam.purse_remaining_lakhs - amount,
    squad_count: currentTeam.squad_count + 1,
    overseas_count: isOverseas ? currentTeam.overseas_count + 1 : currentTeam.overseas_count,
  }).eq('id', teamId)

  const { data: room } = await supabase.from('rooms').select('id').eq('code', roomCode).single()
  await supabase.from('squad_picks').insert({
    room_id: room?.id, team_id: teamId, player_id: lot.player_id,
    lot_id: lot.id, price_paid_lakhs: amount
  })

  const { data: updatedTeam } = await supabase.from('room_teams').select('*').eq('id', teamId).single()

  // ✅ Increment sold counter
  state.soldCount++

  io.to(roomCode).emit('auction:sold', {
    player: lot.player,
    winnerTeam: updatedTeam,
    finalPrice: amount,
    lotNumber: lot.lot_number,
    // ✅ Send updated counters to frontend
    soldCount: state.soldCount,
    unsoldCount: state.unsoldCount,
    totalPlayers: state.totalPlayers,
  })

  const { data: r } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
  setTimeout(() => advanceLot(roomCode, r), 4000)
}

// ── Mark unsold ──────────────────────────────────────────────────────────
async function markUnsold(roomCode) {
  const state = getState(roomCode)
  if (state.selling) return
  state.selling = true
  const lot = state.lotQueue[state.lotIdx]
  if (!lot) return

  await supabase.from('auction_lots').update({ status: 'unsold' }).eq('id', lot.id)

  // ✅ Increment unsold counter
  state.unsoldCount++

  io.to(roomCode).emit('auction:unsold', {
    player: lot.player,
    lotNumber: lot.lot_number,
    // ✅ Send updated counters to frontend
    soldCount: state.soldCount,
    unsoldCount: state.unsoldCount,
    totalPlayers: state.totalPlayers,
  })

  const { data: r } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
  setTimeout(() => advanceLot(roomCode, r), 2500)
}

// ── Advance to next lot ──────────────────────────────────────────────────
async function advanceLot(roomCode, room) {
  const state = getState(roomCode)
  state.lotIdx++
  state.selling = false
  state.timerRunning = false
  state.currentBid = { amount: 0, teamId: null, teamName: null }

  if (state.lotIdx >= state.lotQueue.length) {
    if (state.phase === 'main') {
      const { data: unsold } = await supabase.from('auction_lots')
        .select('*, player:players(*)').eq('room_id', room.id)
        .eq('status', 'unsold').eq('is_unsold_round', false)

      if (unsold && unsold.length > 0) {
        await supabase.from('auction_lots').update({ is_unsold_round: true, status: 'pending' })
          .in('id', unsold.map(l => l.id))

        state.lotQueue    = unsold
        state.lotIdx      = -1
        state.skips       = {}
        state.phase       = 'unsold_round'
        // ✅ Reset unsold counter for unsold round display
        // but keep totalPlayers same so progress bar stays correct
        io.to(roomCode).emit('auction:phase', {
          phase: 'unsold_round',
          count: unsold.length,
          soldCount: state.soldCount,
          unsoldCount: state.unsoldCount,
          totalPlayers: state.totalPlayers,
        })
        setTimeout(() => advanceLot(roomCode, room), 3000)
        return
      }
    }

    await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode)
    io.to(roomCode).emit('auction:phase', {
      phase: 'finished',
      soldCount: state.soldCount,
      unsoldCount: state.unsoldCount,
      totalPlayers: state.totalPlayers,
    })
    return
  }

  const lot = state.lotQueue[state.lotIdx]
  await supabase.from('auction_lots').update({
    status: 'active', started_at: new Date().toISOString()
  }).eq('id', lot.id)

  state.currentBid.amount = lot.base_price_lakhs

  // ✅ lotNumber = actual lot number from DB (1-based, correct)
  // ✅ totalLots = REAL total players (not just current phase)
  io.to(roomCode).emit('auction:player_up', {
    player: lot.player,
    lot,
    lotNumber: lot.lot_number,           // actual position e.g. 5
    totalLots: state.totalPlayers,        // ✅ FIXED: real total e.g. 37, not 350
    basePriceLakhs: lot.base_price_lakhs,
    soldCount: state.soldCount,           // ✅ NEW
    unsoldCount: state.unsoldCount,       // ✅ NEW
  })

  startTimer(roomCode, lot)
}

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`🚀 Auction Arena backend on port ${PORT}`))