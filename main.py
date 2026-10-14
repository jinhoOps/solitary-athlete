import os
import sys
import psycopg
from dotenv import load_dotenv
from mukmuk.discord import Discord
from mukmuk.store import Store
from mukmuk.sync import run_sync

def main():
    load_dotenv()
    required = ['DISCORD_BOT_TOKEN','DISCORD_GUILD_ID','DISCORD_AUTH_CHANNEL_ID','DISCORD_BOARD_CHANNEL_ID','MUKMUK_DATABASE_URL']
    missing = [key for key in required if not os.environ.get(key)]
    if missing: raise ValueError('Missing settings: '+', '.join(missing))
    with psycopg.connect(os.environ['MUKMUK_DATABASE_URL'], connect_timeout=10) as conn:
        print(run_sync(Discord(os.environ['DISCORD_BOT_TOKEN']),Store(conn),dict(os.environ)))

if __name__ == '__main__':
    try: main()
    except Exception as e:
        print(f'수집 실패: {type(e).__name__}. 설정과 서비스 상태를 확인하세요.',file=sys.stderr)
        sys.exit(1)
