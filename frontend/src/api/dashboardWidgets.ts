import { api } from "@/api/client";
import { periodQuery } from "@/api/period";
import type { DayRange } from "@/lib/dateRange";
import type { DashboardWidget, DashboardWidgetInput, WidgetTypeManifestEntry } from "@/types";

export function fetchWidgetTypes() {
  return api.get<WidgetTypeManifestEntry[]>("/dashboard/widgets/types");
}

export function fetchDashboardWidgets(year: number, month: number, range?: DayRange) {
  return api.get<DashboardWidget[]>(`/dashboard/widgets?${periodQuery(year, month, range)}`);
}

// The period travels with the write calls too: the response carries the
// widget already rendered over it, so a freshly added widget shows the
// same days as the ones around it instead of the current month.
export function createDashboardWidget(input: DashboardWidgetInput, year: number, month: number, range?: DayRange) {
  return api.post<DashboardWidget>(`/dashboard/widgets?${periodQuery(year, month, range)}`, input);
}

export function updateDashboardWidget(
  id: number,
  input: DashboardWidgetInput,
  year: number,
  month: number,
  range?: DayRange
) {
  return api.patch<DashboardWidget>(`/dashboard/widgets/${id}?${periodQuery(year, month, range)}`, input);
}

export function deleteDashboardWidget(id: number) {
  return api.delete<void>(`/dashboard/widgets/${id}`);
}
