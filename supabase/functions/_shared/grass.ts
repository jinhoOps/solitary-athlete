import { shiftDay, stats } from '../../../src/dates.ts';
import type { WorkoutLog } from '../../../src/types.ts';
export function safeText(text: string, max: number): string {
  return text.replace(/@/g, '＠').replace(/[`*_~<>]/g, '').replace(/[\r\n]+/g, ' / ').slice(0, max);
}
export function formatGrass(name: string, rows: WorkoutLog[], today: string, lastSuccess: string | null,
  dashboardUrl = '', emojis?: [string | undefined, string | undefined]): string {
  const dates = new Set(rows.map(r => r.log_date));
  const photos = new Set(rows.filter(r => r.has_photo).map(r => r.log_date));
  const counts = stats(dates, today);
  const icons = emojis?.every(Boolean) ? ['⬜', `<:mukmuk_grass:${emojis[0]}>`, `<:mukmuk_photo:${emojis[1]}>`] : ['⬜', '🟩', '🌲'];
  const cells = Array.from({length:28}, (_, i) => {
    const d = shiftDay(today, i - 27); return icons[photos.has(d) ? 2 : dates.has(d) ? 1 : 0];
  });
  const grass = Array.from({length:4}, (_, i) => cells.slice(i * 7, i * 7 + 7).join('')).join('\n');
  const header = `🌱 묵묵 · ${safeText(name,48)}님의 운동 잔디\n최근 28일 · ${shiftDay(today,-27)} — ${today}\n\n${grass}\n\n이번 주 ${counts.week}일 · 연속 ${counts.streak}일 · 누적 ${counts.total}일\n${icons[0]} 기록 없음 · ${icons[1]} 텍스트 · ${icons[2]} 사진 포함\n\n최근 기록일 5개\n`;
  const footer = `\n\n마지막 수집 · ${lastSuccess ? new Date(lastSuccess).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})+' KST' : '아직 인증을 수집하지 않았어요.'}\n이 메시지는 5분 뒤 사라져요.${dashboardUrl ? '\n[웹보드 바로 가기]('+dashboardUrl+')' : ''}`;
  const recent = rows.filter(r => r.log_date <= today).slice(0,5);
  const budget = Math.min(160, Math.max(20, Math.floor((1900-header.length-footer.length)/5)-36));
  return header + (recent.map(r => `${r.log_date.slice(5).replace('-','.')} · ${safeText(r.memo || '사진 인증',budget)}${r.memo.length>budget?'…':''}${r.has_photo?' [사진 인증]':''}`).join('\n') || '아직 남긴 운동 기록이 없어요.') + footer;
}
