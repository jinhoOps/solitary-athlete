-- App-scoped monthly secret code dispatch; executes on the 1st of each month in KST.
BEGIN;
SET LOCAL ROLE mukmuk_owner;

CREATE OR REPLACE FUNCTION solitary_athlete.mukmuk_dispatch_monthly_code() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE request_id bigint; stamp text; nonce text; signature text;
BEGIN
  -- Only execute on the 1st day of the month in Asia/Seoul (KST)
  IF EXTRACT(DAY FROM (now() AT TIME ZONE 'Asia/Seoul')) <> 1 THEN
    RETURN 0;
  END IF;

  stamp := floor(extract(epoch FROM clock_timestamp()))::text;
  nonce := gen_random_uuid()::text;
  signature := encode(extensions.hmac('mukmuk-monthly-code-v1:' || stamp || ':' || nonce,
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

REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_dispatch_monthly_code() FROM PUBLIC,anon,authenticated,service_role,mukmuk_worker;
GRANT EXECUTE ON FUNCTION solitary_athlete.mukmuk_dispatch_monthly_code() TO postgres;

-- Keep mukmuk_dispatch_weekly_code() as alias/wrapper if called manually
CREATE OR REPLACE FUNCTION solitary_athlete.mukmuk_dispatch_weekly_code() RETURNS bigint
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
  RETURN solitary_athlete.mukmuk_dispatch_monthly_code();
END $$;

REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_dispatch_weekly_code() FROM PUBLIC,anon,authenticated,service_role,mukmuk_worker;
GRANT EXECUTE ON FUNCTION solitary_athlete.mukmuk_dispatch_weekly_code() TO postgres;

RESET ROLE;

-- Unschedule old weekly cron
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mukmuk-weekly-code') THEN
    PERFORM cron.unschedule('mukmuk-weekly-code');
  END IF;
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'mukmuk-monthly-code') THEN
    PERFORM cron.unschedule('mukmuk-monthly-code');
  END IF;
END $$;

-- Schedule daily at 15:00 UTC (= 00:00 KST). It checks if today is 1st of month.
SELECT cron.schedule('mukmuk-monthly-code','0 15 * * *','SELECT solitary_athlete.mukmuk_dispatch_monthly_code();');

COMMIT;
