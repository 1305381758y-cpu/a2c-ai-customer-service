import { describe, expect, it, vi } from "vitest";
import { uploadRegistrationTutorialImage } from "../frontend/src/config/configApi.js";

describe("config API helpers", () => {
  it("uploads registration tutorial images with multipart form data", async () => {
    const file = new File(["image"], "tutorial.png", { type: "image/png" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({
      imageUrl: "https://cdn.example/tutorial.png",
      config: { registrationTutorialImageUrl: "https://cdn.example/tutorial.png" }
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const result = await uploadRegistrationTutorialImage("/api/upload", file, fetcher as never);

    expect(result.imageUrl).toBe("https://cdn.example/tutorial.png");
    expect(fetcher).toHaveBeenCalledWith(
      "/api/upload",
      expect.objectContaining({
        method: "POST",
        body: expect.any(FormData)
      })
    );
  });

  it("translates upload API errors for operators", async () => {
    const file = new File(["image"], "tutorial.png", { type: "image/png" });
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: "not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" }
    }));

    await expect(uploadRegistrationTutorialImage("/api/upload", file, fetcher as never)).rejects.toThrow("未找到");
  });
});
