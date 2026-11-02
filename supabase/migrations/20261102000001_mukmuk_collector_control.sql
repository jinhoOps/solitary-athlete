-- Additive coordination state; existing collectors remain authoritative until switched.
BEGIN;
SET LOCAL ROLE mukmuk_owner;
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
CREATE TABLE solitary_athlete.mukmuk_collector_control (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 writer_mode text NOT NULL DEFAULT 'python' CHECK(writer_mode IN ('python','go','paused')),
 owner_id uuid,
 fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0),
 lease_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO solitary_athlete.mukmuk_collector_control DEFAULT VALUES;
CREATE TABLE solitary_athlete.mukmuk_collection_runs (
 id uuid PRIMARY KEY,
 fence bigint NOT NULL,
 status text NOT NULL CHECK(status IN ('running','completed','failed')),
 started_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 completed_at timestamptz,
 ceiling_id text CHECK(ceiling_id IS NULL OR ceiling_id ~ '^[0-9]+$'),
 message_count integer NOT NULL DEFAULT 0 CHECK(message_count>=0)
);
CREATE INDEX mukmuk_runs_retention ON solitary_athlete.mukmuk_collection_runs(started_at) WHERE status IN ('completed','failed');
CREATE TABLE solitary_athlete.mukmuk_collection_effects (
 run_id uuid NOT NULL REFERENCES solitary_athlete.mukmuk_collection_runs(id),
 kind text NOT NULL CHECK(kind IN ('identity','board')),
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','expired')),
 expires_at timestamptz,
 lease_until timestamptz,
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 PRIMARY KEY(run_id,kind)
);
CREATE TABLE solitary_athlete.mukmuk_board_publication (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 last_success_at timestamptz,
 source_revision bigint,
 identity_revision bigint,
 owner_id uuid,
 run_id uuid REFERENCES solitary_athlete.mukmuk_collection_runs(id),
 lease_until timestamptz
);
INSERT INTO solitary_athlete.mukmuk_board_publication DEFAULT VALUES;
CREATE INDEX mukmuk_effects_pending ON solitary_athlete.mukmuk_collection_effects(kind,status,run_id)
 WHERE status IN ('queued','processing');
DO $$
DECLARE n text;
BEGIN
 FOREACH n IN ARRAY ARRAY['mukmuk_collector_control','mukmuk_collection_runs','mukmuk_collection_effects','mukmuk_board_publication'] LOOP
  EXECUTE format('ALTER TABLE solitary_athlete.%I ENABLE ROW LEVEL SECURITY',n);
  EXECUTE format('REVOKE ALL ON solitary_athlete.%I FROM PUBLIC,anon,authenticated,service_role',n);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE ON solitary_athlete.%I TO mukmuk_worker',n);
  EXECUTE format('CREATE POLICY collector_worker ON solitary_athlete.%I FOR ALL TO mukmuk_worker USING(true) WITH CHECK(true)',n);
 END LOOP;
END $$;
GRANT DELETE ON solitary_athlete.mukmuk_collection_runs,solitary_athlete.mukmuk_collection_effects TO mukmuk_worker;
RESET ROLE;
COMMIT;
