from concurrent.futures import ThreadPoolExecutor
import os
import threading
import time
import pytest
from test_store import store
from mukmuk.db_session import SharedDB


def test_nested_local_ticks_reuse_store_connection_and_close_it_after_collection(store):
    db=SharedDB(os.environ['TEST_DATABASE_URL'])
    with db.session() as collecting:
        with collecting.transaction():
            first=collecting.conn.execute('SELECT pg_backend_pid() AS pid').fetchone()['pid']
        with db.session() as heartbeat:
            assert heartbeat is collecting
            with heartbeat.transaction():
                assert heartbeat.conn.execute('SELECT pg_backend_pid() AS pid').fetchone()['pid']==first
        assert not collecting.conn.closed
    assert collecting.conn.closed


def test_rollback_cannot_undo_other_thread_work_on_shared_connection(store):
    db=SharedDB(os.environ['TEST_DATABASE_URL'])
    changed=threading.Event()
    def rollback():
        with db.session() as shared:
            with pytest.raises(RuntimeError):
                with shared.transaction():
                    shared.conn.execute('UPDATE solitary_athlete.mukmuk_identity_state SET source_revision=source_revision+10')
                    changed.set()
                    time.sleep(.05)
                    raise RuntimeError('rollback this worker only')
    def commit():
        assert changed.wait(2)
        with db.session() as shared:
            with shared.transaction():
                shared.conn.execute('UPDATE solitary_athlete.mukmuk_identity_state SET source_revision=source_revision+1')
    with ThreadPoolExecutor(max_workers=2) as pool:
        a=pool.submit(rollback); b=pool.submit(commit)
        a.result();b.result()
    with store.transaction():
        assert store.conn.execute('SELECT source_revision FROM solitary_athlete.mukmuk_identity_state').fetchone()['source_revision']==1
