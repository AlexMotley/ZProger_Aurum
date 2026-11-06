import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** How far a popover has to slide horizontally to sit fully inside the
 * viewport: negative pulls it left, positive pushes it right, 0 means it
 * already fits. `rect` is the element's current on-screen box, so the
 * answer is a correction relative to wherever it sits now — applying it
 * twice is a no-op rather than a double shift.
 *
 * An element wider than the viewport can't satisfy both edges; it's pinned
 * to the left gutter, since content is read from there. */
export function horizontalViewportShift(
  rect: { left: number; right: number },
  viewportWidth: number,
  gutter = 8
): number {
  let delta = 0;
  if (rect.right > viewportWidth - gutter) delta = viewportWidth - gutter - rect.right;
  if (rect.left + delta < gutter) delta = gutter - rect.left;
  return delta;
}
