import type { Repositories } from "../repositories.js";
import { normalizeSqlTimeRange, todayBeijingSqlRange, yesterdayBeijingSqlRange, type SqlTimeRange } from "./beijingTime.js";

export type AdminDashboard = {
  customers: number;
  todayCustomers: number;
  yesterdayCustomers: number;
  rangeCustomers: number;
  conversations: number;
  todayConversations: number;
  yesterdayConversations: number;
  rangeConversations: number;
  customerMessages: number;
  todayCustomerMessages: number;
  yesterdayCustomerMessages: number;
  rangeCustomerMessages: number;
  replies: number;
  todayReplies: number;
  yesterdayReplies: number;
  rangeReplies: number;
};

export function buildAdminDashboard(repos: Repositories, query: { startAt?: string; endAt?: string } = {}): AdminDashboard {
  const today = todayBeijingSqlRange();
  const yesterday = yesterdayBeijingSqlRange();
  const range = normalizeSqlTimeRange(query);
  return {
    customers: repos.countCustomers(),
    todayCustomers: repos.countCustomers({ startAt: today.startAt, endAt: today.endAt }),
    yesterdayCustomers: repos.countCustomers({ startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeCustomers: countRange(range, () => repos.countCustomers({ startAt: range.startAt, endAt: range.endAt })),
    conversations: repos.countConversations(),
    todayConversations: repos.countConversations({ startAt: today.startAt, endAt: today.endAt }),
    yesterdayConversations: repos.countConversations({ startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeConversations: countRange(range, () => repos.countConversations({ startAt: range.startAt, endAt: range.endAt })),
    customerMessages: repos.countMessages({ direction: "inbound" }),
    todayCustomerMessages: repos.countMessages({ direction: "inbound", startAt: today.startAt, endAt: today.endAt }),
    yesterdayCustomerMessages: repos.countMessages({ direction: "inbound", startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeCustomerMessages: countRange(range, () => repos.countMessages({ direction: "inbound", startAt: range.startAt, endAt: range.endAt })),
    replies: repos.countMessages({ direction: "outbound" }),
    todayReplies: repos.countMessages({ direction: "outbound", startAt: today.startAt, endAt: today.endAt }),
    yesterdayReplies: repos.countMessages({ direction: "outbound", startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeReplies: countRange(range, () => repos.countMessages({ direction: "outbound", startAt: range.startAt, endAt: range.endAt }))
  };
}

function countRange(range: SqlTimeRange, count: () => number): number {
  return range.startAt || range.endAt ? count() : 0;
}
