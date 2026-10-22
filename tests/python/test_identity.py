"""Canonical people are a projection; original authors and closed observations survive."""
from datetime import date
import os
import psycopg
import pytest
from test_store import store
from test_participation import save


def days(store, revision=0, start=None, until=None, person=None):
    with store.conn.transaction():
        return store.conn.execute(
            'SELECT * FROM solitary_athlete.mukmuk_person_days(%s,%s,%s,%s) ORDER BY log_date,person_id',
            (revision, start, until, person)).fetchall()


def link(store, source='2', primary='1', revision=1):
    with store.conn.transaction():
        owner = store.conn.execute('SELECT person_id FROM solitary_athlete.mukmuk_people WHERE primary_user_id=%s', (primary,)).fetchone()['person_id']
        account = store.conn.execute('SELECT * FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=%s AND valid_until IS NULL', (source,)).fetchone()
        store.conn.execute('UPDATE solitary_athlete.mukmuk_person_accounts SET valid_until=%s WHERE user_id=%s AND valid_until IS NULL', (revision, source))
        store.conn.execute('INSERT INTO solitary_athlete.mukmuk_person_accounts(guild_id,user_id,person_id,valid_from) VALUES(%s,%s,%s,%s)', (account['guild_id'], source, owner, revision))
        store.conn.execute('UPDATE solitary_athlete.mukmuk_identity_state SET revision=%s', (revision,))
        return owner


def test_same_person_same_day_keeps_both_messages_and_photo_without_rewriting_authors(store):
    save(store, '100', '1', '2026-10-14')
    save(store, '101', '2', '2026-10-14', True)
    assert len(days(store)) == 2
    person = link(store)
    rows = days(store, 1)
    assert len(rows) == 1
    assert rows[0]['person_id'] == person
    assert rows[0]['verification_count'] == 2
    assert rows[0]['has_photo'] is True
    assert rows[0]['memo'] == '운동\n운동'
    with store.conn.transaction():
        authors = store.conn.execute('SELECT user_id FROM solitary_athlete.workout_events ORDER BY message_id').fetchall()
    assert [r['user_id'] for r in authors] == ['1', '2']
    assert len(days(store, 0)) == 2  # An old membership version remains interpretable.
    store.save('101', None)
    remaining = days(store, 1)
    assert len(remaining) == 1 and remaining[0]['has_photo'] is False
    assert remaining[0]['verification_count'] == 1


def test_projection_has_exclusive_end_filters_and_no_materialized_days(store):
    save(store, '100', '1', '2028-02-29')
    save(store, '101', '1', '2028-03-01')
    rows = days(store, start=date(2028, 2, 29), until=date(2028, 3, 1))
    assert [r['log_date'] for r in rows] == [date(2028, 2, 29)]
    assert days(store, person=rows[0]['person_id']) == days(store)
    with pytest.raises(psycopg.errors.RaiseException, match='invalid_date_range'):
        days(store, start=date(2028, 3, 1), until=date(2028, 2, 29))
    with store.conn.transaction():
        assert store.conn.execute("SELECT to_regclass('solitary_athlete.mukmuk_person_days')").fetchone()['to_regclass'] is None


def test_source_revision_changes_only_for_meaningful_source_changes(store):
    def revision():
        with store.conn.transaction():
            return store.conn.execute('SELECT source_revision FROM solitary_athlete.mukmuk_identity_state').fetchone()['source_revision']
    before = revision()
    save(store, '100', '1', '2026-10-14')
    once = revision()
    assert once == before + 1
    save(store, '100', '1', '2026-10-14')
    assert revision() == once
    store.reacted('100')
    assert revision() == once
    save(store, '100', '1', '2026-10-14', True)
    assert revision() == once + 1
    store.save('100', None)
    assert revision() == once + 2


def test_membership_overlaps_and_in_place_identity_rewrites_are_rejected(store):
    save(store, '100', '1', '2026-10-14')
    with store.conn.transaction():
        account = store.conn.execute('SELECT * FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=%s', ('1',)).fetchone()
    with pytest.raises(psycopg.errors.ExclusionViolation):
        with store.conn.transaction():
            store.conn.execute('INSERT INTO solitary_athlete.mukmuk_person_accounts(guild_id,user_id,person_id,valid_from) VALUES(%s,%s,%s,2)', (account['guild_id'], '1', account['person_id']))
    with pytest.raises(psycopg.errors.CheckViolation):
        with store.conn.transaction():
            store.conn.execute('UPDATE solitary_athlete.mukmuk_person_accounts SET user_id=%s WHERE user_id=%s', ('2', '1'))


def test_projection_is_private_even_to_rls_bypass_roles(store):
    with psycopg.connect(os.environ['TEST_DATABASE_URL'], autocommit=True) as conn:
        for role in ('anon', 'authenticated', 'service_role'):
            conn.execute(f'SET ROLE {role}')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute('SELECT * FROM solitary_athlete.mukmuk_person_days(0)')
            with pytest.raises(psycopg.errors.InsufficientPrivilege):
                conn.execute('SELECT * FROM solitary_athlete.mukmuk_person_accounts')
            conn.execute('RESET ROLE')
