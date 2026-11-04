import { CategoryDonutCard } from "@/components/dashboard/CategoryDonutCard";
import { useTranslation } from "@/lib/i18n";
import type { CategoryBreakdownItem } from "@/types";

interface SpendingByCategoryCardProps {
  items: CategoryBreakdownItem[];
}

export function SpendingByCategoryCard({ items }: SpendingByCategoryCardProps) {
  const { t } = useTranslation();
  return (
    <CategoryDonutCard
      title={t("dashboard.spendingByCategoryTitle")}
      emptyMessage={t("dashboard.noExpensesThisMonth")}
      items={items}
    />
  );
}
