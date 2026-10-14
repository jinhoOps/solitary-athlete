-- Run against a disposable database only; all fixtures roll back.
BEGIN;
SET LOCAL ROLE mukmuk_worker;
INSERT INTO solitary_athlete.workout_events
  (message_id, guild_id, channel_id, user_id, username, created_at, memo, has_photo)
VALUES ('1', '1559802401802952706', '1559804769327910932',
  '1', '검증용 가상 멤버', '2026-10-13T15:00:00Z', '걷기', true);
DO $$ BEGIN
  IF (SELECT log_date FROM solitary_athlete.workout_events WHERE message_id='1')
       <> date '2026-10-14' THEN RAISE EXCEPTION 'KST date mismatch'; END IF;
END $$;
INSERT INTO solitary_athlete.workout_logs
  (user_id, log_date, username, memo, verification_count, has_photo)
VALUES ('1', '2026-10-14', '검증용 가상 멤버', '걷기', 1, true);
DO $$ BEGIN
  BEGIN
    INSERT INTO solitary_athlete.workout_logs
      (user_id,log_date,username,memo,verification_count)
    VALUES ('1','2026-10-14','검증용 가상 멤버','중복',1);
    RAISE EXCEPTION 'duplicate daily row accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
END $$;

-- These checks catch incorrect KST boundaries, weakened input constraints,
-- duplicate events and cleanup-token retention/expiry errors.
INSERT INTO solitary_athlete.workout_events
  (message_id,guild_id,channel_id,user_id,username,created_at,memo,has_photo)
VALUES ('2','1559802401802952706','1559804769327910932','1',
 '검증용 가상 멤버','2026-10-13T14:59:59Z','',true);
DO $$ BEGIN
  IF (SELECT log_date FROM solitary_athlete.workout_events WHERE message_id='2')
       <> date '2026-10-13' THEN RAISE EXCEPTION 'KST pre-midnight mismatch'; END IF;
  BEGIN
    INSERT INTO solitary_athlete.workout_events
      (message_id,guild_id,channel_id,user_id,username,created_at,memo)
    VALUES ('1','1559802401802952706','1559804769327910932','1','검증용',now(),'중복');
    RAISE EXCEPTION 'duplicate message accepted';
  EXCEPTION WHEN unique_violation THEN NULL; END;
  BEGIN
    INSERT INTO solitary_athlete.workout_events
      (message_id,guild_id,channel_id,user_id,username,created_at,memo)
    VALUES ('3','1559802401802952706','1559804769327910932','1','검증용',now(),'   ');
    RAISE EXCEPTION 'empty proof accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO solitary_athlete.workout_events
      (message_id,guild_id,channel_id,user_id,username,created_at,memo)
    VALUES ('3','0','1559804769327910932','1','검증용',now(),'걷기');
    RAISE EXCEPTION 'foreign guild accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
INSERT INTO solitary_athlete.sync_status(singleton,last_success_at) VALUES(true,now());
INSERT INTO solitary_athlete.sync_state(channel_id) VALUES('1559804769327910932');
INSERT INTO solitary_athlete.reply_cleanup_jobs
 (interaction_id,application_id,token_ciphertext,token_expires_at,status,
  published_at,delete_after,next_attempt_at)
VALUES ('1','1559809751603216444',decode('010203','hex'),
 '2026-10-14T00:15:00Z','scheduled','2026-10-14T00:00:00Z',
 '2026-10-14T00:05:00Z','2026-10-14T00:05:00Z');
DO $$ BEGIN
  BEGIN
    UPDATE solitary_athlete.reply_cleanup_jobs
    SET delete_after='2026-10-14T00:04:59Z' WHERE interaction_id='1';
    RAISE EXCEPTION 'incorrect cleanup delay accepted';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE solitary_athlete.reply_cleanup_jobs SET status='done' WHERE interaction_id='1';
    RAISE EXCEPTION 'terminal token retained';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    UPDATE solitary_athlete.reply_cleanup_jobs SET token_ciphertext=NULL WHERE interaction_id='1';
    RAISE EXCEPTION 'active cleanup missing token';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
UPDATE solitary_athlete.reply_cleanup_jobs
 SET status='done',token_ciphertext=NULL WHERE interaction_id='1';

SET LOCAL ROLE anon;
DO $$
DECLARE table_name text;
BEGIN
  IF (SELECT count(*) FROM solitary_athlete.workout_logs
      WHERE user_id='1' AND log_date='2026-10-14' AND has_photo) <> 1
  THEN RAISE EXCEPTION 'public read failed'; END IF;
  IF (SELECT count(*) FROM solitary_athlete.sync_status WHERE singleton) <> 1
  THEN RAISE EXCEPTION 'public sync read failed'; END IF;
  BEGIN
    UPDATE solitary_athlete.workout_logs SET memo='unauthorized' WHERE user_id='1';
    RAISE EXCEPTION 'anonymous write accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  FOREACH table_name IN ARRAY ARRAY['workout_events','sync_state','reply_cleanup_jobs'] LOOP
    BEGIN
      EXECUTE format('SELECT 1 FROM solitary_athlete.%I LIMIT 1', table_name);
      RAISE EXCEPTION 'anonymous private read accepted: %', table_name;
    EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  END LOOP;
END $$;
RESET ROLE;
DO $$
DECLARE table_name text;
BEGIN
  IF (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='solitary_athlete' AND c.relkind='r') <> 5
  THEN RAISE EXCEPTION 'unexpected foundation table count'; END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
             WHERE n.nspname='solitary_athlete'
             AND c.relname IN ('workout_events','workout_logs','sync_state',
                              'sync_status','reply_cleanup_jobs') AND NOT c.relrowsecurity)
  THEN RAISE EXCEPTION 'RLS is disabled'; END IF;
  FOREACH table_name IN ARRAY ARRAY['workout_events','workout_logs','sync_state','sync_status','reply_cleanup_jobs'] LOOP
    IF has_table_privilege('anon','solitary_athlete.'||table_name,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    THEN RAISE EXCEPTION 'anonymous write privilege: %',table_name; END IF;
    IF has_table_privilege('authenticated','solitary_athlete.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'authenticated privilege: %',table_name; END IF;
    IF has_table_privilege('service_role','solitary_athlete.'||table_name,'SELECT,INSERT,UPDATE,DELETE')
    THEN RAISE EXCEPTION 'service role privilege: %',table_name; END IF;
  END LOOP;
  IF has_table_privilege('mukmuk_worker','player_one.existing_app_fixture','SELECT,INSERT,UPDATE,DELETE')
  THEN RAISE EXCEPTION 'worker can access other app'; END IF;
  IF (SELECT count(*) FROM player_one.existing_app_fixture) <> 1
  THEN RAISE EXCEPTION 'other app fixture changed'; END IF;
  IF pg_has_role('mukmuk_worker','mukmuk_owner','MEMBER')
  THEN RAISE EXCEPTION 'worker inherits owner'; END IF;
  IF has_schema_privilege('mukmuk_worker','solitary_athlete','CREATE')
  THEN RAISE EXCEPTION 'worker has DDL privileges'; END IF;
  FOREACH table_name IN ARRAY ARRAY['workout_events','sync_state','reply_cleanup_jobs'] LOOP
    IF has_table_privilege('authenticated','solitary_athlete.' || table_name,'SELECT')
    THEN RAISE EXCEPTION 'authenticated private read granted: %', table_name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mukmuk_worker'
             AND (rolsuper OR rolbypassrls OR rolcreaterole OR rolcreatedb))
  THEN RAISE EXCEPTION 'elevated worker role'; END IF;
END $$;
ROLLBACK;
