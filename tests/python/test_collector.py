from datetime import datetime, timezone
import httpx
import pytest
from mukmuk.sync import event_from_message, collect_messages
from mukmuk.discord import Discord
from mukmuk.board import build_board

def message(mid='100', content='운동', photo=False):
    return {'id':mid, 'type':0, 'timestamp':'2026-10-13T15:00:00Z', 'content':content,
            'author':{'id':'123','username':'old','global_name':'하루','bot':False},
            'member':{'nick':'닉네임'}, 'attachments':[{'content_type':'image/jpeg','filename':'photo.jpg'}] if photo else []}

def test_image_metadata_and_kst_date_never_infer_photo_from_text():
    e=event_from_message(message(content='[사진 인증]', photo=False), '1', '2')
    assert e.has_photo is False and e.username=='닉네임'
    assert e.created_at.astimezone(timezone.utc).isoformat()=='2026-10-13T15:00:00+00:00'
    assert event_from_message(message(content='',photo=True),'1','2').has_photo
    m=message(content=''); m['attachments']=[{'content_type':'video/mp4','filename':'not.jpg'}]
    assert event_from_message(m,'1','2') is None
    m['attachments']=[{'filename':'PHOTO.PNG'}]
    assert event_from_message(m,'1','2').has_photo

def test_paginates_more_than_100_and_freezes_upper_bound():
    pages={None:[message(str(i)) for i in range(205,105,-1)],'106':[message(str(i)) for i in range(105,5,-1)],'6':[message(str(i)) for i in range(5,0,-1)]}
    class API:
        def messages(self, channel, before=None): return pages[before]
    rows,ceiling=collect_messages(API(),'2',None,datetime(2026,10,14,tzinfo=timezone.utc))
    assert len(rows)==205 and rows[0]['id']=='1' and rows[-1]['id']=='205' and ceiling=='205'

def test_retry_after_and_server_failure_retry_real_http_client():
    attempts=[]; sleeps=[]
    def respond(req):
        attempts.append(req)
        if len(attempts)==1:return httpx.Response(429,json={'retry_after':0.01})
        if len(attempts)==2:return httpx.Response(503)
        return httpx.Response(200,json={'id':'42'})
    api=Discord('fixture',httpx.Client(transport=httpx.MockTransport(respond)),sleep=sleeps.append)
    assert api.me()['id']=='42'
    assert sleeps[0]==0.01 and len(attempts)==3

def test_board_splits_whole_members_disables_markdown_in_names_and_four_rows():
    rows=[{'user_id':str(i),'username':'하루'*30+'@everyone','log_date':'2026-10-14','memo':'걷기','has_photo':i%2==0} for i in range(25)]
    pages=build_board(rows,datetime(2026,10,14,tzinfo=timezone.utc),'https://example.com')
    assert len(pages)>1 and all(len(p.encode('utf-16-le'))//2<=2000 for p in pages)
    assert all('고운 잔디밭' in p for p in pages)
    assert sum(p.count('누적') for p in pages)==25
    assert '@everyone' not in '\n'.join(pages)
    assert '🌲' in '\n'.join(pages)

def test_sync_stops_board_publish_if_lock_lost_during_board_history():
    from mukmuk.sync import run_sync
    alive = [True]
    class API:
        def channel(self, cid): return {'guild_id': 'guild'}
        def me(self): return {'id': 'bot'}
        def messages(self, cid, before=None):
            if cid == 'board': alive[0] = False
            return []
        def write(self, *args): pytest.fail('must not publish without lock')
    class Store:
        def state(self, cid): return {'last_message_id': None}
        def pending_reactions(self): return []
        def logs(self): return []
        def success(self, *args): pytest.fail('must not report success without lock')
    def check():
        if not alive[0]: raise RuntimeError('lock connection lost')
    with pytest.raises(RuntimeError, match='lock connection lost'):
        run_sync(API(), Store(), {'DISCORD_GUILD_ID': 'guild',
            'DISCORD_AUTH_CHANNEL_ID': 'auth', 'DISCORD_BOARD_CHANNEL_ID': 'board'}, check_lock=check)
