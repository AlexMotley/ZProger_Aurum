import { describe, expect, it } from "vitest";
import { horizontalViewportShift } from "@/lib/utils";

const VIEWPORT = 400;

describe("horizontalViewportShift", () => {
  it("leaves an element that already fits alone", () => {
    expect(horizontalViewportShift({ left: 50, right: 330 }, VIEWPORT)).toBe(0);
  });

  it("pulls an element overhanging the right edge back in", () => {
    // Right edge at 420 in a 400px viewport, 8px gutter -> must end at 392.
    expect(horizontalViewportShift({ left: 140, right: 420 }, VIEWPORT)).toBe(-28);
  });

  it("pushes an element overhanging the left edge back in", () => {
    expect(horizontalViewportShift({ left: -50, right: 230 }, VIEWPORT)).toBe(58);
  });

  it("is idempotent — re-applying it to the corrected box shifts nothing", () => {
    const rect = { left: 140, right: 420 };
    const first = horizontalViewportShift(rect, VIEWPORT);
    const corrected = { left: rect.left + first, right: rect.right + first };
    expect(horizontalViewportShift(corrected, VIEWPORT)).toBe(0);
  });

  it("pins an element wider than the viewport to the left gutter", () => {
    // Both edges can't be satisfied; starting at the left is what reads.
    const rect = { left: 30, right: 500 };
    const shift = horizontalViewportShift(rect, VIEWPORT);
    expect(rect.left + shift).toBe(8);
  });

  it("honours a custom gutter", () => {
    expect(horizontalViewportShift({ left: 140, right: 420 }, VIEWPORT, 20)).toBe(-40);
  });
});
