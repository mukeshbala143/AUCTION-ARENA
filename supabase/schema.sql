-- ══════════════════════════════════════════════════════════════
-- AUCTION ARENA — Complete Supabase Schema (Final Updated)
-- Run this ONCE in Supabase SQL Editor
-- ══════════════════════════════════════════════════════════════

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── TABLES ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.users (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name  TEXT NOT NULL,
  team_name     TEXT NOT NULL,
  avatar_url    TEXT DEFAULT '🦁',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rooms (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code          TEXT UNIQUE NOT NULL,
  sport         TEXT NOT NULL CHECK (sport IN ('ipl','kabaddi','football')),
  admin_id      UUID REFERENCES public.users(id),
  status        TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','active','paused','unsold_round','unsold_selection','finished')),
  squad_limit   INT  DEFAULT 25,
  purse_lakhs   INT  DEFAULT 12000,
  max_overseas  INT  DEFAULT 8,
  player_order  TEXT DEFAULT 'shuffled',
  room_name     TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.room_teams (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id                UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  user_id                UUID REFERENCES public.users(id),
  team_name              TEXT NOT NULL,
  purse_remaining_lakhs  INT  NOT NULL,
  overseas_count         INT  DEFAULT 0,
  squad_count            INT  DEFAULT 0,
  is_ready               BOOLEAN DEFAULT false,
  unsold_ready           BOOLEAN DEFAULT false,
  joined_at              TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.players (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sport            TEXT NOT NULL CHECK (sport IN ('ipl','kabaddi','football')),
  name             TEXT NOT NULL,
  country          TEXT NOT NULL,
  is_overseas      BOOLEAN NOT NULL DEFAULT false,
  is_capped        BOOLEAN NOT NULL DEFAULT true,
  role             TEXT NOT NULL,
  batting_style    TEXT,
  bowling_style    TEXT,
  base_price_lakhs INT  NOT NULL DEFAULT 100,
  previous_team    TEXT,                  
  is_active        BOOLEAN DEFAULT true,  
  stats_last_ipl   JSONB DEFAULT '{}',
  stats_total_ipl  JSONB DEFAULT '{}',
  stats_total_t20  JSONB DEFAULT '{}',
  photo_url        TEXT                   -- Moved to last to perfectly match INSERT query
);

CREATE TABLE IF NOT EXISTS public.auction_lots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  player_id         UUID REFERENCES public.players(id),
  lot_number        INT  NOT NULL,
  status            TEXT DEFAULT 'pending' CHECK (status IN ('pending','active','sold','unsold')),
  base_price_lakhs  INT  NOT NULL,
  final_price_lakhs INT,
  winner_team_id    UUID REFERENCES public.room_teams(id),
  started_at        TIMESTAMPTZ,
  sold_at           TIMESTAMPTZ,
  is_unsold_round   BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.bids (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id         UUID REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  team_id        UUID REFERENCES public.room_teams(id),
  amount_lakhs   INT  NOT NULL,
  placed_at      TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.squad_picks (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id           UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  team_id           UUID REFERENCES public.room_teams(id),
  player_id         UUID REFERENCES public.players(id),
  lot_id            UUID REFERENCES public.auction_lots(id),
  price_paid_lakhs  INT  NOT NULL,
  picked_at         TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.skips (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lot_id     UUID REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  team_id    UUID REFERENCES public.room_teams(id),
  skipped_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lot_id, team_id)
);

CREATE TABLE IF NOT EXISTS public.unsold_selections (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id     UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  team_id     UUID REFERENCES public.room_teams(id) ON DELETE CASCADE,
  lot_id      UUID REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, lot_id)
);

CREATE TABLE IF NOT EXISTS public.login_reminders (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_code    ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_sport ON public.players(sport);
CREATE INDEX IF NOT EXISTS idx_lots_room     ON public.auction_lots(room_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_lot      ON public.bids(lot_id);
CREATE INDEX IF NOT EXISTS idx_picks_team    ON public.squad_picks(room_id, team_id);
CREATE INDEX IF NOT EXISTS idx_skips_lot     ON public.skips(lot_id);
CREATE INDEX IF NOT EXISTS idx_unsold_selections_room ON public.unsold_selections(room_id);
CREATE INDEX IF NOT EXISTS idx_unsold_selections_team ON public.unsold_selections(team_id);
CREATE INDEX IF NOT EXISTS idx_login_reminders_last_sent_at ON public.login_reminders(last_sent_at);

-- ── RLS POLICIES ──────────────────────────────────────────────
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_teams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_picks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skips        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.unsold_selections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.login_reminders ENABLE ROW LEVEL SECURITY;

-- Users
CREATE POLICY "users_select" ON public.users FOR SELECT TO authenticated USING (true);
CREATE POLICY "users_insert" ON public.users FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update" ON public.users FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Rooms
CREATE POLICY "rooms_select" ON public.rooms FOR SELECT TO authenticated USING (true);
CREATE POLICY "rooms_insert" ON public.rooms FOR INSERT TO authenticated WITH CHECK (auth.uid() = admin_id);
CREATE POLICY "rooms_update" ON public.rooms FOR UPDATE TO authenticated USING (auth.uid() = admin_id);

-- Room Teams
CREATE POLICY "teams_select" ON public.room_teams FOR SELECT TO authenticated USING (true);
CREATE POLICY "teams_insert" ON public.room_teams FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "teams_update" ON public.room_teams FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- Players (read-only for normal users, admin should add data via SQL dashboard)
CREATE POLICY "players_select" ON public.players FOR SELECT TO authenticated USING (true);

-- Lots
CREATE POLICY "lots_select" ON public.auction_lots FOR SELECT TO authenticated USING (true);

-- Bids
CREATE POLICY "bids_select" ON public.bids FOR SELECT TO authenticated USING (true);
CREATE POLICY "bids_insert" ON public.bids FOR INSERT TO authenticated WITH CHECK (true);

-- Squad picks
CREATE POLICY "picks_select" ON public.squad_picks FOR SELECT TO authenticated USING (true);

-- Skips
CREATE POLICY "skips_select" ON public.skips FOR SELECT TO authenticated USING (true);
CREATE POLICY "skips_insert" ON public.skips FOR INSERT TO authenticated WITH CHECK (true);

-- Unsold selections
CREATE POLICY "unsold_selections_select" ON public.unsold_selections
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.room_teams rt
    WHERE rt.id = team_id
      AND rt.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.rooms r
    WHERE r.id = room_id
      AND r.admin_id = auth.uid()
  )
);

CREATE POLICY "unsold_selections_insert" ON public.unsold_selections
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.room_teams rt
    WHERE rt.id = team_id
      AND rt.room_id = room_id
      AND rt.user_id = auth.uid()
  )
  AND EXISTS (
    SELECT 1
    FROM public.auction_lots al
    WHERE al.id = lot_id
      AND al.room_id = room_id
      AND al.status = 'unsold'
  )
);

CREATE POLICY "unsold_selections_delete" ON public.unsold_selections
FOR DELETE TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.room_teams rt
    WHERE rt.id = team_id
      AND rt.user_id = auth.uid()
  )
);
-- ── SEED: IPL PLAYERS ────────────────────────────────────────

INSERT INTO players 
(sport, name, country, is_overseas, is_capped, role, batting_style, bowling_style, base_price_lakhs, previous_team, is_active, stats_last_ipl, stats_total_ipl, stats_total_t20, photo_url) VALUES

-- 1. Virat Kohli (Retained)
('ipl','Virat Kohli','India',false,true,'batsman','right_hand','none',200,'RCB',true,
'{"matches":15,"runs":741,"wickets":0,"average":61.8,"strike_rate":154.7,"economy":0,"highest_score":"113*","best_bowling":"0/0","fifties":5,"hundreds":1}',
'{"matches":252,"runs":8004,"wickets":4,"average":38.7,"strike_rate":132.0,"economy":8.8,"highest_score":"113*","best_bowling":"2/25","fifties":55,"hundreds":8}',
'{"matches":399,"runs":12736,"wickets":8,"average":41.9,"strike_rate":134.1,"economy":8.1,"highest_score":"122*","best_bowling":"2/25","fifties":91,"hundreds":9}',
'https://ui-avatars.com/api/?name=Virat+Kohli&background=D32F2F&color=fff'),

-- 2. Rajat Patidar (Retained)
('ipl','Rajat Patidar','India',false,true,'batsman','right_hand','right_arm_off_spin',100,'RCB',true,
'{"matches":15,"runs":395,"wickets":0,"average":26.3,"strike_rate":177.1,"economy":0,"highest_score":"55","best_bowling":"0/0","fifties":5,"hundreds":0}',
'{"matches":27,"runs":799,"wickets":0,"average":33.2,"strike_rate":158.5,"economy":0,"highest_score":"112*","best_bowling":"0/0","fifties":7,"hundreds":1}',
'{"matches":60,"runs":1850,"wickets":0,"average":35.5,"strike_rate":148.2,"economy":0,"highest_score":"112*","best_bowling":"0/0","fifties":15,"hundreds":1}',
'https://ui-avatars.com/api/?name=Rajat+Patidar&background=D32F2F&color=fff'),

-- 3. Yash Dayal (Retained)
('ipl','Yash Dayal','India',false,true,'bowler','left_hand','left_arm_fast_medium',100,'RCB',true,
'{"matches":14,"runs":5,"wickets":15,"average":30.6,"strike_rate":150.0,"economy":9.1,"highest_score":"5*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'{"matches":28,"runs":5,"wickets":28,"average":32.5,"strike_rate":152.0,"economy":9.4,"highest_score":"5*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'{"matches":55,"runs":25,"wickets":65,"average":26.5,"strike_rate":145.0,"economy":8.5,"highest_score":"10","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Yash+Dayal&background=D32F2F&color=fff'),

-- 4. Venkatesh Iyer
('ipl','Venkatesh Iyer','India',false,true,'allrounder','left_hand','right_arm_medium',200,'KKR',true,
'{"matches":14,"runs":370,"wickets":0,"average":46.2,"strike_rate":158.8,"economy":0,"highest_score":"70*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":50,"runs":1326,"wickets":3,"average":31.5,"strike_rate":137.5,"economy":8.5,"highest_score":"104","best_bowling":"2/29","fifties":11,"hundreds":1}',
'{"matches":95,"runs":2550,"wickets":35,"average":33.5,"strike_rate":139.2,"economy":8.0,"highest_score":"104","best_bowling":"3/15","fifties":18,"hundreds":1}',
'https://ui-avatars.com/api/?name=Venkatesh+Iyer&background=D32F2F&color=fff'),

-- 5. Bhuvneshwar Kumar
('ipl','Bhuvneshwar Kumar','India',false,true,'bowler','right_hand','right_arm_fast_medium',200,'SRH',true,
'{"matches":16,"runs":15,"wickets":11,"average":48.5,"strike_rate":31.5,"economy":9.2,"highest_score":"5*","best_bowling":"3/32","fifties":0,"hundreds":0}',
'{"matches":176,"runs":298,"wickets":181,"average":26.5,"strike_rate":21.5,"economy":7.5,"highest_score":"24","best_bowling":"5/19","fifties":0,"hundreds":0}',
'{"matches":290,"runs":550,"wickets":310,"average":24.5,"strike_rate":19.5,"economy":7.2,"highest_score":"24","best_bowling":"5/19","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Bhuvneshwar+Kumar&background=D32F2F&color=fff'),

-- 6. Jitesh Sharma
('ipl','Jitesh Sharma','India',false,true,'wicketkeeper','right_hand','none',100,'PBKS',true,
'{"matches":14,"runs":187,"wickets":0,"average":17.0,"strike_rate":131.6,"economy":0,"highest_score":"32*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":40,"runs":730,"wickets":0,"average":23.5,"strike_rate":151.0,"economy":0,"highest_score":"49*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":110,"runs":2450,"wickets":0,"average":28.5,"strike_rate":148.5,"economy":0,"highest_score":"106","best_bowling":"0/0","fifties":12,"hundreds":1}',
'https://ui-avatars.com/api/?name=Jitesh+Sharma&background=D32F2F&color=fff'),

-- 7. Josh Hazlewood
('ipl','Josh Hazlewood','Australia',true,true,'bowler','left_hand','right_arm_fast_medium',200,'RCB',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":27,"runs":18,"wickets":35,"average":23.1,"strike_rate":17.5,"economy":8.0,"highest_score":"7*","best_bowling":"4/25","fifties":0,"hundreds":0}',
'{"matches":100,"runs":65,"wickets":140,"average":21.5,"strike_rate":16.5,"economy":7.6,"highest_score":"12*","best_bowling":"4/12","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Josh+Hazlewood&background=D32F2F&color=fff'),

-- 8. Phil Salt
('ipl','Phil Salt','England',true,true,'wicketkeeper','right_hand','none',150,'KKR',true,
'{"matches":12,"runs":435,"wickets":0,"average":39.5,"strike_rate":182.0,"economy":0,"highest_score":"89*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":21,"runs":653,"wickets":0,"average":34.3,"strike_rate":175.5,"economy":0,"highest_score":"89*","best_bowling":"0/0","fifties":6,"hundreds":0}',
'{"matches":240,"runs":5650,"wickets":0,"average":26.5,"strike_rate":153.2,"economy":0,"highest_score":"119","best_bowling":"0/0","fifties":35,"hundreds":2}',
'https://ui-avatars.com/api/?name=Phil+Salt&background=D32F2F&color=fff'),

-- 9. Krunal Pandya
('ipl','Krunal Pandya','India',false,true,'allrounder','left_hand','left_arm_orthodox',200,'LSG',true,
'{"matches":14,"runs":133,"wickets":6,"average":22.1,"strike_rate":114.6,"economy":7.3,"highest_score":"43*","best_bowling":"3/11","fifties":0,"hundreds":0}',
'{"matches":127,"runs":1647,"wickets":76,"average":21.4,"strike_rate":132.8,"economy":7.3,"highest_score":"86","best_bowling":"3/11","fifties":1,"hundreds":0}',
'{"matches":180,"runs":2250,"wickets":125,"average":22.5,"strike_rate":135.5,"economy":7.2,"highest_score":"86","best_bowling":"4/15","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Krunal+Pandya&background=D32F2F&color=fff'),

-- 10. Rasikh Salam
('ipl','Rasikh Salam','India',false,false,'bowler','right_hand','right_arm_fast_medium',50,'DC',true,
'{"matches":8,"runs":22,"wickets":9,"average":28.5,"strike_rate":16.0,"economy":10.6,"highest_score":"15","best_bowling":"3/34","fifties":0,"hundreds":0}',
'{"matches":11,"runs":22,"wickets":9,"average":35.5,"strike_rate":19.5,"economy":10.8,"highest_score":"15","best_bowling":"3/34","fifties":0,"hundreds":0}',
'{"matches":25,"runs":45,"wickets":25,"average":26.5,"strike_rate":18.5,"economy":8.5,"highest_score":"20*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rasikh+Salam&background=D32F2F&color=fff'),

-- 11. Tim David
('ipl','Tim David','Australia',true,true,'batsman','right_hand','right_arm_off_spin',200,'MI',true,
'{"matches":13,"runs":241,"wickets":0,"average":30.1,"strike_rate":158.5,"economy":0,"highest_score":"45*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":38,"runs":659,"wickets":0,"average":28.6,"strike_rate":168.1,"economy":0,"highest_score":"46","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":235,"runs":4850,"wickets":12,"average":32.5,"strike_rate":162.5,"economy":8.5,"highest_score":"92*","best_bowling":"2/15","fifties":20,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tim+David&background=D32F2F&color=fff'),

-- 12. Suyash Sharma
('ipl','Suyash Sharma','India',false,false,'bowler','right_hand','right_arm_leg_spin',50,'KKR',true,
'{"matches":2,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":12.5,"highest_score":"0","best_bowling":"0/25","fifties":0,"hundreds":0}',
'{"matches":13,"runs":1,"wickets":10,"average":35.5,"strike_rate":25.5,"economy":8.8,"highest_score":"1*","best_bowling":"3/30","fifties":0,"hundreds":0}',
'{"matches":25,"runs":5,"wickets":35,"average":22.5,"strike_rate":18.5,"economy":7.8,"highest_score":"5*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Suyash+Sharma&background=D32F2F&color=fff'),

-- 13. Jacob Bethell
('ipl','Jacob Bethell','England',true,false,'allrounder','left_hand','left_arm_orthodox',150,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":850,"wickets":25,"average":28.5,"strike_rate":145.5,"economy":7.8,"highest_score":"75","best_bowling":"3/15","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jacob+Bethell&background=D32F2F&color=fff'),

-- 14. Devdutt Padikkal
('ipl','Devdutt Padikkal','India',false,true,'batsman','left_hand','none',200,'LSG',true,
'{"matches":7,"runs":38,"wickets":0,"average":5.4,"strike_rate":71.6,"economy":0,"highest_score":"13","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":64,"runs":1559,"wickets":0,"average":26.0,"strike_rate":129.5,"economy":0,"highest_score":"101*","best_bowling":"0/0","fifties":9,"hundreds":1}',
'{"matches":95,"runs":2850,"wickets":0,"average":32.5,"strike_rate":135.2,"economy":0,"highest_score":"101*","best_bowling":"0/0","fifties":18,"hundreds":2}',
'https://ui-avatars.com/api/?name=Devdutt+Padikkal&background=D32F2F&color=fff'),

-- 15. Jacob Duffy
('ipl','Jacob Duffy','New Zealand',true,true,'bowler','right_hand','right_arm_fast_medium',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":135,"runs":185,"wickets":145,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"15","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jacob+Duffy&background=D32F2F&color=fff'),

-- 16. Nuwan Thushara
('ipl','Nuwan Thushara','Sri Lanka',true,true,'bowler','right_hand','right_arm_fast_medium',50,'MI',true,
'{"matches":7,"runs":2,"wickets":8,"average":31.5,"strike_rate":18.5,"economy":9.8,"highest_score":"2*","best_bowling":"3/42","fifties":0,"hundreds":0}',
'{"matches":7,"runs":2,"wickets":8,"average":31.5,"strike_rate":18.5,"economy":9.8,"highest_score":"2*","best_bowling":"3/42","fifties":0,"hundreds":0}',
'{"matches":95,"runs":45,"wickets":125,"average":18.5,"strike_rate":14.5,"economy":7.8,"highest_score":"12","best_bowling":"5/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nuwan+Thushara&background=D32F2F&color=fff'),

-- 17. Romario Shepherd
('ipl','Romario Shepherd','West Indies',true,true,'allrounder','right_hand','right_arm_fast_medium',150,'MI',true,
'{"matches":4,"runs":55,"wickets":1,"average":27.5,"strike_rate":289.4,"economy":11.5,"highest_score":"39*","best_bowling":"1/22","fifties":0,"hundreds":0}',
'{"matches":8,"runs":113,"wickets":4,"average":37.6,"strike_rate":205.4,"economy":10.8,"highest_score":"39*","best_bowling":"2/42","fifties":0,"hundreds":0}',
'{"matches":125,"runs":1150,"wickets":135,"average":22.5,"strike_rate":155.0,"economy":8.8,"highest_score":"72*","best_bowling":"4/15","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Romario+Shepherd&background=D32F2F&color=fff'),

-- 18. Jordan Cox
('ipl','Jordan Cox','England',true,false,'wicketkeeper','right_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":110,"runs":2350,"wickets":0,"average":28.5,"strike_rate":142.5,"economy":0,"highest_score":"95","best_bowling":"0/0","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jordan+Cox&background=D32F2F&color=fff'),

-- 19. Swapnil Singh
('ipl','Swapnil Singh','India',false,false,'allrounder','right_hand','left_arm_orthodox',50,'RCB',true,
'{"matches":7,"runs":33,"wickets":6,"average":16.5,"strike_rate":137.5,"economy":8.8,"highest_score":"15*","best_bowling":"2/28","fifties":0,"hundreds":0}',
'{"matches":14,"runs":45,"wickets":7,"average":15.0,"strike_rate":125.0,"economy":8.6,"highest_score":"15*","best_bowling":"2/28","fifties":0,"hundreds":0}',
'{"matches":75,"runs":850,"wickets":65,"average":22.5,"strike_rate":135.5,"economy":7.5,"highest_score":"55","best_bowling":"3/15","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Swapnil+Singh&background=D32F2F&color=fff'),

-- 20. Satvik Deswal
('ipl','Satvik Deswal','India',false,false,'allrounder','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":180,"wickets":10,"average":22.5,"strike_rate":135.0,"economy":8.2,"highest_score":"45","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Satvik+Deswal&background=D32F2F&color=fff'),

-- 21. Mangesh Yadav
('ipl','Mangesh Yadav','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":10,"wickets":15,"average":24.5,"strike_rate":18.5,"economy":7.8,"highest_score":"5*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mangesh+Yadav&background=D32F2F&color=fff'),

-- 22. Vicky Ostwal
('ipl','Vicky Ostwal','India',false,false,'bowler','right_hand','left_arm_orthodox',30,'DC',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":10.5,"highest_score":"0","best_bowling":"0/21","fifties":0,"hundreds":0}',
'{"matches":25,"runs":45,"wickets":25,"average":28.5,"strike_rate":22.5,"economy":7.5,"highest_score":"12*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vicky+Ostwal&background=D32F2F&color=fff'),

-- 23. Vihaan Malhotra
('ipl','Vihaan Malhotra','India',false,false,'batsman','left_hand','right_arm_leg_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":220,"wickets":0,"average":28.5,"strike_rate":138.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vihaan+Malhotra&background=D32F2F&color=fff'),

-- 24. Kanishk Chouhan
('ipl','Kanishk Chouhan','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":5,"wickets":10,"average":25.5,"strike_rate":17.5,"economy":8.2,"highest_score":"5*","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kanishk+Chouhan&background=D32F2F&color=fff'),

-- 25. Abhinandan Singh
('ipl','Abhinandan Singh','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":0,"wickets":6,"average":22.5,"strike_rate":15.5,"economy":8.0,"highest_score":"0","best_bowling":"3/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Abhinandan+Singh&background=D32F2F&color=fff'),

-- 1. Sunil Narine (Retained)
('ipl','Sunil Narine','West Indies',true,true,'allrounder','left_hand','right_arm_off_spin',200,'KKR',true,
'{"matches":14,"runs":488,"wickets":17,"average":34.8,"strike_rate":180.7,"economy":6.6,"highest_score":"109","best_bowling":"2/22","fifties":3,"hundreds":1}',
'{"matches":176,"runs":1534,"wickets":180,"average":17.0,"strike_rate":165.8,"economy":6.7,"highest_score":"109","best_bowling":"5/19","fifties":7,"hundreds":1}',
'{"matches":510,"runs":4120,"wickets":550,"average":15.5,"strike_rate":150.2,"economy":6.1,"highest_score":"109","best_bowling":"5/19","fifties":14,"hundreds":1}',
'https://ui-avatars.com/api/?name=Sunil+Narine&background=4A148C&color=fff'),

-- 2. Rinku Singh (Retained)
('ipl','Rinku Singh','India',false,true,'batsman','left_hand','right_arm_off_spin',100,'KKR',true,
'{"matches":14,"runs":168,"wickets":0,"average":18.6,"strike_rate":148.6,"economy":0,"highest_score":"26","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":893,"wickets":0,"average":30.7,"strike_rate":143.3,"economy":0,"highest_score":"67*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":115,"runs":2450,"wickets":0,"average":35.5,"strike_rate":145.6,"economy":0,"highest_score":"79*","best_bowling":"0/0","fifties":15,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rinku+Singh&background=4A148C&color=fff'),

-- 3. Varun Chakaravarthy (Retained)
('ipl','Varun Chakaravarthy','India',false,true,'bowler','right_hand','right_arm_leg_spin',200,'KKR',true,
'{"matches":14,"runs":0,"wickets":21,"average":19.1,"strike_rate":14.2,"economy":8.0,"highest_score":"0","best_bowling":"3/16","fifties":0,"hundreds":0}',
'{"matches":70,"runs":12,"wickets":83,"average":24.5,"strike_rate":19.5,"economy":7.5,"highest_score":"4*","best_bowling":"5/20","fifties":0,"hundreds":0}',
'{"matches":95,"runs":15,"wickets":110,"average":22.5,"strike_rate":18.5,"economy":7.2,"highest_score":"4*","best_bowling":"5/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Varun+Chakaravarthy&background=4A148C&color=fff'),

-- 4. Harshit Rana (Retained)
('ipl','Harshit Rana','India',false,true,'bowler','right_hand','right_arm_fast_medium',50,'KKR',true,
'{"matches":13,"runs":25,"wickets":19,"average":20.1,"strike_rate":13.5,"economy":9.0,"highest_score":"15","best_bowling":"3/24","fifties":0,"hundreds":0}',
'{"matches":21,"runs":35,"wickets":25,"average":22.5,"strike_rate":15.0,"economy":8.8,"highest_score":"15","best_bowling":"3/24","fifties":0,"hundreds":0}',
'{"matches":35,"runs":85,"wickets":45,"average":20.5,"strike_rate":14.5,"economy":8.2,"highest_score":"25","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Harshit+Rana&background=4A148C&color=fff'),

-- 5. Ramandeep Singh (Retained)
('ipl','Ramandeep Singh','India',false,true,'allrounder','right_hand','right_arm_medium',50,'KKR',true,
'{"matches":15,"runs":125,"wickets":0,"average":31.2,"strike_rate":201.6,"economy":0,"highest_score":"24*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":20,"runs":170,"wickets":6,"average":28.3,"strike_rate":160.3,"economy":9.0,"highest_score":"24*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'{"matches":45,"runs":550,"wickets":25,"average":25.5,"strike_rate":155.5,"economy":8.5,"highest_score":"55","best_bowling":"3/20","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ramandeep+Singh&background=4A148C&color=fff'),

-- 6. Angkrish Raghuvanshi (Retained)
('ipl','Angkrish Raghuvanshi','India',false,false,'batsman','right_hand','left_arm_orthodox',50,'KKR',true,
'{"matches":10,"runs":163,"wickets":0,"average":23.2,"strike_rate":155.2,"economy":0,"highest_score":"54","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":10,"runs":163,"wickets":0,"average":23.2,"strike_rate":155.2,"economy":0,"highest_score":"54","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":15,"runs":350,"wickets":0,"average":26.5,"strike_rate":145.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Angkrish+Raghuvanshi&background=4A148C&color=fff'),

-- 7. Vaibhav Arora (Retained)
('ipl','Vaibhav Arora','India',false,false,'bowler','right_hand','right_arm_fast_medium',50,'KKR',true,
'{"matches":10,"runs":1,"wickets":11,"average":26.5,"strike_rate":16.5,"economy":9.8,"highest_score":"1*","best_bowling":"3/27","fifties":0,"hundreds":0}',
'{"matches":20,"runs":5,"wickets":19,"average":32.5,"strike_rate":20.5,"economy":9.5,"highest_score":"2*","best_bowling":"3/27","fifties":0,"hundreds":0}',
'{"matches":45,"runs":15,"wickets":55,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"10","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vaibhav+Arora&background=4A148C&color=fff'),

-- 8. Rovman Powell (Retained)
('ipl','Rovman Powell','West Indies',true,true,'batsman','right_hand','right_arm_medium',150,'KKR',true,
'{"matches":14,"runs":210,"wickets":0,"average":21.0,"strike_rate":145.0,"economy":0,"highest_score":"36","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":60,"runs":850,"wickets":0,"average":20.5,"strike_rate":138.5,"economy":0,"highest_score":"67*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":215,"runs":3850,"wickets":25,"average":25.5,"strike_rate":142.5,"economy":9.0,"highest_score":"107","best_bowling":"2/15","fifties":18,"hundreds":1}',
'https://ui-avatars.com/api/?name=Rovman+Powell&background=4A148C&color=fff'),

-- 9. Ajinkya Rahane (Retained)
('ipl','Ajinkya Rahane','India',false,true,'batsman','right_hand','none',150,'CSK',true,
'{"matches":13,"runs":242,"wickets":0,"average":20.1,"strike_rate":123.4,"economy":0,"highest_score":"45","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":185,"runs":4642,"wickets":0,"average":30.1,"strike_rate":123.4,"economy":0,"highest_score":"105*","best_bowling":"0/0","fifties":30,"hundreds":2}',
'{"matches":245,"runs":6250,"wickets":0,"average":31.5,"strike_rate":122.5,"economy":0,"highest_score":"105*","best_bowling":"0/0","fifties":45,"hundreds":2}',
'https://ui-avatars.com/api/?name=Ajinkya+Rahane&background=4A148C&color=fff'),

-- 10. Manish Pandey (Retained)
('ipl','Manish Pandey','India',false,true,'batsman','right_hand','none',75,'KKR',true,
'{"matches":1,"runs":42,"wickets":0,"average":42.0,"strike_rate":135.4,"economy":0,"highest_score":"42","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":171,"runs":3850,"wickets":0,"average":29.1,"strike_rate":120.9,"economy":0,"highest_score":"114*","best_bowling":"0/0","fifties":22,"hundreds":1}',
'{"matches":305,"runs":7150,"wickets":0,"average":31.5,"strike_rate":125.2,"economy":0,"highest_score":"114*","best_bowling":"0/0","fifties":40,"hundreds":1}',
'https://ui-avatars.com/api/?name=Manish+Pandey&background=4A148C&color=fff'),

-- 11. Umran Malik (Retained)
('ipl','Umran Malik','India',false,true,'bowler','right_hand','right_arm_fast',75,'SRH',true,
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":15.0,"highest_score":"0","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":26,"runs":10,"wickets":29,"average":29.5,"strike_rate":18.5,"economy":9.4,"highest_score":"3*","best_bowling":"5/25","fifties":0,"hundreds":0}',
'{"matches":45,"runs":15,"wickets":55,"average":26.5,"strike_rate":17.5,"economy":9.0,"highest_score":"5*","best_bowling":"5/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Umran+Malik&background=4A148C&color=fff'),

-- 12. Anukul Roy (Retained)
('ipl','Anukul Roy','India',false,true,'allrounder','left_hand','left_arm_orthodox',40,'KKR',true,
'{"matches":3,"runs":15,"wickets":1,"average":15.0,"strike_rate":110.0,"economy":8.5,"highest_score":"10*","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":10,"runs":45,"wickets":6,"average":18.5,"strike_rate":125.5,"economy":7.8,"highest_score":"18*","best_bowling":"2/20","fifties":0,"hundreds":0}',
'{"matches":45,"runs":350,"wickets":35,"average":22.5,"strike_rate":135.0,"economy":7.2,"highest_score":"45*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Anukul+Roy&background=4A148C&color=fff'),

-- 13. Cameron Green
('ipl','Cameron Green','Australia',true,true,'allrounder','right_hand','right_arm_fast_medium',200,'RCB',true,
'{"matches":13,"runs":255,"wickets":10,"average":31.8,"strike_rate":143.2,"economy":8.6,"highest_score":"37*","best_bowling":"2/28","fifties":0,"hundreds":0}',
'{"matches":29,"runs":707,"wickets":16,"average":39.2,"strike_rate":153.6,"economy":9.0,"highest_score":"100*","best_bowling":"2/28","fifties":3,"hundreds":1}',
'{"matches":45,"runs":1150,"wickets":25,"average":35.5,"strike_rate":150.2,"economy":8.5,"highest_score":"100*","best_bowling":"3/16","fifties":5,"hundreds":1}',
'https://ui-avatars.com/api/?name=Cameron+Green&background=4A148C&color=fff'),

-- 14. Matheesha Pathirana
('ipl','Matheesha Pathirana','Sri Lanka',true,true,'bowler','right_hand','right_arm_fast',200,'CSK',true,
'{"matches":6,"runs":0,"wickets":13,"average":13.0,"strike_rate":165.0,"economy":7.6,"highest_score":"0","best_bowling":"4/28","fifties":0,"hundreds":0}',
'{"matches":20,"runs":0,"wickets":34,"average":17.4,"strike_rate":160.0,"economy":7.8,"highest_score":"0","best_bowling":"4/28","fifties":0,"hundreds":0}',
'{"matches":45,"runs":15,"wickets":65,"average":18.5,"strike_rate":155.0,"economy":8.0,"highest_score":"5*","best_bowling":"4/28","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Matheesha+Pathirana&background=4A148C&color=fff'),

-- 15. Mustafizur Rahman
('ipl','Mustafizur Rahman','Bangladesh',true,true,'bowler','left_hand','left_arm_fast_medium',200,'CSK',true,
'{"matches":9,"runs":5,"wickets":14,"average":22.7,"strike_rate":14.7,"economy":9.2,"highest_score":"2","best_bowling":"4/29","fifties":0,"hundreds":0}',
'{"matches":57,"runs":35,"wickets":61,"average":28.5,"strike_rate":21.5,"economy":8.1,"highest_score":"8*","best_bowling":"4/29","fifties":0,"hundreds":0}',
'{"matches":240,"runs":150,"wickets":285,"average":21.5,"strike_rate":17.5,"economy":7.6,"highest_score":"15","best_bowling":"5/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mustafizur+Rahman&background=4A148C&color=fff'),

-- 16. Rachin Ravindra
('ipl','Rachin Ravindra','New Zealand',true,true,'allrounder','left_hand','left_arm_orthodox',200,'CSK',true,
'{"matches":10,"runs":222,"wickets":0,"average":22.2,"strike_rate":160.8,"economy":10.5,"highest_score":"61","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":10,"runs":222,"wickets":0,"average":22.2,"strike_rate":160.8,"economy":10.5,"highest_score":"61","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":65,"runs":1150,"wickets":45,"average":24.5,"strike_rate":135.5,"economy":7.5,"highest_score":"68","best_bowling":"3/15","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rachin+Ravindra&background=4A148C&color=fff'),

-- 17. Finn Allen
('ipl','Finn Allen','New Zealand',true,true,'batsman','right_hand','none',200,'RCB',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":105,"runs":2850,"wickets":0,"average":28.5,"strike_rate":168.5,"economy":0,"highest_score":"137","best_bowling":"0/0","fifties":15,"hundreds":4}',
'https://ui-avatars.com/api/?name=Finn+Allen&background=4A148C&color=fff'),

-- 18. Tim Seifert
('ipl','Tim Seifert','New Zealand',true,true,'wicketkeeper','right_hand','none',150,'KKR',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":3,"runs":24,"wickets":0,"average":12.0,"strike_rate":105.0,"economy":0,"highest_score":"15","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":165,"runs":3850,"wickets":0,"average":26.5,"strike_rate":135.5,"economy":0,"highest_score":"100*","best_bowling":"0/0","fifties":22,"hundreds":2}',
'https://ui-avatars.com/api/?name=Tim+Seifert&background=4A148C&color=fff'),

-- 19. Rahul Tripathi
('ipl','Rahul Tripathi','India',false,true,'batsman','right_hand','right_arm_medium',75,'SRH',true,
'{"matches":6,"runs":162,"wickets":0,"average":27.0,"strike_rate":125.5,"economy":0,"highest_score":"33","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":95,"runs":2236,"wickets":0,"average":26.5,"strike_rate":138.5,"economy":0,"highest_score":"93","best_bowling":"0/0","fifties":11,"hundreds":0}',
'{"matches":150,"runs":3550,"wickets":0,"average":28.5,"strike_rate":135.2,"economy":0,"highest_score":"93","best_bowling":"0/0","fifties":20,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rahul+Tripathi&background=4A148C&color=fff'),

-- 20. Akash Deep
('ipl','Akash Deep','India',false,true,'bowler','right_hand','right_arm_fast_medium',100,'RCB',true,
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":15.5,"highest_score":"0","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":8,"runs":22,"wickets":6,"average":45.5,"strike_rate":24.5,"economy":11.0,"highest_score":"17","best_bowling":"3/45","fifties":0,"hundreds":0}',
'{"matches":45,"runs":115,"wickets":55,"average":22.5,"strike_rate":16.5,"economy":8.2,"highest_score":"25","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Akash+Deep&background=4A148C&color=fff'),

-- 21. Kartik Tyagi
('ipl','Kartik Tyagi','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'GT',true,
'{"matches":1,"runs":0,"wickets":1,"average":45.0,"strike_rate":24.0,"economy":11.2,"highest_score":"0","best_bowling":"1/45","fifties":0,"hundreds":0}',
'{"matches":20,"runs":12,"wickets":16,"average":42.5,"strike_rate":26.5,"economy":9.8,"highest_score":"5*","best_bowling":"2/29","fifties":0,"hundreds":0}',
'{"matches":45,"runs":25,"wickets":45,"average":28.5,"strike_rate":18.5,"economy":8.5,"highest_score":"10","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kartik+Tyagi&background=4A148C&color=fff'),

-- 22. Prashant Solanki
('ipl','Prashant Solanki','India',false,false,'bowler','right_hand','right_arm_leg_spin',30,'CSK',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":2,"average":25.5,"strike_rate":18.5,"economy":8.5,"highest_score":"0","best_bowling":"2/20","fifties":0,"hundreds":0}',
'{"matches":15,"runs":15,"wickets":20,"average":22.5,"strike_rate":17.5,"economy":7.8,"highest_score":"5*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Prashant+Solanki&background=4A148C&color=fff'),

-- 23. Tejasvi Singh
('ipl','Tejasvi Singh','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":25,"wickets":15,"average":24.5,"strike_rate":18.5,"economy":7.5,"highest_score":"10*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tejasvi+Singh&background=4A148C&color=fff'),

-- 24. Sarthak Ranjan
('ipl','Sarthak Ranjan','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":380,"wickets":0,"average":28.5,"strike_rate":138.5,"economy":0.0,"highest_score":"75","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sarthak+Ranjan&background=4A148C&color=fff'),

-- 25. Daksh Kamra
('ipl','Daksh Kamra','India',false,false,'bowler','left_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":18,"wickets":14,"average":26.5,"strike_rate":20.5,"economy":7.8,"highest_score":"8*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Daksh+Kamra&background=4A148C&color=fff'),

-- 1. Shreyas Iyer (Star Signing)
('ipl','Shreyas Iyer','India',false,true,'batsman','right_hand','right_arm_leg_spin',200,'KKR',true,
'{"matches":14,"runs":354,"wickets":0,"average":39.33,"strike_rate":146.88,"economy":0,"highest_score":"58*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":115,"runs":3127,"wickets":0,"average":32.23,"strike_rate":127.47,"economy":0,"highest_score":"96","best_bowling":"0/0","fifties":21,"hundreds":0}',
'{"matches":215,"runs":5850,"wickets":0,"average":31.5,"strike_rate":132.4,"economy":0,"highest_score":"147","best_bowling":"0/0","fifties":42,"hundreds":2}',
'https://ui-avatars.com/api/?name=Shreyas+Iyer&background=D50000&color=fff'),

-- 2. Yuzvendra Chahal
('ipl','Yuzvendra Chahal','India',false,true,'bowler','right_hand','right_arm_leg_spin',200,'RR',true,
'{"matches":15,"runs":5,"wickets":18,"average":30.3,"strike_rate":161.0,"economy":9.4,"highest_score":"5","best_bowling":"3/11","fifties":0,"hundreds":0}',
'{"matches":160,"runs":135,"wickets":205,"average":22.4,"strike_rate":161.0,"economy":7.8,"highest_score":"10","best_bowling":"5/40","fifties":0,"hundreds":0}',
'{"matches":290,"runs":182,"wickets":350,"average":23.4,"strike_rate":162.0,"economy":7.6,"highest_score":"10","best_bowling":"6/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Yuzvendra+Chahal&background=D50000&color=fff'),

-- 3. Marcus Stoinis
('ipl','Marcus Stoinis','Australia',true,true,'allrounder','right_hand','right_arm_medium',200,'LSG',true,
'{"matches":14,"runs":388,"wickets":4,"average":32.3,"strike_rate":147.5,"economy":9.2,"highest_score":"124*","best_bowling":"1/3","fifties":2,"hundreds":1}',
'{"matches":96,"runs":1866,"wickets":43,"average":28.2,"strike_rate":142.5,"economy":9.4,"highest_score":"124*","best_bowling":"4/15","fifties":8,"hundreds":1}',
'{"matches":260,"runs":5850,"wickets":120,"average":30.5,"strike_rate":138.5,"economy":8.6,"highest_score":"124*","best_bowling":"4/15","fifties":35,"hundreds":2}',
'https://ui-avatars.com/api/?name=Marcus+Stoinis&background=D50000&color=fff'),

-- 4. Arshdeep Singh (Retained)
('ipl','Arshdeep Singh','India',false,true,'bowler','left_hand','left_arm_fast_medium',200,'PBKS',true,
'{"matches":14,"runs":25,"wickets":17,"average":18.5,"strike_rate":152.0,"economy":8.4,"highest_score":"10","best_bowling":"4/9","fifties":0,"hundreds":0}',
'{"matches":62,"runs":102,"wickets":76,"average":24.4,"strike_rate":139.8,"economy":8.6,"highest_score":"10","best_bowling":"4/9","fifties":0,"hundreds":0}',
'{"matches":80,"runs":148,"wickets":103,"average":23.1,"strike_rate":141.0,"economy":8.2,"highest_score":"10","best_bowling":"4/9","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Arshdeep+Singh&background=D50000&color=fff'),

-- 5. Marco Jansen
('ipl','Marco Jansen','South Africa',true,true,'allrounder','right_hand','left_arm_fast',150,'SRH',true,
'{"matches":10,"runs":65,"wickets":10,"average":13.0,"strike_rate":120.0,"economy":9.8,"highest_score":"17*","best_bowling":"2/27","fifties":0,"hundreds":0}',
'{"matches":21,"runs":95,"wickets":20,"average":11.5,"strike_rate":125.0,"economy":9.2,"highest_score":"17*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'{"matches":75,"runs":480,"wickets":85,"average":16.5,"strike_rate":135.0,"economy":8.5,"highest_score":"45*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Marco+Jansen&background=D50000&color=fff'),

-- 6. Shashank Singh (Retained)
('ipl','Shashank Singh','India',false,false,'batsman','right_hand','right_arm_medium',50,'PBKS',true,
'{"matches":14,"runs":354,"wickets":0,"average":44.2,"strike_rate":164.6,"economy":0,"highest_score":"68*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":24,"runs":423,"wickets":0,"average":35.2,"strike_rate":158.5,"economy":0,"highest_score":"68*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":65,"runs":1250,"wickets":5,"average":32.5,"strike_rate":145.5,"economy":8.5,"highest_score":"75","best_bowling":"2/15","fifties":8,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shashank+Singh&background=D50000&color=fff'),

-- 7. Nehal Wadhera
('ipl','Nehal Wadhera','India',false,false,'batsman','left_hand','right_arm_leg_spin',50,'MI',true,
'{"matches":6,"runs":109,"wickets":0,"average":27.2,"strike_rate":129.7,"economy":0,"highest_score":"49","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":20,"runs":350,"wickets":0,"average":26.5,"strike_rate":140.5,"economy":0,"highest_score":"64","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":35,"runs":750,"wickets":0,"average":31.5,"strike_rate":145.2,"economy":0,"highest_score":"64","best_bowling":"0/0","fifties":5,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nehal+Wadhera&background=D50000&color=fff'),

-- 8. Prabhsimran Singh (Retained)
('ipl','Prabhsimran Singh','India',false,false,'wicketkeeper','right_hand','none',50,'PBKS',true,
'{"matches":14,"runs":334,"wickets":0,"average":23.8,"strike_rate":156.0,"economy":0,"highest_score":"71","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":34,"runs":756,"wickets":0,"average":22.2,"strike_rate":146.5,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":3,"hundreds":1}',
'{"matches":65,"runs":1650,"wickets":0,"average":26.5,"strike_rate":145.2,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":9,"hundreds":1}',
'https://ui-avatars.com/api/?name=Prabhsimran+Singh&background=D50000&color=fff'),

-- 9. Azmatullah Omarzai
('ipl','Azmatullah Omarzai','Afghanistan',true,true,'allrounder','right_hand','right_arm_fast_medium',150,'GT',true,
'{"matches":7,"runs":42,"wickets":4,"average":10.5,"strike_rate":110.5,"economy":8.8,"highest_score":"11","best_bowling":"1/24","fifties":0,"hundreds":0}',
'{"matches":7,"runs":42,"wickets":4,"average":10.5,"strike_rate":110.5,"economy":8.8,"highest_score":"11","best_bowling":"1/24","fifties":0,"hundreds":0}',
'{"matches":85,"runs":1150,"wickets":80,"average":24.5,"strike_rate":135.5,"economy":8.0,"highest_score":"66*","best_bowling":"3/15","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Azmatullah+Omarzai&background=D50000&color=fff'),

-- 10. Lockie Ferguson
('ipl','Lockie Ferguson','New Zealand',true,true,'bowler','right_hand','right_arm_fast',200,'RCB',true,
'{"matches":7,"runs":10,"wickets":9,"average":25.5,"strike_rate":15.0,"economy":10.6,"highest_score":"5*","best_bowling":"2/23","fifties":0,"hundreds":0}',
'{"matches":38,"runs":35,"wickets":37,"average":31.5,"strike_rate":21.5,"economy":8.6,"highest_score":"14*","best_bowling":"4/28","fifties":0,"hundreds":0}',
'{"matches":140,"runs":125,"wickets":155,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"15","best_bowling":"5/21","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Lockie+Ferguson&background=D50000&color=fff'),

-- 11. Harpreet Brar
('ipl','Harpreet Brar','India',false,false,'allrounder','left_hand','left_arm_orthodox',50,'PBKS',true,
'{"matches":14,"runs":85,"wickets":7,"average":17.0,"strike_rate":141.6,"economy":7.9,"highest_score":"29*","best_bowling":"2/13","fifties":0,"hundreds":0}',
'{"matches":42,"runs":250,"wickets":25,"average":15.5,"strike_rate":118.5,"economy":7.8,"highest_score":"29*","best_bowling":"3/19","fifties":0,"hundreds":0}',
'{"matches":75,"runs":550,"wickets":65,"average":18.5,"strike_rate":125.0,"economy":7.5,"highest_score":"45*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Harpreet+Brar&background=D50000&color=fff'),

-- 12. Vijaykumar Vyshak
('ipl','Vijaykumar Vyshak','India',false,false,'bowler','right_hand','right_arm_fast_medium',50,'RCB',true,
'{"matches":4,"runs":2,"wickets":4,"average":35.2,"strike_rate":22.5,"economy":10.2,"highest_score":"1*","best_bowling":"2/23","fifties":0,"hundreds":0}',
'{"matches":11,"runs":5,"wickets":13,"average":31.5,"strike_rate":19.5,"economy":10.5,"highest_score":"2*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'{"matches":30,"runs":25,"wickets":35,"average":26.5,"strike_rate":18.5,"economy":8.5,"highest_score":"10","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vijaykumar+Vyshak&background=D50000&color=fff'),

-- 13. Yash Thakur
('ipl','Yash Thakur','India',false,false,'bowler','right_hand','right_arm_fast_medium',50,'LSG',true,
'{"matches":10,"runs":5,"wickets":11,"average":32.5,"strike_rate":18.5,"economy":10.8,"highest_score":"2*","best_bowling":"5/30","fifties":0,"hundreds":0}',
'{"matches":19,"runs":12,"wickets":24,"average":28.5,"strike_rate":17.5,"economy":9.8,"highest_score":"5*","best_bowling":"5/30","fifties":0,"hundreds":0}',
'{"matches":45,"runs":25,"wickets":55,"average":24.5,"strike_rate":16.5,"economy":8.5,"highest_score":"10","best_bowling":"5/30","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Yash+Thakur&background=D50000&color=fff'),

-- 14. Vishnu Vinod
('ipl','Vishnu Vinod','India',false,false,'wicketkeeper','right_hand','none',50,'MI',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":6,"runs":56,"wickets":0,"average":9.3,"strike_rate":112.0,"economy":0,"highest_score":"30","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":55,"runs":1250,"wickets":0,"average":32.5,"strike_rate":142.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":8,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vishnu+Vinod&background=D50000&color=fff'),

-- 15. Xavier Bartlett
('ipl','Xavier Bartlett','Australia',true,true,'bowler','right_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":120,"wickets":55,"average":22.5,"strike_rate":16.5,"economy":8.2,"highest_score":"20*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Xavier+Bartlett&background=D50000&color=fff'),

-- 16. Cooper Connolly
('ipl','Cooper Connolly','Australia',true,true,'allrounder','left_hand','left_arm_orthodox',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":380,"wickets":15,"average":25.5,"strike_rate":145.2,"economy":7.5,"highest_score":"55","best_bowling":"2/15","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Cooper+Connolly&background=D50000&color=fff'),

-- 17. Ben Dwarshuis
('ipl','Ben Dwarshuis','Australia',true,true,'bowler','left_hand','left_arm_fast_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":125,"runs":350,"wickets":145,"average":22.5,"strike_rate":16.5,"economy":8.0,"highest_score":"42*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ben+Dwarshuis&background=D50000&color=fff'),

-- 18. Mitchell Owen
('ipl','Mitchell Owen','Australia',true,false,'allrounder','right_hand','right_arm_medium',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":20,"runs":250,"wickets":10,"average":22.5,"strike_rate":138.5,"economy":8.5,"highest_score":"45","best_bowling":"2/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mitchell+Owen&background=D50000&color=fff'),

-- 19. Priyansh Arya
('ipl','Priyansh Arya','India',false,false,'batsman','left_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":450,"wickets":0,"average":35.5,"strike_rate":155.0,"economy":0,"highest_score":"85","best_bowling":"0/0","fifties":4,"hundreds":1}',
'https://ui-avatars.com/api/?name=Priyansh+Arya&background=D50000&color=fff'),

-- 20. Musheer Khan
('ipl','Musheer Khan','India',false,false,'allrounder','right_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":180,"wickets":8,"average":22.5,"strike_rate":130.5,"economy":7.5,"highest_score":"55","best_bowling":"3/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Musheer+Khan&background=D50000&color=fff'),

-- 21. Pravin Dubey
('ipl','Pravin Dubey','India',false,false,'bowler','right_hand','right_arm_leg_spin',30,'DC',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":4,"runs":0,"wickets":1,"average":65.0,"strike_rate":42.0,"economy":9.5,"highest_score":"0","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":30,"runs":85,"wickets":35,"average":22.5,"strike_rate":18.5,"economy":7.5,"highest_score":"22","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Pravin+Dubey&background=D50000&color=fff'),

-- 22. Harnoor Singh
('ipl','Harnoor Singh','India',false,false,'batsman','left_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":280,"wickets":0,"average":28.5,"strike_rate":125.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Harnoor+Singh&background=D50000&color=fff'),

-- 23. Suryansh Shedge
('ipl','Suryansh Shedge','India',false,false,'allrounder','right_hand','right_arm_medium',30,'LSG',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":115,"wickets":5,"average":22.5,"strike_rate":145.5,"economy":8.5,"highest_score":"45","best_bowling":"2/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Suryansh+Shedge&background=D50000&color=fff'),

-- 24. Pyla Avinash
('ipl','Pyla Avinash','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":85,"wickets":0,"average":21.5,"strike_rate":135.0,"economy":0,"highest_score":"42","best_bowling":"0/0","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Pyla+Avinash&background=D50000&color=fff'),

-- 25. Vishal Nishad
('ipl','Vishal Nishad','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":15,"wickets":12,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"5*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vishal+Nishad&background=D50000&color=fff'),

-- 1. Sanju Samson (Traded)
('ipl','Sanju Samson','India',false,true,'wicketkeeper','right_hand','none',200,'RR',true,
'{"matches":16,"runs":531,"wickets":0,"average":48.2,"strike_rate":153.4,"economy":0,"highest_score":"86","best_bowling":"0/0","fifties":5,"hundreds":0}',
'{"matches":168,"runs":4419,"wickets":0,"average":30.6,"strike_rate":138.9,"economy":0,"highest_score":"119","best_bowling":"0/0","fifties":25,"hundreds":3}',
'{"matches":265,"runs":6580,"wickets":0,"average":29.5,"strike_rate":135.8,"economy":0,"highest_score":"119","best_bowling":"0/0","fifties":41,"hundreds":3}',
'https://ui-avatars.com/api/?name=Sanju+Samson&background=FBC02D&color=000'),

-- 2. Ruturaj Gaikwad (Retained)
('ipl','Ruturaj Gaikwad','India',false,true,'batsman','right_hand','none',200,'CSK',true,
'{"matches":14,"runs":583,"wickets":0,"average":53.0,"strike_rate":141.1,"economy":0,"highest_score":"108*","best_bowling":"0/0","fifties":4,"hundreds":1}',
'{"matches":66,"runs":2380,"wickets":0,"average":41.7,"strike_rate":136.8,"economy":0,"highest_score":"108*","best_bowling":"0/0","fifties":18,"hundreds":2}',
'{"matches":135,"runs":4520,"wickets":0,"average":38.5,"strike_rate":135.5,"economy":0,"highest_score":"123*","best_bowling":"0/0","fifties":31,"hundreds":6}',
'https://ui-avatars.com/api/?name=Ruturaj+Gaikwad&background=FBC02D&color=000'),

-- 3. MS Dhoni (Retained)
('ipl','MS Dhoni','India',false,true,'wicketkeeper','right_hand','right_arm_medium',100,'CSK',true,
'{"matches":14,"runs":161,"wickets":0,"average":53.6,"strike_rate":220.5,"economy":0,"highest_score":"37*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":264,"runs":5243,"wickets":0,"average":39.1,"strike_rate":137.5,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":24,"hundreds":0}',
'{"matches":391,"runs":7430,"wickets":0,"average":37.8,"strike_rate":135.2,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":28,"hundreds":0}',
'https://ui-avatars.com/api/?name=MS+Dhoni&background=FBC02D&color=000'),

-- 4. Shivam Dube (Retained)
('ipl','Shivam Dube','India',false,true,'allrounder','left_hand','right_arm_fast_medium',200,'CSK',true,
'{"matches":14,"runs":396,"wickets":1,"average":36.0,"strike_rate":162.2,"economy":10.5,"highest_score":"66*","best_bowling":"1/14","fifties":3,"hundreds":0}',
'{"matches":65,"runs":1502,"wickets":5,"average":30.5,"strike_rate":145.5,"economy":9.8,"highest_score":"95*","best_bowling":"2/15","fifties":9,"hundreds":0}',
'{"matches":135,"runs":2850,"wickets":45,"average":32.5,"strike_rate":142.2,"economy":8.8,"highest_score":"95*","best_bowling":"3/15","fifties":18,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shivam+Dube&background=FBC02D&color=000'),

-- 5. Noor Ahmad 
('ipl','Noor Ahmad','Afghanistan',true,true,'bowler','right_hand','left_arm_wrist_spin',200,'GT',true,
'{"matches":10,"runs":2,"wickets":8,"average":35.5,"strike_rate":28.5,"economy":8.3,"highest_score":"1*","best_bowling":"2/32","fifties":0,"hundreds":0}',
'{"matches":23,"runs":5,"wickets":24,"average":25.5,"strike_rate":19.5,"economy":7.8,"highest_score":"2*","best_bowling":"3/37","fifties":0,"hundreds":0}',
'{"matches":90,"runs":45,"wickets":95,"average":22.5,"strike_rate":18.0,"economy":7.2,"highest_score":"10*","best_bowling":"4/10","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Noor+Ahmad&background=FBC02D&color=000'),

-- 6. Khaleel Ahmed 
('ipl','Khaleel Ahmed','India',false,true,'bowler','right_hand','left_arm_fast_medium',150,'DC',true,
'{"matches":14,"runs":2,"wickets":17,"average":28.1,"strike_rate":18.5,"economy":9.3,"highest_score":"2","best_bowling":"2/21","fifties":0,"hundreds":0}',
'{"matches":57,"runs":35,"wickets":74,"average":24.5,"strike_rate":17.2,"economy":8.5,"highest_score":"10","best_bowling":"3/21","fifties":0,"hundreds":0}',
'{"matches":105,"runs":55,"wickets":130,"average":22.5,"strike_rate":16.5,"economy":8.1,"highest_score":"15","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Khaleel+Ahmed&background=FBC02D&color=000'),

-- 7. Akeal Hosein
('ipl','Akeal Hosein','West Indies',true,true,'bowler','left_hand','left_arm_orthodox',200,'SRH',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":1,"average":40.0,"strike_rate":24.0,"economy":10.0,"highest_score":"0","best_bowling":"1/40","fifties":0,"hundreds":0}',
'{"matches":145,"runs":850,"wickets":165,"average":24.5,"strike_rate":19.5,"economy":6.8,"highest_score":"44*","best_bowling":"5/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Akeal+Hosein&background=FBC02D&color=000'),

-- 8. Matt Henry
('ipl','Matt Henry','New Zealand',true,true,'bowler','right_hand','right_arm_fast_medium',200,'LSG',true,
'{"matches":4,"runs":12,"wickets":1,"average":135.0,"strike_rate":84.0,"economy":9.6,"highest_score":"7*","best_bowling":"1/26","fifties":0,"hundreds":0}',
'{"matches":6,"runs":12,"wickets":2,"average":95.5,"strike_rate":55.5,"economy":9.8,"highest_score":"7*","best_bowling":"1/26","fifties":0,"hundreds":0}',
'{"matches":135,"runs":350,"wickets":155,"average":24.5,"strike_rate":17.5,"economy":8.2,"highest_score":"22","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Matt+Henry&background=FBC02D&color=000'),

-- 9. Nathan Ellis
('ipl','Nathan Ellis','Australia',true,true,'bowler','right_hand','right_arm_fast_medium',200,'PBKS',true,
'{"matches":1,"runs":0,"wickets":1,"average":24.0,"strike_rate":18.0,"economy":8.0,"highest_score":"0","best_bowling":"1/24","fifties":0,"hundreds":0}',
'{"matches":15,"runs":25,"wickets":17,"average":31.5,"strike_rate":20.5,"economy":8.8,"highest_score":"12","best_bowling":"3/30","fifties":0,"hundreds":0}',
'{"matches":150,"runs":250,"wickets":185,"average":21.5,"strike_rate":15.5,"economy":8.1,"highest_score":"15","best_bowling":"5/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nathan+Ellis&background=FBC02D&color=000'),

-- 10. Dewald Brevis
('ipl','Dewald Brevis','South Africa',true,true,'batsman','right_hand','right_arm_leg_spin',100,'MI',true,
'{"matches":3,"runs":69,"wickets":0,"average":23.0,"strike_rate":135.2,"economy":0,"highest_score":"46","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":230,"wickets":1,"average":23.0,"strike_rate":138.5,"economy":8.5,"highest_score":"49","best_bowling":"1/8","fifties":0,"hundreds":0}',
'{"matches":65,"runs":1650,"wickets":15,"average":28.5,"strike_rate":155.2,"economy":7.8,"highest_score":"162","best_bowling":"2/15","fifties":10,"hundreds":1}',
'https://ui-avatars.com/api/?name=Dewald+Brevis&background=FBC02D&color=000'),

-- 11. Jamie Overton
('ipl','Jamie Overton','England',true,true,'allrounder','right_hand','right_arm_fast_medium',150,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":125,"runs":1250,"wickets":95,"average":22.5,"strike_rate":165.5,"economy":8.8,"highest_score":"85*","best_bowling":"4/25","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jamie+Overton&background=FBC02D&color=000'),

-- 12. Matthew Short
('ipl','Matthew Short','Australia',true,true,'allrounder','right_hand','right_arm_off_spin',150,'PBKS',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":6,"runs":117,"wickets":0,"average":19.5,"strike_rate":127.1,"economy":10.5,"highest_score":"36","best_bowling":"0/10","fifties":0,"hundreds":0}',
'{"matches":110,"runs":2850,"wickets":35,"average":26.5,"strike_rate":142.5,"economy":7.8,"highest_score":"100*","best_bowling":"3/15","fifties":18,"hundreds":2}',
'https://ui-avatars.com/api/?name=Matthew+Short&background=FBC02D&color=000'),

-- 13. Rahul Chahar
('ipl','Rahul Chahar','India',false,true,'bowler','right_hand','right_arm_leg_spin',100,'PBKS',true,
'{"matches":9,"runs":18,"wickets":10,"average":28.2,"strike_rate":20.4,"economy":8.2,"highest_score":"8*","best_bowling":"3/23","fifties":0,"hundreds":0}',
'{"matches":83,"runs":125,"wickets":75,"average":31.5,"strike_rate":23.5,"economy":8.0,"highest_score":"15","best_bowling":"4/27","fifties":0,"hundreds":0}',
'{"matches":140,"runs":250,"wickets":135,"average":26.5,"strike_rate":20.5,"economy":7.6,"highest_score":"22","best_bowling":"5/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rahul+Chahar&background=FBC02D&color=000'),

-- 14. Zak Foulkes
('ipl','Zak Foulkes','New Zealand',true,true,'allrounder','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":350,"wickets":45,"average":22.5,"strike_rate":135.5,"economy":8.2,"highest_score":"45*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Zak+Foulkes&background=FBC02D&color=000'),

-- 15. Sarfaraz Khan
('ipl','Sarfaraz Khan','India',false,true,'batsman','right_hand','right_arm_leg_spin',75,'DC',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":50,"runs":585,"wickets":0,"average":22.5,"strike_rate":130.5,"economy":0,"highest_score":"67","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":95,"runs":1250,"wickets":0,"average":25.5,"strike_rate":135.2,"economy":0,"highest_score":"67","best_bowling":"0/0","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sarfaraz+Khan&background=FBC02D&color=000'),

-- 16. Shreyas Gopal
('ipl','Shreyas Gopal','India',false,true,'allrounder','right_hand','right_arm_leg_spin',50,'MI',true,
'{"matches":3,"runs":0,"wickets":3,"average":28.6,"strike_rate":18.0,"economy":9.5,"highest_score":"0","best_bowling":"1/26","fifties":0,"hundreds":0}',
'{"matches":52,"runs":180,"wickets":52,"average":26.5,"strike_rate":19.5,"economy":8.1,"highest_score":"24*","best_bowling":"4/16","fifties":0,"hundreds":0}',
'{"matches":95,"runs":450,"wickets":105,"average":22.5,"strike_rate":17.5,"economy":7.5,"highest_score":"45*","best_bowling":"5/16","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shreyas+Gopal&background=FBC02D&color=000'),

-- 17. Aman Khan
('ipl','Aman Khan','India',false,false,'allrounder','right_hand','right_arm_medium',30,'DC',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":115,"wickets":0,"average":14.3,"strike_rate":112.5,"economy":10.5,"highest_score":"51","best_bowling":"0/11","fifties":1,"hundreds":0}',
'{"matches":45,"runs":550,"wickets":15,"average":22.5,"strike_rate":145.2,"economy":8.5,"highest_score":"65","best_bowling":"2/15","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Aman+Khan&background=FBC02D&color=000'),

-- 18. Anshul Kamboj
('ipl','Anshul Kamboj','India',false,true,'bowler','right_hand','right_arm_fast_medium',30,'MI',true,
'{"matches":3,"runs":2,"wickets":2,"average":52.0,"strike_rate":28.5,"economy":10.9,"highest_score":"2","best_bowling":"1/42","fifties":0,"hundreds":0}',
'{"matches":3,"runs":2,"wickets":2,"average":52.0,"strike_rate":28.5,"economy":10.9,"highest_score":"2","best_bowling":"1/42","fifties":0,"hundreds":0}',
'{"matches":25,"runs":45,"wickets":35,"average":21.5,"strike_rate":16.5,"economy":7.8,"highest_score":"15","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Anshul+Kamboj&background=FBC02D&color=000'),

-- 19. Mukesh Choudhary
('ipl','Mukesh Choudhary','India',false,false,'bowler','left_hand','left_arm_fast_medium',30,'CSK',true,
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":27.0,"highest_score":"0","best_bowling":"0/27","fifties":0,"hundreds":0}',
'{"matches":14,"runs":6,"wickets":16,"average":28.5,"strike_rate":18.2,"economy":9.6,"highest_score":"4*","best_bowling":"4/46","fifties":0,"hundreds":0}',
'{"matches":35,"runs":25,"wickets":45,"average":25.5,"strike_rate":17.5,"economy":8.8,"highest_score":"12","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mukesh+Choudhary&background=FBC02D&color=000'),

-- 20. Urvil Patel
('ipl','Urvil Patel','India',false,false,'wicketkeeper','right_hand','none',30,'GT',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":850,"wickets":0,"average":28.5,"strike_rate":165.5,"economy":0,"highest_score":"115*","best_bowling":"0/0","fifties":5,"hundreds":1}',
'https://ui-avatars.com/api/?name=Urvil+Patel&background=FBC02D&color=000'),

-- 21. Gurjapneet Singh
('ipl','Gurjapneet Singh','India',false,false,'bowler','right_hand','left_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":10,"wickets":15,"average":24.5,"strike_rate":18.5,"economy":7.5,"highest_score":"5*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Gurjapneet+Singh&background=FBC02D&color=000'),

-- 22. Ayush Mhatre
('ipl','Ayush Mhatre','India',false,false,'batsman','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":250,"wickets":0,"average":32.5,"strike_rate":145.5,"economy":0,"highest_score":"75","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ayush+Mhatre&background=FBC02D&color=000'),

-- 23. Ramakrishna Ghosh
('ipl','Ramakrishna Ghosh','India',false,false,'allrounder','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":180,"wickets":18,"average":22.5,"strike_rate":135.5,"economy":8.2,"highest_score":"45","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ramakrishna+Ghosh&background=FBC02D&color=000'),

-- 24. Prashant Veer
('ipl','Prashant Veer','India',false,false,'allrounder','left_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":20,"runs":350,"wickets":22,"average":28.5,"strike_rate":155.5,"economy":7.5,"highest_score":"65","best_bowling":"4/15","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Prashant+Veer&background=FBC02D&color=000'),

-- 25. Kartik Sharma
('ipl','Kartik Sharma','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":650,"wickets":0,"average":35.5,"strike_rate":165.2,"economy":0,"highest_score":"85*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kartik+Sharma&background=FBC02D&color=000'),

-- 1. KL Rahul (Retained)
('ipl','KL Rahul','India',false,true,'wicketkeeper','right_hand','none',200,'LSG',true,
'{"matches":14,"runs":520,"wickets":0,"average":37.1,"strike_rate":136.1,"economy":0,"highest_score":"82","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":132,"runs":4683,"wickets":0,"average":45.5,"strike_rate":134.6,"economy":0,"highest_score":"132*","best_bowling":"0/0","fifties":37,"hundreds":4}',
'{"matches":225,"runs":7540,"wickets":0,"average":42.5,"strike_rate":136.8,"economy":0,"highest_score":"132*","best_bowling":"0/0","fifties":62,"hundreds":6}',
'https://ui-avatars.com/api/?name=KL+Rahul&background=1976D2&color=fff'),

-- 2. Axar Patel (Retained)
('ipl','Axar Patel','India',false,true,'allrounder','left_hand','left_arm_orthodox',200,'DC',true,
'{"matches":14,"runs":235,"wickets":11,"average":29.4,"strike_rate":131.3,"economy":7.6,"highest_score":"66","best_bowling":"2/17","fifties":2,"hundreds":0}',
'{"matches":150,"runs":1648,"wickets":123,"average":21.1,"strike_rate":130.8,"economy":7.3,"highest_score":"66","best_bowling":"4/21","fifties":3,"hundreds":0}',
'{"matches":245,"runs":2850,"wickets":210,"average":22.5,"strike_rate":134.2,"economy":7.1,"highest_score":"66","best_bowling":"4/21","fifties":5,"hundreds":0}',
'https://ui-avatars.com/api/?name=Axar+Patel&background=1976D2&color=fff'),

-- 3. Kuldeep Yadav (Retained)
('ipl','Kuldeep Yadav','India',false,true,'bowler','left_hand','left_arm_wrist_spin',200,'DC',true,
'{"matches":11,"runs":24,"wickets":16,"average":23.2,"strike_rate":161.0,"economy":8.6,"highest_score":"10","best_bowling":"4/55","fifties":0,"hundreds":0}',
'{"matches":84,"runs":132,"wickets":87,"average":27.4,"strike_rate":163.0,"economy":8.1,"highest_score":"16*","best_bowling":"4/14","fifties":0,"hundreds":0}',
'{"matches":145,"runs":185,"wickets":175,"average":21.8,"strike_rate":162.0,"economy":7.5,"highest_score":"16*","best_bowling":"5/17","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kuldeep+Yadav&background=1976D2&color=fff'),

-- 4. Tristan Stubbs (Retained)
('ipl','Tristan Stubbs','South Africa',true,true,'wicketkeeper','right_hand','right_arm_off_spin',150,'DC',true,
'{"matches":14,"runs":378,"wickets":2,"average":54.0,"strike_rate":190.9,"economy":9.5,"highest_score":"71*","best_bowling":"2/11","fifties":3,"hundreds":0}',
'{"matches":18,"runs":405,"wickets":2,"average":36.8,"strike_rate":175.5,"economy":9.5,"highest_score":"71*","best_bowling":"2/11","fifties":3,"hundreds":0}',
'{"matches":85,"runs":1850,"wickets":6,"average":32.5,"strike_rate":155.0,"economy":8.0,"highest_score":"80*","best_bowling":"2/11","fifties":10,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tristan+Stubbs&background=1976D2&color=fff'),

-- 5. Mitchell Starc (Retained)
('ipl','Mitchell Starc','Australia',true,true,'bowler','left_hand','left_arm_fast',200,'KKR',true,
'{"matches":14,"runs":25,"wickets":17,"average":26.1,"strike_rate":150.0,"economy":10.6,"highest_score":"10*","best_bowling":"4/33","fifties":0,"hundreds":0}',
'{"matches":41,"runs":121,"wickets":51,"average":23.0,"strike_rate":155.0,"economy":8.2,"highest_score":"29","best_bowling":"4/15","fifties":0,"hundreds":0}',
'{"matches":145,"runs":350,"wickets":190,"average":20.5,"strike_rate":145.0,"economy":7.6,"highest_score":"29","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mitchell+Starc&background=1976D2&color=fff'),

-- 6. T Natarajan (Retained)
('ipl','T Natarajan','India',false,true,'bowler','left_hand','left_arm_fast_medium',150,'SRH',true,
'{"matches":14,"runs":0,"wickets":19,"average":24.5,"strike_rate":16.2,"economy":9.0,"highest_score":"0","best_bowling":"4/19","fifties":0,"hundreds":0}',
'{"matches":61,"runs":3,"wickets":67,"average":29.5,"strike_rate":20.5,"economy":8.7,"highest_score":"3*","best_bowling":"4/19","fifties":0,"hundreds":0}',
'{"matches":105,"runs":15,"wickets":115,"average":25.5,"strike_rate":18.5,"economy":8.2,"highest_score":"5","best_bowling":"4/19","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=T+Natarajan&background=1976D2&color=fff'),

-- 7. Mukesh Kumar (Retained)
('ipl','Mukesh Kumar','India',false,true,'bowler','right_hand','right_arm_fast_medium',150,'DC',true,
'{"matches":10,"runs":5,"wickets":17,"average":21.6,"strike_rate":12.5,"economy":10.3,"highest_score":"5*","best_bowling":"3/14","fifties":0,"hundreds":0}',
'{"matches":20,"runs":12,"wickets":24,"average":26.5,"strike_rate":15.0,"economy":10.5,"highest_score":"5*","best_bowling":"3/14","fifties":0,"hundreds":0}',
'{"matches":45,"runs":25,"wickets":55,"average":24.5,"strike_rate":16.5,"economy":9.2,"highest_score":"12*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mukesh+Kumar&background=1976D2&color=fff'),

-- 8. Nitish Rana (Traded)
('ipl','Nitish Rana','India',false,true,'batsman','left_hand','right_arm_off_spin',150,'KKR',true,
'{"matches":10,"runs":213,"wickets":3,"average":26.6,"strike_rate":135.5,"economy":8.5,"highest_score":"51","best_bowling":"2/11","fifties":1,"hundreds":0}',
'{"matches":105,"runs":2594,"wickets":10,"average":28.5,"strike_rate":135.2,"economy":8.1,"highest_score":"87","best_bowling":"2/11","fifties":18,"hundreds":0}',
'{"matches":175,"runs":4250,"wickets":45,"average":31.5,"strike_rate":138.5,"economy":7.8,"highest_score":"107","best_bowling":"3/15","fifties":28,"hundreds":1}',
'https://ui-avatars.com/api/?name=Nitish+Rana&background=1976D2&color=fff'),

-- 9. David Miller
('ipl','David Miller','South Africa',true,true,'batsman','left_hand','none',200,'GT',true,
'{"matches":16,"runs":259,"wickets":0,"average":32.3,"strike_rate":145.5,"economy":0,"highest_score":"46","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":121,"runs":2714,"wickets":0,"average":36.1,"strike_rate":138.4,"economy":0,"highest_score":"101*","best_bowling":"0/0","fifties":12,"hundreds":1}',
'{"matches":455,"runs":10150,"wickets":0,"average":35.5,"strike_rate":138.2,"economy":0,"highest_score":"120*","best_bowling":"0/0","fifties":45,"hundreds":4}',
'https://ui-avatars.com/api/?name=David+Miller&background=1976D2&color=fff'),

-- 10. Ben Duckett
('ipl','Ben Duckett','England',true,true,'batsman','left_hand','none',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":185,"runs":4550,"wickets":0,"average":28.5,"strike_rate":142.5,"economy":0,"highest_score":"95*","best_bowling":"0/0","fifties":28,"hundreds":1}',
'https://ui-avatars.com/api/?name=Ben+Duckett&background=1976D2&color=fff'),

-- 11. Lungisani Ngidi
('ipl','Lungisani Ngidi','South Africa',true,true,'bowler','right_hand','right_arm_fast',200,'DC',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":14,"runs":12,"wickets":25,"average":17.9,"strike_rate":12.9,"economy":8.3,"highest_score":"5*","best_bowling":"4/10","fifties":0,"hundreds":0}',
'{"matches":110,"runs":45,"wickets":145,"average":21.5,"strike_rate":15.5,"economy":8.0,"highest_score":"12*","best_bowling":"4/10","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Lungisani+Ngidi&background=1976D2&color=fff'),

-- 12. Pathum Nissanka
('ipl','Pathum Nissanka','Sri Lanka',true,true,'batsman','right_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":110,"runs":3150,"wickets":0,"average":31.5,"strike_rate":135.2,"economy":0,"highest_score":"115*","best_bowling":"0/0","fifties":22,"hundreds":2}',
'https://ui-avatars.com/api/?name=Pathum+Nissanka&background=1976D2&color=fff'),

-- 13. Kyle Jamieson
('ipl','Kyle Jamieson','New Zealand',true,true,'bowler','right_hand','right_arm_fast_medium',200,'CSK',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":9,"runs":65,"wickets":9,"average":29.8,"strike_rate":18.5,"economy":9.6,"highest_score":"16*","best_bowling":"3/41","fifties":0,"hundreds":0}',
'{"matches":70,"runs":450,"wickets":85,"average":24.5,"strike_rate":17.5,"economy":8.2,"highest_score":"35","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kyle+Jamieson&background=1976D2&color=fff'),

-- 14. Abishek Porel (Retained)
('ipl','Abishek Porel','India',false,false,'wicketkeeper','left_hand','none',50,'DC',true,
'{"matches":14,"runs":327,"wickets":0,"average":32.7,"strike_rate":159.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":18,"runs":360,"wickets":0,"average":25.5,"strike_rate":148.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":35,"runs":750,"wickets":0,"average":28.5,"strike_rate":142.2,"economy":0,"highest_score":"75","best_bowling":"0/0","fifties":5,"hundreds":0}',
'https://ui-avatars.com/api/?name=Abishek+Porel&background=1976D2&color=fff'),

-- 15. Ashutosh Sharma (Retained)
('ipl','Ashutosh Sharma','India',false,false,'batsman','right_hand','none',50,'PBKS',true,
'{"matches":11,"runs":189,"wickets":0,"average":27.0,"strike_rate":167.2,"economy":0,"highest_score":"61","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":11,"runs":189,"wickets":0,"average":27.0,"strike_rate":167.2,"economy":0,"highest_score":"61","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":25,"runs":650,"wickets":0,"average":32.5,"strike_rate":185.5,"economy":0,"highest_score":"85*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ashutosh+Sharma&background=1976D2&color=fff'),

-- 16. Sameer Rizvi (Retained)
('ipl','Sameer Rizvi','India',false,false,'batsman','right_hand','right_arm_off_spin',50,'CSK',true,
'{"matches":8,"runs":51,"wickets":0,"average":12.7,"strike_rate":118.6,"economy":0,"highest_score":"21","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":51,"wickets":0,"average":12.7,"strike_rate":118.6,"economy":0,"highest_score":"21","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":450,"wickets":0,"average":28.5,"strike_rate":155.2,"economy":0,"highest_score":"85*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sameer+Rizvi&background=1976D2&color=fff'),

-- 17. Prithvi Shaw
('ipl','Prithvi Shaw','India',false,true,'batsman','right_hand','none',75,'DC',true,
'{"matches":8,"runs":198,"wickets":0,"average":24.7,"strike_rate":163.6,"economy":0,"highest_score":"66","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":79,"runs":1892,"wickets":0,"average":23.9,"strike_rate":147.5,"economy":0,"highest_score":"99","best_bowling":"0/0","fifties":14,"hundreds":0}',
'{"matches":110,"runs":2850,"wickets":0,"average":26.5,"strike_rate":150.2,"economy":0,"highest_score":"134","best_bowling":"0/0","fifties":20,"hundreds":2}',
'https://ui-avatars.com/api/?name=Prithvi+Shaw&background=1976D2&color=fff'),

-- 18. Karun Nair (Retained)
('ipl','Karun Nair','India',false,true,'batsman','right_hand','right_arm_off_spin',50,'LSG',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":76,"runs":1496,"wickets":0,"average":23.7,"strike_rate":127.7,"economy":0,"highest_score":"83*","best_bowling":"0/0","fifties":10,"hundreds":0}',
'{"matches":150,"runs":3150,"wickets":0,"average":25.5,"strike_rate":132.5,"economy":0,"highest_score":"111","best_bowling":"0/0","fifties":22,"hundreds":1}',
'https://ui-avatars.com/api/?name=Karun+Nair&background=1976D2&color=fff'),

-- 19. Dushmantha Chameera (Retained)
('ipl','Dushmantha Chameera','Sri Lanka',true,true,'bowler','right_hand','right_arm_fast',75,'KKR',true,
'{"matches":4,"runs":2,"wickets":3,"average":38.5,"strike_rate":24.5,"economy":9.5,"highest_score":"2*","best_bowling":"1/22","fifties":0,"hundreds":0}',
'{"matches":16,"runs":22,"wickets":12,"average":36.5,"strike_rate":26.5,"economy":8.8,"highest_score":"10*","best_bowling":"2/17","fifties":0,"hundreds":0}',
'{"matches":115,"runs":115,"wickets":125,"average":25.5,"strike_rate":18.5,"economy":8.1,"highest_score":"15","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Dushmantha+Chameera&background=1976D2&color=fff'),

-- 20. Auqib Dar
('ipl','Auqib Dar','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":10,"wickets":22,"average":21.5,"strike_rate":15.5,"economy":7.8,"highest_score":"5*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Auqib+Dar&background=1976D2&color=fff'),

-- 21. Sahil Parakh
('ipl','Sahil Parakh','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":285,"wickets":0,"average":26.5,"strike_rate":145.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sahil+Parakh&background=1976D2&color=fff'),

-- 22. Ajay Mandal (Retained)
('ipl','Ajay Mandal','India',false,false,'allrounder','left_hand','left_arm_orthodox',30,'CSK',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":30,"runs":350,"wickets":25,"average":24.5,"strike_rate":135.5,"economy":7.5,"highest_score":"45*","best_bowling":"3/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ajay+Mandal&background=1976D2&color=fff'),

-- 23. Madhav Tiwari (Retained)
('ipl','Madhav Tiwari','India',false,false,'bowler','right_hand','right_arm_medium',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":15,"wickets":12,"average":25.5,"strike_rate":18.5,"economy":8.2,"highest_score":"8*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Madhav+Tiwari&background=1976D2&color=fff'),

-- 24. Vipraj Nigam (Retained)
('ipl','Vipraj Nigam','India',false,false,'bowler','right_hand','right_arm_leg_spin',50,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":25,"wickets":18,"average":22.5,"strike_rate":17.5,"economy":7.8,"highest_score":"10*","best_bowling":"4/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vipraj+Nigam&background=1976D2&color=fff'),

-- 25. Tripurana Vijay (Retained)
('ipl','Tripurana Vijay','India',false,false,'allrounder','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":110,"wickets":5,"average":25.5,"strike_rate":130.5,"economy":8.5,"highest_score":"35","best_bowling":"2/18","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tripurana+Vijay&background=1976D2&color=fff'),

-- 1. Yashasvi Jaiswal (Retained)
('ipl','Yashasvi Jaiswal','India',false,true,'batsman','left_hand','right_arm_leg_spin',150,'RR',true,
'{"matches":15,"runs":435,"wickets":0,"average":31.1,"strike_rate":155.9,"economy":0,"highest_score":"104*","best_bowling":"0/0","fifties":1,"hundreds":1}',
'{"matches":52,"runs":1607,"wickets":0,"average":32.1,"strike_rate":150.6,"economy":0,"highest_score":"124","best_bowling":"0/0","fifties":9,"hundreds":2}',
'{"matches":101,"runs":3120,"wickets":0,"average":33.5,"strike_rate":151.2,"economy":0,"highest_score":"124","best_bowling":"0/0","fifties":18,"hundreds":3}',
'https://ui-avatars.com/api/?name=Yashasvi+Jaiswal&background=E91E63&color=fff'),

-- 2. Riyan Parag (Retained)
('ipl','Riyan Parag','India',false,true,'allrounder','right_hand','right_arm_leg_spin',150,'RR',true,
'{"matches":16,"runs":573,"wickets":0,"average":52.1,"strike_rate":149.2,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":70,"runs":1173,"wickets":4,"average":22.5,"strike_rate":135.5,"economy":9.5,"highest_score":"84*","best_bowling":"1/12","fifties":6,"hundreds":0}',
'{"matches":115,"runs":2450,"wickets":45,"average":32.5,"strike_rate":145.2,"economy":7.8,"highest_score":"84*","best_bowling":"3/15","fifties":18,"hundreds":0}',
'https://ui-avatars.com/api/?name=Riyan+Parag&background=E91E63&color=fff'),

-- 3. Dhruv Jurel (Retained)
('ipl','Dhruv Jurel','India',false,true,'wicketkeeper','right_hand','none',100,'RR',true,
'{"matches":14,"runs":195,"wickets":0,"average":24.3,"strike_rate":138.2,"economy":0,"highest_score":"56*","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":27,"runs":347,"wickets":0,"average":23.1,"strike_rate":152.8,"economy":0,"highest_score":"56*","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":45,"runs":650,"wickets":0,"average":26.5,"strike_rate":145.5,"economy":0,"highest_score":"65*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Dhruv+Jurel&background=E91E63&color=fff'),

-- 4. Ravindra Jadeja (Traded)
('ipl','Ravindra Jadeja','India',false,true,'allrounder','left_hand','left_arm_orthodox',200,'CSK',true,
'{"matches":14,"runs":267,"wickets":8,"average":44.5,"strike_rate":142.8,"economy":7.8,"highest_score":"57*","best_bowling":"3/18","fifties":1,"hundreds":0}',
'{"matches":240,"runs":2959,"wickets":160,"average":27.4,"strike_rate":129.5,"economy":7.6,"highest_score":"62*","best_bowling":"5/16","fifties":3,"hundreds":0}',
'{"matches":325,"runs":3560,"wickets":230,"average":25.8,"strike_rate":128.4,"economy":7.5,"highest_score":"62*","best_bowling":"5/16","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ravindra+Jadeja&background=E91E63&color=fff'),

-- 5. Sam Curran (Traded)
('ipl','Sam Curran','England',true,true,'allrounder','left_hand','left_arm_fast_medium',200,'PBKS',true,
'{"matches":14,"runs":276,"wickets":10,"average":27.6,"strike_rate":135.9,"economy":10.2,"highest_score":"55","best_bowling":"3/31","fifties":1,"hundreds":0}',
'{"matches":59,"runs":883,"wickets":58,"average":25.2,"strike_rate":142.5,"economy":9.5,"highest_score":"55","best_bowling":"4/11","fifties":4,"hundreds":0}',
'{"matches":215,"runs":2950,"wickets":210,"average":21.5,"strike_rate":135.0,"economy":8.6,"highest_score":"65","best_bowling":"5/30","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sam+Curran&background=E91E63&color=fff'),

-- 6. Ravi Bishnoi
('ipl','Ravi Bishnoi','India',false,true,'bowler','right_hand','right_arm_leg_spin',200,'LSG',true,
'{"matches":14,"runs":15,"wickets":10,"average":38.5,"strike_rate":28.5,"economy":8.7,"highest_score":"5*","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":66,"runs":32,"wickets":63,"average":28.5,"strike_rate":22.5,"economy":7.6,"highest_score":"12","best_bowling":"3/24","fifties":0,"hundreds":0}',
'{"matches":115,"runs":85,"wickets":125,"average":23.5,"strike_rate":19.5,"economy":7.2,"highest_score":"22","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ravi+Bishnoi&background=E91E63&color=fff'),

-- 7. Jofra Archer (Retained)
('ipl','Jofra Archer','England',true,true,'bowler','right_hand','right_arm_fast',200,'MI',true,
'{"matches":5,"runs":2,"wickets":2,"average":95.0,"strike_rate":60.0,"economy":9.5,"highest_score":"1*","best_bowling":"1/42","fifties":0,"hundreds":0}',
'{"matches":40,"runs":195,"wickets":48,"average":24.3,"strike_rate":20.2,"economy":7.4,"highest_score":"27*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'{"matches":135,"runs":615,"wickets":175,"average":22.5,"strike_rate":17.5,"economy":7.6,"highest_score":"34*","best_bowling":"4/18","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jofra+Archer&background=E91E63&color=fff'),

-- 8. Sandeep Sharma (Retained)
('ipl','Sandeep Sharma','India',false,true,'bowler','right_hand','right_arm_medium',100,'RR',true,
'{"matches":11,"runs":0,"wickets":13,"average":23.9,"strike_rate":17.5,"economy":8.1,"highest_score":"0","best_bowling":"5/18","fifties":0,"hundreds":0}',
'{"matches":127,"runs":45,"wickets":137,"average":26.5,"strike_rate":20.5,"economy":7.8,"highest_score":"10","best_bowling":"5/18","fifties":0,"hundreds":0}',
'{"matches":185,"runs":85,"wickets":195,"average":24.5,"strike_rate":19.5,"economy":7.5,"highest_score":"15","best_bowling":"5/18","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sandeep+Sharma&background=E91E63&color=fff'),

-- 9. Shimron Hetmyer (Retained)
('ipl','Shimron Hetmyer','West Indies',true,true,'batsman','left_hand','none',150,'RR',true,
'{"matches":14,"runs":300,"wickets":0,"average":37.5,"strike_rate":152.0,"economy":0,"highest_score":"56*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":60,"runs":1131,"wickets":0,"average":32.5,"strike_rate":155.5,"economy":0,"highest_score":"75","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":200,"runs":3650,"wickets":0,"average":28.5,"strike_rate":138.5,"economy":0,"highest_score":"100","best_bowling":"0/0","fifties":20,"hundreds":1}',
'https://ui-avatars.com/api/?name=Shimron+Hetmyer&background=E91E63&color=fff'),

-- 10. Nandre Burger (Retained)
('ipl','Nandre Burger','South Africa',true,true,'bowler','left_hand','left_arm_fast_medium',100,'RR',true,
'{"matches":6,"runs":1,"wickets":7,"average":26.5,"strike_rate":17.5,"economy":9.1,"highest_score":"1*","best_bowling":"2/29","fifties":0,"hundreds":0}',
'{"matches":6,"runs":1,"wickets":7,"average":26.5,"strike_rate":17.5,"economy":9.1,"highest_score":"1*","best_bowling":"2/29","fifties":0,"hundreds":0}',
'{"matches":55,"runs":25,"wickets":65,"average":22.5,"strike_rate":16.5,"economy":8.0,"highest_score":"10","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nandre+Burger&background=E91E63&color=fff'),

-- 11. Tushar Deshpande (Retained)
('ipl','Tushar Deshpande','India',false,true,'bowler','right_hand','right_arm_fast_medium',100,'CSK',true,
'{"matches":13,"runs":0,"wickets":17,"average":24.9,"strike_rate":16.9,"economy":8.8,"highest_score":"0","best_bowling":"4/27","fifties":0,"hundreds":0}',
'{"matches":36,"runs":25,"wickets":42,"average":28.5,"strike_rate":18.5,"economy":9.6,"highest_score":"12*","best_bowling":"4/27","fifties":0,"hundreds":0}',
'{"matches":80,"runs":85,"wickets":105,"average":24.5,"strike_rate":17.5,"economy":8.5,"highest_score":"25","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tushar+Deshpande&background=E91E63&color=fff'),

-- 12. Adam Milne
('ipl','Adam Milne','New Zealand',true,true,'bowler','right_hand','right_arm_fast',200,'CSK',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":23,"wickets":7,"average":46.5,"strike_rate":28.5,"economy":9.8,"highest_score":"15","best_bowling":"2/21","fifties":0,"hundreds":0}',
'{"matches":165,"runs":385,"wickets":185,"average":23.5,"strike_rate":18.5,"economy":7.8,"highest_score":"22*","best_bowling":"5/11","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Adam+Milne&background=E91E63&color=fff'),

-- 13. Donovan Ferreira (Traded)
('ipl','Donovan Ferreira','South Africa',true,true,'wicketkeeper','right_hand','right_arm_off_spin',75,'RR',true,
'{"matches":2,"runs":7,"wickets":0,"average":3.5,"strike_rate":77.7,"economy":0,"highest_score":"6","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":7,"wickets":0,"average":3.5,"strike_rate":77.7,"economy":0,"highest_score":"6","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":55,"runs":850,"wickets":5,"average":32.5,"strike_rate":155.5,"economy":8.2,"highest_score":"82*","best_bowling":"2/15","fifties":5,"hundreds":0}',
'https://ui-avatars.com/api/?name=Donovan+Ferreira&background=E91E63&color=fff'),

-- 14. Kwena Maphaka (Retained)
('ipl','Kwena Maphaka','South Africa',true,false,'bowler','left_hand','left_arm_fast',50,'MI',true,
'{"matches":2,"runs":0,"wickets":1,"average":89.0,"strike_rate":36.0,"economy":14.8,"highest_score":"0","best_bowling":"1/23","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":1,"average":89.0,"strike_rate":36.0,"economy":14.8,"highest_score":"0","best_bowling":"1/23","fifties":0,"hundreds":0}',
'{"matches":15,"runs":10,"wickets":22,"average":22.5,"strike_rate":15.5,"economy":8.5,"highest_score":"5*","best_bowling":"5/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kwena+Maphaka&background=E91E63&color=fff'),

-- 15. Lhuan-Dre Pretorius (Retained)
('ipl','Lhuan-Dre Pretorius','South Africa',true,false,'wicketkeeper','left_hand','none',30,'RR',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":285,"wickets":0,"average":31.5,"strike_rate":145.5,"economy":0,"highest_score":"75*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Lhuan-Dre+Pretorius&background=E91E63&color=fff'),

-- 16. Kuldeep Sen
('ipl','Kuldeep Sen','India',false,true,'bowler','right_hand','right_arm_fast',75,'RR',true,
'{"matches":3,"runs":0,"wickets":6,"average":25.5,"strike_rate":15.5,"economy":9.8,"highest_score":"0","best_bowling":"3/41","fifties":0,"hundreds":0}',
'{"matches":12,"runs":5,"wickets":14,"average":31.5,"strike_rate":20.5,"economy":9.2,"highest_score":"2*","best_bowling":"4/20","fifties":0,"hundreds":0}',
'{"matches":35,"runs":25,"wickets":45,"average":24.5,"strike_rate":16.5,"economy":8.5,"highest_score":"10","best_bowling":"4/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kuldeep+Sen&background=E91E63&color=fff'),

-- 17. Shubham Dubey (Retained)
('ipl','Shubham Dubey','India',false,false,'batsman','left_hand','none',50,'RR',true,
'{"matches":5,"runs":75,"wickets":0,"average":25.0,"strike_rate":145.2,"economy":0,"highest_score":"25*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":75,"wickets":0,"average":25.0,"strike_rate":145.2,"economy":0,"highest_score":"25*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":550,"wickets":0,"average":32.5,"strike_rate":155.5,"economy":0,"highest_score":"78*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shubham+Dubey&background=E91E63&color=fff'),

-- 18. Vaibhav Sooryavanshi (Retained)
('ipl','Vaibhav Sooryavanshi','India',false,false,'batsman','left_hand','left_arm_orthodox',30,'RR',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":120,"wickets":2,"average":24.5,"strike_rate":135.5,"economy":8.5,"highest_score":"45","best_bowling":"1/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vaibhav+Sooryavanshi&background=E91E63&color=fff'),

-- 19. Yudhvir Singh (Retained)
('ipl','Yudhvir Singh','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'LSG',true,
'{"matches":2,"runs":14,"wickets":1,"average":45.0,"strike_rate":24.0,"economy":11.2,"highest_score":"14*","best_bowling":"1/21","fifties":0,"hundreds":0}',
'{"matches":5,"runs":15,"wickets":4,"average":32.5,"strike_rate":20.5,"economy":9.5,"highest_score":"14*","best_bowling":"2/19","fifties":0,"hundreds":0}',
'{"matches":25,"runs":45,"wickets":25,"average":26.5,"strike_rate":18.5,"economy":8.2,"highest_score":"22","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Yudhvir+Singh&background=E91E63&color=fff'),

-- 20. Sushant Mishra
('ipl','Sushant Mishra','India',false,false,'bowler','left_hand','left_arm_fast_medium',30,'GT',true,
'{"matches":1,"runs":0,"wickets":1,"average":42.0,"strike_rate":24.0,"economy":10.5,"highest_score":"0","best_bowling":"1/42","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":1,"average":42.0,"strike_rate":24.0,"economy":10.5,"highest_score":"0","best_bowling":"1/42","fifties":0,"hundreds":0}',
'{"matches":15,"runs":15,"wickets":22,"average":24.5,"strike_rate":16.5,"economy":8.5,"highest_score":"5*","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sushant+Mishra&background=E91E63&color=fff'),

-- 21. Yash Raj Punja
('ipl','Yash Raj Punja','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":5,"wickets":12,"average":25.5,"strike_rate":18.5,"economy":7.8,"highest_score":"5*","best_bowling":"3/18","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Yash+Raj+Punja&background=E91E63&color=fff'),

-- 22. Vignesh Puthur
('ipl','Vignesh Puthur','India',false,false,'bowler','right_hand','right_arm_leg_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":12,"wickets":15,"average":22.5,"strike_rate":16.5,"economy":7.5,"highest_score":"8*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vignesh+Puthur&background=E91E63&color=fff'),

-- 23. Ravi Singh
('ipl','Ravi Singh','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":380,"wickets":0,"average":28.5,"strike_rate":145.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ravi+Singh&background=E91E63&color=fff'),

-- 24. Aman Rao Perala
('ipl','Aman Rao Perala','India',false,false,'allrounder','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":150,"wickets":8,"average":25.5,"strike_rate":135.5,"economy":8.2,"highest_score":"45*","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Aman+Rao+Perala&background=E91E63&color=fff'),

-- 25. Brijesh Sharma
('ipl','Brijesh Sharma','India',false,false,'bowler','left_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":25,"wickets":14,"average":24.5,"strike_rate":18.5,"economy":7.8,"highest_score":"10*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Brijesh+Sharma&background=E91E63&color=fff'),

-- 1. Rohit Sharma (Retained)
('ipl','Rohit Sharma','India',false,true,'batsman','right_hand','right_arm_off_spin',200,'MI',true,
'{"matches":14,"runs":417,"wickets":0,"average":32.07,"strike_rate":150.0,"economy":0,"highest_score":"105*","best_bowling":"0/0","fifties":1,"hundreds":1}',
'{"matches":257,"runs":6628,"wickets":15,"average":29.72,"strike_rate":131.14,"economy":8.02,"highest_score":"109*","best_bowling":"4/6","fifties":43,"hundreds":2}',
'{"matches":448,"runs":11830,"wickets":26,"average":30.56,"strike_rate":134.8,"economy":7.9,"highest_score":"121*","best_bowling":"4/6","fifties":77,"hundreds":8}',
'https://ui-avatars.com/api/?name=Rohit+Sharma&background=1565C0&color=fff'),

-- 2. Jasprit Bumrah (Retained)
('ipl','Jasprit Bumrah','India',false,true,'bowler','right_hand','right_arm_fast',200,'MI',true,
'{"matches":13,"runs":0,"wickets":20,"average":16.8,"strike_rate":15.5,"economy":6.48,"highest_score":"0","best_bowling":"5/21","fifties":0,"hundreds":0}',
'{"matches":133,"runs":69,"wickets":165,"average":22.51,"strike_rate":18.3,"economy":7.3,"highest_score":"16*","best_bowling":"5/10","fifties":0,"hundreds":0}',
'{"matches":235,"runs":115,"wickets":289,"average":20.7,"strike_rate":17.6,"economy":7.0,"highest_score":"16*","best_bowling":"5/10","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jasprit+Bumrah&background=1565C0&color=fff'),

-- 3. Hardik Pandya (Retained)
('ipl','Hardik Pandya','India',false,true,'allrounder','right_hand','right_arm_fast_medium',200,'MI',true,
'{"matches":14,"runs":216,"wickets":11,"average":18.0,"strike_rate":143.0,"economy":10.75,"highest_score":"46","best_bowling":"3/31","fifties":0,"hundreds":0}',
'{"matches":137,"runs":2525,"wickets":64,"average":28.69,"strike_rate":145.45,"economy":8.95,"highest_score":"91","best_bowling":"3/17","fifties":10,"hundreds":0}',
'{"matches":258,"runs":4750,"wickets":165,"average":29.5,"strike_rate":141.2,"economy":8.5,"highest_score":"91","best_bowling":"4/16","fifties":20,"hundreds":0}',
'https://ui-avatars.com/api/?name=Hardik+Pandya&background=1565C0&color=fff'),

-- 4. Suryakumar Yadav (Retained)
('ipl','Suryakumar Yadav','India',false,true,'batsman','right_hand','right_arm_off_spin',200,'MI',true,
'{"matches":11,"runs":345,"wickets":0,"average":34.5,"strike_rate":167.47,"economy":0,"highest_score":"102*","best_bowling":"0/0","fifties":3,"hundreds":1}',
'{"matches":150,"runs":3594,"wickets":0,"average":32.08,"strike_rate":145.32,"economy":0,"highest_score":"103*","best_bowling":"0/0","fifties":24,"hundreds":2}',
'{"matches":284,"runs":7320,"wickets":4,"average":34.5,"strike_rate":152.6,"economy":8.5,"highest_score":"117","best_bowling":"2/15","fifties":45,"hundreds":6}',
'https://ui-avatars.com/api/?name=Suryakumar+Yadav&background=1565C0&color=fff'),

-- 5. Tilak Varma (Retained)
('ipl','Tilak Varma','India',false,true,'batsman','left_hand','right_arm_off_spin',100,'MI',true,
'{"matches":13,"runs":416,"wickets":0,"average":41.6,"strike_rate":149.6,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":3,"hundreds":0}',
'{"matches":38,"runs":1156,"wickets":0,"average":39.8,"strike_rate":146.3,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":6,"hundreds":0}',
'{"matches":75,"runs":2150,"wickets":0,"average":40.5,"strike_rate":144.5,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tilak+Varma&background=1565C0&color=fff'),

-- 6. Trent Boult (Retained)
('ipl','Trent Boult','New Zealand',true,true,'bowler','right_hand','left_arm_fast_medium',200,'RR',true,
'{"matches":15,"runs":10,"wickets":16,"average":27.6,"strike_rate":156.0,"economy":8.3,"highest_score":"8","best_bowling":"3/22","fifties":0,"hundreds":0}',
'{"matches":103,"runs":94,"wickets":121,"average":26.5,"strike_rate":154.0,"economy":8.2,"highest_score":"13","best_bowling":"4/18","fifties":0,"hundreds":0}',
'{"matches":215,"runs":152,"wickets":250,"average":24.0,"strike_rate":153.0,"economy":8.0,"highest_score":"15","best_bowling":"4/13","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Trent+Boult&background=1565C0&color=fff'),

-- 7. Quinton De Kock
('ipl','Quinton De Kock','South Africa',true,true,'wicketkeeper','left_hand','none',100,'LSG',true,
'{"matches":11,"runs":250,"wickets":0,"average":22.7,"strike_rate":134.4,"economy":0,"highest_score":"81","best_bowling":"0/0","fifties":3,"hundreds":0}',
'{"matches":107,"runs":3157,"wickets":0,"average":31.2,"strike_rate":134.2,"economy":0,"highest_score":"140*","best_bowling":"0/0","fifties":23,"hundreds":2}',
'{"matches":335,"runs":9550,"wickets":0,"average":32.5,"strike_rate":138.5,"economy":0,"highest_score":"140*","best_bowling":"0/0","fifties":62,"hundreds":6}',
'https://ui-avatars.com/api/?name=Quinton+De+Kock&background=1565C0&color=fff'),

-- 8. Deepak Chahar (Retained)
('ipl','Deepak Chahar','India',false,true,'bowler','right_hand','right_arm_fast_medium',200,'CSK',true,
'{"matches":8,"runs":5,"wickets":5,"average":45.2,"strike_rate":31.0,"economy":8.7,"highest_score":"5*","best_bowling":"2/28","fifties":0,"hundreds":0}',
'{"matches":81,"runs":80,"wickets":77,"average":28.5,"strike_rate":22.1,"economy":7.8,"highest_score":"39","best_bowling":"4/13","fifties":0,"hundreds":0}',
'{"matches":135,"runs":350,"wickets":150,"average":24.5,"strike_rate":19.5,"economy":7.6,"highest_score":"55","best_bowling":"6/7","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Deepak+Chahar&background=1565C0&color=fff'),

-- 9. Will Jacks (Retained)
('ipl','Will Jacks','England',true,true,'allrounder','right_hand','right_arm_off_spin',150,'RCB',true,
'{"matches":8,"runs":230,"wickets":2,"average":32.8,"strike_rate":175.5,"economy":10.5,"highest_score":"100*","best_bowling":"1/23","fifties":1,"hundreds":1}',
'{"matches":8,"runs":230,"wickets":2,"average":32.8,"strike_rate":175.5,"economy":10.5,"highest_score":"100*","best_bowling":"1/23","fifties":1,"hundreds":1}',
'{"matches":165,"runs":4250,"wickets":55,"average":30.5,"strike_rate":158.5,"economy":7.8,"highest_score":"108*","best_bowling":"4/15","fifties":28,"hundreds":3}',
'https://ui-avatars.com/api/?name=Will+Jacks&background=1565C0&color=fff'),

-- 10. Shardul Thakur (Traded)
('ipl','Shardul Thakur','India',false,true,'bowler','right_hand','right_arm_fast_medium',150,'CSK',true,
'{"matches":9,"runs":21,"wickets":5,"average":61.8,"strike_rate":38.2,"economy":9.7,"highest_score":"17","best_bowling":"2/42","fifties":0,"hundreds":0}',
'{"matches":95,"runs":307,"wickets":94,"average":30.5,"strike_rate":19.8,"economy":9.2,"highest_score":"68","best_bowling":"4/36","fifties":1,"hundreds":0}',
'{"matches":185,"runs":650,"wickets":210,"average":25.5,"strike_rate":18.5,"economy":8.8,"highest_score":"68","best_bowling":"4/27","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shardul+Thakur&background=1565C0&color=fff'),

-- 11. Mitchell Santner (Retained)
('ipl','Mitchell Santner','New Zealand',true,true,'allrounder','left_hand','left_arm_orthodox',200,'CSK',true,
'{"matches":3,"runs":11,"wickets":2,"average":38.5,"strike_rate":24.5,"economy":8.2,"highest_score":"11*","best_bowling":"1/15","fifties":0,"hundreds":0}',
'{"matches":18,"runs":67,"wickets":15,"average":30.2,"strike_rate":22.5,"economy":7.1,"highest_score":"22","best_bowling":"3/15","fifties":0,"hundreds":0}',
'{"matches":175,"runs":2150,"wickets":185,"average":24.5,"strike_rate":18.5,"economy":6.9,"highest_score":"45*","best_bowling":"4/12","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mitchell+Santner&background=1565C0&color=fff'),

-- 12. Sherfane Rutherford (Traded)
('ipl','Sherfane Rutherford','West Indies',true,true,'allrounder','left_hand','right_arm_fast_medium',150,'KKR',true,
'{"matches":5,"runs":75,"wickets":1,"average":18.5,"strike_rate":145.5,"economy":10.5,"highest_score":"34","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":15,"runs":185,"wickets":2,"average":16.5,"strike_rate":135.5,"economy":9.8,"highest_score":"34","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":145,"runs":2850,"wickets":25,"average":26.5,"strike_rate":142.5,"economy":8.5,"highest_score":"75*","best_bowling":"2/15","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sherfane+Rutherford&background=1565C0&color=fff'),

-- 13. Ryan Rickelton (Retained)
('ipl','Ryan Rickelton','South Africa',true,true,'wicketkeeper','left_hand','none',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":110,"runs":3150,"wickets":0,"average":32.5,"strike_rate":155.5,"economy":0,"highest_score":"115*","best_bowling":"0/0","fifties":18,"hundreds":3}',
'https://ui-avatars.com/api/?name=Ryan+Rickelton&background=1565C0&color=fff'),

-- 14. AM Ghazanfar (Retained)
('ipl','AM Ghazanfar','Afghanistan',true,true,'bowler','right_hand','right_arm_off_spin',100,'KKR',true,
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":12.5,"highest_score":"0","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":12.5,"highest_score":"0","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":15,"runs":25,"wickets":18,"average":22.5,"strike_rate":16.5,"economy":7.8,"highest_score":"15","best_bowling":"4/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=AM+Ghazanfar&background=1565C0&color=fff'),

-- 15. Naman Dhir (Retained)
('ipl','Naman Dhir','India',false,false,'allrounder','right_hand','right_arm_off_spin',50,'MI',true,
'{"matches":7,"runs":140,"wickets":0,"average":23.3,"strike_rate":155.5,"economy":0,"highest_score":"62*","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":7,"runs":140,"wickets":0,"average":23.3,"strike_rate":155.5,"economy":0,"highest_score":"62*","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":25,"runs":550,"wickets":15,"average":32.5,"strike_rate":160.2,"economy":8.5,"highest_score":"105","best_bowling":"2/15","fifties":3,"hundreds":1}',
'https://ui-avatars.com/api/?name=Naman+Dhir&background=1565C0&color=fff'),

-- 16. Mayank Markande (Traded)
('ipl','Mayank Markande','India',false,true,'bowler','right_hand','right_arm_leg_spin',30,'SRH',true,
'{"matches":7,"runs":5,"wickets":8,"average":32.5,"strike_rate":20.5,"economy":9.5,"highest_score":"5*","best_bowling":"2/25","fifties":0,"hundreds":0}',
'{"matches":37,"runs":45,"wickets":37,"average":28.5,"strike_rate":19.5,"economy":8.8,"highest_score":"12*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'{"matches":65,"runs":85,"wickets":75,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"22","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mayank+Markande&background=1565C0&color=fff'),

-- 17. Corbin Bosch (Retained)
('ipl','Corbin Bosch','South Africa',true,false,'allrounder','right_hand','right_arm_fast_medium',75,'RR',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":450,"wickets":35,"average":25.5,"strike_rate":142.5,"economy":8.5,"highest_score":"65","best_bowling":"3/15","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Corbin+Bosch&background=1565C0&color=fff'),

-- 18. Robin Minz (Retained)
('ipl','Robin Minz','India',false,false,'wicketkeeper','left_hand','none',50,'GT',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":350,"wickets":0,"average":35.5,"strike_rate":165.5,"economy":0,"highest_score":"85*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Robin+Minz&background=1565C0&color=fff'),

-- 19. Raj Angad Bawa (Retained)
('ipl','Raj Angad Bawa','India',false,false,'allrounder','left_hand','right_arm_fast_medium',30,'PBKS',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":11,"wickets":0,"average":5.5,"strike_rate":85.5,"economy":12.5,"highest_score":"11","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":15,"runs":250,"wickets":12,"average":24.5,"strike_rate":135.5,"economy":8.5,"highest_score":"55","best_bowling":"2/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Raj+Angad+Bawa&background=1565C0&color=fff'),

-- 20. Danish Malewar
('ipl','Danish Malewar','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":180,"wickets":0,"average":28.5,"strike_rate":135.5,"economy":0,"highest_score":"55","best_bowling":"0/0","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Danish+Malewar&background=1565C0&color=fff'),

-- 21. Mohammad Izhar
('ipl','Mohammad Izhar','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":12,"wickets":15,"average":24.5,"strike_rate":18.5,"economy":7.8,"highest_score":"5*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mohammad+Izhar&background=1565C0&color=fff'),

-- 22. Atharva Ankolekar
('ipl','Atharva Ankolekar','India',false,false,'allrounder','left_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":150,"wickets":18,"average":22.5,"strike_rate":125.5,"economy":7.5,"highest_score":"45*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Atharva+Ankolekar&background=1565C0&color=fff'),

-- 23. Mayank Rawat
('ipl','Mayank Rawat','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":280,"wickets":0,"average":31.5,"strike_rate":145.5,"economy":0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mayank+Rawat&background=1565C0&color=fff'),

-- 24. Ashwani Kumar (Retained)
('ipl','Ashwani Kumar','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":0,"wickets":6,"average":25.5,"strike_rate":17.5,"economy":8.2,"highest_score":"0","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ashwani+Kumar&background=1565C0&color=fff'),

-- 25. Raghu Sharma (Retained)
('ipl','Raghu Sharma','India',false,false,'bowler','left_hand','right_arm_leg_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":15,"wickets":10,"average":28.5,"strike_rate":19.5,"economy":8.5,"highest_score":"5*","best_bowling":"2/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Raghu+Sharma&background=1565C0&color=fff'),

-- 1. Pat Cummins (Retained)
('ipl','Pat Cummins','Australia',true,true,'bowler','right_hand','right_arm_fast',200,'SRH',true,
'{"matches":16,"runs":136,"wickets":18,"average":19.4,"strike_rate":137.3,"economy":9.2,"highest_score":"31","best_bowling":"3/43","fifties":0,"hundreds":0}',
'{"matches":58,"runs":515,"wickets":63,"average":18.4,"strike_rate":146.7,"economy":8.8,"highest_score":"66*","best_bowling":"4/34","fifties":3,"hundreds":0}',
'{"matches":142,"runs":1120,"wickets":160,"average":17.5,"strike_rate":142.1,"economy":8.2,"highest_score":"66*","best_bowling":"4/16","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Pat+Cummins&background=FF6D00&color=fff'),

-- 2. Travis Head (Retained)
('ipl','Travis Head','Australia',true,true,'batsman','left_hand','right_arm_off_spin',200,'SRH',true,
'{"matches":15,"runs":567,"wickets":0,"average":40.5,"strike_rate":191.5,"economy":0,"highest_score":"102","best_bowling":"0/0","fifties":4,"hundreds":1}',
'{"matches":25,"runs":772,"wickets":0,"average":32.1,"strike_rate":175.4,"economy":0,"highest_score":"102","best_bowling":"0/0","fifties":5,"hundreds":1}',
'{"matches":125,"runs":3150,"wickets":15,"average":31.5,"strike_rate":145.2,"economy":8.5,"highest_score":"102","best_bowling":"2/15","fifties":18,"hundreds":2}',
'https://ui-avatars.com/api/?name=Travis+Head&background=FF6D00&color=fff'),

-- 3. Heinrich Klaasen (Retained)
('ipl','Heinrich Klaasen','South Africa',true,true,'wicketkeeper','right_hand','none',200,'SRH',true,
'{"matches":16,"runs":479,"wickets":0,"average":39.9,"strike_rate":171.0,"economy":0,"highest_score":"80*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":34,"runs":993,"wickets":0,"average":38.2,"strike_rate":165.5,"economy":0,"highest_score":"104","best_bowling":"0/0","fifties":6,"hundreds":1}',
'{"matches":185,"runs":4250,"wickets":0,"average":32.4,"strike_rate":150.5,"economy":0,"highest_score":"104","best_bowling":"0/0","fifties":25,"hundreds":2}',
'https://ui-avatars.com/api/?name=Heinrich+Klaasen&background=FF6D00&color=fff'),

-- 4. Abhishek Sharma (Retained)
('ipl','Abhishek Sharma','India',false,true,'allrounder','left_hand','left_arm_orthodox',150,'SRH',true,
'{"matches":16,"runs":484,"wickets":2,"average":32.2,"strike_rate":204.2,"economy":9.5,"highest_score":"75","best_bowling":"1/15","fifties":3,"hundreds":0}',
'{"matches":63,"runs":1377,"wickets":11,"average":24.5,"strike_rate":155.1,"economy":8.8,"highest_score":"75","best_bowling":"2/4","fifties":7,"hundreds":0}',
'{"matches":105,"runs":2850,"wickets":35,"average":28.5,"strike_rate":152.5,"economy":8.2,"highest_score":"112","best_bowling":"3/15","fifties":15,"hundreds":2}',
'https://ui-avatars.com/api/?name=Abhishek+Sharma&background=FF6D00&color=fff'),

-- 5. Nitish Kumar Reddy (Retained)
('ipl','Nitish Kumar Reddy','India',false,true,'allrounder','right_hand','right_arm_fast_medium',100,'SRH',true,
'{"matches":15,"runs":303,"wickets":3,"average":33.6,"strike_rate":142.9,"economy":9.5,"highest_score":"76*","best_bowling":"2/17","fifties":2,"hundreds":0}',
'{"matches":17,"runs":303,"wickets":3,"average":33.6,"strike_rate":142.9,"economy":9.5,"highest_score":"76*","best_bowling":"2/17","fifties":2,"hundreds":0}',
'{"matches":35,"runs":850,"wickets":15,"average":32.5,"strike_rate":138.5,"economy":8.8,"highest_score":"85*","best_bowling":"3/22","fifties":5,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nitish+Kumar+Reddy&background=FF6D00&color=fff'),

-- 6. Ishan Kishan (Retained/Bought)
('ipl','Ishan Kishan','India',false,true,'wicketkeeper','left_hand','none',200,'MI',true,
'{"matches":14,"runs":320,"wickets":0,"average":22.8,"strike_rate":148.8,"economy":0,"highest_score":"69","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":105,"runs":2644,"wickets":0,"average":28.4,"strike_rate":135.8,"economy":0,"highest_score":"99","best_bowling":"0/0","fifties":16,"hundreds":0}',
'{"matches":180,"runs":4850,"wickets":0,"average":29.5,"strike_rate":137.2,"economy":0,"highest_score":"99","best_bowling":"0/0","fifties":28,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ishan+Kishan&background=FF6D00&color=fff'),

-- 7. Liam Livingstone 
('ipl','Liam Livingstone','England',true,true,'allrounder','right_hand','right_arm_leg_spin',200,'PBKS',true,
'{"matches":14,"runs":279,"wickets":2,"average":34.8,"strike_rate":163.1,"economy":9.5,"highest_score":"94","best_bowling":"1/13","fifties":2,"hundreds":0}',
'{"matches":39,"runs":900,"wickets":8,"average":29.5,"strike_rate":165.5,"economy":9.0,"highest_score":"94","best_bowling":"3/27","fifties":6,"hundreds":0}',
'{"matches":245,"runs":5950,"wickets":105,"average":28.5,"strike_rate":145.2,"economy":7.8,"highest_score":"103","best_bowling":"3/15","fifties":32,"hundreds":2}',
'https://ui-avatars.com/api/?name=Liam+Livingstone&background=FF6D00&color=fff'),

-- 8. Harshal Patel (Retained/Bought)
('ipl','Harshal Patel','India',false,true,'bowler','right_hand','right_arm_fast_medium',200,'PBKS',true,
'{"matches":14,"runs":46,"wickets":24,"average":19.8,"strike_rate":145.0,"economy":9.7,"highest_score":"16","best_bowling":"3/15","fifties":0,"hundreds":0}',
'{"matches":106,"runs":288,"wickets":135,"average":23.5,"strike_rate":150.0,"economy":8.8,"highest_score":"31","best_bowling":"5/27","fifties":0,"hundreds":0}',
'{"matches":185,"runs":1250,"wickets":225,"average":21.5,"strike_rate":145.0,"economy":8.2,"highest_score":"55","best_bowling":"5/27","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Harshal+Patel&background=FF6D00&color=fff'),

-- 9. Jaydev Unadkat (Retained)
('ipl','Jaydev Unadkat','India',false,true,'bowler','right_hand','left_arm_fast_medium',100,'SRH',true,
'{"matches":11,"runs":12,"wickets":8,"average":45.5,"strike_rate":24.5,"economy":10.2,"highest_score":"8*","best_bowling":"2/35","fifties":0,"hundreds":0}',
'{"matches":105,"runs":185,"wickets":99,"average":31.5,"strike_rate":21.5,"economy":8.8,"highest_score":"26","best_bowling":"5/25","fifties":0,"hundreds":0}',
'{"matches":185,"runs":350,"wickets":210,"average":26.5,"strike_rate":19.5,"economy":8.2,"highest_score":"35","best_bowling":"5/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jaydev+Unadkat&background=FF6D00&color=fff'),

-- 10. Shivam Mavi
('ipl','Shivam Mavi','India',false,true,'bowler','right_hand','right_arm_fast_medium',75,'LSG',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":32,"runs":55,"wickets":30,"average":31.5,"strike_rate":22.5,"economy":8.8,"highest_score":"20","best_bowling":"4/22","fifties":0,"hundreds":0}',
'{"matches":55,"runs":125,"wickets":55,"average":28.5,"strike_rate":20.5,"economy":8.5,"highest_score":"25","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shivam+Mavi&background=FF6D00&color=fff'),

-- 11. Brydon Carse (Retained)
('ipl','Brydon Carse','England',true,true,'bowler','right_hand','right_arm_fast',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":350,"wickets":95,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"35","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Brydon+Carse&background=FF6D00&color=fff'),

-- 12. Kamindu Mendis (Retained)
('ipl','Kamindu Mendis','Sri Lanka',true,true,'allrounder','left_hand','left_arm_orthodox',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":75,"runs":1850,"wickets":35,"average":32.5,"strike_rate":135.5,"economy":7.5,"highest_score":"85*","best_bowling":"3/15","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kamindu+Mendis&background=FF6D00&color=fff'),

-- 13. Jack Edwards
('ipl','Jack Edwards','Australia',true,false,'allrounder','right_hand','right_arm_medium',50,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":55,"runs":850,"wickets":45,"average":25.5,"strike_rate":145.5,"economy":8.5,"highest_score":"75","best_bowling":"3/22","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jack+Edwards&background=FF6D00&color=fff'),

-- 14. Eshan Malinga (Retained)
('ipl','Eshan Malinga','Sri Lanka',true,false,'bowler','right_hand','right_arm_fast_medium',50,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":15,"wickets":35,"average":22.5,"strike_rate":16.5,"economy":8.2,"highest_score":"10*","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Eshan+Malinga&background=FF6D00&color=fff'),

-- 15. Zeeshan Ansari (Retained)
('ipl','Zeeshan Ansari','India',false,false,'bowler','right_hand','right_arm_leg_spin',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":25,"wickets":18,"average":24.5,"strike_rate":18.5,"economy":7.8,"highest_score":"12*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Zeeshan+Ansari&background=FF6D00&color=fff'),

-- 16. Salil Arora
('ipl','Salil Arora','India',false,false,'wicketkeeper','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":285,"wickets":0,"average":31.5,"strike_rate":145.5,"economy":0.0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Salil+Arora&background=FF6D00&color=fff'),

-- 17. Aniket Verma (Retained)
('ipl','Aniket Verma','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":18,"runs":450,"wickets":0,"average":28.5,"strike_rate":138.5,"economy":0.0,"highest_score":"72","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Aniket+Verma&background=FF6D00&color=fff'),

-- 18. Harsh Dubey (Retained)
('ipl','Harsh Dubey','India',false,false,'bowler','left_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":45,"wickets":18,"average":22.5,"strike_rate":16.5,"economy":7.2,"highest_score":"15*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Harsh+Dubey&background=FF6D00&color=fff'),

-- 19. Smaran Ravichandran (Retained)
('ipl','Smaran Ravichandran','India',false,false,'batsman','left_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":210,"wickets":2,"average":26.5,"strike_rate":132.5,"economy":8.5,"highest_score":"55","best_bowling":"1/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Smaran+Ravichandran&background=FF6D00&color=fff'),

-- 20. Shivang Kumar
('ipl','Shivang Kumar','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":10,"wickets":12,"average":25.5,"strike_rate":18.5,"economy":8.2,"highest_score":"5*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shivang+Kumar&background=FF6D00&color=fff'),

-- 21. Sakib Hussain
('ipl','Sakib Hussain','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'KKR',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":1,"average":45.0,"strike_rate":24.0,"economy":11.2,"highest_score":"0","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":12,"runs":15,"wickets":14,"average":24.5,"strike_rate":17.5,"economy":8.5,"highest_score":"8*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sakib+Hussain&background=FF6D00&color=fff'),

-- 22. Onkar Tarmale
('ipl','Onkar Tarmale','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":150,"wickets":0,"average":25.5,"strike_rate":138.5,"economy":0.0,"highest_score":"45","best_bowling":"0/0","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Onkar+Tarmale&background=FF6D00&color=fff'),

-- 23. Amit Kumar
('ipl','Amit Kumar','India',false,false,'allrounder','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":220,"wickets":12,"average":22.5,"strike_rate":135.5,"economy":7.8,"highest_score":"42","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Amit+Kumar&background=FF6D00&color=fff'),

-- 24. Praful Hinge
('ipl','Praful Hinge','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":5,"wickets":14,"average":21.5,"strike_rate":15.5,"economy":8.0,"highest_score":"5*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Praful+Hinge&background=FF6D00&color=fff'),

-- 25. Krains Fuletra
('ipl','Krains Fuletra','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":85,"wickets":0,"average":21.5,"strike_rate":125.5,"economy":0.0,"highest_score":"35","best_bowling":"0/0","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Krains+Fuletra&background=FF6D00&color=fff'),

-- 1. Rishabh Pant (Retained/Star Signing)
('ipl','Rishabh Pant','India',false,true,'wicketkeeper','left_hand','none',200,'DC',true,
'{"matches":13,"runs":446,"wickets":0,"average":40.5,"strike_rate":155.4,"economy":0,"highest_score":"88*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'{"matches":111,"runs":3284,"wickets":0,"average":35.3,"strike_rate":148.9,"economy":0,"highest_score":"128*","best_bowling":"0/0","fifties":18,"hundreds":1}',
'{"matches":195,"runs":5120,"wickets":0,"average":33.5,"strike_rate":145.8,"economy":0,"highest_score":"128*","best_bowling":"0/0","fifties":32,"hundreds":2}',
'https://ui-avatars.com/api/?name=Rishabh+Pant&background=00E5FF&color=000'),

-- 2. Nicholas Pooran (Retained)
('ipl','Nicholas Pooran','West Indies',true,true,'wicketkeeper','left_hand','none',200,'LSG',true,
'{"matches":14,"runs":499,"wickets":0,"average":62.4,"strike_rate":178.2,"economy":0,"highest_score":"75*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'{"matches":76,"runs":1769,"wickets":0,"average":32.2,"strike_rate":162.5,"economy":0,"highest_score":"84","best_bowling":"0/0","fifties":9,"hundreds":0}',
'{"matches":325,"runs":7150,"wickets":0,"average":29.5,"strike_rate":148.5,"economy":0,"highest_score":"137*","best_bowling":"0/0","fifties":38,"hundreds":2}',
'https://ui-avatars.com/api/?name=Nicholas+Pooran&background=00E5FF&color=000'),

-- 3. Mayank Yadav (Retained)
('ipl','Mayank Yadav','India',false,true,'bowler','right_hand','right_arm_fast',100,'LSG',true,
'{"matches":4,"runs":0,"wickets":7,"average":12.1,"strike_rate":10.5,"economy":6.9,"highest_score":"0","best_bowling":"3/14","fifties":0,"hundreds":0}',
'{"matches":4,"runs":0,"wickets":7,"average":12.1,"strike_rate":10.5,"economy":6.9,"highest_score":"0","best_bowling":"3/14","fifties":0,"hundreds":0}',
'{"matches":15,"runs":5,"wickets":25,"average":16.5,"strike_rate":14.5,"economy":7.2,"highest_score":"5*","best_bowling":"4/10","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mayank+Yadav&background=00E5FF&color=000'),

-- 4. Mohammad Shami (Traded)
('ipl','Mohammad Shami','India',false,true,'bowler','right_hand','right_arm_fast',200,'GT',true,
'{"matches":17,"runs":18,"wickets":28,"average":13.8,"strike_rate":152.0,"economy":8.0,"highest_score":"3*","best_bowling":"4/14","fifties":0,"hundreds":0}',
'{"matches":110,"runs":75,"wickets":127,"average":26.7,"strike_rate":159.0,"economy":8.4,"highest_score":"9","best_bowling":"4/11","fifties":0,"hundreds":0}',
'{"matches":150,"runs":95,"wickets":180,"average":25.1,"strike_rate":155.0,"economy":8.2,"highest_score":"9","best_bowling":"4/11","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mohammad+Shami&background=00E5FF&color=000'),

-- 5. Avesh Khan (Retained)
('ipl','Avesh Khan','India',false,true,'bowler','right_hand','right_arm_fast_medium',100,'RR',true,
'{"matches":14,"runs":15,"wickets":15,"average":28.5,"strike_rate":18.5,"economy":9.5,"highest_score":"6*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'{"matches":61,"runs":45,"wickets":70,"average":26.5,"strike_rate":19.0,"economy":8.8,"highest_score":"12*","best_bowling":"4/24","fifties":0,"hundreds":0}',
'{"matches":110,"runs":85,"wickets":125,"average":24.5,"strike_rate":18.0,"economy":8.2,"highest_score":"15","best_bowling":"5/17","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Avesh+Khan&background=00E5FF&color=000'),

-- 6. Wanindu Hasaranga (Bought)
('ipl','Wanindu Hasaranga','Sri Lanka',true,true,'allrounder','right_hand','right_arm_leg_spin',200,'SRH',true,
'{"matches":15,"runs":150,"wickets":24,"average":14.0,"strike_rate":152.3,"economy":7.4,"highest_score":"35","best_bowling":"4/20","fifties":0,"hundreds":0}',
'{"matches":44,"runs":380,"wickets":60,"average":14.2,"strike_rate":142.1,"economy":7.5,"highest_score":"35","best_bowling":"4/20","fifties":0,"hundreds":0}',
'{"matches":175,"runs":1850,"wickets":235,"average":18.5,"strike_rate":138.5,"economy":6.8,"highest_score":"71*","best_bowling":"5/18","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Wanindu+Hasaranga&background=00E5FF&color=000'),

-- 7. Anrich Nortje (Bought)
('ipl','Anrich Nortje','South Africa',true,true,'bowler','right_hand','right_arm_fast',200,'DC',true,
'{"matches":10,"runs":15,"wickets":10,"average":36.5,"strike_rate":23.4,"economy":9.1,"highest_score":"12*","best_bowling":"2/39","fifties":0,"hundreds":0}',
'{"matches":40,"runs":30,"wickets":53,"average":24.1,"strike_rate":17.2,"economy":8.3,"highest_score":"12*","best_bowling":"3/33","fifties":0,"hundreds":0}',
'{"matches":125,"runs":110,"wickets":155,"average":22.5,"strike_rate":16.5,"economy":7.9,"highest_score":"15","best_bowling":"4/24","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Anrich+Nortje&background=00E5FF&color=000'),

-- 8. Josh Inglis (Bought)
('ipl','Josh Inglis','Australia',true,true,'wicketkeeper','right_hand','none',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":125,"runs":3250,"wickets":0,"average":31.5,"strike_rate":155.5,"economy":0,"highest_score":"118*","best_bowling":"0/0","fifties":22,"hundreds":3}',
'https://ui-avatars.com/api/?name=Josh+Inglis&background=00E5FF&color=000'),

-- 9. Ayush Badoni (Retained)
('ipl','Ayush Badoni','India',false,false,'batsman','right_hand','right_arm_off_spin',50,'LSG',true,
'{"matches":14,"runs":255,"wickets":0,"average":25.5,"strike_rate":142.5,"economy":0,"highest_score":"55*","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":42,"runs":634,"wickets":2,"average":22.5,"strike_rate":134.5,"economy":9.5,"highest_score":"59*","best_bowling":"1/12","fifties":4,"hundreds":0}',
'{"matches":65,"runs":1250,"wickets":15,"average":28.5,"strike_rate":138.5,"economy":8.5,"highest_score":"75*","best_bowling":"2/15","fifties":8,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ayush+Badoni&background=00E5FF&color=000'),

-- 10. Mohsin Khan (Retained)
('ipl','Mohsin Khan','India',false,false,'bowler','left_hand','left_arm_fast_medium',50,'LSG',true,
'{"matches":10,"runs":5,"wickets":10,"average":38.5,"strike_rate":22.5,"economy":10.2,"highest_score":"3*","best_bowling":"2/34","fifties":0,"hundreds":0}',
'{"matches":24,"runs":12,"wickets":27,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"5*","best_bowling":"4/16","fifties":0,"hundreds":0}',
'{"matches":45,"runs":25,"wickets":55,"average":21.5,"strike_rate":16.5,"economy":7.8,"highest_score":"12*","best_bowling":"4/16","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mohsin+Khan&background=00E5FF&color=000'),

-- 11. Aiden Markram (Retained)
('ipl','Aiden Markram','South Africa',true,true,'batsman','right_hand','right_arm_off_spin',200,'SRH',true,
'{"matches":11,"runs":220,"wickets":0,"average":24.4,"strike_rate":125.7,"economy":0,"highest_score":"50","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":44,"runs":995,"wickets":2,"average":28.4,"strike_rate":131.5,"economy":8.5,"highest_score":"68","best_bowling":"1/12","fifties":5,"hundreds":0}',
'{"matches":135,"runs":3450,"wickets":35,"average":31.5,"strike_rate":135.2,"economy":7.8,"highest_score":"100*","best_bowling":"3/22","fifties":22,"hundreds":1}',
'https://ui-avatars.com/api/?name=Aiden+Markram&background=00E5FF&color=000'),

-- 12. Mitchell Marsh (Retained)
('ipl','Mitchell Marsh','Australia',true,true,'allrounder','right_hand','right_arm_fast_medium',200,'DC',true,
'{"matches":4,"runs":61,"wickets":1,"average":15.2,"strike_rate":160.5,"economy":11.5,"highest_score":"23","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":42,"runs":666,"wickets":37,"average":19.5,"strike_rate":125.5,"economy":8.5,"highest_score":"89","best_bowling":"4/25","fifties":3,"hundreds":0}',
'{"matches":185,"runs":4550,"wickets":115,"average":28.5,"strike_rate":138.5,"economy":8.2,"highest_score":"100*","best_bowling":"4/25","fifties":25,"hundreds":2}',
'https://ui-avatars.com/api/?name=Mitchell+Marsh&background=00E5FF&color=000'),

-- 13. Abdul Samad (Retained)
('ipl','Abdul Samad','India',false,false,'batsman','right_hand','right_arm_leg_spin',50,'SRH',true,
'{"matches":15,"runs":182,"wickets":0,"average":22.7,"strike_rate":168.5,"economy":0,"highest_score":"37*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":50,"runs":577,"wickets":2,"average":19.8,"strike_rate":146.0,"economy":11.5,"highest_score":"37*","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":85,"runs":1450,"wickets":5,"average":25.5,"strike_rate":145.2,"economy":9.5,"highest_score":"65","best_bowling":"2/15","fifties":8,"hundreds":0}',
'https://ui-avatars.com/api/?name=Abdul+Samad&background=00E5FF&color=000'),

-- 14. Shahbaz Ahamad (Retained)
('ipl','Shahbaz Ahamad','India',false,true,'allrounder','left_hand','left_arm_orthodox',100,'SRH',true,
'{"matches":16,"runs":207,"wickets":3,"average":25.8,"strike_rate":138.0,"economy":9.8,"highest_score":"59*","best_bowling":"3/23","fifties":1,"hundreds":0}',
'{"matches":55,"runs":528,"wickets":17,"average":18.2,"strike_rate":124.5,"economy":9.1,"highest_score":"59*","best_bowling":"3/7","fifties":1,"hundreds":0}',
'{"matches":95,"runs":1150,"wickets":55,"average":21.5,"strike_rate":128.5,"economy":7.8,"highest_score":"65","best_bowling":"3/7","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shahbaz+Ahamad&background=00E5FF&color=000'),

-- 15. Arjun Tendulkar (Traded)
('ipl','Arjun Tendulkar','India',false,false,'allrounder','left_hand','left_arm_fast_medium',30,'MI',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":4,"runs":13,"wickets":3,"average":13.0,"strike_rate":108.3,"economy":9.3,"highest_score":"13","best_bowling":"1/9","fifties":0,"hundreds":0}',
'{"matches":15,"runs":150,"wickets":15,"average":18.5,"strike_rate":125.5,"economy":8.5,"highest_score":"35","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Arjun+Tendulkar&background=00E5FF&color=000'),

-- 16. M Siddharth (Retained)
('ipl','M Siddharth','India',false,false,'bowler','right_hand','left_arm_orthodox',50,'LSG',true,
'{"matches":5,"runs":0,"wickets":2,"average":55.5,"strike_rate":42.5,"economy":8.8,"highest_score":"0","best_bowling":"1/21","fifties":0,"hundreds":0}',
'{"matches":5,"runs":0,"wickets":2,"average":55.5,"strike_rate":42.5,"economy":8.8,"highest_score":"0","best_bowling":"1/21","fifties":0,"hundreds":0}',
'{"matches":30,"runs":15,"wickets":35,"average":22.5,"strike_rate":18.5,"economy":7.2,"highest_score":"5*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=M+Siddharth&background=00E5FF&color=000'),

-- 17. Matthew Breetzke (Retained)
('ipl','Matthew Breetzke','South Africa',true,true,'batsman','right_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":65,"runs":1850,"wickets":0,"average":31.5,"strike_rate":145.2,"economy":0,"highest_score":"85*","best_bowling":"0/0","fifties":12,"hundreds":1}',
'https://ui-avatars.com/api/?name=Matthew+Breetzke&background=00E5FF&color=000'),

-- 18. Akash Singh (Retained)
('ipl','Akash Singh','India',false,false,'bowler','right_hand','left_arm_fast_medium',30,'SRH',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":7,"runs":2,"wickets":5,"average":45.5,"strike_rate":28.5,"economy":9.8,"highest_score":"2*","best_bowling":"2/35","fifties":0,"hundreds":0}',
'{"matches":25,"runs":15,"wickets":35,"average":25.5,"strike_rate":18.5,"economy":8.5,"highest_score":"8*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Akash+Singh&background=00E5FF&color=000'),

-- 19. Arshin Kulkarni (Retained)
('ipl','Arshin Kulkarni','India',false,false,'allrounder','right_hand','right_arm_medium',30,'LSG',true,
'{"matches":2,"runs":9,"wickets":0,"average":4.5,"strike_rate":90.0,"economy":0,"highest_score":"9","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":9,"wickets":0,"average":4.5,"strike_rate":90.0,"economy":0,"highest_score":"9","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":280,"wickets":12,"average":25.5,"strike_rate":135.5,"economy":8.2,"highest_score":"55","best_bowling":"2/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Arshin+Kulkarni&background=00E5FF&color=000'),

-- 20. Himmat Singh (Retained)
('ipl','Himmat Singh','India',false,false,'batsman','right_hand','right_arm_off_spin',30,'RCB',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":1150,"wickets":0,"average":28.5,"strike_rate":138.5,"economy":0,"highest_score":"85","best_bowling":"0/0","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=Himmat+Singh&background=00E5FF&color=000'),

-- 21. Digvesh Singh (Retained)
('ipl','Digvesh Singh','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":15,"wickets":12,"average":24.5,"strike_rate":18.5,"economy":8.0,"highest_score":"5*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Digvesh+Singh&background=00E5FF&color=000'),

-- 22. Prince Yadav (Retained)
('ipl','Prince Yadav','India',false,false,'allrounder','right_hand','right_arm_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":125,"wickets":5,"average":25.5,"strike_rate":145.2,"economy":8.5,"highest_score":"45","best_bowling":"2/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Prince+Yadav&background=00E5FF&color=000'),

-- 23. Mukul Choudhary (Bought)
('ipl','Mukul Choudhary','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":10,"wickets":18,"average":21.5,"strike_rate":15.5,"economy":7.5,"highest_score":"5*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mukul+Choudhary&background=00E5FF&color=000'),

-- 24. Naman Tiwari (Bought)
('ipl','Naman Tiwari','India',false,false,'bowler','left_hand','left_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":12,"wickets":22,"average":22.5,"strike_rate":16.5,"economy":8.2,"highest_score":"8*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Naman+Tiwari&background=00E5FF&color=000'),

-- 25. Akshat Raghuwanshi (Bought)
('ipl','Akshat Raghuwanshi','India',false,false,'batsman','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":18,"runs":450,"wickets":0,"average":28.5,"strike_rate":145.5,"economy":0,"highest_score":"75","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Akshat+Raghuwanshi&background=00E5FF&color=000'),

-- 1. Shubman Gill (Retained)
('ipl','Shubman Gill','India',false,true,'batsman','right_hand','right_arm_off_spin',200,'GT',true,
'{"matches":12,"runs":426,"wickets":0,"average":38.7,"strike_rate":147.4,"economy":0,"highest_score":"104","best_bowling":"0/0","fifties":2,"hundreds":1}',
'{"matches":103,"runs":3216,"wickets":0,"average":37.8,"strike_rate":135.7,"economy":0,"highest_score":"129","best_bowling":"0/0","fifties":20,"hundreds":4}',
'{"matches":145,"runs":4580,"wickets":0,"average":36.5,"strike_rate":136.2,"economy":0,"highest_score":"129","best_bowling":"0/0","fifties":27,"hundreds":6}',
'https://ui-avatars.com/api/?name=Shubman+Gill&background=000051&color=fff'),

-- 2. Rashid Khan (Retained)
('ipl','Rashid Khan','Afghanistan',true,true,'allrounder','right_hand','right_arm_leg_spin',200,'GT',true,
'{"matches":12,"runs":102,"wickets":10,"average":14.6,"strike_rate":143.7,"economy":8.4,"highest_score":"31*","best_bowling":"2/38","fifties":0,"hundreds":0}',
'{"matches":121,"runs":545,"wickets":149,"average":20.8,"strike_rate":161.7,"economy":6.8,"highest_score":"79*","best_bowling":"4/24","fifties":1,"hundreds":0}',
'{"matches":425,"runs":2150,"wickets":580,"average":18.5,"strike_rate":145.2,"economy":6.5,"highest_score":"79*","best_bowling":"5/3","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rashid+Khan&background=000051&color=fff'),

-- 3. Jos Buttler
('ipl','Jos Buttler','England',true,true,'wicketkeeper','right_hand','none',200,'RR',true,
'{"matches":11,"runs":359,"wickets":0,"average":39.9,"strike_rate":140.8,"economy":0,"highest_score":"107*","best_bowling":"0/0","fifties":0,"hundreds":2}',
'{"matches":107,"runs":3582,"wickets":0,"average":38.1,"strike_rate":147.5,"economy":0,"highest_score":"124","best_bowling":"0/0","fifties":19,"hundreds":7}',
'{"matches":402,"runs":11560,"wickets":0,"average":34.5,"strike_rate":145.2,"economy":0,"highest_score":"124","best_bowling":"0/0","fifties":78,"hundreds":8}',
'https://ui-avatars.com/api/?name=Jos+Buttler&background=000051&color=fff'),

-- 4. Mohammed Siraj
('ipl','Mohammed Siraj','India',false,true,'bowler','right_hand','right_arm_fast_medium',200,'RCB',true,
'{"matches":14,"runs":28,"wickets":15,"average":20.1,"strike_rate":148.0,"economy":8.9,"highest_score":"12","best_bowling":"3/18","fifties":0,"hundreds":0}',
'{"matches":68,"runs":120,"wickets":72,"average":27.2,"strike_rate":152.0,"economy":9.1,"highest_score":"12","best_bowling":"3/15","fifties":0,"hundreds":0}',
'{"matches":42,"runs":58,"wickets":46,"average":25.0,"strike_rate":148.0,"economy":8.8,"highest_score":"12","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mohammed+Siraj&background=000051&color=fff'),

-- 5. Kagiso Rabada
('ipl','Kagiso Rabada','South Africa',true,true,'bowler','right_hand','right_arm_fast',200,'PBKS',true,
'{"matches":14,"runs":32,"wickets":20,"average":17.4,"strike_rate":167.0,"economy":9.0,"highest_score":"19","best_bowling":"4/21","fifties":0,"hundreds":0}',
'{"matches":77,"runs":148,"wickets":93,"average":21.5,"strike_rate":154.0,"economy":9.1,"highest_score":"25","best_bowling":"4/21","fifties":0,"hundreds":0}',
'{"matches":65,"runs":142,"wickets":78,"average":19.6,"strike_rate":160.0,"economy":8.9,"highest_score":"25","best_bowling":"4/21","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kagiso+Rabada&background=000051&color=fff'),

-- 6. Sai Sudharsan (Retained)
('ipl','Sai Sudharsan','India',false,true,'batsman','left_hand','right_arm_leg_spin',100,'GT',true,
'{"matches":12,"runs":527,"wickets":0,"average":47.9,"strike_rate":141.2,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":2,"hundreds":1}',
'{"matches":25,"runs":1034,"wickets":0,"average":47.0,"strike_rate":139.1,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":6,"hundreds":1}',
'{"matches":45,"runs":1650,"wickets":0,"average":45.5,"strike_rate":137.5,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":10,"hundreds":1}',
'https://ui-avatars.com/api/?name=Sai+Sudharsan&background=000051&color=fff'),

-- 7. Rahul Tewatia (Retained)
('ipl','Rahul Tewatia','India',false,true,'allrounder','left_hand','right_arm_leg_spin',100,'GT',true,
'{"matches":12,"runs":188,"wickets":0,"average":26.8,"strike_rate":145.7,"economy":0,"highest_score":"36*","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":93,"runs":1013,"wickets":32,"average":25.3,"strike_rate":134.5,"economy":7.9,"highest_score":"53","best_bowling":"3/24","fifties":1,"hundreds":0}',
'{"matches":145,"runs":1850,"wickets":65,"average":28.5,"strike_rate":140.2,"economy":7.5,"highest_score":"53","best_bowling":"3/24","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rahul+Tewatia&background=000051&color=fff'),

-- 8. Shahrukh Khan (Retained)
('ipl','Shahrukh Khan','India',false,false,'allrounder','right_hand','right_arm_off_spin',100,'GT',true,
'{"matches":7,"runs":127,"wickets":0,"average":21.1,"strike_rate":169.3,"economy":0,"highest_score":"58","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":40,"runs":553,"wickets":0,"average":20.4,"strike_rate":138.5,"economy":0,"highest_score":"58","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":95,"runs":1450,"wickets":5,"average":26.5,"strike_rate":145.2,"economy":8.5,"highest_score":"65","best_bowling":"2/15","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shahrukh+Khan&background=000051&color=fff'),

-- 9. Prasidh Krishna
('ipl','Prasidh Krishna','India',false,true,'bowler','right_hand','right_arm_fast_medium',100,'RR',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":51,"runs":14,"wickets":49,"average":34.8,"strike_rate":23.5,"economy":8.9,"highest_score":"4*","best_bowling":"4/30","fifties":0,"hundreds":0}',
'{"matches":75,"runs":25,"wickets":85,"average":26.5,"strike_rate":18.5,"economy":8.5,"highest_score":"10","best_bowling":"4/30","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Prasidh+Krishna&background=000051&color=fff'),

-- 10. Washington Sundar
('ipl','Washington Sundar','India',false,true,'allrounder','left_hand','right_arm_off_spin',150,'SRH',true,
'{"matches":11,"runs":60,"wickets":3,"average":15.0,"strike_rate":100.0,"economy":8.2,"highest_score":"24","best_bowling":"2/28","fifties":0,"hundreds":0}',
'{"matches":58,"runs":378,"wickets":36,"average":14.5,"strike_rate":120.0,"economy":7.5,"highest_score":"40","best_bowling":"3/16","fifties":0,"hundreds":0}',
'{"matches":135,"runs":1050,"wickets":95,"average":18.5,"strike_rate":125.0,"economy":7.2,"highest_score":"55","best_bowling":"3/16","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Washington+Sundar&background=000051&color=fff'),

-- 11. Sai Kishore
('ipl','Sai Kishore','India',false,true,'bowler','left_hand','left_arm_orthodox',100,'GT',true,
'{"matches":5,"runs":2,"wickets":7,"average":19.5,"strike_rate":14.5,"economy":8.1,"highest_score":"2*","best_bowling":"4/33","fifties":0,"hundreds":0}',
'{"matches":10,"runs":2,"wickets":13,"average":18.2,"strike_rate":15.0,"economy":7.5,"highest_score":"2*","best_bowling":"4/33","fifties":0,"hundreds":0}',
'{"matches":65,"runs":115,"wickets":75,"average":16.5,"strike_rate":18.5,"economy":5.8,"highest_score":"15","best_bowling":"4/12","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sai+Kishore&background=000051&color=fff'),

-- 12. Jason Holder
('ipl','Jason Holder','West Indies',true,true,'allrounder','right_hand','right_arm_fast_medium',200,'RR',true,
'{"matches":8,"runs":45,"wickets":6,"average":15.0,"strike_rate":115.0,"economy":9.5,"highest_score":"15","best_bowling":"2/30","fifties":0,"hundreds":0}',
'{"matches":46,"runs":257,"wickets":53,"average":12.5,"strike_rate":122.5,"economy":8.8,"highest_score":"47","best_bowling":"4/52","fifties":0,"hundreds":0}',
'{"matches":225,"runs":1850,"wickets":215,"average":18.5,"strike_rate":128.0,"economy":8.2,"highest_score":"69","best_bowling":"5/27","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jason+Holder&background=000051&color=fff'),

-- 13. Glenn Phillips
('ipl','Glenn Phillips','New Zealand',true,true,'batsman','right_hand','right_arm_off_spin',150,'SRH',true,
'{"matches":3,"runs":36,"wickets":0,"average":12.0,"strike_rate":145.0,"economy":0,"highest_score":"25","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":6,"runs":65,"wickets":0,"average":13.0,"strike_rate":125.0,"economy":0,"highest_score":"25","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":225,"runs":5850,"wickets":25,"average":32.5,"strike_rate":142.0,"economy":8.0,"highest_score":"116","best_bowling":"3/15","fifties":35,"hundreds":5}',
'https://ui-avatars.com/api/?name=Glenn+Phillips&background=000051&color=fff'),

-- 14. Tom Banton
('ipl','Tom Banton','England',true,true,'wicketkeeper','right_hand','none',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":18,"wickets":0,"average":9.0,"strike_rate":90.0,"economy":0,"highest_score":"10","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":125,"runs":3150,"wickets":0,"average":28.5,"strike_rate":145.5,"economy":0,"highest_score":"107","best_bowling":"0/0","fifties":18,"hundreds":3}',
'https://ui-avatars.com/api/?name=Tom+Banton&background=000051&color=fff'),

-- 15. Luke Wood
('ipl','Luke Wood','England',true,true,'bowler','left_hand','left_arm_fast_medium',75,'MI',true,
'{"matches":2,"runs":0,"wickets":1,"average":45.0,"strike_rate":24.0,"economy":11.5,"highest_score":"0","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":1,"average":45.0,"strike_rate":24.0,"economy":11.5,"highest_score":"0","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":110,"runs":45,"wickets":125,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"15*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Luke+Wood&background=000051&color=fff'),

-- 16. Ishant Sharma
('ipl','Ishant Sharma','India',false,true,'bowler','right_hand','right_arm_fast_medium',75,'DC',true,
'{"matches":9,"runs":0,"wickets":10,"average":26.5,"strike_rate":18.0,"economy":9.8,"highest_score":"0","best_bowling":"2/23","fifties":0,"hundreds":0}',
'{"matches":102,"runs":56,"wickets":83,"average":35.5,"strike_rate":26.5,"economy":8.1,"highest_score":"10*","best_bowling":"5/12","fifties":0,"hundreds":0}',
'{"matches":150,"runs":85,"wickets":125,"average":32.5,"strike_rate":24.5,"economy":7.8,"highest_score":"15","best_bowling":"5/12","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ishant+Sharma&background=000051&color=fff'),

-- 17. Jayant Yadav
('ipl','Jayant Yadav','India',false,true,'allrounder','right_hand','right_arm_off_spin',75,'GT',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":19,"runs":40,"wickets":8,"average":28.5,"strike_rate":115.5,"economy":6.8,"highest_score":"15","best_bowling":"1/18","fifties":0,"hundreds":0}',
'{"matches":75,"runs":450,"wickets":65,"average":25.5,"strike_rate":125.5,"economy":7.2,"highest_score":"45","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jayant+Yadav&background=000051&color=fff'),

-- 18. Arshad Khan
('ipl','Arshad Khan','India',false,false,'allrounder','left_hand','left_arm_fast_medium',30,'LSG',true,
'{"matches":3,"runs":78,"wickets":1,"average":78.0,"strike_rate":144.4,"economy":12.5,"highest_score":"58*","best_bowling":"1/34","fifties":1,"hundreds":0}',
'{"matches":9,"runs":88,"wickets":6,"average":29.3,"strike_rate":135.5,"economy":10.5,"highest_score":"58*","best_bowling":"1/22","fifties":1,"hundreds":0}',
'{"matches":25,"runs":250,"wickets":25,"average":22.5,"strike_rate":145.2,"economy":8.8,"highest_score":"58*","best_bowling":"3/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Arshad+Khan&background=000051&color=fff'),

-- 19. Anuj Rawat
('ipl','Anuj Rawat','India',false,false,'wicketkeeper','left_hand','none',30,'RCB',true,
'{"matches":5,"runs":98,"wickets":0,"average":24.5,"strike_rate":142.0,"economy":0,"highest_score":"48","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":24,"runs":318,"wickets":0,"average":18.5,"strike_rate":119.5,"economy":0,"highest_score":"66","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":65,"runs":1250,"wickets":0,"average":25.5,"strike_rate":135.2,"economy":0,"highest_score":"88","best_bowling":"0/0","fifties":8,"hundreds":0}',
'https://ui-avatars.com/api/?name=Anuj+Rawat&background=000051&color=fff'),

-- 20. Kumar Kushagra
('ipl','Kumar Kushagra','India',false,false,'wicketkeeper','right_hand','none',30,'DC',true,
'{"matches":4,"runs":3,"wickets":0,"average":1.5,"strike_rate":37.5,"economy":0,"highest_score":"2","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":4,"runs":3,"wickets":0,"average":1.5,"strike_rate":37.5,"economy":0,"highest_score":"2","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":250,"wickets":0,"average":22.5,"strike_rate":135.5,"economy":0,"highest_score":"55","best_bowling":"0/0","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kumar+Kushagra&background=000051&color=fff'),

-- 21. Manav Suthar
('ipl','Manav Suthar','India',false,false,'bowler','left_hand','left_arm_orthodox',30,'GT',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":45,"wickets":22,"average":24.5,"strike_rate":18.5,"economy":7.5,"highest_score":"15*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Manav+Suthar&background=000051&color=fff'),

-- 22. Nishant Sindhu
('ipl','Nishant Sindhu','India',false,false,'allrounder','left_hand','left_arm_orthodox',30,'CSK',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":350,"wickets":18,"average":26.5,"strike_rate":135.5,"economy":7.8,"highest_score":"45","best_bowling":"3/22","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nishant+Sindhu&background=000051&color=fff'),

-- 23. Gurnoor Brar
('ipl','Gurnoor Brar','India',false,false,'bowler','left_hand','right_arm_fast_medium',30,'PBKS',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":14.0,"highest_score":"0","best_bowling":"0/42","fifties":0,"hundreds":0}',
'{"matches":10,"runs":15,"wickets":12,"average":28.5,"strike_rate":20.5,"economy":8.5,"highest_score":"5*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Gurnoor+Brar&background=000051&color=fff'),

-- 24. Ashok Sharma
('ipl','Ashok Sharma','India',false,false,'bowler','right_hand','right_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":10,"wickets":18,"average":25.5,"strike_rate":18.5,"economy":8.2,"highest_score":"5*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ashok+Sharma&background=000051&color=fff'),

-- 25. Prithviraj Yarra
('ipl','Prithviraj Yarra','India',false,false,'bowler','left_hand','left_arm_fast_medium',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":11.5,"highest_score":"0","best_bowling":"0/22","fifties":0,"hundreds":0}',
'{"matches":25,"runs":25,"wickets":32,"average":24.5,"strike_rate":17.5,"economy":8.0,"highest_score":"10*","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Prithviraj+Yarra&background=000051&color=fff'),

-- 1. Devon Conway (Unsold)
('ipl','Devon Conway','New Zealand',true,true,'batsman','left_hand','none',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":23,"runs":924,"wickets":0,"average":48.6,"strike_rate":141.2,"economy":0.0,"highest_score":"92*","best_bowling":"0/0","fifties":9,"hundreds":0}',
'{"matches":175,"runs":6150,"wickets":0,"average":42.5,"strike_rate":131.5,"economy":0.0,"highest_score":"105*","best_bowling":"0/0","fifties":48,"hundreds":2}',
'https://ui-avatars.com/api/?name=Devon+Conway&background=BDBDBD&color=000'),

-- 2. Jake Fraser-McGurk (Unsold)
('ipl','Jake Fraser-McGurk','Australia',true,true,'batsman','right_hand','right_arm_leg_spin',200,'Unsold',true,
'{"matches":9,"runs":330,"wickets":0,"average":36.6,"strike_rate":234.0,"economy":0.0,"highest_score":"84","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":9,"runs":330,"wickets":0,"average":36.6,"strike_rate":234.0,"economy":0.0,"highest_score":"84","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":45,"runs":1150,"wickets":0,"average":31.5,"strike_rate":165.5,"economy":0.0,"highest_score":"125","best_bowling":"0/0","fifties":8,"hundreds":2}',
'https://ui-avatars.com/api/?name=Jake+Fraser-McGurk&background=BDBDBD&color=000'),

-- 3. Gus Atkinson (Unsold)
('ipl','Gus Atkinson','England',true,true,'bowler','right_hand','right_arm_fast',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":55,"runs":45,"wickets":75,"average":24.5,"strike_rate":16.5,"economy":8.5,"highest_score":"12*","best_bowling":"4/18","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Gus+Atkinson&background=BDBDBD&color=000'),

-- 4. Jamie Smith (Unsold)
('ipl','Jamie Smith','England',true,true,'wicketkeeper','right_hand','none',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":65,"runs":1550,"wickets":0,"average":28.5,"strike_rate":145.2,"economy":0.0,"highest_score":"85*","best_bowling":"0/0","fifties":10,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jamie+Smith&background=BDBDBD&color=000'),

-- 5. Gerald Coetzee (Unsold)
('ipl','Gerald Coetzee','South Africa',true,true,'bowler','right_hand','right_arm_fast',200,'Unsold',true,
'{"matches":10,"runs":16,"wickets":13,"average":26.5,"strike_rate":15.5,"economy":10.1,"highest_score":"10*","best_bowling":"4/34","fifties":0,"hundreds":0}',
'{"matches":10,"runs":16,"wickets":13,"average":26.5,"strike_rate":15.5,"economy":10.1,"highest_score":"10*","best_bowling":"4/34","fifties":0,"hundreds":0}',
'{"matches":60,"runs":125,"wickets":85,"average":22.5,"strike_rate":14.5,"economy":8.5,"highest_score":"25*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Gerald+Coetzee&background=BDBDBD&color=000'),

-- 6. Mujeeb Rahman (Unsold)
('ipl','Mujeeb Rahman','Afghanistan',true,true,'bowler','right_hand','right_arm_off_spin',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":19,"runs":10,"wickets":19,"average":31.1,"strike_rate":111.1,"economy":8.1,"highest_score":"10*","best_bowling":"3/27","fifties":0,"hundreds":0}',
'{"matches":235,"runs":150,"wickets":245,"average":24.5,"strike_rate":19.5,"economy":7.2,"highest_score":"18","best_bowling":"5/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mujeeb+Rahman&background=BDBDBD&color=000'),

-- 7. Maheesh Theekshana (Unsold)
('ipl','Maheesh Theekshana','Sri Lanka',true,true,'bowler','right_hand','right_arm_off_spin',200,'Unsold',true,
'{"matches":13,"runs":15,"wickets":11,"average":35.5,"strike_rate":26.5,"economy":8.0,"highest_score":"7*","best_bowling":"2/28","fifties":0,"hundreds":0}',
'{"matches":26,"runs":22,"wickets":23,"average":33.2,"strike_rate":25.0,"economy":7.8,"highest_score":"7*","best_bowling":"4/33","fifties":0,"hundreds":0}',
'{"matches":140,"runs":85,"wickets":150,"average":24.5,"strike_rate":20.5,"economy":6.8,"highest_score":"12","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Maheesh+Theekshana&background=BDBDBD&color=000'),

-- 8. Steve Smith (Unsold)
('ipl','Steve Smith','Australia',true,true,'batsman','right_hand','right_arm_leg_spin',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":103,"runs":2485,"wickets":0,"average":34.5,"strike_rate":128.1,"economy":0.0,"highest_score":"101","best_bowling":"0/0","fifties":11,"hundreds":1}',
'{"matches":245,"runs":6150,"wickets":0,"average":31.5,"strike_rate":125.5,"economy":0.0,"highest_score":"101","best_bowling":"0/0","fifties":35,"hundreds":1}',
'https://ui-avatars.com/api/?name=Steve+Smith&background=BDBDBD&color=000'),

-- 9. Sean Abbott (Unsold)
('ipl','Sean Abbott','Australia',true,true,'bowler','right_hand','right_arm_fast_medium',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":3,"runs":15,"wickets":0,"average":15.0,"strike_rate":125.0,"economy":11.5,"highest_score":"12","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":150,"runs":850,"wickets":165,"average":22.5,"strike_rate":15.5,"economy":8.5,"highest_score":"45","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sean+Abbott&background=BDBDBD&color=000'),

-- 10. Michael Bracewell (Unsold)
('ipl','Michael Bracewell','New Zealand',true,true,'allrounder','left_hand','right_arm_off_spin',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":58,"wickets":6,"average":14.5,"strike_rate":125.5,"economy":8.8,"highest_score":"19","best_bowling":"2/15","fifties":0,"hundreds":0}',
'{"matches":125,"runs":2850,"wickets":65,"average":31.5,"strike_rate":138.5,"economy":7.8,"highest_score":"141*","best_bowling":"3/15","fifties":15,"hundreds":2}',
'https://ui-avatars.com/api/?name=Michael+Bracewell&background=BDBDBD&color=000'),

-- 11. Daryl Mitchell (Unsold)
('ipl','Daryl Mitchell','New Zealand',true,true,'allrounder','right_hand','right_arm_medium',200,'Unsold',true,
'{"matches":13,"runs":318,"wickets":1,"average":28.9,"strike_rate":142.6,"economy":9.5,"highest_score":"63","best_bowling":"1/15","fifties":2,"hundreds":0}',
'{"matches":15,"runs":351,"wickets":1,"average":27.5,"strike_rate":138.5,"economy":9.8,"highest_score":"63","best_bowling":"1/15","fifties":2,"hundreds":0}',
'{"matches":195,"runs":4550,"wickets":75,"average":32.5,"strike_rate":135.5,"economy":8.2,"highest_score":"75*","best_bowling":"3/22","fifties":22,"hundreds":0}',
'https://ui-avatars.com/api/?name=Daryl+Mitchell&background=BDBDBD&color=000'),

-- 12. Shai Hope (Unsold)
('ipl','Shai Hope','West Indies',true,true,'wicketkeeper','right_hand','none',200,'Unsold',true,
'{"matches":9,"runs":183,"wickets":0,"average":22.8,"strike_rate":150.0,"economy":0.0,"highest_score":"41","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":9,"runs":183,"wickets":0,"average":22.8,"strike_rate":150.0,"economy":0.0,"highest_score":"41","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":1850,"wickets":0,"average":28.5,"strike_rate":135.5,"economy":0.0,"highest_score":"82*","best_bowling":"0/0","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shai+Hope&background=BDBDBD&color=000'),

-- 13. William Orourke (Unsold)
('ipl','William Orourke','New Zealand',true,true,'bowler','right_hand','right_arm_fast',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":15,"wickets":45,"average":22.5,"strike_rate":16.5,"economy":8.2,"highest_score":"5*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=William+Orourke&background=BDBDBD&color=000'),

-- 14. Tom Curran (Unsold)
('ipl','Tom Curran','England',true,true,'allrounder','right_hand','right_arm_fast_medium',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":13,"runs":127,"wickets":13,"average":18.1,"strike_rate":122.5,"economy":10.8,"highest_score":"54*","best_bowling":"2/29","fifties":1,"hundreds":0}',
'{"matches":165,"runs":1550,"wickets":185,"average":24.5,"strike_rate":18.5,"economy":8.8,"highest_score":"65*","best_bowling":"4/15","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tom+Curran&background=BDBDBD&color=000'),

-- 15. Daniel Lawrence (Unsold)
('ipl','Daniel Lawrence','England',true,true,'allrounder','right_hand','right_arm_off_spin',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":135,"runs":2850,"wickets":45,"average":28.5,"strike_rate":142.5,"economy":7.8,"highest_score":"85","best_bowling":"3/15","fifties":15,"hundreds":0}',
'https://ui-avatars.com/api/?name=Daniel+Lawrence&background=BDBDBD&color=000'),

-- 16. Alzarri Joseph (Unsold)
('ipl','Alzarri Joseph','West Indies',true,true,'bowler','right_hand','right_arm_fast',200,'Unsold',true,
'{"matches":3,"runs":0,"wickets":1,"average":115.0,"strike_rate":55.0,"economy":11.8,"highest_score":"0","best_bowling":"1/34","fifties":0,"hundreds":0}',
'{"matches":22,"runs":35,"wickets":21,"average":31.5,"strike_rate":21.5,"economy":9.5,"highest_score":"15*","best_bowling":"6/12","fifties":0,"hundreds":0}',
'{"matches":125,"runs":155,"wickets":135,"average":24.5,"strike_rate":17.5,"economy":8.5,"highest_score":"25","best_bowling":"6/12","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Alzarri+Joseph&background=BDBDBD&color=000'),

-- 17. Naveen Ul Haq (Unsold)
('ipl','Naveen Ul Haq','Afghanistan',true,true,'bowler','right_hand','right_arm_fast_medium',200,'Unsold',true,
'{"matches":10,"runs":5,"wickets":14,"average":24.5,"strike_rate":16.5,"economy":9.5,"highest_score":"5*","best_bowling":"3/30","fifties":0,"hundreds":0}',
'{"matches":18,"runs":12,"wickets":25,"average":22.5,"strike_rate":15.5,"economy":8.8,"highest_score":"8*","best_bowling":"4/38","fifties":0,"hundreds":0}',
'{"matches":165,"runs":85,"wickets":210,"average":21.5,"strike_rate":16.5,"economy":8.0,"highest_score":"15","best_bowling":"5/11","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Naveen+Ul+Haq&background=BDBDBD&color=000'),

-- 18. Liam Dawson (Unsold)
('ipl','Liam Dawson','England',true,true,'allrounder','right_hand','left_arm_orthodox',200,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":225,"runs":3150,"wickets":195,"average":24.5,"strike_rate":135.5,"economy":7.5,"highest_score":"75*","best_bowling":"4/15","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Liam+Dawson&background=BDBDBD&color=000'),

-- 19. Rahmanullah Gurbaz (Unsold)
('ipl','Rahmanullah Gurbaz','Afghanistan',true,true,'wicketkeeper','right_hand','none',150,'Unsold',true,
'{"matches":2,"runs":62,"wickets":0,"average":31.0,"strike_rate":135.5,"economy":0.0,"highest_score":"39","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":13,"runs":289,"wickets":0,"average":22.5,"strike_rate":135.5,"economy":0.0,"highest_score":"81","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":185,"runs":4550,"wickets":0,"average":26.5,"strike_rate":148.5,"economy":0.0,"highest_score":"121*","best_bowling":"0/0","fifties":32,"hundreds":2}',
'https://ui-avatars.com/api/?name=Rahmanullah+Gurbaz&background=BDBDBD&color=000'),

-- 20. Spencer Johnson (Unsold)
('ipl','Spencer Johnson','Australia',true,true,'bowler','left_hand','left_arm_fast',150,'Unsold',true,
'{"matches":5,"runs":1,"wickets":4,"average":38.5,"strike_rate":24.0,"economy":9.6,"highest_score":"1*","best_bowling":"1/22","fifties":0,"hundreds":0}',
'{"matches":5,"runs":1,"wickets":4,"average":38.5,"strike_rate":24.0,"economy":9.6,"highest_score":"1*","best_bowling":"1/22","fifties":0,"hundreds":0}',
'{"matches":45,"runs":15,"wickets":55,"average":22.5,"strike_rate":16.5,"economy":8.2,"highest_score":"5*","best_bowling":"4/10","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Spencer+Johnson&background=BDBDBD&color=000'),

-- 21. Saqib Mahmood (Unsold - 1.5 CR)
('ipl','Saqib Mahmood','England',true,true,'bowler','right_hand','right_arm_fast',150,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":85,"wickets":105,"average":24.5,"strike_rate":16.5,"economy":8.2,"highest_score":"12*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Saqib+Mahmood&background=BDBDBD&color=000'),

-- 22. Umesh Yadav (Unsold - 1.5 CR)
('ipl','Umesh Yadav','India',false,true,'bowler','right_hand','right_arm_fast',150,'Unsold',true,
'{"matches":7,"runs":12,"wickets":8,"average":28.5,"strike_rate":18.5,"economy":10.2,"highest_score":"5","best_bowling":"2/22","fifties":0,"hundreds":0}',
'{"matches":148,"runs":185,"wickets":144,"average":30.2,"strike_rate":21.5,"economy":8.4,"highest_score":"24","best_bowling":"4/23","fifties":0,"hundreds":0}',
'{"matches":205,"runs":285,"wickets":210,"average":27.5,"strike_rate":19.5,"economy":8.1,"highest_score":"24","best_bowling":"4/23","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Umesh+Yadav&background=BDBDBD&color=000'),

-- 23. Riley Meredith (Unsold - 1.5 CR)
('ipl','Riley Meredith','Australia',true,true,'bowler','right_hand','right_arm_fast',150,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":13,"runs":12,"wickets":14,"average":33.5,"strike_rate":22.5,"economy":9.0,"highest_score":"5*","best_bowling":"2/24","fifties":0,"hundreds":0}',
'{"matches":95,"runs":45,"wickets":120,"average":24.5,"strike_rate":17.5,"economy":8.5,"highest_score":"12*","best_bowling":"4/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Riley+Meredith&background=BDBDBD&color=000'),

-- 24. Jhye Richardson (Unsold - 1.5 CR)
('ipl','Jhye Richardson','Australia',true,true,'bowler','right_hand','right_arm_fast',150,'Unsold',true,
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":11.5,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":4,"runs":15,"wickets":3,"average":39.5,"strike_rate":26.5,"economy":10.6,"highest_score":"12*","best_bowling":"2/41","fifties":0,"hundreds":0}',
'{"matches":110,"runs":285,"wickets":135,"average":23.5,"strike_rate":17.5,"economy":7.8,"highest_score":"22","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jhye+Richardson&background=BDBDBD&color=000'),

-- 25. Jason Behrendorff (Unsold - 1.5 CR)
('ipl','Jason Behrendorff','Australia',true,true,'bowler','right_hand','left_arm_fast_medium',150,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":17,"runs":15,"wickets":19,"average":28.5,"strike_rate":19.5,"economy":8.8,"highest_score":"8*","best_bowling":"3/23","fifties":0,"hundreds":0}',
'{"matches":145,"runs":125,"wickets":165,"average":22.5,"strike_rate":18.5,"economy":7.6,"highest_score":"15","best_bowling":"4/21","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jason+Behrendorff&background=BDBDBD&color=000'),

-- 26. Ben Sears (Unsold - 1.5 CR)
('ipl','Ben Sears','New Zealand',true,true,'bowler','right_hand','right_arm_fast_medium',150,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":65,"runs":25,"wickets":85,"average":24.5,"strike_rate":16.5,"economy":8.2,"highest_score":"8*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ben+Sears&background=BDBDBD&color=000'),

-- 27. Beau Webster (Unsold - 1.25 CR)
('ipl','Beau Webster','Australia',true,true,'allrounder','right_hand','right_arm_medium',125,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":1650,"wickets":45,"average":28.5,"strike_rate":135.5,"economy":8.2,"highest_score":"78*","best_bowling":"3/15","fifties":10,"hundreds":0}',
'https://ui-avatars.com/api/?name=Beau+Webster&background=BDBDBD&color=000'),

-- 28. Roston Chase (Unsold - 1.25 CR)
('ipl','Roston Chase','West Indies',true,true,'allrounder','right_hand','right_arm_off_spin',125,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":145,"runs":2850,"wickets":110,"average":26.5,"strike_rate":128.5,"economy":7.2,"highest_score":"68","best_bowling":"3/15","fifties":15,"hundreds":0}',
'https://ui-avatars.com/api/?name=Roston+Chase&background=BDBDBD&color=000'),

-- 29. Kyle Mayers (Unsold - 1.25 CR)
('ipl','Kyle Mayers','West Indies',true,true,'allrounder','left_hand','right_arm_medium',125,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":13,"runs":379,"wickets":0,"average":29.1,"strike_rate":144.1,"economy":0.0,"highest_score":"73","best_bowling":"0/0","fifties":4,"hundreds":0}',
'{"matches":145,"runs":3150,"wickets":35,"average":28.5,"strike_rate":142.5,"economy":8.5,"highest_score":"85","best_bowling":"2/15","fifties":18,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kyle+Mayers&background=BDBDBD&color=000'),

-- 30. Olly Stone (Unsold - 1.25 CR)
('ipl','Olly Stone','England',true,true,'bowler','right_hand','right_arm_fast',125,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":75,"runs":85,"wickets":85,"average":24.5,"strike_rate":16.5,"economy":8.8,"highest_score":"15","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Olly+Stone&background=BDBDBD&color=000'),

-- 31. Kyle Verreynne (Unsold - 1.25 CR) - Uncapped in IPL
('ipl','Kyle Verreynne','South Africa',true,false,'wicketkeeper','right_hand','none',125,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":1850,"wickets":0,"average":28.5,"strike_rate":135.5,"economy":0.0,"highest_score":"85*","best_bowling":"0/0","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kyle+Verreynne&background=BDBDBD&color=000'),

-- 32. Wiaan Mulder (Unsold - 1 CR)
('ipl','Wiaan Mulder','South Africa',true,true,'allrounder','right_hand','right_arm_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":95,"runs":1450,"wickets":65,"average":24.5,"strike_rate":130.5,"economy":8.2,"highest_score":"65","best_bowling":"3/15","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=Wiaan+Mulder&background=BDBDBD&color=000'),

-- 33. Jonny Bairstow (Unsold - 1 CR)
('ipl','Jonny Bairstow','England',true,true,'wicketkeeper','right_hand','none',100,'Unsold',true,
'{"matches":11,"runs":298,"wickets":0,"average":29.8,"strike_rate":152.8,"economy":0.0,"highest_score":"108*","best_bowling":"0/0","fifties":1,"hundreds":1}',
'{"matches":50,"runs":1589,"wickets":0,"average":34.5,"strike_rate":142.6,"economy":0.0,"highest_score":"114","best_bowling":"0/0","fifties":9,"hundreds":2}',
'{"matches":180,"runs":4550,"wickets":0,"average":31.2,"strike_rate":138.5,"economy":0.0,"highest_score":"114","best_bowling":"0/0","fifties":25,"hundreds":3}',
'https://ui-avatars.com/api/?name=Jonny+Bairstow&background=BDBDBD&color=000'),

-- 34. Fazalhaq Farooqi (Unsold - 1 CR)
('ipl','Fazalhaq Farooqi','Afghanistan',true,true,'bowler','right_hand','left_arm_fast_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":7,"runs":2,"wickets":6,"average":35.5,"strike_rate":24.5,"economy":8.8,"highest_score":"2*","best_bowling":"2/32","fifties":0,"hundreds":0}',
'{"matches":115,"runs":25,"wickets":135,"average":22.5,"strike_rate":17.5,"economy":7.6,"highest_score":"5*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Fazalhaq+Farooqi&background=BDBDBD&color=000'),

-- 35. Reeza Hendricks (Unsold - 1 CR)
('ipl','Reeza Hendricks','South Africa',true,true,'batsman','right_hand','right_arm_off_spin',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":225,"runs":6150,"wickets":5,"average":32.5,"strike_rate":132.5,"economy":8.5,"highest_score":"105*","best_bowling":"1/15","fifties":45,"hundreds":4}',
'https://ui-avatars.com/api/?name=Reeza+Hendricks&background=BDBDBD&color=000'),

-- 36. Daniel Sams (Unsold - 1 CR)
('ipl','Daniel Sams','Australia',true,true,'allrounder','right_hand','left_arm_fast_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":16,"runs":44,"wickets":14,"average":32.5,"strike_rate":18.5,"economy":9.5,"highest_score":"15","best_bowling":"4/30","fifties":0,"hundreds":0}',
'{"matches":185,"runs":1850,"wickets":195,"average":24.5,"strike_rate":145.2,"economy":8.8,"highest_score":"85","best_bowling":"4/15","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Daniel+Sams&background=BDBDBD&color=000'),

-- 37. Kusal Perera (Unsold - 1 CR)
('ipl','Kusal Perera','Sri Lanka',true,true,'wicketkeeper','left_hand','none',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":14,"wickets":0,"average":7.0,"strike_rate":105.0,"economy":0.0,"highest_score":"14","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":165,"runs":3850,"wickets":0,"average":26.5,"strike_rate":138.5,"economy":0.0,"highest_score":"104*","best_bowling":"0/0","fifties":22,"hundreds":1}',
'https://ui-avatars.com/api/?name=Kusal+Perera&background=BDBDBD&color=000'),

-- 38. Mohammad Waqar Salamkheil (Unsold - 1 CR)
('ipl','Mohammad Waqar Salamkheil','Afghanistan',true,true,'bowler','right_hand','left_arm_wrist_spin',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":65,"runs":25,"wickets":85,"average":21.5,"strike_rate":16.5,"economy":7.2,"highest_score":"10*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mohammad+Waqar+Salamkheil&background=BDBDBD&color=000'),

-- 39. George Linde (Unsold - 1 CR)
('ipl','George Linde','South Africa',true,true,'allrounder','left_hand','left_arm_orthodox',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":145,"runs":1650,"wickets":135,"average":25.5,"strike_rate":135.5,"economy":7.5,"highest_score":"65","best_bowling":"3/15","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=George+Linde&background=BDBDBD&color=000'),

-- 40. Gulbadin Naib (Unsold - 1 CR)
('ipl','Gulbadin Naib','Afghanistan',true,true,'allrounder','right_hand','right_arm_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":10,"wickets":0,"average":5.0,"strike_rate":95.5,"economy":10.5,"highest_score":"10","best_bowling":"0/15","fifties":0,"hundreds":0}',
'{"matches":165,"runs":2150,"wickets":110,"average":22.5,"strike_rate":135.5,"economy":8.2,"highest_score":"75*","best_bowling":"3/22","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Gulbadin+Naib&background=BDBDBD&color=000'),

-- 41. William Sutherland (Unsold - 1 CR)
('ipl','William Sutherland','Australia',true,true,'allrounder','right_hand','right_arm_fast_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":350,"wickets":42,"average":22.5,"strike_rate":135.5,"economy":8.5,"highest_score":"55","best_bowling":"3/22","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=William+Sutherland&background=BDBDBD&color=000'),

-- 42. Charith Asalanka (Unsold - 1 CR)
('ipl','Charith Asalanka','Sri Lanka',true,true,'batsman','left_hand','right_arm_off_spin',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":115,"runs":2550,"wickets":12,"average":28.5,"strike_rate":138.5,"economy":7.8,"highest_score":"80*","best_bowling":"2/10","fifties":15,"hundreds":0}',
'https://ui-avatars.com/api/?name=Charith+Asalanka&background=BDBDBD&color=000'),

-- 43. Dwaine Pretorius (Unsold - 1 CR)
('ipl','Dwaine Pretorius','South Africa',true,true,'allrounder','right_hand','right_arm_fast_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":7,"runs":44,"wickets":6,"average":11.0,"strike_rate":157.1,"economy":9.5,"highest_score":"22","best_bowling":"2/30","fifties":0,"hundreds":0}',
'{"matches":210,"runs":2850,"wickets":185,"average":22.5,"strike_rate":145.5,"economy":8.8,"highest_score":"77*","best_bowling":"4/15","fifties":10,"hundreds":0}',
'https://ui-avatars.com/api/?name=Dwaine+Pretorius&background=BDBDBD&color=000'),

-- 44. Joshua Tongue (Unsold - 1 CR)
('ipl','Joshua Tongue','England',true,true,'bowler','right_hand','right_arm_fast_medium',100,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":15,"wickets":32,"average":26.5,"strike_rate":18.5,"economy":8.5,"highest_score":"8*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Joshua+Tongue&background=BDBDBD&color=000'),

-- 45. Deepak Hooda (Unsold - 75 Lakhs)
('ipl','Deepak Hooda','India',false,true,'allrounder','right_hand','right_arm_off_spin',75,'Unsold',true,
'{"matches":11,"runs":145,"wickets":0,"average":18.1,"strike_rate":138.0,"economy":0.0,"highest_score":"50","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":118,"runs":1470,"wickets":10,"average":18.5,"strike_rate":129.5,"economy":8.5,"highest_score":"64","best_bowling":"2/16","fifties":8,"hundreds":0}',
'{"matches":195,"runs":3450,"wickets":25,"average":24.5,"strike_rate":135.2,"economy":8.2,"highest_score":"104","best_bowling":"3/15","fifties":18,"hundreds":1}',
'https://ui-avatars.com/api/?name=Deepak+Hooda&background=BDBDBD&color=000'),

-- 46. K.S. Bharat (Unsold - 75 Lakhs)
('ipl','K.S. Bharat','India',false,true,'wicketkeeper','right_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":199,"wickets":0,"average":28.4,"strike_rate":122.1,"economy":0.0,"highest_score":"78*","best_bowling":"0/0","fifties":1,"hundreds":0}',
'{"matches":75,"runs":1450,"wickets":0,"average":26.5,"strike_rate":125.5,"economy":0.0,"highest_score":"78*","best_bowling":"0/0","fifties":6,"hundreds":0}',
'https://ui-avatars.com/api/?name=K.S.+Bharat&background=BDBDBD&color=000'),

-- 47. Mayank Agarwal (Unsold - 75 Lakhs)
('ipl','Mayank Agarwal','India',false,true,'batsman','right_hand','none',75,'Unsold',true,
'{"matches":4,"runs":64,"wickets":0,"average":16.0,"strike_rate":112.2,"economy":0.0,"highest_score":"32","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":127,"runs":2665,"wickets":0,"average":22.5,"strike_rate":133.5,"economy":0.0,"highest_score":"106","best_bowling":"0/0","fifties":13,"hundreds":1}',
'{"matches":195,"runs":4550,"wickets":0,"average":25.5,"strike_rate":135.2,"economy":0.0,"highest_score":"115","best_bowling":"0/0","fifties":25,"hundreds":2}',
'https://ui-avatars.com/api/?name=Mayank+Agarwal&background=BDBDBD&color=000'),

-- 48. Sediqullah Atal (Unsold - 75 Lakhs)
('ipl','Sediqullah Atal','Afghanistan',true,true,'batsman','left_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":650,"wickets":0,"average":32.5,"strike_rate":135.5,"economy":0.0,"highest_score":"75*","best_bowling":"0/0","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sediqullah+Atal&background=BDBDBD&color=000'),

-- 49. Ackeem Auguste (Unsold - 75 Lakhs)
('ipl','Ackeem Auguste','West Indies',true,true,'batsman','left_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":280,"wickets":0,"average":24.5,"strike_rate":125.5,"economy":0.0,"highest_score":"55","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Ackeem+Auguste&background=BDBDBD&color=000'),

-- 50. Tim Robinson (Unsold - 75 Lakhs)
('ipl','Tim Robinson','New Zealand',true,true,'batsman','right_hand','right_arm_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":22,"runs":550,"wickets":0,"average":28.5,"strike_rate":145.2,"economy":0.0,"highest_score":"85","best_bowling":"0/0","fifties":4,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tim+Robinson&background=BDBDBD&color=000'),

-- 51. Dasun Shanaka (Unsold - 75 Lakhs)
('ipl','Dasun Shanaka','Sri Lanka',true,true,'allrounder','right_hand','right_arm_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":3,"runs":26,"wickets":0,"average":8.6,"strike_rate":118.1,"economy":0.0,"highest_score":"17","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":205,"runs":4150,"wickets":75,"average":26.5,"strike_rate":142.5,"economy":8.5,"highest_score":"88*","best_bowling":"3/15","fifties":18,"hundreds":0}',
'https://ui-avatars.com/api/?name=Dasun+Shanaka&background=BDBDBD&color=000'),

-- 52. Benjamin McDermott (Unsold - 75 Lakhs)
('ipl','Benjamin McDermott','Australia',true,true,'wicketkeeper','right_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":145,"runs":3850,"wickets":0,"average":31.5,"strike_rate":138.5,"economy":0.0,"highest_score":"127","best_bowling":"0/0","fifties":22,"hundreds":3}',
'https://ui-avatars.com/api/?name=Benjamin+McDermott&background=BDBDBD&color=000'),

-- 53. Kusal Mendis (Unsold - 75 Lakhs)
('ipl','Kusal Mendis','Sri Lanka',true,true,'wicketkeeper','right_hand','none',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":135,"runs":3550,"wickets":0,"average":28.5,"strike_rate":135.5,"economy":0.0,"highest_score":"88*","best_bowling":"0/0","fifties":25,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kusal+Mendis&background=BDBDBD&color=000'),

-- 54. Chetan Sakariya (Unsold - 75 Lakhs)
('ipl','Chetan Sakariya','India',false,true,'bowler','left_hand','left_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":19,"runs":16,"wickets":20,"average":29.5,"strike_rate":21.5,"economy":8.4,"highest_score":"5*","best_bowling":"3/31","fifties":0,"hundreds":0}',
'{"matches":55,"runs":45,"wickets":65,"average":25.5,"strike_rate":18.5,"economy":7.8,"highest_score":"12*","best_bowling":"5/11","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Chetan+Sakariya&background=BDBDBD&color=000'),

-- 55. Qais Ahmad (Unsold - 75 Lakhs)
('ipl','Qais Ahmad','Afghanistan',true,true,'bowler','right_hand','right_arm_leg_spin',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":145,"runs":450,"wickets":165,"average":22.5,"strike_rate":16.5,"economy":7.5,"highest_score":"25*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Qais+Ahmad&background=BDBDBD&color=000'),

-- 56. Rishad Hossain (Unsold - 75 Lakhs)
('ipl','Rishad Hossain','Bangladesh',true,true,'bowler','right_hand','right_arm_leg_spin',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":180,"wickets":45,"average":21.5,"strike_rate":15.5,"economy":7.2,"highest_score":"35","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rishad+Hossain&background=BDBDBD&color=000'),

-- 57. Viyaskanth Vijayakanth (Unsold - 75 Lakhs)
('ipl','Viyaskanth Vijayakanth','Sri Lanka',true,true,'bowler','right_hand','right_arm_leg_spin',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":1,"average":27.0,"strike_rate":24.0,"economy":6.7,"highest_score":"0","best_bowling":"1/27","fifties":0,"hundreds":0}',
'{"matches":45,"runs":15,"wickets":55,"average":20.5,"strike_rate":16.5,"economy":6.8,"highest_score":"5*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Viyaskanth+Vijayakanth&background=BDBDBD&color=000'),

-- 58. Rehan Ahmed (Unsold - 75 Lakhs)
('ipl','Rehan Ahmed','England',true,true,'allrounder','right_hand','right_arm_leg_spin',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":65,"runs":650,"wickets":75,"average":24.5,"strike_rate":15.5,"economy":7.8,"highest_score":"45","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rehan+Ahmed&background=BDBDBD&color=000'),

-- 59. Bevon-John Jacobs (Unsold - 75 Lakhs)
('ipl','Bevon-John Jacobs','South Africa',true,true,'batsman','left_hand','right_arm_leg_spin',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":280,"wickets":0,"average":26.5,"strike_rate":142.5,"economy":0.0,"highest_score":"65","best_bowling":"0/0","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Bevon-John+Jacobs&background=BDBDBD&color=000'),

-- 60. Taskin Ahmed (Unsold - 75 Lakhs)
('ipl','Taskin Ahmed','Bangladesh',true,true,'bowler','right_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":150,"runs":125,"wickets":175,"average":23.5,"strike_rate":17.5,"economy":8.2,"highest_score":"15*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Taskin+Ahmed&background=BDBDBD&color=000'),

-- 61. Richard Gleeson (Unsold - 75 Lakhs)
('ipl','Richard Gleeson','England',true,true,'bowler','right_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":1,"average":65.0,"strike_rate":42.0,"economy":9.5,"highest_score":"0","best_bowling":"1/25","fifties":0,"hundreds":0}',
'{"matches":95,"runs":45,"wickets":105,"average":24.5,"strike_rate":17.5,"economy":8.2,"highest_score":"10*","best_bowling":"5/33","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Richard+Gleeson&background=BDBDBD&color=000'),

-- 62. Shamar Joseph (Unsold - 75 Lakhs)
('ipl','Shamar Joseph','West Indies',true,true,'bowler','left_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":11.5,"highest_score":"0","best_bowling":"0/47","fifties":0,"hundreds":0}',
'{"matches":12,"runs":15,"wickets":18,"average":22.5,"strike_rate":16.5,"economy":8.5,"highest_score":"5*","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shamar+Joseph&background=BDBDBD&color=000'),

-- 63. Navdeep Saini (Unsold - 75 Lakhs)
('ipl','Navdeep Saini','India',false,true,'bowler','right_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":32,"runs":32,"wickets":23,"average":43.5,"strike_rate":29.5,"economy":8.8,"highest_score":"11*","best_bowling":"2/24","fifties":0,"hundreds":0}',
'{"matches":75,"runs":85,"wickets":75,"average":28.5,"strike_rate":21.5,"economy":8.2,"highest_score":"22","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Navdeep+Saini&background=BDBDBD&color=000'),

-- 64. Muhammad Abbas (Unsold - 75 Lakhs)
('ipl','Muhammad Abbas','Afghanistan',true,true,'bowler','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":15,"wickets":32,"average":24.5,"strike_rate":18.5,"economy":8.0,"highest_score":"8*","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Muhammad+Abbas&background=BDBDBD&color=000'),

-- 65. George Garton (Unsold - 75 Lakhs)
('ipl','George Garton','England',true,true,'allrounder','left_hand','left_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":1,"average":27.0,"strike_rate":18.0,"economy":9.0,"highest_score":"0","best_bowling":"1/27","fifties":0,"hundreds":0}',
'{"matches":65,"runs":280,"wickets":75,"average":26.5,"strike_rate":18.5,"economy":8.5,"highest_score":"45","best_bowling":"4/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=George+Garton&background=BDBDBD&color=000'),

-- 66. Nathan Smith (Unsold - 75 Lakhs)
('ipl','Nathan Smith','New Zealand',true,true,'allrounder','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":250,"wickets":42,"average":22.5,"strike_rate":16.5,"economy":7.8,"highest_score":"55","best_bowling":"4/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nathan+Smith&background=BDBDBD&color=000'),

-- 67. Dunith Wellalage (Unsold - 75 Lakhs)
('ipl','Dunith Wellalage','Sri Lanka',true,true,'allrounder','left_hand','left_arm_orthodox',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":380,"wickets":35,"average":25.5,"strike_rate":18.5,"economy":7.2,"highest_score":"45*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Dunith+Wellalage&background=BDBDBD&color=000'),

-- 68. Tanzim Hasan Sakib (Unsold - 75 Lakhs)
('ipl','Tanzim Hasan Sakib','Bangladesh',true,true,'bowler','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":15,"wickets":32,"average":21.5,"strike_rate":15.5,"economy":7.8,"highest_score":"5*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tanzim+Hasan+Sakib&background=BDBDBD&color=000'),

-- 69. Matthew Potts (Unsold - 75 Lakhs)
('ipl','Matthew Potts','England',true,true,'bowler','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":25,"wickets":55,"average":24.5,"strike_rate":17.5,"economy":8.2,"highest_score":"12*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Matthew+Potts&background=BDBDBD&color=000'),

-- 70. Nahid Rana (Unsold - 75 Lakhs)
('ipl','Nahid Rana','Bangladesh',true,true,'bowler','right_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":5,"wickets":18,"average":22.5,"strike_rate":15.5,"economy":8.5,"highest_score":"5*","best_bowling":"3/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nahid+Rana&background=BDBDBD&color=000'),

-- 71. Sandeep Warrier (Unsold - 75 Lakhs)
('ipl','Sandeep Warrier','India',false,true,'bowler','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":0,"wickets":7,"average":38.5,"strike_rate":24.5,"economy":9.1,"highest_score":"0","best_bowling":"3/15","fifties":0,"hundreds":0}',
'{"matches":75,"runs":15,"wickets":70,"average":25.5,"strike_rate":20.5,"economy":7.5,"highest_score":"5*","best_bowling":"3/12","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sandeep+Warrier&background=BDBDBD&color=000'),

-- 72. Wesley Agar (Unsold - 75 Lakhs)
('ipl','Wesley Agar','Australia',true,true,'bowler','right_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":65,"runs":45,"wickets":75,"average":24.5,"strike_rate":18.5,"economy":8.2,"highest_score":"15","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Wesley+Agar&background=BDBDBD&color=000'),

-- 73. Binura Fernando (Unsold - 75 Lakhs)
('ipl','Binura Fernando','Sri Lanka',true,true,'bowler','right_hand','left_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":55,"runs":25,"wickets":62,"average":21.5,"strike_rate":16.5,"economy":7.8,"highest_score":"8*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Binura+Fernando&background=BDBDBD&color=000'),

-- 74. Md Shoriful Islam (Unsold - 75 Lakhs)
('ipl','Md Shoriful Islam','Bangladesh',true,true,'bowler','left_hand','left_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":35,"wickets":95,"average":22.5,"strike_rate":17.5,"economy":8.0,"highest_score":"12*","best_bowling":"4/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Md+Shoriful+Islam&background=BDBDBD&color=000'),

-- 75. Joshua Little (Unsold - 75 Lakhs)
('ipl','Joshua Little','Ireland',true,true,'bowler','right_hand','left_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":11,"runs":0,"wickets":7,"average":45.5,"strike_rate":28.5,"economy":9.5,"highest_score":"0","best_bowling":"2/25","fifties":0,"hundreds":0}',
'{"matches":115,"runs":25,"wickets":135,"average":21.5,"strike_rate":16.5,"economy":7.8,"highest_score":"5*","best_bowling":"4/20","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Joshua+Little&background=BDBDBD&color=000'),

-- 76. Obed McCoy (Unsold - 75 Lakhs)
('ipl','Obed McCoy','West Indies',true,true,'bowler','left_hand','left_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":12,"wickets":11,"average":25.5,"strike_rate":16.5,"economy":9.1,"highest_score":"8*","best_bowling":"6/15","fifties":0,"hundreds":0}',
'{"matches":85,"runs":35,"wickets":105,"average":20.5,"strike_rate":14.5,"economy":8.2,"highest_score":"12*","best_bowling":"6/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Obed+McCoy&background=BDBDBD&color=000'),

-- 77. Billy Stanlake (Unsold - 75 Lakhs)
('ipl','Billy Stanlake','Australia',true,true,'bowler','left_hand','right_arm_fast',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":6,"runs":5,"wickets":7,"average":28.5,"strike_rate":20.5,"economy":8.5,"highest_score":"5*","best_bowling":"2/21","fifties":0,"hundreds":0}',
'{"matches":75,"runs":15,"wickets":85,"average":25.5,"strike_rate":18.5,"economy":8.0,"highest_score":"8*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Billy+Stanlake&background=BDBDBD&color=000'),

-- 78. Eathan Bosch (Unsold - 75 Lakhs)
('ipl','Eathan Bosch','South Africa',true,true,'allrounder','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":450,"wickets":55,"average":24.5,"strike_rate":135.5,"economy":8.2,"highest_score":"65","best_bowling":"3/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Eathan+Bosch&background=BDBDBD&color=000'),

-- 79. Chris Green (Unsold - 75 Lakhs)
('ipl','Chris Green','Australia',true,true,'allrounder','right_hand','right_arm_off_spin',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":10.0,"highest_score":"0","best_bowling":"0/25","fifties":0,"hundreds":0}',
'{"matches":195,"runs":1250,"wickets":165,"average":25.5,"strike_rate":128.5,"economy":7.2,"highest_score":"45*","best_bowling":"4/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Chris+Green&background=BDBDBD&color=000'),

-- 80. Blessing Muzarabani (Unsold - 75 Lakhs)
('ipl','Blessing Muzarabani','Zimbabwe',true,true,'bowler','right_hand','right_arm_fast_medium',75,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":85,"runs":25,"wickets":95,"average":22.5,"strike_rate":16.5,"economy":7.8,"highest_score":"10*","best_bowling":"4/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Blessing+Muzarabani&background=BDBDBD&color=000'),

-- 81. Mahipal Lomror (Unsold - 50 Lakhs)
('ipl','Mahipal Lomror','India',false,false,'allrounder','left_hand','left_arm_orthodox',50,'Unsold',true,
'{"matches":10,"runs":125,"wickets":0,"average":15.6,"strike_rate":183.8,"economy":0.0,"highest_score":"33","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":40,"runs":527,"wickets":1,"average":16.4,"strike_rate":142.5,"economy":8.5,"highest_score":"54*","best_bowling":"1/22","fifties":1,"hundreds":0}',
'{"matches":95,"runs":1850,"wickets":45,"average":25.5,"strike_rate":140.2,"economy":7.8,"highest_score":"78*","best_bowling":"3/15","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Mahipal+Lomror&background=BDBDBD&color=000'),

-- 82. Karn Sharma (Unsold - 50 Lakhs)
('ipl','Karn Sharma','India',false,false,'bowler','left_hand','right_arm_leg_spin',50,'Unsold',true,
'{"matches":9,"runs":28,"wickets":7,"average":41.2,"strike_rate":23.5,"economy":10.5,"highest_score":"20","best_bowling":"2/29","fifties":0,"hundreds":0}',
'{"matches":83,"runs":346,"wickets":76,"average":28.5,"strike_rate":20.5,"economy":8.2,"highest_score":"39*","best_bowling":"4/16","fifties":0,"hundreds":0}',
'{"matches":165,"runs":850,"wickets":145,"average":25.5,"strike_rate":19.5,"economy":7.8,"highest_score":"45","best_bowling":"5/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Karn+Sharma&background=BDBDBD&color=000'),

-- 83. Joe Clarke (Unsold - 50 Lakhs)
('ipl','Joe Clarke','England',true,false,'wicketkeeper','right_hand','none',50,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":185,"runs":4850,"wickets":0,"average":28.5,"strike_rate":148.5,"economy":0.0,"highest_score":"136*","best_bowling":"0/0","fifties":32,"hundreds":4}',
'https://ui-avatars.com/api/?name=Joe+Clarke&background=BDBDBD&color=000'),

-- 84. Rajvardhan Hangargekar (Unsold - 40 Lakhs)
('ipl','Rajvardhan Hangargekar','India',false,false,'allrounder','right_hand','right_arm_fast_medium',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":2,"runs":0,"wickets":3,"average":20.0,"strike_rate":12.0,"economy":10.0,"highest_score":"0","best_bowling":"3/36","fifties":0,"hundreds":0}',
'{"matches":15,"runs":125,"wickets":15,"average":22.5,"strike_rate":155.0,"economy":8.5,"highest_score":"35","best_bowling":"3/36","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Rajvardhan+Hangargekar&background=BDBDBD&color=000'),

-- 85. K.M Asif (Unsold - 40 Lakhs)
('ipl','K.M Asif','India',false,false,'bowler','right_hand','right_arm_fast_medium',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":7,"runs":0,"wickets":7,"average":32.5,"strike_rate":20.5,"economy":9.5,"highest_score":"0","best_bowling":"2/25","fifties":0,"hundreds":0}',
'{"matches":25,"runs":15,"wickets":28,"average":28.5,"strike_rate":18.5,"economy":8.8,"highest_score":"5*","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=K.M+Asif&background=BDBDBD&color=000'),

-- 86. Shubham Agrawal (Unsold - 40 Lakhs)
('ipl','Shubham Agrawal','India',false,false,'allrounder','right_hand','right_arm_leg_spin',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":110,"wickets":14,"average":22.5,"strike_rate":125.5,"economy":7.8,"highest_score":"35","best_bowling":"3/22","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Shubham+Agrawal&background=BDBDBD&color=000'),

-- 87. Jalaj Saxena (Unsold - 40 Lakhs)
('ipl','Jalaj Saxena','India',false,false,'allrounder','right_hand','right_arm_off_spin',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":9.0,"highest_score":"0","best_bowling":"0/27","fifties":0,"hundreds":0}',
'{"matches":65,"runs":650,"wickets":65,"average":24.5,"strike_rate":125.5,"economy":7.2,"highest_score":"55","best_bowling":"3/15","fifties":2,"hundreds":0}',
'https://ui-avatars.com/api/?name=Jalaj+Saxena&background=BDBDBD&color=000'),

-- 88. Tom Moores (Unsold - 40 Lakhs)
('ipl','Tom Moores','England',true,false,'wicketkeeper','left_hand','none',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":115,"runs":1850,"wickets":0,"average":26.5,"strike_rate":138.5,"economy":0.0,"highest_score":"85*","best_bowling":"0/0","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tom+Moores&background=BDBDBD&color=000'),

-- 89. Arab Gul (Unsold - 40 Lakhs)
('ipl','Arab Gul','Afghanistan',true,false,'bowler','right_hand','right_arm_fast_medium',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":10,"runs":5,"wickets":12,"average":21.5,"strike_rate":16.5,"economy":8.2,"highest_score":"5*","best_bowling":"3/25","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Arab+Gul&background=BDBDBD&color=000'),

-- 90. Nikhil Chaudhary (Unsold - 40 Lakhs)
('ipl','Nikhil Chaudhary','India',false,false,'allrounder','right_hand','right_arm_medium',40,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":280,"wickets":12,"average":28.5,"strike_rate":145.5,"economy":8.5,"highest_score":"55","best_bowling":"2/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Nikhil+Chaudhary&background=BDBDBD&color=000'),

-- 91. Aarya Desai (Unsold - 30 Lakhs)
('ipl','Aarya Desai','India',false,false,'batsman','left_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":150,"wickets":0,"average":25.5,"strike_rate":135.5,"economy":0.0,"highest_score":"45","best_bowling":"0/0","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Aarya+Desai&background=BDBDBD&color=000'),

-- 92. Yash Dhull (Unsold - 30 Lakhs)
('ipl','Yash Dhull','India',false,false,'batsman','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":4,"runs":16,"wickets":0,"average":4.0,"strike_rate":69.5,"economy":0.0,"highest_score":"13","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":4,"runs":16,"wickets":0,"average":4.0,"strike_rate":69.5,"economy":0.0,"highest_score":"13","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":15,"runs":365,"wickets":0,"average":36.5,"strike_rate":131.5,"economy":0.0,"highest_score":"71*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Yash+Dhull&background=BDBDBD&color=000'),

-- 93. Abhinav Manohar (Unsold - 30 Lakhs)
('ipl','Abhinav Manohar','India',false,false,'batsman','right_hand','right_arm_leg_spin',30,'Unsold',true,
'{"matches":2,"runs":9,"wickets":0,"average":4.5,"strike_rate":90.0,"economy":0.0,"highest_score":"8","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":19,"runs":231,"wickets":0,"average":16.5,"strike_rate":135.8,"economy":0.0,"highest_score":"43","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":35,"runs":650,"wickets":0,"average":26.5,"strike_rate":148.5,"economy":0.0,"highest_score":"65*","best_bowling":"0/0","fifties":3,"hundreds":0}',
'https://ui-avatars.com/api/?name=Abhinav+Manohar&background=BDBDBD&color=000'),

-- 94. Anmolpreet Singh (Unsold - 30 Lakhs)
('ipl','Anmolpreet Singh','India',false,false,'batsman','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":1,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":8,"runs":134,"wickets":0,"average":19.1,"strike_rate":116.5,"economy":0.0,"highest_score":"36","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":45,"runs":850,"wickets":0,"average":28.5,"strike_rate":135.2,"economy":0.0,"highest_score":"85*","best_bowling":"0/0","fifties":5,"hundreds":0}',
'https://ui-avatars.com/api/?name=Anmolpreet+Singh&background=BDBDBD&color=000'),

-- 95. Atharva Taide (Unsold - 30 Lakhs)
('ipl','Atharva Taide','India',false,false,'batsman','left_hand','left_arm_orthodox',30,'Unsold',true,
'{"matches":2,"runs":15,"wickets":0,"average":7.5,"strike_rate":107.1,"economy":0.0,"highest_score":"15","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":9,"runs":201,"wickets":0,"average":22.3,"strike_rate":138.6,"economy":0.0,"highest_score":"66","best_bowling":"0/0","fifties":2,"hundreds":0}',
'{"matches":45,"runs":1150,"wickets":5,"average":31.5,"strike_rate":135.2,"economy":8.5,"highest_score":"88","best_bowling":"2/15","fifties":8,"hundreds":0}',
'https://ui-avatars.com/api/?name=Atharva+Taide&background=BDBDBD&color=000'),

-- 96. Abhinav Tejrana (Unsold - 30 Lakhs)
('ipl','Abhinav Tejrana','India',false,false,'wicketkeeper','right_hand','none',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":5,"runs":85,"wickets":0,"average":21.5,"strike_rate":125.5,"economy":0.0,"highest_score":"35","best_bowling":"0/0","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Abhinav+Tejrana&background=BDBDBD&color=000'),

-- 97. Tanush Kotian (Unsold - 30 Lakhs)
('ipl','Tanush Kotian','India',false,false,'allrounder','right_hand','right_arm_off_spin',30,'Unsold',true,
'{"matches":1,"runs":24,"wickets":0,"average":24.0,"strike_rate":77.4,"economy":12.5,"highest_score":"24","best_bowling":"0/25","fifties":0,"hundreds":0}',
'{"matches":1,"runs":24,"wickets":0,"average":24.0,"strike_rate":77.4,"economy":12.5,"highest_score":"24","best_bowling":"0/25","fifties":0,"hundreds":0}',
'{"matches":35,"runs":380,"wickets":32,"average":28.5,"strike_rate":135.5,"economy":7.8,"highest_score":"45","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Tanush+Kotian&background=BDBDBD&color=000'),

-- 98. Kamlesh Nagarkoti (Unsold - 30 Lakhs)
('ipl','Kamlesh Nagarkoti','India',false,false,'bowler','right_hand','right_arm_fast',30,'Unsold',true,
'{"matches":0,"runs":0,"wickets":0,"average":0.0,"strike_rate":0.0,"economy":0.0,"highest_score":"0","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":12,"runs":22,"wickets":5,"average":38.5,"strike_rate":24.5,"economy":9.1,"highest_score":"8*","best_bowling":"2/13","fifties":0,"hundreds":0}',
'{"matches":25,"runs":45,"wickets":22,"average":26.5,"strike_rate":18.5,"economy":8.5,"highest_score":"12","best_bowling":"3/15","fifties":0,"hundreds":0}',
'https://ui-avatars.com/api/?name=Kamlesh+Nagarkoti&background=BDBDBD&color=000'),

-- 99. Vijay Shankar (Unsold - 30 Lakhs)
('ipl','Vijay Shankar','India',false,false,'allrounder','right_hand','right_arm_medium',30,'Unsold',true,
'{"matches":7,"runs":83,"wickets":0,"average":16.6,"strike_rate":105.0,"economy":0.0,"highest_score":"20","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":72,"runs":1118,"wickets":9,"average":23.5,"strike_rate":125.5,"economy":8.8,"highest_score":"63*","best_bowling":"2/19","fifties":6,"hundreds":0}',
'{"matches":145,"runs":2450,"wickets":45,"average":28.5,"strike_rate":130.2,"economy":8.2,"highest_score":"65","best_bowling":"3/15","fifties":12,"hundreds":0}',
'https://ui-avatars.com/api/?name=Vijay+Shankar&background=BDBDBD&color=000'),

-- 100. Sanvir Singh (Unsold - 30 Lakhs)
('ipl','Sanvir Singh','India',false,false,'allrounder','right_hand','right_arm_medium',30,'Unsold',true,
'{"matches":5,"runs":19,"wickets":0,"average":9.5,"strike_rate":146.1,"economy":0.0,"highest_score":"11","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":7,"runs":26,"wickets":0,"average":8.6,"strike_rate":136.8,"economy":12.5,"highest_score":"11","best_bowling":"0/0","fifties":0,"hundreds":0}',
'{"matches":25,"runs":350,"wickets":15,"average":24.5,"strike_rate":145.2,"economy":8.5,"highest_score":"55*","best_bowling":"2/15","fifties":1,"hundreds":0}',
'https://ui-avatars.com/api/?name=Sanvir+Singh&background=BDBDBD&color=000'),

-- ── KABADDI PLAYERS ───────────────────────────────────────────
('kabaddi','Pardeep Narwal','India',false,true,'raider',null,null,100,'Patna Pirates',true,
'{"matches":22,"raid_points":156,"tackle_points":2,"super_raids":9,"super_tackles":0,"raid_success_rate":62,"high_5s":0,"super_10s":12}',
'{"matches":155,"raid_points":1186,"tackle_points":19,"super_raids":66,"super_tackles":0,"raid_success_rate":60,"high_5s":1,"super_10s":88}',
'{"matches":155,"raid_points":1186,"tackle_points":19,"super_raids":66,"super_tackles":0,"raid_success_rate":60,"high_5s":1,"super_10s":88}',
'https://ui-avatars.com/api/?name=Pardeep+Narwal&background=8E24AA&color=fff'),

('kabaddi','Pawan Sehrawat','India',false,true,'raider',null,null,100,'Bengaluru Bulls',true,
'{"matches":21,"raid_points":148,"tackle_points":3,"super_raids":8,"super_tackles":0,"raid_success_rate":65,"high_5s":0,"super_10s":11}',
'{"matches":122,"raid_points":879,"tackle_points":22,"super_raids":48,"super_tackles":1,"raid_success_rate":61,"high_5s":1,"super_10s":70}',
'{"matches":122,"raid_points":879,"tackle_points":22,"super_raids":48,"super_tackles":1,"raid_success_rate":61,"high_5s":1,"super_10s":70}',
'https://ui-avatars.com/api/?name=Pawan+Sehrawat&background=8E24AA&color=fff'),

('kabaddi','Naveen Kumar','India',false,false,'raider',null,null,25,'Dabang Delhi',true,
'{"matches":22,"raid_points":162,"tackle_points":1,"super_raids":11,"super_tackles":0,"raid_success_rate":66,"high_5s":0,"super_10s":14}',
'{"matches":88,"raid_points":558,"tackle_points":8,"super_raids":40,"super_tackles":0,"raid_success_rate":64,"high_5s":0,"super_10s":50}',
'{"matches":88,"raid_points":558,"tackle_points":8,"super_raids":40,"super_tackles":0,"raid_success_rate":64,"high_5s":0,"super_10s":50}',
'https://ui-avatars.com/api/?name=Naveen+Kumar&background=8E24AA&color=fff'),

('kabaddi','Fazel Atrachali','Iran',true,true,'defender',null,null,100,'U Mumba',true,
'{"matches":21,"raid_points":6,"tackle_points":87,"super_raids":0,"super_tackles":7,"raid_success_rate":30,"high_5s":11,"super_10s":0}',
'{"matches":138,"raid_points":42,"tackle_points":524,"super_raids":2,"super_tackles":42,"raid_success_rate":28,"high_5s":70,"super_10s":0}',
'{"matches":138,"raid_points":42,"tackle_points":524,"super_raids":2,"super_tackles":42,"raid_success_rate":28,"high_5s":70,"super_10s":0}',
'https://ui-avatars.com/api/?name=Fazel+Atrachali&background=8E24AA&color=fff'),

('kabaddi','Deepak Niwas Hooda','India',false,true,'allrounder',null,null,100,'Jaipur Pink Panthers',true,
'{"matches":22,"raid_points":98,"tackle_points":32,"super_raids":3,"super_tackles":2,"raid_success_rate":48,"high_5s":2,"super_10s":5}',
'{"matches":115,"raid_points":412,"tackle_points":154,"super_raids":12,"super_tackles":8,"raid_success_rate":45,"high_5s":8,"super_10s":22}',
'{"matches":115,"raid_points":412,"tackle_points":154,"super_raids":12,"super_tackles":8,"raid_success_rate":45,"high_5s":8,"super_10s":22}',
'https://ui-avatars.com/api/?name=Deepak+Niwas+Hooda&background=8E24AA&color=fff'),

('kabaddi','Rahul Chaudhari','India',false,true,'raider',null,null,100,'Telugu Titans',true,
'{"matches":22,"raid_points":133,"tackle_points":4,"super_raids":7,"super_tackles":0,"raid_success_rate":57,"high_5s":0,"super_10s":9}',
'{"matches":181,"raid_points":1085,"tackle_points":29,"super_raids":54,"super_tackles":1,"raid_success_rate":55,"high_5s":0,"super_10s":73}',
'{"matches":181,"raid_points":1085,"tackle_points":29,"super_raids":54,"super_tackles":1,"raid_success_rate":55,"high_5s":0,"super_10s":73}',
'https://ui-avatars.com/api/?name=Rahul+Chaudhari&background=8E24AA&color=fff'),

('kabaddi','Manjeet Chhillar','India',false,true,'defender',null,null,100,'Jaipur Pink Panthers',true,
'{"matches":22,"raid_points":8,"tackle_points":65,"super_raids":0,"super_tackles":5,"raid_success_rate":35,"high_5s":8,"super_10s":0}',
'{"matches":156,"raid_points":52,"tackle_points":485,"super_raids":2,"super_tackles":38,"raid_success_rate":32,"high_5s":58,"super_10s":0}',
'{"matches":156,"raid_points":52,"tackle_points":485,"super_raids":2,"super_tackles":38,"raid_success_rate":32,"high_5s":58,"super_10s":0}',
'https://ui-avatars.com/api/?name=Manjeet+Chhillar&background=8E24AA&color=fff'),

('kabaddi','Siddharth Desai','India',false,false,'raider',null,null,25,'Telugu Titans',true,
'{"matches":22,"raid_points":140,"tackle_points":2,"super_raids":8,"super_tackles":0,"raid_success_rate":59,"high_5s":0,"super_10s":10}',
'{"matches":88,"raid_points":520,"tackle_points":12,"super_raids":32,"super_tackles":0,"raid_success_rate":57,"high_5s":0,"super_10s":40}',
'{"matches":88,"raid_points":520,"tackle_points":12,"super_raids":32,"super_tackles":0,"raid_success_rate":57,"high_5s":0,"super_10s":40}',
'https://ui-avatars.com/api/?name=Siddharth+Desai&background=8E24AA&color=fff'),

-- ── FOOTBALL PLAYERS ─────────────────────────────────────────
('football','Kylian Mbappé','France',true,true,'st',null,null,10000,'Real Madrid',true,
'{"matches":29,"goals":24,"assists":9,"clean_sheets":0,"pass_accuracy":84,"tackles_per_game":0.8,"rating":8.8,"minutes_played":2465}',
'{"matches":316,"goals":256,"assists":108,"clean_sheets":0,"pass_accuracy":83,"tackles_per_game":0.7,"rating":8.6,"minutes_played":26840}',
'{"matches":316,"goals":256,"assists":108,"clean_sheets":0,"pass_accuracy":83,"tackles_per_game":0.7,"rating":8.6,"minutes_played":26840}',
'https://ui-avatars.com/api/?name=Kylian+Mbappe&background=1E88E5&color=fff'),

('football','Erling Haaland','Norway',true,true,'st',null,null,10000,'Manchester City',true,
'{"matches":31,"goals":27,"assists":5,"clean_sheets":0,"pass_accuracy":72,"tackles_per_game":0.5,"rating":8.7,"minutes_played":2540}',
'{"matches":186,"goals":165,"assists":41,"clean_sheets":0,"pass_accuracy":71,"tackles_per_game":0.5,"rating":8.5,"minutes_played":15210}',
'{"matches":186,"goals":165,"assists":41,"clean_sheets":0,"pass_accuracy":71,"tackles_per_game":0.5,"rating":8.5,"minutes_played":15210}',
'https://ui-avatars.com/api/?name=Erling+Haaland&background=1E88E5&color=fff'),

('football','Virgil van Dijk','Netherlands',true,true,'cb',null,null,6000,'Liverpool',true,
'{"matches":35,"goals":3,"assists":1,"clean_sheets":16,"pass_accuracy":91,"tackles_per_game":2.1,"rating":7.9,"minutes_played":3120}',
'{"matches":228,"goals":18,"assists":12,"clean_sheets":95,"pass_accuracy":90,"tackles_per_game":2.0,"rating":7.8,"minutes_played":20160}',
'{"matches":228,"goals":18,"assists":12,"clean_sheets":95,"pass_accuracy":90,"tackles_per_game":2.0,"rating":7.8,"minutes_played":20160}',
'https://ui-avatars.com/api/?name=Virgil+van+Dijk&background=1E88E5&color=fff'),

('football','Pedri','Spain',false,true,'cm',null,null,8000,'Barcelona',true,
'{"matches":28,"goals":6,"assists":9,"clean_sheets":0,"pass_accuracy":92,"tackles_per_game":2.4,"rating":8.2,"minutes_played":2320}',
'{"matches":152,"goals":22,"assists":35,"clean_sheets":0,"pass_accuracy":91,"tackles_per_game":2.2,"rating":8.0,"minutes_played":12680}',
'{"matches":152,"goals":22,"assists":35,"clean_sheets":0,"pass_accuracy":91,"tackles_per_game":2.2,"rating":8.0,"minutes_played":12680}',
'https://ui-avatars.com/api/?name=Pedri&background=1E88E5&color=fff'),

('football','Alisson Becker','Brazil',true,true,'gk',null,null,5000,'Liverpool',true,
'{"matches":35,"goals":0,"assists":1,"clean_sheets":17,"pass_accuracy":75,"tackles_per_game":0,"rating":8.0,"minutes_played":3150}',
'{"matches":218,"goals":1,"assists":3,"clean_sheets":98,"pass_accuracy":74,"tackles_per_game":0,"rating":7.8,"minutes_played":19620}',
'{"matches":218,"goals":1,"assists":3,"clean_sheets":98,"pass_accuracy":74,"tackles_per_game":0,"rating":7.8,"minutes_played":19620}',
'https://ui-avatars.com/api/?name=Alisson+Becker&background=1E88E5&color=fff'),

('football','Vinicius Jr','Brazil',true,true,'lw',null,null,9000,'Real Madrid',true,
'{"matches":32,"goals":21,"assists":10,"clean_sheets":0,"pass_accuracy":78,"tackles_per_game":1.2,"rating":8.5,"minutes_played":2680}',
'{"matches":224,"goals":102,"assists":77,"clean_sheets":0,"pass_accuracy":77,"tackles_per_game":1.1,"rating":8.2,"minutes_played":16440}',
'{"matches":224,"goals":102,"assists":77,"clean_sheets":0,"pass_accuracy":77,"tackles_per_game":1.1,"rating":8.2,"minutes_played":16440}',
'https://ui-avatars.com/api/?name=Vinicius+Jr&background=1E88E5&color=fff'),

('football','Rodri','Spain',false,true,'cdm',null,null,7000,'Manchester City',true,
'{"matches":30,"goals":5,"assists":8,"clean_sheets":0,"pass_accuracy":93,"tackles_per_game":3.2,"rating":8.4,"minutes_played":2700}',
'{"matches":188,"goals":24,"assists":42,"clean_sheets":0,"pass_accuracy":92,"tackles_per_game":3.0,"rating":8.2,"minutes_played":15840}',
'{"matches":188,"goals":24,"assists":42,"clean_sheets":0,"pass_accuracy":92,"tackles_per_game":3.0,"rating":8.2,"minutes_played":15840}',
'https://ui-avatars.com/api/?name=Rodri&background=1E88E5&color=fff'),

('football','Sunil Chhetri','India',false,true,'st',null,null,100,'Mumbai City',true,
'{"matches":18,"goals":14,"assists":5,"clean_sheets":0,"pass_accuracy":76,"tackles_per_game":0.9,"rating":7.8,"minutes_played":1440}',
'{"matches":151,"goals":93,"assists":38,"clean_sheets":0,"pass_accuracy":75,"tackles_per_game":0.8,"rating":7.5,"minutes_played":11880}',
'{"matches":151,"goals":93,"assists":38,"clean_sheets":0,"pass_accuracy":75,"tackles_per_game":0.8,"rating":7.5,"minutes_played":11880}',
'https://ui-avatars.com/api/?name=Sunil+Chhetri&background=1E88E5&color=fff'),

('football','Lamine Yamal','Spain',false,true,'rw',null,null,8000,'Barcelona',true,
'{"matches":29,"goals":13,"assists":14,"clean_sheets":0,"pass_accuracy":86,"tackles_per_game":1.0,"rating":8.6,"minutes_played":2320}',
'{"matches":68,"goals":24,"assists":28,"clean_sheets":0,"pass_accuracy":85,"tackles_per_game":0.9,"rating":8.4,"minutes_played":5220}',
'{"matches":68,"goals":24,"assists":28,"clean_sheets":0,"pass_accuracy":85,"tackles_per_game":0.9,"rating":8.4,"minutes_played":5220}',
'https://ui-avatars.com/api/?name=Lamine+Yamal&background=1E88E5&color=fff'),

('football','Jude Bellingham','England',true,true,'cm',null,null,9000,'Real Madrid',true,
'{"matches":32,"goals":19,"assists":12,"clean_sheets":0,"pass_accuracy":87,"tackles_per_game":2.8,"rating":8.5,"minutes_played":2760}',
'{"matches":198,"goals":68,"assists":52,"clean_sheets":0,"pass_accuracy":86,"tackles_per_game":2.6,"rating":8.3,"minutes_played":16380}',
'{"matches":198,"goals":68,"assists":52,"clean_sheets":0,"pass_accuracy":86,"tackles_per_game":2.6,"rating":8.3,"minutes_played":16380}',
'https://ui-avatars.com/api/?name=Jude+Bellingham&background=1E88E5&color=fff');
