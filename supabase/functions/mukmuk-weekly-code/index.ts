import { createDB } from '../_shared/db.ts';
import { rotateWeeklySecret } from '../_shared/weekly_code.ts';
import { discordBot, setting } from '../_shared/runtime.ts';
import { verifyInternalHeaders } from '../_shared/internal-auth.ts';

const { db } = createDB(setting('MUKMUK_DATABASE_URL'));

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  if (!await verifyInternalHeaders(req.headers, setting('MUKMUK_CLEANUP_SECRET'), 'weekly-code'))
    return new Response('Unauthorized', { status: 401 });

  try {
    const result = await rotateWeeklySecret({
      db,
      discord: discordBot(setting('DISCORD_BOT_TOKEN')),
      noticeChannelId: setting('DISCORD_NOTICE_CHANNEL_ID'),
      dashboardUrl: setting('MUKMUK_DASHBOARD_URL'),
    });
    return Response.json(result);
  } catch (err) {
    console.error('mukmuk_weekly_code_failed', err);
    return new Response('Weekly code rotation failed', { status: 500 });
  }
});
