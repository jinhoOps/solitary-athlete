BEGIN;
SET LOCAL ROLE mukmuk_owner;
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));

CREATE TABLE solitary_athlete.mukmuk_identity_state (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 0 CHECK(revision>=0),
 source_revision bigint NOT NULL DEFAULT 0 CHECK(source_revision>=0)
);
INSERT INTO solitary_athlete.mukmuk_identity_state DEFAULT VALUES;

CREATE TABLE solitary_athlete.mukmuk_people (
 person_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 primary_user_id text NOT NULL UNIQUE CHECK(primary_user_id ~ '^[0-9]{1,22}$'),
 username text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE solitary_athlete.mukmuk_person_accounts (
 guild_id text NOT NULL CHECK(guild_id ~ '^[0-9]{1,22}$'),
 user_id text NOT NULL CHECK(user_id ~ '^[0-9]{1,22}$'),
 person_id uuid NOT NULL REFERENCES solitary_athlete.mukmuk_people,
 valid_from bigint NOT NULL CHECK(valid_from>=0),
 valid_until bigint CHECK(valid_until>valid_from),
 PRIMARY KEY(user_id,valid_from)
);
CREATE UNIQUE INDEX mukmuk_account_current ON solitary_athlete.mukmuk_person_accounts(user_id) WHERE valid_until IS NULL;
CREATE INDEX mukmuk_accounts_person ON solitary_athlete.mukmuk_person_accounts(person_id,valid_from);

DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['mukmuk_identity_state','mukmuk_people','mukmuk_person_accounts'] LOOP
  EXECUTE format('ALTER TABLE solitary_athlete.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON solitary_athlete.%I FROM PUBLIC,anon,authenticated,service_role',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON solitary_athlete.%I TO mukmuk_worker',t);
  EXECUTE format('CREATE POLICY mukmuk_worker_access ON solitary_athlete.%I FOR ALL TO mukmuk_worker USING(true) WITH CHECK(true)',t);
 END LOOP;
END $$;

CREATE FUNCTION solitary_athlete.mukmuk_check_membership() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE old_start bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
 IF TG_OP='UPDATE' THEN
  old_start:=OLD.valid_from;
  IF (NEW.user_id,NEW.guild_id,NEW.person_id,NEW.valid_from) IS DISTINCT FROM
     (OLD.user_id,OLD.guild_id,OLD.person_id,OLD.valid_from) THEN
   RAISE EXCEPTION 'immutable_membership' USING ERRCODE='23514';
  END IF;
 END IF;
 IF EXISTS(SELECT 1 FROM solitary_athlete.mukmuk_person_accounts a
   WHERE a.user_id=NEW.user_id AND (old_start IS NULL OR a.valid_from<>old_start)
   AND int8range(a.valid_from,a.valid_until,'[)') && int8range(NEW.valid_from,NEW.valid_until,'[)')) THEN
  RAISE EXCEPTION 'overlapping_membership' USING ERRCODE='23P01';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER mukmuk_membership_guard BEFORE INSERT OR UPDATE ON solitary_athlete.mukmuk_person_accounts
 FOR EACH ROW EXECUTE FUNCTION solitary_athlete.mukmuk_check_membership();

CREATE FUNCTION solitary_athlete.mukmuk_ensure_person(p_user_id text,p_username text,p_guild_id text)
RETURNS uuid LANGUAGE plpgsql SET search_path='' AS $$
DECLARE person uuid; rev bigint;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
 SELECT revision INTO STRICT rev FROM solitary_athlete.mukmuk_identity_state WHERE singleton;
 INSERT INTO solitary_athlete.mukmuk_people(primary_user_id,username) VALUES(p_user_id,p_username)
 ON CONFLICT(primary_user_id) DO UPDATE SET username=EXCLUDED.username RETURNING person_id INTO person;
 IF NOT EXISTS(SELECT 1 FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=p_user_id AND valid_until IS NULL) THEN
  INSERT INTO solitary_athlete.mukmuk_person_accounts(guild_id,user_id,person_id,valid_from)
  VALUES(p_guild_id,p_user_id,person,rev);
 END IF;
 RETURN person;
END $$;

INSERT INTO solitary_athlete.mukmuk_people(primary_user_id,username)
 SELECT DISTINCT ON(user_id) user_id,username FROM solitary_athlete.workout_events
 ORDER BY user_id,created_at DESC,message_id::numeric DESC;
INSERT INTO solitary_athlete.mukmuk_person_accounts(guild_id,user_id,person_id,valid_from)
 SELECT DISTINCT e.guild_id,e.user_id,p.person_id,0 FROM solitary_athlete.workout_events e
 JOIN solitary_athlete.mukmuk_people p ON p.primary_user_id=e.user_id;

CREATE FUNCTION solitary_athlete.mukmuk_track_source() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE latest_name text;
BEGIN
 IF TG_OP='UPDATE' AND
   (OLD.guild_id,OLD.channel_id,OLD.user_id,OLD.username,OLD.created_at,OLD.memo,OLD.has_photo,OLD.attachments)
   IS NOT DISTINCT FROM
   (NEW.guild_id,NEW.channel_id,NEW.user_id,NEW.username,NEW.created_at,NEW.memo,NEW.has_photo,NEW.attachments) THEN
  RETURN NULL;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
 IF TG_OP<>'DELETE' THEN
  SELECT username INTO latest_name FROM solitary_athlete.workout_events WHERE user_id=NEW.user_id
   ORDER BY created_at DESC,message_id::numeric DESC LIMIT 1;
  PERFORM solitary_athlete.mukmuk_ensure_person(NEW.user_id,coalesce(latest_name,NEW.username),NEW.guild_id);
 END IF;
 UPDATE solitary_athlete.mukmuk_identity_state SET source_revision=source_revision+1 WHERE singleton;
 RETURN NULL;
END $$;
CREATE TRIGGER mukmuk_source_identity AFTER INSERT OR UPDATE OR DELETE ON solitary_athlete.workout_events
 FOR EACH ROW EXECUTE FUNCTION solitary_athlete.mukmuk_track_source();

CREATE FUNCTION solitary_athlete.mukmuk_person_days(
 p_revision bigint,p_from date DEFAULT NULL,p_until date DEFAULT NULL,p_person_id uuid DEFAULT NULL
) RETURNS TABLE(person_id uuid,username text,log_date date,memo text,verification_count integer,has_photo boolean)
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF p_revision IS NULL OR p_revision<0 THEN RAISE EXCEPTION 'invalid_identity_revision'; END IF;
 IF p_from IS NOT NULL AND p_until IS NOT NULL AND p_from>=p_until THEN RAISE EXCEPTION 'invalid_date_range'; END IF;
 IF EXISTS(SELECT 1 FROM solitary_athlete.workout_events e
   WHERE (p_from IS NULL OR e.log_date>=p_from) AND (p_until IS NULL OR e.log_date<p_until)
   AND NOT EXISTS(SELECT 1 FROM solitary_athlete.mukmuk_person_accounts a
    WHERE a.user_id=e.user_id AND a.guild_id=e.guild_id AND a.valid_from<=p_revision
    AND (a.valid_until IS NULL OR p_revision<a.valid_until))) THEN
  RAISE EXCEPTION 'missing_membership';
 END IF;
 RETURN QUERY SELECT a.person_id,p.username,e.log_date,
   string_agg(CASE WHEN e.memo='' THEN '사진 인증' ELSE e.memo END,E'\n' ORDER BY e.created_at,e.message_id::numeric),
   count(*)::integer,bool_or(e.has_photo)
 FROM solitary_athlete.workout_events e JOIN solitary_athlete.mukmuk_person_accounts a
  ON a.user_id=e.user_id AND a.guild_id=e.guild_id AND a.valid_from<=p_revision
   AND (a.valid_until IS NULL OR p_revision<a.valid_until)
 JOIN solitary_athlete.mukmuk_people p ON p.person_id=a.person_id
 WHERE (p_from IS NULL OR e.log_date>=p_from) AND (p_until IS NULL OR e.log_date<p_until)
   AND (p_person_id IS NULL OR a.person_id=p_person_id)
 GROUP BY a.person_id,p.username,e.log_date;
END $$;

REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_check_membership(),
 solitary_athlete.mukmuk_track_source(),solitary_athlete.mukmuk_ensure_person(text,text,text),
 solitary_athlete.mukmuk_person_days(bigint,date,date,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.mukmuk_ensure_person(text,text,text),
 solitary_athlete.mukmuk_person_days(bigint,date,date,uuid) TO mukmuk_worker;
RESET ROLE;
COMMIT;
