import os
import argparse
import sys
import psycopg
from dotenv import load_dotenv
from mukmuk.discord import Discord
from mukmuk.store import Store
from mukmuk.sync import run_sync
from mukmuk.scheduler import sync_lock


def publish_go_board_if_enabled(store, api, settings):
    if store.collector_mode() != 'go':
        return False
    from mukmuk.collector_effects import publish_board
    publish_board(store, api, settings)
    return True


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--backfill-photos', action='store_true', help='Read historical photo references only; no board or reaction writes')
    parser.add_argument('--board-only', action='store_true', help='Publish a due Go-mode board without collecting or opening a Gateway')
    args = parser.parse_args()
    load_dotenv(dotenv_path=os.environ.get('MUKMUK_ENV_FILE'))
    required = ['DISCORD_BOT_TOKEN','DISCORD_GUILD_ID','DISCORD_AUTH_CHANNEL_ID','DISCORD_BOARD_CHANNEL_ID','MUKMUK_DATABASE_URL']
    missing = [key for key in required if not os.environ.get(key)]
    if missing: raise ValueError('Missing settings: '+', '.join(missing))
    if args.board_only:
        with psycopg.connect(os.environ['MUKMUK_DATABASE_URL'], connect_timeout=10) as conn:
            api = Discord(os.environ['DISCORD_BOT_TOKEN'])
            try:
                if not publish_go_board_if_enabled(Store(conn),api,dict(os.environ)):
                    print({'skipped': 'go_collector_disabled'})
            finally:
                api.client.close()
        return
    with sync_lock(os.environ['MUKMUK_DATABASE_URL'], os.environ['DISCORD_AUTH_CHANNEL_ID']) as lock:
        if lock is not None:
            with psycopg.connect(os.environ['MUKMUK_DATABASE_URL'], connect_timeout=10) as conn:
                if args.backfill_photos:
                    from mukmuk.photos import backfill_photos
                    print({'photo_messages_checked': backfill_photos(Discord(os.environ['DISCORD_BOT_TOKEN']), Store(conn),
                        os.environ['DISCORD_GUILD_ID'], os.environ['DISCORD_AUTH_CHANNEL_ID'],
                        check_lock=lambda: lock.execute('SELECT 1'))})
                    return
                print(run_sync(Discord(os.environ['DISCORD_BOT_TOKEN']),Store(conn),dict(os.environ),
                    check_lock=lambda: lock.execute('SELECT 1')))
                return
    # Release the old lock connection before opening the short board connection.
    # The board fallback does not create a Gateway session or process account requests.
    if not args.backfill_photos:
        with psycopg.connect(os.environ['MUKMUK_DATABASE_URL'], connect_timeout=10) as conn:
            api = Discord(os.environ['DISCORD_BOT_TOKEN'])
            try:
                if publish_go_board_if_enabled(Store(conn),api,dict(os.environ)):
                    print({'board': 'checked'})
                    return
            finally:
                api.client.close()
    print({'skipped': 'sync_already_running_or_disabled'})

if __name__ == '__main__':
    try: main()
    except Exception as e:
        print(f'수집 실패: {type(e).__name__}. 설정과 서비스 상태를 확인하세요.',file=sys.stderr)
        sys.exit(1)
