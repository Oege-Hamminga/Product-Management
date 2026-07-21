// Formats an <input type="week"> value ("2026-W29") into a compact label ("CW29 · 2026").
export function formatCwDate(value: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(value);
  if (!m) return value;
  return `CW${m[2]} · ${m[1]}`;
}

// Current ISO week as an <input type="week"> value, used to default the CW date field.
export function currentIsoWeek(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// "YYYY-Www" strings compare chronologically as plain strings (both fields are
// fixed-width, zero-padded), so no date parsing is needed here.
export function isPastWeek(cwDate: string): boolean {
  return cwDate < currentIsoWeek();
}
