import postgres from 'npm:postgres@3.4.9';
export type Sql=postgres.Sql;
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
/** Acquire may be retried; work, including COMMIT, is always attempted once. */
export async function withShortDB<T>(url:string,work:(sql:Sql)=>Promise<T>,options:{deadline?:number;testOnlyNoTLS?:boolean}={}):Promise<T> {
  const until=Math.min(Date.now()+2500,options.deadline??Infinity);
  for(let attempt=0;;attempt++) {
    if(Date.now()>=until)throw new Error('Database unavailable');
    const sql=postgres(url,{max:1,prepare:false,connect_timeout:2,idle_timeout:1,max_lifetime:5,
      ssl:options.testOnlyNoTLS?false:{rejectUnauthorized:true},onnotice:()=>{}});
    let timer:ReturnType<typeof setTimeout>|undefined;
    let acquired=false;
    try {
      const reserved=await Promise.race([sql.reserve(),new Promise<never>((_,reject)=>{
        timer=setTimeout(()=>reject(new Error('Database unavailable')),Math.max(0,until-Date.now()));
      })]);
      clearTimeout(timer);
      if(Date.now()>=until)throw new Error('Database unavailable');
      acquired=true;
      // Return the verified connection to this private max:1 client before SQL begins.
      reserved.release();
      return await work(sql);
    } catch(error) {
      if(acquired)throw error;
      if((error as {code?:string})?.code!=='53300'||attempt>=4||Date.now()>=until)throw new Error('Database unavailable');
    } finally {
      clearTimeout(timer);
      await sql.end({timeout:0});
    }
    await pause(Math.min(100*2**attempt+Math.random()*100,Math.max(0,until-Date.now())));
  }
}
/** Lazy facade: one short scope per query/transaction, no warm pool or HTTP-held client. */
export function shortSQL(url:string,testOnlyNoTLS=false):Sql {
  let tail:Promise<unknown>=Promise.resolve();let closed=false;
  function scope<T>(work:(sql:Sql)=>Promise<T>):Promise<T> {
    if(closed)return Promise.reject(new Error('Database closed'));
    const result=tail.then(()=>withShortDB(url,work,{testOnlyNoTLS}));
    tail=result.catch(()=>{});return result;
  }
  const tag=((strings:TemplateStringsArray,...values:unknown[])=>scope(async sql=>await sql(strings,...values as never[]))) as unknown as Sql;
  tag.begin=((work:(sql:Sql)=>Promise<unknown>)=>scope(async sql=>await sql.begin(work as never))) as unknown as Sql['begin'];
  tag.end=async()=>{closed=true;await tail;};
  return tag;
}
