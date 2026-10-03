CREATE TABLE public.sync_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  platform text NOT NULL,
  status text NOT NULL CHECK (status IN ('ok','partial','failed')),
  message text,
  trigger text NOT NULL DEFAULT 'manual',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);
CREATE INDEX sync_logs_user_time ON public.sync_logs(user_id, started_at DESC);

CREATE TABLE public.account_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  followers bigint,
  total_views bigint,
  total_likes bigint,
  video_count integer,
  raw jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX account_metrics_account_time ON public.account_metrics(account_id, captured_at DESC);

CREATE TABLE public.video_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  post_id uuid NOT NULL REFERENCES public.scheduled_posts(id) ON DELETE CASCADE,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  platform text NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  views bigint,
  likes bigint,
  comments bigint,
  shares bigint,
  watch_time_minutes numeric,
  avg_view_seconds numeric,
  raw jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX video_metrics_post_time ON public.video_metrics(post_id, captured_at DESC);

CREATE TABLE public.analytics_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now(),
  followers bigint NOT NULL DEFAULT 0,
  views bigint NOT NULL DEFAULT 0,
  likes bigint NOT NULL DEFAULT 0,
  comments bigint NOT NULL DEFAULT 0,
  shares bigint NOT NULL DEFAULT 0,
  by_platform jsonb NOT NULL DEFAULT '{}'
);
CREATE INDEX analytics_snapshots_user_time ON public.analytics_snapshots(user_id, captured_at DESC);

CREATE TABLE public.earnings_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  platform text NOT NULL,
  period_start date NOT NULL,
  period_end date NOT NULL,
  amount numeric(14,4) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  source text NOT NULL DEFAULT 'api' CHECK (source IN ('api','import')),
  verified boolean NOT NULL DEFAULT true,
  metric text NOT NULL DEFAULT 'estimatedRevenue',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX earnings_records_unique ON public.earnings_records(account_id, period_start, period_end, metric, source);

GRANT SELECT ON public.sync_logs, public.account_metrics, public.video_metrics, public.analytics_snapshots, public.earnings_records TO authenticated;
GRANT ALL ON public.sync_logs, public.account_metrics, public.video_metrics, public.analytics_snapshots, public.earnings_records TO service_role;

ALTER TABLE public.sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.account_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.earnings_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own sync logs" ON public.sync_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own account metrics" ON public.account_metrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own video metrics" ON public.video_metrics FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own analytics snapshots" ON public.analytics_snapshots FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own earnings" ON public.earnings_records FOR SELECT TO authenticated USING (auth.uid() = user_id);