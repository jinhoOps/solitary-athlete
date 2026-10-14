import { expect, it } from 'vitest';
import { loadDashboard, loadTimeline } from '../../src/api';

const config = { url: 'https://example.supabase.co', key: 'sb_publishable_fixture' };
const row = (n: number) => ({ user_id: String(n), username: n === 0 ? '최신' : '하루',
  log_date: '2026-10-14', has_photo: true, memo: '<img src=x onerror=alert(1)>', verification_count: 1 });

it('paginates all metadata, keeps the newest display name and public headers', async () => {
  const calls: URL[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(url);
    expect(new Headers(init?.headers).get('Accept-Profile')).toBe('solitary_athlete');
    expect(new Headers(init?.headers).get('apikey')).toBe(config.key);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);
    if (url.pathname.endsWith('sync_status')) return Response.json([{ last_success_at: null }]);
    if (url.searchParams.get('select')?.includes('memo')) return Response.json([row(0)]);
    const offset = Number(url.searchParams.get('offset'));
    return Response.json(offset === 0 ? Array.from({ length: 1000 }, (_, n) => row(n)) :
      [{ ...row(0), username: '과거', log_date: '2025-01-01' }]);
  };
  const data = await loadDashboard(config, '2026-10-14', fetcher);
  expect(data.members).toHaveLength(1000);
  expect(data.members.find(m => m.id === '0')?.name).toBe('최신');
  expect(data.members.find(m => m.id === '0')?.dates.size).toBe(2);
  expect(calls.some(u => u.searchParams.get('offset') === '1000')).toBe(true);
  expect(data.logs[0].memo).toBe('<img src=x onerror=alert(1)>');
});

it('throws for an API failure instead of returning empty records', async () => {
  await expect(loadDashboard(config, '2026-10-14', async () => new Response('denied', { status: 403 })))
    .rejects.toThrow();
});

it('requests thirty stable ordered record days for a selected member', async () => {
  const data = await loadTimeline(config, '123', 30, async input => {
    const url = new URL(String(input));
    expect(url.searchParams.get('user_id')).toBe('eq.123');
    expect(url.searchParams.get('offset')).toBe('30');
    expect(url.searchParams.get('limit')).toBe('30');
    expect(url.searchParams.get('order')).toBe('log_date.desc,user_id.asc');
    return Response.json([row(123)]);
  });
  expect(data).toHaveLength(1);
});
