import { test, expect, type Page } from '@playwright/test';

const today = '2026-10-14';
const dangerous = '<img src=x onerror="window.attacked=true">';
const logs = Array.from({ length: 45 }, (_, n) => ({
  user_id: n < 35 ? '2' : '1',
  username: n < 35 ? '하루' : dangerous,
  log_date: new Date(Date.UTC(2026, 9, 14 - n)).toISOString().slice(0, 10),
  memo: n === 0 ? '' : (n === 35 ? dangerous : '가볍게 30분 걷기\n스트레칭'),
  has_photo: n < 2,
  verification_count: 1,
}));

async function fixture(
  page: Page,
  mode: 'normal' | 'empty' | 'error' | 'invalid-secret' = 'normal',
  provideSecret = true
) {
  await page.clock.install({ time: new Date('2026-10-14T09:00:00Z') });
  if (provideSecret) {
    await page.addInitScript(() => {
      localStorage.setItem('mukmuk_secret_code', 'test-code');
    });
  }
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('sync_status')) {
      await route.fulfill({ json: [{ last_success_at: '2026-10-14T08:17:00Z' }] });
      return;
    }
    if(url.pathname.endsWith('rpc/get_dashboard_members')) {
      await route.fulfill({json:mode==='empty'?[]:[{user_id:'1',username:dangerous},{user_id:'2',username:'하루'},{user_id:'3',username:'과거 전용'}]});return;
    }
    if (url.pathname.endsWith('rpc/get_workout_logs_page')) {
      if (mode === 'error') {
        await route.fulfill({ status: 503, json: { message: 'unavailable' } });
        return;
      }
      if (mode === 'invalid-secret') {
        await route.fulfill({ status: 400, json: { message: 'invalid_or_expired_secret' } });
        return;
      }
      const year=route.request().postDataJSON()?.p_year ?? 2026;
      const annualLogs=year===2025?[{...logs[0],log_date:'2025-01-02',memo:'작년 운동'}]:logs.filter(l=>l.log_date.startsWith(String(year)));
      const list = mode === 'empty' ? [] : annualLogs;
      await route.fulfill({ json: list });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto('./');
}

test('photo grass, safe text, all-history stats, 5 KPIs, and member filtering', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('.brand-name')).toHaveText('고독한 운동가');
  await expect(page.locator('.brand-sub')).toHaveText('운동기록을 챙기는 묵묵, MUKMUK · WORKOUT JOURNAL');

  const kpiCards = page.locator('.kpi-card');
  await expect(kpiCards).toHaveCount(5);
  await expect(page.locator('.timeline')).toBeHidden();

  const cards = page.locator('.workout-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.grass-cell[data-date]')).toHaveCount(365);
  await expect(cards.first().locator(`[data-date="${today}"]`)).toHaveAttribute('data-count', '1');
  await expect(page.locator('#app img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { attacked?: boolean }).attacked)).toBeUndefined();

  await page.getByRole('button', { name: '하루', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator(`[data-date="${today}"]`)).toHaveAttribute('data-level','2');
  await expect(page.locator('.kpi-section')).toBeHidden();
  await expect(page.locator('.timeline')).toBeVisible();
  await expect(page.locator('.timeline-item')).toHaveCount(30);
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
  const monday = card.locator('[data-date="2026-10-11"]');
  await monday.focus(); await page.keyboard.press('ArrowUp');
  await expect(monday).toBeFocused();
});

test('successful pagination appends older days and removes the exhausted control', async ({ page }) => {
  await fixture(page);
  await page.getByRole('button', { name: '하루', exact: true }).click();
  await expect(page.locator('.timeline-item')).toHaveCount(30);
  await page.getByRole('button', { name: '더 보기', exact: true }).click();
  await expect(page.locator('.timeline-item')).toHaveCount(35);
  await expect(page.getByRole('button', { name: '더 보기', exact: true })).toHaveCount(0);
});

test('secret code modal requires code and unlocks dashboard', async ({ page }) => {
  await fixture(page, 'normal', false);
  const modal = page.locator('.modal-box');
  await expect(modal).toBeVisible();
  await expect(page.locator('.workout-card')).toHaveCount(0);
  await page.locator('.modal-input').fill('test-code');
  await page.getByRole('button', { name: '확인' }).click();
  await expect(modal).toBeHidden();
  await expect(page.locator('.workout-card')).toHaveCount(1);
});

test('URL code parameter automatically stores code and cleans URL', async ({ page }) => {
  await page.clock.install({ time: new Date('2026-10-14T09:00:00Z') });
  await page.route('**/rest/v1/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('sync_status')) {
      await route.fulfill({ json: [{ last_success_at: '2026-10-14T08:17:00Z' }] });
      return;
    }
    if (url.pathname.endsWith('rpc/get_workout_logs_page')) {
      await route.fulfill({ json: logs });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto('./?code=mukmuk-query&from=discord#grass');
  await expect(page.locator('.workout-card')).toHaveCount(1);
  const stored = await page.evaluate(() => localStorage.getItem('mukmuk_secret_code'));
  expect(stored).toBe('mukmuk-query');
  expect(page.url()).not.toContain('code=');
  expect(page.url()).toContain('from=discord');
  expect(page.url()).toContain('#grass');
});

test('invalid secret code shows error message in modal', async ({ page }) => {
  await fixture(page, 'invalid-secret', true);
  await expect(page.locator('.modal-error')).toHaveText('시크릿 코드가 올바르지 않거나 만료되었습니다.');
  const stored = await page.evaluate(() => localStorage.getItem('mukmuk_secret_code'));
  expect(stored).toBeNull();
});

test('empty state and failure are distinct and retry succeeds', async ({ page }) => {
  await fixture(page, 'error');
  await expect(page.getByText('기록을 불러오지 못했어요.')).toBeVisible();
  await expect(page.getByText('첫 잔디를 기다리고 있어요.')).toHaveCount(0);
  await page.unroute('**/rest/v1/**');
  await page.route('**/rest/v1/**', r => {
    const url = new URL(r.request().url());
    if (url.pathname.endsWith('rpc/get_workout_logs_page')) {
      return r.fulfill({ json: [] });
    }
    return r.fulfill({ json: [] });
  });
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

test('switches full calendar years while preserving selected member and keyboard entry',async({page})=>{
  await fixture(page);
  const card=page.locator('.workout-card');
  await expect(card.locator('[data-date="2026-01-01"]')).toHaveCount(1);
  await expect(card.locator('[data-date="2026-12-31"]')).toBeDisabled();
  await page.getByRole('button',{name:'하루',exact:true}).click();
  const request=page.waitForRequest(r=>r.url().includes('/rpc/get_workout_logs_page') && r.postDataJSON()?.p_year===2025);
  await page.getByRole('button',{name:'2025년',exact:true}).click();
  await request;
  await expect(page.getByRole('button',{name:'하루',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(card.locator('[data-date="2025-01-01"]')).toHaveCount(1);
  await expect(card.locator('[data-date="2025-12-31"]')).toHaveAttribute('tabindex','0');
  await expect(card.locator('[data-date="2025-01-02"]')).toHaveAttribute('data-level','2');
  await expect(page.locator('.timeline')).toContainText('작년 운동');
  await page.getByRole('button',{name:'2024년',exact:true}).click();
  await expect(card.locator('.grass-cell[data-date]')).toHaveCount(366);
  await expect(card.locator('[data-date="2024-02-29"]')).toHaveCount(1);
  await expect(card.locator('.grass-cell[tabindex="0"]')).toHaveCount(1);
});

test('keeps current-month KPIs while viewing a past year and expands older years',async({page})=>{
  await fixture(page);
  const values=await page.locator('.kpi-value').allTextContents();
  await page.getByRole('button',{name:'2025년',exact:true}).click();
  await expect(page.locator('.workout-card').first()).toContainText('2025년 · 1월 1일 — 12월 31일');
  expect(await page.locator('.kpi-value').allTextContents()).toEqual(values);
  await page.getByRole('button',{name:'이전 연도 더 보기'}).click();
  await expect(page.getByRole('button',{name:'2021년',exact:true})).toBeVisible();
});

test('ignores a slower response for a previously selected year',async({page})=>{
  await fixture(page);
  let release!:()=>void;
  const gate=new Promise<void>(resolve=>{release=resolve;});
  await page.route('**/rpc/get_workout_logs_page',async route=>{
    const year=route.request().postDataJSON().p_year;
    if(year===2025)await gate;
    await route.fulfill({json:[{...logs[0],log_date:`${year}-01-02`,memo:`${year} 기록`}]});
  });
  const pending=page.waitForRequest(r=>r.url().includes('rpc/get_workout_logs_page') && r.postDataJSON().p_year===2025);
  await page.getByRole('button',{name:'2025년',exact:true}).click();await pending;
  await page.getByRole('button',{name:'2024년',exact:true}).click();
  await expect(page.locator('.workout-card').first()).toContainText('2024년 · 1월 1일 — 12월 31일');
  const settled=page.waitForResponse(r=>r.url().includes('rpc/get_workout_logs_page') && r.request().postDataJSON().p_year===2025);
  release();await settled;
  await expect(page.locator('.workout-card').first()).toContainText('2024년 · 1월 1일 — 12월 31일');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
});

test('reveals today automatically without stealing focus, then reveals selected date and detail',async({page})=>{
  await page.setViewportSize({width:360,height:600});await fixture(page);
  const card=page.locator('.workout-card');
  const cell=card.locator(`[data-date="${today}"]`),scroll=card.locator('.grass-scroll');
  await expect(async()=>{
    const a=await cell.boundingBox(),b=await scroll.boundingBox();
    expect(a!.x).toBeGreaterThanOrEqual(b!.x);expect(a!.x+a!.width).toBeLessThanOrEqual(b!.x+b!.width);
  }).toPass();
  await expect(cell).not.toBeFocused();
  await cell.click();
  const title=card.locator('.detail-heading h4');
  await expect(title).toBeFocused();await expect(title).toBeInViewport();
  await page.getByRole('button',{name:'날짜 상세 닫기'}).click();await expect(cell).toBeFocused();
  await scroll.evaluate(e=>{e.scrollLeft=0;});
  await card.getByRole('button',{name:'오늘 날짜로 이동'}).click();
  await expect(cell).toBeFocused();
  const a=await cell.boundingBox(),b=await scroll.boundingBox();expect(a!.x).toBeGreaterThanOrEqual(b!.x);
});

 test('all-history roster keeps the denominator stable and date detail below the graph',async({page})=>{
 await fixture(page);
 const cell=page.locator(`[data-date="${today}"]`);
 await expect(cell).toHaveAttribute('data-count','1');
 await expect(cell).toHaveAttribute('aria-label',/전체 3명 중 1명 운동/);
 await cell.click();
 await expect(page.locator('.date-detail')).toContainText('사진 포함 1명');
 const detail=await page.locator('.date-detail').boundingBox(),graph=await page.locator('.grass-scroll').boundingBox();
 expect(detail!.y).toBeGreaterThan(graph!.y+graph!.height);
 await page.getByRole('button',{name:'날짜 상세 닫기'}).click();
 await page.getByRole('button',{name:'과거 전용',exact:true}).click();
 await expect(page.locator('.workout-card')).toContainText('과거 전용');
 await expect(page.locator('.grass-cell[data-level="1"]')).toHaveCount(0);
 });

for(const width of [360,1280])test(`workout king is first and spans mobile row at ${width}`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page);
 const cards=page.locator('.kpi-card');await expect(cards).toHaveCount(5);
 await expect(cards.first().locator('.kpi-title')).toHaveText('운동왕 👑');
 await expect(cards.first()).toHaveText('운동왕 👑하루');
 const first=await cards.nth(0).boundingBox(),next=await cards.nth(1).boundingBox(),section=await page.locator('.kpi-section').boundingBox();
 if(width===360){expect(first!.width).toBeCloseTo(section!.width);expect(next!.y).toBeGreaterThan(first!.y);}
 else {expect(first!.y).toBe(next!.y);expect(first!.x).toBeLessThan(next!.x);}
});

test('all joint workout king nicknames remain visible without page overflow',async({page})=>{
 await page.setViewportSize({width:320,height:800});await fixture(page);
 const many=Array.from({length:50},(_,i)=>({...logs[0],user_id:String(100000000000000000n+BigInt(i)),username:`공동 운동가 ${i}`}));
 await page.route('**/rpc/get_workout_logs_page',r=>r.fulfill({json:many}));
 await page.route('**/rpc/get_dashboard_members',r=>r.fulfill({json:many.map(l=>({user_id:l.user_id,username:l.username}))}));
 await page.reload();
 const king=page.locator('.kpi-card').first();await expect(king).not.toContainText('ID:');await expect(king).not.toContainText('공동 운동왕');
 await expect(king.locator('.king-member')).toHaveCount(50);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('mobile year select preserves member and search finds hidden same-name members',async({page})=>{
 await page.setViewportSize({width:360,height:900});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await page.getByLabel('연도', {exact:true}).selectOption('2025');
 await expect(page.locator('.workout-card')).toContainText('2025년');
 await expect(page.getByRole('button',{name:'하루',exact:true})).toHaveAttribute('aria-pressed','true');
 await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();
 const search=page.getByLabel('멤버 이름 검색');await expect(search).toBeFocused();
 await search.fill('과거');await page.getByRole('dialog').getByRole('button',{name:/과거 전용/}).click();
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.locator('.workout-card')).toContainText('과거 전용');
 await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();await search.fill('없는이름');
 await expect(page.getByRole('dialog')).toContainText('일치하는 멤버가 없어요.');
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'멤버 찾기',exact:true})).toBeFocused();
});

test('uses Sunday-first contribution rows and Sunday-based week stats',async({page})=>{
 await fixture(page);
 await expect(page.locator('.weekday-labels span')).toHaveText(['일','월','화','수','목','금','토']);
 const row=await page.locator('[data-date="2026-01-01"]').evaluate(e=>Array.from(e.parentElement!.children).indexOf(e)%7);
 expect(row).toBe(4);
});

test('weekday labels stay visible after automatic horizontal centering',async({page})=>{
 await page.setViewportSize({width:360,height:800});await fixture(page);
 await page.locator('.grass-scroll').scrollIntoViewIfNeeded();
 await expect(page.locator('.weekday-labels')).toBeInViewport();
 const labels=await page.locator('.weekday-labels').boundingBox(),scroll=await page.locator('.grass-scroll').boundingBox();
 expect(labels!.x).toBeGreaterThanOrEqual(scroll!.x);
});

test('search exposes overflow and distinguishes same names by ID',async({page})=>{
 await fixture(page);
 const many=Array.from({length:60},(_,i)=>({user_id:String(1000+i),username:i<2?'동명':`운동가 ${i} 이름이 긴 멤버`}));
 await page.route('**/rpc/get_dashboard_members',r=>r.fulfill({json:many}));await page.reload();
 await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();
 await page.getByLabel('멤버 이름 검색').fill('동명');
 const dialog=page.getByRole('dialog');await expect(dialog.getByRole('button',{name:/동명/})).toHaveCount(2);
 await dialog.getByRole('button',{name:'동명 · ID: 1001',exact:true}).click();
 await expect(page.locator('.member-options [data-member-id="1001"]')).toHaveAttribute('aria-pressed','true');
 await expect(page.locator('.workout-card')).toContainText('동명');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('desktop member chips stay within two rows even when first name wraps',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 await page.setViewportSize({width:768,height:900});await fixture(page);
 const people=Array.from({length:30},(_,i)=>({user_id:String(1000+i),username:i===0?'가'.repeat(90):`나 운동가 ${i}`}));
 await page.route('**/rpc/get_dashboard_members',r=>r.fulfill({json:people}));await page.reload();
 await expect(page.getByRole('button',{name:'멤버 찾기',exact:true})).toBeVisible();
 await expect(async()=>{
 const rows=await page.locator('.member-options button:visible').evaluateAll(nodes=>new Set(nodes.map(n=>n.getBoundingClientRect().top)).size);
 expect(rows).toBeLessThanOrEqual(2);
 }).toPass();
 await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
 expect(errors.filter(e=>e.includes('ResizeObserver'))).toEqual([]);
});

test('aggregate detail preserves 51 actual people and photo count past opacity saturation',async({page})=>{
 await fixture(page);
 const many=Array.from({length:51},(_,i)=>({...logs[0],user_id:String(1000+i),username:`멤버 ${i}`,has_photo:i<2}));
 await page.route('**/rpc/get_dashboard_members',r=>r.fulfill({json:many.map(l=>({user_id:l.user_id,username:l.username}))}));
 await page.route('**/rpc/get_workout_logs_page',r=>r.fulfill({json:many}));await page.reload();
 const cell=page.locator(`[data-date="${today}"]`);await expect(cell).toHaveAttribute('data-count','51');
 await cell.click();await expect(page.locator('.date-detail')).toContainText('전체 51명 중 51명 운동 · 사진 포함 2명');
 await expect(page.locator('.aggregate-entry')).toHaveCount(51);
});
