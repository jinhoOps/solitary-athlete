from dataclasses import asdict
from contextlib import contextmanager
from threading import RLock
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb

class Store:
    def __init__(self, connection, transaction_lock=None):
        self.conn = connection
        self._transaction_lock = transaction_lock or RLock()
        self.conn.prepare_threshold = None  # Supavisor transaction pooler compatibility.
        self.conn.row_factory = dict_row

    @contextmanager
    def transaction(self):
        with self._transaction_lock:
            with self.conn.transaction():
                yield self.conn

    def save(self, message_id, event):
        with self.transaction():
            self.conn.execute("SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))")
            previous = self.conn.execute('SELECT user_id, log_date FROM solitary_athlete.workout_events WHERE message_id=%s', (message_id,)).fetchone()
            affected = set()
            if previous: affected.add((previous['user_id'], previous['log_date']))
            if event is None:
                self.conn.execute('DELETE FROM solitary_athlete.workout_events WHERE message_id=%s', (message_id,))
            else:
                payload = asdict(event)
                payload['attachments'] = Jsonb(payload['attachments'])
                row = self.conn.execute('''INSERT INTO solitary_athlete.workout_events
                    (message_id,guild_id,channel_id,user_id,username,created_at,edited_at,memo,has_photo,attachments)
                    VALUES (%(message_id)s,%(guild_id)s,%(channel_id)s,%(user_id)s,%(username)s,%(created_at)s,%(edited_at)s,%(memo)s,%(has_photo)s,%(attachments)s)
                    ON CONFLICT (message_id) DO UPDATE SET username=EXCLUDED.username,
                    edited_at=EXCLUDED.edited_at,memo=EXCLUDED.memo,has_photo=EXCLUDED.has_photo,attachments=EXCLUDED.attachments,updated_at=now()
                    RETURNING user_id, log_date''', payload).fetchone()
                affected.add((row['user_id'], row['log_date']))
            for user_id, log_date in affected:
                self.conn.execute('DELETE FROM solitary_athlete.workout_logs WHERE user_id=%s AND log_date=%s', (user_id, log_date))
                self.conn.execute('''INSERT INTO solitary_athlete.workout_logs
                    (user_id,log_date,username,memo,verification_count,has_photo)
                    SELECT user_id,log_date,(array_agg(username ORDER BY created_at DESC,message_id::numeric DESC))[1],
                    string_agg(CASE WHEN memo='' THEN '사진 인증' ELSE memo END, E'\\n' ORDER BY created_at,message_id::numeric),
                    count(*)::integer,bool_or(has_photo)
                    FROM solitary_athlete.workout_events WHERE user_id=%s AND log_date=%s GROUP BY user_id,log_date''', (user_id, log_date))

    def active_secret(self, now):
        with self.transaction():
            row = self.conn.execute('SELECT secret_code FROM solitary_athlete.channel_access_secrets WHERE expires_at>%s ORDER BY issued_at DESC LIMIT 1', (now,)).fetchone()
            return row['secret_code'] if row else None

    def logs(self):
        with self.transaction():
            with self.conn.cursor() as cur:
                cur.execute('SELECT * FROM solitary_athlete.workout_logs ORDER BY log_date DESC,updated_at DESC,user_id')
                result = []
                while page := cur.fetchmany(1000): result.extend(page)
                return result

    def state(self, channel):
        with self.transaction():
            return self.conn.execute('SELECT * FROM solitary_athlete.sync_state WHERE channel_id=%s', (channel,)).fetchone() or {
                'last_message_id': None, 'last_success_at': None, 'board_message_ids': []}

    def board_ids(self, channel, ids):
        with self.transaction():
            self.conn.execute('''INSERT INTO solitary_athlete.sync_state(channel_id,board_message_ids) VALUES(%s,%s)
                ON CONFLICT(channel_id) DO UPDATE SET board_message_ids=EXCLUDED.board_message_ids''', (channel, ids))

    def pending_reactions(self):
        with self.transaction():
            return self.conn.execute('SELECT message_id,channel_id,has_photo FROM solitary_athlete.workout_events WHERE reacted_at IS NULL ORDER BY message_id::numeric').fetchall()

    def reacted(self, mid):
        with self.transaction():
            self.conn.execute('UPDATE solitary_athlete.workout_events SET reacted_at=now() WHERE message_id=%s', (mid,))

    def success(self, channel, cursor, now):
        with self.transaction():
            self.conn.execute("SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))")
            previous = self.conn.execute('SELECT last_success_at FROM solitary_athlete.sync_state WHERE channel_id=%s FOR UPDATE', (channel,)).fetchone()
            if previous and previous['last_success_at'] and previous['last_success_at'] >= now:
                return
            self.conn.execute('SELECT solitary_athlete.capture_monthly_grass_snapshot(%s)', (now,))
            self.conn.execute('''INSERT INTO solitary_athlete.sync_state(channel_id,last_message_id,last_success_at) VALUES(%s,%s,%s)
                ON CONFLICT(channel_id) DO UPDATE SET last_message_id=COALESCE(EXCLUDED.last_message_id,solitary_athlete.sync_state.last_message_id),last_success_at=EXCLUDED.last_success_at''', (channel, cursor, now))
            self.conn.execute('''INSERT INTO solitary_athlete.sync_status(singleton,last_success_at) VALUES(true,%s)
                ON CONFLICT(singleton) DO UPDATE SET last_success_at=EXCLUDED.last_success_at''', (now,))

    def photo_events(self, after):
        with self.transaction():
            return self.conn.execute('''SELECT message_id,channel_id FROM solitary_athlete.workout_events
                WHERE has_photo AND attachments='[]'::jsonb
                AND (%s::text IS NULL OR message_id::numeric>%s::numeric)
                ORDER BY message_id::numeric LIMIT 100''', (after, after)).fetchall()

    def photo_metadata(self, mid, attachments):
        with self.transaction():
            self.conn.execute('''UPDATE solitary_athlete.workout_events SET attachments=%s
                WHERE message_id=%s AND attachments='[]'::jsonb''', (Jsonb(attachments), mid))

    def claim_refresh(self):
        with self.transaction():
            return self.conn.execute('''WITH due AS (
              SELECT id FROM solitary_athlete.workout_refresh_jobs
              WHERE status IN ('queued','running') AND next_attempt_at<=now()
              AND (lease_until IS NULL OR lease_until<=now())
              ORDER BY processed_at,id::numeric FOR UPDATE SKIP LOCKED LIMIT 1
            ) UPDATE solitary_athlete.workout_refresh_jobs j SET status='running',
              lease_until=now()+interval '45 seconds',version=version+1,processed_at=now()
              FROM due WHERE j.id=due.id RETURNING j.*''').fetchone()

    def refresh_events(self, job):
        with self.transaction():
            return self.conn.execute('''SELECT message_id FROM solitary_athlete.workout_events
              WHERE user_id=%s AND guild_id=%s AND channel_id=%s
              AND message_id::numeric>%s::numeric AND message_id::numeric<=%s::numeric
              ORDER BY message_id::numeric LIMIT 20''',
              (job['target_id'],job['guild_id'],job['channel_id'],job['cursor_id'],job['upper_id'])).fetchall()

    def _refresh_owned(self, job):
        row = self.conn.execute('''SELECT * FROM solitary_athlete.workout_refresh_jobs
          WHERE id=%s AND version=%s AND status='running' AND lease_until>now() FOR UPDATE''',
          (job['id'],job['version'])).fetchone()
        if not row:
            raise RuntimeError('refresh_lease_lost')
        return row

    def apply_refresh(self, job, mid, event):
        with self.transaction():
            row = self._refresh_owned(job)
            if int(mid)<=int(row['cursor_id']):
                return
            original = self.conn.execute('''SELECT user_id FROM solitary_athlete.workout_events
              WHERE message_id=%s AND guild_id=%s AND channel_id=%s FOR UPDATE''',
              (mid,job['guild_id'],job['channel_id'])).fetchone()
            if not original or original['user_id']!=job['target_id'] or int(mid)>int(job['upper_id']):
                raise ValueError('refresh_scope_mismatch')
            self.save(mid,event)
            self.conn.execute('''UPDATE solitary_athlete.workout_refresh_jobs
              SET cursor_id=%s,checked=checked+1,removed=removed+%s,failures=0,error_code=NULL
              WHERE id=%s''', (mid,int(event is None),job['id']))
            job['cursor_id']=mid

    def finish_refresh_batch(self, job):
        with self.transaction():
            self._refresh_owned(job)
            remains = bool(self.refresh_events(job))
            self.conn.execute('''UPDATE solitary_athlete.workout_refresh_jobs
              SET status=%s,lease_until=NULL,next_attempt_at=now(),processed_at=now(),error_code=NULL
              WHERE id=%s''', ('queued' if remains else 'done',job['id']))

    def defer_refresh(self, job, code, delay, fatal=False, failure=True):
        with self.transaction():
            row = self._refresh_owned(job)
            failures = row['failures']+int(failure)
            self.conn.execute('''UPDATE solitary_athlete.workout_refresh_jobs
              SET status=%s,failures=%s,error_code=%s,lease_until=NULL,processed_at=now(),
              next_attempt_at=now()+%s*interval '1 second' WHERE id=%s''',
              ('failed' if fatal or failures>=10 else 'queued',failures,code,delay,job['id']))
