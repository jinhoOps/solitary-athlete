import os
import psycopg
import pytest
from test_store import store

from test_accounts import accounts, get_request
from test_identity_participation import approved
from test_participation import save, CHANNEL

RUN='33333333-3333-4333-8333-333333333333'

@pytest.fixture
def go_run(accounts):
    service,_=accounts
    with psycopg.connect(os.environ['TEST_DATABASE_URL'],autocommit=True) as db:
        db.execute('TRUNCATE solitary_athlete.mukmuk_board_publication, solitary_athlete.mukmuk_collection_effects, solitary_athlete.mukmuk_collection_runs')
        db.execute('INSERT INTO solitary_athlete.mukmuk_board_publication DEFAULT VALUES')
        db.execute("UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='go'")
        db.execute("INSERT INTO solitary_athlete.mukmuk_collection_runs(id,fence,status,completed_at) VALUES(%s,1,'completed',clock_timestamp())",(RUN,))
        db.execute("INSERT INTO solitary_athlete.mukmuk_collection_effects(run_id,kind,expires_at) VALUES(%s,'identity',clock_timestamp()+interval '30 seconds'),(%s,'board',NULL)",(RUN,RUN))
        try: yield service
        finally: db.execute("UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='python'")

def test_completed_run_applies_one_identity_with_observation_and_no_cursor_change(go_run):
    from mukmuk.collector_effects import consume_identity
    service=go_run;save(service.store,'200','1','2026-10-01');save(service.store,'201','2','2026-10-01')
    request=approved(service)
    assert consume_identity(service,lambda db:None) is True
    assert get_request(service,request['request_id'])['status']=='applied'
    with service.store.transaction() as db:
        revision=db.execute('SELECT revision FROM solitary_athlete.mukmuk_identity_state').fetchone()['revision']
        effect=db.execute("SELECT status FROM solitary_athlete.mukmuk_collection_effects WHERE kind='identity'").fetchone()['status']
        observation=db.execute('SELECT identity_revision FROM solitary_athlete.mukmuk_daily_grass_history ORDER BY snapshot_date DESC LIMIT 1').fetchone()['identity_revision']
        assert (revision,effect,observation)==(1,'done',1)
        assert db.execute('SELECT count(*) AS n FROM solitary_athlete.sync_status').fetchone()['n']==0
    assert consume_identity(service,lambda db:None) is False

def test_expired_run_cannot_apply(go_run):
    from mukmuk.collector_effects import consume_identity
    service=go_run;request=approved(service)
    with service.store.transaction() as db:db.execute("UPDATE solitary_athlete.mukmuk_collection_effects SET expires_at=clock_timestamp()-interval '1 second' WHERE kind='identity'")
    assert consume_identity(service,lambda db:None) is False
    assert get_request(service,request['request_id'])['status']=='approved'

def test_local_bot_handles_completed_identity_effect_with_live_session_guard(go_run):
    from types import SimpleNamespace
    from mukmuk.local_bot import LocalBot
    service=go_run;request=approved(service);seen=[]
    runtime=SimpleNamespace(fence=7,_guard=lambda db,fence:seen.append(fence))
    bot=SimpleNamespace(database=service.store,api=service.api,settings=service.settings,runtime=runtime)
    assert LocalBot._consume_identity_effect(bot) is True
    assert get_request(service,request['request_id'])['status']=='applied'
    assert seen and set(seen)=={7}

class BoardAPI:
    def __init__(self):self.writes=[]
    def me(self):return {'id':'99'}
    def channel(self,cid):return {'guild_id':'1559802401802952706'}
    def messages(self,cid,before=None):return []
    def write(self,cid,content,mid=None,file=None):
        self.writes.append((cid,mid));return {'id':'987'}


def test_board_waits_for_identity_then_skips_unchanged_minute(go_run):
    from mukmuk.collector_effects import publish_board
    service=go_run;store=service.store;api=BoardAPI()
    settings={'DISCORD_GUILD_ID':service.guild,'DISCORD_AUTH_CHANNEL_ID':CHANNEL,'DISCORD_BOARD_CHANNEL_ID':'board'}
    assert publish_board(store,api,settings) is False
    with store.transaction() as db:db.execute("UPDATE solitary_athlete.mukmuk_collection_effects SET status='done' WHERE kind='identity'")
    assert publish_board(store,api,settings) is True
    assert len(api.writes)==1
    with store.transaction() as db:
        db.execute("INSERT INTO solitary_athlete.mukmuk_collection_runs(id,fence,status,completed_at) VALUES('44444444-4444-4444-8444-444444444444',1,'completed',clock_timestamp())")
        db.execute("INSERT INTO solitary_athlete.mukmuk_collection_effects(run_id,kind,status,expires_at) VALUES('44444444-4444-4444-8444-444444444444','identity','done',clock_timestamp()),('44444444-4444-4444-8444-444444444444','board','queued',NULL)")
    assert publish_board(store,api,settings) is False
    assert len(api.writes)==1

def test_local_bot_in_go_mode_publishes_without_running_python_collector(go_run,monkeypatch,tmp_path):
    import asyncio
    from mukmuk.local_bot import LocalBot
    from mukmuk.local_owner import LocalOwner
    import mukmuk.collector_effects as effects
    import mukmuk.local_bot as module
    calls=[]
    monkeypatch.setattr(effects,'publish_board',lambda store,api,settings:calls.append('board'))
    monkeypatch.setattr(module,'sync_lock',lambda *args:pytest.fail('Python collector must not start'))
    async def run():
        settings={**go_run.settings,'MUKMUK_DATABASE_URL':os.environ['TEST_DATABASE_URL'],'DISCORD_BOT_TOKEN':'fixture',
          'DISCORD_AUTH_CHANNEL_ID':CHANNEL,'DISCORD_BOARD_CHANNEL_ID':'board'}
        with LocalOwner(tmp_path) as owner:
            bot=LocalBot(settings,owner)
            try: assert bot._collect_once()=='go'
            finally: await bot.close()
    asyncio.run(run())
    assert calls==['board']

def test_fallback_can_publish_board_with_gateway_offline(go_run,monkeypatch):
    import main
    import mukmuk.collector_effects as effects
    calls=[]
    monkeypatch.setattr(effects,'publish_board',lambda store,api,settings:calls.append('board'))
    assert main.publish_go_board_if_enabled(go_run.store,object(),go_run.settings)
    assert calls==['board']

def test_identity_observation_failure_rolls_back_relationship_and_effect(go_run):
    from mukmuk.collector_effects import consume_identity
    service=go_run;request=approved(service)
    with psycopg.connect(os.environ['TEST_DATABASE_URL'],autocommit=True) as admin:
        admin.execute("ALTER TABLE solitary_athlete.mukmuk_daily_grass_history ADD CONSTRAINT fixture_go_link CHECK(identity_revision=0)")
        try:
            with pytest.raises(psycopg.errors.CheckViolation):consume_identity(service,lambda db:None)
            with service.store.transaction() as db:
                assert db.execute('SELECT revision FROM solitary_athlete.mukmuk_identity_state').fetchone()['revision']==0
                assert db.execute("SELECT status FROM solitary_athlete.mukmuk_collection_effects WHERE kind='identity'").fetchone()['status']=='processing'
            assert get_request(service,request['request_id'])['status']=='approved'
        finally:admin.execute('ALTER TABLE solitary_athlete.mukmuk_daily_grass_history DROP CONSTRAINT fixture_go_link')

def test_lost_online_session_does_not_count_as_account_failure(go_run):
    from mukmuk.collector_effects import consume_identity
    from mukmuk.accounts import AccountError
    service=go_run;request=approved(service);calls=[]
    def guard(db):
        calls.append(1)
        if len(calls)>=3: raise AccountError('expired_action')
    with pytest.raises(AccountError):consume_identity(service,guard)
    row=get_request(service,request['request_id'])
    assert row['status']=='approved' and row['failures']==0

def test_failed_board_post_is_retried_without_changing_collection(go_run):
    from mukmuk.collector_effects import publish_board
    service=go_run;store=service.store;api=BoardAPI()
    settings={'DISCORD_GUILD_ID':service.guild,'DISCORD_AUTH_CHANNEL_ID':CHANNEL,'DISCORD_BOARD_CHANNEL_ID':'board'}
    with store.transaction() as db:db.execute("UPDATE solitary_athlete.mukmuk_collection_effects SET status='done' WHERE kind='identity'")
    original=api.write
    def fail(*args,**kwargs):raise RuntimeError('fixture outage')
    api.write=fail
    with pytest.raises(RuntimeError,match='fixture outage'):publish_board(store,api,settings)
    with store.transaction() as db:
        assert db.execute("SELECT status FROM solitary_athlete.mukmuk_collection_effects WHERE kind='board'").fetchone()['status']=='queued'
        assert db.execute('SELECT owner_id FROM solitary_athlete.mukmuk_board_publication').fetchone()['owner_id'] is None
        assert db.execute('SELECT status FROM solitary_athlete.mukmuk_collection_runs').fetchone()['status']=='completed'
    api.write=original
    assert publish_board(store,api,settings) is True

def test_offline_board_fallback_releases_database_connection_during_http(go_run):
    from mukmuk.collector_effects import publish_board
    from mukmuk.db_session import SharedDB, TransientStore
    service=go_run;store=service.store
    settings={'DISCORD_GUILD_ID':service.guild,'DISCORD_AUTH_CHANNEL_ID':CHANNEL,'DISCORD_BOARD_CHANNEL_ID':'board'}
    with store.transaction() as db:db.execute("UPDATE solitary_athlete.mukmuk_collection_effects SET status='done' WHERE kind='identity'")
    class API(BoardAPI):
        def check_connections(self):
            with psycopg.connect(os.environ['TEST_DATABASE_URL'],autocommit=True) as db:
                n=db.execute("SELECT count(*) FROM pg_stat_activity WHERE application_name='mukmuk-local-data'").fetchone()[0]
                assert n==0
        def channel(self,cid):self.check_connections();return super().channel(cid)
        def messages(self,cid,before=None):self.check_connections();return []
        def write(self,*args,**kwargs):self.check_connections();return super().write(*args,**kwargs)
    assert publish_board(TransientStore(SharedDB(os.environ['TEST_DATABASE_URL'])),API(),settings)

def test_board_http_allows_edge_connection_at_role_limit(go_run):
    from contextlib import ExitStack
    from mukmuk.collector_effects import publish_board
    from mukmuk.db_session import SharedDB, TransientStore
    url=os.environ.get('TEST_WORKER_DATABASE_URL')
    if not url: pytest.skip('worker-role fixture required')
    service=go_run;store=service.store
    settings={'DISCORD_GUILD_ID':service.guild,'DISCORD_AUTH_CHANNEL_ID':CHANNEL,'DISCORD_BOARD_CHANNEL_ID':'board'}
    with store.transaction() as db:db.execute("UPDATE solitary_athlete.mukmuk_collection_effects SET status='done' WHERE kind='identity'")
    class API(BoardAPI):
        def channel(self,cid):
            with psycopg.connect(url,connect_timeout=2) as edge:
                assert edge.execute('SELECT 1').fetchone()[0]==1
            return super().channel(cid)
    with ExitStack() as stack:
        stack.enter_context(psycopg.connect(url,connect_timeout=2))
        stack.enter_context(psycopg.connect(url,connect_timeout=2))
        assert publish_board(TransientStore(SharedDB(url)),API(),settings)
