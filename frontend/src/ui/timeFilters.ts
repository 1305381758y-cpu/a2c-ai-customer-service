export function todayDateTimeRange(timeZone = "Asia/Shanghai") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const current = parts.reduce<Record<string, string>>((result, part) => {
    if (part.type !== "literal") result[part.type] = part.value;
    return result;
  }, {});
  const start = `${current.year}-${current.month}-${current.day}`;
  const nextDay = new Date(Date.UTC(Number(current.year), Number(current.month) - 1, Number(current.day) + 1));
  const next = {
    year: String(nextDay.getUTCFullYear()),
    month: String(nextDay.getUTCMonth() + 1).padStart(2, "0"),
    day: String(nextDay.getUTCDate()).padStart(2, "0")
  };
  return {
    startAt: `${start}T00:00:00`,
    endAt: `${next.year}-${next.month}-${next.day}T00:00:00`
  };
}
