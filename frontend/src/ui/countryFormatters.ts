export const COUNTRY_PRESETS = [
  { name: "巴西", aliases: ["brazil", "br"], code: "br", defaultLanguage: "pt-BR" },
  { name: "菲律宾", aliases: ["philippines", "ph"], code: "ph", defaultLanguage: "en" },
  { name: "日本", aliases: ["japan", "jp"], code: "jp", defaultLanguage: "ja" },
  { name: "泰国", aliases: ["thailand", "th"], code: "th", defaultLanguage: "th" },
  { name: "越南", aliases: ["vietnam", "vn"], code: "vn", defaultLanguage: "vi" },
  { name: "印尼", aliases: ["indonesia", "id", "印度尼西亚"], code: "id", defaultLanguage: "id" },
  { name: "马来西亚", aliases: ["malaysia", "my"], code: "my", defaultLanguage: "ms" },
  { name: "中国", aliases: ["china", "cn"], code: "cn", defaultLanguage: "zh" },
  { name: "美国", aliases: ["united states", "usa", "us", "america"], code: "us", defaultLanguage: "en" },
  { name: "玻利维亚", aliases: ["bolivia", "bo"], code: "bo", defaultLanguage: "es" },
  { name: "墨西哥", aliases: ["mexico", "mx"], code: "mx", defaultLanguage: "es" },
  { name: "西班牙", aliases: ["spain", "es"], code: "es", defaultLanguage: "es" }
];

export function countryLabel(value: unknown): string {
  const text = String(value || "").trim();
  if (!text) return "";
  const normalized = text.toLowerCase();
  if (normalized.includes(":")) {
    const suffix = normalized.split(":").pop() || normalized;
    const translated: string = countryLabel(suffix);
    if (translated !== suffix) return translated;
  }
  const dictionary: Record<string, string> = {
    "default": "默认国家",
    "default:default": "默认国家",
    "默认国家": "默认国家",
    "brazil": "巴西",
    "br": "巴西",
    "philippines": "菲律宾",
    "ph": "菲律宾",
    "japan": "日本",
    "jp": "日本",
    "malaysia": "马来西亚",
    "my": "马来西亚",
    "indonesia": "印尼",
    "id": "印尼",
    "thailand": "泰国",
    "th": "泰国",
    "vietnam": "越南",
    "vn": "越南",
    "china": "中国",
    "cn": "中国",
    "united states": "美国",
    "usa": "美国",
    "us": "美国",
    "bolivia": "玻利维亚",
    "bo": "玻利维亚",
    "mexico": "墨西哥",
    "mx": "墨西哥",
    "spain": "西班牙",
    "es": "西班牙"
  };
  return dictionary[normalized] || text;
}

export function inferCountryProfile(value: string) {
  const text = value.trim();
  const normalized = text.toLowerCase();
  const preset = COUNTRY_PRESETS.find((item) => item.name === text || item.code === normalized || item.aliases.includes(normalized));
  if (preset) return { code: preset.code, defaultLanguage: preset.defaultLanguage };
  const ascii = normalized.replace(/[^a-z]/g, "").slice(0, 2);
  return { code: ascii || "default", defaultLanguage: "en" };
}
