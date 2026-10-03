
-- Every automation job (pipeline stage, publish, status check, analytics sync, account action)
CREATE TABLE public.automation_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  label text NOT NULL,
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('queued','running','succeeded','failed','blocked','retrying','skipped')),
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  post_id uuid REFERENCES public.scheduled_posts(id) ON DELETE SET NULL,
  provider text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  error text,
  retry_count integer NOT NULL DEFAULT 0,
  provider_response jsonb,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_jobs_user_started ON public.automation_jobs (user_id, started_at DESC);
CREATE INDEX automation_jobs_status ON public.automation_jobs (user_id, status);
GRANT SELECT ON public.automation_jobs TO authenticated;
GRANT ALL ON public.automation_jobs TO service_role;
ALTER TABLE public.automation_jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own jobs" ON public.automation_jobs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Human-readable activity + audit log. Written only by the server or by security-definer triggers.
CREATE TABLE public.activity_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category text NOT NULL CHECK (category IN ('production','publishing','analytics','account','security','settings')),
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info','success','warning','error')),
  event text NOT NULL,
  detail text,
  project_id uuid REFERENCES public.projects(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.automation_jobs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX activity_log_user_created ON public.activity_log (user_id, created_at DESC);
GRANT SELECT ON public.activity_log TO authenticated;
GRANT ALL ON public.activity_log TO service_role;
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own activity" ON public.activity_log FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

-- Audit triggers for changes made directly from the browser.
CREATE OR REPLACE FUNCTION public.audit_emergency_stop()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.emergency_stop) OR (TG_OP = 'UPDATE' AND NEW.emergency_stop IS DISTINCT FROM OLD.emergency_stop) THEN
    INSERT INTO public.activity_log (user_id, category, level, event, detail)
    VALUES (NEW.user_id, 'security', CASE WHEN NEW.emergency_stop THEN 'warning' ELSE 'info' END,
      CASE WHEN NEW.emergency_stop THEN 'Emergency stop turned on' ELSE 'Emergency stop turned off' END,
      CASE WHEN NEW.emergency_stop THEN 'All future automatic publishing is stopped.' ELSE 'Automatic publishing can run again.' END);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_emergency_stop AFTER INSERT OR UPDATE ON public.automation_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_emergency_stop();

CREATE OR REPLACE FUNCTION public.audit_skill_version()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := coalesce(auth.uid(), NEW.created_by);
BEGIN
  IF _uid IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.activity_log (user_id, category, event, detail)
    VALUES (_uid, 'settings', 'Skill version uploaded', coalesce(NEW.name, NEW.file_name) || ' v' || NEW.version);
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.activity_log (user_id, category, level, event, detail)
    VALUES (_uid, 'settings', CASE WHEN NEW.status = 'active' THEN 'success' ELSE 'info' END,
      CASE WHEN NEW.status = 'active' THEN 'Skill version activated' ELSE 'Skill version deactivated' END,
      coalesce(NEW.name, NEW.file_name) || ' v' || NEW.version);
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_skill_version AFTER INSERT OR UPDATE ON public.skill_versions
  FOR EACH ROW EXECUTE FUNCTION public.audit_skill_version();

CREATE OR REPLACE FUNCTION public.audit_social_token_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.token_status IS DISTINCT FROM OLD.token_status AND NEW.token_status IN ('expired','invalid') THEN
    INSERT INTO public.activity_log (user_id, category, level, event, detail)
    VALUES (NEW.user_id, 'security', 'warning',
      initcap(NEW.platform) || ' access ' || NEW.token_status || ' — reconnect needed',
      coalesce(NEW.account_name, '') || coalesce(': ' || left(NEW.last_error, 200), ''));
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER audit_social_token_status AFTER UPDATE ON public.social_accounts
  FOR EACH ROW EXECUTE FUNCTION public.audit_social_token_status();

REVOKE EXECUTE ON FUNCTION public.audit_emergency_stop() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_skill_version() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.audit_social_token_status() FROM PUBLIC, anon, authenticated;
