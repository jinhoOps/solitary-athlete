import postgres from 'npm:postgres@3.4.9';

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

Deno.test('secrets & RPC: active code, grace period, expiration, and anon access control', async () => {
  const url = Deno.env.get('TEST_DATABASE_URL');
  if (!url) throw new Error('isolated TEST_DATABASE_URL required');

  const adminSql = postgres(url, { max: 1, prepare: false, ssl: false });
  const anonUrl = url.replace('postgres@', 'anon@');
  const anonSql = postgres(anonUrl, { max: 1, prepare: false, ssl: false });

  try {
    // Seed workout logs
    await adminSql`
      INSERT INTO solitary_athlete.workout_logs (user_id, username, log_date, has_photo, memo, verification_count)
      VALUES
        ('1001', '하루', '2026-10-14', true, '러닝 5km', 1),
        ('1002', '바람', '2026-10-13', false, '스트레칭', 1),
        ('1001', '하루', '2025-10-14', false, '작년 기록', 1)
      ON CONFLICT (user_id, log_date) DO NOTHING
    `;

    // Seed secrets
    // 1. Currently active secret: issued now, active for 7 days, expires in 8 days
    await adminSql`
      INSERT INTO solitary_athlete.channel_access_secrets (secret_code, issued_at, active_until, expires_at)
      VALUES ('mukmuk-active', now(), now() + interval '7 days', now() + interval '8 days')
      ON CONFLICT (secret_code) DO NOTHING
    `;

    // 2. Secret in grace period: active ended 12 hours ago, but expires in 12 hours (within 24h grace)
    await adminSql`
      INSERT INTO solitary_athlete.channel_access_secrets (secret_code, issued_at, active_until, expires_at)
      VALUES ('mukmuk-grace', now() - interval '7 days 12 hours', now() - interval '12 hours', now() + interval '12 hours')
      ON CONFLICT (secret_code) DO NOTHING
    `;

    // 3. Fully expired secret: expired 2 hours ago
    await adminSql`
      INSERT INTO solitary_athlete.channel_access_secrets (secret_code, issued_at, active_until, expires_at)
      VALUES ('mukmuk-expired', now() - interval '9 days', now() - interval '2 days', now() - interval '2 hours')
      ON CONFLICT (secret_code) DO NOTHING
    `;

    // Test 1: Direct SELECT by anon on workout_logs MUST be denied (permission denied)
    let directSelectFailed = false;
    try {
      await anonSql`SELECT * FROM solitary_athlete.workout_logs`;
    } catch (err: any) {
      directSelectFailed = true;
      assert(err.code === '42501', `Expected permission denied (42501), got ${err.code}`);
    }
    assert(directSelectFailed, 'Direct SELECT on workout_logs by anon role must be denied');

    // Test 2: RPC with valid active secret returns current year logs (2026)
    const activeLogs = await anonSql`
      SELECT * FROM solitary_athlete.get_workout_logs('mukmuk-active', 2026)
    `;
    assert(activeLogs.some((r: any) => r.user_id === '1001' && r.username === '하루'), 'Seeded user 1001 must be present');
    assert(activeLogs.some((r: any) => r.user_id === '1002' && r.username === '바람'), 'Seeded user 1002 must be present');
    assert(!activeLogs.some((r: any) => r.memo === '작년 기록'), '2025 memo must not be in 2026 results');

    // Test 3: RPC with secret code in 24h grace period succeeds
    const graceLogs = await anonSql`
      SELECT * FROM solitary_athlete.get_workout_logs('mukmuk-grace', 2026)
    `;
    assert(graceLogs.some((r: any) => r.user_id === '1001'), 'Grace period secret must succeed');

    // Test 4: RPC with expired secret raises exception
    let expiredFailed = false;
    try {
      await anonSql`
        SELECT * FROM solitary_athlete.get_workout_logs('mukmuk-expired', 2026)
      `;
    } catch (err: any) {
      expiredFailed = true;
      assert(err.message.includes('invalid_or_expired_secret'), 'Error should be invalid_or_expired_secret');
    }
    assert(expiredFailed, 'Expired secret must be rejected');

    // Test 5: RPC with completely invalid secret raises exception
    let invalidFailed = false;
    try {
      await anonSql`
        SELECT * FROM solitary_athlete.get_workout_logs('mukmuk-nonexistent', 2026)
      `;
    } catch (err: any) {
      invalidFailed = true;
      assert(err.message.includes('invalid_or_expired_secret'), 'Error should be invalid_or_expired_secret');
    }
    assert(invalidFailed, 'Invalid secret must be rejected');

    // Test 6: Year filtering works
    const logs2025 = await anonSql`
      SELECT * FROM solitary_athlete.get_workout_logs('mukmuk-active', 2025)
    `;
    assert(logs2025.length === 1 && logs2025[0].memo === '작년 기록', 'Year filter must return only 2025 logs');

  } finally {
    await adminSql.end();
    await anonSql.end();
  }
});
