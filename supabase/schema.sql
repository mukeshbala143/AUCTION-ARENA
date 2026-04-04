-- ══════════════════════════════════════════════════════════════
-- AUCTION ARENA — Complete Supabase Schema
-- Run this ONCE in Supabase SQL Editor (Dashboard → SQL Editor → New query)
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
  status        TEXT DEFAULT 'waiting' CHECK (status IN ('waiting','active','unsold_round','finished')),
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
  photo_url        TEXT,
  current_ipl_team TEXT,
  is_active_squad  BOOLEAN DEFAULT true,
  stats_last_ipl   JSONB DEFAULT '{}',
  stats_total_ipl  JSONB DEFAULT '{}',
  stats_total_t20  JSONB DEFAULT '{}'
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

-- ── INDEXES ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_rooms_code    ON public.rooms(code);
CREATE INDEX IF NOT EXISTS idx_players_sport ON public.players(sport);
CREATE INDEX IF NOT EXISTS idx_lots_room     ON public.auction_lots(room_id, status);
CREATE INDEX IF NOT EXISTS idx_bids_lot      ON public.bids(lot_id);
CREATE INDEX IF NOT EXISTS idx_picks_team    ON public.squad_picks(room_id, team_id);
CREATE INDEX IF NOT EXISTS idx_skips_lot     ON public.skips(lot_id);

-- ── RLS POLICIES ──────────────────────────────────────────────
ALTER TABLE public.users        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_teams   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.players      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auction_lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bids         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.squad_picks  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.skips        ENABLE ROW LEVEL SECURITY;

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

-- Players (read-only)
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

-- ── SEED: IPL PLAYERS ────────────────────────────────────────
INSERT INTO public.players (sport,name,country,is_overseas,is_capped,role,batting_style,bowling_style,base_price_lakhs,current_ipl_team,is_active_squad,stats_last_ipl,stats_total_ipl,stats_total_t20) VALUES
('ipl','Virat Kohli','India',false,true,'batsman','right_hand','none',100,'RCB',true,'{"matches":14,"runs":741,"wickets":0,"average":61.8,"strike_rate":154.4,"economy":0,"highest_score":"113*","best_bowling":"0/0","fifties":6,"hundreds":1}','{"matches":237,"runs":7263,"wickets":4,"average":37.2,"strike_rate":130.4,"economy":0,"highest_score":"113*","best_bowling":"1/13","fifties":50,"hundreds":5}','{"matches":117,"runs":4008,"wickets":4,"average":52.7,"strike_rate":137.9,"economy":8.1,"highest_score":"122*","best_bowling":"1/13","fifties":35,"hundreds":1}'),
('ipl','Rohit Sharma','India',false,true,'batsman','right_hand','right_arm_off_spin',100,'MI',true,'{"matches":14,"runs":442,"wickets":0,"average":32.0,"strike_rate":139.6,"economy":0,"highest_score":"89","best_bowling":"0/0","fifties":4,"hundreds":0}','{"matches":243,"runs":6211,"wickets":15,"average":29.8,"strike_rate":130.0,"economy":7.9,"highest_score":"109*","best_bowling":"2/13","fifties":41,"hundreds":1}','{"matches":148,"runs":3853,"wickets":8,"average":32.6,"strike_rate":139.1,"economy":8.2,"highest_score":"118","best_bowling":"2/13","fifties":26,"hundreds":4}'),
('ipl','Shubman Gill','India',false,true,'batsman','right_hand','right_arm_off_spin',100,'GT',true,'{"matches":16,"runs":890,"wickets":0,"average":66.9,"strike_rate":157.3,"economy":0,"highest_score":"129","best_bowling":"0/0","fifties":4,"hundreds":2}','{"matches":75,"runs":2579,"wickets":1,"average":38.0,"strike_rate":136.3,"economy":0,"highest_score":"129","best_bowling":"1/10","fifties":19,"hundreds":3}','{"matches":55,"runs":1870,"wickets":1,"average":37.4,"strike_rate":140.2,"economy":0,"highest_score":"126*","best_bowling":"1/10","fifties":14,"hundreds":3}'),
('ipl','Yashasvi Jaiswal','India',false,true,'batsman','left_hand','right_arm_leg_spin',100,'RR',true,'{"matches":14,"runs":575,"wickets":0,"average":43.0,"strike_rate":163.6,"economy":0,"highest_score":"104*","best_bowling":"0/0","fifties":4,"hundreds":1}','{"matches":29,"runs":1040,"wickets":0,"average":39.0,"strike_rate":158.5,"economy":0,"highest_score":"104*","best_bowling":"0/0","fifties":7,"hundreds":2}','{"matches":35,"runs":1215,"wickets":0,"average":38.2,"strike_rate":161.3,"economy":0,"highest_score":"104*","best_bowling":"0/0","fifties":8,"hundreds":2}'),
('ipl','Rishabh Pant','India',false,true,'wicketkeeper','left_hand','none',100,'DC',true,'{"matches":16,"runs":584,"wickets":0,"average":40.4,"strike_rate":150.9,"economy":0,"highest_score":"97","best_bowling":"0/0","fifties":5,"hundreds":0,"catches":14,"stumpings":3}','{"matches":98,"runs":3284,"wickets":0,"average":38.7,"strike_rate":148.3,"economy":0,"highest_score":"128*","best_bowling":"0/0","fifties":18,"hundreds":1,"catches":68,"stumpings":19}','{"matches":88,"runs":2838,"wickets":0,"average":36.4,"strike_rate":151.2,"economy":0,"highest_score":"128*","best_bowling":"0/0","fifties":15,"hundreds":1,"catches":58,"stumpings":14}'),
('ipl','Sanju Samson','India',false,true,'wicketkeeper','right_hand','none',100,'RR',true,'{"matches":14,"runs":531,"wickets":0,"average":40.8,"strike_rate":143.5,"economy":0,"highest_score":"119","best_bowling":"0/0","fifties":3,"hundreds":1}','{"matches":164,"runs":4322,"wickets":0,"average":30.4,"strike_rate":136.9,"economy":0,"highest_score":"119","best_bowling":"0/0","fifties":27,"hundreds":4}','{"matches":69,"runs":1862,"wickets":0,"average":30.5,"strike_rate":143.7,"economy":0,"highest_score":"119","best_bowling":"0/0","fifties":12,"hundreds":2}'),
('ipl','Hardik Pandya','India',false,true,'allrounder','right_hand','right_arm_fast_medium',100,'MI',true,'{"matches":12,"runs":268,"wickets":10,"average":33.5,"strike_rate":142.6,"economy":9.3,"highest_score":"71*","best_bowling":"3/24","fifties":2,"hundreds":0}','{"matches":115,"runs":2439,"wickets":77,"average":29.3,"strike_rate":146.5,"economy":9.2,"highest_score":"91*","best_bowling":"3/20","fifties":13,"hundreds":0}','{"matches":96,"runs":2012,"wickets":70,"average":28.0,"strike_rate":149.3,"economy":9.5,"highest_score":"91*","best_bowling":"3/20","fifties":10,"hundreds":0}'),
('ipl','Ravindra Jadeja','India',false,true,'allrounder','left_hand','left_arm_orthodox',100,'CSK',true,'{"matches":14,"runs":238,"wickets":13,"average":26.4,"strike_rate":138.4,"economy":7.6,"highest_score":"62*","best_bowling":"3/20","fifties":1,"hundreds":0}','{"matches":236,"runs":2692,"wickets":137,"average":23.5,"strike_rate":127.5,"economy":7.7,"highest_score":"62*","best_bowling":"5/16","fifties":5,"hundreds":0}','{"matches":184,"runs":2634,"wickets":242,"average":26.9,"strike_rate":128.7,"economy":7.6,"highest_score":"62*","best_bowling":"5/16","fifties":4,"hundreds":0}'),
('ipl','Jasprit Bumrah','India',false,true,'bowler','right_hand','right_arm_fast',100,'MI',true,'{"matches":13,"runs":35,"wickets":20,"average":14.0,"strike_rate":170.0,"economy":6.3,"highest_score":"10","best_bowling":"3/10","fifties":0,"hundreds":0}','{"matches":120,"runs":155,"wickets":145,"average":21.3,"strike_rate":161.0,"economy":7.4,"highest_score":"10","best_bowling":"5/10","fifties":0,"hundreds":0}','{"matches":66,"runs":58,"wickets":83,"average":18.5,"strike_rate":169.0,"economy":6.6,"highest_score":"10","best_bowling":"5/10","fifties":0,"hundreds":0}'),
('ipl','Mohammed Shami','India',false,true,'bowler','right_hand','right_arm_fast',100,'GT',true,'{"matches":17,"runs":18,"wickets":28,"average":13.8,"strike_rate":152.0,"economy":8.0,"highest_score":"3*","best_bowling":"4/14","fifties":0,"hundreds":0}','{"matches":94,"runs":75,"wickets":104,"average":23.7,"strike_rate":159.0,"economy":8.7,"highest_score":"9","best_bowling":"4/14","fifties":0,"hundreds":0}','{"matches":64,"runs":55,"wickets":76,"average":22.1,"strike_rate":155.0,"economy":8.8,"highest_score":"9","best_bowling":"4/14","fifties":0,"hundreds":0}'),
('ipl','Yuzvendra Chahal','India',false,true,'bowler','right_hand','right_arm_leg_spin',100,'RR',true,'{"matches":17,"runs":15,"wickets":21,"average":18.9,"strike_rate":161.0,"economy":7.9,"highest_score":"5","best_bowling":"5/40","fifties":0,"hundreds":0}','{"matches":152,"runs":135,"wickets":187,"average":22.3,"strike_rate":161.0,"economy":7.6,"highest_score":"10","best_bowling":"5/40","fifties":0,"hundreds":0}','{"matches":90,"runs":82,"wickets":114,"average":21.4,"strike_rate":162.0,"economy":7.5,"highest_score":"10","best_bowling":"5/40","fifties":0,"hundreds":0}'),
('ipl','KL Rahul','India',false,true,'wicketkeeper','right_hand','none',100,'LSG',true,'{"matches":13,"runs":520,"wickets":0,"average":47.3,"strike_rate":136.8,"economy":0,"highest_score":"103*","best_bowling":"0/0","fifties":4,"hundreds":1}','{"matches":115,"runs":4163,"wickets":0,"average":46.3,"strike_rate":135.5,"economy":0,"highest_score":"132*","best_bowling":"0/0","fifties":33,"hundreds":5}','{"matches":72,"runs":2485,"wickets":0,"average":41.4,"strike_rate":136.7,"economy":0,"highest_score":"132*","best_bowling":"0/0","fifties":20,"hundreds":4}'),
('ipl','Suryakumar Yadav','India',false,true,'batsman','right_hand','none',100,'MI',true,'{"matches":15,"runs":534,"wickets":0,"average":38.1,"strike_rate":182.9,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":4,"hundreds":1}','{"matches":102,"runs":3161,"wickets":0,"average":35.5,"strike_rate":160.2,"economy":0,"highest_score":"117","best_bowling":"0/0","fifties":23,"hundreds":2}','{"matches":65,"runs":2188,"wickets":0,"average":36.5,"strike_rate":170.1,"economy":0,"highest_score":"117","best_bowling":"0/0","fifties":16,"hundreds":2}'),
('ipl','Shreyas Iyer','India',false,true,'batsman','right_hand','right_arm_leg_spin',100,'KKR',true,'{"matches":14,"runs":476,"wickets":0,"average":37.5,"strike_rate":146.3,"economy":0,"highest_score":"96","best_bowling":"0/0","fifties":3,"hundreds":0}','{"matches":107,"runs":3122,"wickets":3,"average":32.5,"strike_rate":129.2,"economy":0,"highest_score":"96","best_bowling":"1/6","fifties":22,"hundreds":0}','{"matches":65,"runs":1905,"wickets":1,"average":33.4,"strike_rate":133.0,"economy":0,"highest_score":"96","best_bowling":"1/6","fifties":13,"hundreds":0}'),
('ipl','Axar Patel','India',false,true,'allrounder','left_hand','left_arm_orthodox',100,'DC',true,'{"matches":15,"runs":228,"wickets":12,"average":22.8,"strike_rate":152.0,"economy":7.2,"highest_score":"54*","best_bowling":"3/17","fifties":1,"hundreds":0}','{"matches":99,"runs":1106,"wickets":102,"average":20.3,"strike_rate":145.8,"economy":7.4,"highest_score":"54*","best_bowling":"4/21","fifties":3,"hundreds":0}','{"matches":74,"runs":935,"wickets":88,"average":21.5,"strike_rate":148.4,"economy":7.3,"highest_score":"54*","best_bowling":"4/21","fifties":2,"hundreds":0}'),
('ipl','Pat Cummins','Australia',true,true,'bowler','right_hand','right_arm_fast',100,'SRH',true,'{"matches":14,"runs":98,"wickets":19,"average":16.8,"strike_rate":149.8,"economy":8.5,"highest_score":"56","best_bowling":"4/16","fifties":1,"hundreds":0}','{"matches":95,"runs":528,"wickets":103,"average":18.6,"strike_rate":149.8,"economy":8.5,"highest_score":"56","best_bowling":"4/16","fifties":2,"hundreds":0}','{"matches":105,"runs":765,"wickets":138,"average":19.8,"strike_rate":153.0,"economy":8.7,"highest_score":"56","best_bowling":"4/16","fifties":3,"hundreds":0}'),
('ipl','Travis Head','Australia',true,true,'batsman','left_hand','right_arm_off_spin',100,'SRH',true,'{"matches":14,"runs":567,"wickets":0,"average":44.8,"strike_rate":191.2,"economy":0,"highest_score":"102","best_bowling":"0/0","fifties":3,"hundreds":1}','{"matches":28,"runs":1004,"wickets":0,"average":40.2,"strike_rate":185.7,"economy":0,"highest_score":"102","best_bowling":"0/0","fifties":7,"hundreds":2}','{"matches":45,"runs":1520,"wickets":0,"average":36.6,"strike_rate":176.5,"economy":0,"highest_score":"102","best_bowling":"0/0","fifties":11,"hundreds":3}'),
('ipl','Glenn Maxwell','Australia',true,true,'allrounder','right_hand','right_arm_off_spin',100,'RCB',true,'{"matches":12,"runs":301,"wickets":7,"average":27.4,"strike_rate":164.2,"economy":8.7,"highest_score":"72","best_bowling":"2/16","fifties":2,"hundreds":0}','{"matches":111,"runs":2771,"wickets":32,"average":29.2,"strike_rate":155.1,"economy":8.5,"highest_score":"95","best_bowling":"3/14","fifties":16,"hundreds":0}','{"matches":137,"runs":3591,"wickets":54,"average":31.1,"strike_rate":158.7,"economy":8.3,"highest_score":"95","best_bowling":"3/14","fifties":21,"hundreds":0}'),
('ipl','Jos Buttler','England',true,true,'wicketkeeper','right_hand','none',100,'RR',true,'{"matches":17,"runs":863,"wickets":0,"average":55.5,"strike_rate":148.7,"economy":0,"highest_score":"116","best_bowling":"0/0","fifties":5,"hundreds":2,"catches":13,"stumpings":4}','{"matches":89,"runs":3582,"wickets":0,"average":43.4,"strike_rate":148.7,"economy":0,"highest_score":"124","best_bowling":"0/0","fifties":21,"hundreds":4,"catches":63,"stumpings":21}','{"matches":99,"runs":3660,"wickets":0,"average":40.0,"strike_rate":150.4,"economy":0,"highest_score":"124","best_bowling":"0/0","fifties":22,"hundreds":4}'),
('ipl','Ben Stokes','England',true,true,'allrounder','left_hand','right_arm_fast_medium',100,'CSK',true,'{"matches":8,"runs":198,"wickets":7,"average":29.1,"strike_rate":132.9,"economy":9.1,"highest_score":"67","best_bowling":"3/28","fifties":1,"hundreds":0}','{"matches":43,"runs":920,"wickets":28,"average":28.1,"strike_rate":133.0,"economy":8.9,"highest_score":"67","best_bowling":"3/28","fifties":5,"hundreds":0}','{"matches":101,"runs":2605,"wickets":74,"average":30.6,"strike_rate":133.7,"economy":8.7,"highest_score":"107*","best_bowling":"3/28","fifties":14,"hundreds":1}'),
('ipl','Kagiso Rabada','South Africa',true,true,'bowler','right_hand','right_arm_fast',100,'PBKS',true,'{"matches":14,"runs":32,"wickets":20,"average":17.4,"strike_rate":167.0,"economy":9.0,"highest_score":"19","best_bowling":"4/21","fifties":0,"hundreds":0}','{"matches":77,"runs":148,"wickets":93,"average":21.5,"strike_rate":154.0,"economy":9.1,"highest_score":"25","best_bowling":"4/21","fifties":0,"hundreds":0}','{"matches":65,"runs":142,"wickets":78,"average":19.6,"strike_rate":160.0,"economy":8.9,"highest_score":"25","best_bowling":"4/21","fifties":0,"hundreds":0}'),
('ipl','Heinrich Klaasen','South Africa',true,true,'wicketkeeper','right_hand','none',100,'SRH',true,'{"matches":15,"runs":479,"wickets":0,"average":47.9,"strike_rate":183.1,"economy":0,"highest_score":"80","best_bowling":"0/0","fifties":4,"hundreds":0}','{"matches":22,"runs":662,"wickets":0,"average":40.4,"strike_rate":177.3,"economy":0,"highest_score":"80","best_bowling":"0/0","fifties":5,"hundreds":0}','{"matches":30,"runs":876,"wickets":0,"average":32.4,"strike_rate":173.5,"economy":0,"highest_score":"80","best_bowling":"0/0","fifties":6,"hundreds":0}'),
('ipl','Andre Russell','West Indies',true,true,'allrounder','right_hand','right_arm_fast_medium',100,'KKR',true,'{"matches":14,"runs":513,"wickets":11,"average":42.8,"strike_rate":185.6,"economy":10.1,"highest_score":"88","best_bowling":"3/21","fifties":4,"hundreds":0}','{"matches":109,"runs":2843,"wickets":91,"average":31.0,"strike_rate":181.7,"economy":9.8,"highest_score":"88","best_bowling":"5/15","fifties":16,"hundreds":0}','{"matches":134,"runs":3504,"wickets":126,"average":31.9,"strike_rate":180.4,"economy":9.6,"highest_score":"121*","best_bowling":"5/15","fifties":20,"hundreds":1}'),
('ipl','Sunil Narine','West Indies',true,true,'allrounder','left_hand','right_arm_off_spin',100,'KKR',true,'{"matches":14,"runs":488,"wickets":15,"average":52.4,"strike_rate":177.1,"economy":6.7,"highest_score":"109","best_bowling":"3/26","fifties":3,"hundreds":1}','{"matches":175,"runs":2063,"wickets":163,"average":18.1,"strike_rate":165.8,"economy":6.7,"highest_score":"109","best_bowling":"5/19","fifties":6,"hundreds":1}','{"matches":184,"runs":2280,"wickets":175,"average":19.3,"strike_rate":163.2,"economy":6.6,"highest_score":"109","best_bowling":"5/19","fifties":7,"hundreds":1}'),
('ipl','Rashid Khan','Afghanistan',true,true,'allrounder','right_hand','right_arm_leg_spin',100,'GT',true,'{"matches":17,"runs":190,"wickets":27,"average":14.1,"strike_rate":160.7,"economy":6.6,"highest_score":"40","best_bowling":"4/10","fifties":0,"hundreds":0}','{"matches":106,"runs":543,"wickets":137,"average":18.3,"strike_rate":152.3,"economy":6.8,"highest_score":"40","best_bowling":"4/10","fifties":0,"hundreds":0}','{"matches":103,"runs":556,"wickets":138,"average":17.3,"strike_rate":150.8,"economy":6.5,"highest_score":"40","best_bowling":"4/10","fifties":0,"hundreds":0}'),
('ipl','Trent Boult','New Zealand',true,true,'bowler','right_hand','left_arm_fast_medium',100,'RR',true,'{"matches":16,"runs":22,"wickets":21,"average":20.9,"strike_rate":156.0,"economy":8.2,"highest_score":"8","best_bowling":"3/19","fifties":0,"hundreds":0}','{"matches":82,"runs":94,"wickets":103,"average":23.5,"strike_rate":154.0,"economy":7.8,"highest_score":"13","best_bowling":"4/18","fifties":0,"hundreds":0}','{"matches":92,"runs":112,"wickets":118,"average":22.0,"strike_rate":153.0,"economy":7.5,"highest_score":"13","best_bowling":"4/18","fifties":0,"hundreds":0}'),
('ipl','Wanindu Hasaranga','Sri Lanka',true,true,'allrounder','right_hand','right_arm_leg_spin',100,'RCB',true,'{"matches":15,"runs":150,"wickets":24,"average":14.0,"strike_rate":152.3,"economy":7.4,"highest_score":"35","best_bowling":"4/20","fifties":0,"hundreds":0}','{"matches":44,"runs":380,"wickets":60,"average":14.2,"strike_rate":142.1,"economy":7.5,"highest_score":"35","best_bowling":"4/20","fifties":0,"hundreds":0}','{"matches":74,"runs":762,"wickets":105,"average":18.4,"strike_rate":138.5,"economy":7.3,"highest_score":"71*","best_bowling":"4/20","fifties":1,"hundreds":0}'),
('ipl','Tilak Varma','India',false,false,'batsman','left_hand','left_arm_orthodox',25,'MI',true,'{"matches":14,"runs":481,"wickets":0,"average":44.6,"strike_rate":149.7,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":4,"hundreds":0}','{"matches":43,"runs":1232,"wickets":0,"average":33.0,"strike_rate":145.2,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":8,"hundreds":0}','{"matches":45,"runs":1248,"wickets":0,"average":32.8,"strike_rate":145.5,"economy":0,"highest_score":"84*","best_bowling":"0/0","fifties":8,"hundreds":0}'),
('ipl','Rinku Singh','India',false,false,'batsman','left_hand','none',25,'KKR',true,'{"matches":14,"runs":337,"wickets":0,"average":56.2,"strike_rate":154.1,"economy":0,"highest_score":"67","best_bowling":"0/0","fifties":3,"hundreds":0}','{"matches":46,"runs":949,"wickets":0,"average":47.5,"strike_rate":153.6,"economy":0,"highest_score":"67","best_bowling":"0/0","fifties":7,"hundreds":0}','{"matches":46,"runs":949,"wickets":0,"average":47.5,"strike_rate":153.6,"economy":0,"highest_score":"67","best_bowling":"0/0","fifties":7,"hundreds":0}'),
('ipl','Sai Sudharsan','India',false,false,'batsman','left_hand','right_arm_off_spin',25,'GT',true,'{"matches":14,"runs":527,"wickets":0,"average":47.9,"strike_rate":136.0,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":4,"hundreds":1}','{"matches":32,"runs":879,"wickets":0,"average":31.8,"strike_rate":130.8,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":5,"hundreds":1}','{"matches":32,"runs":879,"wickets":0,"average":31.8,"strike_rate":130.8,"economy":0,"highest_score":"103","best_bowling":"0/0","fifties":5,"hundreds":1}'),
('ipl','Arshdeep Singh','India',false,true,'bowler','left_hand','left_arm_fast_medium',100,'PBKS',true,'{"matches":14,"runs":25,"wickets":17,"average":18.5,"strike_rate":152.0,"economy":8.4,"highest_score":"10","best_bowling":"4/9","fifties":0,"hundreds":0}','{"matches":62,"runs":102,"wickets":76,"average":24.4,"strike_rate":139.8,"economy":8.6,"highest_score":"10","best_bowling":"4/9","fifties":0,"hundreds":0}','{"matches":80,"runs":148,"wickets":103,"average":23.1,"strike_rate":141.0,"economy":8.2,"highest_score":"10","best_bowling":"4/9","fifties":0,"hundreds":0}'),
('ipl','Mohammed Siraj','India',false,true,'bowler','right_hand','right_arm_fast_medium',100,'RCB',true,'{"matches":14,"runs":28,"wickets":15,"average":20.1,"strike_rate":148.0,"economy":8.9,"highest_score":"12","best_bowling":"3/18","fifties":0,"hundreds":0}','{"matches":68,"runs":120,"wickets":72,"average":27.2,"strike_rate":152.0,"economy":9.1,"highest_score":"12","best_bowling":"3/15","fifties":0,"hundreds":0}','{"matches":42,"runs":58,"wickets":46,"average":25.0,"strike_rate":148.0,"economy":8.8,"highest_score":"12","best_bowling":"3/15","fifties":0,"hundreds":0}'),
('ipl','Nicholas Pooran','West Indies',true,true,'wicketkeeper','left_hand','none',100,'LSG',true,'{"matches":14,"runs":399,"wickets":0,"average":39.9,"strike_rate":192.8,"economy":0,"highest_score":"62","best_bowling":"0/0","fifties":3,"hundreds":0}','{"matches":59,"runs":1492,"wickets":0,"average":32.4,"strike_rate":175.5,"economy":0,"highest_score":"84","best_bowling":"0/0","fifties":9,"hundreds":0}','{"matches":75,"runs":1856,"wickets":0,"average":31.0,"strike_rate":173.2,"economy":0,"highest_score":"84","best_bowling":"0/0","fifties":11,"hundreds":0}'),
('ipl','Faf du Plessis','South Africa',true,true,'batsman','right_hand','none',100,'RCB',true,'{"matches":14,"runs":418,"wickets":0,"average":31.0,"strike_rate":140.5,"economy":0,"highest_score":"96","best_bowling":"0/0","fifties":3,"hundreds":0}','{"matches":119,"runs":4028,"wickets":0,"average":37.6,"strike_rate":134.9,"economy":0,"highest_score":"96","best_bowling":"0/0","fifties":36,"hundreds":0}','{"matches":84,"runs":2870,"wickets":0,"average":36.2,"strike_rate":135.5,"economy":0,"highest_score":"120*","best_bowling":"0/0","fifties":24,"hundreds":1}'),
('ipl','Kuldeep Yadav','India',false,true,'bowler','left_hand','left_arm_wrist_spin',100,'DC',true,'{"matches":13,"runs":24,"wickets":21,"average":15.9,"strike_rate":158.0,"economy":7.8,"highest_score":"10","best_bowling":"4/14","fifties":0,"hundreds":0}','{"matches":72,"runs":132,"wickets":90,"average":22.4,"strike_rate":163.0,"economy":7.9,"highest_score":"10","best_bowling":"4/14","fifties":0,"hundreds":0}','{"matches":60,"runs":85,"wickets":75,"average":21.8,"strike_rate":162.0,"economy":7.7,"highest_score":"10","best_bowling":"4/14","fifties":0,"hundreds":0}'),
-- Uncapped players
('ipl','Devdutt Padikkal','India',false,false,'batsman','left_hand','none',25,'RR',true,'{"matches":14,"runs":392,"wickets":0,"average":33.5,"strike_rate":135.2,"economy":0,"highest_score":"74","best_bowling":"0/0","fifties":3,"hundreds":0}','{"matches":62,"runs":1556,"wickets":0,"average":28.0,"strike_rate":131.4,"economy":0,"highest_score":"101*","best_bowling":"0/0","fifties":12,"hundreds":1}','{"matches":62,"runs":1556,"wickets":0,"average":28.0,"strike_rate":131.4,"economy":0,"highest_score":"101*","best_bowling":"0/0","fifties":12,"hundreds":1}'),
('ipl','Shivam Dube','India',false,false,'allrounder','left_hand','right_arm_fast_medium',25,'CSK',true,'{"matches":15,"runs":418,"wickets":4,"average":34.8,"strike_rate":152.6,"economy":9.2,"highest_score":"69","best_bowling":"2/28","fifties":3,"hundreds":0}','{"matches":65,"runs":1205,"wickets":18,"average":27.4,"strike_rate":148.0,"economy":9.4,"highest_score":"69","best_bowling":"2/20","fifties":7,"hundreds":0}','{"matches":65,"runs":1205,"wickets":18,"average":27.4,"strike_rate":148.0,"economy":9.4,"highest_score":"69","best_bowling":"2/20","fifties":7,"hundreds":0}'),

-- ── KABADDI PLAYERS ───────────────────────────────────────────
('kabaddi','Pardeep Narwal','India',false,true,'raider',null,null,100,'Patna Pirates',true,'{"matches":22,"raid_points":156,"tackle_points":2,"super_raids":9,"super_tackles":0,"raid_success_rate":62,"high_5s":0,"super_10s":12}','{"matches":155,"raid_points":1186,"tackle_points":19,"super_raids":66,"super_tackles":0,"raid_success_rate":60,"high_5s":1,"super_10s":88}','{"matches":155,"raid_points":1186,"tackle_points":19,"super_raids":66,"super_tackles":0,"raid_success_rate":60,"high_5s":1,"super_10s":88}'),
('kabaddi','Pawan Sehrawat','India',false,true,'raider',null,null,100,'Bengaluru Bulls',true,'{"matches":21,"raid_points":148,"tackle_points":3,"super_raids":8,"super_tackles":0,"raid_success_rate":65,"high_5s":0,"super_10s":11}','{"matches":122,"raid_points":879,"tackle_points":22,"super_raids":48,"super_tackles":1,"raid_success_rate":61,"high_5s":1,"super_10s":70}','{"matches":122,"raid_points":879,"tackle_points":22,"super_raids":48,"super_tackles":1,"raid_success_rate":61,"high_5s":1,"super_10s":70}'),
('kabaddi','Naveen Kumar','India',false,false,'raider',null,null,25,'Dabang Delhi',true,'{"matches":22,"raid_points":162,"tackle_points":1,"super_raids":11,"super_tackles":0,"raid_success_rate":66,"high_5s":0,"super_10s":14}','{"matches":88,"raid_points":558,"tackle_points":8,"super_raids":40,"super_tackles":0,"raid_success_rate":64,"high_5s":0,"super_10s":50}','{"matches":88,"raid_points":558,"tackle_points":8,"super_raids":40,"super_tackles":0,"raid_success_rate":64,"high_5s":0,"super_10s":50}'),
('kabaddi','Fazel Atrachali','Iran',true,true,'defender',null,null,100,'U Mumba',true,'{"matches":21,"raid_points":6,"tackle_points":87,"super_raids":0,"super_tackles":7,"raid_success_rate":30,"high_5s":11,"super_10s":0}','{"matches":138,"raid_points":42,"tackle_points":524,"super_raids":2,"super_tackles":42,"raid_success_rate":28,"high_5s":70,"super_10s":0}','{"matches":138,"raid_points":42,"tackle_points":524,"super_raids":2,"super_tackles":42,"raid_success_rate":28,"high_5s":70,"super_10s":0}'),
('kabaddi','Deepak Niwas Hooda','India',false,true,'allrounder',null,null,100,'Jaipur Pink Panthers',true,'{"matches":22,"raid_points":98,"tackle_points":32,"super_raids":3,"super_tackles":2,"raid_success_rate":48,"high_5s":2,"super_10s":5}','{"matches":115,"raid_points":412,"tackle_points":154,"super_raids":12,"super_tackles":8,"raid_success_rate":45,"high_5s":8,"super_10s":22}','{"matches":115,"raid_points":412,"tackle_points":154,"super_raids":12,"super_tackles":8,"raid_success_rate":45,"high_5s":8,"super_10s":22}'),
('kabaddi','Rahul Chaudhari','India',false,true,'raider',null,null,100,'Telugu Titans',true,'{"matches":22,"raid_points":133,"tackle_points":4,"super_raids":7,"super_tackles":0,"raid_success_rate":57,"high_5s":0,"super_10s":9}','{"matches":181,"raid_points":1085,"tackle_points":29,"super_raids":54,"super_tackles":1,"raid_success_rate":55,"high_5s":0,"super_10s":73}','{"matches":181,"raid_points":1085,"tackle_points":29,"super_raids":54,"super_tackles":1,"raid_success_rate":55,"high_5s":0,"super_10s":73}'),
('kabaddi','Manjeet Chhillar','India',false,true,'defender',null,null,100,'Jaipur Pink Panthers',true,'{"matches":22,"raid_points":8,"tackle_points":65,"super_raids":0,"super_tackles":5,"raid_success_rate":35,"high_5s":8,"super_10s":0}','{"matches":156,"raid_points":52,"tackle_points":485,"super_raids":2,"super_tackles":38,"raid_success_rate":32,"high_5s":58,"super_10s":0}','{"matches":156,"raid_points":52,"tackle_points":485,"super_raids":2,"super_tackles":38,"raid_success_rate":32,"high_5s":58,"super_10s":0}'),
('kabaddi','Siddharth Desai','India',false,false,'raider',null,null,25,'Telugu Titans',true,'{"matches":22,"raid_points":140,"tackle_points":2,"super_raids":8,"super_tackles":0,"raid_success_rate":59,"high_5s":0,"super_10s":10}','{"matches":88,"raid_points":520,"tackle_points":12,"super_raids":32,"super_tackles":0,"raid_success_rate":57,"high_5s":0,"super_10s":40}','{"matches":88,"raid_points":520,"tackle_points":12,"super_raids":32,"super_tackles":0,"raid_success_rate":57,"high_5s":0,"super_10s":40}'),

-- ── FOOTBALL PLAYERS ─────────────────────────────────────────
('football','Kylian Mbappé','France',true,true,'st',null,null,10000,'Real Madrid',true,'{"matches":29,"goals":24,"assists":9,"clean_sheets":0,"pass_accuracy":84,"tackles_per_game":0.8,"rating":8.8,"minutes_played":2465}','{"matches":316,"goals":256,"assists":108,"clean_sheets":0,"pass_accuracy":83,"tackles_per_game":0.7,"rating":8.6,"minutes_played":26840}','{"matches":316,"goals":256,"assists":108,"clean_sheets":0,"pass_accuracy":83,"tackles_per_game":0.7,"rating":8.6,"minutes_played":26840}'),
('football','Erling Haaland','Norway',true,true,'st',null,null,10000,'Manchester City',true,'{"matches":31,"goals":27,"assists":5,"clean_sheets":0,"pass_accuracy":72,"tackles_per_game":0.5,"rating":8.7,"minutes_played":2540}','{"matches":186,"goals":165,"assists":41,"clean_sheets":0,"pass_accuracy":71,"tackles_per_game":0.5,"rating":8.5,"minutes_played":15210}','{"matches":186,"goals":165,"assists":41,"clean_sheets":0,"pass_accuracy":71,"tackles_per_game":0.5,"rating":8.5,"minutes_played":15210}'),
('football','Virgil van Dijk','Netherlands',true,true,'cb',null,null,6000,'Liverpool',true,'{"matches":35,"goals":3,"assists":1,"clean_sheets":16,"pass_accuracy":91,"tackles_per_game":2.1,"rating":7.9,"minutes_played":3120}','{"matches":228,"goals":18,"assists":12,"clean_sheets":95,"pass_accuracy":90,"tackles_per_game":2.0,"rating":7.8,"minutes_played":20160}','{"matches":228,"goals":18,"assists":12,"clean_sheets":95,"pass_accuracy":90,"tackles_per_game":2.0,"rating":7.8,"minutes_played":20160}'),
('football','Pedri','Spain',false,true,'cm',null,null,8000,'Barcelona',true,'{"matches":28,"goals":6,"assists":9,"clean_sheets":0,"pass_accuracy":92,"tackles_per_game":2.4,"rating":8.2,"minutes_played":2320}','{"matches":152,"goals":22,"assists":35,"clean_sheets":0,"pass_accuracy":91,"tackles_per_game":2.2,"rating":8.0,"minutes_played":12680}','{"matches":152,"goals":22,"assists":35,"clean_sheets":0,"pass_accuracy":91,"tackles_per_game":2.2,"rating":8.0,"minutes_played":12680}'),
('football','Alisson Becker','Brazil',true,true,'gk',null,null,5000,'Liverpool',true,'{"matches":35,"goals":0,"assists":1,"clean_sheets":17,"pass_accuracy":75,"tackles_per_game":0,"rating":8.0,"minutes_played":3150}','{"matches":218,"goals":1,"assists":3,"clean_sheets":98,"pass_accuracy":74,"tackles_per_game":0,"rating":7.8,"minutes_played":19620}','{"matches":218,"goals":1,"assists":3,"clean_sheets":98,"pass_accuracy":74,"tackles_per_game":0,"rating":7.8,"minutes_played":19620}'),
('football','Vinicius Jr','Brazil',true,true,'lw',null,null,9000,'Real Madrid',true,'{"matches":32,"goals":21,"assists":10,"clean_sheets":0,"pass_accuracy":78,"tackles_per_game":1.2,"rating":8.5,"minutes_played":2680}','{"matches":224,"goals":102,"assists":77,"clean_sheets":0,"pass_accuracy":77,"tackles_per_game":1.1,"rating":8.2,"minutes_played":16440}','{"matches":224,"goals":102,"assists":77,"clean_sheets":0,"pass_accuracy":77,"tackles_per_game":1.1,"rating":8.2,"minutes_played":16440}'),
('football','Rodri','Spain',false,true,'cdm',null,null,7000,'Manchester City',true,'{"matches":30,"goals":5,"assists":8,"clean_sheets":0,"pass_accuracy":93,"tackles_per_game":3.2,"rating":8.4,"minutes_played":2700}','{"matches":188,"goals":24,"assists":42,"clean_sheets":0,"pass_accuracy":92,"tackles_per_game":3.0,"rating":8.2,"minutes_played":15840}','{"matches":188,"goals":24,"assists":42,"clean_sheets":0,"pass_accuracy":92,"tackles_per_game":3.0,"rating":8.2,"minutes_played":15840}'),
('football','Sunil Chhetri','India',false,true,'st',null,null,100,'Mumbai City',true,'{"matches":18,"goals":14,"assists":5,"clean_sheets":0,"pass_accuracy":76,"tackles_per_game":0.9,"rating":7.8,"minutes_played":1440}','{"matches":151,"goals":93,"assists":38,"clean_sheets":0,"pass_accuracy":75,"tackles_per_game":0.8,"rating":7.5,"minutes_played":11880}','{"matches":151,"goals":93,"assists":38,"clean_sheets":0,"pass_accuracy":75,"tackles_per_game":0.8,"rating":7.5,"minutes_played":11880}'),
('football','Lamine Yamal','Spain',false,true,'rw',null,null,8000,'Barcelona',true,'{"matches":29,"goals":13,"assists":14,"clean_sheets":0,"pass_accuracy":86,"tackles_per_game":1.0,"rating":8.6,"minutes_played":2320}','{"matches":68,"goals":24,"assists":28,"clean_sheets":0,"pass_accuracy":85,"tackles_per_game":0.9,"rating":8.4,"minutes_played":5220}','{"matches":68,"goals":24,"assists":28,"clean_sheets":0,"pass_accuracy":85,"tackles_per_game":0.9,"rating":8.4,"minutes_played":5220}'),
('football','Jude Bellingham','England',true,true,'cm',null,null,9000,'Real Madrid',true,'{"matches":32,"goals":19,"assists":12,"clean_sheets":0,"pass_accuracy":87,"tackles_per_game":2.8,"rating":8.5,"minutes_played":2760}','{"matches":198,"goals":68,"assists":52,"clean_sheets":0,"pass_accuracy":86,"tackles_per_game":2.6,"rating":8.3,"minutes_played":16380}','{"matches":198,"goals":68,"assists":52,"clean_sheets":0,"pass_accuracy":86,"tackles_per_game":2.6,"rating":8.3,"minutes_played":16380}');
