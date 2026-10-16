import json
import time
from urllib.parse import quote
import httpx

class DiscordError(RuntimeError):
    def __init__(self, status):
        self.status = status
        super().__init__(f'Discord request failed ({status})')

class Discord:
    def __init__(self, token, client=None, sleep=time.sleep):
        self.client = client or httpx.Client(timeout=15)
        self.token, self.sleep = token, sleep

    def request(self, method, path, **kwargs):
        for attempt in range(5):
            try:
                res = self.client.request(method, f'https://discord.com/api/v10{path}',
                    headers={'Authorization': f'Bot {self.token}'}, **kwargs)
            except httpx.TransportError:
                if attempt == 4: raise DiscordError('network') from None
                self.sleep(2 ** attempt); continue
            if res.status_code == 429:
                delay = float(res.json().get('retry_after', 1))
                if delay > 60 or attempt == 4: raise DiscordError(429)
                self.sleep(max(0, delay)); continue
            if res.status_code >= 500 and attempt < 4:
                self.sleep(2 ** attempt); continue
            if res.status_code >= 400: raise DiscordError(res.status_code)
            return res.json() if res.content else None
        raise DiscordError('retry-exhausted')

    def me(self): return self.request('GET', '/users/@me')
    def channel(self, channel): return self.request('GET', f'/channels/{channel}')
    def messages(self, channel, before=None):
        return self.request('GET', f'/channels/{channel}/messages', params={'limit': 100, **({'before': before} if before else {})})
    def message(self, channel, mid): return self.request('GET', f'/channels/{channel}/messages/{mid}')
    def react(self, channel, mid, emoji='✅'):
        raw = emoji.strip().removeprefix('<:').removeprefix('<a:').removesuffix('>')
        self.request('PUT', f'/channels/{channel}/messages/{mid}/reactions/{quote(raw, safe="")}/@me')
    def write(self, channel, content, mid=None, file=None):
        path = f'/channels/{channel}/messages' + (f'/{mid}' if mid else '')
        method = 'PATCH' if mid else 'POST'
        if file:
            filename = file[0]
            data_bytes = file[1]
            content_type = file[2] if len(file) > 2 else 'image/png'
            payload = {
                'content': content,
                'allowed_mentions': {'parse': []},
                'attachments': [{'id': 0, 'filename': filename}],
            }
            return self.request(
                method,
                path,
                data={'payload_json': json.dumps(payload)},
                files={'files[0]': (filename, data_bytes, content_type)},
            )
        return self.request(method, path, json={'content': content, 'allowed_mentions': {'parse': []}})
    def delete(self, channel, mid):
        try: self.request('DELETE', f'/channels/{channel}/messages/{mid}')
        except DiscordError as e:
            if e.status != 404: raise
