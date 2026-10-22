import type {AccountAction,AccountInbox} from './account-links.ts';
import {BUSY,OFFLINE} from './account-links.ts';
import {shortSQL,withShortDB} from './short-db.ts';
import type { Reply, ReplyDB } from './interactions.ts';
import type { CleanupDB, CleanupJob } from './cleanup.ts';
import type { SecretDB } from './monthly_code.ts';
import type { WorkoutLog } from '../../../src/types.ts';

export function createDB(url:string, testOnlyNoTLS=false) {
  const sql=shortSQL(url,testOnlyNoTLS);
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
      return await sql.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock(hashtext('mukmuk-workouts'))`;
      const identity=await tx`SELECT enabled,revision FROM solitary_athlete.mukmuk_identity_state WHERE singleton`;
      if(identity[0].enabled||Number(identity[0].revision)>0){
        const rows=await tx`SELECT d.username,d.log_date::text,d.memo,d.has_photo,d.verification_count FROM
          solitary_athlete.mukmuk_person_days(${identity[0].revision},NULL,NULL,
            (SELECT person_id FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=${userId} AND valid_until IS NULL)) d
          WHERE EXISTS(SELECT 1 FROM solitary_athlete.mukmuk_person_accounts WHERE user_id=${userId} AND valid_until IS NULL)
          ORDER BY d.log_date DESC`;
        return rows.map(r=>({...r,user_id:userId})) as WorkoutLog[];
      }
      const rows:WorkoutLog[]=[];
      for(let offset=0;;offset+=1000) {
        const page=await tx`SELECT user_id,username,log_date::text,memo,has_photo,verification_count
          FROM solitary_athlete.workout_logs WHERE user_id=${userId}
          ORDER BY log_date DESC LIMIT 1000 OFFSET ${offset}`;
        rows.push(...page as unknown as WorkoutLog[]);
        if(page.length<1000)return rows;
      }
      });
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
  async function enqueueRefresh(id:string,requester:string,target:string,guild:string,channel:string) {
    const rows=await sql`SELECT * FROM solitary_athlete.enqueue_workout_refresh(${id},${requester},${target},${guild},${channel})`;
    return rows[0] as unknown as {id:string;status:string;total:number;checked:number;removed:number};
  }
  const accounts:AccountInbox={
    async online(deadline){
      return await withShortDB(url,async q=>{
      const rows=await q`SELECT 1 FROM solitary_athlete.mukmuk_local_runtime r,solitary_athlete.mukmuk_identity_state s
        WHERE r.singleton AND s.singleton AND s.enabled AND r.ready AND r.lease_until>clock_timestamp()`;
      return rows.length===1;
      },{deadline,testOnlyNoTLS});
    },
    async enqueue(action:AccountAction,deadline){
      await withShortDB(url,async q=>await q.begin(async tx=>{
        await tx`SELECT pg_advisory_xact_lock(hashtext('mukmuk-account-action'),hashtext(${action.actor_id}))`;
        const prior=await tx`SELECT actor_id FROM solitary_athlete.mukmuk_account_link_actions WHERE interaction_id=${action.interaction_id}`;
        if(prior.length){if(prior[0].actor_id!==action.actor_id)throw new Error(BUSY);return;}
        const runtime=await tx`SELECT r.session_id,r.fence FROM solitary_athlete.mukmuk_local_runtime r,
          solitary_athlete.mukmuk_identity_state s WHERE r.singleton AND s.singleton AND s.enabled
          AND r.ready AND r.lease_until>clock_timestamp() FOR SHARE OF r,s`;
        if(!runtime.length)throw new Error(OFFLINE);
        await tx`UPDATE solitary_athlete.mukmuk_account_link_actions SET status='expired'
          WHERE actor_id=${action.actor_id} AND status IN ('queued','processing') AND expires_at<=clock_timestamp()`;
        await tx`INSERT INTO solitary_athlete.mukmuk_account_link_actions
          (interaction_id,actor_id,kind,payload,runtime_session,runtime_fence)
          VALUES(${action.interaction_id},${action.actor_id},${action.kind},${tx.json(action as unknown as Parameters<typeof tx.json>[0])},
          ${runtime[0].session_id},${runtime[0].fence}) ON CONFLICT(interaction_id) DO NOTHING`;
      }),{deadline,testOnlyNoTLS});
    },
    async result(id,actor,deadline){
      return await withShortDB(url,async q=>{
      const rows=await q`SELECT a.status,a.result,a.expires_at>clock_timestamp() AND r.ready
        AND r.lease_until>clock_timestamp() AND a.runtime_session=r.session_id AND a.runtime_fence=r.fence AS alive
        FROM solitary_athlete.mukmuk_account_link_actions a CROSS JOIN solitary_athlete.mukmuk_local_runtime r
        WHERE a.interaction_id=${id} AND a.actor_id=${actor} AND r.singleton`;
      if(!rows.length)return null;
      const row=rows[0];if(row.status==='done'&&row.result)return row.result;
      if(!row.alive||['failed','expired'].includes(row.status))return {content:'처리 시간이 지났어요. 현황을 확인한 뒤 다시 이용해 주세요.'};
      return null;
      },{deadline,testOnlyNoTLS});
    },
  };
  return {db,sql,enqueueRefresh,accounts};
}
