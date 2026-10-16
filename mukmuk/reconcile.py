"""Explicit per-member refresh only; never scan without a queued request."""
import time
from datetime import datetime, timedelta, timezone
from .discord import DiscordError
from .sync import event_from_message

ADMIN = 8
MANAGE_GUILD = 32
READ = 1024 | 65536


def base_permissions(member, roles, guild_id, owner):
    if member['user']['id'] == owner:
        return (1 << 53) - 1
    ids = set(member.get('roles', [])) | {guild_id}
    value = 0
    for role in roles:
        if role['id'] in ids:
            value |= int(role['permissions'])
    return value


def can_refresh(member, target, member_role, roles, owner, guild_id=None):
    guild_id = guild_id or (roles[0]['id'] if roles else '')
    # Administrative bits are guild-level and do not depend on channel overwrites.
    permissions = base_permissions(member, roles, guild_id, owner)
    return bool(permissions & (ADMIN | MANAGE_GUILD)) or (
        member_role in member.get('roles', []) and member['user']['id'] == target)


def channel_permissions(member, roles, channel, owner):
    value = base_permissions(member, roles, channel['guild_id'], owner)
    if value & ADMIN:
        return (1 << 53) - 1
    overwrites = channel.get('permission_overwrites', [])
    for entry in overwrites:
        if entry['id'] == channel['guild_id']:
            value = (value & ~int(entry['deny'])) | int(entry['allow'])
    deny, allow = 0, 0
    for entry in overwrites:
        if entry['type'] == 0 and entry['id'] in member.get('roles', []):
            deny |= int(entry['deny']); allow |= int(entry['allow'])
    value = (value & ~deny) | allow
    for entry in overwrites:
        if entry['type'] == 1 and entry['id'] == member['user']['id']:
            value = (value & ~int(entry['deny'])) | int(entry['allow'])
    return value


def source_result(error):
    return 'deleted' if error.status == 404 and error.code == 10008 else 'deferred'


def verify_permissions(api, job, settings, bot_id, deadline):
    get = lambda path: api.once('GET', path, deadline)
    guild_id, channel_id = settings['DISCORD_GUILD_ID'], settings['DISCORD_AUTH_CHANNEL_ID']
    if job['guild_id'] != guild_id or job['channel_id'] != channel_id:
        raise PermissionError('job_scope')
    guild = get(f'/guilds/{guild_id}')
    roles = get(f'/guilds/{guild_id}/roles')
    caller = get(f'/guilds/{guild_id}/members/{job["requester_id"]}')
    bot = get(f'/guilds/{guild_id}/members/{bot_id}')
    channel = get(f'/channels/{channel_id}')
    if channel.get('guild_id') != guild_id or caller.get('user', {}).get('id') != job['requester_id'] or bot.get('user', {}).get('id') != bot_id:
        raise PermissionError('member_scope')
    member_role = settings.get('DISCORD_ROLE_MEMBER_ID', '')
    if not can_refresh(caller, job['target_id'], member_role, roles, guild.get('owner_id'), guild_id):
        raise PermissionError('requester_permission')
    if channel_permissions(bot, roles, channel, guild.get('owner_id')) & READ != READ:
        raise PermissionError('channel_permission')


def process_refresh(api, store, settings, bot_id, check_lock=lambda: None, clock=time.monotonic):
    job = store.claim_refresh()
    if not job:
        return
    deadline = clock() + 30
    try:
        check_lock()
        verify_permissions(api, job, settings, bot_id, deadline)
        for row in store.refresh_events(job):
            if clock() >= deadline:
                store.defer_refresh(job, 'budget', 0, failure=False)
                return
            check_lock()
            try:
                msg = api.once('GET', f'/channels/{job["channel_id"]}/messages/{row["message_id"]}', deadline)
                if msg.get('id') != row['message_id'] or msg.get('author', {}).get('id') != job['target_id']:
                    raise PermissionError('message_scope')
                event = event_from_message(msg, job['guild_id'], job['channel_id'])
            except DiscordError as error:
                if source_result(error) != 'deleted':
                    raise
                event = None
            if event is None:
                verify_permissions(api, job, settings, bot_id, deadline)
            check_lock()
            store.apply_refresh(job, row['message_id'], event)
        store.finish_refresh_batch(job)
    except PermissionError as error:
        store.defer_refresh(job, str(error), 0, fatal=True)
    except DiscordError as error:
        fatal = error.status in (401, 403) or (error.status == 404 and error.code != 10008)
        store.defer_refresh(job, str(error.status), max(1, error.retry_after or 0), fatal=fatal,
            failure=error.status != 'deadline')
    except (ValueError, KeyError, TypeError, AttributeError):
        store.defer_refresh(job, 'invalid_source_response', 1)
