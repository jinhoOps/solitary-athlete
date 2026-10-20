from datetime import datetime
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

def test_success_updates_monthly_unique_days_without_inventing_a_daily_baseline(store):
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
    assert second['previous_collected_at'] is None
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
    assert (before['workout_days'], before['member_count']) == (1, 1)
    assert before['previous_collected_at'] is None
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
            admin.execute("INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at) VALUES ('grass-expired',now()-interval '3 days',now()-interval '2 days',now()-interval '1 day') ON CONFLICT DO NOTHING")
            for role in ['authenticated', 'service_role']:
                admin.execute(f'SET ROLE {role}')
                with pytest.raises(psycopg.errors.InsufficientPrivilege):
                    admin.execute('SELECT * FROM solitary_athlete.mukmuk_monthly_grass_snapshots')
                admin.execute('RESET ROLE')
            admin.execute('SET ROLE anon')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                admin.execute('SELECT * FROM solitary_athlete.mukmuk_monthly_grass_snapshots')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                admin.execute("SELECT solitary_athlete.capture_monthly_grass_snapshot(now())")
            for code in ['wrong', 'grass-expired']:
                with pytest.raises(psycopg.errors.RaiseException, match='invalid_or_expired_secret'):
                    admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation(%s,'2026-10-01')", (code,))
            rows = admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('  GRASS-FIXTURE  ','2026-10-01')").fetchall()
            assert len(rows) == 1
            assert admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('grass-fixture','2026-11-01')").fetchall() == []
            with pytest.raises(psycopg.errors.RaiseException, match='invalid_month'):
                admin.execute("SELECT * FROM solitary_athlete.get_monthly_grass_participation('grass-fixture','2026-10-02')")
        finally:
            admin.execute('RESET ROLE')
            admin.execute("DELETE FROM solitary_athlete.channel_access_secrets WHERE secret_code IN ('grass-fixture','grass-expired')")


def test_monthly_snapshot_aggregates_more_than_a_page_without_annual_color_saturation(store):
    with store.conn.transaction():
        store.conn.execute("""INSERT INTO solitary_athlete.workout_logs(user_id,username,log_date,memo,has_photo,verification_count)
          SELECT (100000+u)::text,'동명이인',date '2026-10-01'+d,'',false,1
          FROM generate_series(1,501) u CROSS JOIN generate_series(0,1) d""")
    store.success(CHANNEL, None, at('2026-10-14T09:00:00+00:00'))
    row = snapshot(store)
    assert (row['member_count'], row['workout_days'], row['elapsed_days']) == (501, 1002, 14)


def test_previous_day_final_sample_stays_fixed_through_today_and_skipped_days(store):
    save(store, '100', '1', '2026-10-13')
    store.success(CHANNEL, '100', at('2026-10-13T14:50:00+00:00'))
    save(store, '101', '2', '2026-10-13')
    store.success(CHANNEL, '101', at('2026-10-13T14:59:59+00:00'))
    yesterday = snapshot(store)
    with pytest.raises(psycopg.errors.CheckViolation):
        store.success('wrong-channel', None, at('2026-10-13T15:00:00+00:00'))
    assert snapshot(store) == yesterday
    store.success(CHANNEL, '101', at('2026-10-13T15:00:00+00:00'))  # KST midnight
    for minute in ['00', '05', '10']:
        store.success(CHANNEL, '101', at(f'2026-10-14T09:{minute}:00+00:00'))
        row = snapshot(store)
        assert row['previous_collected_at'] == yesterday['collected_at']
        assert (row['previous_member_count'], row['previous_workout_days'], row['previous_elapsed_days']) == (2, 2, 13)
    today = snapshot(store)
    store.success(CHANNEL, '99', at('2026-10-13T14:59:59+00:00'))
    assert snapshot(store) == today
    store.success(CHANNEL, '101', at('2026-10-14T15:00:00+00:00'))
    assert snapshot(store)['previous_collected_at'] == today['collected_at']
    store.success(CHANNEL, '101', at('2026-10-16T15:00:00+00:00'))  # Oct 16 had no collection
    assert snapshot(store)['previous_collected_at'] is None
    store.success(CHANNEL, '101', at('2026-10-17T09:00:00+00:00'))
    assert snapshot(store)['previous_collected_at'] is None
