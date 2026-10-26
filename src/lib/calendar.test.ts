import { test } from 'node:test';
import assert from 'node:assert/strict';
import { addDays, addMonths, daysInMonth, isValidDate, monthDates, todayDate, weekDates, weekday } from './calendar';

test('Gregorian leap years and invalid dates', () => {
  assert.equal(daysInMonth('2024-02'), 29);
  assert.equal(daysInMonth('2025-02'), 28);
  assert.equal(daysInMonth('1900-02'), 28);
  assert.equal(daysInMonth('2000-02'), 29);
  assert.equal(daysInMonth('2026-04'), 30);
  assert.equal(daysInMonth('2026-12'), 31);
  for (const date of ['2025-02-29', '2026-04-31', '2026-13-01', '2026-00-01', 'hello']) assert.equal(isValidDate(date), false);
  assert.equal(isValidDate('2024-02-29'), true);
});
test('month grid has complete Sunday-to-Saturday weeks including adjacent months', () => {
  const leap = monthDates('2024-02');
  assert.equal(leap[0], '2024-01-28');
  assert.equal(leap.at(-1), '2024-03-02');
  assert.equal(leap.filter(day => day.startsWith('2024-02')).length, 29);
  assert.equal(monthDates('2026-02').length, 28);
  assert.equal(monthDates('2026-08').length, 42);
  for (const month of ['2024-02', '2026-02', '2026-08', '2026-12']) {
    const grid = monthDates(month);
    assert.equal(weekday(grid[0]), 0);
    assert.equal(weekday(grid.at(-1)!), 6);
    assert.equal(new Set(grid).size, grid.length);
  }
});
test('week and day navigation crosses month/year and DST boundaries', () => {
  assert.deepEqual(weekDates('2026-01-01'), ['2025-12-28','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02','2026-01-03']);
  assert.equal(weekDates('2026-10-25')[0], '2026-10-25');
  assert.equal(addDays('2024-02-28', 1), '2024-02-29');
  assert.equal(addDays('2024-03-01', -1), '2024-02-29');
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(addDays('2026-03-08', 1), '2026-03-09');
  assert.equal(addDays('2026-11-01', 1), '2026-11-02');
});
test('month navigation clamps the day and today uses the local calendar', () => {
  assert.equal(addMonths('2024-01-31', 1), '2024-02-29');
  assert.equal(addMonths('2025-03-31', -1), '2025-02-28');
  assert.equal(addMonths('2026-12-15', 1), '2027-01-15');
  assert.equal(todayDate(new Date(2026, 9, 21, 0, 5)), '2026-10-21');
});
