import type { DiscordCall } from './interactions.ts';
export function setting(key:string) {
  const value=Deno.env.get(key);
  if(!value)throw new Error(`Missing setting: ${key}`);
  return value;
}
export const discord:DiscordCall=(method,path,payload)=>fetch(`https://discord.com/api/v10${path}`,{
  method,headers:payload?{'Content-Type':'application/json'}:undefined,
  body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10_000),
});
export function secretMatches(given:string,expected:string):boolean {
  const a=new TextEncoder().encode(given),b=new TextEncoder().encode(expected);
  if(a.length!==b.length)return false;
  let diff=0;for(let i=0;i<a.length;i++)diff|=a[i]^b[i];return diff===0;
}
