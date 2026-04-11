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

async function getUserFromAccessToken(token) {
  const accessToken = String(token || '').trim()
  if (!accessToken) return null
  const { data, error } = await supabase.auth.getUser(accessToken)
  if (error) {
    console.warn('[auth] token verification failed:', error.message)
    return null
  }
  return data?.user || null
}

async function requireHttpUser(req, res) {
  const authHeader = req.headers.authorization || ''
  const [, token = ''] = authHeader.match(/^Bearer\s+(.+)$/i) || []
  const user = await getUserFromAccessToken(token)
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' })
    return null
  }
  req.user = user
  return user
}

async function requireSocketUser(token, claimedUserId) {
  const user = await getUserFromAccessToken(token)
  if (!user) return null
  if (claimedUserId && user.id !== claimedUserId) return null
  return user
}

async function requireOwnedTeam(teamId, userId) {
  const { data: team } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
  if (!team || team.user_id !== userId) return null
  return team
}
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

app.use('/api/rooms',    require('./src/routes/rooms')(supabase, requireHttpUser))
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
    timerId: null,
    timerValue: 15,
    timerStartedAt: null,
    currentBid: { amount: 0, teamId: null, teamName: null },
    lotQueue: [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'main',
    totalPlayers: 0,   
    soldCount: 0,      
    unsoldCount: 0,    
    selling: false,
    timerRunning: false,
    paused: false,
    lastBidder: null,
  }
  return roomStates[code]
}

function getRemainingSeconds(startedAt, durationSeconds = 15) {
  const startMs = new Date(startedAt || 0).getTime()
  if (!Number.isFinite(startMs) || startMs <= 0) return durationSeconds
  const elapsed = Math.floor((Date.now() - startMs) / 1000)
  return Math.max(0, durationSeconds - elapsed)
}

async function hydrateAuctionState(roomCode, room) {
  const state = getState(roomCode)
  const { data: lots } = await supabase.from('auction_lots')
    .select('*, player:players(*)')
    .eq('room_id', room.id)
    .order('lot_number')

  if (!lots || lots.length === 0) return { state, activeLot: null, nextPendingLot: null }

  state.lotQueue = lots
  state.totalPlayers = lots.length

  const [{ count: soldCount }, { count: unsoldCount }, { count: teamCount }] = await Promise.all([
    supabase.from('auction_lots').select('id', { count: 'exact', head: true }).eq('room_id', room.id).eq('status', 'sold'),
    supabase.from('auction_lots').select('id', { count: 'exact', head: true }).eq('room_id', room.id).eq('status', 'unsold'),
    supabase.from('room_teams').select('id', { count: 'exact', head: true }).eq('room_id', room.id),
  ])

  state.soldCount = soldCount || 0
  state.unsoldCount = unsoldCount || 0
  state.teamCount = teamCount || 0

  const activeLot = lots.find((l) => l.status === 'active') || null
  const nextPendingLot = lots.find((l) => l.status === 'pending') || null
  state.phase = lots.some((l) => l.is_unsold_round && (l.status === 'active' || l.status === 'pending'))
    ? 'unsold_round'
    : 'main'

  console.log(
    `[auction][hydrate] room=${roomCode} totalLots=${lots.length} activeLot=${activeLot?.lot_number || 'none'} pendingLot=${nextPendingLot?.lot_number || 'none'} sold=${state.soldCount} unsold=${state.unsoldCount} phase=${state.phase}`
  )

  if (activeLot) {
    state.lotIdx = lots.findIndex((l) => l.id === activeLot.id)
    const { data: bids } = await supabase.from('bids')
      .select('amount_lakhs, team:room_teams(id, team_name)')
      .eq('lot_id', activeLot.id)
      .order('amount_lakhs', { ascending: false })
      .limit(1)

    if (bids && bids.length > 0 && bids[0].team) {
      state.currentBid = {
        amount: bids[0].amount_lakhs,
        teamId: bids[0].team.id,
        teamName: bids[0].team.team_name,
      }
    } else {
      state.currentBid = {
        amount: activeLot.base_price_lakhs,
        teamId: null,
        teamName: null,
      }
    }

    state.timerValue = getRemainingSeconds(activeLot.started_at, 15)
    state.timerStartedAt = activeLot.started_at || new Date().toISOString()
    console.log(
      `[auction][hydrate] resumed active lot room=${roomCode} lot=${activeLot.lot_number} bid=${state.currentBid.amount} remaining=${state.timerValue}s`
    )
  } else {
    state.currentBid = { amount: 0, teamId: null, teamName: null }
    state.timerValue = 15
    state.timerStartedAt = null
    state.lotIdx = nextPendingLot ? Math.max(0, lots.findIndex((l) => l.id === nextPendingLot.id) - 1) : -1
    console.log(
      `[auction][hydrate] no active lot room=${roomCode} nextPending=${nextPendingLot?.lot_number || 'none'}`
    )
  }

  return { state, activeLot, nextPendingLot }
}

function fmtPrice(lakhs) {
  return lakhs >= 100 ? `${(lakhs/100).toFixed(2)} Cr` : `${lakhs} L`
}

// ── SOCKET.IO ────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('🔌 Socket connected:', socket.id)

  socket.on('room:join', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    if (!user) return
    socket.join(roomCode)
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room) return
    const { data: teams } = await supabase.from('room_teams')
      .select('*, user:users(display_name, avatar_url)')
      .eq('room_id', room.id)
    io.to(roomCode).emit('lobby:teams', teams || [])

    // ✅ Rejoin: send current auction state if active
    if (room.status === 'active') {
      console.log(`[rejoin] Hydrating active room state: ${roomCode}`)
      const { state, activeLot, nextPendingLot } = await hydrateAuctionState(roomCode, room)

      if (activeLot) {
        const lot = state.lotQueue[state.lotIdx]
        socket.emit('auction:player_up', { player: lot.player, lot, lotNumber: lot.lot_number, totalLots: state.totalPlayers, basePriceLakhs: lot.base_price_lakhs, soldCount: state.soldCount, unsoldCount: state.unsoldCount })
        socket.emit('auction:bid', { teamId: state.currentBid.teamId, teamName: state.currentBid.teamName, amountLakhs: state.currentBid.amount, timestamp: Date.now() })
        socket.emit('auction:timer', { seconds: state.timerValue })

        if (!state.paused && !state.timerId && !state.selling) {
          startTimer(roomCode, lot, { seconds: state.timerValue, persistStartedAt: false })
        }
      } else if (nextPendingLot && !state.selling) {
        console.log(`[rejoin] No active lot found for ${roomCode}; resuming from next pending lot`)
        clearTimeout(state.timer)
        state.timer = null
        state.timerId = null
        await advanceLot(roomCode, room)
      }
    }
  })

  socket.on('room:ready', async ({ roomCode, teamId, isReady, token }) => {
    const user = await requireSocketUser(token)
    const team = user ? await requireOwnedTeam(teamId, user.id) : null
    if (!team) return
    await supabase.from('room_teams').update({ is_ready: isReady }).eq('id', teamId)
    io.to(roomCode).emit('lobby:ready', { teamId, isReady })
  })

  socket.on('admin:start', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms')
      .select('*, room_teams(*)').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return

    // ✅ Full state reset on every start
    roomStates[roomCode] = {
      timer: null, timerId: null,
      timerValue: 15, currentBid: { amount: 0, teamId: null, teamName: null },
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
  socket.on('bid:place', async ({ roomCode, lotId, teamId, amountLakhs, token }) => {
    const user = await requireSocketUser(token)
    if (!user) return
    const state = getState(roomCode)
    const lot = state.lotQueue[state.lotIdx]
    if (!lot || lot.id !== lotId) return
    if (amountLakhs <= state.currentBid.amount) return
    if (state.lastBidder === teamId) return
    state.lastBidder = teamId

    const team = await requireOwnedTeam(teamId, user.id)
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
  socket.on('bid:skip', async ({ roomCode, lotId, teamId, token }) => {
    const user = await requireSocketUser(token)
    const team = user ? await requireOwnedTeam(teamId, user.id) : null
    if (!team) return
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

  socket.on('auction:pause', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms').select('admin_id').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return
    const state = getState(roomCode)
    clearTimeout(state.timer)
    state.paused = true
    io.to(roomCode).emit('auction:paused')
  })

  socket.on('auction:resume', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms').select('admin_id').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return
    const state = getState(roomCode)
    state.paused = false
    io.to(roomCode).emit('auction:resumed')
    const lot = state.lotQueue[state.lotIdx]
    if (lot) startTimer(roomCode, lot)
  })

  socket.on('admin:end_main', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return
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

  socket.on('unsold:team_done', async ({ roomCode, teamId, token }) => {
    const user = await requireSocketUser(token)
    const team = user ? await requireOwnedTeam(teamId, user.id) : null
    if (!team) return
    io.to(roomCode).emit('unsold:team_done', { teamId })
  })

  socket.on('unsold:start_auction', async ({ roomCode, userId, lotIds, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return
    const { data: selectedLots } = await supabase.from('auction_lots')
      .select('*, player:players(*)').eq('room_id', room.id)
      .in('id', lotIds).order('lot_number')
    roomStates[roomCode] = {
      timer: null, timerId: null,
      timerValue: 15, currentBid: { amount: 0, teamId: null, teamName: null },
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

  socket.on('disconnect', (reason) => console.log('🔌 Socket disconnected:', socket.id, 'reason:', reason))
})

// ── Timer ────────────────────────────────────────────────────────────────
function startTimer(roomCode, lot, options = {}) {
  const state = getState(roomCode)
  clearTimeout(state.timer)
  const timerId = Date.now()
  state.timerId = timerId
  state.selling = false
  state.timerValue = Math.max(0, Number.isFinite(options.seconds) ? options.seconds : 15)
  state.timerStartedAt = new Date(Date.now() - Math.max(0, 15 - state.timerValue) * 1000).toISOString()

  console.log(
    `[auction][timer:start] room=${roomCode} lot=${lot?.lot_number || 'unknown'} seconds=${state.timerValue} persist=${options.persistStartedAt !== false}`
  )

  if (options.persistStartedAt !== false && lot?.id) {
    lot.started_at = state.timerStartedAt
    supabase.from('auction_lots')
      .update({ started_at: state.timerStartedAt })
      .eq('id', lot.id)
      .then(({ error }) => {
        if (error) console.error('Failed to persist timer start:', error.message)
      })
  }

  const tick = async () => {
    const state = getState(roomCode)
    if (state.timerId !== timerId) return
    if (state.paused) return

    io.to(roomCode).emit('auction:timer', { seconds: state.timerValue })

    if (state.timerValue <= 0) {
      console.log(
        `[auction][timer:end] room=${roomCode} lot=${lot?.lot_number || 'unknown'} outcome=${state.currentBid.teamId ? 'sell' : 'unsold'}`
      )
      if (state.timerId !== timerId) return
      if (state.currentBid.teamId) await sellPlayer(roomCode, lot)
      else await markUnsold(roomCode)
      return
    }
    state.timerValue--
    state.timer = setTimeout(tick, 1000)
  }

  state.timer = null
  tick()
}

// ── Sell player ──────────────────────────────────────────────────────────
async function sellPlayer(roomCode, lot) {
  const state = getState(roomCode)
  if (state.selling) return
  state.selling = true
  const { amount, teamId } = state.currentBid

  console.log(
    `[auction][sell] room=${roomCode} lot=${lot?.lot_number || 'unknown'} team=${teamId || 'none'} amount=${amount}`
  )

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

  console.log(`[auction][unsold] room=${roomCode} lot=${lot.lot_number}`)

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
  console.log(
    `[auction][advance] room=${roomCode} phase=${state.phase} lot=${lot?.lot_number || 'none'} idx=${state.lotIdx} total=${state.lotQueue.length}`
  )
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
