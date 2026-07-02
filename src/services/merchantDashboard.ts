import type { Repositories } from "../repositories.js";

export type MerchantDashboard = {
  customers: number;
  conversations: number;
  active: number;
  handoffs: number;
  pendingHandoffs: number;
  samples: number;
};

export function buildMerchantDashboard(repos: Repositories, merchantId: string): MerchantDashboard {
  const conversations = repos.listConversations({ merchantId, limit: 500 });
  return {
    customers: repos.listCustomers({ merchantId, limit: 500 }).length,
    conversations: conversations.length,
    active: conversations.filter((item) => item.status === "active").length,
    handoffs: conversations.filter((item) => item.status === "human_handoff").length,
    pendingHandoffs: conversations.filter((item) => item.status === "human_handoff" && item.handoffStatus !== "done").length,
    samples: repos.listTrainingSamples({ merchantId, enabled: true }).length
  };
}
