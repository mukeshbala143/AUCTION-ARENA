import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../store'

const AVATARS = ['🦁','🐯','🦅','🐺','🦊','🐉','⚡','🔥','🏹','🗡️','💎','🚀','🌙','☄️','🌊','🎯','🛡️','⚔️','🔱','👑']

export default function SetupPage() {
  const [av, setAv] = useState('🦁')
  const [name, setName] = useState('')
  const [team, setTeam] = useState('')
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState('')
  const { user, setProfile } = useStore()
  const navigate = useNavigate()
  const valid = name.trim().length >= 2 && team.trim().length >= 2

  const submit = async () => {
    if (!valid) return
    setLoading(true)
    const { data, error } = await supabase.from('users').upsert({ id: user.id, display_name: name.trim(), team_name: team.trim(), avatar_url: av }).select().single()
    if (error) { setErr(error.message); setLoading(false); return }
    setProfile(data); navigate('/dashboard')
  }

  return (
    <div className="min-h-screen bg-bg flex flex-col items-center justify-center px-6 py-12 relative">
      <div className="orb" style={{width:600,height:600,background:'rgba(242,166,35,0.08)',top:-200,right:-150}}/>
      <div className="orb" style={{width:500,height:500,background:'rgba(76,175,125,0.05)',bottom:-100,left:-160}}/>
      {/* Progress */}
      <div className="fixed top-0 left-0 right-0 h-1 z-50" style={{background:'rgba(255,255,255,0.05)'}}>
        <div className="h-full transition-all duration-500" style={{width:valid?'75%':'35%',background:'linear-gradient(90deg,#BA7517,#F2A623)'}}/>
      </div>
      {/* Nav */}
      <nav className="fixed top-1 left-0 right-0 z-40 px-8 py-3 flex items-center justify-between" style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex items-center gap-2">
          {['Login','Setup','Done'].map((s,i)=>(
            <div key={s} className="flex items-center gap-1.5">
              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold"
                   style={{background:i===0?'#F2A623':i===1?'rgba(242,166,35,0.15)':'rgba(255,255,255,0.05)',color:i===0?'#07070e':i===1?'#F2A623':'#7A7870',border:i===1?'0.5px solid #F2A623':'none'}}>
                {i===0?'✓':i+1}
              </div>
              {i<2&&<div className="w-6 h-px" style={{background:'rgba(255,255,255,0.1)'}}/>}
            </div>
          ))}
        </div>
      </nav>

      <div className="relative z-10 w-full max-w-lg mt-16">
        <div className="text-xs tracking-[3px] uppercase text-gold mb-3 flex items-center gap-3 anim-1">One-time Setup<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h1 className="font-bebas text-5xl tracking-[3px] mb-1 anim-2">Build Your <span className="text-gold">Identity</span></h1>
        <p className="text-muted text-sm mb-8 anim-3">Choose how you appear in every auction room. You can update this in settings anytime.</p>

        {/* Avatar grid */}
        <div className="mb-6 anim-3">
          <label className="text-xs tracking-[2px] uppercase text-muted block mb-3">Choose Avatar</label>
          <div className="grid grid-cols-10 gap-2">
            {AVATARS.map(a=>(
              <button key={a} onClick={()=>setAv(a)} className="aspect-square rounded-full flex items-center justify-center text-xl transition-all hover:scale-110"
                      style={{border:a===av?'2px solid #F2A623':'1.5px solid rgba(255,255,255,0.07)',background:a===av?'rgba(242,166,35,0.12)':'rgba(255,255,255,0.03)',boxShadow:a===av?'0 0 18px rgba(242,166,35,0.3)':'none'}}>
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5 anim-4">
          <div>
            <label className="text-xs tracking-[2px] uppercase text-muted block mb-2">Your Display Name</label>
            <input className="aa-input" value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Rahul, Priya, Arjun…" maxLength={24}/>
            <p className="text-muted text-xs mt-1.5">Your personal name shown to all players in the auction room.</p>
          </div>
          <div>
            <label className="text-xs tracking-[2px] uppercase text-muted block mb-2">Your Team Name</label>
            <input className="aa-input" value={team} onChange={e=>setTeam(e.target.value)} placeholder="e.g. Thunder Kings, Royal Strikers…" maxLength={30}/>
            <p className="text-muted text-xs mt-1.5">Your custom franchise — invent any name you want!</p>
          </div>
        </div>

        {/* Live preview */}
        <div className="glass mt-6 p-5 flex items-center gap-4 anim-4">
          <div className="w-14 h-14 rounded-full flex items-center justify-center text-3xl flex-shrink-0"
               style={{background:'rgba(242,166,35,0.1)',border:'2px solid rgba(242,166,35,0.4)',boxShadow:'0 0 20px rgba(242,166,35,0.2)'}}>
            {av}
          </div>
          <div>
            <div className="font-bebas text-2xl tracking-[2px]">{name||'Your Name'}</div>
            <div className="text-gold text-sm font-medium">{team||'Your Team Name'}</div>
            <div className="text-xs text-muted mt-0.5">⚡ New to the Arena</div>
          </div>
        </div>

        <div className="mt-4 p-4 rounded-xl text-xs text-muted leading-relaxed anim-5" style={{background:'rgba(76,175,125,0.05)',border:'0.5px solid rgba(76,175,125,0.2)'}}>
          <span style={{color:'#6DCFA0',fontWeight:600}}>Pro tip:</span> "Thunder Kings" strikes fear. "Nice Guys FC" does not win auctions. 😄
        </div>
        {err && <p className="text-red-400 text-sm mt-3">{err}</p>}
        <button onClick={submit} disabled={!valid||loading} className="btn-gold w-full mt-6 justify-center anim-5">
          {loading?'Saving…':'Enter the Arena →'}
        </button>
      </div>
    </div>
  )
}
