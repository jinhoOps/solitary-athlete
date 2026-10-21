import {pollAccount,BUSY} from '../_shared/account-links.ts';
import { createDB } from '../_shared/db.ts';
import { handleInteraction,publishReply } from '../_shared/interactions.ts';
import {formatRefresh} from '../_shared/refresh.ts';
import { discord,setting } from '../_shared/runtime.ts';
declare const EdgeRuntime:{waitUntil:(promise:Promise<unknown>)=>void};
const {db,enqueueRefresh,accounts}=createDB(setting('MUKMUK_DATABASE_URL'));
Deno.serve(req=>handleInteraction(req,{
  publicKey:setting('MUKMUK_DISCORD_PUBLIC_KEY'),guildId:setting('MUKMUK_DISCORD_GUILD_ID'),appId:setting('MUKMUK_DISCORD_APP_ID'),
  memberRoleId:Deno.env.get('MUKMUK_DISCORD_ROLE_MEMBER_ID')??'',
  waitUntil:p=>EdgeRuntime.waitUntil(p),
  account:{online:deadline=>Deno.env.get('MUKMUK_ACCOUNT_LINK_ENABLED')==='true'?accounts.online(deadline):Promise.resolve(false),
    publish:(body,action)=>publishReply(body,{key:setting('MUKMUK_REPLY_TOKEN_KEY'),now:()=>new Date(),dashboardUrl:'',db,discord,
      preparationFailure:BUSY,render:()=>pollAccount(action,accounts)})},
  refresh:body=>publishReply(body,{key:setting('MUKMUK_REPLY_TOKEN_KEY'),now:()=>new Date(),dashboardUrl:'',db,discord,
    render:async()=>formatRefresh(await enqueueRefresh(body.id,body.requesterId,body.targetId,
      setting('MUKMUK_DISCORD_GUILD_ID'),setting('MUKMUK_DISCORD_AUTH_CHANNEL_ID')),body.id),
  }),
  publish:body=>publishReply(body,{key:setting('MUKMUK_REPLY_TOKEN_KEY'),now:()=>new Date(),
    dashboardUrl:Deno.env.get('MUKMUK_DASHBOARD_URL')??'',db,discord,
    emojis:[Deno.env.get('MUKMUK_GRASS_RECORD_EMOJI_ID'),Deno.env.get('MUKMUK_GRASS_PHOTO_EMOJI_ID')],
  }),
}));
