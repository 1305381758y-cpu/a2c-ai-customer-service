import type { Repositories } from "../repositories.js";
import { normalizeSqlTimeRange, todayBeijingSqlRange, yesterdayBeijingSqlRange, type SqlTimeRange } from "./beijingTime.js";

export type MerchantDashboard = {
  customers: number;
  todayCustomers: number;
  yesterdayCustomers: number;
  rangeCustomers: number;
  conversations: number;
  todayConversations: number;
  todayNewConversations: number;
  todayRepeatConversations: number;
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
  averageMessagesPerConversation: number;
  todayAverageMessagesPerConversation: number;
  yesterdayAverageMessagesPerConversation: number;
  rangeAverageMessagesPerConversation: number;
};

export function buildMerchantDashboard(repos: Repositories, merchantId: string, query: { startAt?: string; endAt?: string } = {}): MerchantDashboard {
  const today = todayBeijingSqlRange();
  const yesterday = yesterdayBeijingSqlRange();
  const range = normalizeSqlTimeRange(query);
  const conversations = repos.countConversations({ merchantId });
  const todayConversations = repos.countConversations({ merchantId, startAt: today.startAt, endAt: today.endAt });
  const todayNewConversations = repos.countConversationsByCustomerHistory({ merchantId, startAt: today.startAt, endAt: today.endAt, repeat: false });
  const todayRepeatConversations = repos.countConversationsByCustomerHistory({ merchantId, startAt: today.startAt, endAt: today.endAt, repeat: true });
  const yesterdayConversations = repos.countConversations({ merchantId, startAt: yesterday.startAt, endAt: yesterday.endAt });
  const rangeConversations = countRange(range, () => repos.countConversations({ merchantId, startAt: range.startAt, endAt: range.endAt }));
  const customerMessages = repos.countMessages({ merchantId, direction: "inbound" });
  const todayCustomerMessages = repos.countMessages({ merchantId, direction: "inbound", startAt: today.startAt, endAt: today.endAt });
  const yesterdayCustomerMessages = repos.countMessages({ merchantId, direction: "inbound", startAt: yesterday.startAt, endAt: yesterday.endAt });
  const rangeCustomerMessages = countRange(range, () => repos.countMessages({ merchantId, direction: "inbound", startAt: range.startAt, endAt: range.endAt }));
  const replies = repos.countMessages({ merchantId, direction: "outbound" });
  const todayReplies = repos.countMessages({ merchantId, direction: "outbound", startAt: today.startAt, endAt: today.endAt });
  const yesterdayReplies = repos.countMessages({ merchantId, direction: "outbound", startAt: yesterday.startAt, endAt: yesterday.endAt });
  const rangeReplies = countRange(range, () => repos.countMessages({ merchantId, direction: "outbound", startAt: range.startAt, endAt: range.endAt }));
  return {
    customers: repos.countCustomers({ merchantId }),
    todayCustomers: repos.countCustomers({ merchantId, startAt: today.startAt, endAt: today.endAt }),
    yesterdayCustomers: repos.countCustomers({ merchantId, startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeCustomers: countRange(range, () => repos.countCustomers({ merchantId, startAt: range.startAt, endAt: range.endAt })),
    conversations,
    todayConversations,
    todayNewConversations,
    todayRepeatConversations,
    yesterdayConversations,
    rangeConversations,
    customerMessages,
    todayCustomerMessages,
    yesterdayCustomerMessages,
    rangeCustomerMessages,
    replies,
    todayReplies,
    yesterdayReplies,
    rangeReplies,
    averageMessagesPerConversation: averageMessages(customerMessages + replies, conversations),
    todayAverageMessagesPerConversation: averageMessages(todayCustomerMessages + todayReplies, todayConversations),
    yesterdayAverageMessagesPerConversation: averageMessages(yesterdayCustomerMessages + yesterdayReplies, yesterdayConversations),
    rangeAverageMessagesPerConversation: averageMessages(rangeCustomerMessages + rangeReplies, rangeConversations)
  };
}

function countRange(range: SqlTimeRange, count: () => number): number {
  return range.startAt || range.endAt ? count() : 0;
}

function averageMessages(messages: number, conversations: number): number {
  if (!conversations) return 0;
  return Math.round((messages / conversations) * 10) / 10;
}
