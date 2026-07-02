import type { MerchantCountryRecord } from "./repositoryTypes.js";

const COUNTRY_PRESETS: Array<{ names: string[]; code: string; defaultLanguage: string }> = [
  { names: ["巴西", "brazil", "br"], code: "br", defaultLanguage: "pt-BR" },
  { names: ["菲律宾", "philippines", "ph"], code: "ph", defaultLanguage: "en" },
  { names: ["日本", "japan", "jp"], code: "jp", defaultLanguage: "ja" },
  { names: ["泰国", "thailand", "th"], code: "th", defaultLanguage: "th" },
  { names: ["越南", "vietnam", "vn"], code: "vn", defaultLanguage: "vi" },
  { names: ["印尼", "印度尼西亚", "indonesia", "id"], code: "id", defaultLanguage: "id" },
  { names: ["马来西亚", "malaysia", "my"], code: "my", defaultLanguage: "ms" },
  { names: ["中国", "china", "cn"], code: "cn", defaultLanguage: "zh" },
  { names: ["美国", "united states", "usa", "us", "america"], code: "us", defaultLanguage: "en" },
  { names: ["墨西哥", "mexico", "mx"], code: "mx", defaultLanguage: "es" },
  { names: ["玻利维亚", "bolivia", "bo"], code: "bo", defaultLanguage: "es" },
  { names: ["西班牙", "spain", "es"], code: "es", defaultLanguage: "es" }
];

export function inferCountryProfile(input: Record<string, unknown>, current?: MerchantCountryRecord) {
  const rawName = String(input.name || current?.name || "").trim();
  const rawCode = String(input.code || "").trim().toLowerCase();
  const rawLanguage = String(input.defaultLanguage || "").trim();
  const normalizedName = rawName.toLowerCase();
  const preset = COUNTRY_PRESETS.find((item) => item.names.some((name) => {
    const normalized = name.toLowerCase();
    return normalized === normalizedName || normalized === rawCode;
  }));
  const code = preset?.code || rawCode || current?.code || normalizedName.replace(/[^a-z]/g, "").slice(0, 2) || "default";
  const defaultLanguage = preset?.defaultLanguage || rawLanguage || current?.defaultLanguage || "en";
  return { code, name: rawName || current?.name || code, defaultLanguage };
}
