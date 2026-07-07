import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import type { StrictFlowReply } from "../src/domain/strictFlow.js";
import type { MerchantAgentProfileRecord } from "../src/repositories.js";
import { refineStrictFlowReplyText } from "../src/services/strictFlowReplyTextRefinement.js";

function config() {
  return loadConfig({
    DATABASE_URL: ":memory:"
  });
}

function strictReply(overrides: Partial<StrictFlowReply> = {}): StrictFlowReply {
  return {
    enabled: true,
    reply: "好的，请继续注册。",
    language: "zh",
    stage: "need_platform_register",
    nextFlowStep: "wait_registration",
    needsInviteCode: false,
    controlledQuestionType: "help",
    controlledQuestionFallback: false,
    fallback: false,
    ...overrides
  };
}

function agentProfile(overrides: Partial<MerchantAgentProfileRecord> = {}): MerchantAgentProfileRecord {
  return {
    merchantId: "merchant-1",
    agentName: "接待专员",
    roleDefinition: "",
    toneStyle: "",
    coreGoal: "",
    mustFollow: "",
    forbidden: "",
    uncertaintyPolicy: "",
    handoffPolicy: "",
    enabled: true,
    createdAt: "",
    updatedAt: "",
    ...overrides
  };
}

describe("strict flow reply text refinement", () => {
  it("naturalizes the strict-flow draft before running the language guard", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "可以，我一步步带您处理注册。",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply(),
      customerText: "我不会注册",
      history: [],
      agentProfile: agentProfile()
    });

    expect(ai.naturalizeStrictFlowText).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      customerText: "我不会注册",
      draftReply: "好的，请继续注册。",
      flowStep: "wait_registration",
      questionType: "help",
      allowLinkOrInvite: false
    }));
    expect(result.reply).toBe("可以，我一步步带您处理注册。");
    expect(result.naturalized).toMatchObject({ used: true });
    expect(result.languageGuard).toMatchObject({ status: "matched", targetLanguage: "zh" });
  });

  it("keeps simple replies local when no naturalization is needed", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn()
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "请把手机号发给我。",
        controlledQuestionType: "none"
      }),
      customerText: "好的",
      history: [],
      agentProfile: agentProfile({ enabled: false })
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe("请把手机号发给我。");
    expect(result.naturalized).toMatchObject({ used: false });
    expect(result.languageGuard.status).toBe("matched");
  });

  it("does not naturalize missing invite-code fallback into asking the customer for a code", async () => {
    const ai = {
      naturalizeStrictFlowText: vi.fn(async () => ({
        text: "Perfecto. Para registrarle necesito su código de invitación. ¿Me lo puede facilitar cuando lo tenga a la mano?",
        used: true,
        error: ""
      }))
    };

    const result = await refineStrictFlowReplyText({
      ai: ai as never,
      runtimeConfig: config(),
      strictReply: strictReply({
        reply: "El registro necesita código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.",
        language: "es",
        nextFlowStep: "registration_intent",
        needsInviteCode: true,
        fallback: true,
        controlledQuestionType: "none"
      }),
      customerText: "Sí",
      history: [],
      agentProfile: agentProfile()
    });

    expect(ai.naturalizeStrictFlowText).not.toHaveBeenCalled();
    expect(result.reply).toBe("El registro necesita código de invitación. Estoy confirmando su código exclusivo ahora. Espere un momento.");
    expect(result.reply).not.toMatch(/facilitar|a mano|ya tiene/i);
    expect(result.naturalized).toMatchObject({ used: false, error: "邀请码未分配时跳过口语化改写" });
  });
});
