"""Bounded collector execution for the user's macOS LaunchAgent."""
import logging
from logging.handlers import RotatingFileHandler
import os
from pathlib import Path
import signal
import subprocess
import sys


def run_once(root, timeout=240):
    command = [sys.executable, str(Path(root) / 'main.py')]
    child = subprocess.Popen(command, cwd=root, stdout=subprocess.PIPE,
                             stderr=subprocess.PIPE, text=True, start_new_session=True)

    def terminate():
        try:
            os.killpg(child.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            return child.communicate(timeout=5)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            return child.communicate()

    def stop(signum, _frame):
        terminate()
        raise SystemExit(128 + signum)

    previous = signal.signal(signal.SIGTERM, stop)
    try:
        try:
            stdout, stderr = child.communicate(timeout=timeout)
            return subprocess.CompletedProcess(command, child.returncode, stdout, stderr)
        except subprocess.TimeoutExpired:
            stdout, stderr = terminate()
            return subprocess.CompletedProcess(command, 124, stdout, 'collector timeout\n' + stderr)
    finally:
        if child.poll() is None:
            terminate()
        signal.signal(signal.SIGTERM, previous)


def main():
    os.umask(0o077)
    log_dir = Path(os.environ['MUKMUK_LOG_DIR'])
    log_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
    handler = RotatingFileHandler(log_dir / 'sync.log', maxBytes=1_000_000, backupCount=3, encoding='utf-8')
    handler.setFormatter(logging.Formatter('%(asctime)s %(message)s'))
    logger = logging.getLogger('mukmuk-sync')
    logger.setLevel(logging.INFO)
    logger.addHandler(handler)
    logger.propagate = False
    result = run_once(Path(__file__).resolve().parents[1])
    logger.info('exit=%s stdout=%s stderr=%s', result.returncode, result.stdout.strip()[:2000], result.stderr.strip()[:2000])
    return result.returncode


if __name__ == '__main__':
    sys.exit(main())
