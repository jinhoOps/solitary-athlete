from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import PurePath
from .board import build_board, update_board
from .discord import DiscordError

@dataclass
class Event:
    message_id: str
    guild_id: str
    channel_id: str
    user_id: str
    username: str
    created_at: datetime
    edited_at: datetime | None
    memo: str
    has_photo: bool

def event_from_message(msg, guild, channel):
    author = msg.get('author',{})
    if author.get('bot') or msg.get('type') not in (0,19): return None
    has_photo = any(a.get('content_type','').lower().startswith('image/') if a.get('content_type') else
        PurePath(a.get('filename','')).suffix.lower() in {'.jpg','.jpeg','.png','.webp','.gif','.heic','.avif'} for a in msg.get('attachments',[]))
    memo = msg.get('content','').strip()
    if not memo and not has_photo: return None
    return Event(msg['id'],guild,channel,author['id'],msg.get('member',{}).get('nick') or author.get('global_name') or author['username'],
        datetime.fromisoformat(msg['timestamp']),datetime.fromisoformat(msg['edited_timestamp']) if msg.get('edited_timestamp') else None,memo,has_photo)

def collect_messages(api, channel, cursor, now):
    result, before, ceiling = [], None, cursor
    cutoff = now - timedelta(days=28)
    while True:
        page = api.messages(channel, before)
        if not page: break
        if before is None: ceiling = max((m['id'] for m in page), key=int)
        stop = False
        for msg in page:
            if cursor and int(msg['id'])<=int(cursor) and datetime.fromisoformat(msg['timestamp'])<cutoff:
                stop=True; break
            result.append(msg)
        if stop or len(page)<100: break
        before = page[-1]['id']
    return sorted(result,key=lambda m:int(m['id'])), ceiling

def run_sync(api, store, settings, now=None):
    now = now or datetime.now(timezone.utc)
    guild, channel = settings['DISCORD_GUILD_ID'], settings['DISCORD_AUTH_CHANNEL_ID']
    for cid in (channel, settings['DISCORD_BOARD_CHANNEL_ID']):
        if api.channel(cid).get('guild_id')!=guild: raise ValueError('Channel does not belong to the configured guild')
    bot = api.me()
    rows, ceiling = collect_messages(api,channel,store.state(channel)['last_message_id'],now)
    for msg in rows: store.save(msg['id'], event_from_message(msg,guild,channel))
    for pending in store.pending_reactions():
        try: api.react(pending['channel_id'],pending['message_id'])
        except DiscordError as e:
            if e.status != 404: raise
        store.reacted(pending['message_id'])
    pages = build_board(store.logs(),now,settings.get('DASHBOARD_URL',''),
        (settings.get('DISCORD_GRASS_RECORD_EMOJI_ID'),settings.get('DISCORD_GRASS_PHOTO_EMOJI_ID')))
    update_board(api,store,settings,pages,bot['id'])
    store.success(channel,ceiling,datetime.now(timezone.utc))
    return {'messages_scanned':len(rows),'board_pages':len(pages)}
