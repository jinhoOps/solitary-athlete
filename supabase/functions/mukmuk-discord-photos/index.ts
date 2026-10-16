import {createDB} from '../_shared/db.ts';
import {createPhotoHandler,type PhotoEvent} from '../_shared/photos.ts';
import {discordBot,setting} from '../_shared/runtime.ts';
const {sql}=createDB(setting('MUKMUK_DATABASE_URL'));
Deno.serve(createPhotoHandler({
 guild:setting('MUKMUK_DISCORD_GUILD_ID'),channel:setting('MUKMUK_DISCORD_AUTH_CHANNEL_ID'),
 discord:discordBot(setting('MUKMUK_DISCORD_BOT_TOKEN')),
 db:{
  async validCode(code){
   const rows=await sql`SELECT 1 FROM solitary_athlete.channel_access_secrets WHERE lower(secret_code)=${code} AND expires_at>now() LIMIT 1`;
   return rows.length>0;
  },
  async events(user,date,after){
   return await sql`SELECT message_id,guild_id,channel_id,attachments FROM solitary_athlete.workout_events
    WHERE user_id=${user} AND log_date=${date}::date AND jsonb_array_length(attachments)>0
    AND (${after}::text IS NULL OR message_id::numeric>${after}::numeric)
    ORDER BY message_id::numeric LIMIT 10` as unknown as PhotoEvent[];
  },
  async removed(id){await sql`UPDATE solitary_athlete.workout_events SET attachments='[]'::jsonb WHERE message_id=${id}`;},
 }
}));
