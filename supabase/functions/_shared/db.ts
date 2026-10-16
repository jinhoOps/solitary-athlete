import postgres from 'npm:postgres@3.4.9';
import type { Reply, ReplyDB } from './interactions.ts';
import type { CleanupDB, CleanupJob } from './cleanup.ts';
import type { SecretDB } from './monthly_code.ts';
import type { WorkoutLog } from '../../../src/types.ts';

export function createDB(url:string, testOnlyNoTLS=false) {
  const sql=postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:20,max_lifetime:60,
    ssl:testOnlyNoTLS?false:{rejectUnauthorized:true},onnotice:()=>{}});
  const db:ReplyDB & CleanupDB & SecretDB={
    async activeSecret(now) {
      const rows=await sql`SELECT secret_code FROM solitary_athlete.channel_access_secrets
        WHERE expires_at>${now} ORDER BY issued_at DESC LIMIT 1`;
      return rows[0]?.secret_code ?? null;
    },
    async reserveSecret(code,now,activeUntil,expiresAt) {
      return await sql.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock(hashtext('solitary_athlete.monthly-secret'))`;
        const rows=await tx`SELECT secret_code,active_until,expires_at FROM solitary_athlete.channel_access_secrets
          WHERE active_until>${now} ORDER BY issued_at DESC LIMIT 1`;
        if(rows.length)return {code:rows[0].secret_code,activeUntil:new Date(rows[0].active_until),expiresAt:new Date(rows[0].expires_at)};
        await tx`INSERT INTO solitary_athlete.channel_access_secrets(secret_code,issued_at,active_until,expires_at)
          VALUES(${code},${now},${activeUntil},${expiresAt})`;
        return {code,activeUntil,expiresAt};
      });
    },
    async insertSecret(code:string,issuedAt:Date,activeUntil:Date,expiresAt:Date) {
      await sql`INSERT INTO solitary_athlete.channel_access_secrets
        (secret_code,issued_at,active_until,expires_at)
        VALUES(${code},${issuedAt},${activeUntil},${expiresAt})`;
    },
    async prepare(body:Reply,cipher:Uint8Array,expiresAt:Date) {
      const result=await sql`INSERT INTO solitary_athlete.reply_cleanup_jobs
        (interaction_id,application_id,token_ciphertext,token_expires_at)
        VALUES(${body.id},${body.application_id},${cipher},${expiresAt})
        ON CONFLICT(interaction_id) DO NOTHING RETURNING interaction_id`;
      return result.length===1;
    },
    async daily(userId:string) {
      const rows:WorkoutLog[]=[];
      for(let offset=0;;offset+=1000) {
        const page=await sql`SELECT user_id,username,log_date::text,memo,has_photo,verification_count
          FROM solitary_athlete.workout_logs WHERE user_id=${userId}
          ORDER BY log_date DESC LIMIT 1000 OFFSET ${offset}`;
        rows.push(...page as unknown as WorkoutLog[]);
        if(page.length<1000)return rows;
      }
    },
    async reservePublish(id:string,now:Date,attempt?:number) {
      const rows=await sql`UPDATE solitary_athlete.reply_cleanup_jobs
        SET lease_until=${now}::timestamptz+interval '45 seconds'
        WHERE interaction_id=${id} AND status='preparing' AND published_at IS NULL
        AND token_expires_at>${now}
        AND ((${attempt??null}::integer IS NULL AND (lease_until IS NULL OR lease_until<=${now}))
          OR attempts=${attempt??null}) RETURNING attempts`;
      return rows.length?Number(rows[0].attempts):null;
    },
    async lastSuccess() {
      const rows=await sql`SELECT last_success_at FROM solitary_athlete.sync_status WHERE singleton=true`;
      return rows[0]?.last_success_at ? new Date(rows[0].last_success_at).toISOString() : null;
    },
    async schedule(id:string,publishedAt:Date,attempt?:number) {
      await sql`UPDATE solitary_athlete.reply_cleanup_jobs
        SET status='scheduled',published_at=${publishedAt},delete_after=${publishedAt}::timestamptz+interval '300 seconds',
        next_attempt_at=NULL,lease_until=NULL,last_error_code=NULL
        WHERE interaction_id=${id} AND status IN ('preparing','processing')
        AND (${attempt??null}::integer IS NULL OR attempts=${attempt??null})`;
    },
    async claim(now:Date):Promise<CleanupJob[]> {
      const rows=await sql`WITH due AS (
        SELECT interaction_id FROM solitary_athlete.reply_cleanup_jobs
        WHERE status IN ('preparing','scheduled','processing')
        AND (lease_until IS NULL OR lease_until<=${now})
        AND (next_attempt_at IS NULL OR next_attempt_at<=${now})
        AND (token_expires_at<=${now}
          OR (published_at IS NULL AND created_at<=${now}::timestamptz-interval '60 seconds')
          OR delete_after<=${now})
        ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1
      ) UPDATE solitary_athlete.reply_cleanup_jobs j SET status='processing',
        lease_until=${now}::timestamptz+interval '30 seconds',attempts=j.attempts+1
        FROM due WHERE j.interaction_id=due.interaction_id RETURNING j.*`;
      return rows.map(r=>({...r,token_ciphertext:new Uint8Array(r.token_ciphertext)}) as CleanupJob);
    },
    async finish(id:string,status:'done'|'failed',code?:string,attempt?:number) {
      await sql`UPDATE solitary_athlete.reply_cleanup_jobs SET status=${status},token_ciphertext=NULL,
        lease_until=NULL,next_attempt_at=NULL,last_error_code=${code??null}
        WHERE interaction_id=${id} AND status='processing'
        AND (${attempt??null}::integer IS NULL OR attempts=${attempt??null})`;
    },
    async retry(id:string,at:Date,code:string,attempt?:number) {
      await sql`UPDATE solitary_athlete.reply_cleanup_jobs
        SET status=CASE WHEN published_at IS NULL THEN 'preparing' ELSE 'scheduled' END,
        next_attempt_at=LEAST(${at},token_expires_at),lease_until=NULL,last_error_code=${code}
        WHERE interaction_id=${id} AND status='processing'
        AND (${attempt??null}::integer IS NULL OR attempts=${attempt??null})`;
    },
  };
  return {db,sql};
}
