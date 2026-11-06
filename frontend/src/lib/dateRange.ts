/** Shared by CashFlowPage and ReportsPage — both offer the same four
 * period presets over their respective date-ranged endpoints. */
export type RangePreset = "all" | "this_year" | "5y" | "custom";

export interface CustomYearRange {
  fromYear: number;
  toYear: number;
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function computeRange(
  preset: RangePreset,
  custom?: CustomYearRange
): { startDate?: string; endDate?: string } {
  const today = new Date();
  switch (preset) {
    case "all":
      return {};
    case "this_year":
      return { startDate: `${today.getFullYear()}-01-01`, endDate: isoDate(today) };
    case "5y": {
      const start = new Date(today.getFullYear() - 5, today.getMonth(), 1);
      return { startDate: isoDate(start), endDate: isoDate(today) };
    }
    case "custom": {
      if (!custom) return {};
      return { startDate: `${custom.fromYear}-01-01`, endDate: `${custom.toYear}-12-31` };
    }
  }
}

/** A day-level span inside one list of transactions — both ends inclusive,
 * both null while nothing is picked. Separate from RangePreset above: that
 * one answers "which years", this one "which days". */
export interface DayRange {
  startDate: string | null;
  endDate: string | null;
}

export const EMPTY_DAY_RANGE: DayRange = { startDate: null, endDate: null };

/** Builds a yyyy-mm-dd string out of calendar parts. Deliberately not via
 * Date.toISOString() (as isoDate() above does) — that converts to UTC
 * first, so a date picked in a positive-offset timezone would come back
 * shifted one day earlier. Here the parts are already the local ones the
 * user clicked, so they're formatted as-is. */
export function isoFromParts(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** How many days a month has; `month` is 1-12. Day 0 of the following
 * month is the last day of this one, which gets February's leap years
 * right without a special case. */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Today in the user's own timezone — see isoFromParts for why this isn't
 * toISOString(). */
export function todayIso(): string {
  const now = new Date();
  return isoFromParts(now.getFullYear(), now.getMonth() + 1, now.getDate());
}

/** The whole of one month as a range, behind the calendar's "whole month"
 * shortcut. */
export function monthDayRange(year: number, month: number): DayRange {
  return {
    startDate: isoFromParts(year, month, 1),
    endDate: isoFromParts(year, month, daysInMonth(year, month)),
  };
}

/** Weekday the calendar grid starts on: Monday for ru, Sunday for en,
 * matching what each locale's own calendars do. Returned as a JS day index
 * (0 = Sunday) so it can be subtracted from Date.getDay() directly. */
export function firstWeekdayOfLocale(language: string): number {
  return language === "ru" ? 1 : 0;
}

/** The year and month a yyyy-mm-dd date falls in. Lets the month/year
 * selectors follow a range picked in the calendar, so the page header
 * keeps describing the period actually on screen. */
export function monthOfIso(iso: string): { year: number; month: number } {
  return { year: Number(iso.slice(0, 4)), month: Number(iso.slice(5, 7)) };
}

/** Whether a range is complete enough to filter by. A half-picked range
 * (start chosen, end not yet) must not reach the API — see
 * backend/app/services/period.py, which rejects one end on its own. */
export function isCompleteDayRange(range: DayRange): boolean {
  return range.startDate !== null && range.endDate !== null;
}
