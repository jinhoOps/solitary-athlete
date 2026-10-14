import { expect, it } from 'vitest';
import { loadDashboard, loadTimeline } from '../../src/api';

const config = { url: 'https://example.supabase.co', key: 'sb_publishable_fixture' };
const row = (n: number) => ({
  user_id: String(n),
  username: n === 0 ? '최신' : '하루',
  log_date: '2026-10-14',
  has_photo: true,
  memo: '<img src=x onerror=alert(1)>',
  verification_count: 1,
});

it('calls get_workout_logs RPC with normalized secret code and loads dashboard data', async () => {
  const calls: { url: URL; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    calls.push({ url, body });
    expect(new Headers(init?.headers).get('Accept-Profile')).toBe('solitary_athlete');
    expect(new Headers(init?.headers).get('apikey')).toBe(config.key);
    expect(new Headers(init?.headers).has('Authorization')).toBe(false);

    if (url.pathname.endsWith('sync_status')) {
      return Response.json([{ last_success_at: '2026-10-14T11:00:00Z' }]);
    }
    if (url.pathname.endsWith('get_workout_logs')) {
      return Response.json([
        row(0),
        { ...row(0), username: '과거', log_date: '2026-09-01' },
        row(1),
      ]);
    }
    return new Response('Not found', { status: 404 });
  };

  const data = await loadDashboard(config, '  MukMuk-7K2X  ', 2026, fetcher);

  const rpcCall = calls.find(c => c.url.pathname.endsWith('get_workout_logs'))!;
  expect(rpcCall.body.p_secret_code).toBe('mukmuk-7k2x');
  expect(rpcCall.body.p_year).toBe(2026);

  expect(data.members).toHaveLength(2);
  expect(data.lastSuccess).toBe('2026-10-14T11:00:00Z');
  expect(data.kpis.activeMembers).toBeGreaterThan(0);
});

it('throws invalid_or_expired_secret when RPC fails', async () => {
  const fetcher: typeof fetch = async () =>
    new Response(JSON.stringify({ message: 'invalid_or_expired_secret' }), { status: 400 });

  await expect(loadDashboard(config, 'wrong-code', 2026, fetcher))
    .rejects.toThrow('invalid_or_expired_secret');
});

it('slices timeline records for selected member in memory', () => {
  const logs = [
    { ...row(1), log_date: '2026-10-14' },
    { ...row(2), log_date: '2026-10-14' },
    { ...row(1), log_date: '2026-10-13' },
  ];

  const user1Timeline = loadTimeline(logs, '1', 0, 10);
  expect(user1Timeline).toHaveLength(2);
  expect(user1Timeline.every(l => l.user_id === '1')).toBe(true);

  const allTimeline = loadTimeline(logs, null, 0, 10);
  expect(allTimeline).toHaveLength(3);
});
