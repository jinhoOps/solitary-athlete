BEGIN;
SET LOCAL ROLE mukmuk_owner;
SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'));
CREATE FUNCTION solitary_athlete.mukmuk_check_dashboard_code(p_code text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM solitary_athlete.channel_access_secrets WHERE lower(secret_code)=lower(btrim(p_code)) AND now()<=expires_at) THEN
  RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE='P0001';
 END IF;
END $$;
CREATE FUNCTION solitary_athlete.mukmuk_check_dashboard_revision(p_code text,p_revision bigint) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_dashboard_code(p_code);
 IF p_revision IS NULL OR p_revision<>(SELECT revision FROM solitary_athlete.mukmuk_identity_state WHERE singleton) THEN
  RAISE EXCEPTION 'identity_revision_changed' USING ERRCODE='PT409';
 END IF;
END $$;
CREATE FUNCTION solitary_athlete.mukmuk_check_legacy_dashboard(p_code text) RETURNS void
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_dashboard_code(p_code);
 IF (SELECT revision FROM solitary_athlete.mukmuk_identity_state WHERE singleton)>0 THEN
  RAISE EXCEPTION 'client_update_required' USING ERRCODE='PT409';
 END IF;
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_check_dashboard_code(text),
 solitary_athlete.mukmuk_check_dashboard_revision(text,bigint),solitary_athlete.mukmuk_check_legacy_dashboard(text)
 FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION solitary_athlete.get_dashboard_identity(p_secret_code text)
RETURNS TABLE(enabled boolean,revision bigint,calculation_version integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_dashboard_code(p_secret_code);
 RETURN QUERY SELECT s.enabled OR s.revision>0,s.revision,CASE WHEN s.enabled OR s.revision>0 THEN 2 ELSE 1 END
 FROM solitary_athlete.mukmuk_identity_state s WHERE singleton;
END $$;
CREATE FUNCTION solitary_athlete.get_dashboard_people(p_secret_code text,p_revision bigint,
 p_after_person_id uuid DEFAULT NULL,p_limit integer DEFAULT 200)
RETURNS TABLE(person_id uuid,username text,identity_revision bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_dashboard_revision(p_secret_code,p_revision);
 IF p_limit IS NULL OR p_limit<1 OR p_limit>200 THEN RAISE EXCEPTION 'invalid_page_limit'; END IF;
 RETURN QUERY SELECT DISTINCT d.person_id,d.username,p_revision FROM solitary_athlete.mukmuk_person_days(p_revision) d
 WHERE p_after_person_id IS NULL OR d.person_id>p_after_person_id ORDER BY d.person_id LIMIT p_limit;
END $$;
CREATE FUNCTION solitary_athlete.get_person_workout_logs_page(p_secret_code text,p_revision bigint,p_year integer,
 p_after_date date DEFAULT NULL,p_after_person_id uuid DEFAULT NULL,p_limit integer DEFAULT 500)
RETURNS TABLE(person_id uuid,username text,log_date date,has_photo boolean,memo text,verification_count integer,identity_revision bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_dashboard_revision(p_secret_code,p_revision);
 IF p_year IS NULL OR p_year<1 OR p_year>9998 THEN RAISE EXCEPTION 'invalid_year'; END IF;
 IF (p_after_date IS NULL)<>(p_after_person_id IS NULL) OR (p_after_date IS NOT NULL AND
   (p_after_date<make_date(p_year,1,1) OR p_after_date>=make_date(p_year+1,1,1))) THEN RAISE EXCEPTION 'invalid_cursor'; END IF;
 IF p_limit IS NULL OR p_limit<1 OR p_limit>500 THEN RAISE EXCEPTION 'invalid_page_limit'; END IF;
 RETURN QUERY SELECT d.person_id,d.username,d.log_date,d.has_photo,d.memo,d.verification_count,p_revision
 FROM solitary_athlete.mukmuk_person_days(p_revision,make_date(p_year,1,1),make_date(p_year+1,1,1)) d
 WHERE p_after_date IS NULL OR d.log_date<p_after_date OR (d.log_date=p_after_date AND d.person_id>p_after_person_id)
 ORDER BY d.log_date DESC,d.person_id LIMIT p_limit;
END $$;
CREATE FUNCTION solitary_athlete.get_person_grass_participation(p_secret_code text,p_revision bigint,p_month date)
RETURNS SETOF solitary_athlete.mukmuk_monthly_grass_snapshots
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_dashboard_revision(p_secret_code,p_revision);
 IF p_month IS NULL OR extract(day FROM p_month)<>1 THEN RAISE EXCEPTION 'invalid_month'; END IF;
 -- An observation may be an older historical revision. Return its own metadata intact.
 RETURN QUERY SELECT * FROM solitary_athlete.mukmuk_monthly_grass_snapshots WHERE month_start=p_month;
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_dashboard_identity(text),solitary_athlete.get_dashboard_people(text,bigint,uuid,integer),
 solitary_athlete.get_person_workout_logs_page(text,bigint,integer,date,uuid,integer),solitary_athlete.get_person_grass_participation(text,bigint,date)
 FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_dashboard_identity(text),solitary_athlete.get_dashboard_people(text,bigint,uuid,integer),
 solitary_athlete.get_person_workout_logs_page(text,bigint,integer,date,uuid,integer),solitary_athlete.get_person_grass_participation(text,bigint,date)
 TO anon,authenticated;
ALTER FUNCTION solitary_athlete.get_dashboard_members(text,text,integer) RENAME TO mukmuk_legacy_get_dashboard_members;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_legacy_get_dashboard_members(text,text,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION solitary_athlete.get_dashboard_members(p_secret_code text,p_after_user_id text DEFAULT NULL,p_limit integer DEFAULT 200) RETURNS TABLE(user_id text,username text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_legacy_dashboard(p_secret_code);
 RETURN QUERY SELECT * FROM solitary_athlete.mukmuk_legacy_get_dashboard_members(p_secret_code,p_after_user_id,p_limit);
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_dashboard_members(text,text,integer) FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_dashboard_members(text,text,integer) TO anon,authenticated;
ALTER FUNCTION solitary_athlete.get_workout_logs_page(text,integer,date,text,integer) RENAME TO mukmuk_legacy_get_workout_logs_page;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_legacy_get_workout_logs_page(text,integer,date,text,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION solitary_athlete.get_workout_logs_page(p_secret_code text,p_year integer,p_after_date date DEFAULT NULL,p_after_user_id text DEFAULT NULL,p_limit integer DEFAULT 500) RETURNS TABLE(user_id text,username text,log_date date,has_photo boolean,memo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_legacy_dashboard(p_secret_code);
 RETURN QUERY SELECT * FROM solitary_athlete.mukmuk_legacy_get_workout_logs_page(p_secret_code,p_year,p_after_date,p_after_user_id,p_limit);
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_workout_logs_page(text,integer,date,text,integer) FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_workout_logs_page(text,integer,date,text,integer) TO anon,authenticated;
ALTER FUNCTION solitary_athlete.get_workout_logs(text,integer) RENAME TO mukmuk_legacy_get_workout_logs;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_legacy_get_workout_logs(text,integer) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION solitary_athlete.get_workout_logs(p_secret_code text,p_year integer DEFAULT NULL) RETURNS TABLE(user_id text,username text,log_date date,has_photo boolean,memo text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_legacy_dashboard(p_secret_code);
 RETURN QUERY SELECT * FROM solitary_athlete.mukmuk_legacy_get_workout_logs(p_secret_code,p_year);
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_workout_logs(text,integer) FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_workout_logs(text,integer) TO anon,authenticated;
ALTER FUNCTION solitary_athlete.get_monthly_grass_participation(text,date) RENAME TO mukmuk_legacy_get_monthly_grass_participation;
REVOKE ALL ON FUNCTION solitary_athlete.mukmuk_legacy_get_monthly_grass_participation(text,date) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION solitary_athlete.get_monthly_grass_participation(p_secret_code text,p_month date) RETURNS SETOF solitary_athlete.mukmuk_monthly_grass_snapshots
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM solitary_athlete.mukmuk_check_legacy_dashboard(p_secret_code);
 RETURN QUERY SELECT * FROM solitary_athlete.mukmuk_legacy_get_monthly_grass_participation(p_secret_code,p_month);
END $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_monthly_grass_participation(text,date) FROM PUBLIC,service_role;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_monthly_grass_participation(text,date) TO anon,authenticated;
RESET ROLE;
NOTIFY pgrst,'reload schema';
COMMIT;
