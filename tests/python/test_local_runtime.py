import json
import os
from pathlib import Path
import subprocess
import sys
import time
from uuid import uuid4
from psycopg.types.json import Jsonb
from test_store import store, event
from test_accounts import Members, SETTINGS
from mukmuk.db_session import SharedDB
from mukmuk.local_runtime import LocalRuntime
from mukmuk.local_owner import LocalOwner, managed_runtime_active


def enabled(store):
    with store.transaction():
        store.conn.execute('UPDATE solitary_athlete.mukmuk_identity_state SET enabled=true')


def queued(store, status, mid='500', expire=False):
    action = {'interaction_id':mid,'actor_id':'1','kind':'request','target_id':'2'}
    with store.transaction():
        store.conn.execute('''INSERT INTO solitary_athlete.mukmuk_account_link_actions
         (interaction_id,actor_id,kind,payload,runtime_session,runtime_fence,created_at,expires_at)
         VALUES(%s,'1','request',%s,%s,%s,clock_timestamp()-interval '20 seconds',
          clock_timestamp()+%s*interval '1 second')''',
          (mid,Jsonb(action),status['session'],status['fence'],-1 if expire else 15))


def result(store, mid='500'):
    with store.transaction():
        return store.conn.execute('SELECT * FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=%s',(mid,)).fetchone()


def test_ready_runtime_executes_only_its_current_unexpired_action(store):
    enabled(store)
    db = SharedDB(os.environ['TEST_DATABASE_URL'])
    runtime = LocalRuntime(db, Members(), SETTINGS)
    status = runtime.tick(True)
    assert status['ready'] is True
    assert LocalRuntime(db, Members(), SETTINGS).tick(True)['ready'] is False
    queued(store,status)
    assert runtime.tick(True)['handled'] is True
    row = result(store)
    assert row['status']=='done' and row['result']['status']=='awaiting_consent'
    assert row['request_id'] is not None
    assert runtime.tick(False)['ready'] is False
    assert managed_count(store)==1


def managed_count(store):
    with store.transaction():
        return store.conn.execute('SELECT count(*) AS n FROM solitary_athlete.mukmuk_account_link_requests').fetchone()['n']


def test_expired_session_fences_old_worker_and_does_not_resurrect_queued_click(store):
    enabled(store)
    db = SharedDB(os.environ['TEST_DATABASE_URL'])
    old = LocalRuntime(db,Members(),SETTINGS)
    first = old.tick(True)
    queued(store,first)
    with store.transaction():
        store.conn.execute("UPDATE solitary_athlete.mukmuk_local_runtime SET lease_until=clock_timestamp()-interval '1 second'")
    new = LocalRuntime(db,Members(),SETTINGS)
    current = new.tick(True)
    assert current['ready'] and current['fence']>first['fence']
    assert old.tick(True)['ready'] is False
    assert result(store)['status']=='expired'
    assert result(store)['request_id'] is None
    assert managed_count(store)==0


def test_expired_action_or_disconnect_during_permission_lookup_cannot_create_request(store):
    enabled(store)
    ready = {'value':True}
    api = Members()
    db = SharedDB(os.environ['TEST_DATABASE_URL'])
    runtime = LocalRuntime(db,api,SETTINGS,ready_check=lambda:ready['value'])
    status = runtime.tick(True)
    queued(store,status,expire=True)
    runtime.tick(True)
    assert result(store)['status']=='expired'
    queued(store,status,mid='501')
    original = api.once
    def disconnect(method,path,deadline):
        ready['value']=False
        return original(method,path,deadline)
    api.once=disconnect
    assert runtime.tick(True)['ready'] is False
    assert managed_count(store)==0


def test_disabled_feature_never_acquires_online_lease(store):
    db=SharedDB(os.environ['TEST_DATABASE_URL'])
    assert LocalRuntime(db,Members(),SETTINGS).tick(True)['ready'] is False
    assert managed_count(store)==0


def test_fresh_file_and_live_lock_are_both_needed_to_skip_fallback(tmp_path):
    clock={'now':10.0}
    path=tmp_path/'owner'
    with LocalOwner(path,clock=lambda:clock['now']) as owner:
        owner.touch()
        assert managed_runtime_active(path,clock=lambda:clock['now']) is True
        clock['now']=26.0
        assert managed_runtime_active(path,clock=lambda:clock['now']) is False
        owner.touch()
        assert managed_runtime_active(path,clock=lambda:clock['now']) is True
    assert managed_runtime_active(path,clock=lambda:clock['now']) is False


def test_collector_watchdog_ends_a_stalled_process_without_app_tokens():
    code='from mukmuk.local_bot import collector_watchdog; import time\nwith collector_watchdog(0.1): time.sleep(5)'
    child=subprocess.run([sys.executable,'-c',code],capture_output=True,text=True,timeout=5)
    assert child.returncode==124, child.stderr


def test_permission_lookup_failure_is_returned_to_edge_without_creating_business_request(store):
    enabled(store)
    api=Members()
    db=SharedDB(os.environ['TEST_DATABASE_URL'])
    runtime=LocalRuntime(db,api,SETTINGS)
    status=runtime.tick(True)
    queued(store,status)
    api.users['1']['roles']=[]
    runtime.tick(True)
    row=result(store)
    assert row['status']=='done'
    assert row['result']['error_code']=='permission_denied'
    assert managed_count(store)==0


def test_gateway_disconnect_is_an_immediate_gate_even_before_sdk_ready_flag_changes(store,tmp_path,monkeypatch):
    import asyncio
    from mukmuk.local_bot import LocalBot
    async def run():
        settings={**SETTINGS,'MUKMUK_DATABASE_URL':os.environ['TEST_DATABASE_URL'],
                  'DISCORD_BOT_TOKEN':'fixture','MUKMUK_ACCOUNT_LINK_ENABLED':'true'}
        with LocalOwner(tmp_path) as owner:
            bot=LocalBot(settings,owner)
            monkeypatch.setattr(bot,'is_ready',lambda:True)
            monkeypatch.setattr(LocalBot,'latency',property(lambda _:0.01))
            try:
                assert bot.account_ready() is False
                await bot.on_resumed()
                assert bot.account_ready() is True
                await bot.on_disconnect()
                assert bot.account_ready() is False
            finally:
                await bot.close()
    asyncio.run(run())


def test_cancelled_collector_coroutine_keeps_worker_marked_active_until_http_returns(store,tmp_path,monkeypatch):
    import asyncio
    import threading
    from mukmuk.local_bot import LocalBot
    from mukmuk.discord import Discord
    started,release=threading.Event(),threading.Event()
    def blocked_channel(self,channel):
        started.set()
        release.wait(3)
        raise RuntimeError('simulated HTTP boundary')
    monkeypatch.setattr(Discord,'channel',blocked_channel)
    async def run():
        settings={**SETTINGS,'MUKMUK_DATABASE_URL':os.environ['TEST_DATABASE_URL'],'DISCORD_BOT_TOKEN':'fixture',
                  'DISCORD_AUTH_CHANNEL_ID':event().channel_id,'DISCORD_BOARD_CHANNEL_ID':'2'}
        with LocalOwner(tmp_path) as owner:
            bot=LocalBot(settings,owner)
            bot.collect_requested.set()
            task=asyncio.create_task(bot._collects())
            try:
                assert await asyncio.to_thread(started.wait,2)
                task.cancel()
                await asyncio.gather(task,return_exceptions=True)
                assert bot.collecting is True
            finally:
                release.set()
                for _ in range(30):
                    if not bot.collecting:break
                    await asyncio.sleep(.01)
                await bot.close()
    asyncio.run(run())


def test_launchd_runner_skips_before_db_when_a_local_owner_is_fresh(tmp_path):
    state=tmp_path/'state'
    script=Path(__file__).resolve().parents[2]/'scripts/macos_sync.py'
    with LocalOwner(state):
        child=subprocess.run([sys.executable,str(script)],cwd=tmp_path,capture_output=True,text=True,
                             env={'PATH':os.environ['PATH'],'MUKMUK_LOCAL_STATE_DIR':str(state),
                                  'MUKMUK_LOG_DIR':str(tmp_path/'logs')},timeout=5)
    assert child.returncode==0, child.stderr
    assert 'skip=managed_by_local_bot' in (tmp_path/'logs/sync.log').read_text()
