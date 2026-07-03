import type { Repositories } from "../repositories.js";
import { normalizeSqlTimeRange, todayBeijingSqlRange, yesterdayBeijingSqlRange, type SqlTimeRange } from "./beijingTime.js";

export type MerchantDashboard = {
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

export function buildMerchantDashboard(repos: Repositories, merchantId: string, query: { startAt?: string; endAt?: string } = {}): MerchantDashboard {
  const today = todayBeijingSqlRange();
  const yesterday = yesterdayBeijingSqlRange();
  const range = normalizeSqlTimeRange(query);
  return {
    customers: repos.countCustomers({ merchantId }),
    todayCustomers: repos.countCustomers({ merchantId, startAt: today.startAt, endAt: today.endAt }),
    yesterdayCustomers: repos.countCustomers({ merchantId, startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeCustomers: countRange(range, () => repos.countCustomers({ merchantId, startAt: range.startAt, endAt: range.endAt })),
    conversations: repos.countConversations({ merchantId }),
    todayConversations: repos.countConversations({ merchantId, startAt: today.startAt, endAt: today.endAt }),
    yesterdayConversations: repos.countConversations({ merchantId, startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeConversations: countRange(range, () => repos.countConversations({ merchantId, startAt: range.startAt, endAt: range.endAt })),
    customerMessages: repos.countMessages({ merchantId, direction: "inbound" }),
    todayCustomerMessages: repos.countMessages({ merchantId, direction: "inbound", startAt: today.startAt, endAt: today.endAt }),
    yesterdayCustomerMessages: repos.countMessages({ merchantId, direction: "inbound", startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeCustomerMessages: countRange(range, () => repos.countMessages({ merchantId, direction: "inbound", startAt: range.startAt, endAt: range.endAt })),
    replies: repos.countMessages({ merchantId, direction: "outbound" }),
    todayReplies: repos.countMessages({ merchantId, direction: "outbound", startAt: today.startAt, endAt: today.endAt }),
    yesterdayReplies: repos.countMessages({ merchantId, direction: "outbound", startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeReplies: countRange(range, () => repos.countMessages({ merchantId, direction: "outbound", startAt: range.startAt, endAt: range.endAt }))
  };
}

function countRange(range: SqlTimeRange, count: () => number): number {
  return range.startAt || range.endAt ? count() : 0;
}
