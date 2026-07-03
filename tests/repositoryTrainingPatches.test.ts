import { describe, expect, it } from "vitest";
import { buildKnowledgeItemPatch, buildTrainingSamplePatch } from "../src/repositoryTrainingPatches.js";

describe("repository training patch builders", () => {
  it("builds a training sample SQL patch with stable values and ignored unknown fields", () => {
    expect(buildTrainingSamplePatch({
      customerMessage: "Como registrar?",
      standardReply: "Abra o link.",
      enabled: false,
      priority: "7",
      unknown: "ignored"
    })).toEqual({
      assignments: "customer_message = ?, standard_reply = ?, enabled = ?, priority = ?",
      values: ["Como registrar?", "Abra o link.", 0, "7"]
    });
  });

  it("builds a knowledge SQL patch with normalized and stringified values", () => {
    expect(buildKnowledgeItemPatch({
      type: "unexpected",
      title: null,
      content: "注册说明",
      language: undefined,
      priority: "",
      enabled: true,
      countryId: 123
    })).toEqual({
      assignments: "type = ?, title = ?, content = ?, language = ?, priority = ?, enabled = ?, country_id = ?",
      values: ["faq", "", "注册说明", "", 0, 1, "123"]
    });
  });

  it("returns undefined when the patch has no supported fields", () => {
    expect(buildTrainingSamplePatch({ unknown: "ignored" })).toBeUndefined();
    expect(buildKnowledgeItemPatch({ unknown: "ignored" })).toBeUndefined();
  });
});
