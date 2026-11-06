import { isCompleteDayRange, type DayRange } from "@/lib/dateRange";

/** Query string for every endpoint that takes a period: a complete day
 * range if there is one, the year/month pair otherwise. Only ever one of
 * the two forms — the backend lets a range override year/month
 * (backend/app/services/period.py), so sending both just invites the two
 * to disagree. */
export function periodQuery(year: number, month: number, range?: DayRange): string {
  const params = new URLSearchParams();
  if (range && isCompleteDayRange(range)) {
    params.set("start_date", range.startDate!);
    params.set("end_date", range.endDate!);
  } else {
    params.set("year", String(year));
    params.set("month", String(month));
  }
  return params.toString();
}
