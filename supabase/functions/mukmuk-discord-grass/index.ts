import { createDB } from '../_shared/db.ts';
import { handleInteraction,publishReply } from '../_shared/interactions.ts';
import { discord,setting } from '../_shared/runtime.ts';
declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};
const {db}=createDB(setting('MUKMUK_DATABASE_URL'));
Deno.serve(req=>handleInteraction(req,{
  publicKey:setting('MUKMUK_DISCORD_PUBLIC_KEY'),guildId:setting('MUKMUK_DISCORD_GUILD_ID'),appId:setting('MUKMUK_DISCORD_APP_ID'),
  waitUntil:p=>EdgeRuntime.waitUntil(p),
  publish:body=>publishReply(body,{key:setting('MUKMUK_REPLY_TOKEN_KEY'),now:()=>new Date(),
    dashboardUrl:Deno.env.get('MUKMUK_DASHBOARD_URL')??'',db,discord,
    emojis:[Deno.env.get('MUKMUK_GRASS_RECORD_EMOJI_ID'),Deno.env.get('MUKMUK_GRASS_PHOTO_EMOJI_ID')],
  }),
}));
