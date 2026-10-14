-- Apply in the shared project's administrative SQL editor after Vault provisioning.
-- Prerequisites: pg_cron + pg_net enabled by the project's administrator.
-- This migration changes only mukmuk functions/jobs and their explicit ACLs.
BEGIN;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_cron')
    OR NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_net') THEN
    RAISE EXCEPTION 'Enable pg_cron and pg_net before installing mukmuk jobs';
  END IF;
  IF (SELECT count(*) FROM vault.secrets WHERE name IN ('mukmuk_project_url','mukmuk_cleanup_secret'))<>2 THEN
    RAISE EXCEPTION 'Provision exactly the two mukmuk Vault secrets first';
  END IF;
END $$;
SET LOCAL ROLE mukmuk_owner;
CREATE FUNCTION solitary_athlete.mukmuk_dispatch_cleanup() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE request_id bigint;
BEGIN
  IF EXISTS (
    SELECT 1 FROM solitary_athlete.reply_cleanup_jobs
    WHERE status IN ('preparing','scheduled','processing')
      AND (lease_until IS NULL OR lease_until<=now())
      AND (next_attempt_at IS NULL OR next_attempt_at<=now())
      AND (token_expires_at<=now() OR delete_after<=now()
        OR (published_at IS NULL AND created_at<=now()-interval '60 seconds'))
  ) THEN
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='mukmuk_project_url') || '/functions/v1/mukmuk-discord-cleanup',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','X-Mukmuk-Cleanup-Secret',
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='mukmuk_cleanup_secret')),
      timeout_milliseconds := 10000
    ) INTO request_id;
  END IF;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_dispatch_cleanup() FROM PUBLIC,anon,authenticated,service_role,mukmuk_worker;
GRANT EXECUTE ON FUNCTION solitary_athlete.mukmuk_dispatch_cleanup() TO postgres;
RESET ROLE;
SELECT cron.schedule('mukmuk-cleanup-due','10 seconds','SELECT solitary_athlete.mukmuk_dispatch_cleanup();');
-- Keep only this app's successful/failed Cron history for seven days.
SELECT cron.schedule('mukmuk-cleanup-history','23 0 * * *',
  $job$DELETE FROM cron.job_run_details WHERE jobid IN
    (SELECT jobid FROM cron.job WHERE jobname IN ('mukmuk-cleanup-due','mukmuk-cleanup-history'))
    AND end_time<now()-interval '7 days';$job$);
COMMIT;
