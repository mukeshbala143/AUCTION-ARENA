// ── AUCTION ARENA — Voice Announcer (Strict Female Voice) ──────────────────────
let muted = false
let queue = []
let speaking = false
let currentUtterance = null
let voicesReadyHandlerAttached = false
let activeSpeechId = 0

function hasSpeechSupport() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function getSynth() {
  return hasSpeechSupport() ? window.speechSynthesis : null
}

function attachVoicesReadyHandler() {
  const synth = getSynth()
  if (!synth || voicesReadyHandlerAttached) return
  synth.onvoiceschanged = () => processQueue()
  voicesReadyHandlerAttached = true
}

function clearSpeech() {
  queue = []
  speaking = false
  currentUtterance = null
  activeSpeechId += 1
  const synth = getSynth()
  if (synth) synth.cancel()
}

function getVoice() {
  const synth = getSynth()
  if (!synth) return null
  const voices = synth.getVoices()
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
  const synth = getSynth()
  if (speaking || queue.length === 0 || muted || !synth) return
  speaking = true
  const text = queue.shift()
  const speechId = activeSpeechId + 1
  activeSpeechId = speechId
  const u = new SpeechSynthesisUtterance(text)
  currentUtterance = u
  u.rate = 0.95      // Smooth speed
  u.pitch = 1.3      // High pitch for female tone
  u.volume = 1.0
  const v = getVoice(); if (v) u.voice = v

  const finishUtterance = () => {
    if (speechId !== activeSpeechId) return
    speaking = false
    currentUtterance = null
    processQueue()
  }

  u.onend = finishUtterance
  u.onerror = finishUtterance

  synth.cancel()
  synth.resume()
  synth.speak(u)
}

export const speak = (text, { interrupt = false } = {}) => {
  const synth = getSynth()
  if (muted || !synth) return
  if (interrupt) clearSpeech()
  queue.push(text)
  attachVoicesReadyHandler()
  synth.resume()

  if (!synth.getVoices().length) {
    setTimeout(() => processQueue(), 100)
    return
  }

  processQueue()
}

export const setMuted = (v) => {
  muted = v
  if (v) clearSpeech()
  else {
    const synth = getSynth()
    if (synth) synth.resume()
  }
}

export const getMuted = () => muted
export const stopAnnouncements = () => clearSpeech()
export const primeAnnouncements = () => {
  const synth = getSynth()
  if (!synth) return
  attachVoicesReadyHandler()
  synth.resume()
  synth.getVoices()
}

const fmt = (l) => l >= 100 ? `${(l/100) % 1 === 0 ? (l/100).toFixed(0) : (l/100).toFixed(2)} crore` : `${l} lakhs`

export const announcePlayer = (p, lot, total) =>
  speak(`Lot ${lot} of ${total}. ${p.name}! ${p.role.replace('_', ' ')} from ${p.country}. Base price ${fmt(p.base_price_lakhs)}. Bidding starts now!`, { interrupt: true })

export const announceBid = (team, amt) => {
  clearSpeech()
  speak(`${fmt(amt)} from ${team}!`)
}

export const announceMyBid = (amt) => {
  clearSpeech()
  speak(`Your bid is ${fmt(amt)}!`)
}

export const announceSkip = () => speak(`You skipped this player.`, { interrupt: true })

export const announceSold = (player, team, price) => {
  clearSpeech()
  speak(`Sold! ${player} goes to ${team} for ${fmt(price)}!`)
}

export const announceUnsold = (player) => speak(`${player} is unsold. Moving on.`)

export const announcePhase = (count) =>
  speak(`Main auction complete! Unsold players re-enter. Let the second round begin!`, { interrupt: true })

export const announceEnd = () => speak(`The auction is over! Let the games begin!`, { interrupt: true })
