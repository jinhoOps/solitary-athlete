BEGIN;
SET LOCAL ROLE mukmuk_owner;
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
ALTER TABLE solitary_athlete.mukmuk_monthly_grass_snapshots
 ADD COLUMN identity_revision bigint NOT NULL DEFAULT 0 CHECK(identity_revision>=0),
 ADD COLUMN calculation_version integer NOT NULL DEFAULT 1 CHECK(calculation_version>=1),
 ADD COLUMN previous_identity_revision bigint CHECK(previous_identity_revision>=0),
 ADD COLUMN previous_calculation_version integer CHECK(previous_calculation_version>=1);
UPDATE solitary_athlete.mukmuk_monthly_grass_snapshots SET previous_identity_revision=0,previous_calculation_version=1
 WHERE previous_collected_at IS NOT NULL;
ALTER TABLE solitary_athlete.mukmuk_daily_grass_history
 ADD COLUMN identity_revision bigint NOT NULL DEFAULT 0 CHECK(identity_revision>=0),
 ADD COLUMN calculation_version integer NOT NULL DEFAULT 1 CHECK(calculation_version>=1);
CREATE OR REPLACE FUNCTION solitary_athlete.capture_monthly_grass_snapshot(p_collected_at timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 v_date date := (p_collected_at AT TIME ZONE 'Asia/Seoul')::date;
 v_month date := date_trunc('month',v_date)::date;
 v_members integer;
 v_days integer;
 v_revision bigint;
 v_enabled boolean;
 v_calculation integer;
BEGIN
 IF p_collected_at IS NULL THEN RAISE EXCEPTION 'invalid_collected_at'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
 -- A late/replayed collection must not rewrite any closed day or month.
 IF p_collected_at <= (SELECT collected_at FROM solitary_athlete.mukmuk_daily_grass_history
     ORDER BY snapshot_date DESC LIMIT 1) THEN RETURN; END IF;
 SELECT revision,enabled INTO v_revision,v_enabled FROM solitary_athlete.mukmuk_identity_state WHERE singleton;
 v_calculation := CASE WHEN v_enabled OR v_revision>0 THEN 2 ELSE 1 END;
 IF v_calculation=2 THEN
   SELECT count(DISTINCT person_id)::integer,count(*)::integer INTO v_members,v_days
   FROM solitary_athlete.mukmuk_person_days(v_revision,v_month,v_date+1);
 ELSE
   SELECT count(DISTINCT user_id)::integer,count(*)::integer INTO v_members,v_days
   FROM solitary_athlete.workout_logs WHERE log_date>=v_month AND log_date<=v_date;
 END IF;
 INSERT INTO solitary_athlete.mukmuk_monthly_grass_snapshots AS current
   (month_start,collected_at,member_count,workout_days,elapsed_days,identity_revision,calculation_version)
 VALUES(v_month,p_collected_at,v_members,v_days,extract(day FROM v_date)::integer,v_revision,v_calculation)
 ON CONFLICT(month_start) DO UPDATE SET
   previous_identity_revision=CASE
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date THEN current.previous_identity_revision
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date-1 THEN current.identity_revision ELSE NULL END,
   previous_calculation_version=CASE
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date THEN current.previous_calculation_version
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date-1 THEN current.calculation_version ELSE NULL END,
   previous_collected_at=CASE
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date THEN current.previous_collected_at
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date-1 THEN current.collected_at
     ELSE NULL END,
   previous_member_count=CASE
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date THEN current.previous_member_count
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date-1 THEN current.member_count
     ELSE NULL END,
   previous_workout_days=CASE
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date THEN current.previous_workout_days
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date-1 THEN current.workout_days
     ELSE NULL END,
   previous_elapsed_days=CASE
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date THEN current.previous_elapsed_days
     WHEN (current.collected_at AT TIME ZONE 'Asia/Seoul')::date=v_date-1 THEN current.elapsed_days
     ELSE NULL END,
   identity_revision=EXCLUDED.identity_revision,
   calculation_version=EXCLUDED.calculation_version,
   collected_at=EXCLUDED.collected_at,
   member_count=EXCLUDED.member_count,
   workout_days=EXCLUDED.workout_days,
   elapsed_days=EXCLUDED.elapsed_days
 WHERE EXCLUDED.collected_at>current.collected_at;
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO solitary_athlete.mukmuk_daily_grass_history AS current
   (snapshot_date,collected_at,member_count,workout_days,elapsed_days,identity_revision,calculation_version)
 VALUES(v_date,p_collected_at,v_members,v_days,extract(day FROM v_date)::integer,v_revision,v_calculation)
 ON CONFLICT(snapshot_date) DO UPDATE SET
   identity_revision=EXCLUDED.identity_revision,
   calculation_version=EXCLUDED.calculation_version,
   collected_at=EXCLUDED.collected_at,
   member_count=EXCLUDED.member_count,
   workout_days=EXCLUDED.workout_days,
   elapsed_days=EXCLUDED.elapsed_days
 WHERE EXCLUDED.collected_at>current.collected_at;
END; $$;
RESET ROLE;
NOTIFY pgrst,'reload schema';
COMMIT;
