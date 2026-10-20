BEGIN;
SET LOCAL ROLE mukmuk_owner;
-- Serialize against collection so migration cannot race a new snapshot.
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
-- Old pairs usually belong to the same day; never invent a previous-day baseline.
UPDATE solitary_athlete.mukmuk_monthly_grass_snapshots SET
 previous_collected_at=NULL, previous_member_count=NULL,
 previous_workout_days=NULL, previous_elapsed_days=NULL
WHERE previous_collected_at IS NOT NULL
 AND (previous_collected_at AT TIME ZONE 'Asia/Seoul')::date
     <> (collected_at AT TIME ZONE 'Asia/Seoul')::date-1;
ALTER TABLE solitary_athlete.mukmuk_monthly_grass_snapshots
 ADD CONSTRAINT mukmuk_previous_day CHECK (previous_collected_at IS NULL OR
   (previous_collected_at AT TIME ZONE 'Asia/Seoul')::date
     = (collected_at AT TIME ZONE 'Asia/Seoul')::date-1);

CREATE OR REPLACE FUNCTION solitary_athlete.capture_monthly_grass_snapshot(p_collected_at timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 v_date date := (p_collected_at AT TIME ZONE 'Asia/Seoul')::date;
 v_month date := date_trunc('month',v_date)::date;
 v_members integer;
 v_days integer;
BEGIN
 IF p_collected_at IS NULL THEN RAISE EXCEPTION 'invalid_collected_at'; END IF;
 PERFORM pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
 SELECT count(DISTINCT user_id)::integer,count(*)::integer INTO v_members,v_days
 FROM solitary_athlete.workout_logs WHERE log_date>=v_month AND log_date<=v_date;
 INSERT INTO solitary_athlete.mukmuk_monthly_grass_snapshots AS current
   (month_start,collected_at,member_count,workout_days,elapsed_days)
 VALUES(v_month,p_collected_at,v_members,v_days,extract(day FROM v_date)::integer)
 ON CONFLICT(month_start) DO UPDATE SET
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
   collected_at=EXCLUDED.collected_at,
   member_count=EXCLUDED.member_count,
   workout_days=EXCLUDED.workout_days,
   elapsed_days=EXCLUDED.elapsed_days
 WHERE EXCLUDED.collected_at>current.collected_at;
END; $$;
RESET ROLE;
COMMIT;
