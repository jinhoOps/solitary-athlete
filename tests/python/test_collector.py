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
        def claim_refresh(self): return None
        def state(self, cid): return {'last_message_id': None}
        def pending_reactions(self): return []
        def logs(self): return []
        def success(self, *args): pytest.fail('must not report success without lock')
    def check():
        if not alive[0]: raise RuntimeError('lock connection lost')
    with pytest.raises(RuntimeError, match='lock connection lost'):
        run_sync(API(), Store(), {'DISCORD_GUILD_ID': 'guild',
            'DISCORD_AUTH_CHANNEL_ID': 'auth', 'DISCORD_BOARD_CHANNEL_ID': 'board'}, check_lock=check)


def test_photo_metadata_omits_urls_and_non_images():
    m=message(photo=False)
    m['attachments']=[{'id':'200','filename':'a.jpg','content_type':'image/jpeg','size':100,'width':800,'height':600,'url':'https://secret','proxy_url':'https://secret'},
                      {'id':'201','filename':'video.jpg','content_type':'video/mp4'},
                      {'id':'202','filename':'b.PNG','size':200}]
    e=event_from_message(m,'1','2')
    assert [a['attachment_id'] for a in e.attachments]==['200','202']
    assert e.attachments[0]['width']==800
    assert 'url' not in str(e.attachments)


def test_metadata_backfill_does_not_write_logs_and_only_confirms_404():
    from mukmuk.photos import backfill_photos
    from mukmuk.discord import DiscordError
    class Store:
        def photo_events(self, after):
            return [{'message_id':str(i),'channel_id':'2'} for i in range(100,103)] if after is None else []
        def photo_metadata(self, mid, attachments): updates.append((mid,attachments))
    class API:
        def message(self, channel, mid):
            if mid=='101': raise DiscordError(404)
            if mid=='102': raise DiscordError(403)
            m=message(mid,photo=True);m['attachments'][0]['id']='200';return m
    updates=[]
    with pytest.raises(DiscordError): backfill_photos(API(),Store(),'1','2')
    assert len(updates)==2 and updates[1]==('101',[])

def test_sync_reactions_custom_and_fallback_emojis():
    from mukmuk.sync import run_sync
    reactions = []
    reacted_ids = []
    class API:
        def channel(self, cid): return {'guild_id': 'guild-1'}
        def me(self): return {'id': 'bot-1'}
        def messages(self, cid, before=None): return []
        def react(self, cid, mid, emoji='✅'):
            reactions.append((cid, mid, emoji))
        def write(self, *args, **kwargs): return {'id': 'board-1'}
    class Store:
        def claim_refresh(self): return None
        def state(self, cid): return {'last_message_id': None}
        def pending_reactions(self):
            return [
                {'channel_id': 'auth-1', 'message_id': '101', 'has_photo': False},
                {'channel_id': 'auth-1', 'message_id': '102', 'has_photo': True},
            ]
        def reacted(self, mid): reacted_ids.append(mid)
        def board_ids(self, *args): pass
        def logs(self): return []
        def success(self, *args): pass

    # 1. Custom emoji IDs configured
    settings = {
        'DISCORD_GUILD_ID': 'guild-1',
        'DISCORD_AUTH_CHANNEL_ID': 'auth-1',
        'DISCORD_BOARD_CHANNEL_ID': 'board-1',
        'DISCORD_CHECK_EMOJI_ID': '1560537044969725973',
        'DISCORD_FLEX_EMOJI_ID': '1560537051680604163',
    }
    run_sync(API(), Store(), settings, datetime(2026, 10, 16, tzinfo=timezone.utc))
    assert reactions == [
        ('auth-1', '101', 'mukmuk_check:1560537044969725973'),
        ('auth-1', '102', 'mukmuk_check:1560537044969725973'),
        ('auth-1', '102', 'mukmuk_flex:1560537051680604163'),
    ]
    assert reacted_ids == ['101', '102']

    # 2. Fallback when no custom emoji configured
    reactions.clear()
    reacted_ids.clear()
    fallback_settings = {
        'DISCORD_GUILD_ID': 'guild-1',
        'DISCORD_AUTH_CHANNEL_ID': 'auth-1',
        'DISCORD_BOARD_CHANNEL_ID': 'board-1',
    }
    run_sync(API(), Store(), fallback_settings, datetime(2026, 10, 16, tzinfo=timezone.utc))
    assert reactions == [
        ('auth-1', '101', '✅'),
        ('auth-1', '102', '✅'),
        ('auth-1', '102', '💪'),
    ]
    assert reacted_ids == ['101', '102']

