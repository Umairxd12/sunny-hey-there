ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS auto_publish boolean NOT NULL DEFAULT false;

CREATE TABLE public.video_clips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  from_s numeric NOT NULL DEFAULT 0,
  to_s numeric NOT NULL DEFAULT 0,
  trim_start numeric NOT NULL DEFAULT 0,
  trim_end numeric NOT NULL DEFAULT 0,
  prompt text,
  video_url text,
  source text NOT NULL DEFAULT 'generated',
  status text NOT NULL DEFAULT 'generated',
  transition text NOT NULL DEFAULT 'cut',
  volume numeric NOT NULL DEFAULT 1,
  is_deleted boolean NOT NULL DEFAULT false,
  provider_job_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_clips TO authenticated;
GRANT ALL ON public.video_clips TO service_role;
ALTER TABLE public.video_clips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.video_clips FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.video_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'analysis',
  checks jsonb NOT NULL DEFAULT '[]'::jsonb,
  failed_segments jsonb NOT NULL DEFAULT '[]'::jsonb,
  recommendations jsonb NOT NULL DEFAULT '[]'::jsonb,
  report text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_reviews TO authenticated;
GRANT ALL ON public.video_reviews TO service_role;
ALTER TABLE public.video_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.video_reviews FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.video_audio_tracks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'sfx',
  label text NOT NULL,
  url text,
  start_s numeric NOT NULL DEFAULT 0,
  volume numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_audio_tracks TO authenticated;
GRANT ALL ON public.video_audio_tracks TO service_role;
ALTER TABLE public.video_audio_tracks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.video_audio_tracks FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.video_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  kind text NOT NULL,
  url text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.video_assets TO authenticated;
GRANT ALL ON public.video_assets TO service_role;
ALTER TABLE public.video_assets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows" ON public.video_assets FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.production_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  action text NOT NULL,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.production_history TO authenticated;
GRANT ALL ON public.production_history TO service_role;
ALTER TABLE public.production_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own rows read" ON public.production_history FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "own rows insert" ON public.production_history FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());