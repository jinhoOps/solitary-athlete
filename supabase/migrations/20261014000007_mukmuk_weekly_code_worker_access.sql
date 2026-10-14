BEGIN;
SET LOCAL ROLE mukmuk_owner;
GRANT USAGE ON SEQUENCE solitary_athlete.channel_access_secrets_id_seq TO mukmuk_worker;
CREATE POLICY mukmuk_worker_secret_read ON solitary_athlete.channel_access_secrets
  FOR SELECT TO mukmuk_worker USING (true);
CREATE POLICY mukmuk_worker_secret_insert ON solitary_athlete.channel_access_secrets
  FOR INSERT TO mukmuk_worker WITH CHECK (true);
RESET ROLE;
COMMIT;
