import { api } from "@/api/client";
import { periodQuery } from "@/api/period";
import type { DayRange } from "@/lib/dateRange";
import type { DashboardSummary } from "@/types";

export function fetchDashboardSummary(year: number, month: number, range?: DayRange) {
  return api.get<DashboardSummary>(`/dashboard/summary?${periodQuery(year, month, range)}`);
}
