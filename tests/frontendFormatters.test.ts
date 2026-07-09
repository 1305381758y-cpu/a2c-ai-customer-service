import { describe, expect, it } from "vitest";

import { displayValue, formatDateTime, formatTime, getTimeDisplayMode, label, setTimeDisplayMode, timeZoneForCountry } from "../frontend/src/ui/formatters.js";

describe("frontend time formatters", () => {
  it("renders server timestamps in Beijing time", () => {
    setTimeDisplayMode("beijing");
    expect(formatDateTime("2026-07-03 00:00:00")).toBe("2026-07-03 08:00");
    expect(formatTime("2026-07-03 00:00:00")).toBe("08:00");
  });

  it("formats table timestamp columns through displayValue", () => {
    setTimeDisplayMode("beijing");
    expect(displayValue("createdAt", "2026-07-03 00:00:00")).toBe("2026-07-03 08:00");
    expect(displayValue("lastSeenAt", "2026-07-03 12:30:00")).toBe("2026-07-03 20:30");
    expect(displayValue("synced_at", "2026-07-03 15:45:00")).toBe("2026-07-03 23:45");
  });

  it("can switch display to the row country time zone", () => {
    setTimeDisplayMode("country");
    expect(getTimeDisplayMode()).toBe("country");
    expect(timeZoneForCountry("玻利维亚")).toBe("America/La_Paz");
    expect(formatDateTime("2026-07-03 12:00:00", "玻利维亚")).toBe("2026-07-03 08:00");
    expect(formatDateTime("2026-07-03 12:00:00", "bo")).toBe("2026-07-03 08:00");
    expect(displayValue("createdAt", "2026-07-03 12:00:00", { countryCode: "bo" })).toBe("2026-07-03 08:00");
    setTimeDisplayMode("beijing");
  });

  it("uses operational wording for enabled-state columns", () => {
    expect(label("active")).toBe("当前启用");
  });
});
