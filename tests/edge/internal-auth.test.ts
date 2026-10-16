import { expect,it } from 'vitest';
import { signCleanupHeaders,verifyCleanupHeaders,signInternalHeaders,verifyInternalHeaders } from '../../supabase/functions/_shared/internal-auth.ts';

const secret='fixture-only-private-key';
const now=new Date('2026-10-14T12:00:00Z');
it('signs a short-lived request without putting the reusable secret in headers',async()=>{
  const headers=await signCleanupHeaders(secret,now,'12345678-1234-4234-8234-123456789abc');
  expect(JSON.stringify(headers)).not.toContain(secret);
  expect(await verifyCleanupHeaders(new Headers(headers),secret,now)).toBe(true);
  expect(await verifyCleanupHeaders(new Headers(headers),'another-key',now)).toBe(false);
});
it('rejects expired, future, malformed and modified headers',async()=>{
  const headers=await signCleanupHeaders(secret,now,'12345678-1234-4234-8234-123456789abc');
  expect(await verifyCleanupHeaders(new Headers(headers),secret,new Date(now.getTime()+30_001))).toBe(false);
  expect(await verifyCleanupHeaders(new Headers(headers),secret,new Date(now.getTime()-5_001))).toBe(false);
  const modified=new Headers(headers);modified.set('X-Mukmuk-Nonce','12345678-1234-4234-8234-123456789abd');
  expect(await verifyCleanupHeaders(modified,secret,now)).toBe(false);
  modified.set('X-Mukmuk-Signature','invalid');
  expect(await verifyCleanupHeaders(modified,secret,now)).toBe(false);
  expect(await verifyCleanupHeaders(new Headers({'X-Mukmuk-Cleanup-Secret':secret}),secret,now)).toBe(false);
});

it('rejects signatures reused against another internal endpoint',async()=>{
  const cleanup=new Headers(await signCleanupHeaders(secret,now));
  expect(await verifyInternalHeaders(cleanup,secret,'weekly-code',now)).toBe(false);
  const weekly=new Headers(await signInternalHeaders(secret,'weekly-code',now));
  expect(await verifyInternalHeaders(weekly,secret,'weekly-code',now)).toBe(true);
  expect(await verifyCleanupHeaders(weekly,secret,now)).toBe(false);
  const monthly=new Headers(await signInternalHeaders(secret,'monthly-code',now));
  expect(await verifyInternalHeaders(monthly,secret,'monthly-code',now)).toBe(true);
  expect(await verifyInternalHeaders(monthly,secret,'weekly-code',now)).toBe(false);
  expect(await verifyCleanupHeaders(monthly,secret,now)).toBe(false);
});
