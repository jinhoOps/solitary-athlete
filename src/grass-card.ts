import {el,button} from './dom';
import {calendarYear,sundayIndex,stats} from './dates';
import {aggregateDays,aggregateDisplayOpacity} from './aggregate';
import type {Member,WorkoutLog,DashboardData} from './types';

export function renderGrassCard(options: {
 heading?:HTMLElement;year:number;today:string;member:Member|null;roster:{id:string;name:string}[];
 photos?:(log:WorkoutLog)=>HTMLElement;
 /** Selected member's achievement title for the current month, with its month label. */
 title?:{month:number;name:string}|null;
 logs:WorkoutLog[];currentStats?:DashboardData['currentStats'];
}) {
  const {year:selectedYear,today,roster}=options;
  const currentYear=Number(today.slice(0,4));
  const aggregate=options.member===null;
  const names=new Map(roster.map(m=>[m.id,m.name]));
  const logs=options.logs.map(l=>({...l,username:names.get(l.user_id)??l.username}));
  const daily=aggregateDays(logs,roster.length);
  const member=options.member??{id:'ALL',name:'전체 멤버',dates:new Set(daily.keys()),photos:new Set<string>()};
  const data={logs,currentStats:options.currentStats};
  const card = el('article', 'workout-card');
  const top = options.heading ?? el('div', 'card-heading');
  const cells = calendarYear(selectedYear);
  if (!options.heading) top.append(el('span', 'caption', `오늘 · ${today} KST`));

  const metrics = el('dl', 'metrics');
  const counts = stats(member.dates, today);
  const currentCounts = data.currentStats?.get(member.id) ?? counts;
  const metricsForYear = aggregate
    ? [['전체 멤버',roster.length,'명'],['누적',logs.filter(l=>l.log_date<=today).length,'일']] as const
    : selectedYear === currentYear
    ? [['이번 주', currentCounts.week,'일'], ['연속', currentCounts.streak,'일'], [`${selectedYear}년 운동`, counts.total,'일']] as const
    : [[`${selectedYear}년 운동`, counts.total,'일']] as const;
  for (const [label, value, suffix] of metricsForYear) {
    const item = el('div');
    item.append(el('dt', 'caption', label), el('dd', '', `${value}${suffix}`));
    metrics.append(item);
  }
  top.querySelector('.metrics')?.remove();
  top.insertBefore(metrics, top.querySelector('.year-filter'));
  top.querySelector('.member-title')?.remove();
  if (options.title) {
    const badge = el('p', 'member-title');
    badge.append(el('span', 'member-title-label', `${options.title.month}월의 칭호`), el('span', 'member-title-name', options.title.name));
    top.insertBefore(badge, top.querySelector('.year-filter'));
  }

  const content = el('div', 'grass-content');
  const visual = el('div', 'grass-visual');
  const months = el('div', 'month-labels');
  const gridWrap = el('div', 'grid-wrap');
  const weekdays = el('div', 'weekday-labels');
  for (const d of ['일', '월', '화', '수', '목', '금', '토']) weekdays.append(el('span', '', d));

  const grid = el('div', 'grass-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `${member.name}의 ${selectedYear}년 잔디, 화살표로 날짜 이동`);

  const details = el('section', 'date-detail');
  details.hidden = true;
  details.setAttribute('aria-label', '날짜 상세');
  const preview = el('p', 'grass-preview caption');
  let hoveredDate: string | null = null;
  let focusedDate: string | null = null;

  const dayButtons = new Map<string, HTMLButtonElement>();
  let opened: string | null = null;
  let openedLog: WorkoutLog | undefined;

  const memoFor = (date: string) =>
    openedLog?.log_date === date ? openedLog : data.logs.find(r => r.user_id === member.id && r.log_date === date);
  const levelFor = (date: string) => (!member.dates.has(date) ? 0 : member.photos.has(date) ? 2 : 1);
  const summary=(date:string)=>`전체 ${roster.length}명 중 ${daily.get(date)?.count??0}명 운동 · 사진 포함 ${daily.get(date)?.photoCount??0}명`;
  const description = (date: string, log = memoFor(date)) => aggregate
    ? `${date} · ${date>today?'아직 오지 않은 날짜':summary(date)}`
    : `${date} · ${date > today ? '아직 오지 않은 날짜' : ['기록 없음', '텍스트 인증', '사진 포함 인증'][levelFor(date)]}${log?.memo ? ` · ${log.memo}` : ''}`;
  const updatePreview = () => {
    const date = hoveredDate ?? focusedDate;
    preview.textContent = date ? description(date).replace(/\s*\r?\n\s*/g, ' ') : '';
  };

  const disposePhotos=()=>details.querySelectorAll('.photo-section').forEach(e=>e.dispatchEvent(new Event('dispose')));
  card.addEventListener('dispose',disposePhotos);

  function close() {
    disposePhotos();
    const date = opened;
    opened = null;
    openedLog = undefined;
    details.hidden = true;
    for (const cell of dayButtons.values()) cell.setAttribute('aria-expanded', 'false');
    if (date) {
      const cell = dayButtons.get(date);
      cell?.focus({preventScroll:true});
      revealDate(date);
      cell?.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
    }
  }

  function open(date: string, log?: WorkoutLog) {
    if (opened === date && !log) {
      close();
      return;
    }
    disposePhotos();
    opened = date;
    openedLog = log;
    const title = el('div', 'detail-heading');
    const closeButton = button('×', close, 'button icon-button');
    closeButton.setAttribute('aria-label', '날짜 상세 닫기');
    const detailHeading = el('h4', '', `${date} · ${aggregate?summary(date):['기록 없음', '텍스트 인증', '사진 포함 인증'][levelFor(date)]}`);
    detailHeading.tabIndex = -1;
    title.append(detailHeading, closeButton);
    details.replaceChildren(title);
    if(aggregate){
      const entries=daily.get(date)?.logs??[];
      if(!entries.length)details.append(el('p','memo','기록 없음'));
      for(const entry of entries){
        const item=el('article','aggregate-entry');
        const message=el('div','timeline-message');
        if(entry.memo)message.append(el('p','memo',entry.memo));
        else if(!entry.has_photo)message.append(el('p','memo','텍스트 인증'));
        if(entry.has_photo&&options.photos)message.append(options.photos(entry));
        item.append(el('h4','',entry.username),message);
        details.append(item);
      }
    }
    if(!aggregate){
      const entry=memoFor(date);
      const message=el('div','timeline-message');
      if(entry?.memo)message.append(el('p','memo',entry.memo));
      else if(!entry?.has_photo)message.append(el('p','memo',levelFor(date)?'텍스트 인증':'기록 없음'));
      if(entry?.has_photo&&options.photos)message.append(options.photos(entry));
      details.append(message);
    }
    details.hidden = false;
    for (const [d, cell] of dayButtons) cell.setAttribute('aria-expanded', String(d === date));
    requestAnimationFrame(() => {
      if (opened !== date || !card.isConnected) return;
      revealDate(date);
      // Scroll only as far as needed; a detail taller than the screen still aligns its start.
      details.scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});
      detailHeading.focus({preventScroll:true});
    });
  }



  let previousMonth = '';
  for (let i = 0; i < cells.length; i += 7) {
    const date = cells.slice(i, i + 7).find(Boolean);
    const month = date?.slice(5, 7) ?? '';
    const label = el('span', '', month && month !== previousMonth ? `${Number(month)}월` : '');
    months.append(label);
    previousMonth = month;
  }

  const dates = cells.filter((d): d is string => d !== null && d <= today);
  const entryDate = dates.includes(today) ? today : dates.at(-1);

  function focusDate(date: string) {
    for (const [d, cell] of dayButtons) cell.tabIndex = d === date ? 0 : -1;
    dayButtons.get(date)?.focus();
  }

  for (const date of cells) {
    if (!date) {
      grid.append(el('span', 'grass-padding'));
      continue;
    }
    const cell = button('', () => open(date), 'grass-cell');
    cell.dataset.date = date;
    cell.dataset.today = String(date === today);
    if(aggregate){
      cell.classList.add('aggregate-cell');
      cell.dataset.count=String(daily.get(date)?.count??0);
      cell.style.setProperty('--aggregate-opacity',String(aggregateDisplayOpacity(daily.get(date)?.opacity??0)));
    } else cell.dataset.level = String(levelFor(date));
    cell.disabled = date > today;
    cell.tabIndex = date === entryDate ? 0 : -1;
    cell.setAttribute('aria-label', description(date));
    cell.setAttribute('aria-expanded', 'false');
    cell.onfocus = () => {
      for (const [d, b] of dayButtons) b.tabIndex = d === date ? 0 : -1;
      focusedDate = date;
      updatePreview();
      revealDate(date);
    };
    cell.onblur = () => {
      focusedDate = null;
      updatePreview();
    };
    cell.onmouseenter = () => {
      hoveredDate = date;
      updatePreview();
    };
    cell.onmouseleave = () => {
      hoveredDate = null;
      updatePreview();
    };
    cell.onkeydown = e => {
      const delta = ({ ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 } as Record<string, number>)[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        if ((e.key === 'ArrowUp' && sundayIndex(date) === 0) || (e.key === 'ArrowDown' && sundayIndex(date) === 6)) return;
        const next = dates[dates.indexOf(date) + delta];
        if (next) focusDate(next);
      }
    };
    dayButtons.set(date, cell);
    grid.append(cell);
  }

  card.onkeydown = e => {
    if (e.key === 'Escape' && opened) {
      e.preventDefault();
      close();
    }
  };
  gridWrap.append(weekdays, grid);

  const grassScroll = el('div', 'grass-scroll');
  grassScroll.append(months, gridWrap);
  const viewport = el('div', 'grass-viewport');
  const leftFade = el('span', 'grass-scroll-fade grass-scroll-fade--left');
  const rightFade = el('span', 'grass-scroll-fade grass-scroll-fade--right');
  for (const fade of [leftFade, rightFade]) {
    fade.setAttribute('aria-hidden', 'true');
    fade.hidden = true;
  }
  viewport.append(grassScroll, leftFade, rightFade);
  let disposed = false;
  function updateScrollFades() {
    if (disposed || !card.isConnected) return;
    const remaining = grassScroll.scrollWidth - grassScroll.clientWidth;
    leftFade.hidden = grassScroll.scrollLeft <= 1;
    rightFade.hidden = remaining - grassScroll.scrollLeft <= 1;
    const bounds = viewport.getBoundingClientRect();
    const rows = grid.getBoundingClientRect();
    const monthBounds = months.getBoundingClientRect();
    const scrollBounds = grassScroll.getBoundingClientRect();
    const monthLeft = Math.max(0, weekdays.getBoundingClientRect().right - monthBounds.left);
    const monthRight = scrollBounds.right - monthBounds.left;
    // Mask the label row separately so the cell fades retain their original geometry.
    const start = leftFade.hidden ? 'black 0px' : `transparent ${monthLeft}px, black ${monthLeft + 12}px`;
    const end = rightFade.hidden ? 'black 100%' : `black ${monthRight - 12}px, transparent ${monthRight}px`;
    months.style.maskImage = `linear-gradient(to right, ${start}, ${end})`;
    leftFade.style.left = `${weekdays.getBoundingClientRect().right - bounds.left}px`;
    for (const fade of [leftFade, rightFade]) {
      fade.style.top = `${rows.top - bounds.top}px`;
      fade.style.height = `${rows.height}px`;
    }
  }
  grassScroll.addEventListener('scroll', updateScrollFades, {passive: true});
  const resizeObserver = new ResizeObserver(updateScrollFades);
  for (const element of [grassScroll, gridWrap, weekdays]) resizeObserver.observe(element);
  card.addEventListener('dispose', () => {
    disposed = true;
    resizeObserver.disconnect();
    grassScroll.removeEventListener('scroll', updateScrollFades);
  });

  function revealDate(date: string) {
    if (!card.isConnected) return;
    const cell = dayButtons.get(date);
    if (!cell) return;
    const target = cell.getBoundingClientRect(), viewport = grassScroll.getBoundingClientRect();
    grassScroll.scrollLeft += target.left - viewport.left - (viewport.width - target.width) / 2;
    updateScrollFades();
  }
  const revealToday=() => {
    const date = opened ?? (selectedYear === currentYear ? today : null);
    if (date) revealDate(date);
    else updateScrollFades();
  };

  const legend = el('div', 'legend');
  for (const [level, text] of (aggregate?['0%','25%','50%','75%','100%']:['기록 없음', '텍스트 인증', '사진 포함']).entries()) {
    const item = el('span');
    const swatch = el('span', 'swatch');
    if(aggregate){swatch.classList.add('aggregate-cell');swatch.style.setProperty('--aggregate-opacity',String(aggregateDisplayOpacity(level/4)));}
    else swatch.dataset.level = String(level);
    item.append(swatch, document.createTextNode(text));
    legend.append(item);
  }

  const grassFooter = el('div', 'grass-footer');
  grassFooter.append(legend, preview);
  visual.append(viewport, grassFooter);
  content.append(visual, details);
  if(!logs.length && aggregate)card.append(el('p','secondary-text',roster.length?'선택한 연도에 남긴 운동이 없어요.':'첫 잔디를 기다리고 있어요.'));
  card.append(top, content);
  return {element:card,revealToday,openDate:open};
}

