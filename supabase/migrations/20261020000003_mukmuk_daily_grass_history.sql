BEGIN;
SET LOCAL ROLE mukmuk_owner;
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));

-- Observed monthly totals at each KST day's last successful collection.
-- No user identifiers, notes, photos, or fabricated missing-day values.
CREATE TABLE solitary_athlete.mukmuk_daily_grass_history (
 snapshot_date date PRIMARY KEY,
 collected_at timestamptz NOT NULL,
 member_count integer NOT NULL CHECK (member_count>=0),
 workout_days integer NOT NULL CHECK (workout_days>=member_count),
 elapsed_days integer NOT NULL CHECK (elapsed_days BETWEEN 1 AND 31),
 CHECK ((collected_at AT TIME ZONE 'Asia/Seoul')::date=snapshot_date),
 CHECK (elapsed_days=extract(day FROM snapshot_date)::integer),
 CHECK (workout_days::bigint<=member_count::bigint*elapsed_days)
);
ALTER TABLE solitary_athlete.mukmuk_daily_grass_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON solitary_athlete.mukmuk_daily_grass_history FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON solitary_athlete.mukmuk_daily_grass_history TO mukmuk_worker;
CREATE POLICY mukmuk_worker_access ON solitary_athlete.mukmuk_daily_grass_history
 FOR ALL TO mukmuk_worker USING(true) WITH CHECK(true);

-- Preserve only observations that already exist; never recompute past closes from today's logs.
INSERT INTO solitary_athlete.mukmuk_daily_grass_history
 (snapshot_date,collected_at,member_count,workout_days,elapsed_days)
SELECT (collected_at AT TIME ZONE 'Asia/Seoul')::date,collected_at,member_count,workout_days,elapsed_days
 FROM solitary_athlete.mukmuk_monthly_grass_snapshots
UNION ALL
SELECT (previous_collected_at AT TIME ZONE 'Asia/Seoul')::date,previous_collected_at,
 previous_member_count,previous_workout_days,previous_elapsed_days
 FROM solitary_athlete.mukmuk_monthly_grass_snapshots WHERE previous_collected_at IS NOT NULL;

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
 -- A late/replayed collection must not rewrite any closed day or month.
 IF p_collected_at <= (SELECT collected_at FROM solitary_athlete.mukmuk_daily_grass_history
     ORDER BY snapshot_date DESC LIMIT 1) THEN RETURN; END IF;
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
 IF NOT FOUND THEN RETURN; END IF;
 INSERT INTO solitary_athlete.mukmuk_daily_grass_history AS current
   (snapshot_date,collected_at,member_count,workout_days,elapsed_days)
 VALUES(v_date,p_collected_at,v_members,v_days,extract(day FROM v_date)::integer)
 ON CONFLICT(snapshot_date) DO UPDATE SET
   collected_at=EXCLUDED.collected_at,
   member_count=EXCLUDED.member_count,
   workout_days=EXCLUDED.workout_days,
   elapsed_days=EXCLUDED.elapsed_days
 WHERE EXCLUDED.collected_at>current.collected_at;
END; $$;
RESET ROLE;
COMMIT;
