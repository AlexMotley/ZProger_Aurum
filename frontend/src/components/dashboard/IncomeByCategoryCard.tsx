import { CategoryDonutCard } from "@/components/dashboard/CategoryDonutCard";
import { useTranslation } from "@/lib/i18n";
import type { CategoryBreakdownItem } from "@/types";

interface IncomeByCategoryCardProps {
  items: CategoryBreakdownItem[];
}

export function IncomeByCategoryCard({ items }: IncomeByCategoryCardProps) {
  const { t } = useTranslation();
  return (
    <CategoryDonutCard
      title={t("dashboard.incomeByCategoryTitle")}
      emptyMessage={t("dashboard.noIncomeThisMonth")}
      items={items}
    />
  );
}
