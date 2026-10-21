"""Local scheduler ownership. A stale file or a PID alone never disables fallback."""
import fcntl
import json
import os
from pathlib import Path
import time
from uuid import uuid4


def state_directory():
    return Path(os.environ.get('MUKMUK_LOCAL_STATE_DIR', Path.home()/'Library/Application Support/mukmuk/run'))


class LocalOwner:
    def __init__(self, directory=None, clock=time.monotonic):
        self.directory = Path(directory) if directory is not None else state_directory()
        self.clock, self.identity = clock, str(uuid4())
        self.file = None

    def __enter__(self):
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.file = open(self.directory/'local.lock', 'a+', encoding='utf-8')
        os.chmod(self.directory/'local.lock', 0o600)
        try:
            fcntl.flock(self.file, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.file.close()
            self.file = None
            raise RuntimeError('local_bot_already_running') from None
        self.touch()
        return self

    def touch(self):
        if self.file is None:
            raise RuntimeError('local_owner_not_acquired')
        temporary = self.directory/f'owner-{self.identity}.tmp'
        with open(temporary, 'w', encoding='utf-8') as output:
            os.chmod(temporary, 0o600)
            json.dump({'identity': self.identity, 'at': self.clock()}, output)
        temporary.replace(self.directory/'local.json')

    def __exit__(self, *exc):
        if self.file:
            try:
                current = json.loads((self.directory/'local.json').read_text())
                if current.get('identity') == self.identity:
                    (self.directory/'local.json').unlink(missing_ok=True)
            except (OSError, ValueError):
                pass
            fcntl.flock(self.file, fcntl.LOCK_UN)
            self.file.close()
            self.file = None


def managed_runtime_active(directory=None, clock=time.monotonic):
    root = Path(directory) if directory is not None else state_directory()
    try:
        state = json.loads((root/'local.json').read_text())
        age = clock()-float(state['at'])
        if not 0 <= age < 15 or not state.get('identity'):
            return False
        with open(root/'local.lock', 'r', encoding='utf-8') as file:
            try:
                fcntl.flock(file, fcntl.LOCK_EX | fcntl.LOCK_NB)
                fcntl.flock(file, fcntl.LOCK_UN)
                return False
            except BlockingIOError:
                return True
    except (OSError, ValueError, KeyError, TypeError):
        return False
