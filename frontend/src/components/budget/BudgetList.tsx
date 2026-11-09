import { Pencil, Trash2 } from "lucide-react";
import { getCategoryIcon } from "@/lib/icons";
import { formatCurrency } from "@/lib/format";
import { useTranslation } from "@/lib/i18n";
import { translateCategoryName } from "@/lib/categoryLabels";
import { budgetBarGeometry } from "@/lib/budgetBar";
import { cn } from "@/lib/utils";
import type { BudgetStatus } from "@/types";

interface BudgetListProps {
  items: BudgetStatus[];
  onEdit: (item: BudgetStatus) => void;
  onDelete: (item: BudgetStatus) => void;
}

export function BudgetList({ items, onEdit, onDelete }: BudgetListProps) {
  const { t } = useTranslation();

  if (items.length === 0) {
    return <p className="py-10 text-center text-sm text-text-muted">{t("budget.empty")}</p>;
  }

  return (
    <ul className="divide-y divide-gridline">
      {items.map((item) => {
        const Icon = getCategoryIcon(item.category_icon);
        const spent = Number(item.spent);
        const limit = Number(item.monthly_limit);
        // Green up to the limit, red past it. Once the limit is passed the
        // bar is rescaled to the amount spent so there is room to draw the
        // overrun at all — see lib/budgetBar.ts.
        const { withinPercent, overPercent } = budgetBarGeometry(spent, limit, item.is_over_budget);
        // How far past the limit, relative to the limit itself. Derived from
        // the same percent shown beside the bar, so "136%" and "over by 36%"
        // can never round to different numbers.
        const overspendPercent = limit > 0 ? item.percent - 100 : 0;

        return (
          <li key={item.budget_id} className="py-3">
            <div className="flex items-center gap-3">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
                style={{ backgroundColor: `${item.category_color}26` }}
              >
                <Icon size={16} style={{ color: item.category_color }} />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-text-primary">
                {translateCategoryName(item.category_name)}
              </span>
              <span className="shrink-0 text-sm tabular-nums text-text-primary">
                {formatCurrency(spent)} <span className="text-text-muted">/ {formatCurrency(limit)}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  aria-label={t("common.edit")}
                  onClick={() => onEdit(item)}
                  className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-text-primary"
                >
                  <Pencil size={15} />
                </button>
                <button
                  type="button"
                  aria-label={t("common.delete")}
                  onClick={() => onDelete(item)}
                  className="rounded-md p-1.5 text-text-muted hover:bg-surface-2 hover:text-danger"
                >
                  <Trash2 size={15} />
                </button>
              </span>
            </div>
            <div className="mt-2 flex items-center gap-2 pl-12">
              {/* Taller than the bar so the limit mark can stand out above and
                  below it instead of being clipped by the track's own
                  overflow-hidden. */}
              <span className="relative h-3 flex-1">
                <span className="absolute inset-x-0 top-1/2 flex h-1.5 -translate-y-1/2 overflow-hidden rounded-full bg-surface-2">
                  <span
                    className={cn("h-full shrink-0", overPercent > 0 ? "rounded-l-full" : "rounded-full")}
                    style={{ width: `${withinPercent}%`, backgroundColor: "var(--success)" }}
                  />
                  {/* flex-1 rather than a second percentage width: the two
                      sections then always meet exactly, with no sliver of
                      empty track showing through from rounding. */}
                  {overPercent > 0 && (
                    <span className="h-full flex-1 rounded-r-full" style={{ backgroundColor: "var(--danger)" }} />
                  )}
                </span>
                {overPercent > 0 && (
                  <span
                    title={t("budget.limitMark", { amount: formatCurrency(limit) })}
                    className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-text-primary"
                    style={{ left: `${withinPercent}%` }}
                  />
                )}
              </span>
              <span className="w-10 shrink-0 text-right text-xs tabular-nums text-text-muted">
                {item.percent.toFixed(0)}%
              </span>
            </div>
            <p className="mt-1 pl-12 text-xs" style={{ color: item.is_over_budget ? "var(--danger)" : "var(--text-muted)" }}>
              {item.is_over_budget
                ? t("budget.overBy", {
                    amount: formatCurrency(spent - limit),
                    percent: overspendPercent.toFixed(0),
                  })
                : t("budget.remaining", { amount: formatCurrency(limit - spent) })}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
