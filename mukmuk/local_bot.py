"""Local Gateway presence and online-only account processing; HTTP commands stay on Edge."""
import asyncio
from contextlib import contextmanager
import math
import os
from threading import Timer
import time
import discord
from dotenv import load_dotenv
from .db_session import SharedDB
from .discord import Discord
from .local_owner import LocalOwner
from .local_runtime import LocalRuntime
from .scheduler import sync_lock
from .sync import run_sync


@contextmanager
def collector_watchdog(seconds=240):
    # A stuck worker thread must not leave the main process advertising a healthy collector.
    timer = Timer(seconds, lambda: os._exit(124))
    timer.daemon = True
    timer.start()
    try:
        yield
    finally:
        timer.cancel()


class LocalBot(discord.Client):
    def __init__(self, settings, owner):
        super().__init__(intents=discord.Intents(guilds=True), allowed_mentions=discord.AllowedMentions.none())
        self.settings, self.owner = settings, owner
        self.database = SharedDB(settings['MUKMUK_DATABASE_URL'])
        self.api = Discord(settings['DISCORD_BOT_TOKEN'])
        self.runtime = LocalRuntime(self.database, self.api, settings, ready_check=self.account_ready)
        self.collect_requested = asyncio.Event()
        self.background = []
        self.stopping = False
        self.collecting = False
        self.gateway_connected = False

    def account_ready(self):
        return (not self.stopping and self.gateway_connected and self.is_ready() and math.isfinite(self.latency)
                and self.settings.get('MUKMUK_ACCOUNT_LINK_ENABLED', '').lower() in ('1','true'))

    async def setup_hook(self):
        self.collect_requested.set()
        self.background = [asyncio.create_task(self._ticks()), asyncio.create_task(self._collects()),
                           asyncio.create_task(self._ownership())]

    async def on_ready(self):
        expected = self.settings.get('DISCORD_APP_ID')
        if expected and str(self.user.id) != expected:
            await self.close()
            return
        self.gateway_connected = True

    async def on_resumed(self):
        self.gateway_connected = True

    async def on_disconnect(self):
        # The synchronous check inside an in-flight action observes is_ready() immediately.
        self.gateway_connected = False
        self.runtime.requested_ready = False

    async def on_error(self, event, *args, **kwargs):
        print('mukmuk_gateway_event_failed', flush=True)

    async def _ticks(self):
        while not self.stopping:
            try:
                result = await asyncio.to_thread(self.runtime.tick, self.account_ready())
                if result.get('approved'):
                    self.collect_requested.set()
            except Exception:
                # Do not log exceptions carrying query parameters, tokens or account IDs.
                self.runtime.requested_ready = False
                print('mukmuk_local_tick_deferred', flush=True)
            await asyncio.sleep(5)

    async def _ownership(self):
        while not self.stopping:
            if any(task.done() for task in self.background[:2]):
                await self.close()
                return
            self.owner.touch()
            await asyncio.sleep(5)

    def _application_context(self):
        from .accounts import AccountService
        fence=self.runtime.fence
        def guard(conn):
            self.runtime._guard(conn,fence)
        return AccountService(self.database,self.api,self.settings).prepare_apply(guard)

    def _collect_once(self):
        try:
            with collector_watchdog():
                with sync_lock(self.settings['MUKMUK_DATABASE_URL'], self.settings['DISCORD_AUTH_CHANNEL_ID']) as lock:
                    if lock is None:
                        return
                    with self.database.session() as store:
                        api = Discord(self.settings['DISCORD_BOT_TOKEN'])
                        def check():
                            if self.stopping:
                                raise InterruptedError('local_bot_stopping')
                            lock.execute('SELECT 1')
                        try:
                            run_sync(api, store, self.settings, check_lock=check,
                                     account_context=self._application_context)
                        finally:
                            api.client.close()

        finally:
            self.collecting = False

    async def _collects(self):
        while not self.stopping:
            try:
                await asyncio.wait_for(self.collect_requested.wait(), timeout=300)
            except TimeoutError:
                pass
            self.collect_requested.clear()
            if self.stopping:
                break
            self.collecting = True
            try:
                await asyncio.to_thread(self._collect_once)
            except Exception:
                print('mukmuk_local_collection_failed', flush=True)

    async def close(self):
        if self.stopping:
            return
        self.stopping = True
        self.runtime.requested_ready = False
        # Closing the CLI has the same bounded grace as the existing macOS runner.
        shutdown_timer = Timer(5, lambda: os._exit(130)) if self.collecting else None
        if shutdown_timer:
            shutdown_timer.daemon = True
            shutdown_timer.start()
        try:
            current = asyncio.current_task()
            tasks = [task for task in self.background if task is not current]
            for task in tasks:
                task.cancel()
            await asyncio.gather(*tasks, return_exceptions=True)
            try:
                await asyncio.to_thread(self.runtime.tick, False)
            except Exception:
                pass
            await super().close()
            self.api.client.close()
        finally:
            if shutdown_timer and not self.collecting:
                shutdown_timer.cancel()


def main():
    os.umask(0o077)
    load_dotenv(dotenv_path=os.environ.get('MUKMUK_ENV_FILE'))
    settings = dict(os.environ)
    required = ('DISCORD_BOT_TOKEN','DISCORD_GUILD_ID','DISCORD_AUTH_CHANNEL_ID',
                'DISCORD_BOARD_CHANNEL_ID','MUKMUK_DATABASE_URL')
    if any(not settings.get(key) for key in required):
        raise SystemExit('로컬 묵묵봇 설정을 확인해 주세요.')
    with LocalOwner() as owner:
        async def start():
            async with LocalBot(settings, owner) as client:
                await client.start(settings['DISCORD_BOT_TOKEN'])
        try:
            asyncio.run(start())
        except KeyboardInterrupt:
            pass
        except Exception:
            raise SystemExit('로컬 묵묵봇을 마쳤어요. 설정과 연결 상태를 확인해 주세요.') from None


if __name__ == '__main__':
    main()
