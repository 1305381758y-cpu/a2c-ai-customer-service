import { api, loadRows, withQuery } from "../app/api.js";
import type { Conversation, Customer, Filters } from "../types.js";

export function buildCustomersUrl(platform: boolean, filters: Filters): string {
  return withQuery(
    platform ? "/api/admin/customers" : "/api/merchant/customers",
    platform ? filters : {
      countryId: filters.countryId,
      status: filters.status,
      language: filters.language,
      limit: filters.limit
    }
  );
}

export async function loadCustomers(url: string): Promise<Customer[]> {
  return await loadRows<Customer>(url);
}

export function buildCustomerConversationsUrl(platform: boolean, customer: Customer): string {
  return withQuery(
    platform ? "/api/admin/conversations" : "/api/merchant/conversations",
    platform
      ? { merchantId: customer.merchantId, customerPhone: customer.customerKey, limit: "50000" }
      : { customerPhone: customer.customerKey, limit: "50000" }
  );
}

export async function loadCustomerConversations(url: string): Promise<Conversation[]> {
  return await loadRows<Conversation>(url);
}

export async function deleteCustomer(platform: boolean, customer: Customer): Promise<{ conversationsDeleted: number; messagesDeleted: number }> {
  const url = platform
    ? `/api/admin/customers/${encodeURIComponent(customer.customerKey)}?merchantId=${encodeURIComponent(customer.merchantId || "default")}`
    : `/api/merchant/customers/${encodeURIComponent(customer.customerKey)}`;
  return await api<{ conversationsDeleted: number; messagesDeleted: number }>(url, { method: "DELETE" });
}
