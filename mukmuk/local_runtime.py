"""Live-session delivery: a presence lease alone cannot approve a business action."""
from threading import Lock
import time
from uuid import uuid4
from psycopg.types.json import Jsonb
from .accounts import AccountService, AccountError, MESSAGES


class LocalRuntime:
    def __init__(self, db, api, settings, ready_check=None):
        self.db, self.api, self.settings = db, api, settings
        self.session, self.fence = str(uuid4()), None
        self.requested_ready = False
        self.ready_check = ready_check or (lambda: self.requested_ready)
        self._tick_lock = Lock()

    def _guard(self, db, fence, action_id=None):
        if not self.requested_ready or not self.ready_check():
            raise AccountError('expired_action')
        row = db.execute('''SELECT session_id,fence,ready,lease_until>clock_timestamp() AS alive
          FROM solitary_athlete.mukmuk_local_runtime WHERE singleton FOR UPDATE''').fetchone()
        if str(row['session_id']) != self.session or row['fence'] != fence or not row['ready'] or not row['alive']:
            raise AccountError('expired_action')
        if not db.execute('SELECT enabled FROM solitary_athlete.mukmuk_identity_state WHERE singleton').fetchone()['enabled']:
            raise AccountError('feature_disabled')
        if action_id:
            action = db.execute('''SELECT runtime_session,runtime_fence,status,expires_at>clock_timestamp() AS alive
              FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=%s FOR UPDATE''', (action_id,)).fetchone()
            if not action or str(action['runtime_session']) != self.session or action['runtime_fence'] != fence or action['status'] != 'processing' or not action['alive']:
                raise AccountError('expired_action')

    def _release(self, conn):
        if self.fence is not None:
            conn.execute('''UPDATE solitary_athlete.mukmuk_local_runtime SET ready=false,lease_until=clock_timestamp()
              WHERE session_id=%s AND fence=%s''', (self.session, self.fence))
            conn.execute("""UPDATE solitary_athlete.mukmuk_account_link_actions SET status='expired',result=%s
              WHERE runtime_session=%s AND runtime_fence=%s AND status IN ('queued','processing')""",
              (Jsonb({'error_code':'expired_action','content':MESSAGES['expired_action']}), self.session, self.fence))
        self.fence = None

    def _renew(self, conn):
        enabled = conn.execute('SELECT enabled FROM solitary_athlete.mukmuk_identity_state WHERE singleton').fetchone()['enabled']
        if not self.requested_ready or not self.ready_check() or not enabled:
            self._release(conn)
            return False
        row = None
        if self.fence is not None:
            row = conn.execute('''UPDATE solitary_athlete.mukmuk_local_runtime SET ready=true,lease_until=clock_timestamp()+interval '15 seconds'
              WHERE session_id=%s AND fence=%s AND lease_until>clock_timestamp() RETURNING fence''', (self.session, self.fence)).fetchone()
        if row is None:
            row = conn.execute('''UPDATE solitary_athlete.mukmuk_local_runtime SET session_id=%s,fence=fence+1,ready=true,
              lease_until=clock_timestamp()+interval '15 seconds' WHERE singleton AND lease_until<=clock_timestamp() RETURNING fence''', (self.session,)).fetchone()
        if not row:
            self.fence = None
            return False
        self.fence = row['fence']
        return True

    def tick(self, ready):
        # A disconnect revokes the in-flight handler before waiting for the tick mutex.
        self.requested_ready = bool(ready)
        with self._tick_lock:
            with self.db.session() as store:
                with store.transaction():
                    conn = store.conn
                    if not self._renew(conn):
                        return {'ready':False,'handled':False}
                    fence = self.fence
                    self._guard(conn, fence)
                    conn.execute("""UPDATE solitary_athlete.mukmuk_account_link_actions SET status='expired',result=%s
                      WHERE status IN ('queued','processing') AND (expires_at<=clock_timestamp()
                        OR runtime_session IS DISTINCT FROM %s::uuid OR runtime_fence IS DISTINCT FROM %s)""",
                      (Jsonb({'error_code':'expired_action','content':MESSAGES['expired_action']}), self.session, fence))
                    row = conn.execute('''WITH next AS (
                      SELECT interaction_id FROM solitary_athlete.mukmuk_account_link_actions
                      WHERE status='queued' AND runtime_session=%s AND runtime_fence=%s AND expires_at>clock_timestamp()
                      ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1)
                      UPDATE solitary_athlete.mukmuk_account_link_actions a SET status='processing',attempts=attempts+1
                      FROM next WHERE a.interaction_id=next.interaction_id RETURNING a.*,
                        extract(epoch FROM (a.expires_at-clock_timestamp())) AS remaining''', (self.session, fence)).fetchone()
            status = {'ready':True,'handled':False,'session':self.session,'fence':fence}
            if row is None:
                return status
            payload = dict(row['payload'])
            payload.update(interaction_id=row['interaction_id'], actor_id=row['actor_id'], kind=row['kind'])
            def guard(conn):
                self._guard(conn, fence, row['interaction_id'])
            service = AccountService(self.db, self.api, self.settings, runtime_guard=guard)
            try:
                result = service.handle(payload, time.monotonic()+max(0,float(row['remaining'])))
                # Permission/REST failures happen before the service opens a write transaction.
                with self.db.session() as store:
                    with store.transaction():
                        pending = store.conn.execute('SELECT status FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=%s', (row['interaction_id'],)).fetchone()
                        if pending and pending['status'] == 'processing':
                            guard(store.conn)
                            store.conn.execute("UPDATE solitary_athlete.mukmuk_account_link_actions SET status='done',result=%s WHERE interaction_id=%s",
                                               (Jsonb(result), row['interaction_id']))
            except AccountError:
                # No business change can commit if the session/connection has gone away.
                self.requested_ready = False
                with self.db.session() as store:
                    with store.transaction():
                        self._release(store.conn)
                return {'ready':False,'handled':False}
            return {**status, 'handled':True, 'approved':result.get('status') == 'approved'}
