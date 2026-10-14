import { describe, expect, it } from 'vitest';
import { dayAt, stats, calendar, calendarYear } from '../../src/dates';

describe('KST calendar and exercise days', () => {
  it('changes day at KST midnight, independently of the browser zone', () => {
    expect(dayAt(new Date('2026-10-13T14:59:59Z'))).toBe('2026-10-13');
    expect(dayAt(new Date('2026-10-13T15:00:00Z'))).toBe('2026-10-14');
  });
  it('uses calendar week and yesterday grace, including old lifetime history', () => {
    expect(stats(new Set(['2025-01-01', '2026-10-11', '2026-10-12', '2026-10-13']), '2026-10-14'))
      .toEqual({ week: 2, streak: 3, total: 4 });
    expect(stats(new Set(['2026-10-14', '2026-10-15']), '2026-10-14'))
      .toEqual({ week: 1, streak: 1, total: 1 });
  });
  it('aligns 365 dates to Monday rows with non-date padding by default', () => {
    const cells = calendar('2026-10-14');
    expect(cells.filter(Boolean)).toHaveLength(365);
    expect(cells.filter(Boolean).at(-1)).toBe('2026-10-14');
    expect(cells.length % 7).toBe(0);

    const cells84 = calendar('2026-10-14', 84);
    expect(cells84.filter(Boolean)).toHaveLength(84);
    expect(cells84.slice(0, 5)).toEqual([null, null, null, '2026-07-23', '2026-07-24']);
    expect(cells84.length % 7).toBe(0);
  });
});

it('builds a whole calendar year with Monday padding and leap day',()=>{
  for(const [year,length] of [[2026,365],[2025,365],[2024,366]] as const) {
    const cells=calendarYear(year),dates=cells.filter(Boolean);
    expect(dates).toHaveLength(length);
    expect(dates[0]).toBe(`${year}-01-01`);
    expect(dates.at(-1)).toBe(`${year}-12-31`);
    expect(cells.length%7).toBe(0);
  }
  expect(calendarYear(2026).slice(0,4)).toEqual([null,null,null,'2026-01-01']);
  expect(calendarYear(2024)).toContain('2024-02-29');
  expect(calendarYear(2025)).not.toContain('2025-02-29');
});
