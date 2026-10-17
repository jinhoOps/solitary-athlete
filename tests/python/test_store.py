import os
from datetime import datetime, timezone
import psycopg
import pytest
from mukmuk.store import Store
from mukmuk.sync import event_from_message
from test_collector import message
from mukmuk.sync import run_sync
from mukmuk.discord import DiscordError

@pytest.fixture
def store():
    url=os.environ.get('TEST_DATABASE_URL')
    if not url: pytest.skip('Use scripts/test-db.sh for the isolated PostgreSQL integration suite')
    with psycopg.connect(url, autocommit=True) as admin:
        admin.execute('TRUNCATE solitary_athlete.workout_events, solitary_athlete.workout_logs, solitary_athlete.sync_state, solitary_athlete.sync_status, solitary_athlete.reply_cleanup_jobs, solitary_athlete.channel_access_secrets, solitary_athlete.workout_refresh_jobs')
    with psycopg.connect(url) as conn:
        conn.execute('SET ROLE mukmuk_worker'); conn.commit()
        yield Store(conn)

def event(mid='100',content='걷기',photo=False):
    return event_from_message(message(mid,content,photo),'1559802401802952706','1559804769327910932')

def test_atomic_idempotency_photo_bonus_removal_and_empty_edit(store):
    store.save('100',event()); store.save('100',event());
    rows=store.logs(); assert len(rows)==1 and rows[0]['verification_count']==1
    assert rows[0]['log_date'].isoformat()=='2026-10-14'
    store.save('101',event('101','',True)); rows=store.logs()
    assert len(rows)==1 and rows[0]['has_photo'] and rows[0]['verification_count']==2
    store.save('101',event('101','스트레칭',False)); rows=store.logs()
    assert not rows[0]['has_photo'] and rows[0]['memo']=='걷기\n스트레칭'
    store.save('100',None); store.save('101',None); assert store.logs()==[]

def test_failed_save_leaves_previous_event_and_daily_aggregate_intact(store):
    store.save('100',event())
    bad=event('100','변경'); bad.guild_id='999'
    with pytest.raises(psycopg.errors.CheckViolation): store.save('100',bad)
    assert store.logs()[0]['memo']=='걷기'

def test_retry_reaction_keeps_record_and_cursor_separate(store):
    store.save('100',event())
    store.save('101',event('101', '달리기', photo=True))
    pending = store.pending_reactions()
    assert pending[0]['message_id']=='100' and pending[0]['has_photo'] is False
    assert pending[1]['message_id']=='101' and pending[1]['has_photo'] is True
    store.reacted('100')
    store.reacted('101')
    assert store.pending_reactions()==[]
    assert store.state('1559804769327910932')['last_message_id'] is None

def test_sync_reaction_failure_restarts_without_duplicate_memo_or_cursor_advance(store):
    class API:
        fail=True
        writes=[]
        reactions=[]
        def channel(self,cid): return {'guild_id':'1559802401802952706'}
        def me(self): return {'id':'42'}
        def messages(self,cid,before=None):
            if cid=='1559804769327910932': return [message('100')]
            return [{'id':'200','author':{'id':'42'},'content':'개인 메시지'},
                    {'id':'201','author':{'id':'42'},'content':'🌱 묵묵 · 운동 잔디 현황\n이전 현황'}]
        def react(self,cid,mid,emoji='✅'):
            if self.fail: raise DiscordError(503)
            self.reactions.append((cid,mid,emoji))
        def write(self,cid,content,mid=None,file=None):
            self.writes.append((mid,content)); return {'id':mid or '202'}
    api=API()
    settings={'DISCORD_GUILD_ID':'1559802401802952706','DISCORD_AUTH_CHANNEL_ID':'1559804769327910932','DISCORD_BOARD_CHANNEL_ID':'1559803770744078408'}
    with pytest.raises(DiscordError): run_sync(api,store,settings,datetime(2026,10,14,tzinfo=timezone.utc))
    assert store.state(settings['DISCORD_AUTH_CHANNEL_ID'])['last_message_id'] is None
    assert store.logs()[0]['verification_count']==1
    api.fail=False
    run_sync(api,store,settings,datetime(2026,10,14,tzinfo=timezone.utc))
    assert store.logs()[0]['memo']=='운동'
    assert store.state(settings['DISCORD_AUTH_CHANNEL_ID'])['last_message_id']=='100'
    assert api.writes[0][0]=='201' and len(api.writes)==1


def test_active_secret_ignores_expired_codes_and_uses_latest_valid_issue(store):
    with store.conn.transaction():
        store.conn.execute("""INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at) VALUES
          ('fixture-old','2026-10-01','2026-10-20','2026-10-21'),
          ('fixture-current','2026-10-12','2026-10-19','2026-10-20'),
          ('fixture-expired','2026-10-13','2026-10-13','2026-10-14')""")
    assert store.active_secret(datetime(2026,10,14,9,tzinfo=timezone.utc))=='fixture-current'
    assert store.active_secret(datetime(2026,10,22,tzinfo=timezone.utc)) is None


def test_sync_lock_excludes_another_connection_and_releases_after_failure():
    from mukmuk.scheduler import sync_lock
    url = os.environ.get('TEST_DATABASE_URL')
    if not url:
        pytest.skip('isolated PostgreSQL required')
    channel = '1559804769327910932'
    with pytest.raises(RuntimeError):
        with sync_lock(url, channel) as first:
            assert first is not None
            with sync_lock(url, channel) as second:
                assert second is None
            raise RuntimeError('fixture failure')
    with sync_lock(url, channel) as next_run:
        assert next_run is not None


def test_attachment_metadata_reprocessing_removal_and_transaction_rollback(store):
    m=message(photo=True)
    m['attachments'][0].update(id='200',width=800,height=600,size=100)
    e=event_from_message(m,'1559802401802952706','1559804769327910932')
    store.save('100',e); store.save('100',e)
    with store.conn.transaction():
        row=store.conn.execute('SELECT attachments FROM solitary_athlete.workout_events WHERE message_id=%s',('100',)).fetchone()
        assert len(row['attachments'])==1 and row['attachments'][0]['attachment_id']=='200'
    e.guild_id='999'
    with pytest.raises(psycopg.errors.CheckViolation): store.save('100',e)
    with store.conn.transaction():
        assert len(store.conn.execute("SELECT attachments FROM solitary_athlete.workout_events WHERE message_id='100'").fetchone()['attachments'])==1
    store.save('100',event())
    with store.conn.transaction():
        assert store.conn.execute("SELECT attachments FROM solitary_athlete.workout_events WHERE message_id='100'").fetchone()['attachments']==[]
    assert store.logs()[0]['verification_count']==1


def test_refresh_job_enqueue_deduplicates_target_and_zero_history(store):
    with store.conn.transaction():store.conn.execute('DELETE FROM solitary_athlete.workout_refresh_jobs')
    store.save('100',event())
    def enqueue(i,target='123'):
        with store.conn.transaction():
            return store.conn.execute("SELECT * FROM solitary_athlete.enqueue_workout_refresh(%s,'123',%s,'1559802401802952706','1559804769327910932')",(i,target)).fetchone()
    a=enqueue('900');b=enqueue('901')
    assert a['id']==b['id']=='900' and a['total']==1 and a['upper_id']=='100'
    assert enqueue('902','999')['status']=='done'


def test_refresh_atomic_removal_scope_snapshot_and_lease_fencing(store):
    with store.conn.transaction():store.conn.execute('DELETE FROM solitary_athlete.workout_refresh_jobs')
    store.save('100',event());store.save('101',event('101','',True))
    with store.conn.transaction():
        store.conn.execute("SELECT * FROM solitary_athlete.enqueue_workout_refresh('950','123','123','1559802401802952706','1559804769327910932')")
    job=store.claim_refresh();assert job['total']==2
    store.save('102',event('102','new'))
    assert [r['message_id'] for r in store.refresh_events(job)]==['100','101']
    store.apply_refresh(job,'100',event())
    store.apply_refresh(job,'101',None)
    assert store.logs()[0]['memo']=='걷기\nnew' and not store.logs()[0]['has_photo']
    store.apply_refresh(job,'101',None)
    with store.conn.transaction():
        row=store.conn.execute("SELECT checked,removed FROM solitary_athlete.workout_refresh_jobs WHERE id='950'").fetchone()
        assert row=={'checked':2,'removed':1}
    stale={**job,'version':job['version']-1}
    with pytest.raises(RuntimeError,match='lease'):store.apply_refresh(stale,'100',None)
    store.finish_refresh_batch(job)
    with store.conn.transaction():assert store.conn.execute("SELECT status FROM solitary_athlete.workout_refresh_jobs WHERE id='950'").fetchone()['status']=='done'


def test_refresh_failed_save_rolls_back_cursor_and_counts(store):
    with store.conn.transaction():store.conn.execute('DELETE FROM solitary_athlete.workout_refresh_jobs')
    store.save('100',event())
    with store.conn.transaction():store.conn.execute("SELECT * FROM solitary_athlete.enqueue_workout_refresh('960','123','123','1559802401802952706','1559804769327910932')")
    job=store.claim_refresh();bad=event();bad.guild_id='999'
    with pytest.raises(psycopg.errors.CheckViolation):store.apply_refresh(job,'100',bad)
    assert store.logs()[0]['memo']=='걷기'
    with store.conn.transaction():
        row=store.conn.execute("SELECT checked,cursor_id FROM solitary_athlete.workout_refresh_jobs WHERE id='960'").fetchone()
        assert row=={'checked':0,'cursor_id':'0'}


def test_refresh_retry_limit_lease_expiry_and_private_queue(store):
    with store.conn.transaction():store.conn.execute('DELETE FROM solitary_athlete.workout_refresh_jobs')
    store.save('100',event())
    with store.conn.transaction():store.conn.execute("SELECT * FROM solitary_athlete.enqueue_workout_refresh('970','123','123','1559802401802952706','1559804769327910932')")
    first=store.claim_refresh();assert store.claim_refresh() is None
    with store.conn.transaction():store.conn.execute("UPDATE solitary_athlete.workout_refresh_jobs SET lease_until=now()-interval '1 second' WHERE id='970'")
    recovered=store.claim_refresh();assert recovered['version']>first['version']
    with pytest.raises(RuntimeError):store.defer_refresh(first,'stale',0)
    for attempt in range(10):
        store.defer_refresh(recovered,'network',0)
        if attempt<9:recovered=store.claim_refresh()
    assert store.claim_refresh() is None and store.logs()[0]['memo']=='걷기'
    with store.conn.transaction():assert store.conn.execute("SELECT status FROM solitary_athlete.workout_refresh_jobs WHERE id='970'").fetchone()['status']=='failed'
    with psycopg.connect(os.environ['TEST_DATABASE_URL']) as anon:
        anon.execute('SET ROLE anon')
        with pytest.raises(psycopg.errors.InsufficientPrivilege):anon.execute('SELECT * FROM solitary_athlete.workout_refresh_jobs')
