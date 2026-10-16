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

def test_react_formats_unicode_and_custom_emojis():
    captured = []
    def respond(req):
        captured.append(req)
        return httpx.Response(204)
    api = Discord('test-token', httpx.Client(transport=httpx.MockTransport(respond)))

    api.react('chan-1', 'msg-1')
    assert captured[-1].method == 'PUT'
    assert str(captured[-1].url) == 'https://discord.com/api/v10/channels/chan-1/messages/msg-1/reactions/%E2%9C%85/@me'

    api.react('chan-1', 'msg-1', 'mukmuk_check:1560537044969725973')
    assert str(captured[-1].url) == 'https://discord.com/api/v10/channels/chan-1/messages/msg-1/reactions/mukmuk_check%3A1560537044969725973/@me'

    api.react('chan-1', 'msg-1', '<:mukmuk_flex:1560537051680604163>')
    assert str(captured[-1].url) == 'https://discord.com/api/v10/channels/chan-1/messages/msg-1/reactions/mukmuk_flex%3A1560537051680604163/@me'

