-- App-scoped weekly dispatch; no reusable secret or generated code in pg_net queues.
BEGIN;
SET LOCAL ROLE mukmuk_owner;
CREATE OR REPLACE FUNCTION solitary_athlete.mukmuk_dispatch_weekly_code() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE request_id bigint; stamp text; nonce text; signature text;
BEGIN
  stamp := floor(extract(epoch FROM clock_timestamp()))::text;
  nonce := gen_random_uuid()::text;
  signature := encode(extensions.hmac('mukmuk-weekly-code-v1:' || stamp || ':' || nonce,
    (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='mukmuk_cleanup_secret'),'sha256'),'hex');
  SELECT net.http_post(
    url := (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name='mukmuk_project_url') || '/functions/v1/mukmuk-weekly-code',
    body := '{}'::jsonb,
    headers := jsonb_build_object('Content-Type','application/json','X-Mukmuk-Timestamp',stamp,
      'X-Mukmuk-Nonce',nonce,'X-Mukmuk-Signature',signature),
    timeout_milliseconds := 10000
  ) INTO request_id;
  RETURN request_id;
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_dispatch_weekly_code() FROM PUBLIC,anon,authenticated,service_role,mukmuk_worker;
GRANT EXECUTE ON FUNCTION solitary_athlete.mukmuk_dispatch_weekly_code() TO postgres;
RESET ROLE;
SELECT cron.schedule('mukmuk-weekly-code','0 15 * * 0','SELECT solitary_athlete.mukmuk_dispatch_weekly_code();');
COMMIT;
