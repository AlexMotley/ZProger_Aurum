import { describe, expect, it } from "vitest";
import {
  daysInMonth,
  firstWeekdayOfLocale,
  isoFromParts,
  monthDayRange,
  todayIso,
} from "@/lib/dateRange";

describe("isoFromParts", () => {
  it("zero-pads single-digit months and days", () => {
    expect(isoFromParts(2026, 1, 5)).toBe("2026-01-05");
  });

  it("keeps the calendar day the user picked, whatever the timezone", () => {
    // The point of the helper: toISOString() would shift this to the 31st
    // for anyone east of UTC, silently filtering on the wrong day.
    expect(isoFromParts(2026, 1, 1)).toBe("2026-01-01");
  });

  it("produces strings that sort chronologically", () => {
    // The calendar's "is this day inside the span" test compares the ISO
    // strings directly, which only holds while the format is fixed-width.
    expect(isoFromParts(2026, 1, 9) < isoFromParts(2026, 1, 10)).toBe(true);
    expect(isoFromParts(2025, 12, 31) < isoFromParts(2026, 1, 1)).toBe(true);
  });
});

describe("daysInMonth", () => {
  it("handles leap and common Februaries", () => {
    expect(daysInMonth(2024, 2)).toBe(29);
    expect(daysInMonth(2025, 2)).toBe(28);
  });

  it("handles 30- and 31-day months", () => {
    expect(daysInMonth(2026, 4)).toBe(30);
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe("monthDayRange", () => {
  it("spans the whole month, last day included", () => {
    expect(monthDayRange(2024, 2)).toEqual({ startDate: "2024-02-01", endDate: "2024-02-29" });
    expect(monthDayRange(2026, 11)).toEqual({ startDate: "2026-11-01", endDate: "2026-11-30" });
  });
});

describe("todayIso", () => {
  it("returns the local calendar day, not the UTC one", () => {
    // sv-SE formats as yyyy-mm-dd, so this is today's local date without
    // going through toISOString().
    expect(todayIso()).toBe(new Date().toLocaleDateString("sv-SE"));
  });
});

describe("firstWeekdayOfLocale", () => {
  it("starts the week where each locale expects it", () => {
    expect(firstWeekdayOfLocale("ru")).toBe(1);
    expect(firstWeekdayOfLocale("en")).toBe(0);
  });
});
