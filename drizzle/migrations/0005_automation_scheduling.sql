CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE public.automation_settings (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  country text NOT NULL DEFAULT 'US',
  timezone text NOT NULL DEFAULT 'America/New_York',
  frequency text NOT NULL DEFAULT 'daily' CHECK (frequency IN ('daily','specific_days','custom')),
  days_of_week int[] NOT NULL DEFAULT '{1,2,3,4,5}',
  publish_times text[] NOT NULL DEFAULT '{"18:00"}',
  custom_slots timestamptz[] NOT NULL DEFAULT '{}',
  platforms text[] NOT NULL DEFAULT '{}',
  account_ids uuid[] NOT NULL DEFAULT '{}',
  emergency_stop boolean NOT NULL DEFAULT false,
  emergency_stopped_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.automation_settings TO authenticated;
GRANT ALL ON public.automation_settings TO service_role;
ALTER TABLE public.automation_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own automation settings select" ON public.automation_settings FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own automation settings insert" ON public.automation_settings FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own automation settings update" ON public.automation_settings FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE public.scheduled_posts
  ADD COLUMN attempts int NOT NULL DEFAULT 0,
  ADD COLUMN max_attempts int NOT NULL DEFAULT 3,
  ADD COLUMN next_attempt_at timestamptz,
  ADD COLUMN locked_until timestamptz,
  ADD COLUMN idempotency_key text,
  ADD COLUMN automated boolean NOT NULL DEFAULT false,
  ADD COLUMN status_detail text,
  ADD COLUMN published_url text,
  ADD COLUMN published_at timestamptz,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX scheduled_posts_idempotency_key ON public.scheduled_posts(idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX scheduled_posts_due ON public.scheduled_posts(status, next_attempt_at);
UPDATE public.scheduled_posts SET status = upper(status) WHERE status <> upper(status);

CREATE TABLE public.internal_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.internal_config TO service_role;
ALTER TABLE public.internal_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.job_locks (
  name text PRIMARY KEY,
  locked_until timestamptz NOT NULL
);
GRANT ALL ON public.job_locks TO service_role;
ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.acquire_job_lock(_name text, _seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE got boolean;
BEGIN
  INSERT INTO public.job_locks(name, locked_until) VALUES (_name, now() + make_interval(secs => _seconds))
  ON CONFLICT (name) DO UPDATE SET locked_until = EXCLUDED.locked_until WHERE public.job_locks.locked_until < now()
  RETURNING true INTO got;
  RETURN coalesce(got, false);
END $$;

CREATE OR REPLACE FUNCTION public.release_job_lock(_name text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.job_locks SET locked_until = now() WHERE name = _name;
$$;

-- Atomically claims a due post so two runs can never publish it twice.
CREATE OR REPLACE FUNCTION public.claim_scheduled_post(_id uuid, _seconds int)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE got uuid;
BEGIN
  UPDATE public.scheduled_posts
     SET status = 'PUBLISHING', locked_until = now() + make_interval(secs => _seconds), updated_at = now()
   WHERE id = _id AND status IN ('SCHEDULED','RETRYING')
     AND (locked_until IS NULL OR locked_until < now())
  RETURNING id INTO got;
  RETURN got IS NOT NULL;
END $$;

REVOKE ALL ON FUNCTION public.acquire_job_lock(text, int) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_job_lock(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_scheduled_post(uuid, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_job_lock(text, int) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_job_lock(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_scheduled_post(uuid, int) TO service_role;