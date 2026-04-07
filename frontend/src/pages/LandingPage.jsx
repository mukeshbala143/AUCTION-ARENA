import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

const SPORTS = [
  { id:'ipl', icon:'🏏', tag:'IPL Cricket', name:'Indian Premier\nLeague', color:'#F2A623', glow:'rgba(242,166,35,0.12)', border:'rgba(242,166,35,0.4)',
    desc:'350+ elite players — capped legends, uncapped gems, overseas stars. ₹120 Crore purse per team.', stats:[['350+','Players'],['₹120Cr','Purse'],['8','Overseas Cap']] },
  { id:'kabaddi', icon:'🤼', tag:'Pro Kabaddi', name:'Pro Kabaddi\nLeague', color:'#D85A30', glow:'rgba(216,90,48,0.12)', border:'rgba(216,90,48,0.4)',
    desc:'200+ PKL stars — raiders, defenders & all-rounders. Build the most feared Kabaddi roster.', stats:[['200+','Players'],['₹4Cr','Purse'],['3','Roles']] },
  { id:'football', icon:'⚽', tag:'World Football', name:'World\nFootball', color:'#4CAF7D', glow:'rgba(76,175,125,0.12)', border:'rgba(76,175,125,0.4)',
    desc:'500+ global superstars from PL, La Liga, Serie A, ISL & beyond. Build your ultimate dream XI.', stats:[['500+','Players'],['€200M','Budget'],['10','Positions']] },
]
const FEATS = [
  ['⚡','Server-Side Timer','15s countdown on the server. No desync, no cheating.'],
  ['🎙️','Lady Voice Announcer','Fast female AI voice announces every bid and sale live.'],
  ['🤖','ChatGpt AI Analysis','Post-auction squad rankings with strengths, best XI, predictions.'],
  ['📊','Excel Export','Download all squads as .xlsx with full stats. Runs in browser.'],
  ['🔴','Real-Time Bidding','Socket.io powered — rival bids appear instantly with gold flash.'],
  ['🏳️','Overseas Cap Rules','Max 8 overseas enforced live. Auto-disabled when cap is hit.'],
  ['↩️','Unsold Round','All unsold players re-enter. Skip tracking resets entirely.'],
  ['💰','Purse Enforcement','Smart purse tracking — shows Insufficient Funds instantly.'],
]

export default function LandingPage() {
  const [code, setCode] = useState('')
  const [totalUsers, setTotalUsers] = useState(0)
  const [activeUsers, setActiveUsers] = useState(0)
  const navigate = useNavigate()
  const join = () => { if (code.trim().length === 6) navigate(`/join?code=${code.trim().toUpperCase()}`) }

  useEffect(() => {
    // --- 1. Fetch total registered users ---
    const fetchUserCount = async () => {
      const { count, error } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true });

      if (!error && count) {
        setTotalUsers(count);
      } else {
        console.error("Error fetching total user count:", error);
        setTotalUsers(412);
      }
    };
    fetchUserCount();

    // --- 2. Listen for real-time active users ---
    const channel = supabase.channel('online-users');

    const updateActiveUsers = () => {
      const presenceState = channel.presenceState();
      const count = Object.keys(presenceState).length;
      setActiveUsers(count || 1); // Show at least 1 user (yourself)
    };

    channel
      .on('presence', { event: 'sync' }, updateActiveUsers)
      .on('presence', { event: 'join' }, updateActiveUsers)
      .on('presence', { event: 'leave' }, updateActiveUsers)
      .subscribe();

    // --- 3. Cleanup ---
    return () => supabase.removeChannel(channel);
  }, []);

  return (
    <div className="min-h-screen bg-bg relative">
      <div className="orb" style={{width:700,height:700,background:'rgba(242,166,35,0.08)',top:-250,right:-200}}/>
      <div className="orb" style={{width:600,height:600,background:'rgba(216,90,48,0.06)',bottom:-100,left:-220}}/>
      <div className="orb" style={{width:400,height:400,background:'rgba(76,175,125,0.05)',top:'38%',right:'5%'}}/>

      {/* NAV */}
      <nav className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-10 py-4"
           style={{background:'rgba(7,7,14,0.85)',backdropFilter:'blur(24px)',borderBottom:'0.5px solid rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-2xl tracking-[4px] text-gold">AUCTION<span className="text-white"> ARENA</span></span>
        <div className="flex items-center gap-4 md:gap-8">
          <a href="#sports" className="text-muted text-xs tracking-widest uppercase hover:text-gold transition-colors">Arenas</a>
          <a href="#features" className="text-muted text-xs tracking-widest uppercase hover:text-gold transition-colors">Features</a>
          <Link to="/login" className="btn-gold text-xs px-5 py-2.5 rounded-lg no-underline" style={{padding:'0.6rem 1.4rem',fontSize:'0.78rem'}}>Sign In →</Link>
        </div>
      </nav>

      {/* Live User Stats */}
      {totalUsers > 0 && (
        <div className="fixed top-20 right-4 md:right-10 z-40" style={{backdropFilter:'blur(12px)'}}>
          <div className="flex items-center gap-4 rounded-lg p-2.5" style={{background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.08)'}}>
            <div className="text-center border-r border-white/10 pr-4">
              <div className="font-mono text-sm text-gold">{totalUsers.toLocaleString()}</div>
              <div className="text-muted text-[10px] uppercase tracking-widest">Users</div>
            </div>
            <div className="text-center flex items-center gap-2 pr-2">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
              </span>
              <div>
                <div className="font-mono text-sm text-gold">{activeUsers.toLocaleString()}</div>
                <div className="text-muted text-[10px] uppercase tracking-widest">Live</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="relative z-10 min-h-screen flex flex-col items-center justify-center text-center px-6 pt-20">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full mb-8 anim-1"
             style={{background:'rgba(242,166,35,0.08)',border:'0.5px solid rgba(242,166,35,0.3)'}}>
          <span className="w-1.5 h-1.5 rounded-full bg-gold" style={{animation:'pulse 2s infinite'}}/>
          <span className="text-gold text-xs tracking-[3px] uppercase font-semibold">Real-time Multiplayer · Up to 10 Players · 3 Sports</span>
        </div>
        <h1 className="font-bebas leading-none anim-2" style={{fontSize:'clamp(5rem,13vw,12rem)',letterSpacing:'6px'}}>
          BID.<br/><span className="text-gold">WIN.</span><br/>
          <span style={{WebkitTextStroke:'2px rgba(242,166,35,0.55)',color:'transparent'}}>DOMINATE.</span>
        </h1>
        <p className="text-muted text-lg max-w-lg mt-6 leading-relaxed anim-3">Host live IPL-style auctions with friends. Real bidding, AI announcer, Claude analysis — just like the pros.</p>
        <div className="flex gap-4 mt-10 flex-wrap justify-center anim-4">
          <Link to="/login" className="btn-gold no-underline" style={{padding:'0.95rem 2.4rem',fontSize:'0.9rem'}}>Start Auction →</Link>
          <a href="#sports" className="btn-outline">Explore Arenas</a>
        </div>
        {/* Stats bar */}
        <div className="flex mt-14 overflow-x-auto rounded-2xl anim-5" style={{border:'0.5px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}>
          {[['350+','IPL Players'],['10','Teams Max'],['15s','Bid Timer'],['3','Sport Arenas'],['AI','Post-Analysis']].map(([v,l],i,a)=>(
            <div key={l} className="px-8 py-4 text-center flex-shrink-0 min-w-[140px]" style={{borderRight:i<a.length-1?'0.5px solid rgba(255,255,255,0.07)':'none'}}>
              <div className="font-bebas text-3xl tracking-widest text-gold">{v}</div>
              <div className="text-muted text-xs tracking-widest uppercase mt-0.5">{l}</div>
            </div>
          ))}
        </div>
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-muted text-xs tracking-[3px] uppercase">
          Scroll<div className="w-px h-10" style={{background:'linear-gradient(to bottom,#F2A623,transparent)'}}/>
        </div>
      </section>

      {/* SPORTS */}
      <section id="sports" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 py-24">
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">
          Choose Your Arena<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/>
        </div>
        <h2 className="font-bebas text-6xl tracking-[3px] mb-2">Three <span className="text-gold">Arenas.</span> One Platform.</h2>
        <p className="text-muted mb-12 max-w-xl">Configure room, invite friends, bid live. Same premium auction experience across all three sports.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {SPORTS.map(s=>(
            <div key={s.id} className="group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300"
                 style={{background:'rgba(255,255,255,0.03)',border:'0.5px solid rgba(255,255,255,0.08)',minHeight:460}}
                 onMouseEnter={e=>{e.currentTarget.style.border=`0.5px solid ${s.border}`;e.currentTarget.style.transform='translateY(-8px)';e.currentTarget.style.boxShadow=`0 24px 80px rgba(0,0,0,0.5),0 0 60px ${s.glow}`}}
                 onMouseLeave={e=>{e.currentTarget.style.border='0.5px solid rgba(255,255,255,0.08)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none'}}>
              <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                   style={{background:`radial-gradient(ellipse at 80% 10%,${s.glow},transparent 65%)`}}/>
              <div className="absolute top-5 right-6 font-bebas text-8xl opacity-[0.04] text-white pointer-events-none leading-none">{SPORTS.indexOf(s)+1}</div>
              <div className="relative z-10 p-8 flex flex-col h-full">
                <span className="text-5xl mb-4 block transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6">{s.icon}</span>
                <span className="text-xs tracking-[2px] uppercase font-bold px-2 py-1 rounded mb-3 w-fit"
                      style={{background:`${s.glow}`,color:s.color,border:`0.5px solid ${s.border}`}}>{s.tag}</span>
                <h3 className="font-bebas text-3xl tracking-[2px] mb-3 whitespace-pre-line">{s.name}</h3>
                <p className="text-muted text-sm leading-relaxed mb-auto">{s.desc}</p>
                <div className="flex gap-4 mt-6 pt-5" style={{borderTop:'0.5px solid rgba(255,255,255,0.07)'}}>
                  {s.stats.map(([v,l])=>(
                    <div key={l}>
                      <div className="font-mono text-base font-bold" style={{color:s.color}}>{v}</div>
                      <div className="text-muted text-xs uppercase tracking-wide">{l}</div>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2 mt-4">
                  <Link to={`/create-room?sport=${s.id}`} className="flex-1 py-2.5 rounded-lg text-center text-xs font-bold tracking-widest uppercase no-underline transition-all hover:brightness-110"
                        style={{background:s.color,color:'#07070e'}} onClick={e=>e.stopPropagation()}>Create Room</Link>
                  <Link to="/join" className="flex-1 py-2.5 rounded-lg text-center text-xs font-semibold tracking-wide text-muted hover:text-white transition-colors no-underline"
                        style={{border:'0.5px solid rgba(255,255,255,0.1)',background:'transparent'}} onClick={e=>e.stopPropagation()}>Join Room</Link>
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-24">
        <div className="text-xs tracking-[3px] uppercase text-gold flex items-center gap-3 mb-2">Platform Features<div className="flex-1 h-px" style={{background:'rgba(242,166,35,0.2)'}}/></div>
        <h2 className="font-bebas text-5xl tracking-[3px] mb-12">Built for the <span className="text-gold">Real</span> Experience</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-2xl overflow-hidden" style={{background:'rgba(255,255,255,0.06)'}}>
          {FEATS.map(([icon,title,desc])=>(
            <div key={title} className="p-6 transition-colors" style={{background:'#13131f'}}
                 onMouseEnter={e=>e.currentTarget.style.background='#1a1a2a'}
                 onMouseLeave={e=>e.currentTarget.style.background='#13131f'}>
              <div className="text-3xl mb-4">{icon}</div>
              <div className="font-semibold text-sm mb-2">{title}</div>
              <div className="text-muted text-xs leading-relaxed">{desc}</div>
            </div>
          ))}
        </div>
      </section>

      {/* JOIN BOX */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 md:px-8 pb-16">
        <div className="rounded-3xl p-8 md:p-16 text-center relative overflow-hidden" style={{background:'#13131f',border:'0.5px solid rgba(242,166,35,0.15)'}}>
          <div className="absolute inset-0 pointer-events-none" style={{background:'radial-gradient(ellipse at 50% -20%,rgba(242,166,35,0.1),transparent 60%)'}}/>
          <h2 className="font-bebas text-6xl tracking-[5px] mb-3 relative z-10">Ready to <span className="text-gold">Dominate?</span></h2>
          <p className="text-muted mb-8 relative z-10">Jump straight into a live room with a code, or create your own arena.</p>
          <div className="flex gap-3 max-w-sm mx-auto mb-8 relative z-10">
            <input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} onKeyDown={e=>e.key==='Enter'&&join()}
                   className="aa-input flex-1 text-center font-mono uppercase" maxLength={6} placeholder="AX94KL"
                   style={{fontSize: 'clamp(0.9rem, 4vw, 1.1rem)', letterSpacing: 'clamp(0.2em, 2vw, 0.4em)'}}/>
            <button onClick={join} className="btn-gold" style={{padding:'0.85rem 1.4rem',fontSize:'0.85rem',whiteSpace:'nowrap'}}>Join →</button>
          </div>
          <div className="flex gap-4 justify-center relative z-10 flex-wrap">
            <Link to="/login" className="btn-gold no-underline">Sign In with Google →</Link>
          </div>
        </div>
      </section>

      <footer className="relative z-10 border-t px-10 py-6 flex items-center justify-between flex-wrap gap-4" style={{borderColor:'rgba(255,255,255,0.07)'}}>
        <span className="font-bebas text-xl tracking-[4px] text-gold">AUCTION ARENA</span>
        <span className="text-muted text-xs">© 2026 Auction Arena · All rights reserved</span>
        <div className="flex gap-6">{['Privacy','Terms','Contact', 'Admin'].map(l=><Link key={l} to={l === 'Admin' ? '/admin' : '#'} className="text-muted text-xs hover:text-gold transition-colors no-underline">{l}</Link>)}</div>
      </footer>
    </div>
  )
}
