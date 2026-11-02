"""Install only the Go collector LaunchAgent. Does not switch the DB writer mode."""
import argparse
import hashlib
import os
from pathlib import Path
import plistlib
import shutil
import subprocess
import sys

LABEL = 'io.jinhoops.mukmuk.collector'


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--dry-run', action='store_true')
    parser.add_argument('--uninstall', action='store_true')
    args = parser.parse_args()
    if sys.platform != 'darwin':
        raise SystemExit('This installer requires macOS')
    root = Path(__file__).resolve().parents[1]
    source = root / 'services' / 'collector'
    agent = Path.home() / 'Library/LaunchAgents' / f'{LABEL}.plist'
    service = f'gui/{os.getuid()}/{LABEL}'
    if args.uninstall:
        subprocess.run(['launchctl', 'bootout', service], capture_output=True)
        agent.unlink(missing_ok=True)
        print('Removed Go collector LaunchAgent; runtime, logs and settings preserved.')
        return
    go = shutil.which('go') or ('/usr/local/go/bin/go' if Path('/usr/local/go/bin/go').is_file() else None)
    if not go:
        raise SystemExit('Go is required to build the collector')
    env_file = (root / '.env').resolve()
    if not env_file.is_file():
        raise SystemExit('Configure the project .env first')
    sources = [source/'go.mod',source/'go.sum'] + sorted(p for p in source.rglob('*.go') if not p.name.endswith('_test.go'))
    digest = hashlib.sha256()
    digest.update(subprocess.check_output([go,'version']))
    for item in sources:
        digest.update(item.relative_to(source).as_posix().encode())
        digest.update(item.read_bytes())
    runtime = Path.home() / 'Library/Application Support/mukmuk/collector-versions' / digest.hexdigest()[:16]
    logs = Path.home() / 'Library/Logs/mukmuk'
    binary = runtime / 'mukmuk-collector'
    config = {
        'Label': LABEL,
        'ProgramArguments': [str(binary)],
        'WorkingDirectory': str(runtime),
        'EnvironmentVariables': {'MUKMUK_ENV_FILE':str(env_file)},
        'RunAtLoad': True,
        'KeepAlive': True,
        'ThrottleInterval': 60,
        'StandardOutPath': str(logs/'collector.log'),
        'StandardErrorPath': str(logs/'collector-error.log'),
        'Umask': 0o077,
    }
    if args.dry_run:
        sys.stdout.buffer.write(plistlib.dumps(config))
        return
    os.umask(0o077)
    runtime.mkdir(parents=True, exist_ok=True, mode=0o700)
    logs.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Build a new version before stopping an existing healthy process.
    candidate = runtime/'mukmuk-collector.new'
    subprocess.run([go,'build','-buildvcs=false','-trimpath','-ldflags',f'-X main.version={digest.hexdigest()[:16]}','-o',str(candidate),'./cmd/mukmuk-collector'],cwd=source,check=True)
    if binary.exists():
        if hashlib.sha256(candidate.read_bytes()).digest() != hashlib.sha256(binary.read_bytes()).digest():
            candidate.unlink()
            raise SystemExit('Installed collector differs from the source version')
        candidate.unlink()
    else:
        candidate.replace(binary)
        binary.chmod(0o700)
    subprocess.run(['launchctl','bootout',service],capture_output=True)
    agent.parent.mkdir(parents=True,exist_ok=True)
    agent.write_bytes(plistlib.dumps(config))
    agent.chmod(0o600)
    subprocess.run(['plutil','-lint',str(agent)],check=True)
    subprocess.run(['launchctl','bootstrap',f'gui/{os.getuid()}',str(agent)],check=True)
    print(f'Installed {LABEL}; interval=1 minute; runtime={runtime}; logs={logs}')
    print('DB writer mode is managed separately and was not changed.')


if __name__ == '__main__':
    main()
