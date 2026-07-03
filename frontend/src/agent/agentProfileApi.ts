import { api, loadRows } from "../app/api.js";
import type { AgentProfile, Merchant } from "../types.js";

export function agentProfileUrl(platform: boolean, merchantId: string): string {
  return platform ? `/api/admin/merchants/${merchantId}/agent-profile` : "/api/merchant/agent-profile";
}

export async function loadAgentProfile(platform: boolean, merchantId = "default"): Promise<AgentProfile> {
  return await api<AgentProfile>(agentProfileUrl(platform, merchantId));
}

export async function saveAgentProfile(platform: boolean, merchantId: string, profile: AgentProfile): Promise<AgentProfile> {
  return await api<AgentProfile>(agentProfileUrl(platform, merchantId), {
    method: "PATCH",
    body: JSON.stringify(profile)
  });
}

export async function loadAgentProfileMerchants(platform: boolean): Promise<Merchant[]> {
  return platform ? await loadRows<Merchant>("/api/admin/merchants") : [];
}
