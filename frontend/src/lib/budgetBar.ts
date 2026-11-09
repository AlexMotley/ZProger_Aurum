/** Geometry of a budget row's progress bar.
 *
 * Two different scales live here deliberately. While spending is inside the
 * limit, the track's full width *is* the limit, so the fill answers "how
 * much of the limit is gone". Once the limit is passed, that scale has no
 * room left to draw the overspend in — the bar would just sit at 100% and
 * hide how bad the overrun is. So past the limit the track's full width
 * becomes the amount actually spent, and the limit turns into a mark
 * somewhere inside it. That rescale is what makes a green "up to the limit"
 * section and a red "past it" section possible at all.
 */
export interface BudgetBarGeometry {
  /** Width of the within-limit (green) section, as a percentage of the
   * track. While over the limit this doubles as the limit mark's position. */
  withinPercent: number;
  /** Width of the overspend (red) section, as a percentage of the track.
   * Zero while spending is still inside the limit, where there is nothing
   * past the limit to draw. */
  overPercent: number;
}

/** Clamps a computed share into a width a browser can render, treating a
 * NaN/Infinity (a zero denominator slipping through) as zero rather than
 * letting it reach a style attribute. */
function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

/** Splits a budget row's bar into its green and red sections.
 *
 * `isOver` comes from the backend rather than being re-derived from the two
 * numbers here: the server compares exact decimals, and the bar must never
 * contradict the "over by …"/"… left" caption sitting right under it. */
export function budgetBarGeometry(spent: number, limit: number, isOver: boolean): BudgetBarGeometry {
  if (!isOver) {
    return { withinPercent: clampPercent(limit > 0 ? (spent / limit) * 100 : 0), overPercent: 0 };
  }
  // Past the limit the track measures what was spent, so the limit lands
  // inside it and everything to its right is the overspend.
  const withinPercent = clampPercent(spent > 0 ? (limit / spent) * 100 : 0);
  return { withinPercent, overPercent: 100 - withinPercent };
}
