// Formats an <input type="week"> value ("2026-W29") into a compact label ("CW29 · 2026").
export function formatCwDate(value: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!m) return value;
  return `CW${m[2]} · ${m[1]}`;
}

// Formats a single week, or — when an end week is given and differs from the
// start — a period ("CW01–CW05 · 2026", or with both years spelled out if the
// period crosses a year boundary).
export function formatCwRange(start: string, end?: string | null): string {
  if (!end || end === start) return formatCwDate(start);
  const m1 = /^(\d{4})-W(\d{2})$/.exec(start);
  const m2 = /^(\d{4})-W(\d{2})$/.exec(end);
  if (!m1 || !m2) return `${formatCwDate(start)} – ${formatCwDate(end)}`;
  if (m1[1] === m2[1]) return `CW${m1[2]}–CW${m2[2]} · ${m1[1]}`;
  return `${formatCwDate(start)} – ${formatCwDate(end)}`;
}

function dateToIsoWeek(d: Date): string {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// Current ISO week as an <input type="week"> value, used to default the CW date field.
export function currentIsoWeek(): string {
  return dateToIsoWeek(new Date());
}

// The Monday of a given ISO week — anchored on Jan 4th, which ISO 8601
// guarantees always falls in week 1 of its year.
function isoWeekStartDate(week: string): Date {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return new Date(NaN);
  const year = Number(m[1]);
  const weekNum = Number(m[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1);
  const result = new Date(week1Monday);
  result.setUTCDate(week1Monday.getUTCDate() + (weekNum - 1) * 7);
  return result;
}

// Every ISO week from start to end, inclusive — used to lay out a multi-week
// News period across each week row it actually covers, not just its endpoints.
export function weeksInRange(start: string, end: string): string[] {
  if (!end || end <= start) return [start];
  const weeks: string[] = [];
  let cursor = isoWeekStartDate(start);
  const endDate = isoWeekStartDate(end);
  let guard = 0;
  while (cursor.getTime() <= endDate.getTime() && guard < 520) {
    weeks.push(dateToIsoWeek(cursor));
    cursor = new Date(cursor);
    cursor.setUTCDate(cursor.getUTCDate() + 7);
    guard++;
  }
  return weeks;
}

// Moves a week forward (or back, with a negative delta) by whole weeks —
// used to build a rolling "next N weeks" window from the current week.
export function shiftWeek(week: string, delta: number): string {
  const d = isoWeekStartDate(week);
  d.setUTCDate(d.getUTCDate() + delta * 7);
  return dateToIsoWeek(d);
}

// "YYYY-Www" strings compare chronologically as plain strings (both fields are
// fixed-width, zero-padded), so no date parsing is needed here.
export function isPastWeek(cwDate: string): boolean {
  return cwDate < currentIsoWeek();
}

// A News item stays "current" until the last week of its period has gone by —
// a single-week item's period is just that one week.
export function isPastNewsWeek(cwDate: string, cwDateEnd?: string | null): boolean {
  const effectiveEnd = cwDateEnd && cwDateEnd > cwDate ? cwDateEnd : cwDate;
  return isPastWeek(effectiveEnd);
}
