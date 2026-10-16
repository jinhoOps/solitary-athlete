BEGIN;
SET LOCAL ROLE mukmuk_owner;
CREATE TABLE solitary_athlete.workout_refresh_jobs (
 id text PRIMARY KEY CHECK (id ~ '^[0-9]+$'),
 requester_id text NOT NULL CHECK (requester_id ~ '^[0-9]+$'),
 target_id text NOT NULL CHECK (target_id ~ '^[0-9]+$'),
 guild_id text NOT NULL CHECK (guild_id='1559802401802952706'),
 channel_id text NOT NULL CHECK (channel_id='1559804769327910932'),
 upper_id text NOT NULL CHECK (upper_id ~ '^[0-9]+$'),
 cursor_id text NOT NULL DEFAULT '0' CHECK (cursor_id ~ '^[0-9]+$'),
 status text NOT NULL CHECK(status IN ('queued','running','done','failed')),
 total integer NOT NULL DEFAULT 0 CHECK(total>=0),
 checked integer NOT NULL DEFAULT 0 CHECK(checked>=0),
 removed integer NOT NULL DEFAULT 0 CHECK(removed>=0),
 failures integer NOT NULL DEFAULT 0,
 version integer NOT NULL DEFAULT 0,
 next_attempt_at timestamptz NOT NULL DEFAULT now(),
 lease_until timestamptz,
 error_code text,
 created_at timestamptz NOT NULL DEFAULT now(),
 processed_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX workout_refresh_active_target ON solitary_athlete.workout_refresh_jobs(target_id)
 WHERE status IN ('queued','running');
CREATE INDEX workout_refresh_due ON solitary_athlete.workout_refresh_jobs(next_attempt_at,processed_at)
 WHERE status IN ('queued','running');
ALTER TABLE solitary_athlete.workout_refresh_jobs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON solitary_athlete.workout_refresh_jobs FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE,DELETE ON solitary_athlete.workout_refresh_jobs TO mukmuk_worker;
CREATE POLICY refresh_worker ON solitary_athlete.workout_refresh_jobs FOR ALL TO mukmuk_worker USING(true) WITH CHECK(true);
CREATE FUNCTION solitary_athlete.enqueue_workout_refresh(p_id text,p_requester text,p_target text,p_guild text,p_channel text)
RETURNS SETOF solitary_athlete.workout_refresh_jobs LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v_upper text; v_total integer;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('solitary_athlete.refresh'),hashtext(p_target));
 IF EXISTS(SELECT 1 FROM solitary_athlete.workout_refresh_jobs WHERE id=p_id) THEN
  RETURN QUERY SELECT * FROM solitary_athlete.workout_refresh_jobs WHERE id=p_id; RETURN;
 END IF;
 IF EXISTS(SELECT 1 FROM solitary_athlete.workout_refresh_jobs WHERE target_id=p_target AND status IN ('queued','running')) THEN
  RETURN QUERY SELECT * FROM solitary_athlete.workout_refresh_jobs WHERE target_id=p_target AND status IN ('queued','running'); RETURN;
 END IF;
 SELECT coalesce(max(message_id::numeric),0)::text,count(*)::integer INTO v_upper,v_total
 FROM solitary_athlete.workout_events WHERE user_id=p_target AND guild_id=p_guild AND channel_id=p_channel;
 RETURN QUERY INSERT INTO solitary_athlete.workout_refresh_jobs(id,requester_id,target_id,guild_id,channel_id,upper_id,total,status)
 VALUES(p_id,p_requester,p_target,p_guild,p_channel,v_upper,v_total,CASE WHEN v_total=0 THEN 'done' ELSE 'queued' END) RETURNING *;
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.enqueue_workout_refresh(text,text,text,text,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.enqueue_workout_refresh(text,text,text,text,text) TO mukmuk_worker;
RESET ROLE;
COMMIT;
