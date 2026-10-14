-- 묵묵: daily proof storage and app-scoped access.
-- Apply once to the shared Seoul project after the common schema initialization.
-- No project keys, passwords or shared default-privilege changes.
BEGIN;
CREATE ROLE mukmuk_owner NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE ROLE mukmuk_worker NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS
  CONNECTION LIMIT 3;
GRANT mukmuk_owner, mukmuk_worker TO postgres;
GRANT USAGE, CREATE ON SCHEMA solitary_athlete TO mukmuk_owner;
GRANT USAGE ON SCHEMA solitary_athlete TO mukmuk_worker;
SET LOCAL ROLE mukmuk_owner;

CREATE TABLE solitary_athlete.workout_events (
  message_id text PRIMARY KEY CHECK (message_id ~ '^[0-9]+$'),
  guild_id text NOT NULL CHECK (guild_id = '1559802401802952706'),
  channel_id text NOT NULL CHECK (channel_id = '1559804769327910932'),
  user_id text NOT NULL CHECK (user_id ~ '^[0-9]+$'),
  username text NOT NULL,
  created_at timestamptz NOT NULL,
  edited_at timestamptz,
  log_date date GENERATED ALWAYS AS
    ((created_at AT TIME ZONE 'Asia/Seoul')::date) STORED,
  memo text NOT NULL,
  has_photo boolean NOT NULL DEFAULT false,
  reacted_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (length(btrim(memo)) > 0 OR has_photo)
);
CREATE INDEX workout_events_user_date
  ON solitary_athlete.workout_events (user_id, log_date, created_at, message_id);

CREATE TABLE solitary_athlete.workout_logs (
  user_id text NOT NULL CHECK (user_id ~ '^[0-9]+$'),
  log_date date NOT NULL,
  username text NOT NULL,
  memo text NOT NULL,
  verification_count integer NOT NULL CHECK (verification_count > 0),
  has_photo boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, log_date)
);
CREATE INDEX workout_logs_date_user
  ON solitary_athlete.workout_logs (log_date DESC, user_id);

CREATE TABLE solitary_athlete.sync_state (
  channel_id text PRIMARY KEY CHECK (channel_id = '1559804769327910932'),
  last_message_id text,
  last_success_at timestamptz,
  board_message_ids text[] NOT NULL DEFAULT '{}'
);
CREATE TABLE solitary_athlete.sync_status (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  last_success_at timestamptz
);
CREATE TABLE solitary_athlete.reply_cleanup_jobs (
  interaction_id text PRIMARY KEY CHECK (interaction_id ~ '^[0-9]+$'),
  application_id text NOT NULL CHECK (application_id = '1559809751603216444'),
  token_ciphertext bytea,
  token_expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'preparing'
    CHECK (status IN ('preparing', 'scheduled', 'processing', 'done', 'failed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  published_at timestamptz,
  delete_after timestamptz,
  next_attempt_at timestamptz,
  lease_until timestamptz,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  last_error_code text,
  CHECK (delete_after IS NULL OR
    (published_at IS NOT NULL AND delete_after = published_at + interval '300 seconds')),
  CHECK (status IN ('done', 'failed') OR token_ciphertext IS NOT NULL),
  CHECK (status NOT IN ('done', 'failed') OR token_ciphertext IS NULL)
);
CREATE INDEX reply_cleanup_jobs_due
  ON solitary_athlete.reply_cleanup_jobs (delete_after, next_attempt_at)
  WHERE status IN ('scheduled', 'processing');

DO $$
DECLARE table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'workout_events', 'workout_logs', 'sync_state', 'sync_status', 'reply_cleanup_jobs'
  ] LOOP
    EXECUTE format('ALTER TABLE solitary_athlete.%I ENABLE ROW LEVEL SECURITY', table_name);
    EXECUTE format('REVOKE ALL ON solitary_athlete.%I FROM PUBLIC, anon, authenticated, service_role', table_name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON solitary_athlete.%I TO mukmuk_worker', table_name);
    EXECUTE format('CREATE POLICY mukmuk_worker_access ON solitary_athlete.%I FOR ALL TO mukmuk_worker USING (true) WITH CHECK (true)', table_name);
  END LOOP;
END $$;
GRANT SELECT ON solitary_athlete.workout_logs, solitary_athlete.sync_status TO anon;
CREATE POLICY public_workout_read ON solitary_athlete.workout_logs
  FOR SELECT TO anon USING (true);
CREATE POLICY public_sync_read ON solitary_athlete.sync_status
  FOR SELECT TO anon USING (true);
RESET ROLE;
COMMIT;
