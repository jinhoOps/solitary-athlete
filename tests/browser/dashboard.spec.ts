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
  provideSecret = true,
  preview = false,
  at = '2026-10-14T09:00:00Z'
) {
  await page.clock.install({ time: new Date(at) });
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
      await route.fulfill({json:mode==='empty'?[]:[{user_id:'1',username:preview?'산책하는 고운':dangerous},{user_id:'2',username:'하루'},{user_id:'3',username:'과거 전용'}]});return;
    }
    if(url.pathname.endsWith('rpc/get_monthly_grass_participation')) {
      const month=route.request().postDataJSON().p_month.slice(0,7);
      const count=mode==='empty'?0:1,days=mode==='empty'?0:14;
      await route.fulfill({json:[{month_start:`${month}-01`,collected_at:`${month}-14T08:17:00Z`,member_count:count,workout_days:days,elapsed_days:14,
       previous_collected_at:`${month}-13T14:55:00Z`,previous_member_count:count,previous_workout_days:mode==='empty'?0:12,previous_elapsed_days:13}]});return;
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
      await route.fulfill({ json: preview?list.map((log,i)=>({...log,username:log.user_id==='2'?'하루':'산책하는 고운',memo:i===0?'등 운동 40분. 오늘도 한 칸.':i%3===0?'퇴근하고 천천히 3km 달리기':'가볍게 30분 걷기\n마무리 스트레칭'})):list });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.goto('./');
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  // Initial reveal and ResizeObserver both schedule layout work on animation frames.
  await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
}

test('photo grass, safe text, all-history stats, 5 KPIs, and member filtering', async ({ page }) => {
  await fixture(page);
  await expect(page.locator('.brand-name')).toHaveText('고독한 운동가');
  await expect(page.locator('.brand-sub')).toHaveText('묵묵 · 운동 기록');

  const discordLink = page.locator('.brand-header .discord-link');
  await expect(discordLink).toBeVisible();
  await expect(discordLink).toHaveAttribute('aria-label', 'Discord 채널 열기');
  await expect(discordLink.locator('svg')).toBeVisible();

  const status = page.locator('.brand-header .status-notice');
  await expect(status).toBeVisible();
  await expect(status).toContainText('마지막 수집');

  const kpiCards = page.locator('.kpi-card');
  await expect(kpiCards).toHaveCount(5);
  await expect(page.locator('.timeline')).toBeHidden();

  const cards = page.locator('.workout-card');
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator('.grass-cell[data-date]')).toHaveCount(365);
  await expect(cards.first().locator(`[data-date="${today}"]`)).toHaveAttribute('data-count', '1');
  await expect(cards.first().locator('.metrics')).toContainText('누적');
  await expect(cards.first().locator('.metrics')).not.toContainText('인일');
  await expect(cards.first().getByRole('button', { name: '오늘 날짜로 이동' })).toHaveCount(0);
  await expect(page.locator('#app img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => (window as unknown as { attacked?: boolean }).attacked)).toBeUndefined();

  await page.getByRole('button', { name: '하루', exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards.first().locator(`[data-date="${today}"]`)).toHaveAttribute('data-level','2');
  await expect(page.locator('.kpi-section')).toBeHidden();
  await expect(page.locator('.timeline')).toBeVisible();
  await expect(page.locator('.timeline-item')).toHaveCount(30);
  await expect(page.getByRole('button', { name: '하루', exact: true })).toBeFocused();
  await expect(page.locator('.timeline-item').first().getByRole('button',{name:'사진 보기',exact:true})).toBeVisible();
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

for (const width of [320,360,768,1280]) test(`supports 200 percent text scaling at ${width}px in details and timeline`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await fixture(page);
  await page.addStyleTag({ content: 'html { font-size: 200%; }' });
  const fits=()=>page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  expect(await fits()).toBe(true);
  const cell=page.locator(`[data-date="${today}"]`);
  await cell.focus();await cell.press('Enter');
  await expect(page.locator('.date-detail')).toBeVisible();expect(await fits()).toBe(true);
  await page.getByRole('button',{name:'하루',exact:true}).click();
  await expect(page.locator('.timeline-item').first()).toBeVisible();expect(await fits()).toBe(true);
  await page.screenshot({path:`test-results/dashboard-${width}-text-200.png`});
});

test('year stepper displays 2026, disables next button for future, and shows inception dialog on previous button',async({page})=>{
  await fixture(page);
  const stepper=page.locator('.year-stepper');
  await expect(stepper).toBeVisible();
  await expect(stepper.locator('.year-label')).toHaveText('2026년');
  
  // Next button is disabled because 2026 is current year
  const nextBtn=stepper.getByRole('button',{name:'다음 연도'});
  await expect(nextBtn).toBeDisabled();
  
  // Previous button triggers inception dialog
  const prevBtn=stepper.getByRole('button',{name:'이전 연도'});
  await expect(prevBtn).toBeEnabled();
  await prevBtn.click();
  
  const dialog=page.locator('.inception-dialog');
  await expect(dialog).toBeVisible();
  const character=dialog.locator('img.inception-character');
  await expect(character).toBeVisible();
  await expect(character).toHaveAttribute('alt','묵묵');
  await expect(dialog).toContainText('고독한 운동가(#오운완) 채널은 2026년 10월 14일에 생성되었어요. 그 이전에는 남겨 둔 기록이 없어요.');
  await expect(dialog).toContainText('오늘도 묵묵히, 잔디 한 칸.');
  
  // Close with confirm button and verify focus restoration
  await dialog.getByRole('button',{name:'확인',exact:true}).click();
  await expect(dialog).toBeHidden();
  await expect(prevBtn).toBeFocused();

  // Re-open and verify Escape key closes dialog
  await prevBtn.click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(prevBtn).toBeFocused();
});

test('keeps 2026 dashboard stable while viewing members and preserves active states',async({page})=>{
  await fixture(page);
  const values=await page.locator('.kpi-value').allTextContents();
  await page.getByRole('button',{name:'하루',exact:true}).click();
  await expect(page.locator('.workout-card .year-label')).toHaveText('2026년');
  expect(await page.locator('.kpi-value').allTextContents()).toEqual(values);
  await expect(page.getByRole('button',{name:'하루',exact:true})).toHaveAttribute('aria-pressed','true');
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
  await expect(card.getByRole('button',{name:'오늘 날짜로 이동'})).toHaveCount(0);
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
 await expect(page.locator('.grass-grid')).toHaveAttribute('aria-label', /과거 전용의/);
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

test('mobile year stepper triggers inception dialog on older navigation and preserves member search',async({page})=>{
 await page.setViewportSize({width:360,height:900});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await expect(page.locator('.grass-grid')).toHaveAttribute('aria-label', /하루의/);

 const prevBtn=page.getByRole('button',{name:'이전 연도'});
 await prevBtn.click();
 const dialog=page.locator('.inception-dialog');
 await expect(dialog).toBeVisible();
 await expect(dialog).toContainText('2026년 10월 14일');
 await dialog.getByRole('button',{name:'확인',exact:true}).click();
 await expect(dialog).toBeHidden();
 await expect(page.locator('.year-label')).toHaveText('2026년');
 await expect(page.getByRole('button',{name:'하루',exact:true})).toHaveAttribute('aria-pressed','true');

 await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();
 const search=page.getByLabel('멤버 이름 검색');await expect(search).toBeFocused();
 await search.fill('과거');await page.getByRole('dialog').getByRole('button',{name:/과거 전용/}).click();
 await expect(page.getByRole('dialog')).toBeHidden();
 await expect(page.locator('.grass-grid')).toHaveAttribute('aria-label', /과거 전용의/);
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
 await expect(page.locator('.grass-grid')).toHaveAttribute('aria-label', /동명의/);
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

test('photos stay unloaded until requested and full image loads only after click', async ({page})=>{
 let lookups=0,previews=0,full=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{
  lookups++;
  expect(route.request().postDataJSON()).toMatchObject({user_id:'2',date:today,code:'test-code'});
  await route.fulfill({json:{photos:[{id:'200',preview:'https://media.discordapp.net/attachments/20/200/a.webp',url:'https://cdn.discordapp.com/attachments/20/200/a.jpg',original:'https://discord.com/channels/10/20/100',width:800,height:600}],next:null}});
 });
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.route('https://media.discordapp.net/**',async route=>{previews++;await route.fulfill({body:image,contentType:'image/png'});});
 await page.route('https://cdn.discordapp.com/**',async route=>{full++;await route.fulfill({body:image,contentType:'image/png'});});
 await fixture(page);
 expect(lookups).toBe(0);expect(previews).toBe(0);expect(full).toBe(0);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await expect(page.locator('.grass-grid')).toHaveAttribute('aria-label', /하루의/);
 expect(lookups).toBe(0);
 await page.locator(`[data-date="${today}"]`).click();
 const photos=page.locator('.date-detail .photo-section');
 expect(lookups).toBe(0);
 await photos.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(photos.locator('img')).toBeVisible();
 await expect.poll(()=>previews).toBe(1);expect(full).toBe(0);
 const opener=photos.getByRole('button',{name:'사진 1 크게 보기'});
 await opener.click();await expect(page.getByRole('dialog')).toBeVisible();
 await expect.poll(()=>full).toBe(1);
 await page.keyboard.press('Escape');await expect(page.getByRole('dialog')).toHaveCount(0);
 await expect(opener).toBeFocused();
});

test('photo query failure has retry and does not erase exercise details',async({page})=>{
 let calls=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{calls++;await route.fulfill(calls===1?{status:502,json:{error:'photos_unavailable'}}:{json:{photos:[],next:null}});});
 await fixture(page);await page.locator(`[data-date="${today}"]`).click();
 const photos=page.locator('.date-detail .photo-section');
 await photos.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(photos).toContainText('사진을 불러오지 못했어요');
 await photos.getByRole('button',{name:'다시 불러오기'}).click();
 await expect(photos).toContainText('표시할 사진이 없어요');
 await expect(page.locator('.date-detail')).toContainText('하루');
});

test('photo fallback has no automatic original download and fits mobile',async({page})=>{
 await page.setViewportSize({width:320,height:740});let images=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>route.fulfill({json:{photos:[{id:'200',preview:null,url:'https://cdn.discordapp.com/attachments/20/200/a.jpg',original:'https://discord.com/channels/10/20/100'}],next:null}}));
 page.on('request',r=>{if(r.url().includes('cdn.discordapp.com'))images++;});
 await fixture(page);await page.locator(`[data-date="${today}"]`).click();
 await page.locator('.photo-section').getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(page.getByRole('button',{name:'사진 1 크게 보기'})).toBeVisible();expect(images).toBe(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});

test('closing details discards a late photo response',async({page})=>{
 let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{await gate;await route.fulfill({json:{photos:[],next:null}}).catch(()=>{});});
 await fixture(page);const day=page.locator(`[data-date="${today}"]`);await day.focus();await day.press('Enter');
 await page.locator('.photo-section').getByRole('button',{name:'사진 보기',exact:true}).click();
 await page.getByRole('button',{name:'날짜 상세 닫기'}).click();finish();
 await expect(page.locator('.date-detail')).toBeHidden();
 await expect(page.locator('.photo-dialog')).toHaveCount(0);
 await expect(page.locator(`[data-date="${today}"]`)).toBeFocused();
});

test('offscreen photo previews wait for viewport entry',async({page})=>{
 await page.setViewportSize({width:360,height:640});let downloads=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>route.fulfill({json:{photos:Array.from({length:20},(_,i)=>({id:String(200+i),preview:`https://media.discordapp.net/attachments/20/${200+i}/a.webp`,url:`https://cdn.discordapp.com/attachments/20/${200+i}/a.jpg`,original:'https://discord.com/channels/10/20/100',width:800,height:600})),next:null}}));
 await page.route('https://media.discordapp.net/**',async route=>{downloads++;await route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'});});
 await fixture(page);
 // Keyboard activation avoids racing the initial horizontal reveal animation frame.
 const day=page.locator(`[data-date="${today}"]`);
 await day.focus();await day.press('Enter');
 await expect(page.locator('.date-detail')).toBeVisible();
 await page.locator('.photo-section').getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(page.locator('.photo-preview')).toHaveCount(20);
 await page.locator('.photo-preview').first().scrollIntoViewIfNeeded();
 await expect.poll(()=>downloads).toBeGreaterThan(0);expect(downloads).toBeLessThan(20);
 await expect(page.locator('.photo-preview').last()).not.toHaveAttribute('src');
 await page.locator('.photo-preview').last().scrollIntoViewIfNeeded();
 await expect(page.locator('.photo-preview').last()).toHaveAttribute('src',/media.discordapp.net/);
});


test('compact card header and member timeline weekday', async ({page}) => {
 await page.setViewportSize({width:375,height:812});
 await fixture(page);
 const header=page.locator('.workout-card .card-heading');
 await expect(header).toContainText('오늘 · 2026-10-14 KST');
 await expect(header.locator('.year-filter')).toBeVisible();
 await expect(page.getByRole('heading',{name:'연도별 운동 잔디'})).toHaveCount(0);
 await expect(header.locator('h3')).toHaveCount(0);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await expect(page.locator('.date-button').first()).toHaveText('14일 (수)');
 await page.locator('.date-button').first().click();
 await expect(page.locator('.date-detail')).toBeVisible();
 await expect(header.locator('.year-filter')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});


test('monthly conversation loads photos directly and preserves expanded entries on more',async({page})=>{
 let calls=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{calls++;await route.fulfill({json:{photos:[],next:null}});});
 await fixture(page,'normal',true,!!process.env.MUKMUK_CAPTURE_DIR);await page.getByRole('button',{name:'하루',exact:true}).click();
 await expect(page.locator('.timeline-month')).toHaveCount(2);
 await expect(page.locator('.timeline-month').first().getByRole('heading')).toHaveText('2026년 10월');
 await expect(page.locator('.timeline-item')).toHaveCount(30);
 expect(calls).toBe(0);
 if(process.env.MUKMUK_CAPTURE_DIR){
  for(const [label,width,height] of [['desktop',1280,900],['mobile',390,844]] as const){
   await page.setViewportSize({width,height});await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:`${process.env.MUKMUK_CAPTURE_DIR}/${label}-board.png`});
   await page.getByRole('heading',{name:'남겨 둔 운동',exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));
   await page.screenshot({path:`${process.env.MUKMUK_CAPTURE_DIR}/${label}-timeline.png`});
  }
 }
 const first=page.locator('.timeline-item').first();
 await first.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(first).toContainText('표시할 사진이 없어요');
 expect(calls).toBe(1);
 await page.getByRole('button',{name:'더 보기',exact:true}).click();
 await expect(page.locator('.timeline-item')).toHaveCount(35);
 await expect(page.locator('.timeline-month')).toHaveCount(2);
 await expect(first).toContainText('표시할 사진이 없어요');expect(calls).toBe(1);
 await first.getByRole('button',{name:'사진 접기',exact:true}).click();
 await expect(first.locator('.photo-grid')).toBeHidden();
});


test('timeline photo button requests only its record and loads no full image before enlargement',async({page})=>{
 let queries=0,previews=0,originals=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{
  queries++;expect(route.request().postDataJSON()).toMatchObject({user_id:'2',date:today});
  await route.fulfill({json:{photos:[{id:'200',preview:'https://media.discordapp.net/attachments/20/200/a.webp',url:'https://cdn.discordapp.com/attachments/20/200/a.jpg',original:'https://discord.com/channels/10/20/100',width:800,height:600}],next:null}});
 });
 const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64');
 await page.route('https://media.discordapp.net/**',async route=>{previews++;await route.fulfill({body:image,contentType:'image/png'});});
 await page.route('https://cdn.discordapp.com/**',async route=>{originals++;await route.fulfill({body:image,contentType:'image/png'});});
 await fixture(page);await page.getByRole('button',{name:'하루',exact:true}).click();
 expect(queries).toBe(0);expect(previews).toBe(0);
 const item=page.locator('.timeline-item').first();
 await item.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(item.locator('.photo-preview')).toBeVisible();
 await expect.poll(()=>previews).toBe(1);expect(queries).toBe(1);expect(originals).toBe(0);
 await expect(page.locator('.date-detail')).toBeHidden();
 await item.getByRole('button',{name:'사진 1 크게 보기'}).click();
 await expect.poll(()=>originals).toBe(1);
 await page.keyboard.press('Escape');
 await item.getByRole('button',{name:'사진 접기',exact:true}).click();
 await expect(item.locator('.photo-preview')).toHaveCount(0);
});

test('timeline collapse cancels pending photos and a late response cannot reopen them',async({page})=>{
 let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});let calls=0;
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{
  calls++;await gate;await route.fulfill({json:{photos:[],next:null}}).catch(()=>{});
 });
 await fixture(page);await page.getByRole('button',{name:'하루',exact:true}).click();
 const item=page.locator('.timeline-item').first();
 await item.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect.poll(()=>calls).toBe(1);
 await item.getByRole('button',{name:'사진 접기',exact:true}).click();finish();
 await expect(item.locator('.photo-toggle')).toHaveAttribute('aria-expanded','false');
 await expect(item.locator('.photo-controls')).toBeHidden();
 await item.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(item).toContainText('표시할 사진이 없어요');expect(calls).toBe(2);
});


test('failed year reload disposes pending timeline photos immediately',async({page})=>{
 let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{await gate;await route.fulfill({json:{photos:[],next:null}}).catch(()=>{});});
 await fixture(page,'normal',true,false,'2027-01-05T09:00:00Z');
 await page.getByRole('button',{name:'이전 연도',exact:true}).click();
 await expect(page.locator('.year-label')).toHaveText('2026년');
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await page.locator('.timeline-item').first().getByRole('button',{name:'사진 보기',exact:true}).click();
 await page.route('**/rest/v1/rpc/get_workout_logs_page',async route=>route.fulfill({status:503,json:{error:'unavailable'}}));
 await page.getByRole('button',{name:'다음 연도',exact:true}).click();
 await expect(page.locator('.error-state')).toBeVisible();finish();
 await expect(page.locator('.timeline .photo-section')).toHaveCount(0);
});


test('year arrows reveal on desktop hover and keyboard focus, stay visible on mobile',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await fixture(page);
 const stepper=page.locator('.year-stepper'),previous=page.getByRole('button',{name:'이전 연도',exact:true});
 await page.mouse.move(0,0);await expect(previous).toHaveCSS('opacity','0');
 await stepper.hover();await expect(previous).toHaveCSS('opacity','1');
 await page.mouse.move(0,0);await previous.focus();await expect(previous).toHaveCSS('opacity','1');
 await previous.press('Enter');await expect(page.locator('.inception-dialog')).toBeVisible();
 await page.locator('.inception-dialog').getByRole('button',{name:'확인',exact:true}).click();
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'전체 멤버',exact:true}).focus();
 await expect(previous).toHaveCSS('opacity','1');
 await expect(stepper).toHaveCSS('border-top-width','0px');
});

test('grass preview clears after hover and focus leave, and restores a focused date after hover',async({page})=>{
 await fixture(page);
 const preview=page.locator('.grass-preview'),day=page.locator(`[data-date="${today}"]`);
 await expect(preview).toBeEmpty();
 await day.hover();await expect(preview).toContainText(today);
 await page.mouse.move(0,0);await expect(preview).toBeEmpty();
 await day.focus();await expect(preview).toContainText(today);
 const other=page.locator('[data-date="2026-10-13"]');
 await other.hover();await expect(preview).toContainText('2026-10-13');
 await page.mouse.move(0,0);await expect(preview).toContainText(today);
 await page.getByRole('button',{name:'전체 멤버',exact:true}).focus();
 await expect(preview).toBeEmpty();
});

test('grass edge fades follow scroll boundaries, resizing and keyboard navigation',async({page})=>{
 await page.setViewportSize({width:360,height:900});await fixture(page);
 const scroll=page.locator('.grass-scroll'),left=page.locator('.grass-scroll-fade--left'),right=page.locator('.grass-scroll-fade--right');
 await scroll.evaluate(e=>{e.scrollLeft=0;});
 await expect(left).toBeHidden();await expect(right).toBeVisible();
 await scroll.evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
 await expect(left).toBeVisible();await expect(right).toBeVisible();
 const fade=(await left.boundingBox())!,labels=(await page.locator('.weekday-labels').boundingBox())!;
 expect(fade.x).toBeGreaterThanOrEqual(labels.x+labels.width);
 await scroll.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
 await expect(left).toBeVisible();await expect(right).toBeHidden();
 const day=page.locator(`[data-date="${today}"]`);await day.focus();await day.press('ArrowLeft');
 await expect(day).not.toBeFocused();
 await expect(left).toHaveCSS('opacity','0');await expect(right).toHaveCSS('opacity','0');
 await page.getByRole('button',{name:'전체 멤버',exact:true}).focus();
 await expect(left).toHaveCSS('opacity','1');
 // With enough room for all 53 weeks, both fades must disappear without a scroll event.
 await page.addStyleTag({content:'#app { max-width:none; }'});
 await page.setViewportSize({width:1400,height:900});
 await expect(left).toBeHidden();await expect(right).toBeHidden();
 expect(await scroll.evaluate(e=>e.scrollWidth<=e.clientWidth)).toBe(true);
 await page.setViewportSize({width:320,height:900});
 await expect(right).toBeVisible();
});

for(const width of [320,360,768,1280]) test(`grass fades meet the sticky labels and cover only cell rows at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page);
 for(const scale of [100,200]){
  await page.addStyleTag({content:`html { font-size:${scale}%; }`});
  await page.locator('.grass-scroll').evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
  await expect(page.locator('.grass-scroll-fade--left')).toBeVisible();
  await expect(async()=>{
   const labels=(await page.locator('.weekday-labels').boundingBox())!;
   const grid=(await page.locator('.grass-grid').boundingBox())!;
   const months=(await page.locator('.month-labels').boundingBox())!;
   const left=(await page.locator('.grass-scroll-fade--left').boundingBox())!;
   expect(Math.abs(left.x-labels.x-labels.width)).toBeLessThan(1);
   for(const side of ['left','right']){
    const fade=(await page.locator(`.grass-scroll-fade--${side}`).boundingBox())!;
    expect(Math.abs(fade.y-grid.y)).toBeLessThan(1);
    expect(Math.abs(fade.height-grid.height)).toBeLessThan(1);
    expect(fade.y).toBeGreaterThanOrEqual(months.y+months.height);
   }
  }).toPass();
 }
});

test('surface motion respects reduced motion and never delays closing or focus restoration',async({page})=>{
 await page.emulateMedia({reducedMotion:'no-preference'});await fixture(page);
 const day=page.locator(`[data-date="${today}"]`);await day.focus();await day.press('Enter');
 const detail=page.locator('.date-detail');
 expect(await detail.evaluate(e=>getComputedStyle(e).animationName)).not.toBe('none');
 await detail.getByRole('button',{name:'날짜 상세 닫기',exact:true}).click();
 await expect(detail).toBeHidden();await expect(day).toBeFocused();
 await page.emulateMedia({reducedMotion:'reduce'});
 await day.press('Enter');await expect(detail).toHaveCSS('animation-name','none');
 // Opening the detail deliberately focuses its heading on the next layout frame.
 await expect(detail.locator('.detail-heading h4')).toBeFocused();
 const close=detail.getByRole('button',{name:'날짜 상세 닫기',exact:true});
 await close.focus();await expect(close).toHaveCSS('outline-style','solid');
 await expect(close).toHaveCSS('transition-duration',/^0s(?:, 0s)*$/);
 await close.press('Enter');await expect(day).toBeFocused();
 const find=page.getByRole('button',{name:'멤버 찾기',exact:true});await find.click();
 await expect(page.locator('.member-dialog')).toHaveCSS('animation-name','none');
 await page.keyboard.press('Escape');await expect(find).toBeFocused();
 await page.emulateMedia({reducedMotion:'no-preference'});await find.click();
 expect(await page.locator('.member-dialog').evaluate(e=>getComputedStyle(e).animationName)).not.toBe('none');
 await page.keyboard.press('Escape');await expect(find).toBeFocused();
});

test('control feedback preserves the selection and responds immediately while pressed',async({page})=>{
 await page.emulateMedia({reducedMotion:'reduce'});await fixture(page);
 const selected=page.getByRole('button',{name:'전체 멤버',exact:true});
 const selectedColor=await selected.evaluate(e=>getComputedStyle(e).backgroundColor);
 await selected.hover();await expect(selected).toHaveCSS('background-color',selectedColor);
 const member=page.getByRole('button',{name:'하루',exact:true});await member.hover();
 const hoveredColor=await member.evaluate(e=>getComputedStyle(e).backgroundColor);
 await page.mouse.down();
 await expect(member).not.toHaveCSS('background-color',hoveredColor);
 await expect(member).toHaveCSS('transition-duration',/^0s(?:, 0s)*$/);
 await page.mouse.up();await expect(member).toHaveAttribute('aria-pressed','true');
 await expect(member).toHaveCSS('background-color',selectedColor);
 await page.setViewportSize({width:360,height:900});
 const previous=page.getByRole('button',{name:'이전 연도',exact:true});await previous.hover();
 const arrowHover=await previous.evaluate(e=>getComputedStyle(e).backgroundColor);
 await page.mouse.down();await expect(previous).not.toHaveCSS('background-color',arrowHover);
 await page.mouse.up();await expect(page.locator('.inception-dialog')).toBeVisible();
 await page.keyboard.press('Escape');await expect(previous).toBeFocused();
});

for(const width of [320,360,768,1280]) test(`grass preview keeps the card height stable at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 const card=page.locator('.workout-card'),preview=page.locator('.grass-preview');
 const day=page.locator('[data-date="2026-10-13"]');
 for(const scale of [100,200]){
  await page.addStyleTag({content:`html { font-size: ${scale}%; }`});
  await page.getByRole('button',{name:'하루',exact:true}).focus();await page.mouse.move(0,0);
  await expect(preview).toBeEmpty();
  const before=(await card.boundingBox())!.height;
  await day.hover();
  await expect(preview).toHaveText('2026-10-13 · 사진 포함 인증 · 가볍게 30분 걷기 스트레칭');
  expect(await preview.textContent()).toBe('2026-10-13 · 사진 포함 인증 · 가볍게 30분 걷기 스트레칭');
  expect((await card.boundingBox())!.height).toBe(before);
  await page.mouse.move(0,0);await expect(preview).toBeEmpty();
  await day.focus();
  await expect(preview).toContainText('2026-10-13');
  expect((await card.boundingBox())!.height).toBe(before);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});

test('desktop grass heading fits date, statistics and year on one row',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await fixture(page);
 for(const member of ['전체 멤버','하루']){
  await page.getByRole('button',{name:member,exact:true}).click();
  const date=(await page.locator('.year-title').boundingBox())!;
  const metrics=(await page.locator('.metrics').boundingBox())!;
  const year=(await page.locator('.year-stepper').boundingBox())!;
  expect(metrics.y).toBeLessThan(date.y+date.height);
  expect(year.y).toBeLessThan(metrics.y+metrics.height);
  expect(metrics.x).toBeGreaterThanOrEqual(date.x+date.width);
  expect(year.x).toBeGreaterThanOrEqual(metrics.x+metrics.width);
 }
});

for(const width of [320,360]) test(`mobile grass heading uses two rows at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 const date=(await page.locator('.year-title').boundingBox())!;
 const metrics=(await page.locator('.metrics').boundingBox())!;
 const year=(await page.locator('.year-stepper').boundingBox())!;
 expect(year.y).toBeLessThan(date.y+date.height);
 expect(metrics.y).toBeGreaterThanOrEqual(year.y+year.height);
});

test('personal date detail keeps memo and photos inline and preserves full multiline text',async({page})=>{
 await page.setViewportSize({width:1280,height:900});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 const day=page.locator('[data-date="2026-10-13"]');
 await day.focus();await day.press('Enter');
 const detail=page.locator('.date-detail');
 await expect(detail.locator('.memo')).toHaveText('가볍게 30분 걷기\n스트레칭');
 const memo=(await detail.locator('.memo').boundingBox())!;
 const photo=(await detail.getByRole('button',{name:'사진 보기',exact:true}).boundingBox())!;
 expect(photo.y).toBeLessThan(memo.y+memo.height);
 await detail.getByRole('button',{name:'날짜 상세 닫기',exact:true}).click();
 await expect(day).toBeFocused();
});

test('aggregate and personal photo-only details omit redundant body labels and preserve mixed memos',async({page})=>{
 await fixture(page);
 await page.locator(`[data-date="${today}"]`).click();
 const detail=page.locator('.date-detail'),entry=detail.locator('.aggregate-entry');
 await expect(entry.getByRole('heading')).toHaveText('하루');
 await expect(entry.locator('.memo')).toHaveCount(0);
 await expect(entry.getByRole('button',{name:'사진 보기',exact:true})).toBeVisible();
 await page.locator('[data-date="2026-10-13"]').click();
 await expect(detail.locator('.memo')).toHaveText('가볍게 30분 걷기\n스트레칭');
 await expect(detail.getByRole('button',{name:'사진 보기',exact:true})).toBeVisible();
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await expect(page.locator('.grass-grid')).toHaveAttribute('aria-label', /하루의/);
 const personalDay=page.locator(`[data-date="${today}"]`);
 await personalDay.focus();await personalDay.press('Enter');
 await expect(detail.locator('.detail-heading')).toContainText('사진 포함 인증');
 await expect(detail.locator('.memo')).toHaveCount(0);
 await expect(detail.getByRole('button',{name:'사진 보기',exact:true})).toBeVisible();
});

test('loaded photos leave only pagination controls and keep loading, empty, and retry states',async({page})=>{
 let finish:()=>void=()=>{};const gate=new Promise<void>(resolve=>{finish=resolve;});let calls=0;
 const photo={id:'200',preview:null,url:'https://cdn.discordapp.com/attachments/20/200/a.jpg',original:'https://discord.com/channels/10/20/100'};
 await page.route('**/functions/v1/mukmuk-discord-photos',async route=>{
  calls++;
  if(calls===1){await gate;await route.fulfill({json:{photos:[photo],next:'100'}});}
  else if(calls===2)await route.fulfill({status:502,json:{error:'photos_unavailable'}});
  else {expect(route.request().postDataJSON().after).toBe('100');await route.fulfill({json:{photos:[],next:null}});}
 });
 await fixture(page);await page.locator(`[data-date="${today}"]`).click();
 const photos=page.locator('.date-detail .photo-section');
 await photos.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(photos).toContainText('사진을 불러오고 있어요.');finish();
 await expect(photos.getByRole('button',{name:'사진 더 보기',exact:true})).toBeVisible();
 await expect(photos.locator('.photo-controls p')).toHaveCount(0);
 await expect(photos.getByRole('button',{name:'사진 새로고침',exact:true})).toHaveCount(0);
 await photos.getByRole('button',{name:'사진 더 보기',exact:true}).click();
 await expect(photos).toContainText('사진을 불러오지 못했어요.');
 await expect(photos.getByRole('button',{name:'사진 1 크게 보기'})).toBeVisible();
 await photos.getByRole('button',{name:'다시 불러오기',exact:true}).click();
 await expect(photos.locator('.photo-controls')).toBeEmpty();
 await expect(photos.getByRole('button',{name:'사진 1 크게 보기'})).toBeVisible();
 await photos.getByRole('button',{name:'사진 접기',exact:true}).click();
 await page.route('**/functions/v1/mukmuk-discord-photos',route=>route.fulfill({json:{photos:[],next:null}}));
 await photos.getByRole('button',{name:'사진 보기',exact:true}).click();
 await expect(photos).toContainText('표시할 사진이 없어요.');
 await expect(photos.getByRole('button',{name:'사진 새로고침',exact:true})).toBeVisible();
});

for (const recovery of ['retry','year','member'] as const) test(`year reload failure keeps controls usable via ${recovery}`, async ({page}) => {
 await fixture(page,'normal',true,false,'2027-01-05T09:00:00Z');
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await page.route('**/rest/v1/rpc/get_workout_logs_page', route => route.fulfill({status:503,json:{message:'unavailable'}}));
 await page.getByRole('button',{name:'이전 연도',exact:true}).click();
 await expect(page.locator('.error-state')).toBeVisible();
 const member=page.locator('.member-filter [data-member-id="2"]');
 await expect(member).toHaveAttribute('aria-pressed','true');await expect(member).toBeEnabled();
 await expect(page.locator('.year-label')).toHaveText('2026년');
 await expect(page.getByRole('button',{name:'다음 연도',exact:true})).toBeEnabled();
 await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
 await expect(page.locator('.workout-card')).toHaveCount(0);await expect(page.locator('.timeline')).toBeHidden();
 if(recovery==='member') {
  // Changing selection while the API still fails must never render old logs.
  await page.getByRole('button',{name:'전체 멤버',exact:true}).click();
  await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
  await expect(page.locator('.error-state')).toBeVisible();await expect(page.locator('.workout-card')).toHaveCount(0);
 }
 await page.unroute('**/rest/v1/rpc/get_workout_logs_page');
 if(recovery==='year')await page.getByRole('button',{name:'다음 연도',exact:true}).click();
 else await page.getByRole('button',{name:'다시 불러오기',exact:true}).click();
 await expect(page.locator('.workout-card')).toHaveCount(1);await expect(page.locator('.error-state')).toHaveCount(0);
 await expect(page.locator('.year-label')).toHaveText(recovery==='year'?'2027년':'2026년');
 await expect(page.locator('.member-filter [aria-pressed="true"]')).toHaveText(recovery==='member'?'전체 멤버':'하루');
 if(recovery==='retry')await expect(page.locator('.timeline-item').first()).toBeVisible();
 if(recovery==='year')await expect(page.getByRole('button',{name:'다음 연도',exact:true})).toBeDisabled();
 else await expect(page.getByRole('button',{name:'다음 연도',exact:true})).toBeEnabled();
});

for(const motion of ['no-preference','reduce'] as const)test(`control feedback locks year reload and preserves selection with ${motion}`,async({page})=>{
 await page.emulateMedia({reducedMotion:motion});
 await fixture(page,'normal',true,false,'2027-01-05T09:00:00Z');
 const member=page.getByRole('button',{name:'하루',exact:true});await member.click();
 // Read immediately after selection, without a CSS-settling sleep or polling.
 expect(await member.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(50, 108, 67)');
 await member.hover();await page.mouse.down();
 expect(await member.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(50, 108, 67)');
 await page.mouse.up();
 let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/rest/v1/rpc/get_workout_logs_page',async route=>{await gate;await route.fallback();});
 await page.getByRole('button',{name:'이전 연도',exact:true}).click();
 await expect(page.locator('#app')).toHaveAttribute('aria-busy','true');await expect(member).toBeDisabled();
 expect(await member.evaluate(e=>getComputedStyle(e).backgroundColor)).toBe('rgb(50, 108, 67)');
 const detachedYearDisabled=await page.evaluate(()=>{
  // The heading is moved out of view during loading; detached controls are also locked.
  return document.querySelectorAll('.year-filter button:not(:disabled)').length;
 });expect(detachedYearDisabled).toBe(0);
 release();await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
 await expect(member).toBeEnabled();await expect(member).toHaveAttribute('aria-pressed','true');
 await expect(page.getByRole('button',{name:'다음 연도',exact:true})).toBeEnabled();
});

test('year reload secret expiry removes prior member data before reauthentication',async({page})=>{
 await fixture(page,'normal',true,false,'2027-01-05T09:00:00Z');
 await page.getByRole('button',{name:'하루',exact:true}).click();
 await page.route('**/rest/v1/rpc/get_workout_logs_page',route=>route.fulfill({status:400,json:{message:'invalid_or_expired_secret'}}));
 await page.getByRole('button',{name:'이전 연도',exact:true}).click();
 await expect(page.locator('.modal-error')).toBeVisible();
 await expect(page.locator('.member-filter')).toHaveCount(0);await expect(page.locator('.kpi-card')).toHaveCount(0);
 await expect(page.locator('.photo-section')).toHaveCount(0);await expect(page.locator('.workout-card')).toHaveCount(0);
 await expect(page.locator('#app')).toHaveAttribute('aria-busy','false');
 await page.unroute('**/rest/v1/rpc/get_workout_logs_page');
 await page.locator('.modal-input').fill('test-code');await page.getByRole('button',{name:'확인',exact:true}).click();
 await expect(page.locator('.workout-card')).toHaveCount(1);await expect(page.locator('.member-all')).toHaveAttribute('aria-pressed','true');
});

for(const width of [320,360,390])test(`member chip scroll preserves selected chip and focus at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page);
 const roster=Array.from({length:30},(_,i)=>({user_id:String(100+i),username:`산책하는 멤버 ${String(i).padStart(2,'0')}`}));
 await page.route('**/rest/v1/rpc/get_dashboard_members',route=>route.fulfill({json:roster}));await page.reload();
 const list=page.locator('.member-options'),left=page.locator('.member-scroll-fade--left'),right=page.locator('.member-scroll-fade--right');
 await expect(list.locator('button')).toHaveCount(30);await list.evaluate(e=>{e.scrollLeft=0;});
 await expect(left).toBeHidden();await expect(right).toBeVisible();
 await list.evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
 await expect(left).toBeVisible();await expect(right).toBeVisible();
 for(const scale of [100,200]){
  await page.addStyleTag({content:`html{font-size:${scale}%}`});
  await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();
  await page.locator('#member-search').fill('29');
  await page.locator('#member-search').press('Tab');
  await expect(page.locator('.member-results button')).toBeFocused();
  await page.keyboard.press('Enter');
  const chosen=list.locator('[data-member-id="129"]');await expect(chosen).toBeFocused();
  await expect(chosen).toHaveAttribute('aria-pressed','true');
  await expect(async()=>{
   const a=(await chosen.boundingBox())!,b=(await list.boundingBox())!;
   expect(a.x).toBeGreaterThanOrEqual(b.x+2);expect(a.x+a.width).toBeLessThanOrEqual(b.x+b.width-2);
  }).toPass();
  await expect(left).toHaveCSS('opacity','0');await expect(right).toHaveCSS('opacity','0');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
 await list.evaluate(e=>{e.scrollLeft=e.scrollWidth;});await expect(right).toBeHidden();
 await page.setViewportSize({width:768,height:900});await expect(left).toBeHidden();await expect(right).toBeHidden();
 await expect(list.locator('[data-member-id="129"]')).toBeVisible();
});

for(const input of ['click','tap'] as const)test.describe(`member fade ${input} input`,()=>{
 test.use({hasTouch:input==='tap'});
 for(const [width,scale] of [[360,100],[320,200]])test(`member chip fades remain visible after ${input} at ${width}px text ${scale}%`,async({page})=>{
  await page.setViewportSize({width,height:900});await fixture(page,'normal',true,true);
  await page.addStyleTag({content:`html{font-size:${scale}%}`});
  const chosen=page.getByRole('button',{name:'하루',exact:true});
  if(input==='tap')await chosen.tap();else await chosen.click();
  await expect(chosen).toBeFocused();await expect(chosen).toHaveAttribute('aria-pressed','true');
  expect(await chosen.evaluate(e=>e.matches(':focus-visible'))).toBe(false);
  const list=page.locator('.member-options'),left=page.locator('.member-scroll-fade--left'),right=page.locator('.member-scroll-fade--right');
  await expect(left).toBeVisible();await expect(left).toHaveCSS('opacity','1');
  const c=(await chosen.boundingBox())!,l=(await list.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(l.x+14);expect(c.x+c.width).toBeLessThanOrEqual(l.x+l.width-14);
  await list.evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
  await expect(left).toBeVisible();await expect(right).toBeVisible();
  await expect(left).toHaveCSS('opacity','1');await expect(right).toHaveCSS('opacity','1');
  await list.evaluate(e=>{e.scrollLeft=e.scrollWidth;});await expect(right).toBeHidden();
  // Tab starts keyboard navigation; returning to a chip must protect its focus ring.
  await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  const focused=page.locator('.member-options button:focus-visible');await expect(focused).toHaveCount(1);
  await expect(left).toHaveCSS('opacity','0');await expect(right).toHaveCSS('opacity','0');
 });
});

for(const width of [320,360,768,1280])test(`grass label geometry remains legible at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page,'normal',true,false,'2029-01-05T09:00:00Z');
 for(const year of [2028,2027,2026]){
  await page.getByRole('button',{name:'이전 연도',exact:true}).click();
  await expect(page.locator('.year-label')).toHaveText(`${year}년`);
  await expect(page.locator('.grass-cell[data-date]')).toHaveCount(year===2028?366:365);
  for(const scale of [200,100]){
   await page.addStyleTag({content:`html{font-size:${scale}%}`});
   // Chip refitting can move the entire card after a text-size change.
   await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
   const labels=await page.locator('.weekday-labels > span').evaluateAll(nodes=>nodes.map(n=>{
    const r=n.getBoundingClientRect();const range=document.createRange();range.selectNodeContents(n);const text=range.getBoundingClientRect();
    return {top:r.top,bottom:r.bottom,center:(r.top+r.bottom)/2,textTop:text.top,textBottom:text.bottom};
   }));
   for(let i=1;i<labels.length;i++){
    expect(labels[i].top).toBeGreaterThanOrEqual(labels[i-1].bottom-.1);
    expect(labels[i].textTop).toBeGreaterThanOrEqual(labels[i-1].textBottom-.1);
   }
   const dates=await page.locator('.grass-cell[data-date]').evaluateAll(nodes=>nodes.slice(0,7).map(n=>{
    const r=n.getBoundingClientRect();return {date:(n as HTMLElement).dataset.date!,center:r.y+r.height/2,width:r.width,height:r.height};
   }));
   for(const d of dates){expect(d.width).toBe(14);expect(d.height).toBe(14);expect(Math.abs(d.center-labels[new Date(`${d.date}T00:00:00Z`).getUTCDay()].center)).toBeLessThan(1);}
   const months=await page.locator('.month-labels > span').evaluateAll(nodes=>nodes.filter(n=>n.textContent?.trim()).map(n=>{
    const range=document.createRange();range.selectNodeContents(n);const r=range.getBoundingClientRect();return {left:r.left,right:r.right};
   }));
   expect(months).toHaveLength(12);for(let i=1;i<months.length;i++)expect(months[i].left).toBeGreaterThanOrEqual(months[i-1].right);
   const scroll=page.locator('.grass-scroll');await scroll.evaluate(e=>{e.scrollLeft=0;});
   const firstMonth=(await page.locator('.month-labels').boundingBox())!,grid=(await page.locator('.grass-grid').boundingBox())!;
   expect(Math.abs(firstMonth.x-grid.x)).toBeLessThan(1);
   await scroll.evaluate(e=>{e.scrollLeft=(e.scrollWidth-e.clientWidth)/2;});
   await expect(page.locator('.month-labels')).not.toHaveCSS('mask-image','none');
   await scroll.evaluate(e=>{e.scrollLeft=e.scrollWidth;});
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
 }
});

for(const kind of ['auth','member','inception','photo'] as const)test(`flat dialog and warning keep ${kind} surface readable`,async({page})=>{
 await page.setViewportSize({width:360,height:900});
 if(kind==='photo'){
  await page.route('**/functions/v1/mukmuk-discord-photos',route=>route.fulfill({json:{photos:[{id:'200',preview:null,url:'https://cdn.discordapp.com/attachments/20/200/a.jpg',original:'https://discord.com/channels/10/20/100'}],next:null}}));
  await page.route('https://cdn.discordapp.com/**',route=>route.fulfill({body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'),contentType:'image/png'}));
 }
 await fixture(page,'normal',kind!=='auth');
 let surface=page.locator('.modal-box');
 if(kind==='member'){await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();surface=page.locator('.member-dialog');}
 if(kind==='inception'){await page.getByRole('button',{name:'이전 연도',exact:true}).click();surface=page.locator('.inception-dialog');}
 if(kind==='photo'){
  await page.getByRole('button',{name:'하루',exact:true}).click();
  await page.locator('.timeline-item').first().getByRole('button',{name:'사진 보기',exact:true}).click();
  await page.getByRole('button',{name:'사진 1 크게 보기',exact:true}).click();surface=page.locator('.photo-dialog');
 }
 await expect(surface).toBeVisible();await expect(surface).toHaveCSS('box-shadow','none');
 if(kind==='auth')await expect(page.locator('.modal-backdrop')).toHaveCSS('backdrop-filter','none');
 else expect(await surface.evaluate(e=>getComputedStyle(e,'::backdrop').backdropFilter)).toBe('none');
 if(kind==='inception')await expect(surface.locator('.inception-character')).toHaveCSS('filter','none');
 if(kind==='photo'||kind==='member'){
  const close=surface.getByRole('button',{name:'닫기',exact:true});await expect(close).toHaveClass(/secondary/);
  if(kind==='photo')await expect(surface.getByRole('link',{name:'Discord 원문 보기'})).toHaveClass(/secondary/);
  await page.addStyleTag({content:'html{font-size:200%}'});
  const box=(await surface.boundingBox())!,buttons=await surface.locator('.dialog-actions > *').all();
  expect(buttons.length).toBeGreaterThan(0);
  for(const b of buttons){const r=(await b.boundingBox())!;expect(r.x).toBeGreaterThanOrEqual(box.x);expect(r.x+r.width).toBeLessThanOrEqual(box.x+box.width);expect(r.height).toBeGreaterThanOrEqual(44);}
  await close.click();if(kind==='member')await expect(page.getByRole('button',{name:'멤버 찾기',exact:true})).toBeFocused();
 }
});

for(const width of [320,360,768,1280])test(`flat dialog and warning notice wraps within header at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page,'normal',true,false,'2026-10-14T12:00:00Z');
 const notice=page.locator('.status-notice.warning');await expect(notice).toContainText('새 인증의 반영이 늦어지고 있어요.');
 await expect(notice).toHaveCSS('border-radius','10px');await expect(notice).toHaveCSS('padding-top','16px');
 for(const scale of [100,200]){
  await page.addStyleTag({content:`html{font-size:${scale}%}`});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const rect=(await notice.boundingBox())!,header=(await page.locator('.brand-header').boundingBox())!;
  expect(rect.x).toBeGreaterThanOrEqual(header.x);expect(rect.x+rect.width).toBeLessThanOrEqual(header.x+header.width);
 }
});

for(const width of [320,360,768,1280])for(const scale of [100,200])test(`visual review matrix ${width}px text ${scale}% preserves outer alignment`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page,'normal',true,true);
 await page.addStyleTag({content:`html{font-size:${scale}%}`});
 for(const member of ['전체 멤버','하루']){
  await page.getByRole('button',{name:member,exact:true}).click();
  const header=(await page.locator('.brand-header').boundingBox())!;
  for(const selector of ['.member-filter','.workout-card','.footer',...(member==='전체 멤버'?['.kpi-section']:[])]){
   const box=(await page.locator(selector).boundingBox())!;
   expect(Math.abs(box.x-header.x)).toBeLessThan(1);expect(Math.abs(box.x+box.width-header.x-header.width)).toBeLessThan(1);
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  if(process.env.MUKMUK_CAPTURE_DIR){
   await page.evaluate(()=>document.fonts.ready);
   await page.locator('.workout-card').screenshot({path:`${process.env.MUKMUK_CAPTURE_DIR}/grass-${width}-${scale}-${member==='하루'?'member':'all'}.png`});
   await page.evaluate(()=>scrollTo(0,0));
   await page.screenshot({path:`${process.env.MUKMUK_CAPTURE_DIR}/board-${width}-${scale}-${member==='하루'?'member':'all'}.png`,fullPage:true});
  }
 }
});

for(const motion of ['no-preference','reduce'] as const)test(`control feedback clears previous selection immediately with ${motion}`,async({page})=>{
 await page.emulateMedia({reducedMotion:motion});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 const paints=await page.locator('.member-filter').evaluate(nav=>{
  return ['member-all','member-2'].map(id=>{
   const node=nav.querySelector<HTMLButtonElement>(`[data-control="${id}"]`)!;const style=getComputedStyle(node);
   return {pressed:node.getAttribute('aria-pressed'),background:style.backgroundColor,color:style.color,duration:style.transitionDuration};
  });
 });
 expect(paints[0]).toMatchObject({pressed:'false',background:'rgb(255, 255, 255)',color:'rgb(87, 102, 91)'});
 expect(paints[0].duration).toMatch(/^0s(?:, 0s)*$/);
 expect(paints[1].pressed).toBe('true');expect(paints[1].background).toBe('rgb(50, 108, 67)');expect(paints[1].color).toBe('rgb(255, 255, 255)');
});

for(const width of [360,390,768]) test(`month labels soften both scrolling edges at ${width}px`,async({page})=>{
 await page.setViewportSize({width,height:900});await fixture(page);
 const scroll=page.locator('.grass-scroll'),months=page.locator('.month-labels');
 for(const position of ['start','middle','end']){
  await scroll.evaluate((e,p)=>{e.scrollLeft=p==='start'?0:p==='end'?e.scrollWidth:(e.scrollWidth-e.clientWidth)/2;},position);
  await expect.poll(()=>months.evaluate(e=>getComputedStyle(e).maskImage)).not.toBe('none');
  await expect(async()=>{
   const mask=await months.evaluate(e=>getComputedStyle(e).maskImage);
   const values=[...mask.matchAll(/(-?[\d.]+)px/g)].map(m=>Number(m[1]));
   const m=(await months.boundingBox())!,s=(await scroll.boundingBox())!,w=(await page.locator('.weekday-labels').boundingBox())!;
   if(position!=='start'){
    expect(Math.abs(m.x+values[0]-w.x-w.width)).toBeLessThan(1);
    expect(values[1]-values[0]).toBe(12);
   }
   if(position!=='end')expect(Math.abs(m.x+values.at(-1)!-s.x-s.width)).toBeLessThan(1);
  }).toPass();
 }
});

test('member selection is revealed after chip text grows without container resizing',async({page})=>{
 await page.setViewportSize({width:390,height:900});await fixture(page);
 await page.getByRole('button',{name:'하루',exact:true}).click();
 const list=page.locator('.member-options'),chosen=list.locator('[aria-pressed="true"]');
 const width=await list.evaluate(e=>e.clientWidth);
 await page.addStyleTag({content:'.member-options .filter-button { font-size:2rem; max-width:none; white-space:nowrap; }'});
 await expect(async()=>{
  expect(await list.evaluate(e=>e.clientWidth)).toBe(width);
  const c=(await chosen.boundingBox())!,l=(await list.boundingBox())!;
  expect(c.x).toBeGreaterThanOrEqual(l.x+14);
  expect(c.x+c.width).toBeLessThanOrEqual(l.x+l.width-14);
 }).toPass();
});

test('narrow enlarged member controls put personal chips below both actions',async({page})=>{
 await page.setViewportSize({width:320,height:900});await fixture(page);
 await page.addStyleTag({content:'html { font-size:200%; }'});
 await expect(async()=>{
  const a=(await page.locator('.member-all').boundingBox())!,f=(await page.locator('.member-find').boundingBox())!,v=(await page.locator('.member-options-viewport').boundingBox())!,n=(await page.locator('.member-filter').boundingBox())!;
  expect(Math.abs(a.y-f.y)).toBeLessThan(1);
  expect(v.y).toBeGreaterThanOrEqual(Math.max(a.y+a.height,f.y+f.height));
  expect(Math.abs(v.width-n.width)).toBeLessThan(1);
 }).toPass();
 await page.addStyleTag({content:'html { font-size:100%; }'});
 await expect(async()=>{
  const a=(await page.locator('.member-all').boundingBox())!,f=(await page.locator('.member-find').boundingBox())!,v=(await page.locator('.member-options-viewport').boundingBox())!;
  expect(Math.abs(a.y-f.y)).toBeLessThan(1);expect(Math.abs(a.y-v.y)).toBeLessThan(1);
 }).toPass({timeout:5000});
});

test('desktop refits two chip rows after text growth and shrink',async({page})=>{
 await fixture(page);
 const roster=Array.from({length:30},(_,i)=>({user_id:String(100+i),username:`산책하는 멤버 ${String(i).padStart(2,'0')}`}));
 await page.route('**/rest/v1/rpc/get_dashboard_members',route=>route.fulfill({json:roster}));await page.reload();
 await page.getByRole('button',{name:'멤버 찾기',exact:true}).click();
 await page.locator('#member-search').fill('29');await page.locator('.member-results button').click();
 const list=page.locator('.member-options');
 for(const scale of [200,100]){
  await page.addStyleTag({content:`html { font-size:${scale}%; }`});
  await expect(async()=>{
   const positions=await list.locator('button:visible').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().top));
   expect(new Set(positions).size).toBeLessThanOrEqual(2);
   await expect(list.locator('[data-member-id="129"]')).toBeVisible();
  }).toPass({timeout:5000});
 }
});


test('monthly grass participation replaces the sum and stays monthly while annual grass changes year',async({page})=>{
 await fixture(page,'normal',true,true,'2027-01-05T09:00:00Z');
 const kpi=page.locator('.kpi-card').filter({has:page.getByText('함께 심은 잔디',{exact:true})});
 await expect(kpi.locator('.kpi-value')).toHaveText('100%');
 await expect(kpi).toContainText('전일 대비 +7.7%p');
 await expect(page.getByText('총 운동 일수',{exact:true})).toHaveCount(0);
 await page.getByRole('button',{name:'이전 연도'}).click();
 await expect(page.locator('.year-label')).toHaveText('2026년');
 await expect(kpi.locator('.kpi-value')).toHaveText('100%');
 await expect(page.locator('.workout-card .metrics')).toContainText('전체 멤버3명');
});

for(const state of ['first','pending','error','sql-error','permission-error'] as const)test(`monthly grass participation shows honest ${state} state`,async({page})=>{
 await fixture(page);
 const status=state==='error'?503:state==='sql-error'?400:state==='permission-error'?403:0;
 await page.route('**/rest/v1/rpc/get_monthly_grass_participation',r=>status?r.fulfill({status,json:{message:status===400?'invalid_month':'unavailable'}}):r.fulfill({json:state==='pending'?[]:[{
  month_start:'2026-10-01',collected_at:'2026-10-14T08:17:00Z',member_count:2,workout_days:3,elapsed_days:14,
  previous_collected_at:null,previous_member_count:null,previous_workout_days:null,previous_elapsed_days:null,
 }]}));
 await page.reload();
 const kpi=page.locator('.kpi-card').filter({has:page.getByText('함께 심은 잔디',{exact:true})});
 await expect(kpi.locator('.kpi-value')).toHaveText(state==='first'?'10.7%':'—');
 await expect(kpi).toContainText(state==='first'?'비교 기록 없음':state==='pending'?'수집 대기':'집계 불러오기 실패');
 await expect(page.locator('.workout-card')).toHaveCount(1);
 await expect(page.locator('.modal-box')).toHaveCount(0);
 expect(await page.evaluate(()=>localStorage.getItem('mukmuk_secret_code'))).toBe('test-code');
});
