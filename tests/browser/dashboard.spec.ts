import { test, expect, type Page } from '@playwright/test';

const today = '2026-10-14';
const dangerous = '<img src=x onerror="window.attacked=true">';
const logs = Array.from({ length: 45 }, (_, n) => ({ user_id: n % 2 ? '2' : '1',
  username: n % 2 ? '하루' : dangerous,
  log_date: new Date(Date.UTC(2026, 9, 14 - Math.floor(n / 2))).toISOString().slice(0, 10),
  memo: n === 0 ? dangerous : (n === 1 ? '' : '가볍게 30분 걷기\n스트레칭'),
  has_photo: n < 2, verification_count: 1,
}));

async function fixture(page: Page, mode: 'normal' | 'empty' | 'error' | 'more-error' = 'normal') {
  await page.clock.install({ time: new Date('2026-10-14T09:00:00Z') });
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    const offset = Number(url.searchParams.get('offset') ?? 0);
    if (mode === 'error' || (mode === 'more-error' && offset >= 30)) {
      await route.fulfill({ status: 503, json: { message: 'unavailable' } }); return;
    }
    if (url.pathname.endsWith('sync_status')) {
      await route.fulfill({ json: [{ last_success_at: '2026-10-14T08:17:00Z' }] }); return;
    }
    const uid = url.searchParams.get('user_id')?.replace('eq.', '');
    const list = mode === 'empty' ? [] : logs.filter(r => !uid || uid === r.user_id);
    await route.fulfill({ json: list.slice(offset, offset + Number(url.searchParams.get('limit') ?? 1000)) });
  });
  await page.goto('./');
}

test('photo grass, safe text, all-history stats and member filtering', async ({ page }) => {
  await fixture(page);
  await expect(page.getByRole('heading', { name: '오늘도 묵묵히, 잔디 한 칸.' })).toBeVisible();
  const cards = page.locator('.workout-card');
  await expect(cards).toHaveCount(2);
  await expect(cards.first().locator('.grass-cell[data-date]')).toHaveCount(84);
  await expect(cards.first().locator(`[data-date="${today}"]`)).toHaveAttribute('data-level', '2');
  await expect(page.locator('#app img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { attacked?: boolean }).attacked)).toBeUndefined();
  await page.getByRole('button', { name: '하루', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(page.locator('.timeline-item')).toHaveCount(22);
  await expect(page.getByRole('button', { name: '하루', exact: true })).toBeFocused();
  await expect(page.locator('.timeline-item').first()).toContainText('사진 인증');
});

test('one tab stop per grass grid and keyboard date detail with focus restoration', async ({ page }) => {
  await fixture(page);
  const card = page.locator('.workout-card').first();
  await expect(card.locator('.grass-cell[tabindex="0"]')).toHaveCount(1);
  const cell = card.locator(`[data-date="${today}"]`);
  await cell.focus(); await page.keyboard.press('ArrowLeft');
  await expect(card.locator('[data-date="2026-10-07"]')).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(card.locator('.date-detail')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(card.locator('.date-detail')).toBeHidden();
  await expect(card.locator('[data-date="2026-10-07"]')).toBeFocused();
  const monday = card.locator('[data-date="2026-10-12"]');
  await monday.focus(); await page.keyboard.press('ArrowUp');
  await expect(monday).toBeFocused();
});

test('successful pagination appends older days and removes the exhausted control', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.locator('.timeline-item')).toHaveCount(45);
  await expect(page.getByRole('button', { name: '더 보기', exact: true })).toHaveCount(0);
});

test('loads more without losing the existing timeline when the next request fails', async ({ page }) => {
  await fixture(page, 'more-error');
  await expect(page.locator('.timeline-item')).toHaveCount(30);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.getByText('나머지 기록을 불러오지 못했어요.')).toBeVisible();
  await expect(page.locator('.timeline-item')).toHaveCount(30);
  await expect(page.getByRole('button', { name: '다시 시도' })).toBeVisible();
});

test('empty state and failure are distinct and retry succeeds', async ({ page }) => {
  await fixture(page, 'error');
  await expect(page.getByText('기록을 불러오지 못했어요.')).toBeVisible();
  await expect(page.getByText('첫 잔디를 기다리고 있어요.')).toHaveCount(0);
  await page.unroute('**/rest/v1/**');
  await page.route('**/rest/v1/**', r => r.fulfill({ json: [] }));
  await page.getByRole('button', { name: '다시 불러오기' }).click();
  await expect(page.getByText('첫 잔디를 기다리고 있어요.')).toBeVisible();
  await expect(page.getByText('아직 인증을 수집하지 않았어요.')).toBeVisible();
});

for (const width of [320, 360, 768, 1280]) {
  test(`responsive layout at ${width}px with long names and touch detail`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await fixture(page);
    await expect(page.locator('.workout-card').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cell = page.locator('.workout-card').first().locator(`[data-date="${today}"]`);
    await cell.click();
    await expect(page.locator('.workout-card').first().locator('.date-detail')).toBeVisible();
    await page.getByRole('button', { name: '날짜 상세 닫기' }).click();
    await page.screenshot({ path: `test-results/dashboard-${width}.png`, fullPage: true });
  });
}

test('supports 200 percent text scaling without a page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 }); await fixture(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await expect(page.getByRole('button', { name: '전체 멤버' })).toBeVisible();
});
