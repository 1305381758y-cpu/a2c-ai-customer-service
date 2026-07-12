import { describe, expect, it } from "vitest";
import { buildStrictFlowFollowUp } from "../src/domain/strictFlow.js";

describe("strict flow follow-up policy", () => {
  it("uses pre-registration follow-up text before sending the registration link", () => {
    expect(buildStrictFlowFollowUp("registration_intent", "zh")).toContain("方便继续");
    expect(buildStrictFlowFollowUp("interest_screening", "en")).toContain("free to continue");
  });

  it("asks about the current registration step while waiting for registration", () => {
    expect(buildStrictFlowFollowUp("wait_registration", "zh")).toContain("注册到哪一步");
    expect(buildStrictFlowFollowUp("send_register_link", "pt-BR")).toContain("etapa do cadastro");
  });

  it("keeps Telegram follow-ups focused on setup help", () => {
    expect(buildStrictFlowFollowUp("telegram_download", "zh")).toContain("Telegram");
    expect(buildStrictFlowFollowUp("collect_telegram", "en")).toContain("Telegram");
  });

  it("uses the customer's Spanish language for idle follow-ups", () => {
    expect(buildStrictFlowFollowUp("wait_registration", "es")).toContain("¿En qué etapa del registro está ahora?");
    expect(buildStrictFlowFollowUp("wait_registration", "es-BO")).toContain("¿En qué etapa del registro está ahora?");
    expect(buildStrictFlowFollowUp("wait_registration", "es")).not.toContain("您注册到哪一步");
  });

  it("falls back to a generic current-step reminder for unknown steps", () => {
    expect(buildStrictFlowFollowUp("unknown-step", "unknown")).toContain("准备好了");
    expect(buildStrictFlowFollowUp("unknown-step", "en")).toContain("current step");
  });
});
