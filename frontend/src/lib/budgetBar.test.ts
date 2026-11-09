import { describe, expect, it } from "vitest";
import { budgetBarGeometry } from "@/lib/budgetBar";

describe("budgetBarGeometry", () => {
  describe("inside the limit", () => {
    it("fills the share of the limit that is spent", () => {
      expect(budgetBarGeometry(50, 100, false)).toEqual({ withinPercent: 50, overPercent: 0 });
    });

    it("draws nothing past the limit, so no mark is placed", () => {
      expect(budgetBarGeometry(99.99, 100, false).overPercent).toBe(0);
    });

    it("fills the whole track when spending lands exactly on the limit", () => {
      // The backend only flags is_over_budget above the limit, so spending
      // the limit to the cent is still the "inside" state.
      expect(budgetBarGeometry(100, 100, false)).toEqual({ withinPercent: 100, overPercent: 0 });
    });

    it("stays empty with nothing spent", () => {
      expect(budgetBarGeometry(0, 100, false)).toEqual({ withinPercent: 0, overPercent: 0 });
    });
  });

  describe("past the limit", () => {
    it("rescales the track to what was spent, putting the limit inside it", () => {
      // Twice the limit spent: the limit sits halfway, the overrun fills
      // the other half.
      expect(budgetBarGeometry(200, 100, true)).toEqual({ withinPercent: 50, overPercent: 50 });
    });

    it("shrinks the green section as the overrun grows", () => {
      expect(budgetBarGeometry(1000, 100, true)).toEqual({ withinPercent: 10, overPercent: 90 });
      expect(budgetBarGeometry(125, 100, true)).toEqual({ withinPercent: 80, overPercent: 20 });
    });

    it("always fills the track exactly, leaving no gap at the end", () => {
      // The two sections are rendered side by side, so a sum below 100
      // would show as dead track behind the red tail.
      for (const spent of [101, 137.5, 480, 10_000]) {
        const { withinPercent, overPercent } = budgetBarGeometry(spent, 100, true);
        expect(withinPercent + overPercent).toBeCloseTo(100);
      }
    });

    it("keeps the limit mark on the track, never at or past its end", () => {
      // The mark is drawn at withinPercent; at 100 it would hide under the
      // right edge and the red section would be invisible.
      expect(budgetBarGeometry(100.01, 100, true).withinPercent).toBeLessThan(100);
    });
  });

  describe("degenerate input", () => {
    it("turns the whole bar red when there is no limit to divide by", () => {
      // monthly_limit is gt=0 server-side, so this only guards against a
      // zero reaching a width via NaN.
      expect(budgetBarGeometry(50, 0, true)).toEqual({ withinPercent: 0, overPercent: 100 });
      expect(budgetBarGeometry(50, 0, false)).toEqual({ withinPercent: 0, overPercent: 0 });
    });

    it("never produces a negative or out-of-range width", () => {
      expect(budgetBarGeometry(-50, 100, false).withinPercent).toBe(0);
      expect(budgetBarGeometry(0, 0, true)).toEqual({ withinPercent: 0, overPercent: 100 });
    });
  });
});
