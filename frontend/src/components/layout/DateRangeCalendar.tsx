import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, X } from "lucide-react";
import { getIntlLocale, formatTransactionDate } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import { cn, horizontalViewportShift } from "@/lib/utils";
import {
  daysInMonth,
  firstWeekdayOfLocale,
  isoFromParts,
  monthDayRange,
  todayIso,
  type DayRange,
} from "@/lib/dateRange";

interface DateRangeCalendarProps {
  /** The range currently driving the list, or both-null when the caller is
   * showing a whole month instead. */
  value: DayRange;
  /** Fired only with a *complete* range (or a cleared one) — a half-picked
   * range stays inside this component, so the list behind it doesn't
   * flash single-day results between the two clicks. */
  onChange: (range: DayRange) => void;
  /** Month the grid opens on while no range is picked — normally whatever
   * month/year the page's own selectors are showing. `month` is 1-12. */
  year: number;
  month: number;
  /** Latest selectable day, inclusive. Defaults to today: a range running
   * into the future can only ever come back empty. */
  maxDate?: string;
  className?: string;
}

/** Popover day-range picker: two clicks (start, then end) inside a compact
 * month grid. Shares the dismiss behaviour of YearSelector's dropdown
 * (click outside, Escape) so every popover on the page closes the same way.
 * Date arithmetic lives in lib/dateRange.ts, not here. */
export function DateRangeCalendar({ value, onChange, year, month, maxDate, className }: DateRangeCalendarProps) {
  const { t, language } = useTranslation();
  const [open, setOpen] = useState(false);
  // The month the grid is showing, which the arrows move independently of
  // the page's own month — that's what lets a range cross into a
  // neighbouring month.
  const [viewYear, setViewYear] = useState(year);
  const [viewMonth, setViewMonth] = useState(month);
  // First click of a new range; until the second one lands nothing is
  // published upwards.
  const [pendingStart, setPendingStart] = useState<string | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // Horizontal nudge that keeps the popover on screen — see keepInViewport.
  const [offset, setOffset] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const upperBound = maxDate ?? todayIso();

  // Reopening the picker should land somewhere meaningful rather than
  // wherever the arrows were left pointing last time: the month the picked
  // range starts in, or the page's own month while nothing is picked.
  useEffect(() => {
    if (open) return;
    const anchor = value.startDate ? new Date(`${value.startDate}T00:00:00`) : null;
    setViewYear(anchor ? anchor.getFullYear() : year);
    setViewMonth(anchor ? anchor.getMonth() + 1 : month);
    setPendingStart(null);
    setHovered(null);
  }, [open, year, month, value.startDate]);

  /** The trigger can sit anywhere on its row — rightmost on the Dashboard,
   * leftmost once the controls wrap on a phone — so neither a left- nor a
   * right-anchored popover stays on screen on its own. Measure where it
   * actually landed and slide it back inside instead. Reads the rect with
   * the current offset already applied, so the correction is relative and
   * settles after one pass (a no-op pass sets no state, so it can't loop). */
  const keepInViewport = useCallback(() => {
    const popover = popoverRef.current;
    if (!popover) return;
    const delta = horizontalViewportShift(popover.getBoundingClientRect(), window.innerWidth);
    if (delta !== 0) setOffset((previous) => previous + delta);
  }, []);

  // useLayoutEffect, not useEffect: the correction has to land before the
  // browser paints, or the popover visibly jumps on open.
  useLayoutEffect(() => {
    if (!open) {
      setOffset(0);
      return;
    }
    keepInViewport();
  }, [open, keepInViewport]);

  useEffect(() => {
    if (!open) return;
    // Rotating a phone changes which side was overflowing.
    window.addEventListener("resize", keepInViewport);
    return () => window.removeEventListener("resize", keepInViewport);
  }, [open, keepInViewport]);

  // Re-check after the grid's height/width changes with the month shown.
  useLayoutEffect(() => {
    if (open) keepInViewport();
  }, [open, viewYear, viewMonth, keepInViewport]);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const monthTitle = useMemo(
    () =>
      new Intl.DateTimeFormat(getIntlLocale(language), { month: "long", year: "numeric" }).format(
        new Date(viewYear, viewMonth - 1, 1)
      ),
    [language, viewYear, viewMonth]
  );

  // Short weekday names straight from Intl, rotated to the locale's own
  // first day — saves carrying seven more translation keys per language.
  const weekdayLabels = useMemo(() => {
    const formatter = new Intl.DateTimeFormat(getIntlLocale(language), { weekday: "short" });
    const offset = firstWeekdayOfLocale(language);
    // 2024-01-07 is a Sunday, so adding the index walks the whole week.
    return Array.from({ length: 7 }, (_, index) =>
      formatter.format(new Date(2024, 0, 7 + ((index + offset) % 7)))
    );
  }, [language]);

  const totalDays = daysInMonth(viewYear, viewMonth);
  // Blank cells before the 1st so the first day lands under its weekday.
  const leadingBlanks = (new Date(viewYear, viewMonth - 1, 1).getDay() - firstWeekdayOfLocale(language) + 7) % 7;

  function shiftMonth(delta: number) {
    const shifted = new Date(viewYear, viewMonth - 1 + delta, 1);
    setViewYear(shifted.getFullYear());
    setViewMonth(shifted.getMonth() + 1);
  }

  function handleDayClick(iso: string) {
    // No pending start (or a finished range on screen) starts a new one;
    // the second click closes it, flipping the ends if the user picked
    // backwards so the range is never inverted.
    if (pendingStart === null) {
      setPendingStart(iso);
      return;
    }
    const range: DayRange =
      iso < pendingStart ? { startDate: iso, endDate: pendingStart } : { startDate: pendingStart, endDate: iso };
    setPendingStart(null);
    setHovered(null);
    onChange(range);
    setOpen(false);
  }

  function handleWholeMonth() {
    setPendingStart(null);
    onChange(monthDayRange(viewYear, viewMonth));
    setOpen(false);
  }

  function handleClear() {
    setPendingStart(null);
    setHovered(null);
    onChange({ startDate: null, endDate: null });
    setOpen(false);
  }

  const hasRange = value.startDate !== null && value.endDate !== null;
  // While picking, the preview follows the cursor; once picked, the chosen
  // range is what's highlighted.
  const previewStart = pendingStart ?? value.startDate;
  const previewEnd = pendingStart !== null ? hovered : value.endDate;
  const [spanStart, spanEnd] =
    previewStart !== null && previewEnd !== null && previewEnd < previewStart
      ? [previewEnd, previewStart]
      : [previewStart, previewEnd];

  // "25 Dec – 5 Jan" would hide which year each end is in, so a range that
  // straddles New Year's Eve spells the years out.
  const spansTwoYears = hasRange && value.startDate!.slice(0, 4) !== value.endDate!.slice(0, 4);
  const triggerLabel = hasRange
    ? `${formatTransactionDate(value.startDate!, spansTwoYears)} – ${formatTransactionDate(value.endDate!, spansTwoYears)}`
    : t("transactions.dayRange.trigger");

  return (
    <div ref={rootRef} className={cn("relative shrink-0", className)}>
      <div
        className={cn(
          "flex h-9 items-center rounded-lg border bg-surface-1 transition-colors",
          hasRange ? "border-series-6" : "border-border"
        )}
      >
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-haspopup="dialog"
          aria-expanded={open}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-lg px-3 text-sm font-medium transition-colors hover:bg-surface-2",
            hasRange ? "text-text-primary" : "text-text-secondary"
          )}
        >
          <CalendarDays size={15} className="shrink-0 text-text-muted" />
          <span className="whitespace-nowrap">{triggerLabel}</span>
        </button>
        {hasRange && (
          <button
            type="button"
            aria-label={t("transactions.dayRange.clear")}
            onClick={handleClear}
            className="mr-1 rounded-md p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {open && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label={t("transactions.dayRange.trigger")}
          // Anchored to the trigger's left edge, then nudged horizontally by
          // keepInViewport so it never hangs off either side of the screen.
          className="absolute left-0 top-full z-20 mt-1.5 w-[17.5rem] max-w-[calc(100vw-1rem)] rounded-lg border border-border bg-surface-1 p-3 shadow-lg"
          style={offset === 0 ? undefined : { transform: `translateX(${offset}px)` }}
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label={t("transactions.dayRange.prevMonth")}
              onClick={() => shiftMonth(-1)}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="text-sm font-medium capitalize text-text-primary">{monthTitle}</span>
            <button
              type="button"
              aria-label={t("transactions.dayRange.nextMonth")}
              onClick={() => shiftMonth(1)}
              className="rounded-md p-1 text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-0.5 text-center">
            {weekdayLabels.map((label) => (
              <span key={label} className="py-1 text-[11px] font-medium capitalize text-text-muted">
                {label}
              </span>
            ))}
            {Array.from({ length: leadingBlanks }, (_, index) => (
              <span key={`blank-${index}`} />
            ))}
            {Array.from({ length: totalDays }, (_, index) => {
              const day = index + 1;
              const iso = isoFromParts(viewYear, viewMonth, day);
              const disabled = iso > upperBound;
              const isEdge = iso === spanStart || iso === spanEnd;
              const inSpan = spanStart !== null && spanEnd !== null && iso > spanStart && iso < spanEnd;
              return (
                <button
                  key={iso}
                  type="button"
                  disabled={disabled}
                  onClick={() => handleDayClick(iso)}
                  onMouseEnter={() => setHovered(iso)}
                  className={cn(
                    "h-8 rounded-md text-sm transition-colors",
                    disabled && "cursor-not-allowed text-text-muted opacity-40",
                    !disabled && !isEdge && !inSpan && "text-text-secondary hover:bg-surface-2",
                    inSpan && "bg-surface-2 text-text-primary",
                    isEdge && "bg-series-6 font-semibold text-white"
                  )}
                >
                  {day}
                </button>
              );
            })}
          </div>

          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={handleWholeMonth}
              className="rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              {t("transactions.dayRange.wholeMonth")}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md px-2 py-1 text-xs font-medium text-text-secondary transition-colors hover:bg-surface-2 hover:text-text-primary"
            >
              {t("transactions.dayRange.reset")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
