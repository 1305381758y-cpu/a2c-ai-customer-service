import { describe, expect, it } from "vitest";

import { displayValue, formatDateTime, formatTime } from "../frontend/src/ui/formatters.js";

describe("frontend time formatters", () => {
  it("renders server timestamps in Beijing time", () => {
    expect(formatDateTime("2026-07-03 00:00:00")).toBe("2026-07-03 08:00");
    expect(formatTime("2026-07-03 00:00:00")).toBe("08:00");
  });

  it("formats table timestamp columns through displayValue", () => {
    expect(displayValue("createdAt", "2026-07-03 00:00:00")).toBe("2026-07-03 08:00");
    expect(displayValue("lastSeenAt", "2026-07-03 12:30:00")).toBe("2026-07-03 20:30");
    expect(displayValue("synced_at", "2026-07-03 15:45:00")).toBe("2026-07-03 23:45");
  });
});
