BEGIN;
SET LOCAL ROLE mukmuk_owner;

CREATE TABLE solitary_athlete.channel_access_secrets (
  id serial PRIMARY KEY,
  secret_code text NOT NULL UNIQUE,
  issued_at timestamptz NOT NULL DEFAULT now(),
  active_until timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX channel_access_secrets_lookup
  ON solitary_athlete.channel_access_secrets (secret_code, expires_at);

ALTER TABLE solitary_athlete.channel_access_secrets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON solitary_athlete.channel_access_secrets FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON solitary_athlete.channel_access_secrets TO mukmuk_worker;

CREATE OR REPLACE FUNCTION solitary_athlete.get_workout_logs(
  p_secret_code text,
  p_year integer DEFAULT NULL
)
RETURNS TABLE (
  user_id text,
  username text,
  log_date date,
  has_photo boolean,
  memo text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_normalized_secret text;
  v_target_year integer;
BEGIN
  v_normalized_secret := lower(btrim(p_secret_code));
  IF v_normalized_secret IS NULL OR v_normalized_secret = '' THEN
    RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE = 'P0001';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM solitary_athlete.channel_access_secrets
    WHERE lower(secret_code) = v_normalized_secret
      AND now() <= expires_at
  ) THEN
    RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE = 'P0001';
  END IF;

  v_target_year := COALESCE(p_year, EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Seoul'))::integer);

  RETURN QUERY
  SELECT l.user_id, l.username, l.log_date, l.has_photo, l.memo
  FROM solitary_athlete.workout_logs l
  WHERE EXTRACT(YEAR FROM l.log_date) = v_target_year
  ORDER BY l.log_date DESC, l.user_id ASC;
END;
$$;

REVOKE SELECT ON solitary_athlete.workout_logs FROM anon;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_workout_logs(text, integer) TO anon, authenticated;

RESET ROLE;
COMMIT;
