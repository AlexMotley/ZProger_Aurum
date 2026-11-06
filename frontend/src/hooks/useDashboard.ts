import { useQuery } from "@tanstack/react-query";
import { fetchDashboardSummary } from "@/api/dashboard";
import type { DayRange } from "@/lib/dateRange";

export function useDashboardSummary(year: number, month: number, range?: DayRange) {
  return useQuery({
    // The range is part of the key, so switching between a month and a day
    // range inside it doesn't serve the other one's cached numbers.
    queryKey: ["dashboard-summary", year, month, range?.startDate ?? null, range?.endDate ?? null],
    queryFn: () => fetchDashboardSummary(year, month, range),
  });
}
