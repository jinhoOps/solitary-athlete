import time
import httpx
import pytest
from mukmuk.discord import Discord, DiscordError
from mukmuk.reconcile import can_refresh, channel_permissions, source_result


def test_single_attempt_preserves_error_code_and_rate_limit_without_sleep():
    seen=[]
    def response(req):
        seen.append(req)
        return httpx.Response(429,json={'code':0,'retry_after':3})
    api=Discord('fixture',httpx.Client(transport=httpx.MockTransport(response)),sleep=lambda _:pytest.fail('no sleeps'))
    with pytest.raises(DiscordError) as e:api.once('GET','/fixture',time.monotonic()+5)
    assert e.value.retry_after==3 and len(seen)==1


def test_only_precise_unknown_message_is_deletion():
    for status,code,expected in [(404,10008,'deleted'),(404,10003,'deferred'),(404,None,'deferred'),(403,10008,'deferred'),(503,None,'deferred')]:
        assert source_result(DiscordError(status,code))==expected


def test_self_only_member_admin_and_permission_overwrites():
    roles=[{'id':'1','permissions':str(1024+65536)},{'id':'2','permissions':'0'},{'id':'3','permissions':'8'}]
    member={'user':{'id':'10'},'roles':['2']}
    assert can_refresh(member,'10','2',roles,'owner')
    assert not can_refresh(member,'11','2',roles,'owner')
    assert can_refresh({'user':{'id':'10'},'roles':['3']},'11','2',roles,'owner')
    assert not can_refresh({'user':{'id':'10'},'roles':[]},'10','2',roles,'owner')
    channel={'guild_id':'1','permission_overwrites':[{'id':'2','type':0,'deny':'65536','allow':'0'}]}
    assert not channel_permissions(member,roles,channel,'owner')&65536
    channel['permission_overwrites'].append({'id':'10','type':1,'deny':'0','allow':'65536'})
    assert channel_permissions(member,roles,channel,'owner')&65536


def test_no_job_makes_no_discord_calls():
    from mukmuk.reconcile import process_refresh
    class Store:
        def claim_refresh(self):return None
    process_refresh(object(),Store(),{},'bot')


def test_worker_deletes_only_verified_source_and_rechecks_permissions(monkeypatch):
    from mukmuk import reconcile
    from test_collector import message
    calls=[];applied=[];deferred=[]
    job={'id':'1','version':1,'target_id':'123','guild_id':'1','channel_id':'2','requester_id':'123'}
    class Store:
        def claim_refresh(self):return job
        def refresh_events(self,j):return [{'message_id':'100'},{'message_id':'101'}]
        def apply_refresh(self,j,mid,event):applied.append((mid,event))
        def finish_refresh_batch(self,j):calls.append('done')
        def defer_refresh(self,*args,**kwargs):deferred.append((args,kwargs))
    class API:
        def once(self,method,path,deadline):
            if path.endswith('/100'):raise DiscordError(404,10008)
            return message('101')
    monkeypatch.setattr(reconcile,'verify_permissions',lambda *args:calls.append('permission'))
    reconcile.process_refresh(API(),Store(),{},'bot')
    assert calls==['permission','permission','done']
    assert applied[0]==('100',None) and applied[1][1].memo=='운동'
    assert deferred==[]


def test_worker_preserves_unknown_channel_and_stops_on_rate_limit(monkeypatch):
    from mukmuk import reconcile
    deferred=[]
    class Store:
        def claim_refresh(self):return {'id':'1','channel_id':'2','target_id':'123'}
        def refresh_events(self,j):return [{'message_id':'100'}]
        def apply_refresh(self,*args):pytest.fail('must preserve')
        def defer_refresh(self,*args,**kwargs):deferred.append((args,kwargs))
    class API:
        def once(self,*args):raise DiscordError(429,0,4)
    monkeypatch.setattr(reconcile,'verify_permissions',lambda *args:None)
    reconcile.process_refresh(API(),Store(),{},'bot')
    assert deferred[0][0][1:]==('429',4)


def test_worker_budget_stops_without_advancing_unchecked_message(monkeypatch):
    from mukmuk import reconcile
    calls=[]
    class Store:
        def claim_refresh(self):return {'id':'1'}
        def refresh_events(self,j):return [{'message_id':'100'}]
        def apply_refresh(self,*args):pytest.fail('budget exceeded')
        def defer_refresh(self,*args,**kwargs):calls.append((args,kwargs))
    times=iter([0,31])
    monkeypatch.setattr(reconcile,'verify_permissions',lambda *args:None)
    reconcile.process_refresh(object(),Store(),{},'bot',clock=lambda:next(times))
    assert calls[0][0][1:] == ('budget',0) and calls[0][1]['failure'] is False


def test_requester_role_removal_stops_worker_without_source_reads(monkeypatch):
    from mukmuk import reconcile
    failed=[]
    class Store:
        def claim_refresh(self):return {'id':'1'}
        def refresh_events(self,j):pytest.fail('permission lost')
        def defer_refresh(self,*args,**kwargs):failed.append(kwargs)
    def denied(*args):raise PermissionError('requester_permission')
    monkeypatch.setattr(reconcile,'verify_permissions',denied)
    reconcile.process_refresh(object(),Store(),{},'bot')
    assert failed[0]['fatal']
