import os
import argparse
import sys
import psycopg
from dotenv import load_dotenv
from mukmuk.discord import Discord
from mukmuk.store import Store
from mukmuk.sync import run_sync
from mukmuk.scheduler import sync_lock

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backfill-photos', action='store_true', help='Read historical photo references only; no board or reaction writes')
    args = parser.parse_args()
    load_dotenv(dotenv_path=os.environ.get('MUKMUK_ENV_FILE'))
    required = ['DISCORD_BOT_TOKEN','DISCORD_GUILD_ID','DISCORD_AUTH_CHANNEL_ID','DISCORD_BOARD_CHANNEL_ID','MUKMUK_DATABASE_URL']
    missing = [key for key in required if not os.environ.get(key)]
    if missing: raise ValueError('Missing settings: '+', '.join(missing))
    with sync_lock(os.environ['MUKMUK_DATABASE_URL'], os.environ['DISCORD_AUTH_CHANNEL_ID']) as lock:
        if lock is None:
            print({'skipped': 'sync_already_running'}); return
        with psycopg.connect(os.environ['MUKMUK_DATABASE_URL'], connect_timeout=10) as conn:
            if args.backfill_photos:
                from mukmuk.photos import backfill_photos
                print({'photo_messages_checked': backfill_photos(Discord(os.environ['DISCORD_BOT_TOKEN']), Store(conn),
                    os.environ['DISCORD_GUILD_ID'], os.environ['DISCORD_AUTH_CHANNEL_ID'],
                    check_lock=lambda: lock.execute('SELECT 1'))})
                return
            print(run_sync(Discord(os.environ['DISCORD_BOT_TOKEN']),Store(conn),dict(os.environ),
                check_lock=lambda: lock.execute('SELECT 1')))

if __name__ == '__main__':
    try: main()
    except Exception as e:
        print(f'수집 실패: {type(e).__name__}. 설정과 서비스 상태를 확인하세요.',file=sys.stderr)
        sys.exit(1)
