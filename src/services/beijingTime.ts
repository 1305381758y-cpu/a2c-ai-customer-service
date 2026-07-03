const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export type SqlTimeRange = {
  startAt?: string;
  endAt?: string;
};

export function todayBeijingSqlRange(now = new Date()): Required<SqlTimeRange> {
  return beijingDateSqlRange(beijingDateKey(now));
}

export function yesterdayBeijingSqlRange(now = new Date()): Required<SqlTimeRange> {
  return beijingDateSqlRange(beijingDateKey(new Date(now.getTime() - 24 * 60 * 60 * 1000)));
}

export function beijingDateSqlRange(dateKey: string): Required<SqlTimeRange> {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey.trim());
  if (!match) return todayBeijingSqlRange();
  const [, year, month, day] = match;
  const beijingMidnightUtcMs = Date.UTC(Number(year), Number(month) - 1, Number(day)) - BEIJING_OFFSET_MS;
  return {
    startAt: toSqlTimestamp(new Date(beijingMidnightUtcMs)),
    endAt: toSqlTimestamp(new Date(beijingMidnightUtcMs + 24 * 60 * 60 * 1000))
  };
}

export function normalizeSqlTimeRange(input: { startAt?: string; endAt?: string }): SqlTimeRange {
  return {
    startAt: normalizeBoundary(input.startAt),
    endAt: normalizeBoundary(input.endAt)
  };
}

function beijingDateKey(date: Date): string {
  const beijing = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return `${beijing.getUTCFullYear()}-${pad(beijing.getUTCMonth() + 1)}-${pad(beijing.getUTCDate())}`;
}

function normalizeBoundary(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return beijingDateSqlRange(value).startAt;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return toSqlTimestamp(date);
}

function toSqlTimestamp(date: Date): string {
  return date.toISOString().slice(0, 19).replace("T", " ");
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}
