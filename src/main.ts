import './style.css';
import markUrl from '../assets/brand/mark.svg';
import { loadDashboard, loadTimeline } from './api';
import { dayAt, shortDate } from './dates';
import {el,button} from './dom';
import {photoSection} from './photo-view';
import {renderGrassCard} from './grass-card';
import {renderDashboardControls} from './dashboard-controls';
import type { DashboardData, WorkoutLog } from './types';

const app = document.querySelector<HTMLDivElement>('#app')!;
const config = __PUBLIC_CONFIG__;
let today = dayAt();
let data: DashboardData;
const currentYear = Number(today.slice(0, 4));
let selectedYear = currentYear;
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
  el('span', 'brand-sub', '잔디 심는 묵묵, MUKMUK · WORKOUT JOURNAL')
);

const status = el('div', 'status-notice');
status.setAttribute('role', 'status');

const discord = el('a', 'discord-link');
discord.href = 'https://discord.com/channels/1559802401802952706/1559804769327910932';
discord.target = '_blank';
discord.rel = 'noopener noreferrer';
discord.setAttribute('aria-label', 'Discord 채널 열기');
discord.setAttribute('title', 'Discord 채널 열기');

const discordSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
discordSvg.setAttribute('viewBox', '0 0 24 24');
discordSvg.setAttribute('width', '20');
discordSvg.setAttribute('height', '20');
discordSvg.setAttribute('fill', 'currentColor');
discordSvg.setAttribute('aria-hidden', 'true');
const discordPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
discordPath.setAttribute('d', 'M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.929 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.894.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z');
discordSvg.append(discordPath);
discord.append(discordSvg);

const headerActions = el('div', 'header-actions');
headerActions.append(status, discord);
header.append(logo, brandWrap, headerActions);

const main = el('main');

// Monthly KPI Cards: king first, then four summaries
const kpiSection = el('section', 'kpi-section');
kpiSection.setAttribute('aria-label', '이번 달 운동 요약');

const feedback = el('p', 'sr-only');
feedback.setAttribute('aria-live', 'polite');

const filters = el('div', 'controls-slot');

const cards = el('section', 'cards');
cards.setAttribute('aria-label', '연도별 운동 잔디');
const yearBar = el('div', 'year-bar');
yearBar.hidden = true;
const yearFilters = el('aside', 'year-filter');
yearFilters.setAttribute('aria-label', '연도 탐색');
const yearTitle = el('div');
const todayCaption = el('p', 'caption');
yearTitle.append(el('h2', '', '연도별 운동 잔디'), todayCaption);
yearBar.append(yearTitle);
const boardLayout=el('div','dashboard-layout');boardLayout.append(cards,yearFilters);

const heading = el('div', 'section-heading');
heading.append(el('h2', '', '남겨 둔 운동'), el('span', 'caption', '날짜별 기록 · 최신순'));

const logList = el('section', 'timeline');
logList.setAttribute('aria-label', '운동 메모');

const moreArea = el('div', 'more-area');
main.append(kpiSection, filters, yearBar, boardLayout, heading, logList, moreArea, feedback);

const footer = el('footer', 'footer');
footer.append(
  el('p', 'caption', '공지 채널 시크릿 코드로 인증된 멤버만 열람할 수 있습니다. 사진은 기록을 펼친 뒤 선택해서 볼 수 있으며, 원본은 Discord에 남습니다.'),
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
  const king=el('div','kpi-card kpi-card--king');
  king.append(el('div','kpi-title','운동왕 👑'));
  if(!kpis.workoutKings.length)king.append(el('div','kpi-value','아직 없어요'));
  else {
    for(const winner of kpis.workoutKings){
      const person=el('div','king-member');
      person.append(el('div','kpi-value',winner.name));
      king.append(person);
    }
  }
  kpiSection.append(king);
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
  const card=renderGrassCard({year:selectedYear,today,member,roster:data.roster,logs:data.logs,currentStats:data.currentStats,
    photos:log=>photoSection(config,()=>localStorage.getItem('mukmuk_secret_code')??'',log.user_id,log.log_date,knownMembers.get(log.user_id)??log.username)});
  cards.firstElementChild?.dispatchEvent(new Event('dispose'));
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
  const focused=(document.activeElement as HTMLElement)?.dataset.control;
  filters.firstElementChild?.dispatchEvent(new Event('dispose'));
  const controls=renderDashboardControls({
    roster:data.roster,selectedMemberId:selected,selectedYear,
    onMemberChange:id=>{selected=id;renderKPIs();renderCards();fetchTimeline(false);},
    onYearChange:year=>{selectedYear=year;void init(true);},
  });
  filters.replaceChildren(controls);
  yearFilters.replaceChildren(controls.querySelector('.year-controls')!);
  if(focused)document.querySelectorAll<HTMLElement>('[data-control]').forEach(e=>{if(e.dataset.control===focused)e.focus({preventScroll:true});});
}

function showAuthModal(errorMsg?: string) {
  const backdrop = el('div', 'modal-backdrop');
  const box = el('div', 'modal-box');
  box.append(
    el('h3', '', '시크릿 코드 인증'),
    el('p', '', '고독한 운동가 Discord #공지 채널에 게시된 이번 달 시크릿 코드를 입력해 주세요.')
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
  cards.firstElementChild?.dispatchEvent(new Event('dispose'));
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
    currentKPIs = data.kpis;
    knownMembers.clear();
    for (const member of data.roster) {
      knownMembers.set(member.id, member.name);
    }
    if (!preserveSelection) selected = null;
    yearBar.hidden = false;
    updateStatus();
    renderKPIs();
    renderFilters();
    renderCards();
    fetchTimeline(false);
    feedback.textContent = '운동 기록을 불러왔어요.';
  } catch (err: any) {
    if (request !== generation) return;
    filters.firstElementChild?.dispatchEvent(new Event('dispose'));
    filters.replaceChildren();
    kpiSection.replaceChildren();
    heading.hidden = true;
    logList.hidden = true;
    moreArea.replaceChildren();

    const isSecretError = err?.message?.includes('invalid_or_expired_secret');
    if (isSecretError) {
      localStorage.removeItem('mukmuk_secret_code');
      yearBar.hidden = true;
      yearFilters.replaceChildren();cards.replaceChildren();
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
