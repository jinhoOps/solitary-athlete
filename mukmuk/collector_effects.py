"""Follow-up work after an independently committed Go collection."""
from .accounts import AccountError


def consume_identity(service, guard):
    """Apply at most one approved change for a fresh completed collection.

    Discord permission checks happen before the commit; the online session,
    opportunity, request and revision are checked again inside that commit.
    """
    with service.transaction() as db:
        if not db.execute("SELECT to_regclass('solitary_athlete.mukmuk_collection_effects') IS NOT NULL AS present").fetchone()['present']:
            return False
        guard(db)
        db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET status='expired',lease_until=NULL
            WHERE kind='identity' AND status IN ('queued','processing') AND expires_at<=clock_timestamp()""")
        effect = db.execute("""WITH candidate AS (
            SELECT e.run_id FROM solitary_athlete.mukmuk_collection_effects e
            JOIN solitary_athlete.mukmuk_collection_runs r ON r.id=e.run_id
            JOIN solitary_athlete.mukmuk_collector_control c ON c.singleton
            WHERE c.writer_mode='go' AND r.status='completed' AND e.kind='identity'
              AND e.expires_at>clock_timestamp()
              AND (e.status='queued' OR (e.status='processing' AND e.lease_until<=clock_timestamp()))
            ORDER BY r.completed_at,r.id FOR UPDATE OF e SKIP LOCKED LIMIT 1)
          UPDATE solitary_athlete.mukmuk_collection_effects e SET status='processing',attempts=e.attempts+1,
            lease_until=LEAST(e.expires_at,clock_timestamp()+interval '30 seconds')
          FROM candidate WHERE e.run_id=candidate.run_id AND e.kind='identity'
          RETURNING e.run_id,e.attempts""").fetchone()
    if not effect:
        return False
    context = service.prepare_apply(guard)
    try:
        with service.transaction() as db:
            db.execute("SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))")
            guard(db)
            eligible = db.execute("""SELECT 1 FROM solitary_athlete.mukmuk_collection_effects e
              JOIN solitary_athlete.mukmuk_collector_control c ON c.singleton
              WHERE e.run_id=%s AND e.kind='identity' AND e.status='processing' AND e.attempts=%s
                AND e.expires_at>clock_timestamp() AND e.lease_until>clock_timestamp() AND c.writer_mode='go'
              FOR UPDATE OF e FOR SHARE OF c""", (effect['run_id'],effect['attempts'])).fetchone()
            if not eligible:
                raise AccountError('expired_action')
            now = db.execute('SELECT clock_timestamp() AS value').fetchone()['value']
            latest = db.execute('SELECT max(collected_at) AS value FROM solitary_athlete.mukmuk_daily_grass_history').fetchone()['value']
            if latest and latest >= now:
                raise AccountError('expired_action')
            applied = context.apply(db,now) if context else False
            if applied:
                db.execute('SELECT solitary_athlete.capture_monthly_grass_snapshot(%s)', (now,))
            guard(db)
            finished = db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET status='done',lease_until=NULL
              WHERE run_id=%s AND kind='identity' AND attempts=%s AND expires_at>clock_timestamp()
                AND lease_until>clock_timestamp() RETURNING run_id""", (effect['run_id'],effect['attempts'])).fetchone()
            if not finished:
                raise AccountError('expired_action')
        return True
    except AccountError:
        # Losing the live session defers the request without counting a storage failure.
        raise
    except Exception:
        if context:
            context.failed()
        raise


def _renew_board(db, owner, run, attempt):
    row = db.execute("""UPDATE solitary_athlete.mukmuk_board_publication p
      SET lease_until=clock_timestamp()+interval '90 seconds'
      FROM solitary_athlete.mukmuk_collector_control c
      WHERE p.singleton AND c.singleton AND c.writer_mode='go' AND p.owner_id=%s AND p.run_id=%s
        AND p.lease_until>clock_timestamp() RETURNING p.run_id""", (owner,run)).fetchone()
    if not row:
        raise RuntimeError('board_lease_lost')
    row = db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET lease_until=clock_timestamp()+interval '90 seconds'
      WHERE run_id=%s AND kind='board' AND status='processing' AND attempts=%s AND lease_until>clock_timestamp()
      RETURNING run_id""", (run,attempt)).fetchone()
    if not row:
        raise RuntimeError('board_lease_lost')


def publish_board(store, api, settings):
    """Publish a coalesced board after identity settles; unchanged data at most every five minutes."""
    from uuid import uuid4
    from datetime import timedelta
    from .board import build_board, update_board
    from .render import render_grass_image

    owner = str(uuid4())
    with store.transaction() as db:
        if not db.execute("SELECT to_regclass('solitary_athlete.mukmuk_board_publication') IS NOT NULL AS present").fetchone()['present']:
            return False
        mode = db.execute('SELECT writer_mode FROM solitary_athlete.mukmuk_collector_control WHERE singleton').fetchone()
        if not mode or mode['writer_mode'] != 'go':
            return False
        pub = db.execute('SELECT *,clock_timestamp() AS now FROM solitary_athlete.mukmuk_board_publication WHERE singleton FOR UPDATE').fetchone()
        if pub['lease_until'] and pub['lease_until'] > pub['now']:
            return False
        effect = db.execute("""SELECT e.run_id,r.completed_at FROM solitary_athlete.mukmuk_collection_effects e
          JOIN solitary_athlete.mukmuk_collection_runs r ON r.id=e.run_id
          JOIN solitary_athlete.mukmuk_collection_effects i ON i.run_id=e.run_id AND i.kind='identity'
          WHERE e.kind='board' AND (e.status='queued' OR (e.status='processing' AND e.lease_until<=clock_timestamp()))
            AND r.status='completed' AND (i.status IN ('done','expired') OR i.expires_at<=clock_timestamp())
          ORDER BY r.completed_at DESC,r.id DESC FOR UPDATE OF e,i SKIP LOCKED LIMIT 1""").fetchone()
        if not effect:
            return False
        state = db.execute('SELECT revision,source_revision FROM solitary_athlete.mukmuk_identity_state WHERE singleton').fetchone()
        due = (not pub['last_success_at'] or pub['last_success_at'] <= pub['now']-timedelta(minutes=5)
               or pub['source_revision'] != state['source_revision'] or pub['identity_revision'] != state['revision'])
        if not due:
            db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET status='done',lease_until=NULL
              WHERE kind='board' AND status='queued' AND run_id IN (
                SELECT r.id FROM solitary_athlete.mukmuk_collection_runs r
                JOIN solitary_athlete.mukmuk_collection_effects i ON i.run_id=r.id AND i.kind='identity'
                WHERE r.completed_at<=%s AND (i.status IN ('done','expired') OR i.expires_at<=clock_timestamp()))""", (effect['completed_at'],))
            return False
        row = db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET status='processing',attempts=attempts+1,
          lease_until=clock_timestamp()+interval '90 seconds' WHERE run_id=%s AND kind='board' RETURNING attempts""", (effect['run_id'],)).fetchone()
        attempt = row['attempts']
        db.execute("""UPDATE solitary_athlete.mukmuk_board_publication SET owner_id=%s,run_id=%s,
          lease_until=clock_timestamp()+interval '90 seconds' WHERE singleton""", (owner,effect['run_id']))
    run = effect['run_id']

    def check():
        with store.transaction() as db:
            _renew_board(db,owner,run,attempt)

    class FencedBoardStore:
        def board_ids(self, channel, ids):
            with store.transaction() as db:
                _renew_board(db,owner,run,attempt)
                db.execute('''INSERT INTO solitary_athlete.sync_state(channel_id,board_message_ids) VALUES(%s,%s)
                  ON CONFLICT(channel_id) DO UPDATE SET board_message_ids=EXCLUDED.board_message_ids''', (channel,ids))

    try:
        check()
        guild = settings['DISCORD_GUILD_ID']
        if api.channel(settings['DISCORD_BOARD_CHANNEL_ID']).get('guild_id') != guild:
            raise ValueError('board_channel_scope')
        bot = api.me()
        rows = store.logs()
        now = pub['now']
        pages = build_board(rows,now,settings.get('DASHBOARD_URL',''),
          (settings.get('DISCORD_GRASS_RECORD_EMOJI_ID'),settings.get('DISCORD_GRASS_PHOTO_EMOJI_ID')),
          secret_code=store.active_secret(now) if settings.get('DASHBOARD_URL') else None,
          notice_channel_id=settings.get('DISCORD_NOTICE_CHANNEL_ID'))
        check()
        image = render_grass_image(rows,now)
        update_board(api,FencedBoardStore(),settings,pages,bot['id'],check_lock=check,file=('grass.png',image,'image/png'))
        with store.transaction() as db:
            _renew_board(db,owner,run,attempt)
            db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET status='done',lease_until=NULL
              WHERE kind='board' AND (status='queued' OR run_id=%s) AND run_id IN (
                SELECT r.id FROM solitary_athlete.mukmuk_collection_runs r
                JOIN solitary_athlete.mukmuk_collection_effects i ON i.run_id=r.id AND i.kind='identity'
                WHERE r.completed_at<=%s AND (i.status IN ('done','expired') OR i.expires_at<=clock_timestamp()))""", (run,effect['completed_at']))
            db.execute("""UPDATE solitary_athlete.mukmuk_board_publication SET last_success_at=clock_timestamp(),
              source_revision=%s,identity_revision=%s,owner_id=NULL,run_id=NULL,lease_until=NULL WHERE singleton AND owner_id=%s""",
              (state['source_revision'],state['revision'],owner))
        return True
    except Exception:
        with store.transaction() as db:
            db.execute("""UPDATE solitary_athlete.mukmuk_collection_effects SET status='queued',lease_until=NULL
              WHERE run_id=%s AND kind='board' AND status='processing' AND attempts=%s""",(run,attempt))
            db.execute("""UPDATE solitary_athlete.mukmuk_board_publication SET owner_id=NULL,run_id=NULL,lease_until=NULL
              WHERE singleton AND owner_id=%s AND run_id=%s""",(owner,run))
        raise
