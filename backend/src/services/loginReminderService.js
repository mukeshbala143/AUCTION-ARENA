const axios = require('axios')

const DAY_MS = 24 * 60 * 60 * 1000

function toPositiveInt(value, fallback) {
  const number = Number.parseInt(value, 10)
  return Number.isFinite(number) && number > 0 ? number : fallback
}

function isEnabled() {
  return String(process.env.LOGIN_REMINDERS_ENABLED || '').toLowerCase() === 'true'
}

function getReminderConfig() {
  return {
    enabled: isEnabled(),
    apiKey: process.env.RESEND_API_KEY,
    fromEmail: process.env.RESEND_FROM_EMAIL || 'Auction Arena <onboarding@resend.dev>',
    replyTo: process.env.RESEND_REPLY_TO || undefined,
    appUrl: process.env.FRONTEND_URL || 'https://www.auctionarena.org',
    inactivityDays: toPositiveInt(process.env.LOGIN_REMINDER_INACTIVE_DAYS, 5),
    repeatDays: toPositiveInt(process.env.LOGIN_REMINDER_REPEAT_DAYS, 5),
    batchSize: Math.min(toPositiveInt(process.env.LOGIN_REMINDER_BATCH_SIZE, 100), 1000),
  }
}

function getLastSignInDate(user) {
  const dateValue = user?.last_sign_in_at || user?.created_at
  const date = new Date(dateValue || 0)
  return Number.isFinite(date.getTime()) ? date : null
}

function buildReminderEmail(user, config) {
  const name =
    user.user_metadata?.full_name ||
    user.user_metadata?.name ||
    user.email?.split('@')[0] ||
    'there'

  const subject = '🏏 Auction Arena Misses You!'
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
      <h2 style="margin:0 0 16px">Come Back to Auction Arena!</h2>
      <p>Hi ${escapeHtml(name)},</p>
      <p>Your team is waiting.</p>
      <p>
        <a href="${escapeHtml(config.appUrl)}" style="display:inline-block;background:#ff5a00;color:#000;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:8px">
          Play Now
        </a>
      </p>
      <p style="font-size:12px;color:#6b7280">You are receiving this because you created an Auction Arena account.</p>
    </div>
  `
  const text = [
    `Hi ${name},`,
    '',
    'Come Back to Auction Arena!',
    'Your team is waiting.',
    `Play Now: ${config.appUrl}`,
  ].join('\n')

  return { subject, html, text }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

async function sendEmail(user, config) {
  const email = buildReminderEmail(user, config)
  await axios.post(
    'https://api.resend.com/emails',
    {
      from: config.fromEmail,
      to: [user.email],
      reply_to: config.replyTo,
      subject: email.subject,
      html: email.html,
      text: email.text,
    },
    {
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    }
  )
}

async function fetchReminderState(supabase, userIds) {
  if (userIds.length === 0) return new Map()

  const { data, error } = await supabase
    .from('login_reminders')
    .select('user_id,last_sent_at')
    .in('user_id', userIds)

  if (error) throw error

  return new Map((data || []).map(row => [row.user_id, row.last_sent_at]))
}

async function markReminderSent(supabase, userId, email) {
  const now = new Date().toISOString()
  const { error } = await supabase
    .from('login_reminders')
    .upsert({
      user_id: userId,
      email,
      last_sent_at: now,
      updated_at: now,
    }, { onConflict: 'user_id' })

  if (error) throw error
}

function shouldSendReminder(user, lastSentAt, now, config) {
  if (!user?.id || !user?.email) return false
  if (config.forceAllUsers) return true

  const lastSignIn = getLastSignInDate(user)
  if (!lastSignIn) return false

  const inactiveForMs = now.getTime() - lastSignIn.getTime()
  if (inactiveForMs < config.inactivityDays * DAY_MS) return false

  if (!lastSentAt) return true

  const lastSentDate = new Date(lastSentAt)
  if (!Number.isFinite(lastSentDate.getTime())) return true

  return now.getTime() - lastSentDate.getTime() >= config.repeatDays * DAY_MS
}

async function runLoginReminderSweep(supabase, options = {}) {
  const config = { ...getReminderConfig(), ...options }
  if (!config.enabled) return { skipped: true, reason: 'disabled', sent: 0 }
  if (!config.apiKey) return { skipped: true, reason: 'missing_resend_api_key', sent: 0 }

  const now = options.now || new Date()
  const recordSends = options.recordSends !== false
  let page = 1
  let sent = 0
  let checked = 0
  const failures = []

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: config.batchSize,
    })

    if (error) throw error

    const users = data?.users || []
    if (users.length === 0) break

    checked += users.length
    const reminderState = await fetchReminderState(supabase, users.map(user => user.id))
    const dueUsers = users.filter(user => shouldSendReminder(user, reminderState.get(user.id), now, config))

    for (const user of dueUsers) {
      try {
        await sendEmail(user, config)
        if (recordSends) {
          await markReminderSent(supabase, user.id, user.email)
        }
        sent += 1
      } catch (error) {
        failures.push({ userId: user.id, email: user.email, message: error.message })
        console.error('[login-reminders] failed to send:', user.id, error.message)
      }
    }

    if (users.length < config.batchSize) break
    page += 1
  }

  return { skipped: false, checked, sent, failures }
}

function startLoginReminderScheduler(supabase) {
  const config = getReminderConfig()
  if (!config.enabled) {
    console.log('[login-reminders] disabled')
    return null
  }

  const intervalHours = toPositiveInt(process.env.LOGIN_REMINDER_INTERVAL_HOURS, 24)
  const intervalMs = intervalHours * 60 * 60 * 1000

  const run = () => {
    runLoginReminderSweep(supabase)
      .then(result => console.log('[login-reminders] sweep complete:', result))
      .catch(error => console.error('[login-reminders] sweep failed:', error))
  }

  const initialDelayMs = toPositiveInt(process.env.LOGIN_REMINDER_INITIAL_DELAY_SECONDS, 60) * 1000
  const initialTimer = setTimeout(run, initialDelayMs)
  const intervalTimer = setInterval(run, intervalMs)

  console.log(`[login-reminders] scheduled every ${intervalHours}h after ${initialDelayMs / 1000}s`)

  return {
    stop() {
      clearTimeout(initialTimer)
      clearInterval(intervalTimer)
    },
  }
}

module.exports = {
  runLoginReminderSweep,
  startLoginReminderScheduler,
}
