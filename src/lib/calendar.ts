// Calendar dates are plain YYYY-MM-DD strings. UTC is used only for arithmetic,
// avoiding DST shifts; today's date is obtained from the user's local clock.
export function todayDate(now = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function isValidMonth(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
function parseDate(value: string): Date {
  if (!isValidDate(value)) throw new Error('유효하지 않은 날짜입니다.');
  return new Date(`${value}T00:00:00Z`);
}
export function addDays(value: string, count: number): string {
  const date = parseDate(value);
  date.setUTCDate(date.getUTCDate() + count);
  return date.toISOString().slice(0, 10);
}
export function daysInMonth(yearMonth: string): number {
  if (!isValidMonth(yearMonth)) throw new Error('유효하지 않은 월입니다.');
  const date = parseDate(`${yearMonth}-01`);
  date.setUTCMonth(date.getUTCMonth() + 1, 0);
  return date.getUTCDate();
}
export function addMonths(value: string, count: number): string {
  const date = parseDate(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + count);
  const month = date.toISOString().slice(0, 7);
  return `${month}-${String(Math.min(day, daysInMonth(month))).padStart(2, '0')}`;
}
export const weekday = (value: string) => parseDate(value).getUTCDay();
export function weekDates(value: string): string[] {
  const start = addDays(value, -weekday(value));
  return Array.from({length: 7}, (_, index) => addDays(start, index));
}
export function monthDates(yearMonth: string): string[] {
  const first = `${yearMonth}-01`;
  const offset = weekday(first);
  const length = Math.ceil((offset + daysInMonth(yearMonth)) / 7) * 7;
  const start = addDays(first, -offset);
  return Array.from({length}, (_, index) => addDays(start, index));
}
export function dateLabel(value: string): string {
  return new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC'}).format(parseDate(value));
}
