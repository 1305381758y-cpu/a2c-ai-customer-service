import type { MerchantConfigRecord, MerchantCountryRecord, MerchantRecord } from "../repositories.js";

export function isStrictFlowEnabled(merchant: MerchantRecord, country: MerchantCountryRecord, merchantConfig?: Pick<MerchantConfigRecord, "strictScriptFlowEnabled">): boolean {
  if (merchantConfig?.strictScriptFlowEnabled) return true;
  const merchantName = merchant.name.trim().toLowerCase();
  const merchantId = merchant.id.trim().toLowerCase();
  const countryName = country.name.trim().toLowerCase();
  const countryCode = country.code.trim().toLowerCase();
  const isAston = merchantName.includes("阿斯顿") || merchantName.includes("aston") || merchantId.includes("aston");
  const isDefaultMerchant = merchantId === "default" || merchantName.includes("默认") || merchantName.includes("default");
  const isBrazil = countryName.includes("巴西") || countryName.includes("brazil") || countryName.includes("brasil") || countryCode === "br" || countryCode === "brasil";
  const isUnconfiguredMarket =
    !countryName ||
    !countryCode ||
    countryName.includes("默认") ||
    countryName.includes("default") ||
    countryCode === "default" ||
    countryCode === "unknown";
  return (isAston || isDefaultMerchant) && (isBrazil || isUnconfiguredMarket);
}
