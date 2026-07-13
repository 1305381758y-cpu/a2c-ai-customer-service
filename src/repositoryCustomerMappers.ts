import type { CustomerBalanceTransactionRecord, CustomerRecord } from "./repositoryTypes.js";

export function mapCustomer(row: Record<string, unknown>): CustomerRecord {
  const merchantId = String(row.merchant_id ?? "default");
  return {
    id: Number(row.id),
    merchantId,
    countryId: String(row.country_id ?? `${merchantId}:default`),
    countryCode: String(row.country_code ?? "default"),
    countryName: String(row.country_name ?? "默认国家"),
    customerKey: String(row.customer_key ?? ""),
    nickname: String(row.nickname ?? ""),
    firstA2CAccountPhone: String(row.first_a2c_account_phone ?? ""),
    lastA2CAccountPhone: String(row.last_a2c_account_phone ?? ""),
    language: String(row.language ?? "unknown"),
    stage: String(row.stage ?? "need_platform_register"),
    extractedPhone: String(row.extracted_phone ?? ""),
    extractedTelegram: String(row.extracted_telegram ?? ""),
    extractedWhatsApp: String(row.extracted_whatsapp ?? ""),
    status: String(row.status ?? "active") as "active" | "human_handoff",
    conversationCount: Number(row.conversation_count ?? 0),
    lastConversationId: String(row.last_conversation_id ?? ""),
    firstSeenAt: String(row.first_seen_at ?? ""),
    lastSeenAt: String(row.last_seen_at ?? ""),
    ...(Object.hasOwn(row, "balance") ? {
      balance: Number(row.balance ?? 0),
      balanceCurrency: String(row.balance_currency ?? "CNY"),
      aiProvider: row.ai_provider === "minimax" || row.ai_provider === "gemini" || row.ai_provider === "deepseek" ? row.ai_provider : "",
      aiModel: String(row.ai_model ?? "")
    } : {})
  } as CustomerRecord;
}

export function mapCustomerBalanceTransaction(row: Record<string, unknown>): CustomerBalanceTransactionRecord {
  return {
    id: Number(row.id ?? 0),
    merchantId: String(row.merchant_id ?? ""),
    customerKey: String(row.customer_key ?? ""),
    amount: Number(row.amount ?? 0),
    note: String(row.note ?? ""),
    createdBy: String(row.created_by ?? ""),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  };
}
