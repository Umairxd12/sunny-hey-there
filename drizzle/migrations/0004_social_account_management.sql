ALTER TABLE public.social_accounts
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS token_status text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS token_expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS scopes text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS last_sync_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_published_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_published_title text,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
CREATE UNIQUE INDEX IF NOT EXISTS social_accounts_user_platform_ext ON public.social_accounts(user_id, platform, external_id);

-- Encrypted tokens: server-only, never readable by app users.
CREATE TABLE public.social_tokens (
  account_id uuid PRIMARY KEY REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  access_token_enc text NOT NULL,
  refresh_token_enc text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.social_tokens TO service_role;
ALTER TABLE public.social_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.oauth_states (
  state text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  platform text NOT NULL,
  redirect_uri text NOT NULL,
  code_verifier text,
  reconnect_account_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.oauth_states TO service_role;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.project_social_accounts (
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, account_id)
);
GRANT SELECT, INSERT, DELETE ON public.project_social_accounts TO authenticated;
GRANT ALL ON public.project_social_accounts TO service_role;
ALTER TABLE public.project_social_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "own project accounts" ON public.project_social_accounts FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

ALTER TABLE public.scheduled_posts
  ADD COLUMN IF NOT EXISTS social_account_id uuid REFERENCES public.social_accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS options jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_error text;