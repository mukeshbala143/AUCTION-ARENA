CREATE TABLE IF NOT EXISTS public.login_reminders (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        TEXT NOT NULL,
  last_sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_login_reminders_last_sent_at
ON public.login_reminders(last_sent_at);

ALTER TABLE public.login_reminders ENABLE ROW LEVEL SECURITY;
