from contextlib import contextmanager
import psycopg


class CheckedPythonLock:
    def __init__(self, connection, controlled):
        self.connection = connection
        self.controlled = controlled

    def execute(self, query):
        if self.controlled:
            row = self.connection.execute('SELECT writer_mode FROM solitary_athlete.mukmuk_collector_control WHERE singleton').fetchone()
            if not row or row[0] != 'python':
                raise RuntimeError('collector_mode_changed')
        return self.connection.execute(query)


@contextmanager
def sync_lock(database_url, channel_id):
    # Existing Python runs pin the channel lock. Go checks this same lock in
    # every write transaction until all old installations have been retired.
    with psycopg.connect(database_url, connect_timeout=10, prepare_threshold=None) as connection:
        connection.execute("SET LOCAL idle_in_transaction_session_timeout = '20min'")
        acquired = connection.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext('solitary_athlete.sync'), hashtext(%s))",
            (channel_id,),
        ).fetchone()[0]
        if not acquired:
            yield None
            return
        controlled = bool(connection.execute("SELECT to_regclass('solitary_athlete.mukmuk_collector_control') IS NOT NULL").fetchone()[0])
        lock = CheckedPythonLock(connection, controlled)
        if controlled:
            row = connection.execute('SELECT writer_mode FROM solitary_athlete.mukmuk_collector_control WHERE singleton').fetchone()
            if not row or row[0] != 'python':
                yield None
                return
        yield lock
