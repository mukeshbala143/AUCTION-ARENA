require('dotenv').config()
const express  = require('express')
const http     = require('http')
const { Server } = require('socket.io')
const cors     = require('cors')
const { createClient } = require('@supabase/supabase-js')
const app    = express()
const server = http.createServer(app)
const DEFAULT_FRONTEND_ORIGINS = [
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://auctionarena.org',
  'https://www.auctionarena.org',
]
const VERCEL_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i

function getAllowedOrigins() {
  const envOrigins = [
    process.env.FRONTEND_URL,
    process.env.FRONTEND_URLS,
  ]
    .filter(Boolean)
    .flatMap(value => value.split(','))
    .map(origin => origin.trim())
    .filter(Boolean)

  return [...new Set([...DEFAULT_FRONTEND_ORIGINS, ...envOrigins])]
}

const allowedOrigins = getAllowedOrigins()
const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin) || VERCEL_PREVIEW_ORIGIN.test(origin)) {
      return callback(null, true)
    }
    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
}

const io     = new Server(server, {
  cors: corsOptions
})
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
app.use(cors(corsOptions))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    service: 'auction-arena-backend',
    message: 'Backend is live. Use /ping or /api/* endpoints.',
    frontend: 'https://www.auctionarena.org',
    timestamp: Date.now(),
  })
})

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
    totalPlayers: 0,   
    soldCount: 0,      
    unsoldCount: 0,    
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
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room) return
    const { data: teams } = await supabase.from('room_teams')
      .select('*, user:users(display_name, avatar_url)')
      .eq('room_id', room.id)
    io.to(roomCode).emit('lobby:teams', teams || [])

    // ✅ Rejoin: send current auction state if active
    if (room.status === 'active') {
      const state = getState(roomCode)
      const lot = state.lotQueue[state.lotIdx]
      if (lot) {
        socket.emit('auction:player_up', {
          player: lot.player,
          lot,
          lotNumber: lot.lot_number,
          totalLots: state.totalPlayers,
          basePriceLakhs: lot.base_price_lakhs,
          soldCount: state.soldCount,
          unsoldCount: state.unsoldCount,
        })
        socket.emit('auction:bid', {
          teamId: state.currentBid.teamId,
          teamName: state.currentBid.teamName,
          amountLakhs: state.currentBid.amount,
          timestamp: Date.now()
        })
        socket.emit('auction:timer', { seconds: 15 })
      }
    }
  })

  socket.on('room:ready', async ({ roomCode, teamId, isReady }) => {
    await supabase.from('room_teams').update({ is_ready: isReady }).eq('id', teamId)
    io.to(roomCode).emit('lobby:ready', { teamId, isReady })
  })

  socket.on('admin:start', async ({ roomCode, userId }) => {
    const { data: room } = await supabase.from('rooms')
      .select('*, room_teams(*)').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return

    // ✅ Full state reset on every start
    roomStates[roomCode] = {
      timer: null, timerId: null,
      currentBid: { amount: 0, teamId: null, teamName: null },
      lotQueue: [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'main',
      totalPlayers: 0, soldCount: 0, unsoldCount: 0,
      selling: false, timerRunning: false, paused: false,
    }
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

    const { error: delError } = await supabase.from('auction_lots').delete().eq('room_id', room.id)
    if (delError) console.error('Delete error:', delError)
    // Insert in chunks to avoid timeout
    const chunkSize = 50
    for (let i = 0; i < lots.length; i += chunkSize) {
      await supabase.from('auction_lots').insert(lots.slice(i, i + chunkSize))
    }
    await supabase.from('rooms').update({ status: 'active' }).eq('code', roomCode)

    const { data: createdLots } = await supabase.from('auction_lots')
      .select('*, player:players(*)').eq('room_id', room.id).order('lot_number')

    state.lotQueue     = createdLots || []
    state.lotIdx       = -1
    state.skips        = {}
    state.phase        = 'main'
    state.totalPlayers = (createdLots || []).length
    state.soldCount    = 0
    state.unsoldCount  = 0

    io.to(roomCode).emit('auction:started')
    await advanceLot(roomCode, room)
  })

  // ✅ UPDATED LOGIC: Instant sell if others already skipped
  socket.on('bid:place', async ({ roomCode, lotId, teamId, amountLakhs }) => {
    const state = getState(roomCode)
    const lot = state.lotQueue[state.lotIdx]
    if (!lot || lot.id !== lotId) return
    if (amountLakhs <= state.currentBid.amount) return
    if (state.lastBidder === teamId) return
    state.lastBidder = teamId

    const { data: team } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
    if (!team || team.purse_remaining_lakhs < amountLakhs) return

    const { data: room } = await supabase.from('rooms').select('max_overseas,squad_limit').eq('code', roomCode).single()
    if (lot.player?.is_overseas && team.overseas_count >= (room?.max_overseas || 8)) return
    if (team.squad_count >= (room?.squad_limit || 25)) return

    state.selling = false
    state.currentBid = { amount: amountLakhs, teamId, teamName: team.team_name }
    await supabase.from('bids').insert({ lot_id: lotId, team_id: teamId, amount_lakhs: amountLakhs })

    io.to(roomCode).emit('auction:bid', {
      teamId, teamName: team.team_name, amountLakhs, timestamp: Date.now()
    })

    // Naya logic: Agar bidder ne pehle skip kiya tha, wo hata do
    const requiredSkips = state.teamCount - 1;
    let validSkips = state.skips[lotId] ? state.skips[lotId].size : 0;

    if (state.skips[lotId] && state.skips[lotId].has(teamId)) {
      validSkips--;
      state.skips[lotId].delete(teamId);
    }

    if (validSkips >= requiredSkips && requiredSkips > 0) {
       clearTimeout(state.timer)
       await sellPlayer(roomCode, lot) // Turant bech do
    } else {
       startTimer(roomCode, lot) // Normal timer
    }
  })

  // ✅ UPDATED LOGIC: Check for active bid before requiring full skips
  socket.on('bid:skip', async ({ roomCode, lotId, teamId }) => {
    const state = getState(roomCode)
    if (!state.skips[lotId]) state.skips[lotId] = new Set()
    state.skips[lotId].add(teamId)
    
    try { await supabase.from('skips').insert({ lot_id: lotId, team_id: teamId }) } catch {}

    const hasBid = !!state.currentBid.teamId;
    const requiredSkips = hasBid ? state.teamCount - 1 : state.teamCount;

    io.to(roomCode).emit('auction:skip', { teamId, skipCount: state.skips[lotId].size, teamCount: state.teamCount })
    
    if (state.skips[lotId].size >= requiredSkips) {
      clearTimeout(state.timer)
      if (hasBid) {
        await sellPlayer(roomCode, state.lotQueue[state.lotIdx])
      } else {
        await markUnsold(roomCode)
      }
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

  socket.on('admin:end_main', async ({ roomCode, userId }) => {
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return
    const state = getState(roomCode)
    clearTimeout(state.timer)
    state.timerId = null
    state.selling = true
    // Mark remaining pending/active lots as unsold
    await supabase.from('auction_lots')
      .update({ status: 'unsold' })
      .eq('room_id', room.id)
      .in('status', ['pending', 'active'])
    await supabase.from('rooms').update({ status: 'unsold_selection' }).eq('code', roomCode)
    io.to(roomCode).emit('auction:phase', {
      phase: 'unsold_selection',
      soldCount: state.soldCount,
      unsoldCount: state.unsoldCount,
      totalPlayers: state.totalPlayers,
    })
  })

  socket.on('unsold:team_done', ({ roomCode, teamId }) => {
    io.to(roomCode).emit('unsold:team_done', { teamId })
  })

  socket.on('unsold:start_auction', async ({ roomCode, userId, lotIds }) => {
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room || room.admin_id !== userId) return
    const { data: selectedLots } = await supabase.from('auction_lots')
      .select('*, player:players(*)').eq('room_id', room.id)
      .in('id', lotIds).order('lot_number')
    roomStates[roomCode] = {
      timer: null, timerId: null,
      currentBid: { amount: 0, teamId: null, teamName: null },
      lotQueue: selectedLots || [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'unsold_round',
      totalPlayers: (selectedLots || []).length, soldCount: 0, unsoldCount: 0,
      selling: false, timerRunning: false, paused: false, lastBidder: null,
    }
    const newState = getState(roomCode)
    const { data: teams } = await supabase.from('room_teams').select('*').eq('room_id', room.id)
    newState.teamCount = (teams || []).length
    await supabase.from('rooms').update({ status: 'active' }).eq('code', roomCode)
    io.to(roomCode).emit('auction:started')
    io.to(roomCode).emit('unsold:start_auction')
    await advanceLot(roomCode, room)
  })

  socket.on('disconnect', () => console.log('🔌 Socket disconnected:', socket.id))
})

// ── Timer ────────────────────────────────────────────────────────────────
function startTimer(roomCode, lot) {
  const state = getState(roomCode)
  clearTimeout(state.timer)
  const timerId = Date.now()
  state.timerId = timerId
  state.selling = false
  let secs = 15

  const tick = async () => {
    const state = getState(roomCode)
    if (state.timerId !== timerId) return
    if (state.paused) return

    io.to(roomCode).emit('auction:timer', { seconds: secs })

    if (secs <= 0) {
      if (state.timerId !== timerId) return
      if (state.currentBid.teamId) await sellPlayer(roomCode, lot)
      else await markUnsold(roomCode)
      return
    }
    secs--
    state.timer = setTimeout(tick, 1000)
  }

  tick()
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

  state.soldCount++

  io.to(roomCode).emit('auction:sold', {
    player: lot.player,
    winnerTeam: updatedTeam,
    finalPrice: amount,
    lotNumber: lot.lot_number,
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

  state.unsoldCount++

  io.to(roomCode).emit('auction:unsold', {
    player: lot.player,
    lotNumber: lot.lot_number,
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
  state.lastBidder = null
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

    if (state.phase === 'main') {
      // Main auction done - go to unsold selection page
      await supabase.from('rooms').update({ status: 'unsold_selection' }).eq('code', roomCode)
      io.to(roomCode).emit('auction:phase', {
        phase: 'unsold_selection',
        soldCount: state.soldCount,
        unsoldCount: state.unsoldCount,
        totalPlayers: state.totalPlayers,
      })
      return
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

  io.to(roomCode).emit('auction:player_up', {
    player: lot.player,
    lot,
    lotNumber: lot.lot_number,           
    totalLots: state.totalPlayers,       
    basePriceLakhs: lot.base_price_lakhs,
    soldCount: state.soldCount,          
    unsoldCount: state.unsoldCount,      
  })

  startTimer(roomCode, lot)
}

const PORT = process.env.PORT || 3001
server.listen(PORT, () => console.log(`🚀 Auction Arena backend on port ${PORT}`))
