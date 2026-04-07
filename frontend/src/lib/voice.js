// ── AUCTION ARENA — Voice Announcer (Fast Lady Voice) ──────────────────────
let muted = false
let queue = []
let speaking = false

function getVoice() {
  const voices = window.speechSynthesis.getVoices()
  const pref = [
    v => v.name === 'Samantha',
    v => v.name === 'Karen',
    v => v.name === 'Victoria',
    v => v.name.includes('Google UK English Female'),
    v => v.name.includes('Microsoft Zira'),
    v => v.name.includes('Microsoft Hazel'),
    v => v.lang === 'en-GB' && v.name.toLowerCase().includes('female'),
    v => v.lang === 'en-US' && v.name.toLowerCase().includes('female'),
    v => v.lang.startsWith('en'),
  ]
  for (const p of pref) { const f = voices.find(p); if (f) return f }
  return voices[0] || null
}

function processQueue() {
  if (speaking || queue.length === 0 || muted) return
  speaking = true
  const text = queue.shift()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.9       // Natural speed
  u.pitch = 1.2      // Higher = more feminine
  u.volume = 1.0
  const v = getVoice(); if (v) u.voice = v
  u.onend = () => { speaking = false; processQueue() }
  u.onerror = () => { speaking = false; processQueue() }
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(u)
}

export const speak = (text) => {
  if (muted) return
  queue.push(text)
  if (!window.speechSynthesis.getVoices().length)
    window.speechSynthesis.onvoiceschanged = processQueue
  else processQueue()
}

export const setMuted = (v) => {
  muted = v
  if (v) { window.speechSynthesis.cancel(); queue = []; speaking = false }
}

export const getMuted = () => muted

const fmt = (l) => l >= 100 ? `${(l/100) % 1 === 0 ? (l/100).toFixed(0) : (l/100).toFixed(2)} crore` : `${l} lakhs`

export const announcePlayer = (p, lot, total) =>
  speak(`Lot ${lot} of ${total}. ${p.name}! ${p.role} from ${p.country}. Base price ${fmt(p.base_price_lakhs)}. Bidding starts now!`)

export const announceBid = (team, amt) => speak(`${fmt(amt)} from ${team}!`)

export const announceSold = (player, team, price) => {
  window.speechSynthesis.cancel(); queue = []; speaking = false
  speak(`Sold! ${player} goes to ${team} for ${fmt(price)}! Congratulations ${team}!`)
}

export const announceUnsold = (player) => speak(`${player} is unsold. Moving on.`)

export const announcePhase = (count) =>
  speak(`Main auction complete! ${count} unsold players re-enter. Let the second round begin!`)

export const announceEnd = () => speak(`The auction is over! All squads are final. Let the games begin!`)
