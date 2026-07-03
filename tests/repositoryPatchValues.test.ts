import { describe, expect, it } from "vitest";
import { booleanPatchValue } from "../src/repositoryPatchValues.js";

describe("repositoryPatchValues", () => {
  it("normalizes boolean patch values", () => {
    expect(booleanPatchValue(true, false)).toBe(1);
    expect(booleanPatchValue(false, true)).toBe(0);
    expect(booleanPatchValue("1", false)).toBe(1);
    expect(booleanPatchValue("false", true)).toBe(0);
    expect(booleanPatchValue("unknown", true)).toBe(1);
  });
});
