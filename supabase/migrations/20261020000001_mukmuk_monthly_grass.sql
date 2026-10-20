BEGIN;
SET LOCAL ROLE mukmuk_owner;

-- One current/previous pair per KST month; no member identifiers or source records.
CREATE TABLE solitary_athlete.mukmuk_monthly_grass_snapshots (
 month_start date PRIMARY KEY CHECK (extract(day FROM month_start)=1),
 collected_at timestamptz NOT NULL,
 member_count integer NOT NULL CHECK (member_count>=0),
 workout_days integer NOT NULL CHECK (workout_days>=0),
 elapsed_days integer NOT NULL CHECK (elapsed_days BETWEEN 1 AND 31),
 previous_collected_at timestamptz,
 previous_member_count integer CHECK (previous_member_count>=0),
 previous_workout_days integer CHECK (previous_workout_days>=0),
 previous_elapsed_days integer CHECK (previous_elapsed_days BETWEEN 1 AND 31),
 CHECK (date_trunc('month',collected_at AT TIME ZONE 'Asia/Seoul')::date=month_start),
 CHECK (elapsed_days=extract(day FROM collected_at AT TIME ZONE 'Asia/Seoul')::integer),
 CHECK (workout_days>=member_count AND workout_days::bigint<=member_count::bigint*elapsed_days),
 CHECK ((previous_collected_at IS NULL AND previous_member_count IS NULL AND previous_workout_days IS NULL AND previous_elapsed_days IS NULL)
     OR (previous_collected_at IS NOT NULL AND previous_member_count IS NOT NULL AND previous_workout_days IS NOT NULL AND previous_elapsed_days IS NOT NULL)),
 CHECK (previous_collected_at IS NULL OR (previous_collected_at<collected_at
     AND date_trunc('month',previous_collected_at AT TIME ZONE 'Asia/Seoul')::date=month_start
     AND previous_elapsed_days=extract(day FROM previous_collected_at AT TIME ZONE 'Asia/Seoul')::integer
     AND previous_workout_days>=previous_member_count
     AND previous_workout_days::bigint<=previous_member_count::bigint*previous_elapsed_days))
);
ALTER TABLE solitary_athlete.mukmuk_monthly_grass_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON solitary_athlete.mukmuk_monthly_grass_snapshots FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON solitary_athlete.mukmuk_monthly_grass_snapshots TO mukmuk_worker;
CREATE POLICY mukmuk_worker_access ON solitary_athlete.mukmuk_monthly_grass_snapshots
 FOR ALL TO mukmuk_worker USING(true) WITH CHECK(true);

CREATE FUNCTION solitary_athlete.capture_monthly_grass_snapshot(p_collected_at timestamptz)
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
   previous_collected_at=current.collected_at,
   previous_member_count=current.member_count,
   previous_workout_days=current.workout_days,
   previous_elapsed_days=current.elapsed_days,
   collected_at=EXCLUDED.collected_at,
   member_count=EXCLUDED.member_count,
   workout_days=EXCLUDED.workout_days,
   elapsed_days=EXCLUDED.elapsed_days
 WHERE EXCLUDED.collected_at>current.collected_at;
END; $$;
REVOKE ALL ON FUNCTION solitary_athlete.capture_monthly_grass_snapshot(timestamptz) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.capture_monthly_grass_snapshot(timestamptz) TO mukmuk_worker;

CREATE FUNCTION solitary_athlete.get_monthly_grass_participation(p_secret_code text,p_month date)
RETURNS SETOF solitary_athlete.mukmuk_monthly_grass_snapshots
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM solitary_athlete.channel_access_secrets
   WHERE lower(secret_code)=lower(btrim(p_secret_code)) AND now()<=expires_at) THEN
   RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE='P0001';
 END IF;
 IF p_month IS NULL OR extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'invalid_month'; END IF;
 RETURN QUERY SELECT * FROM solitary_athlete.mukmuk_monthly_grass_snapshots WHERE month_start=p_month;
END; $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_monthly_grass_participation(text,date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_monthly_grass_participation(text,date) TO anon,authenticated;
RESET ROLE;
NOTIFY pgrst,'reload schema';
COMMIT;
