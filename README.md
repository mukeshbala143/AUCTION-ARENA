# 🏆 AUCTION ARENA — Full Stack React + Node + Supabase

## Tech Stack
- **Frontend**: React 18 + Vite + TailwindCSS + Framer Motion
- **Backend**: Node.js + Express + Socket.io
- **Database**: Supabase (PostgreSQL + Auth + Realtime)
- **AI Analysis**: Google Gemini API
- **Voice**: Web Speech API (fast lady voice, no cost)
- **Excel Export**: SheetJS (runs in browser)

---

## 🚀 Quick Start (3 Steps)

### Step 1 — Install Dependencies
```bash
# Frontend
cd frontend && npm install

# Backend
cd backend && npm install
```

### Step 2 — Setup Supabase
1. Create a free project at https://supabase.com
2. Go to **SQL Editor** → **New query**
3. Paste the contents of `supabase/schema.sql` and click **Run**
4. Go to **Authentication** → **Providers** → Enable **Google**
5. Add your Google OAuth credentials (from console.cloud.google.com)
6. Set redirect URL in Google Console: `https://your-project.supabase.co/auth/v1/callback`

### Step 3 — Configure Environment
**frontend/.env** (copy from .env.example):
```
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_SOCKET_URL=http://localhost:3001
```

**backend/.env** (copy from .env.example):
```
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
FRONTEND_URL=http://localhost:5173
PORT=3001
ANTHROPIC_API_KEY=sk-ant-your-key
```

### Step 4 — Run
```bash
# Terminal 1 — Backend
cd backend && npm run dev

# Terminal 2 — Frontend
cd frontend && npm run dev
```

Open http://localhost:5173

---

## 📁 Project Structure
```
auction-arena/
├── frontend/
│   ├── src/
│   │   ├── pages/          ← All 12 pages
│   │   ├── components/     ← Shared components
│   │   ├── lib/            ← supabase, socket, voice, excel
│   │   ├── store/          ← Zustand global state
│   │   └── App.jsx         ← Routes
│   ├── index.html
│   └── package.json
├── backend/
│   ├── src/
│   │   ├── index.js        ← Express + Socket.io server
│   │   └── routes/         ← rooms.js, analysis.js
│   └── package.json
└── supabase/
    └── schema.sql          ← Run this in Supabase SQL Editor
```

---

## 🎙️ Voice Announcer
The voice system uses the browser's built-in **Web Speech API** — completely free.
- **Rate**: 1.5 (fast, crisp)
- **Pitch**: 1.2 (feminine)
- **Priority order**: Samantha → Karen → Google UK Female → Zira → any English voice
- Toggle with the 🔇/🔊 button in the auction header

## 🤖 AI Analysis (Claude)
After auction ends, click **AI Analysis** → Claude ranks all squads 1 to N with:
- Strengths, weaknesses, overall score (0-100)
- Predicted best XI
- Most valuable pick + biggest overpay
- Works for IPL, Kabaddi, and Football

## 📊 Excel Export
Downloads `.xlsx` file with:
- One sheet per team
- Full player stats: runs, wickets, average, strike rate, economy, etc.
- Base price vs sold price comparison

---

## 🌐 Deployment

### Frontend → Vercel
```bash
cd frontend
npm run build
# Deploy dist/ folder to Vercel
```

### Backend → Railway
1. Create new project at railway.app
2. Connect your GitHub repo
3. Set env vars in Railway dashboard
4. Railway auto-detects Node.js and runs `npm start`

---

## 📋 All 12 Pages
| Route | Page |
|-------|------|
| `/` | Landing Page |
| `/login` | Google Sign In |
| `/auth/callback` | OAuth Callback |
| `/setup` | Profile Setup (first login) |
| `/dashboard` | Dashboard + Sport Selector |
| `/create-room` | Create Room (IPL/Kabaddi/Football) |
| `/join` | Join Room by Code |
| `/lobby/:code` | Room Lobby (real-time) |
| `/auction/:code` | 🔨 Main Auction Table |
| `/unsold/:code` | Unsold Players Round |
| `/squads/:code` | Final Squads Overview |
| `/export/:code` | Excel Export |
| `/analysis/:code` | 🤖 Claude AI Analysis |
