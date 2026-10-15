import './style.css';
import markUrl from '../assets/brand/mark.svg';
import { loadDashboard, loadTimeline } from './api';
import { dayAt, shortDate } from './dates';
import {el,button} from './dom';
import {renderGrassCard} from './grass-card';
import type { DashboardData, WorkoutLog } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const config = __PUBLIC_CONFIG__;
let today = dayAt();
let data: DashboardData;
const currentYear = Number(today.slice(0, 4));
let selectedYear = currentYear;
let years = Array.from({ length: 5 }, (_, i) => currentYear - i).filter(y => y > 0);
let currentKPIs: DashboardData['kpis'] | undefined;
const knownMembers = new Map<string, string>();
let selected: string | null = null;
let timeline: WorkoutLog[] = [];
let more = false;
let generation = 0;
const cardReveals = new Map<string, () => void>();
const cardOpeners = new Map<string, (date: string, log?: WorkoutLog) => void>();

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
cards.setAttribute('aria-label', '연도별 운동 잔디');
const yearBar = el('div', 'year-bar');
yearBar.hidden = true;
const yearFilters = el('nav', 'year-filter');
yearFilters.setAttribute('aria-label', '잔디 연도 선택');
const yearTitle = el('div');
const todayCaption = el('p', 'caption');
yearTitle.append(el('h2', '', '연도별 운동 잔디'), todayCaption);
yearBar.append(yearTitle, yearFilters);

const heading = el('div', 'section-heading');
heading.append(el('h2', '', '남겨 둔 운동'), el('span', 'caption', '날짜별 기록 · 최신순'));

const logList = el('section', 'timeline');
logList.setAttribute('aria-label', '운동 메모');

const moreArea = el('div', 'more-area');
main.append(status, kpiSection, filters, yearBar, cards, heading, logList, moreArea, feedback);

const footer = el('footer', 'footer');
footer.append(
  el('p', 'caption', '공지 채널 시크릿 코드로 인증된 멤버만 열람할 수 있습니다. 사진은 Discord에 남습니다.'),
  el('p', 'caption', '인증은 약 5분 간격으로 수집됩니다. 쉬어 간 날도 그대로 둡니다.')
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
  const kpis = currentKPIs ?? data.kpis;
  const items = [
    { title: '이번 달 고운', value: `${kpis.activeMembers}명` },
    { title: '총 운동 일수', value: `${kpis.totalWorkoutDays}일` },
    { title: '가장 푸른 요일', value: kpis.mostActiveWeekday },
    { title: '1인당 평균 일수', value: `${kpis.averageDaysPerMember}일` },
  ];
  for (const item of items) {
    const card = el('div', 'kpi-card');
    card.append(el('div', 'kpi-title', item.title), el('div', 'kpi-value', item.value));
    kpiSection.append(card);
  }
  kpiSection.hidden = selected !== null;
}

function renderCards() {
  todayCaption.textContent = `오늘 · ${today} KST`;
  cardOpeners.clear();cardReveals.clear();
  const member=selected?(data.members.find(m=>m.id===selected)??{id:selected,name:knownMembers.get(selected)??selected,dates:new Set<string>(),photos:new Set<string>()}):null;
  const card=renderGrassCard({year:selectedYear,today,member,roster:data.roster,logs:data.logs,currentStats:data.currentStats});
  cards.replaceChildren(card.element);
  cardOpeners.set(selected??'ALL',card.openDate);cardReveals.set(selected??'ALL',card.revealToday);
  requestAnimationFrame(card.revealToday);
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
  for (const member of [{ id: null, name: '전체 멤버' }, ...[...knownMembers].sort((a,b)=>a[1].localeCompare(b[1],'ko') || a[0].localeCompare(b[0])).map(([id,name])=>({id,name}))]) {
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

function renderYears() {
  yearBar.hidden = false;
  yearFilters.replaceChildren();
  for (const year of years) {
    const b = button(`${year}년`, () => {
      selectedYear = year;
      yearFilters.querySelectorAll('[aria-pressed]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      void init(true);
    }, 'filter-button');
    b.setAttribute('aria-pressed', String(year === selectedYear));
    yearFilters.append(b);
  }
  if (years.at(-1)! > 1) {
    yearFilters.append(button('이전 연도 더 보기', () => {
      const last = years.at(-1)!;
      years = [...years, ...Array.from({length:5}, (_,i)=>last-i-1).filter(y=>y>0)];
      renderYears();
      yearFilters.querySelectorAll<HTMLButtonElement>('button').item(years.length - 5)?.focus();
    }, 'button secondary'));
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

async function init(preserveSelection = false) {
  const request = ++generation;
  const requestedYear = selectedYear;
  app.setAttribute('aria-busy', 'true');
  cards.replaceChildren(el('div', 'loading-placeholder', '운동 기록을 불러오고 있어요.'));
  filters.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
  heading.hidden = true;
  logList.hidden = true;
  moreArea.hidden = true;

  // 1. Check URL search query for code
  const urlParams = new URLSearchParams(window.location.search);
  const queryCode = urlParams.get('code');
  if (queryCode) {
    localStorage.setItem('mukmuk_secret_code', queryCode.trim().toLowerCase());
    urlParams.delete('code');
    const remaining = urlParams.toString();
    window.history.replaceState({}, '', window.location.pathname + (remaining ? `?${remaining}` : '') + window.location.hash);
  }

  const code = (localStorage.getItem('mukmuk_secret_code') || '').trim().toLowerCase();
  if (!code) {
    app.setAttribute('aria-busy', 'false');
    cards.replaceChildren();
    yearBar.hidden = true;
    showAuthModal();
    return;
  }

  try {
    today = dayAt();
    const loaded = await loadDashboard(config, code, requestedYear);
    if (request !== generation) return;
    data = loaded;
    if (requestedYear === currentYear) currentKPIs = data.kpis;
    for (const member of data.roster) {
      if (requestedYear === currentYear || !knownMembers.has(member.id)) knownMembers.set(member.id, member.name);
    }
    if (!preserveSelection) selected = null;
    if (!yearFilters.children.length) renderYears();
    yearBar.hidden = false;
    updateStatus();
    renderKPIs();
    renderFilters();
    renderCards();
    fetchTimeline(false);
    feedback.textContent = '운동 기록을 불러왔어요.';
  } catch (err: any) {
    if (request !== generation) return;
    filters.replaceChildren();
    kpiSection.replaceChildren();
    heading.hidden = true;
    logList.hidden = true;
    moreArea.replaceChildren();

    const isSecretError = err?.message?.includes('invalid_or_expired_secret');
    if (isSecretError) {
      localStorage.removeItem('mukmuk_secret_code');
      yearBar.hidden = true;
      showAuthModal('시크릿 코드가 올바르지 않거나 만료되었습니다.');
    } else {
      const error = el('div', 'empty-card error-state');
      error.append(
        el('p', '', '기록을 불러오지 못했어요.'),
        button('다시 불러오기', () => void init(true), 'button primary')
      );
      cards.replaceChildren(error);
    }
  } finally {
    if (request === generation) app.setAttribute('aria-busy', 'false');
  }
}

window.addEventListener('resize', () => requestAnimationFrame(() => cardReveals.forEach(reveal => reveal())));
void init();
