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
export type DiscordBotCall=(method:string,path:string,payload?:Record<string,unknown>)=>Promise<Response>;
export const discordBot=(token:string):DiscordBotCall=>(method:string,path:string,payload?:Record<string,unknown>)=>fetch(`https://discord.com/api/v10${path}`,{
  method,
  headers:{
    Authorization:`Bot ${token}`,
    'User-Agent':'DiscordBot (https://github.com/jinhoOps/solitary-athlete, 0.1.0)',
    ...(payload?{'Content-Type':'application/json'}:{}),
  },
  body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10_000),
});
