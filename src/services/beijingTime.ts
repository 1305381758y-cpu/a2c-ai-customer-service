const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;
export const BEIJING_TIME_ZONE = "Asia/Shanghai";
const DATE_ONLY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const BEIJING_LOCAL_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})[T\s](\d{2}):(\d{2})(?::(\d{2}))?$/;

export type SqlTimeRange = {
  startAt?: string;
  endAt?: string;
};

export function todayBeijingSqlRange(now = new Date()): Required<SqlTimeRange> {
  return todaySqlRange(BEIJING_TIME_ZONE, now);
}

export function yesterdayBeijingSqlRange(now = new Date()): Required<SqlTimeRange> {
  return yesterdaySqlRange(BEIJING_TIME_ZONE, now);
}

export function beijingDateSqlRange(dateKey: string): Required<SqlTimeRange> {
  return dateSqlRange(dateKey, BEIJING_TIME_ZONE);
}

export function todaySqlRange(timeZone = BEIJING_TIME_ZONE, now = new Date()): Required<SqlTimeRange> {
  return dateSqlRange(dateKeyInTimeZone(now, timeZone), timeZone);
}

export function yesterdaySqlRange(timeZone = BEIJING_TIME_ZONE, now = new Date()): Required<SqlTimeRange> {
  return dateSqlRange(dateKeyInTimeZone(new Date(now.getTime() - 24 * 60 * 60 * 1000), timeZone), timeZone);
}

export function dateSqlRange(dateKey: string, timeZone = BEIJING_TIME_ZONE): Required<SqlTimeRange> {
  const match = DATE_ONLY_RE.exec(dateKey.trim());
  if (!match) return todaySqlRange(timeZone);
  const [, year, month, day] = match;
  const start = localDateTimeToUtc(timeZone, Number(year), Number(month), Number(day), 0, 0, 0);
  const end = localDateTimeToUtc(timeZone, Number(year), Number(month), Number(day) + 1, 0, 0, 0);
  return { startAt: toSqlTimestamp(start), endAt: toSqlTimestamp(end) };
}

export function normalizeSqlTimeRange(input: { startAt?: string; endAt?: string; timeZone?: string }): SqlTimeRange {
  const timeZone = sanitizeTimeZone(input.timeZone);
  return {
    startAt: normalizeBoundary(input.startAt, timeZone),
    endAt: normalizeBoundary(input.endAt, timeZone)
  };
}

function beijingDateKey(date: Date): string {
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
}

function normalizeBoundary(value: string | undefined, timeZone: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (DATE_ONLY_RE.test(trimmed)) return dateSqlRange(trimmed, timeZone).startAt;
  const localDateTime = BEIJING_LOCAL_DATETIME_RE.exec(trimmed);
  if (localDateTime) {
    const [, year, month, day, hour, minute, second = "0"] = localDateTime;
    return toSqlTimestamp(localDateTimeToUtc(timeZone, Number(year), Number(month), Number(day), Number(hour), Number(minute), Number(second)));
  }
  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return undefined;
  return toSqlTimestamp(date);
}

function dateKeyInTimeZone(date: Date, timeZone: string): string {
  return date.toLocaleDateString("zh-CN", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).replace(/\//g, "-");
}

function localDateTimeToUtc(timeZone: string, year: number, month: number, day: number, hour: number, minute: number, second: number): Date {
  const initialUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffset = timeZoneOffsetMs(timeZone, new Date(initialUtcMs));
  const firstGuess = new Date(initialUtcMs - firstOffset);
  const secondOffset = timeZoneOffsetMs(timeZone, firstGuess);
  return new Date(initialUtcMs - secondOffset);
}

function timeZoneOffsetMs(timeZone: string, date: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(date);
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  const localAsUtcMs = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  return localAsUtcMs - date.getTime();
}

function sanitizeTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return BEIJING_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return BEIJING_TIME_ZONE;
  }
}

function toSqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
