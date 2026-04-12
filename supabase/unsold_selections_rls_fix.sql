ALTER TABLE public.room_teams
ADD COLUMN IF NOT EXISTS unsold_ready BOOLEAN DEFAULT false;

CREATE TABLE IF NOT EXISTS public.unsold_selections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID REFERENCES public.rooms(id) ON DELETE CASCADE,
  team_id UUID REFERENCES public.room_teams(id) ON DELETE CASCADE,
  lot_id UUID REFERENCES public.auction_lots(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(team_id, lot_id)
);

CREATE INDEX IF NOT EXISTS idx_unsold_selections_room ON public.unsold_selections(room_id);
CREATE INDEX IF NOT EXISTS idx_unsold_selections_team ON public.unsold_selections(team_id);

ALTER TABLE public.unsold_selections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "unsold_selections_select" ON public.unsold_selections;
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

DROP POLICY IF EXISTS "unsold_selections_insert" ON public.unsold_selections;
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

DROP POLICY IF EXISTS "unsold_selections_delete" ON public.unsold_selections;
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
