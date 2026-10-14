-- pg_net request queues are readable by shared roles in the hosted project.
-- Send a short-lived HMAC instead of the reusable Vault secret. No global ACL changes.
BEGIN;
SET LOCAL ROLE mukmuk_owner;
CREATE OR REPLACE FUNCTION solitary_athlete.mukmuk_dispatch_cleanup() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE request_id bigint; stamp text; nonce text; signature text;
BEGIN
  IF EXISTS (
    SELECT 1 FROM solitary_athlete.reply_cleanup_jobs
    WHERE status IN ('preparing','scheduled','processing')
      AND (lease_until IS NULL OR lease_until<=now())
      AND (next_attempt_at IS NULL OR next_attempt_at<=now())
      AND (token_expires_at<=now() OR delete_after<=now()
        OR (published_at IS NULL AND created_at<=now()-interval '60 seconds'))
  ) THEN
    stamp := floor(extract(epoch FROM clock_timestamp()))::text;
    nonce := gen_random_uuid()::text;
    signature := encode(extensions.hmac('mukmuk-cleanup-v1:' || stamp || ':' || nonce,
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='mukmuk_cleanup_secret'),'sha256'),'hex');
    SELECT net.http_post(
      url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='mukmuk_project_url') || '/functions/v1/mukmuk-discord-cleanup',
      body := '{}'::jsonb,
      headers := jsonb_build_object('Content-Type','application/json','X-Mukmuk-Timestamp',stamp,
        'X-Mukmuk-Nonce',nonce,'X-Mukmuk-Signature',signature),
      timeout_milliseconds := 10000
    ) INTO request_id;
  END IF;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_dispatch_cleanup() FROM PUBLIC,anon,authenticated,service_role,mukmuk_worker;
GRANT EXECUTE ON FUNCTION solitary_athlete.mukmuk_dispatch_cleanup() TO postgres;
RESET ROLE;
COMMIT;
