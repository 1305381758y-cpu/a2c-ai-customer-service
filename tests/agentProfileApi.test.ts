import { describe, expect, it, vi } from "vitest";

import {
  agentProfileUrl,
  loadAgentProfile,
  loadAgentProfileMerchants,
  saveAgentProfile
} from "../frontend/src/agent/agentProfileApi.js";
import type { AgentProfile } from "../frontend/src/types.js";

const profile: AgentProfile = {
  merchantId: "merchant-1",
  agentName: "开户注册接待专员",
  roleDefinition: "拥有10年接待经验",
  toneStyle: "自然、简短",
  coreGoal: "引导注册",
  mustFollow: "按流程",
  forbidden: "不暴露身份",
  uncertaintyPolicy: "以页面或人工确认为准",
  handoffPolicy: "资料齐全后接管",
  enabled: true,
  updatedAt: "2026-07-03T10:00:00Z"
};

describe("agent profile API helpers", () => {
  it("builds scoped agent profile URLs", () => {
    expect(agentProfileUrl(false, "ignored")).toBe("/api/merchant/agent-profile");
    expect(agentProfileUrl(true, "merchant-1")).toBe("/api/admin/merchants/merchant-1/agent-profile");
  });

  it("loads merchant scoped agent profile", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify(profile), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(loadAgentProfile(false)).resolves.toMatchObject({ agentName: "开户注册接待专员" });

    expect(fetcher).toHaveBeenCalledWith("/api/merchant/agent-profile", { headers: {} });
    fetcher.mockRestore();
  });

  it("saves platform scoped agent profile", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      ...profile,
      toneStyle: "更口语化"
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(saveAgentProfile(true, "merchant-1", { ...profile, toneStyle: "更口语化" })).resolves.toMatchObject({
      toneStyle: "更口语化"
    });

    expect(fetcher).toHaveBeenCalledWith("/api/admin/merchants/merchant-1/agent-profile", expect.objectContaining({
      method: "PATCH",
      body: JSON.stringify({ ...profile, toneStyle: "更口语化" }),
      headers: { "Content-Type": "application/json" }
    }));
    fetcher.mockRestore();
  });

  it("loads merchants only for platform profile editing", async () => {
    const fetcher = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify({
      rows: [{ id: "merchant-1", name: "阿斯顿" }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    await expect(loadAgentProfileMerchants(false)).resolves.toEqual([]);
    await expect(loadAgentProfileMerchants(true)).resolves.toEqual([{ id: "merchant-1", name: "阿斯顿" }]);

    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher).toHaveBeenCalledWith("/api/admin/merchants", { headers: {} });
    fetcher.mockRestore();
  });
});
