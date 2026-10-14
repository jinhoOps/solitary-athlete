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
  const node = document.createElement(tag); node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text: string, action: () => void, className = 'button secondary') {
  const b = el('button', className, text); b.type = 'button'; b.onclick = action; return b;
}

const header = el('header', 'brand-header');
const logo = el('img', 'brand-mark'); logo.src = markUrl; logo.alt = ''; logo.width = 44; logo.height = 44;
const brand = el('div'); brand.append(el('div', 'brand-name', '고독한 운동가'), el('div', 'caption', '운동 기록을 챙기는 묵묵'));
const discord = el('a', 'text-link', 'Discord 열기 ↗');
discord.href = 'https://discord.com/channels/1559802401802952706/1559804769327910932';
header.append(logo, brand, discord);
const main = el('main');
const intro = el('section', 'intro');
intro.append(el('p', 'eyebrow', 'MUKMUK · WORKOUT JOURNAL'), el('h1', '', '오늘도 묵묵히, 잔디 한 칸.'),
  el('p', 'secondary-text', '각자의 리듬으로 남긴 운동. 작은 기록을 함께 돌아봐요.'));
const status = el('div', 'status-notice'); status.setAttribute('role', 'status');
const feedback = el('p', 'sr-only'); feedback.setAttribute('aria-live', 'polite');
const filters = el('nav', 'member-filter'); filters.setAttribute('aria-label', '멤버 선택');
const cards = el('section', 'cards'); cards.setAttribute('aria-label', '최근 84일 운동 잔디');
const heading = el('div', 'section-heading'); heading.append(el('h2', '', '남겨 둔 운동'), el('span', 'caption', '날짜별 기록 · 최신순'));
const logList = el('section', 'timeline'); logList.setAttribute('aria-label', '운동 메모');
const moreArea = el('div', 'more-area');
main.append(intro, status, filters, cards, heading, logList, moreArea, feedback);
const footer = el('footer', 'footer');
footer.append(el('p', 'caption', '표시명·사용자 ID·운동 날짜·텍스트 메모가 공개됩니다. 사진은 Discord에 남습니다.'),
  el('p', 'caption', '인증은 매시간 수집됩니다. 쉬어 간 날도 그대로 둡니다.'));
app.replaceChildren(header, main, footer);

function updateStatus() {
  status.className = 'status-notice';
  if (!data.lastSuccess) { status.textContent = '아직 인증을 수집하지 않았어요.'; return; }
  const date = new Date(data.lastSuccess);
  const time = new Intl.DateTimeFormat('ko-KR', { timeZone: 'Asia/Seoul', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(date);
  status.textContent = `마지막 수집 · ${time} KST`;
  if (Date.now() - date.getTime() > 2 * 3_600_000) {
    status.classList.add('warning'); status.append(el('span', '', '새 인증의 반영이 늦어지고 있어요.'));
  }
}

function workoutCard(member: Member): HTMLElement {
  const card = el('article', 'workout-card');
  const top = el('div', 'card-heading');
  top.append(el('h3', '', member.name), el('span', 'caption', `최근 84일 · ${shortDate(calendar(today).find(Boolean)!)} — ${shortDate(today)}`));
  const metrics = el('dl', 'metrics');
  const counts = stats(member.dates, today);
  for (const [label, value] of [['이번 주', counts.week], ['연속', counts.streak], ['누적', counts.total]] as const) {
    const item = el('div'); item.append(el('dt', 'caption', label), el('dd', '', `${value}일`)); metrics.append(item);
  }
  const content = el('div', 'grass-content');
  const visual = el('div', 'grass-visual');
  const months = el('div', 'month-labels');
  const gridWrap = el('div', 'grid-wrap');
  const weekdays = el('div', 'weekday-labels');
  for (const d of ['월', '화', '수', '목', '금', '토', '일']) weekdays.append(el('span', '', d));
  const grid = el('div', 'grass-grid'); grid.setAttribute('role', 'group'); grid.setAttribute('aria-label', `${member.name}의 84일 잔디, 화살표로 날짜 이동`);
  const details = el('section', 'date-detail'); details.hidden = true;
  details.setAttribute('aria-label', '날짜 상세');
  const preview = el('p', 'grass-preview caption', '날짜를 선택하면 운동 메모를 볼 수 있어요.');
  const dayButtons = new Map<string, HTMLButtonElement>();
  let opened: string | null = null;
  let openedLog: WorkoutLog | undefined;
  const memoFor = (date: string) => openedLog?.log_date === date ? openedLog : data.logs.find(r => r.user_id === member.id && r.log_date === date);
  const levelFor = (date: string) => !member.dates.has(date) ? 0 : member.photos.has(date) ? 2 : 1;
  const description = (date: string, log = memoFor(date)) => `${shortDate(date)} · ${['기록 없음', '텍스트 인증', '사진 포함 인증'][levelFor(date)]}${log ? ` · ${log.memo || '사진 인증'}` : ''}`;
  function close() {
    const date = opened; opened = null; openedLog = undefined; details.hidden = true;
    for (const cell of dayButtons.values()) cell.setAttribute('aria-expanded', 'false');
    if (date) dayButtons.get(date)?.focus();
  }
  function open(date: string, log?: WorkoutLog) {
    if (opened === date && !log) { close(); return; }
    opened = date; openedLog = log;
    const title = el('div', 'detail-heading');
    const closeButton = button('×', close, 'button icon-button'); closeButton.setAttribute('aria-label', '날짜 상세 닫기');
    title.append(el('h4', '', `${date} · ${['기록 없음', '텍스트 인증', '사진 포함 인증'][levelFor(date)]}`), closeButton);
    details.replaceChildren(title, el('p', 'memo', memoFor(date)?.memo || (levelFor(date) ? '사진 인증' : '기록 없음')));
    details.hidden = false;
    for (const [d, cell] of dayButtons) cell.setAttribute('aria-expanded', String(d === date));
  }
  cardOpeners.set(member.id, (date, log) => { open(date, log); details.scrollIntoView({ block: 'nearest', behavior: 'instant' }); });
  const cells = calendar(today);
  let previousMonth = '';
  for (let i = 0; i < cells.length; i += 7) {
    const date = cells.slice(i, i + 7).find(Boolean);
    const month = date?.slice(5, 7) ?? '';
    const label = el('span', '', month && month !== previousMonth ? `${Number(month)}월` : ''); months.append(label); previousMonth = month;
  }
  const dates = cells.filter((d): d is string => d !== null);
  function focusDate(date: string) {
    for (const [d, cell] of dayButtons) cell.tabIndex = d === date ? 0 : -1;
    dayButtons.get(date)?.focus();
  }
  for (const date of cells) {
    if (!date) { grid.append(el('span', 'grass-padding')); continue; }
    const cell = button('', () => open(date), 'grass-cell');
    cell.dataset.date = date; cell.dataset.level = String(levelFor(date)); cell.tabIndex = date === today ? 0 : -1;
    cell.setAttribute('aria-label', description(date)); cell.setAttribute('aria-expanded', 'false');
    cell.onfocus = () => {
      for (const [d, b] of dayButtons) b.tabIndex = d === date ? 0 : -1;
      preview.textContent = description(date);
    };
    cell.onmouseenter = () => { preview.textContent = description(date); };
    cell.onmouseleave = () => { if (document.activeElement !== cell) preview.textContent = '날짜를 선택하면 운동 메모를 볼 수 있어요.'; };
    cell.onkeydown = e => {
      const delta = ({ ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 } as Record<string, number>)[e.key];
      if (delta !== undefined) {
        e.preventDefault();
        if ((e.key === 'ArrowUp' && mondayIndex(date) === 0) || (e.key === 'ArrowDown' && mondayIndex(date) === 6)) return;
        const next = dates[dates.indexOf(date) + delta]; if (next) focusDate(next);
      }
    };
    dayButtons.set(date, cell); grid.append(cell);
  }
  card.onkeydown = e => { if (e.key === 'Escape' && opened) { e.preventDefault(); close(); } };
  gridWrap.append(weekdays, grid);
  const legend = el('div', 'legend');
  for (const [level, text] of ['기록 없음', '텍스트 인증', '사진 포함'].entries()) {
    const item = el('span'); const swatch = el('span', 'swatch'); swatch.dataset.level = String(level); item.append(swatch, document.createTextNode(text)); legend.append(item);
  }
  visual.append(months, gridWrap, legend, preview); content.append(visual, details); card.append(top, metrics, content); return card;
}

function renderCards() {
  cardOpeners.clear(); cards.replaceChildren();
  const members = data.members.filter(m => !selected || m.id === selected);
  if (!members.length) {
    const empty = el('div', 'empty-card'); empty.append(el('h3', '', '첫 잔디를 기다리고 있어요.'),
      el('p', 'secondary-text', '#오운완-인증에 오늘의 운동을 남겨 보세요.')); cards.append(empty);
  } else members.forEach(m => cards.append(workoutCard(m)));
}
function renderTimeline() {
  logList.replaceChildren();
  for (const log of timeline) {
    const item = el('article', 'timeline-item');
    const name = data.members.find(m => m.id === log.user_id)?.name ?? log.username;
    const top = el('div', 'timeline-meta');
    top.append(button(shortDate(log.log_date), () => cardOpeners.get(log.user_id)?.(log.log_date, log), 'date-button'),
      el('span', 'caption', `${name}${log.has_photo ? ' · 사진 포함' : ''}`));
    item.append(top, el('p', 'memo', log.memo || '사진 인증')); logList.append(item);
  }
  if (!timeline.length) logList.append(el('p', 'secondary-text', '아직 남긴 운동 기록이 없어요.'));
  moreArea.replaceChildren();
  if (more) moreArea.append(button('더 보기', () => void fetchTimeline(true)));
}
async function fetchTimeline(append: boolean) {
  const requestId = ++generation;
  const filter = selected;
  const offset = append ? timeline.length : 0;
  const control = moreArea.querySelector('button'); if (control) control.disabled = true;
  try {
    const rows = await loadTimeline(config, filter, offset);
    if (requestId !== generation) return;
    timeline = append ? [...timeline, ...rows] : rows; more = rows.length === 30; renderTimeline();
    feedback.textContent = `${timeline.length}개의 기록일을 표시합니다.`;
  } catch {
    if (requestId !== generation) return;
    moreArea.replaceChildren(el('p', 'error-text', append ? '나머지 기록을 불러오지 못했어요.' : '기록을 불러오지 못했어요.'),
      button('다시 시도', () => void fetchTimeline(append), 'button primary'));
  }
}
function renderFilters() {
  filters.replaceChildren();
  for (const member of [{ id: null, name: '전체 멤버' }, ...data.members]) {
    const b = button(member.name, () => {
      selected = member.id;
      filters.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
      renderCards(); timeline = []; more = false; logList.replaceChildren(el('p', 'secondary-text', '운동 기록을 불러오고 있어요.'));
      moreArea.replaceChildren(); void fetchTimeline(false);
    }, 'filter-button');
    b.setAttribute('aria-pressed', String(member.id === selected)); filters.append(b);
  }
}
async function init() {
  ++generation; app.setAttribute('aria-busy', 'true');
  cards.replaceChildren(el('div', 'loading-placeholder', '운동 기록을 불러오고 있어요.'));
  try {
    today = dayAt();
    const [snapshot, rows] = await Promise.all([loadDashboard(config, today), loadTimeline(config, null, 0)]);
    data = snapshot; timeline = rows; more = rows.length === 30; selected = null;
    updateStatus(); renderFilters(); renderCards(); renderTimeline(); feedback.textContent = '운동 기록을 불러왔어요.';
  } catch {
    filters.replaceChildren(); status.textContent = '공개 운동 기록'; logList.replaceChildren(); moreArea.replaceChildren();
    const error = el('div', 'empty-card error-state'); error.append(el('p', '', '기록을 불러오지 못했어요.'),
      button('다시 불러오기', () => void init(), 'button primary')); cards.replaceChildren(error);
  } finally { app.setAttribute('aria-busy', 'false'); }
}
void init();
