import { MerchantConversationsPage } from "./MerchantConversationsPage.js";
import { PlatformConversationsPage } from "./PlatformConversationsPage.js";

export function ConversationsPage({ platform = false, handoffs = false }: { platform?: boolean; handoffs?: boolean }) {
  return platform ? <PlatformConversationsPage handoffs={handoffs} /> : <MerchantConversationsPage handoffs={handoffs} />;
}
