export type InternalPurpose='cleanup'|'weekly-code';
const encoder=new TextEncoder();
async function keyFor(secret:string) {
  return crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);
}
function payload(purpose:InternalPurpose,timestamp:string,nonce:string) {return encoder.encode(`mukmuk-${purpose}-v1:${timestamp}:${nonce}`);}
export async function signInternalHeaders(secret:string,purpose:InternalPurpose,now=new Date(),nonce=crypto.randomUUID()):Promise<Record<string,string>> {
  const timestamp=String(Math.floor(now.getTime()/1000));
  const signature=await crypto.subtle.sign('HMAC',await keyFor(secret),payload(purpose,timestamp,nonce));
  const hex=[...new Uint8Array(signature)].map(b=>b.toString(16).padStart(2,'0')).join('');
  return {'X-Mukmuk-Timestamp':timestamp,'X-Mukmuk-Nonce':nonce,'X-Mukmuk-Signature':hex};
}
export async function verifyInternalHeaders(headers:Headers,secret:string,purpose:InternalPurpose,now=new Date()):Promise<boolean> {
  const timestamp=headers.get('X-Mukmuk-Timestamp')??'',nonce=headers.get('X-Mukmuk-Nonce')??'';
  const hex=headers.get('X-Mukmuk-Signature')??'';
  if(!/^\d{1,12}$/.test(timestamp)||!/^[0-9a-f-]{36}$/i.test(nonce)||!/^[0-9a-f]{64}$/i.test(hex))return false;
  const age=now.getTime()-Number(timestamp)*1000;
  if(age>30_000||age< -5_000)return false;
  const signature=Uint8Array.from(hex.match(/../g)!,b=>parseInt(b,16));
  return crypto.subtle.verify('HMAC',await keyFor(secret),signature,payload(purpose,timestamp,nonce));
}

export function signCleanupHeaders(secret:string,now=new Date(),nonce=crypto.randomUUID()) {
  return signInternalHeaders(secret,'cleanup',now,nonce);
}
export function verifyCleanupHeaders(headers:Headers,secret:string,now=new Date()) {
  return verifyInternalHeaders(headers,secret,'cleanup',now);
}
