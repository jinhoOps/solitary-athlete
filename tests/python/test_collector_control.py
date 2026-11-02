"""The Python fallback must yield to the separate collector writer."""
import os
import psycopg
import pytest
from mukmuk.scheduler import sync_lock

CHANNEL='1559804769327910932'

def test_python_collector_fails_closed_when_go_takes_ownership():
    url=os.environ.get('TEST_DATABASE_URL')
    if not url: pytest.skip('isolated PostgreSQL required')
    with psycopg.connect(url,autocommit=True) as db:
        db.execute("UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='python',owner_id=NULL,lease_until='-infinity'")
        try:
            with sync_lock(url,CHANNEL) as lock:
                assert lock is not None
                lock.execute('SELECT 1')
                db.execute("UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='go'")
                with pytest.raises(RuntimeError,match='collector_mode_changed'):
                    lock.execute('SELECT 1')
            with sync_lock(url,CHANNEL) as lock:
                assert lock is None
        finally:
            db.execute("UPDATE solitary_athlete.mukmuk_collector_control SET writer_mode='python'")
