import importlib.util
from pathlib import Path

spec = importlib.util.spec_from_file_location('macos_sync', Path(__file__).parents[2] / 'scripts/macos_sync.py')


def runner():
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_runner_returns_collector_result(tmp_path):
    (tmp_path / 'main.py').write_text("print({'messages_scanned': 2})")
    result = runner().run_once(tmp_path, timeout=2)
    assert result.returncode == 0 and 'messages_scanned' in result.stdout


def test_runner_terminates_a_stuck_collector(tmp_path):
    (tmp_path / 'main.py').write_text('import time; time.sleep(60)')
    result = runner().run_once(tmp_path, timeout=0.1)
    assert result.returncode == 124
    assert 'timeout' in result.stderr
