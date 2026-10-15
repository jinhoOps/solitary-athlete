BEGIN;
SET LOCAL ROLE mukmuk_owner;
CREATE FUNCTION solitary_athlete.get_dashboard_members(
 p_secret_code text, p_after_user_id text DEFAULT NULL, p_limit integer DEFAULT 200
) RETURNS TABLE(user_id text, username text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN

  IF NOT EXISTS (SELECT 1 FROM solitary_athlete.channel_access_secrets
    WHERE lower(secret_code) = lower(btrim(p_secret_code)) AND now() <= expires_at) THEN
    RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE = 'P0001';
  END IF;

 IF p_limit IS NULL OR p_limit < 1 OR p_limit > 200 THEN RAISE EXCEPTION 'invalid_page_limit'; END IF;
 RETURN QUERY SELECT r.user_id, r.username FROM (
   SELECT DISTINCT ON (l.user_id) l.user_id, l.username
   FROM solitary_athlete.workout_logs l
   WHERE p_after_user_id IS NULL OR l.user_id > p_after_user_id
   ORDER BY l.user_id, l.log_date DESC
 ) r ORDER BY r.user_id LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_dashboard_members(text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_dashboard_members(text,text,integer) TO anon, authenticated;
CREATE FUNCTION solitary_athlete.get_workout_logs_page(
 p_secret_code text, p_year integer, p_after_date date DEFAULT NULL,
 p_after_user_id text DEFAULT NULL, p_limit integer DEFAULT 500
) RETURNS TABLE(user_id text, username text, log_date date, has_photo boolean, memo text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN

  IF NOT EXISTS (SELECT 1 FROM solitary_athlete.channel_access_secrets
    WHERE lower(secret_code) = lower(btrim(p_secret_code)) AND now() <= expires_at) THEN
    RAISE EXCEPTION 'invalid_or_expired_secret' USING ERRCODE = 'P0001';
  END IF;

 IF p_year IS NULL OR p_year < 1 OR p_year > 9998 THEN RAISE EXCEPTION 'invalid_year'; END IF;
 IF (p_after_date IS NULL) <> (p_after_user_id IS NULL) THEN RAISE EXCEPTION 'invalid_cursor'; END IF;
 IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN RAISE EXCEPTION 'invalid_page_limit'; END IF;
 RETURN QUERY SELECT l.user_id, l.username, l.log_date, l.has_photo, l.memo
 FROM solitary_athlete.workout_logs l
 WHERE l.log_date >= make_date(p_year,1,1) AND l.log_date < make_date(p_year+1,1,1)
 AND (p_after_date IS NULL OR l.log_date < p_after_date
      OR (l.log_date = p_after_date AND l.user_id > p_after_user_id))
 ORDER BY l.log_date DESC, l.user_id ASC LIMIT p_limit;
END; $$;
REVOKE ALL ON FUNCTION solitary_athlete.get_workout_logs_page(text,integer,date,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION solitary_athlete.get_workout_logs_page(text,integer,date,text,integer) TO anon, authenticated;
RESET ROLE;
NOTIFY pgrst, 'reload schema';
COMMIT;
