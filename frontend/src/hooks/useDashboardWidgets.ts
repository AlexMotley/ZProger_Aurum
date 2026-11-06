import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDashboardWidget,
  deleteDashboardWidget,
  fetchDashboardWidgets,
  fetchWidgetTypes,
  updateDashboardWidget,
} from "@/api/dashboardWidgets";
import type { DayRange } from "@/lib/dateRange";
import type { DashboardWidgetInput } from "@/types";

// Static per session (doesn't depend on year/month, rarely changes) — one
// fetch is enough, react-query's default caching handles the rest.
export function useWidgetTypes() {
  return useQuery({ queryKey: ["dashboard-widget-types"], queryFn: fetchWidgetTypes });
}

export function useDashboardWidgets(year: number, month: number, range?: DayRange) {
  return useQuery({
    // Keyed on the range too — see useDashboardSummary for why.
    queryKey: ["dashboard-widgets", year, month, range?.startDate ?? null, range?.endDate ?? null],
    queryFn: () => fetchDashboardWidgets(year, month, range),
  });
}

export function useCreateDashboardWidget(year: number, month: number, range?: DayRange) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: DashboardWidgetInput) => createDashboardWidget(input, year, month, range),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] }),
  });
}

export function useUpdateDashboardWidget(year: number, month: number, range?: DayRange) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: number; input: DashboardWidgetInput }) =>
      updateDashboardWidget(id, input, year, month, range),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] }),
  });
}

export function useDeleteDashboardWidget() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => deleteDashboardWidget(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["dashboard-widgets"] }),
  });
}
