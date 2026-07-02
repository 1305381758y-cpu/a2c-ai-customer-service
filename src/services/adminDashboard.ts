import type { Repositories } from "../repositories.js";

export type AdminDashboard = {
  merchants: number;
  customers: number;
  conversations: number;
  handoffs: number;
  samples: number;
};

export function buildAdminDashboard(repos: Repositories): AdminDashboard {
  return {
    merchants: repos.listMerchants().length,
    customers: repos.listCustomers({ limit: 500 }).length,
    conversations: repos.listConversations({ limit: 500 }).length,
    handoffs: repos.listConversations({ status: "human_handoff", limit: 500 }).length,
    samples: repos.listTrainingSamples({ enabled: true }).length
  };
}
