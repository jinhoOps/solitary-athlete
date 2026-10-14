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
  expect(msg).toContain('👉 **[웹보드 바로 접속하기](https://example.com/board?code=mukmuk-7k2x)**');
});

it('rotates secret, saves with 24h grace period, and posts to discord notice channel', async () => {
  const now = new Date('2026-10-19T00:00:00+09:00'); // Next Monday
  let savedSecret: { code: string; issuedAt: Date; activeUntil: Date; expiresAt: Date } | null = null;
  const mockDb: SecretDB = {
    async insertSecret(code, issuedAt, activeUntil, expiresAt) {
      savedSecret = { code, issuedAt, activeUntil, expiresAt };
    }
  };

  let postedPath = '';
  let postedPayload: Record<string, unknown> = {};
  const mockDiscord = async (path: string, payload: Record<string, unknown>) => {
    postedPath = path;
    postedPayload = payload;
    return new Response(JSON.stringify({ id: 'msg-999' }), { status: 200 });
  };

  const result = await rotateWeeklySecret({
    db: mockDb,
    discord: mockDiscord,
    noticeChannelId: '1559802402893340744',
    dashboardUrl: 'https://jinhoops.github.io/solitary-athlete/',
    now: () => now,
    codeGenerator: () => 'mukmuk-7k2x'
  });

  expect(result.code).toBe('mukmuk-7k2x');
  expect(result.messageId).toBe('msg-999');

  expect(savedSecret).not.toBeNull();
  expect(savedSecret!.code).toBe('mukmuk-7k2x');
  // activeUntil: now + 7 days
  expect(savedSecret!.activeUntil.toISOString()).toBe('2026-10-25T15:00:00.000Z');
  // expiresAt: now + 8 days (24h grace)
  expect(savedSecret!.expiresAt.toISOString()).toBe('2026-10-26T15:00:00.000Z');

  expect(postedPath).toBe('/channels/1559802402893340744/messages');
  expect(postedPayload.content).toContain('mukmuk-7k2x');
});
