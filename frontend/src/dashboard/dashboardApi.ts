import { api } from "../app/api.js";

export type DashboardMetrics = Record<string, number>;

export function dashboardEndpoint(platform: boolean): "/api/admin/dashboard" | "/api/merchant/dashboard" {
  return platform ? "/api/admin/dashboard" : "/api/merchant/dashboard";
}

export async function loadDashboardMetrics(platform: boolean): Promise<DashboardMetrics> {
  return await api<DashboardMetrics>(dashboardEndpoint(platform));
}
