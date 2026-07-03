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
  averageMessagesPerConversation: number;
  todayAverageMessagesPerConversation: number;
  yesterdayAverageMessagesPerConversation: number;
  rangeAverageMessagesPerConversation: number;
};

export function buildAdminDashboard(repos: Repositories, query: { startAt?: string; endAt?: string } = {}): AdminDashboard {
  const today = todayBeijingSqlRange();
  const yesterday = yesterdayBeijingSqlRange();
  const range = normalizeSqlTimeRange(query);
  const conversations = repos.countConversations();
  const todayConversations = repos.countConversations({ startAt: today.startAt, endAt: today.endAt });
  const yesterdayConversations = repos.countConversations({ startAt: yesterday.startAt, endAt: yesterday.endAt });
  const rangeConversations = countRange(range, () => repos.countConversations({ startAt: range.startAt, endAt: range.endAt }));
  const customerMessages = repos.countMessages({ direction: "inbound" });
  const todayCustomerMessages = repos.countMessages({ direction: "inbound", startAt: today.startAt, endAt: today.endAt });
  const yesterdayCustomerMessages = repos.countMessages({ direction: "inbound", startAt: yesterday.startAt, endAt: yesterday.endAt });
  const rangeCustomerMessages = countRange(range, () => repos.countMessages({ direction: "inbound", startAt: range.startAt, endAt: range.endAt }));
  const replies = repos.countMessages({ direction: "outbound" });
  const todayReplies = repos.countMessages({ direction: "outbound", startAt: today.startAt, endAt: today.endAt });
  const yesterdayReplies = repos.countMessages({ direction: "outbound", startAt: yesterday.startAt, endAt: yesterday.endAt });
  const rangeReplies = countRange(range, () => repos.countMessages({ direction: "outbound", startAt: range.startAt, endAt: range.endAt }));
  return {
    customers: repos.countCustomers(),
    todayCustomers: repos.countCustomers({ startAt: today.startAt, endAt: today.endAt }),
    yesterdayCustomers: repos.countCustomers({ startAt: yesterday.startAt, endAt: yesterday.endAt }),
    rangeCustomers: countRange(range, () => repos.countCustomers({ startAt: range.startAt, endAt: range.endAt })),
    conversations,
    todayConversations,
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
