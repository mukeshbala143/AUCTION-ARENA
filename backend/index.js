require('dotenv').config()
const express  = require('express')
const http     = require('http')
const { Server } = require('socket.io')
const cors     = require('cors')
const axios    = require('axios')
const crypto   = require('crypto')
const { createClient } = require('@supabase/supabase-js')
const { runLoginReminderSweep, startLoginReminderScheduler } = require('./src/services/loginReminderService')
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
const AUCTION_TIMER_SECONDS = 15
const AUCTION_VIEW_PAGES = new Set(['auction', 'reauction'])

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

app.post('/api/admin/login-reminders/run', async (req, res) => {
  const cronSecret = process.env.CRON_SECRET
  const providedSecret = req.headers['x-cron-secret'] || req.query.secret

  if (!cronSecret || providedSecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const testAllUsers = req.body?.testAllUsers === true || req.query.testAllUsers === 'true'
    const sendAllUsers = req.body?.sendAllUsers === true || req.query.sendAllUsers === 'true'
    const result = await runLoginReminderSweep(supabase, {
      forceAllUsers: testAllUsers || sendAllUsers,
      recordSends: !testAllUsers,
    })
    res.json(result)
  } catch (error) {
    console.error('[login-reminders] manual run failed:', error)
    res.status(500).json({ error: 'Failed to run login reminders', details: error.message })
  }
})

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
const auctionViewerCounts = {}
function getState(code) {
  if (!roomStates[code]) roomStates[code] = {
    timer: null,
    advanceTimeout: null,
    timerId: null,
    timerValue: 15,
    timerStartedAt: null,
    currentBid: { amount: 0, teamId: null, teamName: null },
    lotQueue: [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'main',
    currentUnsoldQueue: [],
    totalPlayers: 0,
    soldCount: 0,
    unsoldCount: 0,
    selling: false,
    timerRunning: false,
    paused: false,
    lastBidder: null,
    autoPausedNoViewers: false,
    pauseRequested: false,
  }
  return roomStates[code]
}

function isAuctionViewerPage(page) {
  return AUCTION_VIEW_PAGES.has(String(page || '').trim())
}

function getAuctionViewerCount(roomCode) {
  return auctionViewerCounts[roomCode] || 0
}

function hasAuctionViewers(roomCode) {
  return getAuctionViewerCount(roomCode) > 0
}

function addAuctionViewer(roomCode) {
  auctionViewerCounts[roomCode] = getAuctionViewerCount(roomCode) + 1
}

function removeAuctionViewer(roomCode) {
  const nextCount = Math.max(0, getAuctionViewerCount(roomCode) - 1)
  if (nextCount === 0) {
    delete auctionViewerCounts[roomCode]
    return
  }
  auctionViewerCounts[roomCode] = nextCount
}

function syncSocketRoomPresence(socket, roomCode, page) {
  const nextPresence = roomCode ? { roomCode, page: page || null } : null
  const prevPresence = socket.data.roomPresence || null
  const prevWasAuctionViewer = prevPresence && isAuctionViewerPage(prevPresence.page)
  const nextIsAuctionViewer = nextPresence && isAuctionViewerPage(nextPresence.page)

  if (prevPresence?.roomCode && (!nextPresence || prevPresence.roomCode !== nextPresence.roomCode || prevWasAuctionViewer !== nextIsAuctionViewer)) {
    if (prevWasAuctionViewer) removeAuctionViewer(prevPresence.roomCode)
  }

  if (nextPresence?.roomCode && (!prevPresence || prevPresence.roomCode !== nextPresence.roomCode || prevWasAuctionViewer !== nextIsAuctionViewer)) {
    if (nextIsAuctionViewer) addAuctionViewer(nextPresence.roomCode)
  }

  socket.data.roomPresence = nextPresence
}

function suspendAuctionRoom(roomCode, reason = 'no_viewers') {
  const state = roomStates[roomCode]
  if (!state || hasAuctionViewers(roomCode)) return
  if (!state.timerId && !state.advanceTimeout) return

  clearRoomTimer(state)
  clearAdvanceTimeout(state)
  state.paused = true
  state.autoPausedNoViewers = true
  state.pauseRequested = false
  console.log(`[auction][suspend] room=${roomCode} reason=${reason}`)
}

function getRemainingSeconds(startedAt, durationSeconds = 15) {
  const startMs = new Date(startedAt || 0).getTime()
  if (!Number.isFinite(startMs) || startMs <= 0) return durationSeconds
  const elapsed = Math.floor((Date.now() - startMs) / 1000)
  return Math.max(0, durationSeconds - elapsed)
}

function clearRoomTimer(state) {
  clearTimeout(state.timer)
  state.timer = null
  state.timerId = null
}

function clearAdvanceTimeout(state) {
  clearTimeout(state.advanceTimeout)
  state.advanceTimeout = null
}

function scheduleAdvanceLot(roomCode, delayMs = 0) {
  const state = getState(roomCode)
  clearAdvanceTimeout(state)
  state.advanceTimeout = setTimeout(() => {
    if (state.paused) return
    advanceLot(roomCode).catch((error) => {
      console.error(`[auction][advance:schedule:error] room=${roomCode}`, error)
      state.selling = false
    })
  }, delayMs)
}

async function hydrateAuctionState(roomCode, room) {
  const state = getState(roomCode)

  if (state.lotQueue.length === 0) {
    const { data: reauctionLots } = await supabase
      .from('auction_lots')
      .select('id, status')
      .eq('room_id', room.id)
      .eq('is_unsold_round', true)

    if (reauctionLots && reauctionLots.length > 0) {
      const isReauctionActive = reauctionLots.some(l => l.status === 'pending' || l.status === 'active');
      if (isReauctionActive) {
        console.log(`[hydrate:recovery] Detected active unsold round for room ${roomCode}`);
        state.phase = 'unsold_round';
        state.currentUnsoldQueue = reauctionLots.map(l => l.id);
      }
    }
  }

  let query = supabase.from('auction_lots')
    .select('*, player:players(*)')
    .eq('room_id', room.id)

  if (state.phase === 'unsold_round') {
    if (state.currentUnsoldQueue?.length > 0) {
      query = query.in('id', state.currentUnsoldQueue);
    } else {
      return { state, activeLot: null, nextPendingLot: null };
    }
  }

  const { data: lots } = await query.order('lot_number')

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

async function getRoomByCode(roomCode) {
  const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
  return room || null
}

async function ensureAuctionState(roomCode, expectedLotId = null) {
  const state = getState(roomCode)
  const activeLot = state.lotQueue?.[state.lotIdx] || null
  if (
    activeLot &&
    (!expectedLotId || activeLot.id === expectedLotId)
  ) {
    return { state, room: null, activeLot, nextPendingLot: null }
  }

  const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
  if (!room || !['active', 'paused'].includes(room.status)) {
    return { state, room, activeLot: null, nextPendingLot: null }
  }

  const hydrated = await hydrateAuctionState(roomCode, room)
  state.paused = room.status === 'paused'
  return { ...hydrated, room }
}

async function checkAndRecoverRoom(room) {
  const roomCode = room.code;
  if (!hasAuctionViewers(roomCode)) return;

  const { count, error } = await supabase
    .from('auction_lots')
    .select('id', { count: 'exact', head: true })
    .eq('room_id', room.id)
    .in('status', ['pending', 'active']);

  if (error) {
    console.error(`[recovery] DB error during light check for room ${roomCode}:`, error);
    return;
  }

  if (count === 0) {
    console.log(`[recovery] Light check found no active/pending lots for room ${roomCode}. Transitioning to end state.`);
    const { count: unsoldCount } = await supabase.from('auction_lots').select('id', { count: 'exact', head: true }).eq('room_id', room.id).eq('status', 'unsold');
    if (unsoldCount > 0) {
      await supabase.from('rooms').update({ status: 'unsold_selection' }).eq('code', roomCode);
      io.to(roomCode).emit('auction:phase', { phase: 'unsold_selection' });
    } else {
      await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode);
      io.to(roomCode).emit('auction:phase', { phase: 'finished' });
    }
    return;
  }

  const state = getState(roomCode);
  if (state.paused || state.pauseRequested || state.selling || state.timerId) return;

  const { activeLot, nextPendingLot } = await hydrateAuctionState(roomCode, room);

  if (activeLot) {
    const remainingSeconds = getRemainingSeconds(activeLot.started_at, AUCTION_TIMER_SECONDS);

    if (remainingSeconds <= 0) {
      console.log(`[auction][recovery] room=${roomCode} lot=${activeLot.lot_number} timer expired, resolving stalled lot`);
      if (state.currentBid.teamId) await sellPlayer(roomCode, activeLot);
      else await markUnsold(roomCode);
      return;
    }

    if (!state.timerId) {
      console.log(`[auction][recovery] room=${roomCode} lot=${activeLot.lot_number} restarting missing timer with ${remainingSeconds}s left`);
      startTimer(roomCode, activeLot, { seconds: remainingSeconds, persistStartedAt: false });
    }
  } else {
    console.log(
      `[auction][recovery] room=${roomCode} no active lot, advancing auction state. Next pending: ${nextPendingLot?.lot_number || 'none'}`
    )
    await advanceLot(roomCode, room);
  }
}

let stalledTimerRecoveryInFlight = false;
async function recoverStalledTimers() {
  if (stalledTimerRecoveryInFlight) return;
  stalledTimerRecoveryInFlight = true;
  try {
    const twentySecondsAgo = new Date(Date.now() - 20000).toISOString();
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*, auction_lots!inner(id, status, started_at)')
      .eq('status', 'active')
      .eq('auction_lots.status', 'active')
      .lt('auction_lots.started_at', twentySecondsAgo);

    if (error) throw error;
    if (!rooms || rooms.length === 0) return;

    console.log(`[recovery:stalled] Found ${rooms.length} potentially stalled room(s).`);
    for (const room of rooms) {
      await checkAndRecoverRoom(room);
    }
  } catch (error) {
    console.error('[recovery:stalled] failed:', error);
  } finally {
    stalledTimerRecoveryInFlight = false;
  }
}

let cleanupRecoveryInFlight = false;
async function cleanupFinishedRooms() {
  if (cleanupRecoveryInFlight) return;
  cleanupRecoveryInFlight = true;
  try {
    const { data: rooms, error } = await supabase.from('rooms').select('*').eq('status', 'active');
    if (error) throw error;
    if (!rooms || rooms.length === 0) return;

    // ✅ FIX: Skip rooms that already have a healthy running timer in memory
    const roomsNeedingCheck = rooms.filter(room => {
      if (!hasAuctionViewers(room.code)) return false
      const state = roomStates[room.code]
      if (!state) return true           // No in-memory state = needs check
      if (state.timerId && !state.paused) return false  // Timer running = healthy
      return true
    })

    if (roomsNeedingCheck.length === 0) return

    console.log(`[recovery:cleanup] Checking ${roomsNeedingCheck.length}/${rooms.length} room(s) (skipped ${rooms.length - roomsNeedingCheck.length} healthy).`)
    for (const room of roomsNeedingCheck) {
      await checkAndRecoverRoom(room)
    }
  } catch (error) {
    console.error('[recovery:cleanup] failed:', error);
  } finally {
    cleanupRecoveryInFlight = false;
  }
}

// ── Helper to emit current state to a single socket (used on rejoin) ─────
function emitCurrentStateToSocket(socket, roomCode) {
  const state = roomStates[roomCode]
  if (!state) return
  if (state.phase === 'unsold_round') socket.emit('auction:is_unsold_round')
  if (state.paused || state.pauseRequested) socket.emit('auction:paused')
  const activeLot = state.lotQueue[state.lotIdx]
  if (activeLot && activeLot.status === 'active') {
    socket.emit('auction:player_up', {
      player: activeLot.player,
      lot: activeLot,
      lotNumber: activeLot.lot_number,
      totalLots: state.totalPlayers,
      basePriceLakhs: activeLot.base_price_lakhs,
      soldCount: state.soldCount,
      unsoldCount: state.unsoldCount,
    })
    socket.emit('auction:bid', {
      teamId: state.currentBid.teamId,
      teamName: state.currentBid.teamName,
      amountLakhs: state.currentBid.amount,
      timestamp: Date.now(),
    })
    socket.emit('auction:timer', { seconds: state.timerValue })
  }
}

// ── SOCKET.IO ────────────────────────────────────────────────────────────
io.on('connection', socket => {
  console.log('🔌 Socket connected:', socket.id)

  socket.on('room:join', async ({ roomCode, userId, token, page }) => {
    const user = await requireSocketUser(token, userId)
    if (!user) return

    const alreadyInRoom = socket.rooms.has(roomCode)
    syncSocketRoomPresence(socket, roomCode, page)

    // ✅ FIX: If socket is already in this room (reconnect scenario),
    // just re-emit current state from memory — skip DB hydration entirely.
    if (alreadyInRoom) {
      const { data: room } = await supabase.from('rooms').select('status').eq('code', roomCode).single()
      if (['active', 'paused'].includes(room?.status)) {
        const state = roomStates[roomCode]
        if (state?.autoPausedNoViewers && isAuctionViewerPage(page)) {
          state.paused = false
          state.autoPausedNoViewers = false
        }
        // If in-memory state is fresh enough, serve from memory only
        if (state && state.lotQueue.length > 0) {
          emitCurrentStateToSocket(socket, roomCode)
          return
        }
        // Memory is stale (e.g. server restart) — do a single hydrate
        const fullRoom = await getRoomByCode(roomCode)
        if (fullRoom) {
          const { state: hydratedState } = await hydrateAuctionState(roomCode, fullRoom)
          emitCurrentStateToSocket(socket, roomCode)
          if (isAuctionViewerPage(page) && !hydratedState.timerId && !hydratedState.paused) {
            checkAndRecoverRoom(fullRoom).catch(err =>
              console.error(`[rejoin][recovery:error] room=${roomCode}`, err)
            )
          }
        }
      }
      return
    }

    // ── First-time join for this socket ──────────────────────────────
    socket.join(roomCode)
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room) return

    const { data: teams } = await supabase.from('room_teams')
      .select('*, user:users(display_name, avatar_url)')
      .eq('room_id', room.id)
    io.to(roomCode).emit('lobby:teams', teams || [])

    if (['active', 'paused'].includes(room.status)) {
      console.log(`[rejoin] Hydrating active room state: ${roomCode}`)
      const { state } = await hydrateAuctionState(roomCode, room)
      state.paused = room.status === 'paused' || state.paused
      if (state.autoPausedNoViewers && isAuctionViewerPage(page)) {
        state.paused = false
        state.autoPausedNoViewers = false
      }
      emitCurrentStateToSocket(socket, roomCode)

      // ✅ FIX: Only trigger recovery if timer is NOT already running
      if (isAuctionViewerPage(page) && !state.timerId && !state.paused) {
        checkAndRecoverRoom(room).catch(err =>
          console.error(`[rejoin][recovery:error] room=${roomCode}`, err)
        )
      }
    }
  })

  socket.on('room:leave', ({ roomCode }) => {
    if (socket.rooms.has(roomCode)) socket.leave(roomCode)
    const prevPresence = socket.data.roomPresence
    if (prevPresence?.roomCode === roomCode) {
      syncSocketRoomPresence(socket, null, null)
      suspendAuctionRoom(roomCode)
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

    roomStates[roomCode] = {
      timer: null, advanceTimeout: null, timerId: null,
      timerValue: 15, currentBid: { amount: 0, teamId: null, teamName: null },
      lotQueue: [], lotIdx: -1, skips: {}, teamCount: 0, phase: 'main',
      totalPlayers: 0, soldCount: 0, unsoldCount: 0,
      currentUnsoldQueue: [],
      selling: false, timerRunning: false, paused: false,
      autoPausedNoViewers: false,
      pauseRequested: false,
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

  socket.on('bid:place', async ({ roomCode, lotId, teamId, amountLakhs, token }) => {
    const user = await requireSocketUser(token)
    if (!user) return
    const { state } = await ensureAuctionState(roomCode, lotId)
    const lot = state.lotQueue[state.lotIdx]
    if (!lot || lot.id !== lotId) return
    if (amountLakhs <= state.currentBid.amount) return

    const team = await requireOwnedTeam(teamId, user.id)
    if (!team || team.purse_remaining_lakhs < amountLakhs) return

    const { data: room } = await supabase.from('rooms').select('max_overseas,squad_limit').eq('code', roomCode).single()
    if (lot.player?.is_overseas && team.overseas_count >= (room?.max_overseas || 8)) return
    if (team.squad_count >= (room?.squad_limit || 25)) return
    if (state.lastBidder === teamId) return

    state.lastBidder = teamId
    state.selling = false
    state.currentBid = { amount: amountLakhs, teamId, teamName: team.team_name }
    await supabase.from('bids').insert({ lot_id: lotId, team_id: teamId, amount_lakhs: amountLakhs })

    io.to(roomCode).emit('auction:bid', {
      teamId, teamName: team.team_name, amountLakhs, timestamp: Date.now()
    })

    const requiredSkips = state.teamCount - 1;
    let validSkips = state.skips[lotId] ? state.skips[lotId].size : 0;

    if (state.skips[lotId] && state.skips[lotId].has(teamId)) {
      validSkips--;
      state.skips[lotId].delete(teamId);
    }

    if (validSkips >= requiredSkips && requiredSkips > 0) {
      clearRoomTimer(state)
      await sellPlayer(roomCode, lot)
    } else {
      startTimer(roomCode, lot)
    }
  })

  socket.on('bid:skip', async ({ roomCode, lotId, teamId, token }) => {
    const user = await requireSocketUser(token)
    const team = user ? await requireOwnedTeam(teamId, user.id) : null
    if (!team) return
    const { state } = await ensureAuctionState(roomCode, lotId)
    const lot = state.lotQueue[state.lotIdx]
    if (!lot || lot.id !== lotId) return
    if (!state.skips[lotId]) state.skips[lotId] = new Set()
    state.skips[lotId].add(teamId)

    try { await supabase.from('skips').insert({ lot_id: lotId, team_id: teamId }) } catch {}

    const hasBid = !!state.currentBid.teamId;
    const requiredSkips = hasBid ? state.teamCount - 1 : state.teamCount;

    io.to(roomCode).emit('auction:skip', { teamId, skipCount: state.skips[lotId].size, teamCount: state.teamCount })

    if (state.skips[lotId].size >= requiredSkips) {
      clearRoomTimer(state)
      if (hasBid) {
        await sellPlayer(roomCode, lot)
      } else {
        await markUnsold(roomCode)
      }
    }
  })

  socket.on('auction:pause', async ({ roomCode, userId, token }) => {
    const state = getState(roomCode)
    clearRoomTimer(state)
    clearAdvanceTimeout(state)
    state.paused = true
    state.autoPausedNoViewers = false
    state.pauseRequested = true

    const [user, roomResult] = await Promise.all([
      requireSocketUser(token, userId),
      supabase.from('rooms').select('admin_id').eq('code', roomCode).single(),
    ])

    const room = roomResult?.data
    if (!room || !user || room.admin_id !== user.id) {
      state.pauseRequested = false
      state.paused = false
      const fullRoom = await getRoomByCode(roomCode)
      if (fullRoom?.status === 'active') {
        checkAndRecoverRoom(fullRoom).catch(err =>
          console.error(`[auction][pause:recover:error] room=${roomCode}`, err)
        )
      }
      return
    }

    const { error: pausePersistError } = await supabase.from('rooms').update({ status: 'paused' }).eq('code', roomCode)
    if (pausePersistError) {
      console.error(`[auction][pause:persist:error] room=${roomCode}`, pausePersistError)
    }
    state.pauseRequested = false
    io.to(roomCode).emit('auction:paused')
  })

  socket.on('auction:resume', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms').select('admin_id').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return
    const { state, activeLot, nextPendingLot } = await ensureAuctionState(roomCode)
    state.pauseRequested = false
    state.paused = false
    state.autoPausedNoViewers = false
    const { error: resumePersistError } = await supabase.from('rooms').update({ status: 'active' }).eq('code', roomCode)
    if (resumePersistError) {
      console.error(`[auction][resume:persist:error] room=${roomCode}`, resumePersistError)
    }
    io.to(roomCode).emit('auction:resumed')
    if (activeLot) {
      // When resuming, always restart the timer from the full duration.
      startTimer(roomCode, activeLot)
      return
    }
    if (nextPendingLot) {
      scheduleAdvanceLot(roomCode, 0)
    }
  })

  socket.on('admin:end_main', async ({ roomCode, userId, token }) => {
    const user = await requireSocketUser(token, userId)
    const { data: room } = await supabase.from('rooms').select('*').eq('code', roomCode).single()
    if (!room || !user || room.admin_id !== user.id) return
    const state = getState(roomCode)
    clearRoomTimer(state)
    state.selling = true
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

    const selectedLotIds = [...new Set((Array.isArray(lotIds) ? lotIds : []).filter(Boolean))]

    await supabase
      .from('auction_lots')
      .update({ is_unsold_round: false })
      .eq('room_id', room.id)
      .eq('is_unsold_round', true)

    if (selectedLotIds.length > 0) {
      await supabase
        .from('auction_lots')
        .update({ status: 'pending', is_unsold_round: true })
        .eq('room_id', room.id)
        .eq('status', 'unsold')
        .in('id', selectedLotIds)
    }

    let selectedLots = []
    if (selectedLotIds.length > 0) {
      const { data } = await supabase
        .from('auction_lots')
        .select('*, player:players(*)')
        .eq('room_id', room.id)
        .eq('is_unsold_round', true)
        .in('id', selectedLotIds)
        .order('lot_number')
      selectedLots = data || []
    }

    const reauctionLotIds = selectedLots.map(lot => lot.id)
    if (reauctionLotIds.length === 0) {
      await supabase.from('room_teams').update({ unsold_ready: false }).eq('room_id', room.id)
      await supabase.from('unsold_selections').delete().eq('room_id', room.id)
      await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode)
      io.to(roomCode).emit('auction:phase', { phase: 'finished' })
      return
    }

    roomStates[roomCode] = {
      timer: null, advanceTimeout: null, timerId: null,
      timerValue: 15, currentBid: { amount: 0, teamId: null, teamName: null },
      lotQueue: selectedLots, lotIdx: -1, skips: {}, teamCount: 0, phase: 'unsold_round',
      totalPlayers: selectedLots.length, soldCount: 0, unsoldCount: 0,
      currentUnsoldQueue: reauctionLotIds,
      selling: false, timerRunning: false, paused: false, lastBidder: null,
      autoPausedNoViewers: false,
      pauseRequested: false,
    }
    const newState = getState(roomCode)
    const { data: teams } = await supabase.from('room_teams').select('*').eq('room_id', room.id)
    newState.teamCount = (teams || []).length
    await supabase.from('room_teams').update({ unsold_ready: false }).eq('room_id', room.id)
    await supabase.from('unsold_selections').delete().eq('room_id', room.id)
    await supabase.from('rooms').update({ status: 'active' }).eq('code', roomCode)
    io.to(roomCode).emit('auction:started')
    io.to(roomCode).emit('unsold:start_auction')
    await advanceLot(roomCode, room)
  })

  socket.on('disconnect', (reason) => {
    const prevPresence = socket.data.roomPresence
    if (prevPresence?.roomCode) {
      syncSocketRoomPresence(socket, null, null)
      suspendAuctionRoom(prevPresence.roomCode, 'disconnect')
    }
    console.log('🔌 Socket disconnected:', socket.id, 'reason:', reason)
  })
})

// ── Timer ────────────────────────────────────────────────────────────────
function startTimer(roomCode, lot, options = {}) {
  const state = getState(roomCode)
  if (state.pauseRequested) {
    state.paused = true
    state.autoPausedNoViewers = false
    state.timerValue = Math.max(0, Number.isFinite(options.seconds) ? options.seconds : state.timerValue || AUCTION_TIMER_SECONDS)
    console.log(`[auction][timer:skip] room=${roomCode} lot=${lot?.lot_number || 'unknown'} reason=pause_requested`)
    return
  }
  if (!hasAuctionViewers(roomCode)) {
    state.paused = true
    state.autoPausedNoViewers = true
    state.timerValue = Math.max(0, Number.isFinite(options.seconds) ? options.seconds : state.timerValue || AUCTION_TIMER_SECONDS)
    console.log(`[auction][timer:skip] room=${roomCode} lot=${lot?.lot_number || 'unknown'} reason=no_viewers`)
    return
  }
  clearRoomTimer(state)
  const timerId = Date.now()
  state.timerId = timerId
  state.selling = false
  state.timerValue = Math.max(0, Number.isFinite(options.seconds) ? options.seconds : AUCTION_TIMER_SECONDS)
  state.timerStartedAt = new Date(Date.now() - Math.max(0, AUCTION_TIMER_SECONDS - state.timerValue) * 1000).toISOString()

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
      try {
        if (state.currentBid.teamId) await sellPlayer(roomCode, lot)
        else await markUnsold(roomCode)
      } catch (error) {
        console.error(`[auction][timer:error] room=${roomCode} lot=${lot?.lot_number || 'unknown'}`, error)
        state.selling = false
      }
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
  clearRoomTimer(state)
  clearAdvanceTimeout(state)
  state.selling = true
  try {
    const room = await getRoomByCode(roomCode)
    if (!room) return

    const { state: hydratedState, activeLot } = await ensureAuctionState(roomCode, lot?.id)
    const resolvedLot = activeLot || lot
    if (!resolvedLot) return

    const { amount, teamId } = hydratedState.currentBid

    if (!teamId) {
      state.selling = false
      return markUnsold(roomCode)
    }

    if (resolvedLot.status === 'sold') {
      scheduleAdvanceLot(roomCode, 500)
      return
    }

    console.log(
      `[auction][sell] room=${roomCode} lot=${resolvedLot?.lot_number || 'unknown'} team=${teamId || 'none'} amount=${amount}`
    )

    await supabase.from('auction_lots').update({
      status: 'sold', final_price_lakhs: amount,
      winner_team_id: teamId, sold_at: new Date().toISOString()
    }).eq('id', resolvedLot.id)

    const lotIndexInQueue = hydratedState.lotQueue.findIndex(l => l.id === resolvedLot.id)
    if (lotIndexInQueue !== -1) {
      const lotInQueue = hydratedState.lotQueue[lotIndexInQueue]
      lotInQueue.status = 'sold'
      lotInQueue.final_price_lakhs = amount
      lotInQueue.winner_team_id = teamId
    }
    const isOverseas = resolvedLot.player?.is_overseas || false
    const { data: existingPick } = await supabase.from('squad_picks').select('id').eq('lot_id', resolvedLot.id).maybeSingle()
    const { data: currentTeam } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
    if (!currentTeam) {
      console.error(`[auction][sell] missing team for room=${roomCode} lot=${resolvedLot?.lot_number || 'unknown'} team=${teamId}`)
      scheduleAdvanceLot(roomCode, 500)
      return
    }

    if (!existingPick) {
      await supabase.from('room_teams').update({
        purse_remaining_lakhs: currentTeam.purse_remaining_lakhs - amount,
        squad_count: currentTeam.squad_count + 1,
        overseas_count: isOverseas ? currentTeam.overseas_count + 1 : currentTeam.overseas_count,
      }).eq('id', teamId)

      const { error: pickError } = await supabase.from('squad_picks').insert({
        room_id: room?.id, team_id: teamId, player_id: resolvedLot.player_id,
        lot_id: resolvedLot.id, price_paid_lakhs: amount
      })
      if (pickError) {
        console.error(`[auction][sell] squad pick insert failed room=${roomCode} lot=${resolvedLot?.lot_number || 'unknown'}`, pickError)
      }
    }

    const { data: updatedTeam } = await supabase.from('room_teams').select('*').eq('id', teamId).single()
    state.soldCount = Math.max(state.soldCount + 1, state.soldCount)

    io.to(roomCode).emit('auction:sold', {
      player: resolvedLot.player,
      winnerTeam: updatedTeam || currentTeam,
      finalPrice: amount,
      lotNumber: resolvedLot.lot_number,
      soldCount: state.soldCount,
      unsoldCount: state.unsoldCount,
      totalPlayers: state.totalPlayers,
    })

    scheduleAdvanceLot(roomCode, 2000)
  } catch (error) {
    console.error(`[auction][sell:error] room=${roomCode} lot=${lot?.lot_number || 'unknown'}`, error)
    scheduleAdvanceLot(roomCode, 1000)
  } finally {
    state.selling = false
  }
}

// ── Mark unsold ──────────────────────────────────────────────────────────
async function markUnsold(roomCode) {
  const state = getState(roomCode)
  if (state.selling) return
  clearRoomTimer(state)
  clearAdvanceTimeout(state)
  state.selling = true
  try {
    const room = await getRoomByCode(roomCode)
    if (!room) return

    const { activeLot } = await ensureAuctionState(roomCode)
    const lot = activeLot || state.lotQueue[state.lotIdx]
    if (!lot) return

    if (lot.status === 'unsold') {
      scheduleAdvanceLot(roomCode, 500)
      return
    }

    console.log(`[auction][unsold] room=${roomCode} lot=${lot.lot_number}`)

    await supabase.from('auction_lots').update({ status: 'unsold' }).eq('id', lot.id)

    const lotIndexInQueue = state.lotQueue.findIndex(l => l.id === lot.id)
    if (lotIndexInQueue !== -1) {
      state.lotQueue[lotIndexInQueue].status = 'unsold'
    }

    state.unsoldCount++

    io.to(roomCode).emit('auction:unsold', {
      player: lot.player,
      lotNumber: lot.lot_number,
      soldCount: state.soldCount,
      unsoldCount: state.unsoldCount,
      totalPlayers: state.totalPlayers,
    })

    scheduleAdvanceLot(roomCode, 1500)
  } catch (error) {
    console.error(`[auction][unsold:error] room=${roomCode}`, error)
    scheduleAdvanceLot(roomCode, 1000)
  } finally {
    state.selling = false
  }
}

// ── Advance to next lot ──────────────────────────────────────────────────
async function advanceLot(roomCode, roomArg = null) {
  const state = getState(roomCode)
  clearRoomTimer(state)
  clearAdvanceTimeout(state)
  if (state.pauseRequested) {
    state.paused = true
    state.autoPausedNoViewers = false
    console.log(`[auction][advance:skip] room=${roomCode} reason=pause_requested`)
    return
  }
  if (!hasAuctionViewers(roomCode)) {
    state.paused = true
    state.autoPausedNoViewers = true
    console.log(`[auction][advance:skip] room=${roomCode} reason=no_viewers`)
    return
  }
  const room = roomArg || await getRoomByCode(roomCode)
  if (!room) return

  if (state.lotQueue.length === 0) {
    await hydrateAuctionState(roomCode, room)
  }

  state.selling = false
  state.timerRunning = false
  state.lastBidder = null
  state.currentBid = { amount: 0, teamId: null, teamName: null }

  const activeLot = state.lotQueue.find(l => l.status === 'active')
  const nextPendingLot = state.lotQueue.find(l => l.status === 'pending')

  if (activeLot) {
    return
  }

  if (!nextPendingLot) {
    if (state.phase === 'unsold_round') {
      console.log(`[auction][advance:end-of-round] room=${roomCode} reauction completed. Finishing auction.`)
      await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode)
      io.to(roomCode).emit('auction:phase', {
        phase: 'finished',
        soldCount: state.soldCount,
        unsoldCount: state.unsoldCount,
        totalPlayers: state.totalPlayers,
      })
      return
    }

    const { count: totalUnsoldCount, error: countError } = await supabase.from('auction_lots')
      .select('id', { count: 'exact', head: true })
      .eq('room_id', room.id)
      .eq('status', 'unsold');

    if (countError) {
      console.error(`[auction][advance:end-of-round] Error checking for unsold players room=${roomCode}`, countError);
      await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode);
      io.to(roomCode).emit('auction:phase', { phase: 'finished' });
      return
    }

    if ((totalUnsoldCount || 0) > 0) {
      console.log(`[auction][advance:end-of-round] room=${roomCode} has ${totalUnsoldCount} unsold players. Transitioning to selection.`);
      await supabase.from('rooms').update({ status: 'unsold_selection' }).eq('code', roomCode);
      io.to(roomCode).emit('auction:phase', {
        phase: 'unsold_selection',
        soldCount: state.soldCount,
        unsoldCount: state.unsoldCount,
        totalPlayers: state.totalPlayers,
      });
    } else {
      console.log(`[auction][advance:end-of-round] room=${roomCode} no unsold players. Finishing auction.`);
      await supabase.from('rooms').update({ status: 'finished' }).eq('code', roomCode);
      io.to(roomCode).emit('auction:phase', {
        phase: 'finished',
        soldCount: state.soldCount,
        unsoldCount: state.unsoldCount,
        totalPlayers: state.totalPlayers,
      });
    }
    return;
  }

  const lot = nextPendingLot
  state.lotIdx = state.lotQueue.findIndex((queuedLot) => queuedLot.id === lot.id)
  console.log(
    `[auction][advance] room=${roomCode} phase=${state.phase} lot=${lot?.lot_number || 'none'} idx=${state.lotIdx} total=${state.lotQueue.length}`
  )

  lot.status = 'active'
  lot.started_at = new Date().toISOString()
  await supabase.from('auction_lots').update({
    status: lot.status, started_at: lot.started_at
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

// ✅ FIX: Single guarded interval start — prevents stacking on hot reloads
let recoveryInterval = null
let cleanupInterval = null
function startRecoveryIntervals() {
  if (recoveryInterval) return
  recoveryInterval = setInterval(recoverStalledTimers, 20000)   // Every 20s — stalled timer check
  cleanupInterval  = setInterval(cleanupFinishedRooms, 120000)  // Every 2min — finished room cleanup
  console.log('[intervals] Recovery intervals started')
}
startRecoveryIntervals()

process.on('unhandledRejection', (error) => {
  console.error('[process] unhandledRejection:', error)
})

process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException:', error)
})

// ==========================================
// Razorpay Payment Routes
// ==========================================
app.post('/api/create-order', async (req, res) => {
  try {
    const { amount, name, email } = req.body;

    const donationAmount = Number(amount);
    if (!Number.isFinite(donationAmount) || donationAmount < 20) {
      return res.status(400).json({ error: 'Minimum donation amount is ₹20' });
    }

    const keyId = process.env.RAZORPAY_KEY_ID;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY;
    if (!keyId || !keySecret) {
      return res.status(500).json({ error: 'Razorpay credentials are not configured' });
    }

    const options = {
      method: 'POST',
      url: 'https://api.razorpay.com/v1/orders',
      auth: {
        username: keyId,
        password: keySecret,
      },
      headers: { 'content-type': 'application/json' },
      data: {
        amount: Math.round(donationAmount * 100),
        currency: 'INR',
        receipt: `donation_${Date.now()}`,
        notes: {
          donor_name: name || 'Anonymous Supporter',
          donor_email: email || 'support@auctionarena.com',
          source: 'auction-arena-donation',
        },
      }
    };

    const response = await axios.request(options);

    res.json({
      key_id: keyId,
      order_id: response.data.id,
      amount: response.data.amount,
      currency: response.data.currency,
    });

  } catch (error) {
    console.error("Razorpay order error:", error.response ? error.response.data : error.message);
    res.status(500).json({ error: 'Payment initiation failed' });
  }
});

app.post('/api/verify-payment', (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    const keySecret = process.env.RAZORPAY_KEY_SECRET || process.env.RAZORPAY_SECRET_KEY;

    if (!keySecret) {
      return res.status(500).json({ error: 'Razorpay credentials are not configured' });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({ error: 'Missing Razorpay payment details' });
    }

    const expectedSignature = crypto
      .createHmac('sha256', keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (expectedSignature !== razorpay_signature) {
      return res.status(400).json({ error: 'Payment verification failed' });
    }

    res.json({ verified: true });
  } catch (error) {
    console.error("Razorpay verification error:", error.message);
    res.status(500).json({ error: 'Payment verification failed' });
  }
});

server.listen(PORT, () => console.log(`🚀 Auction Arena backend on port ${PORT}`))
startLoginReminderScheduler(supabase)
