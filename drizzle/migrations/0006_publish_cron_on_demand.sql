-- lovable-cron-fallback-reviewed: posts must go out at user-chosen times; job is created only when posts are queued and removed when the queue drains
CREATE OR REPLACE FUNCTION public.ensure_publish_cron()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $fn$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-due-posts') THEN
    PERFORM cron.schedule('publish-due-posts', '*/5 * * * *', $job$
      SELECT net.http_post(
        url := 'https://project--9f3b37cb-5ae3-4812-9417-a169eeaa073e-dev.lovable.app/api/public/hooks/publish-due',
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret',(SELECT value FROM public.internal_config WHERE key='cron_secret')),
        body := '{}'::jsonb);
    $job$);
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.stop_publish_cron_if_idle()
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, cron AS $fn$
BEGIN
  IF EXISTS (SELECT 1 FROM public.scheduled_posts WHERE status IN ('SCHEDULED','RETRYING','PROCESSING','PUBLISHING')) THEN
    RETURN false;
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-due-posts') THEN
    PERFORM cron.unschedule('publish-due-posts');
  END IF;
  RETURN true;
END $fn$;

CREATE OR REPLACE FUNCTION public.scheduled_posts_wake_publisher()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
BEGIN
  IF NEW.status IN ('SCHEDULED','RETRYING','PROCESSING') THEN
    PERFORM public.ensure_publish_cron();
  END IF;
  RETURN NEW;
END $fn$;

CREATE TRIGGER scheduled_posts_wake_publisher
AFTER INSERT OR UPDATE OF status ON public.scheduled_posts
FOR EACH ROW EXECUTE FUNCTION public.scheduled_posts_wake_publisher();

REVOKE ALL ON FUNCTION public.ensure_publish_cron() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stop_publish_cron_if_idle() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.scheduled_posts_wake_publisher() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.stop_publish_cron_if_idle() TO service_role;