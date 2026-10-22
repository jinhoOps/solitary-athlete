import os
import psycopg
import pytest
from test_store import store
from test_accounts import accounts, action, consenting, preview, get_request
from test_participation import at, save, snapshot, history, CHANNEL


def approved(service):
    _, request=consenting(service)
    preview(service, request)
    result=action(service,103,'3','approve',request_id=str(request['id']),version=request['version'])
    assert result['status']=='approved'
    return result


def test_link_publishes_one_person_four_days_and_preserves_yesterday(accounts):
    service,_=accounts;store=service.store
    for mid,user,day in [('200','1','01'),('201','1','02'),('202','1','03'),('203','2','03'),('204','2','04')]:
        save(store,mid,user,'2026-10-'+day)
    store.success(CHANNEL,'204',at('2026-10-09T14:59:00+00:00'))
    yesterday=history(store)[0];request=approved(service)
    # Standalone / GitHub success never applies the approved queue.
    store.success(CHANNEL,'204',at('2026-10-10T00:00:00+00:00'))
    assert snapshot(store)['member_count']==2
    context=service.prepare_apply(lambda db:None)
    store.success(CHANNEL,'204',at('2026-10-10T03:00:00+00:00'),account_context=context)
    row=snapshot(store)
    assert (row['member_count'],row['workout_days'],row['elapsed_days'])==(1,4,10)
    assert history(store)[0]==yesterday
    assert row['identity_revision']==1 and row['previous_identity_revision']==0
    assert get_request(service,request['request_id'])['status']=='applied'
    assert len(store.logs())==4
    with store.transaction():
        assert store.conn.execute('SELECT count(*) AS n FROM solitary_athlete.workout_events').fetchone()['n']==5
        assert store.conn.execute('SELECT count(*) AS n FROM solitary_athlete.workout_logs').fetchone()['n']==5
    # Feature off retains already applied identity and does not rewrite closed history.
    with store.transaction():store.conn.execute('UPDATE solitary_athlete.mukmuk_identity_state SET enabled=false')
    store.success(CHANNEL,'204',at('2026-10-10T04:00:00+00:00'))
    assert snapshot(store)['member_count']==1 and history(store)[0]==yesterday


def test_stale_time_and_failed_commit_do_not_apply_or_rewrite_any_observation(accounts):
    service,_=accounts;store=service.store
    save(store,'200','1','2026-10-09');save(store,'201','2','2026-10-09')
    store.success(CHANNEL,'201',at('2026-10-10T03:00:00+00:00'))
    request=approved(service);context=service.prepare_apply(lambda db:None)
    before=snapshot(store)
    store.success(CHANNEL,'199',at('2026-10-09T03:00:00+00:00'),account_context=context)
    assert get_request(service,request['request_id'])['status']=='approved'
    assert snapshot(store)==before
    with psycopg.connect(os.environ['TEST_DATABASE_URL'],autocommit=True) as admin:
        admin.execute("ALTER TABLE solitary_athlete.mukmuk_daily_grass_history ADD CONSTRAINT fixture_fail_link CHECK(identity_revision=0)")
        try:
            with pytest.raises(psycopg.errors.CheckViolation):store.success(CHANNEL,'202',at('2026-10-10T04:00:00+00:00'),account_context=context)
            assert snapshot(store)==before
            assert get_request(service,request['request_id'])['status']=='approved'
            with store.transaction():assert store.conn.execute('SELECT revision FROM solitary_athlete.mukmuk_identity_state').fetchone()['revision']==0
        finally:admin.execute('ALTER TABLE solitary_athlete.mukmuk_daily_grass_history DROP CONSTRAINT fixture_fail_link')


def test_disconnection_or_permission_loss_defers_only_account_application(accounts):
    service,api=accounts;store=service.store
    request=approved(service)
    api.users['3']['roles']=[]
    assert service.prepare_apply(lambda db:None) is None
    assert get_request(service,request['request_id'])['status']=='invalidated'


def test_board_failure_keeps_data_and_applied_request_committed(accounts):
    from mukmuk.sync import run_sync
    service,_=accounts;store=service.store
    request=approved(service)
    class API:
        def channel(self,cid):return {'guild_id':service.guild}
        def me(self):return {'id':'99'}
        def messages(self,cid,before=None):return []
        def write(self,*args,**kwargs):
            assert get_request(service,request['request_id'])['status']=='applied'
            raise RuntimeError('board unavailable')
    with pytest.raises(RuntimeError,match='board unavailable'):
        run_sync(API(),store,{'DISCORD_GUILD_ID':service.guild,'DISCORD_AUTH_CHANNEL_ID':CHANNEL,'DISCORD_BOARD_CHANNEL_ID':'board'},account_context=lambda:service.prepare_apply(lambda db:None))
    assert store.state(CHANNEL)['last_success_at'] is not None
    assert get_request(service,request['request_id'])['status']=='applied'


def test_link_unlink_relink_same_day_and_expired_session_cannot_apply(accounts):
    from mukmuk.accounts import AccountError
    service,_=accounts;store=service.store
    save(store,'200','1','2026-10-01');save(store,'201','2','2026-10-01')
    request=approved(service)
    def offline(db):raise AccountError('expired_action')
    assert service.prepare_apply(offline) is None
    context=service.prepare_apply(lambda db:None)
    store.success(CHANNEL,'201',at('2026-10-10T00:00:00+00:00'),account_context=context)
    assert snapshot(store)['workout_days']==1
    unlink=action(service,300,'2','unlink',target_id='2')
    preview(service,{'id':unlink['request_id']},mid=301)
    assert action(service,302,'3','approve',request_id=unlink['request_id'],version=unlink['version'])['status']=='approved'
    store.success(CHANNEL,'201',at('2026-10-10T01:00:00+00:00'),account_context=service.prepare_apply(lambda db:None))
    assert (snapshot(store)['identity_revision'],snapshot(store)['member_count'],snapshot(store)['workout_days'])==(2,2,2)
    again=action(service,400,'1','request',target_id='2')
    consent=action(service,401,'2','consent',request_id=again['request_id'],version=again['version'])
    preview(service,{'id':again['request_id']},mid=402)
    action(service,403,'3','approve',request_id=again['request_id'],version=consent['version'])
    store.success(CHANNEL,'201',at('2026-10-10T02:00:00+00:00'),account_context=service.prepare_apply(lambda db:None))
    assert (snapshot(store)['identity_revision'],snapshot(store)['workout_days'])==(3,1)


def test_local_bot_uses_shared_database_for_application_context(accounts):
    from types import SimpleNamespace
    from mukmuk.local_bot import LocalBot
    service,_=accounts
    bot=SimpleNamespace(database=service.store,api=service.api,settings=service.settings,
                        runtime=SimpleNamespace(fence=1,_guard=lambda db,fence:None))
    approved(service)
    assert LocalBot._application_context(bot) is not None
