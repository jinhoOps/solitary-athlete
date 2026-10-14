import { expect, it } from 'vitest';
import { generateSecretCode, formatWeeklyNotice, rotateWeeklySecret, type SecretDB } from '../../supabase/functions/_shared/weekly_code.ts';

it('generates readable secret code starting with mukmuk-', () => {
  const code = generateSecretCode();
  expect(code).toMatch(/^mukmuk-[2-9a-km-z]{4}$/);
});

it('formats notice message with codeblock and direct link', () => {
  const msg = formatWeeklyNotice('mukmuk-7k2x', 'https://example.com/board');
  expect(msg).toContain('## 🔑 이번 주 웹보드 시크릿 코드');
  expect(msg).toContain('```\nmukmuk-7k2x\n```');
  expect(msg).toContain('👉 [**웹보드 바로 접속하기**](https://example.com/board?code=mukmuk-7k2x)');
});

it('rotates secret, saves with 24h grace period, and posts to discord notice channel when no existing message', async () => {
  const now = new Date('2026-10-19T00:00:00+09:00'); // Next Monday
  let savedSecret: { code: string; issuedAt: Date; activeUntil: Date; expiresAt: Date } | null = null;
  const mockDb: SecretDB = {
    async insertSecret(code, issuedAt, activeUntil, expiresAt) {
      savedSecret = { code, issuedAt, activeUntil, expiresAt };
    }
  };

  const calls: Array<{ method: string; path: string; payload?: Record<string, unknown> }> = [];
  const mockDiscord = async (method: string, path: string, payload?: Record<string, unknown>) => {
    calls.push({ method, path, payload });
    if (method === 'GET') {
      return new Response(JSON.stringify([]), { status: 200 });
    }
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: 'msg-999' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const result = await rotateWeeklySecret({
    db: mockDb,
    discord: mockDiscord,
    noticeChannelId: '1559802402893340744',
    botUserId: 'bot-1',
    dashboardUrl: 'https://jinhoops.github.io/solitary-athlete/',
    now: () => now,
    codeGenerator: () => 'mukmuk-7k2x'
  });

  expect(result.code).toBe('mukmuk-7k2x');
  expect(result.messageId).toBe('msg-999');

  expect(savedSecret).not.toBeNull();
  expect(savedSecret!.code).toBe('mukmuk-7k2x');
  expect(savedSecret!.activeUntil.toISOString()).toBe('2026-10-25T15:00:00.000Z');
  expect(savedSecret!.expiresAt.toISOString()).toBe('2026-10-26T15:00:00.000Z');

  expect(calls[0]).toEqual({ method: 'GET', path: '/channels/1559802402893340744/messages?limit=100', payload: undefined });
  expect(calls[1].method).toBe('POST');
  expect(calls[1].path).toBe('/channels/1559802402893340744/messages');
  expect(calls[1].payload?.content).toContain('mukmuk-7k2x');
});

it('posts the new notice before deleting old bot notices, preserving other authors', async () => {
  const now = new Date('2026-10-19T00:00:00+09:00');
  const mockDb: SecretDB = { async insertSecret() {} };

  const calls: Array<{ method: string; path: string; payload?: Record<string, unknown> }> = [];
  const mockDiscord = async (method: string, path: string, payload?: Record<string, unknown>) => {
    calls.push({ method, path, payload });
    if (method === 'GET') {
      return new Response(JSON.stringify([
        { id: 'msg-old-1', author: {id:'bot-1'}, content: '## 🔑 이번 주 웹보드 시크릿 코드\n...' },
        { id: 'msg-unrelated', content: '운영 공지사항입니다.' },
        { id: 'msg-old-2', author: {id:'someone-else'}, content: '## 🔑 이번 주 웹보드 시크릿 코드\n...' },
      ]), { status: 200 });
    }
    if (method === 'POST') {
      return new Response(JSON.stringify({ id: 'msg-new' }), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  };

  const result = await rotateWeeklySecret({
    db: mockDb,
    discord: mockDiscord,
    noticeChannelId: '1559802402893340744',
    botUserId: 'bot-1',
    dashboardUrl: 'https://jinhoops.github.io/solitary-athlete/',
    now: () => now,
    codeGenerator: () => 'mukmuk-updated'
  });

  expect(result.code).toBe('mukmuk-updated');
  expect(result.messageId).toBe('msg-new');

  // Publish first, then remove only our previous message.
  expect(calls[0].method).toBe('GET');
  expect(calls[1]).toEqual({
    method: 'POST',
    path: '/channels/1559802402893340744/messages',
    payload: expect.objectContaining({ content: expect.stringContaining('mukmuk-updated') }),
  });
  expect(calls[2]).toEqual({
    method: 'DELETE',
    path: '/channels/1559802402893340744/messages/msg-old-1',
    payload: undefined,
  });
});

it('keeps the previous notice when posting the next code fails', async()=>{
  const methods:string[]=[];
  await expect(rotateWeeklySecret({
    db:{async insertSecret(){}},botUserId:'bot-1',noticeChannelId:'channel',dashboardUrl:'https://example.com',
    discord:async(method)=>{
      methods.push(method);
      return method==='GET'?Response.json([{id:'old',author:{id:'bot-1'},content:'🔑 이번 주 웹보드 시크릿 코드'}]):new Response('',{status:403});
    }
  })).rejects.toThrow();
  expect(methods).toEqual(['GET','POST']);
});

it('aligns an initial Wednesday code with next Monday in KST',async()=>{
  const result=await rotateWeeklySecret({db:{async insertSecret(){}},botUserId:'bot',noticeChannelId:'c',dashboardUrl:'https://example.com',now:()=>new Date('2026-10-14T12:00:00Z'),discord:async method=>Response.json(method==='GET'?[]:{id:'new'})});
  expect(result.activeUntil.toISOString()).toBe('2026-10-18T15:00:00.000Z');
  expect(result.expiresAt.toISOString()).toBe('2026-10-19T15:00:00.000Z');
});

it('reuses a reserved code and existing notice after a retry',async()=>{
  const activeUntil=new Date('2026-10-18T15:00:00Z'),expiresAt=new Date('2026-10-19T15:00:00Z');
  const methods:string[]=[];
  const result=await rotateWeeklySecret({
    db:{async insertSecret(){throw new Error('must use reservation');},async reserveSecret(){return {code:'mukmuk-same',activeUntil,expiresAt};}},
    botUserId:'bot',noticeChannelId:'c',dashboardUrl:'https://example.com',
    discord:async method=>{methods.push(method);return Response.json([{id:'existing',author:{id:'bot'},content:formatWeeklyNotice('mukmuk-same','https://example.com')}]);}
  });
  expect(result.messageId).toBe('existing');
  expect(result.code).toBe('mukmuk-same');
  expect(methods).toEqual(['GET']);
});

it('concurrent publishers request Discord nonce deduplication for the same code',async()=>{
  const created=new Map<string,string>();
  const discord=async(method:string,_path:string,payload?:Record<string,unknown>)=>{
    if(method==='GET')return Response.json([]);
    const nonce=String(payload?.nonce);
    if(payload?.enforce_nonce && created.has(nonce))return Response.json({id:created.get(nonce)});
    const id=String(created.size+1);created.set(payload?.enforce_nonce?nonce:id,id);return Response.json({id});
  };
  const deps={db:{async insertSecret(){}},botUserId:'bot',noticeChannelId:'c',dashboardUrl:'https://example.com',codeGenerator:()=> 'mukmuk-same',discord};
  const results=await Promise.all([rotateWeeklySecret(deps),rotateWeeklySecret(deps)]);
  expect(results[0].messageId).toBe(results[1].messageId);
  expect(created.size).toBe(1);
});

it('preserves URL query and fragment while replacing the access code',()=>{
  const notice=formatWeeklyNotice('mukmuk-new','https://example.com/board/?from=discord&code=old#grass');
  expect(notice).toContain('https://example.com/board/?from=discord&code=mukmuk-new#grass');
  expect(notice).not.toContain('code=old');
});
