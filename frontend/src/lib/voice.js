// ── AUCTION ARENA — Voice Announcer (Strict Female Voice) ──────────────────────
let muted = false
let queue = []
let speaking = false

function getVoice() {
  const voices = window.speechSynthesis.getVoices()
  // Strictly filter female voices only
  const femaleVoices = voices.filter(v => 
    v.name.includes('Samantha') || 
    v.name.includes('Karen') || 
    v.name.includes('Victoria') || 
    v.name.includes('Google UK English Female') || 
    v.name.includes('Google US English Female') || 
    v.name.includes('Microsoft Zira') || 
    v.name.includes('Microsoft Hazel') || 
    v.name.toLowerCase().includes('female') ||
    v.name.toLowerCase().includes('woman')
  )
  
  return femaleVoices.length > 0 ? femaleVoices[0] : (voices[0] || null)
}

function processQueue() {
  if (speaking || queue.length === 0 || muted) return
  speaking = true
  const text = queue.shift()
  const u = new SpeechSynthesisUtterance(text)
  u.rate = 0.95      // Smooth speed
  u.pitch = 1.3      // High pitch for female tone
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
  speak(`Lot ${lot} of ${total}. ${p.name}! ${p.role.replace('_', ' ')} from ${p.country}. Base price ${fmt(p.base_price_lakhs)}. Bidding starts now!`)

export const announceBid = (team, amt) => {
  queue = []
  speaking = false
  window.speechSynthesis.cancel()
  speak(`${fmt(amt)} from ${team}!`)
}

export const announceSold = (player, team, price) => {
  window.speechSynthesis.cancel(); queue = []; speaking = false
  speak(`Sold! ${player} goes to ${team} for ${fmt(price)}!`)
}

export const announceUnsold = (player) => speak(`${player} is unsold. Moving on.`)

export const announcePhase = (count) =>
  speak(`Main auction complete! Unsold players re-enter. Let the second round begin!`)

export const announceEnd = () => speak(`The auction is over! Let the games begin!`)