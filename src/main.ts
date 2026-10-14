import './style.css';
import markUrl from '../assets/brand/mark.svg';
import { loadDashboard, loadTimeline } from './api';
import { calendar, dayAt, mondayIndex, shortDate, stats } from './dates';
import type { DashboardData, Member, WorkoutLog } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const config = __PUBLIC_CONFIG__;
let today = dayAt();
let data: DashboardData;
let selected: string | null = null;
let timeline: WorkoutLog[] = [];
let more = false;
let generation = 0;
const cardOpeners = new Map<string, (date: string, log?: WorkoutLog) => void>();

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className = '', text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, action: () => void, className = 'button secondary') {
  const b = el('button', className, text);
  b.type = 'button';
  b.onclick = action;
  return b;
}

// Brand Header
const header = el('header', 'brand-header');
const logo = el('img', 'brand-mark');
logo.src = markUrl;
logo.alt = '';
logo.width = 36;
logo.height = 36;

const brandWrap = el('div', 'brand-wrap');
brandWrap.append(
  el('span', 'brand-name', '고독한 운동가'),
  el('span', 'brand-divider', '·'),
  el('span', 'brand-sub', '운동기록을 챙기는 묵묵, MUKMUK · WORKOUT JOURNAL')
);

const discord = el('a', 'text-link', 'Discord 열기 ↗');
discord.href = 'https://discord.com/channels/1559802401802952706/1559804769327910932';
header.append(logo, brandWrap, discord);

const main = el('main');
const status = el('div', 'status-notice');
status.setAttribute('role', 'status');

// 4 Monthly KPI Cards
const kpiSection = el('section', 'kpi-section');
kpiSection.setAttribute('aria-label', '이번 달 운동 요약');

const feedback = el('p', 'sr-only');
feedback.setAttribute('aria-live', 'polite');

const filters = el('nav', 'member-filter');
filters.setAttribute('aria-label', '멤버 선택');

const cards = el('section', 'cards');
cards.setAttribute('aria-label', '1년 운동 잔디');

const heading = el('div', 'section-heading');
heading.append(el('h2', '', '남겨 둔 운동'), el('span', 'caption', '날짜별 기록 · 최신순'));

const logList = el('section', 'timeline');
logList.setAttribute('aria-label', '운동 메모');

const moreArea = el('div', 'more-area');
main.append(status, kpiSection, filters, cards, heading, logList, moreArea, feedback);

const footer = el('footer', 'footer');
footer.append(
  el('p', 'caption', '공지 채널 시크릿 코드로 인증된 멤버만 열람할 수 있습니다. 사진은 Discord에 남습니다.'),
  el('p', 'caption', '인증은 매시간 수집됩니다. 쉬어 간 날도 그대로 둡니다.')
);

app.replaceChildren(header, main, footer);

function updateStatus() {
  status.className = 'status-notice';
  if (!data.lastSuccess) {
    status.textContent = '아직 인증을 수집하지 않았어요.';
    return;
  }
  const date = new Date(data.lastSuccess);
  const time = new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
  status.textContent = `마지막 수집 · ${time} KST`;
  if (Date.now() - date.getTime() > 2 * 3_600_000) {
    status.classList.add('warning');
    status.append(el('span', '', '새 인증의 반영이 늦어지고 있어요.'));
  }
}

function renderKPIs() {
  kpiSection.replaceChildren();
  const items = [
    { title: '이번 달 고운', value: `${data.kpis.activeMembers}명` },
    { title: '총 운동 일수', value: `${data.kpis.totalWorkoutDays}일` },
    { title: '가장 푸른 요일', value: data.kpis.mostActiveWeekday },
    { title: '1인당 평균 일수', value: `${data.kpis.averageDaysPerMember}일` },
  ];
  for (const item of items) {
    const card = el('div', 'kpi-card');
    card.append(el('div', 'kpi-title', item.title), el('div', 'kpi-value', item.value));
    kpiSection.append(card);
  }
  kpiSection.hidden = selected !== null;
}

function workoutCard(member: Member): HTMLElement {
  const card = el('article', 'workout-card');
  const top = el('div', 'card-heading');
  const cells = calendar(today, 365);
  const firstDate = cells.find(Boolean)!;
  top.append(el('h3', '', member.name), el('span', 'caption', `1년 잔디 · ${shortDate(firstDate)} — ${shortDate(today)}`));

  const metrics = el('dl', 'metrics');
  const counts = stats(member.dates, today);
  for (const [label, value] of [['이번 주', counts.week], ['연속', counts.streak], ['누적', counts.total]] as const) {
    const item = el('div');
    item.append(el('dt', 'caption', label), el('dd', '', `${value}일`));
    metrics.append(item);
  }

  const content = el('div', 'grass-content');
  const visual = el('div', 'grass-visual');
  const months = el('div', 'month-labels');
  const gridWrap = el('div', 'grid-wrap');
  const weekdays = el('div', 'weekday-labels');
  for (const d of ['월', '화', '수', '목', '금', '토', '일']) weekdays.append(el('span', '', d));

  const grid = el('div', 'grass-grid');
  grid.setAttribute('role', 'group');
  grid.setAttribute('aria-label', `${member.name}의 1년 잔디, 화살표로 날짜 이동`);

  const details = el('section', 'date-detail');
  details.hidden = true;
  details.setAttribute('aria-label', '날짜 상세');
  const preview = el('p', 'grass-preview caption', '날짜를 선택하면 운동 메모를 볼 수 있어요.');

  const dayButtons = new Map<string, HTMLButtonElement>();
  let opened: string | null = null;
  let openedLog: WorkoutLog | undefined;

  const memoFor = (date: string) =>
    openedLog?.log_date === date ? openedLog : data.logs.find(r => r.user_id === member.id && r.log_date === date);
  const levelFor = (date: string) => (!member.dates.has(date) ? 0 : member.photos.has(date) ? 2 : 1);
  const description = (date: string, log = memoFor(date)) =>
    `${shortDate(date)} · ${['기록 없음', '텍스트 인증', '사진 포함 인증'][levelFor(date)]}${log ? ` · ${log.memo || '사진 인증'}` : ''}`;

  function close() {
    const date = opened;
    opened = null;
    openedLog = undefined;
    details.hidden = true;
    for (const cell of dayButtons.values()) cell.setAttribute('aria-expanded', 'false');
    if (date) dayButtons.get(date)?.focus();
  }

  function open(date: string, log?: WorkoutLog) {
    if (opened === date && !log) {
      close();
      return;
    }
    opened = date;
    openedLog = log;
    const title = el('div', 'detail-heading');
    const closeButton = button('×', close, 'button icon-button');
    closeButton.setAttribute('aria-label', '날짜 상세 닫기');
    title.append(el('h4', '', `${date} · ${['기록 없음', '텍스트 인증', '사진 포함 인증'][levelFor(date)]}`), closeButton);
    details.replaceChildren(title, el('p', 'memo', memoFor(date)?.memo || (levelFor(date) ? '사진 인증' : '기록 없음')));
    details.hidden = false;
    for (const [d, cell] of dayButtons) cell.setAttribute('aria-expanded', String(d === date));
  }

  cardOpeners.set(member.id, (date, log) => {
    open(date, log);
    details.scrollIntoView({ block: 'nearest', behavior: 'instant' });
  });

  let previousMonth = '';
  for (let i = 0; i < cells.length; i += 7) {
    const date = cells.slice(i, i + 7).find(Boolean);
    const month = date?.slice(5, 7) ?? '';
    const label = el('span', '', month && month !== previousMonth ? `${Number(month)}월` : '');
    months.append(label);
    previousMonth = month;
  }

  const dates = cells.filter((d): d is string => d !== null);

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
    cell.dataset.level = String(levelFor(date));
    cell.tabIndex = date === today ? 0 : -1;
    cell.setAttribute('aria-label', description(date));
    cell.setAttribute('aria-expanded', 'false');
    cell.onfocus = () => {
      for (const [d, b] of dayButtons) b.tabIndex = d === date ? 0 : -1;
      preview.textContent = description(date);
    };
    cell.onmouseenter = () => {
      preview.textContent = description(date);
    };
    cell.onmouseleave = () => {
      if (document.activeElement !== cell) preview.textContent = '날짜를 선택하면 운동 메모를 볼 수 있어요.';
    };
    cell.onkeydown = e => {
      const delta = ({ ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 } as Record<string, number>)[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        if ((e.key === 'ArrowUp' && mondayIndex(date) === 0) || (e.key === 'ArrowDown' && mondayIndex(date) === 6)) return;
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

  const legend = el('div', 'legend');
  for (const [level, text] of ['기록 없음', '텍스트 인증', '사진 포함'].entries()) {
    const item = el('span');
    const swatch = el('span', 'swatch');
    swatch.dataset.level = String(level);
    item.append(swatch, document.createTextNode(text));
    legend.append(item);
  }

  visual.append(grassScroll, legend, preview);
  content.append(visual, details);
  card.append(top, metrics, content);
  return card;
}

function renderCards() {
  cardOpeners.clear();
  cards.replaceChildren();
  const members = data.members.filter(m => !selected || m.id === selected);
  if (!members.length) {
    const empty = el('div', 'empty-card');
    empty.append(
      el('h3', '', '첫 잔디를 기다리고 있어요.'),
      el('p', 'secondary-text', '#오운완에 오늘의 운동을 남겨 보세요.')
    );
    cards.append(empty);
  } else {
    members.forEach(m => cards.append(workoutCard(m)));
  }
}

function renderTimeline() {
  const isMemberSelected = selected !== null;
  heading.hidden = !isMemberSelected;
  logList.hidden = !isMemberSelected;
  moreArea.hidden = !isMemberSelected;

  if (!isMemberSelected) return;

  logList.replaceChildren();
  for (const log of timeline) {
    const item = el('article', 'timeline-item');
    const name = data.members.find(m => m.id === log.user_id)?.name ?? log.username;
    const top = el('div', 'timeline-meta');
    top.append(
      button(shortDate(log.log_date), () => cardOpeners.get(log.user_id)?.(log.log_date, log), 'date-button'),
      el('span', 'caption', `${name}${log.has_photo ? ' · 사진 포함' : ''}`)
    );
    item.append(top, el('p', 'memo', log.memo || '사진 인증'));
    logList.append(item);
  }
  if (!timeline.length) logList.append(el('p', 'secondary-text', '아직 남긴 운동 기록이 없어요.'));
  moreArea.replaceChildren();
  if (more) moreArea.append(button('더 보기', () => void fetchTimeline(true)));
}

function fetchTimeline(append: boolean) {
  if (!selected) {
    timeline = [];
    more = false;
    renderTimeline();
    return;
  }
  const offset = append ? timeline.length : 0;
  const rows = loadTimeline(data.logs, selected, offset, 30);
  timeline = append ? [...timeline, ...rows] : rows;
  more = offset + rows.length < data.logs.filter(l => l.user_id === selected).length;
  renderTimeline();
  feedback.textContent = `${timeline.length}개의 기록일을 표시합니다.`;
}

function renderFilters() {
  filters.replaceChildren();
  for (const member of [{ id: null, name: '전체 멤버' }, ...data.members]) {
    const b = button(member.name, () => {
      selected = member.id;
      filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      renderKPIs();
      renderCards();
      fetchTimeline(false);
    }, 'filter-button');
    b.setAttribute('aria-pressed', String(member.id === selected));
    filters.append(b);
  }
}

function showAuthModal(errorMsg?: string) {
  const backdrop = el('div', 'modal-backdrop');
  const box = el('div', 'modal-box');
  box.append(
    el('h3', '', '시크릿 코드 인증'),
    el('p', '', '고독한 운동가 Discord #공지 채널에 게시된 이번 주 시크릿 코드를 입력해 주세요.')
  );

  const form = el('form', 'modal-form');
  form.onsubmit = e => {
    e.preventDefault();
    const inputVal = input.value.trim().toLowerCase();
    if (inputVal) {
      localStorage.setItem('mukmuk_secret_code', inputVal);
      backdrop.remove();
      void init();
    }
  };

  const input = el('input', 'modal-input') as HTMLInputElement;
  input.placeholder = 'mukmuk-xxxx';
  input.autocomplete = 'off';
  input.required = true;

  if (errorMsg) {
    form.append(el('div', 'modal-error', errorMsg));
  }

  const submitBtn = button('확인', () => form.requestSubmit(), 'button primary');
  form.append(input, submitBtn);
  box.append(form);
  backdrop.append(box);
  app.append(backdrop);
  input.focus();
}

async function init() {
  ++generation;
  app.setAttribute('aria-busy', 'true');
  cards.replaceChildren(el('div', 'loading-placeholder', '운동 기록을 불러오고 있어요.'));

  // 1. Check URL search query for code
  const urlParams = new URLSearchParams(window.location.search);
  const queryCode = urlParams.get('code');
  if (queryCode) {
    localStorage.setItem('mukmuk_secret_code', queryCode.trim().toLowerCase());
    window.history.replaceState({}, '', window.location.pathname);
  }

  const code = (localStorage.getItem('mukmuk_secret_code') || '').trim().toLowerCase();
  if (!code) {
    app.setAttribute('aria-busy', 'false');
    cards.replaceChildren();
    showAuthModal();
    return;
  }

  try {
    today = dayAt();
    data = await loadDashboard(config, code);
    selected = null;
    updateStatus();
    renderKPIs();
    renderFilters();
    renderCards();
    fetchTimeline(false);
    feedback.textContent = '운동 기록을 불러왔어요.';
  } catch (err: any) {
    filters.replaceChildren();
    kpiSection.replaceChildren();
    heading.hidden = true;
    logList.hidden = true;
    moreArea.replaceChildren();

    const isSecretError = err?.message?.includes('invalid_or_expired_secret');
    if (isSecretError) {
      localStorage.removeItem('mukmuk_secret_code');
      showAuthModal('시크릿 코드가 올바르지 않거나 만료되었습니다.');
    } else {
      const error = el('div', 'empty-card error-state');
      error.append(
        el('p', '', '기록을 불러오지 못했어요.'),
        button('다시 불러오기', () => void init(), 'button primary')
      );
      cards.replaceChildren(error);
    }
  } finally {
    app.setAttribute('aria-busy', 'false');
  }
}

void init();
