from contextlib import contextmanager
import psycopg


@contextmanager
def sync_lock(database_url, channel_id):
    # A dedicated open transaction pins the lock in transaction-pooling mode.
    # Collector writes retain their own per-message transactions.
    with psycopg.connect(database_url, connect_timeout=10, prepare_threshold=None) as connection:
        connection.execute("SET LOCAL idle_in_transaction_session_timeout = '20min'")
        acquired = connection.execute(
            "SELECT pg_try_advisory_xact_lock(hashtext('solitary_athlete.sync'), hashtext(%s))",
            (channel_id,),
        ).fetchone()[0]
        yield connection if acquired else None
