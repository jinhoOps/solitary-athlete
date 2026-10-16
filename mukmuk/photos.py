"""Backfill attachment references without editing historical memos or aggregates."""
from .sync import event_from_message
from .discord import DiscordError


def backfill_photos(api, store, guild, channel, check_lock=lambda: None):
    after, count = None, 0
    while rows := store.photo_events(after):
        for row in rows:
            check_lock()
            if row['channel_id'] != channel:
                raise ValueError('Unexpected photo channel')
            try:
                msg = api.message(channel, row['message_id'])
                event = event_from_message(msg, guild, channel)
                attachments = event.attachments if event else []
            except DiscordError as error:
                if error.status != 404:
                    raise
                attachments = []
            store.photo_metadata(row['message_id'], attachments)
            after = row['message_id']
            count += 1
    return count
