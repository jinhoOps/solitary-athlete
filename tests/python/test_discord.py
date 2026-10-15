import json
import httpx
from mukmuk.discord import Discord

def test_write_without_file_sends_json():
    captured = []
    def respond(req):
        captured.append(req)
        return httpx.Response(200, json={'id': '101'})
    api = Discord('test-token', httpx.Client(transport=httpx.MockTransport(respond)))
    res = api.write('chan-1', 'hello', mid='msg-1')
    assert res['id'] == '101'
    assert captured[0].method == 'PATCH'
    assert captured[0].headers.get('content-type') == 'application/json'
    assert json.loads(captured[0].content)['content'] == 'hello'

def test_write_with_file_sends_multipart():
    captured = []
    def respond(req):
        captured.append(req)
        return httpx.Response(200, json={'id': '102'})
    api = Discord('test-token', httpx.Client(transport=httpx.MockTransport(respond)))
    res = api.write('chan-1', 'board text', mid='msg-2', file=('grass.png', b'\x89PNGfake', 'image/png'))
    assert res['id'] == '102'
    assert captured[0].method == 'PATCH'
    assert 'multipart/form-data' in captured[0].headers.get('content-type', '')
    assert b'payload_json' in captured[0].content
    assert b'grass.png' in captured[0].content
    assert b'\x89PNGfake' in captured[0].content
