"""One primary connection shared at transaction boundaries, never across processes."""
from contextlib import contextmanager
from threading import RLock
import psycopg
from .store import Store


class SharedDB:
    def __init__(self, url):
        self.url = url
        self._lock = RLock()
        self._store = None
        self._references = 0

    @contextmanager
    def session(self):
        with self._lock:
            if self._store is None:
                conn = psycopg.connect(self.url, connect_timeout=2, autocommit=True,
                                       application_name='mukmuk-local-data', prepare_threshold=None,
                                       options='-c statement_timeout=5000 -c lock_timeout=2000')
                self._store = Store(conn, transaction_lock=self._lock)
            self._references += 1
            store = self._store
        try:
            yield store
        finally:
            with self._lock:
                self._references -= 1
                if self._references == 0:
                    store.conn.close()
                    self._store = None
