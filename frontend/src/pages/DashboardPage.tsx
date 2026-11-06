import { useState } from "react";
import { Plus } from "lucide-react";
import { DateRangeCalendar } from "@/components/layout/DateRangeCalendar";
import { MonthSelector } from "@/components/layout/MonthSelector";
import { YearSelector } from "@/components/layout/YearSelector";
import { Button } from "@/components/ui/Button";
import { StatCard } from "@/components/dashboard/StatCard";
import { SpendingByCategoryCard } from "@/components/dashboard/SpendingByCategoryCard";
import { IncomeByCategoryCard } from "@/components/dashboard/IncomeByCategoryCard";
import { RecentTransactionsCard } from "@/components/dashboard/RecentTransactionsCard";
import { DashboardWidgetCard } from "@/components/dashboard/DashboardWidgetCard";
import { AddWidgetModal } from "@/components/dashboard/AddWidgetModal";
import { AlertBanner } from "@/components/insights/AlertBanner";
import { useDashboardSummary } from "@/hooks/useDashboard";
import { EMPTY_DAY_RANGE, monthOfIso, type DayRange } from "@/lib/dateRange";
import { useTransactionYears } from "@/hooks/useTransactions";
import { useDashboardWidgets, useDeleteDashboardWidget } from "@/hooks/useDashboardWidgets";
import { formatCurrency, formatSignedCurrency } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import type { DashboardWidget } from "@/types";

/** Share of income left over after spending (net / real_income). `null` when
 * there was no income to take a share of, rather than a misleading 0%. */
function savingsRate(realIncome: number, net: number): number | null {
  return realIncome > 0 ? (net / realIncome) * 100 : null;
}

function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(0)}%`;
}

export function DashboardPage() {
  const { t } = useTranslation();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  // Day range inside (or across) the selected month. Everything on the
  // page reads the same period, so the stat cards, donuts, widgets and
  // the recent-transactions list can never disagree about which days
  // they're describing.
  const [dayRange, setDayRange] = useState<DayRange>(EMPTY_DAY_RANGE);
  const { data: years } = useTransactionYears();

  const { data, isLoading, isError } = useDashboardSummary(year, month, dayRange);
  const rate = data ? savingsRate(Number(data.real_income), Number(data.net)) : null;

  const [widgetModalOpen, setWidgetModalOpen] = useState(false);
  const [editingWidget, setEditingWidget] = useState<DashboardWidget | null>(null);
  const { data: widgets } = useDashboardWidgets(year, month, dayRange);
  const deleteWidget = useDeleteDashboardWidget();

  // Picking a month or a year means "show me that whole period", which is
  // exactly what an active day range contradicts.
  function handleMonthChange(value: number) {
    setMonth(value);
    setDayRange(EMPTY_DAY_RANGE);
  }

  function handleYearChange(value: number) {
    setYear(value);
    setDayRange(EMPTY_DAY_RANGE);
  }

  /** A range picked in the calendar drags the month/year selectors to
   * wherever it starts, so the header keeps naming the period on screen
   * even when the range reaches into a neighbouring month. */
  function handleDayRangeChange(range: DayRange) {
    setDayRange(range);
    if (range.startDate) {
      const { year: rangeYear, month: rangeMonth } = monthOfIso(range.startDate);
      setYear(rangeYear);
      setMonth(rangeMonth);
    }
  }

  function openCreateWidgetModal() {
    setEditingWidget(null);
    setWidgetModalOpen(true);
  }

  function openEditWidgetModal(widget: DashboardWidget) {
    setEditingWidget(widget);
    setWidgetModalOpen(true);
  }

  function handleDeleteWidget(widget: DashboardWidget) {
    if (window.confirm(t("dashboard.widgets.confirmDelete", { title: widget.title }))) {
      deleteWidget.mutate(widget.id);
    }
  }

  return (
    <div className="space-y-5">
      <AlertBanner excludeKeys={["risky_allocation_exceeded"]} />

      <div className="flex flex-wrap items-center gap-2 sm:gap-3">
        <div className="min-w-0 flex-1 basis-full sm:basis-auto">
          <MonthSelector month={month} onChange={handleMonthChange} />
        </div>
        <YearSelector years={years ?? [now.getFullYear()]} year={year} onChange={handleYearChange} />
        <DateRangeCalendar value={dayRange} onChange={handleDayRangeChange} year={year} month={month} />
      </div>

      {isError && (
        <p className="rounded-lg border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
          {t("dashboard.errorLoading")}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatCard
          label={t("dashboard.statRealIncomeLabel")}
          value={isLoading ? "…" : formatCurrency(data?.real_income ?? 0)}
          caption={t("dashboard.statRealIncomeCaption")}
          tone="success"
        />
        <StatCard
          label={t("dashboard.statSpentLabel")}
          value={isLoading ? "…" : formatCurrency(data?.spent ?? 0)}
          caption={t("dashboard.statSpentCaption")}
          tone="danger"
        />
        <StatCard
          label={t("dashboard.statNetLabel")}
          value={isLoading ? "…" : formatSignedCurrency(data?.net ?? 0)}
          caption={t("dashboard.statNetCaption")}
          tone={Number(data?.net ?? 0) >= 0 ? "success" : "danger"}
        />
        <StatCard
          label={t("dashboard.statSavingsRateLabel")}
          value={isLoading ? "…" : rate === null ? "—" : formatPercent(rate)}
          caption={t("dashboard.statSavingsRateCaption")}
          tone={rate === null ? "default" : rate >= 0 ? "success" : "danger"}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.4fr_1fr]">
        <SpendingByCategoryCard items={data?.spending_by_category ?? []} />
        <RecentTransactionsCard year={year} month={month} dayRange={dayRange} />
      </div>

      <IncomeByCategoryCard items={data?.income_by_category ?? []} />

      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-text-muted">
          {t("dashboard.widgets.sectionTitle")}
        </h2>
        <Button variant="secondary" onClick={openCreateWidgetModal}>
          <Plus size={16} />
          {t("dashboard.widgets.addButton")}
        </Button>
      </div>

      {widgets && widgets.length > 0 && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {widgets.map((widget) => (
            <DashboardWidgetCard
              key={widget.id}
              widget={widget}
              onEdit={openEditWidgetModal}
              onDelete={handleDeleteWidget}
            />
          ))}
        </div>
      )}

      <AddWidgetModal
        open={widgetModalOpen}
        onClose={() => setWidgetModalOpen(false)}
        year={year}
        month={month}
        dayRange={dayRange}
        widget={editingWidget}
      />
    </div>
  );
}
