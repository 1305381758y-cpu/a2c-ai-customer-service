import type { Repositories } from "../repositories.js";
import { todayBeijingSqlRange } from "./beijingTime.js";

export type MerchantDashboard = {
  customers: number;
  todayCustomers: number;
  todayConversations: number;
  todayReplies: number;
};

export function buildMerchantDashboard(repos: Repositories, merchantId: string): MerchantDashboard {
  const today = todayBeijingSqlRange();
  return {
    customers: repos.countCustomers({ merchantId }),
    todayCustomers: repos.countCustomers({ merchantId, startAt: today.startAt, endAt: today.endAt }),
    todayConversations: repos.countConversations({ merchantId, startAt: today.startAt, endAt: today.endAt }),
    todayReplies: repos.countMessages({ merchantId, direction: "outbound", startAt: today.startAt, endAt: today.endAt })
  };
}
