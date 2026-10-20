from datetime import datetime, timezone
import os
import psycopg
import pytest
from test_store import store
from test_collector import message
from mukmuk.sync import event_from_message

CHANNEL = '1559804769327910932'

def at(value):
    return datetime.fromisoformat(value)

def save(store, mid, user, date, photo=False):
    m = message(mid, photo=photo)
    m['author']['id'] = user
    m['timestamp'] = f'{date}T03:00:00Z'
    store.save(mid, event_from_message(m, '1559802401802952706', CHANNEL))

def snapshot(store, month='2026-10-01'):
    with store.conn.transaction():
        return store.conn.execute('SELECT * FROM solitary_athlete.mukmuk_monthly_grass_snapshots WHERE month_start=%s', (month,)).fetchone()

def test_success_captures_monthly_unique_days_members_and_previous_sample(store):
    save(store, '100', '1', '2026-10-13')
    save(store, '101', '1', '2026-10-14')
    save(store, '102', '2', '2026-10-14')
    save(store, '103', '3', '2026-09-30')
    save(store, '104', '4', '2026-10-15')  # Future dates are excluded.
    store.success(CHANNEL, '104', at('2026-10-14T09:00:00+00:00'))
    first = snapshot(store)
    assert (first['member_count'], first['workout_days'], first['elapsed_days']) == (2, 3, 14)
    assert first['previous_collected_at'] is None
    save(store, '105', '3', '2026-10-14')
    store.success(CHANNEL, '105', at('2026-10-14T09:05:00+00:00'))
    second = snapshot(store)
    assert (second['member_count'], second['workout_days']) == (3, 4)
    assert (second['previous_member_count'], second['previous_workout_days'], second['previous_elapsed_days']) == (2, 3, 14)
    assert second['previous_collected_at'] == first['collected_at']
    store.save('105', None)
    store.success(CHANNEL, '105', at('2026-10-14T09:10:00+00:00'))
    assert (snapshot(store)['member_count'], snapshot(store)['workout_days']) == (2, 3)

def test_photo_duplicates_and_retries_do_not_invent_participation_changes(store):
    save(store, '100', '1', '2026-10-14')
    store.success(CHANNEL, '100', at('2026-10-14T09:00:00+00:00'))
    save(store, '101', '1', '2026-10-14', True)
    save(store, '101', '1', '2026-10-14', True)
    store.success(CHANNEL, '101', at('2026-10-14T09:05:00+00:00'))
    before = snapshot(store)
    assert (before['workout_days'], before['previous_workout_days']) == (1, 1)
    assert (before['member_count'], before['previous_member_count']) == (1, 1)
    for timestamp in ['2026-10-14T09:05:00+00:00', '2026-10-14T09:01:00+00:00']:
        store.success(CHANNEL, '99', at(timestamp))
        assert snapshot(store) == before
        assert store.state(CHANNEL)['last_message_id'] == '101'

def test_kst_month_rollover_leap_day_and_empty_first_sample(store):
    store.success(CHANNEL, None, at('2028-02-29T14:59:59+00:00'))
    feb = snapshot(store, '2028-02-01')
    assert (feb['member_count'], feb['workout_days'], feb['elapsed_days']) == (0, 0, 29)
    store.success(CHANNEL, None, at('2028-02-29T15:00:00+00:00'))
    march = snapshot(store, '2028-03-01')
    assert march['elapsed_days'] == 1 and march['previous_collected_at'] is None

def test_failed_status_transaction_does_not_publish_a_snapshot(store):
    with pytest.raises(psycopg.errors.CheckViolation):
        store.success('wrong-channel', None, at('2026-10-14T09:00:00+00:00'))
    assert snapshot(store) is None
    assert store.state(CHANNEL)['last_success_at'] is None

def test_snapshot_requires_secret_and_denies_direct_anonymous_access(store):
    store.success(CHANNEL, None, at('2026-10-14T09:00:00+00:00'))
    with psycopg.connect(os.environ['TEST_DATABASE_URL'], autocommit=True) as admin:
        admin.execute("INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at) VALUES ('grass-fixture',now(),now()+interval '1 day',now()+interval '2 days') ON CONFLICT DO NOTHING")
        try:
            admin.execute('SET ROLE anon')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                admin.execute('SELECT * FROM solitary_athlete.mukmuk_monthly_grass_snapshots')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                admin.execute("SELECT solitary_athlete.capture_monthly_grass_snapshot(now())")
            with pytest.raises(psycopg.errors.RaiseException, match='invalid_or_expired_secret'):
                admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('wrong','2026-10-01')")
            rows = admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('  GRASS-FIXTURE  ','2026-10-01')").fetchall()
            assert len(rows) == 1
            assert admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('grass-fixture','2026-11-01')").fetchall() == []
            with pytest.raises(psycopg.errors.RaiseException, match='invalid_month'):
                admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('grass-fixture','2026-10-02')")
        finally:
            admin.execute('RESET ROLE')
            admin.execute("DELETE FROM solitary_athlete.channel_access_secrets WHERE secret_code='grass-fixture'")
