import { countryLabel } from "./countryFormatters.js";

export const BEIJING_TIME_ZONE = "Asia/Shanghai";
export type TimeDisplayMode = "beijing" | "country";
export const TIME_DISPLAY_STORAGE_KEY = "a2c_time_display_mode";

const COUNTRY_TIME_ZONES: Record<string, string> = {
  br: "America/Sao_Paulo",
  brazil: "America/Sao_Paulo",
  "巴西": "America/Sao_Paulo",
  bo: "America/La_Paz",
  bolivia: "America/La_Paz",
  "玻利维亚": "America/La_Paz",
  ph: "Asia/Manila",
  philippines: "Asia/Manila",
  "菲律宾": "Asia/Manila",
  jp: "Asia/Tokyo",
  japan: "Asia/Tokyo",
  "日本": "Asia/Tokyo",
  th: "Asia/Bangkok",
  thailand: "Asia/Bangkok",
  "泰国": "Asia/Bangkok",
  vn: "Asia/Ho_Chi_Minh",
  vietnam: "Asia/Ho_Chi_Minh",
  "越南": "Asia/Ho_Chi_Minh",
  id: "Asia/Jakarta",
  indonesia: "Asia/Jakarta",
  "印尼": "Asia/Jakarta",
  "印度尼西亚": "Asia/Jakarta",
  my: "Asia/Kuala_Lumpur",
  malaysia: "Asia/Kuala_Lumpur",
  "马来西亚": "Asia/Kuala_Lumpur",
  cn: BEIJING_TIME_ZONE,
  china: BEIJING_TIME_ZONE,
  "中国": BEIJING_TIME_ZONE,
  us: "America/New_York",
  usa: "America/New_York",
  america: "America/New_York",
  "united states": "America/New_York",
  "美国": "America/New_York",
  mx: "America/Mexico_City",
  mexico: "America/Mexico_City",
  "墨西哥": "America/Mexico_City",
  es: "Europe/Madrid",
  spain: "Europe/Madrid",
  "西班牙": "Europe/Madrid"
};

let activeTimeDisplayMode: TimeDisplayMode = readTimeDisplayMode();

export function getTimeDisplayMode(): TimeDisplayMode {
  return activeTimeDisplayMode;
}

export function setTimeDisplayMode(mode: TimeDisplayMode) {
  activeTimeDisplayMode = mode;
  if (typeof window !== "undefined") window.localStorage.setItem(TIME_DISPLAY_STORAGE_KEY, mode);
}

export function timeZoneForCountry(country?: unknown) {
  const keys = countryLookupKeys(country);
  for (const key of keys) {
    const zone = COUNTRY_TIME_ZONES[key];
    if (zone) return zone;
  }
  return BEIJING_TIME_ZONE;
}

export function timeDisplayModeLabel(mode: TimeDisplayMode) {
  return mode === "country" ? "国家时间" : "北京时间";
}

export function formatTime(value: string, country?: unknown) {
  if (!value) return "";
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString("zh-CN", { timeZone: effectiveTimeZone(country), hour: "2-digit", minute: "2-digit", hour12: false });
}

export function formatDateTime(value: string, country?: unknown) {
  if (!value) return "";
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("zh-CN", { timeZone: effectiveTimeZone(country), year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false }).replace(/\//g, "-");
}

export function formatConversationDate(value: string, country?: unknown) {
  if (!value) return "";
  const date = parseServerDate(value);
  if (Number.isNaN(date.getTime())) return "";
  const timeZone = effectiveTimeZone(country);
  const day = dateKey(date, timeZone);
  const today = dateKey(new Date(), timeZone);
  const yesterday = dateKey(new Date(Date.now() - 24 * 60 * 60 * 1000), timeZone);
  if (day === today) return "今天";
  if (day === yesterday) return "昨天";
  return day;
}

function dateKey(date: Date, timeZone: string) {
  return date.toLocaleDateString("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).replace(/\//g, "-");
}

function parseServerDate(value: string) {
  const trimmed = value.trim();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(trimmed)
    ? `${trimmed.replace(" ", "T")}Z`
    : trimmed;
  return new Date(normalized);
}

function effectiveTimeZone(country?: unknown) {
  return activeTimeDisplayMode === "country" ? timeZoneForCountry(country) : BEIJING_TIME_ZONE;
}

function readTimeDisplayMode(): TimeDisplayMode {
  if (typeof window === "undefined") return "beijing";
  const stored = window.localStorage.getItem(TIME_DISPLAY_STORAGE_KEY);
  return stored === "country" ? "country" : "beijing";
}

function countryLookupKeys(country?: unknown) {
  const values: string[] = [];
  if (country && typeof country === "object") {
    const record = country as Record<string, unknown>;
    values.push(String(record.countryCode || ""), String(record.code || ""), String(record.countryName || ""), String(record.name || ""), String(record.countryId || ""));
  } else {
    values.push(String(country || ""));
  }
  const expanded = values.flatMap((value) => {
    const trimmed = value.trim();
    const suffix = trimmed.includes(":") ? trimmed.split(":").pop() || trimmed : trimmed;
    return [trimmed, suffix, countryLabel(trimmed), countryLabel(suffix)];
  });
  return expanded.map((value) => value.trim().toLowerCase()).filter(Boolean);
}
