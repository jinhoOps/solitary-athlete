BEGIN;
SET LOCAL ROLE mukmuk_owner;
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
CREATE TABLE solitary_athlete.mukmuk_account_link_requests (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 creation_interaction_id text NOT NULL UNIQUE CHECK(creation_interaction_id ~ '^[0-9]{1,22}$'),
 guild_id text NOT NULL, kind text NOT NULL CHECK(kind IN ('link','unlink')),
 requester_id text NOT NULL, primary_user_id text NOT NULL, target_user_id text NOT NULL,
 person_id uuid NOT NULL REFERENCES solitary_athlete.mukmuk_people,
 group_fingerprint jsonb NOT NULL,
 status text NOT NULL CHECK(status IN ('awaiting_consent','pending_review','approved','applied','rejected','cancelled','expired','invalidated','failed')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0), content_version integer NOT NULL DEFAULT 1 CHECK(content_version=1),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '7 days',
 requester_consented_at timestamptz NOT NULL DEFAULT clock_timestamp(), target_consented_at timestamptz,
 reviewer_id text, reviewed_at timestamptz, approved_at timestamptz, applied_at timestamptz,
 rejection_reason text CHECK(length(rejection_reason) BETWEEN 1 AND 200),
 attempts integer NOT NULL DEFAULT 0, failures integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(), lease_until timestamptz, error_code text,
 CHECK(primary_user_id<>target_user_id), CHECK(failures>=0 AND attempts>=0)
);
CREATE INDEX mukmuk_link_requests_pending ON solitary_athlete.mukmuk_account_link_requests(status,next_attempt_at);
CREATE TABLE solitary_athlete.mukmuk_account_reviews (
 request_id uuid NOT NULL REFERENCES solitary_athlete.mukmuk_account_link_requests,
 reviewer_id text NOT NULL, request_version integer NOT NULL,
 identity_revision bigint NOT NULL, source_revision bigint NOT NULL,
 impact jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(request_id,reviewer_id)
);
CREATE TABLE solitary_athlete.mukmuk_account_link_actions (
 interaction_id text PRIMARY KEY CHECK(interaction_id ~ '^[0-9]{1,22}$'),
 actor_id text NOT NULL CHECK(actor_id ~ '^[0-9]{1,22}$'), kind text NOT NULL,
 payload jsonb NOT NULL,
 request_id uuid REFERENCES solitary_athlete.mukmuk_account_link_requests,
 runtime_session uuid, runtime_fence bigint,
 status text NOT NULL DEFAULT 'queued' CHECK(status IN ('queued','processing','done','expired','failed')),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 expires_at timestamptz NOT NULL DEFAULT clock_timestamp()+interval '15 seconds',
 result jsonb, attempts integer NOT NULL DEFAULT 0,
 CHECK((runtime_session IS NULL)=(runtime_fence IS NULL)),
 CHECK(expires_at>created_at), CHECK(attempts>=0)
);
CREATE INDEX mukmuk_actions_ready ON solitary_athlete.mukmuk_account_link_actions(runtime_session,status,created_at);
CREATE UNIQUE INDEX mukmuk_one_actor_action ON solitary_athlete.mukmuk_account_link_actions(actor_id) WHERE status IN ('queued','processing');
CREATE TABLE solitary_athlete.mukmuk_local_runtime (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 session_id uuid NOT NULL DEFAULT gen_random_uuid(), fence bigint NOT NULL DEFAULT 0 CHECK(fence>=0),
 ready boolean NOT NULL DEFAULT false, lease_until timestamptz NOT NULL DEFAULT '-infinity'
);
INSERT INTO solitary_athlete.mukmuk_local_runtime DEFAULT VALUES;
CREATE TABLE solitary_athlete.mukmuk_identity_changes (
 revision bigint PRIMARY KEY CHECK(revision>0),
 request_id uuid NOT NULL UNIQUE REFERENCES solitary_athlete.mukmuk_account_link_requests,
 reviewer_id text NOT NULL, changed_at timestamptz NOT NULL,
 change jsonb NOT NULL
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mukmuk_account_link_requests','mukmuk_account_reviews','mukmuk_account_link_actions','mukmuk_local_runtime','mukmuk_identity_changes'] LOOP
  EXECUTE format('ALTER TABLE solitary_athlete.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON solitary_athlete.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON solitary_athlete.%I TO mukmuk_worker',t);
  EXECUTE format('CREATE POLICY mukmuk_worker_access ON solitary_athlete.%I FOR ALL TO mukmuk_worker USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;
CREATE FUNCTION solitary_athlete.mukmuk_check_request_overlap() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
 IF NEW.status IN ('awaiting_consent','pending_review','approved') AND EXISTS(
   SELECT 1 FROM solitary_athlete.mukmuk_account_link_requests r WHERE r.id<>NEW.id
    AND r.status IN ('awaiting_consent','pending_review','approved')
    AND ARRAY[r.primary_user_id,r.target_user_id] && ARRAY[NEW.primary_user_id,NEW.target_user_id]) THEN
  RAISE EXCEPTION 'account_busy' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mukmuk_request_overlap BEFORE INSERT OR UPDATE ON solitary_athlete.mukmuk_account_link_requests
 FOR EACH ROW EXECUTE FUNCTION solitary_athlete.mukmuk_check_request_overlap();
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_check_request_overlap() FROM PUBLIC,anon,authenticated,service_role;
RESET ROLE;
COMMIT;
