"""Install/remove only mukmuk's per-user LaunchAgent; no secrets in its plist."""
import argparse
import hashlib
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

LABEL = 'io.jinhoops.mukmuk.sync'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--uninstall', action='store_true')
    parser.add_argument('--dry-run', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('This installer requires macOS')
    root = Path(__file__).resolve().parents[1]
    agent = Path.home() / 'Library/LaunchAgents' / f'{LABEL}.plist'
    service = f'gui/{os.getuid()}/{LABEL}'
    if args.uninstall:
        subprocess.run(['launchctl', 'bootout', service], capture_output=True)
        agent.unlink(missing_ok=True)
        print('Removed mukmuk LaunchAgent; runtime, logs and .env preserved.')
        return
    uv = shutil.which('uv')
    if not uv:
        raise SystemExit('uv is required')
    env_file = root / '.env'
    if not env_file.is_file():
        raise SystemExit('Configure the project .env first')
    sources = [root / name for name in ['main.py', 'pyproject.toml', 'uv.lock', 'scripts/macos_sync.py']]
    sources.extend(sorted((root / 'mukmuk').glob('*.py')))
    if (root / '.python-version').exists():
        sources.append(root / '.python-version')
    digest = hashlib.sha256()
    for source in sources:
        digest.update(source.relative_to(root).as_posix().encode())
        digest.update(source.read_bytes())
    runtime = Path.home() / 'Library/Application Support/mukmuk/versions' / digest.hexdigest()[:16]
    logs = Path.home() / 'Library/Logs/mukmuk'
    config = {
        'Label': LABEL,
        'ProgramArguments': [uv, 'run', '--locked', '--no-sync', '--project', str(runtime), str(runtime / 'scripts/macos_sync.py')],
        'WorkingDirectory': str(runtime),
        'EnvironmentVariables': {'MUKMUK_ENV_FILE': str(env_file), 'MUKMUK_LOG_DIR': str(logs), 'PYTHONUNBUFFERED': '1'},
        'RunAtLoad': True,
        'StartCalendarInterval': [{'Minute': minute} for minute in range(0, 60, 5)],
        'StandardOutPath': str(logs / 'launchd.log'),
        'StandardErrorPath': str(logs / 'launchd-error.log'),
        'Umask': 0o077,
    }
    if args.dry_run:
        sys.stdout.buffer.write(plistlib.dumps(config))
        return
    os.umask(0o077)
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    logs.mkdir(parents=True, exist_ok=True, mode=0o700)
    env_file.chmod(0o600)
    for source in sources:
        dest = runtime / source.relative_to(root)
        dest.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        if not dest.exists():
            shutil.copyfile(source, dest)
        elif dest.read_bytes() != source.read_bytes():
            raise SystemExit('Installed runtime differs from its source hash')
    # Prepare dependencies before stopping an existing healthy installation.
    subprocess.run([uv, 'sync', '--locked', '--no-dev', '--python', '3.13', '--project', str(runtime)], check=True)
    subprocess.run(['launchctl', 'bootout', service], capture_output=True)
    agent.parent.mkdir(parents=True, exist_ok=True)
    agent.write_bytes(plistlib.dumps(config))
    agent.chmod(0o600)
    subprocess.run(['plutil', '-lint', str(agent)], check=True)
    subprocess.run(['launchctl', 'bootstrap', f'gui/{os.getuid()}', str(agent)], check=True)
    print(f'Installed {LABEL}: every 5 minutes; runtime={runtime}; logs={logs}')


if __name__ == '__main__':
    main()
