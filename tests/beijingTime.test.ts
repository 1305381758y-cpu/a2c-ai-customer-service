import { describe, expect, it } from "vitest";
import { normalizeSqlTimeRange } from "../src/services/beijingTime.js";

describe("Beijing time range normalization", () => {
  it("treats date-only filters as Beijing midnight", () => {
    expect(normalizeSqlTimeRange({ startAt: "2026-07-04", endAt: "2026-07-05" })).toEqual({
      startAt: "2026-07-03 16:00:00",
      endAt: "2026-07-04 16:00:00"
    });
  });

  it("treats datetime-local filters as Beijing local time with seconds", () => {
    expect(normalizeSqlTimeRange({ startAt: "2026-07-04T10:30:15", endAt: "2026-07-04 12:05" })).toEqual({
      startAt: "2026-07-04 02:30:15",
      endAt: "2026-07-04 04:05:00"
    });
  });

  it("keeps explicit timezone filters exact", () => {
    expect(normalizeSqlTimeRange({ startAt: "2026-07-04T10:30:15+08:00", endAt: "2026-07-04T12:05:00Z" })).toEqual({
      startAt: "2026-07-04 02:30:15",
      endAt: "2026-07-04 12:05:00"
    });
  });
});
