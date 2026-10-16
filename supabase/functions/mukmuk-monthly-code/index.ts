import { createDB } from '../_shared/db.ts';
import { rotateMonthlySecret } from '../_shared/monthly_code.ts';
import { discordBot, setting } from '../_shared/runtime.ts';
import { verifyInternalHeaders } from '../_shared/internal-auth.ts';

const { db } = createDB(setting('MUKMUK_DATABASE_URL'));

Deno.serve(async req => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });
  const secret = setting('MUKMUK_CLEANUP_SECRET');
  const authorized = await verifyInternalHeaders(req.headers, secret, 'monthly-code') ||
                     await verifyInternalHeaders(req.headers, secret, 'weekly-code');
  if (!authorized)
    return new Response('Unauthorized', { status: 401 });

  try {
    const result = await rotateMonthlySecret({
      db,
      discord: discordBot(setting('DISCORD_BOT_TOKEN')),
      noticeChannelId: setting('DISCORD_NOTICE_CHANNEL_ID'),
      botUserId: setting('MUKMUK_DISCORD_APP_ID'),
      dashboardUrl: setting('MUKMUK_DASHBOARD_URL'),
    });
    return Response.json({messageId:result.messageId,activeUntil:result.activeUntil,expiresAt:result.expiresAt});
  } catch (err) {
    console.error('mukmuk_monthly_code_failed');
    return new Response('Monthly code rotation failed', { status: 500 });
  }
});
