import type { Repositories } from "../repositories.js";
import { todayBeijingSqlRange } from "./beijingTime.js";

export type AdminDashboard = {
  customers: number;
  todayCustomers: number;
  todayConversations: number;
  todayReplies: number;
};

export function buildAdminDashboard(repos: Repositories): AdminDashboard {
  const today = todayBeijingSqlRange();
  return {
    customers: repos.countCustomers(),
    todayCustomers: repos.countCustomers({ startAt: today.startAt, endAt: today.endAt }),
    todayConversations: repos.countConversations({ startAt: today.startAt, endAt: today.endAt }),
    todayReplies: repos.countMessages({ direction: "outbound", startAt: today.startAt, endAt: today.endAt })
  };
}
