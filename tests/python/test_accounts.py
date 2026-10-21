"""Exercise real request transactions; only Discord REST is simulated."""
import time
import pytest
from test_store import store, event
from test_participation import save
from mukmuk.discord import DiscordError
from mukmuk.accounts import AccountService

GUILD = event().guild_id
SETTINGS = {'DISCORD_GUILD_ID': GUILD, 'DISCORD_ROLE_MEMBER_ID': '50'}


class Members:
    def __init__(self):
        self.users = {u: {'user': {'id': u, 'username': '가상'+u}, 'roles': ['50']} for u in ('1','2','3','4')}
        self.users['3']['roles'] = ['60']
        self.users['4']['roles'] = ['60']
        self.fail = None

    def once(self, method, path, deadline):
        assert method == 'GET' and deadline > time.monotonic()
        if self.fail:
            raise self.fail
        if path == f'/guilds/{GUILD}':
            return {'id': GUILD, 'owner_id': '99'}
        if path.endswith('/roles'):
            return [{'id': GUILD, 'permissions': '0'}, {'id': '50', 'permissions': '0'}, {'id': '60', 'permissions': '32'}]
        return self.users[path.rsplit('/',1)[-1]]


@pytest.fixture
def accounts(store):
    with store.conn.transaction():
        store.conn.execute('UPDATE solitary_athlete.mukmuk_identity_state SET enabled=true')
    api = Members()
    service = AccountService(store, api, SETTINGS)
    return service, api


def action(service, mid, actor, kind, **extra):
    return service.handle({'interaction_id': str(mid), 'actor_id': actor, 'kind': kind, **extra}, time.monotonic()+10)


def get_request(service, request_id):
    with service.store.conn.transaction():
        return service.store.conn.execute('SELECT * FROM solitary_athlete.mukmuk_account_link_requests WHERE id=%s', (request_id,)).fetchone()


def pending(service):
    result = action(service, 100, '1', 'request', target_id='2')
    assert result.get('error_code') is None, result
    request = get_request(service, result['request_id'])
    return result, request


def consenting(service):
    result, request = pending(service)
    result = action(service, 101, '2', 'consent', request_id=str(request['id']), version=request['version'])
    assert result['status'] == 'pending_review'
    return result, get_request(service, request['id'])


def preview(service, request, actor='3', mid=102):
    return action(service, mid, actor, 'review_detail', request_id=str(request['id']))


def test_two_consents_and_independent_manager_approval_preserve_pending_source(accounts):
    service, api = accounts
    result, request = pending(service)
    assert request['status'] == 'awaiting_consent'
    forbidden = action(service, 110, '4', 'consent', request_id=str(request['id']), version=request['version'])
    assert forbidden['error_code'] == 'not_participant'
    assert get_request(service, request['id'])['status'] == 'awaiting_consent'
    accepted = action(service, 111, '2', 'consent', request_id=str(request['id']), version=request['version'])
    request = get_request(service, request['id'])
    assert request['status'] == 'pending_review'
    api.users['1']['roles'] = ['60']
    own = action(service, 112, '1', 'approve', request_id=str(request['id']), version=request['version'])
    assert own['error_code'] == 'independent_review_required'
    shown = preview(service, request)
    assert shown['impact']['current']['members'] == 0 and shown['impact']['proposed']['members'] == 0
    approved = action(service, 113, '3', 'approve', request_id=str(request['id']), version=request['version'])
    assert approved['status'] == 'approved'
    with service.store.conn.transaction():
        assert service.store.conn.execute('SELECT revision FROM solitary_athlete.mukmuk_identity_state').fetchone()['revision'] == 0
        assert service.store.conn.execute('SELECT count(*) AS n FROM solitary_athlete.workout_events').fetchone()['n'] == 0
    assert accepted['request_id'] == result['request_id']


def test_replayed_requests_and_competing_requests_cannot_double_create(accounts):
    service, _ = accounts
    first, request = pending(service)
    assert action(service, 100, '1', 'request', target_id='2') == first
    again = action(service, 101, '1', 'request', target_id='2')
    assert again['request_id'] == first['request_id']
    blocked = action(service, 102, '4', 'request', target_id='2')
    assert blocked['error_code'] == 'account_busy'
    with service.store.conn.transaction():
        assert service.store.conn.execute('SELECT count(*) AS n FROM solitary_athlete.mukmuk_account_link_requests').fetchone()['n'] == 1


def test_review_is_bound_to_actor_source_and_request_version_and_preview_rolls_back(accounts):
    service, _ = accounts
    _, request = consenting(service)
    before = get_request(service, request['id'])
    shown = preview(service, request)
    assert get_request(service, request['id']) == before
    save(service.store, '1000', '1', time.strftime('%Y-%m-%d'))
    stale = action(service, 103, '3', 'approve', request_id=str(request['id']), version=request['version'])
    assert stale['error_code'] == 'preview_changed'
    preview(service, request, mid=104)
    other = action(service, 105, '4', 'approve', request_id=str(request['id']), version=request['version'])
    assert other['error_code'] == 'preview_required'
    approved = action(service, 106, '3', 'approve', request_id=str(request['id']), version=request['version'])
    assert approved['status'] == 'approved'
    after = action(service, 107, '2', 'cancel', request_id=str(request['id']), version=request['version'])
    assert after['error_code'] == 'request_changed'


def test_decline_expiry_and_missing_permission_never_create_membership_changes(accounts):
    service, api = accounts
    _, request = pending(service)
    declined = action(service, 101, '2', 'decline', request_id=str(request['id']), version=request['version'])
    assert declined['status'] == 'rejected'
    new = action(service, 102, '1', 'request', target_id='2')
    with service.store.conn.transaction():
        service.store.conn.execute("UPDATE solitary_athlete.mukmuk_account_link_requests SET expires_at=now()-interval '1 second' WHERE id=%s", (new['request_id'],))
    expired = action(service, 103, '2', 'consent', request_id=new['request_id'], version=new['version'])
    assert expired['error_code'] == 'request_expired'
    assert get_request(service, new['request_id'])['status'] == 'expired'
    api.users['1']['roles'] = []
    assert action(service, 104, '1', 'request', target_id='2')['error_code'] == 'permission_denied'
    api.fail = DiscordError(503)
    assert action(service, 105, '1', 'request', target_id='2')['error_code'] == 'discord_unavailable'


def test_bot_or_other_group_target_is_rejected_and_viewing_another_request_is_private(accounts):
    service, api = accounts
    api.users['2']['user']['bot'] = True
    assert action(service, 99, '1', 'request', target_id='2')['error_code'] == 'invalid_member'
    api.users['2']['user']['bot'] = False
    _, request = pending(service)
    hidden = action(service, 101, '4', 'detail', request_id=str(request['id']))
    # A manager must deliberately use the review endpoint, not impersonate a participant.
    assert hidden['error_code'] == 'not_participant'
    stranger = action(service, 102, '2', 'request', target_id='1')
    assert stranger['error_code'] == 'account_busy'


def test_linked_manager_cannot_review_their_group_and_alt_can_request_own_unlink(accounts):
    from test_identity import link
    service, api = accounts
    with service.store.conn.transaction():
        for user in ('1', '2', '4'):
            service.store.conn.execute('SELECT solitary_athlete.mukmuk_ensure_person(%s,%s,%s)', (user, '가상', GUILD))
    link(service.store, '4', '1', 1)
    _, request = consenting(service)
    forbidden = action(service, 109, '4', 'approve', request_id=str(request['id']), version=request['version'])
    assert forbidden['error_code'] == 'independent_review_required'
    assert action(service, 110, '3', 'request', target_id='4')['error_code'] == 'group_merge_unsupported'
    action(service, 111, '1', 'cancel', request_id=str(request['id']), version=request['version'])
    link(service.store, '2', '1', 2)
    unlink = action(service, 112, '2', 'unlink', target_id='2')
    assert unlink.get('error_code') is None, unlink
    assert unlink['status'] == 'pending_review'
    assert get_request(service, unlink['request_id'])['kind'] == 'unlink'


def test_two_reviewers_racing_can_approve_only_once(accounts):
    import os
    from concurrent.futures import ThreadPoolExecutor
    import psycopg
    from mukmuk.store import Store
    service, api = accounts
    _, request = consenting(service)
    preview(service, request, '3', 102)
    preview(service, request, '4', 103)

    def approve(actor):
        with psycopg.connect(os.environ['TEST_DATABASE_URL']) as conn:
            conn.execute('SET ROLE mukmuk_worker')
            conn.commit()
            other = AccountService(Store(conn), api, SETTINGS)
            return action(other, 200+int(actor), actor, 'approve', request_id=str(request['id']), version=request['version'])

    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(approve, ('3','4')))
    assert sum(r.get('status') == 'approved' for r in results) == 1
    assert sum(r.get('error_code') == 'request_changed' for r in results) == 1
    assert get_request(service, request['id'])['version'] == request['version']+1


def test_command_cancel_reads_current_version_and_replay_stays_cancelled(accounts):
    service, _ = accounts
    _, request = pending(service)
    cancelled = action(service, 201, '1', 'cancel', request_id=str(request['id']), payload={'command':True})
    assert cancelled.get('status') == 'cancelled', cancelled
    assert action(service, 201, '1', 'cancel', request_id=str(request['id']), payload={'command':True}) == cancelled
