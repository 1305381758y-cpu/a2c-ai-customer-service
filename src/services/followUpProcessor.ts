import type { AppConfig } from "../config.js";
import { buildStrictFlowFollowUp } from "../domain/strictFlow.js";
import type { Repositories } from "../repositories.js";
import { createA2CFollowUpSender, type FollowUpSender } from "./followUpSender.js";
import { appConfigForMerchant } from "./runtimeConfig.js";

export type FollowUpProcessingResult = {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
};

export class FollowUpProcessor {
  constructor(
    private readonly repos: Repositories,
    private readonly config: AppConfig,
    private readonly sender: FollowUpSender = createA2CFollowUpSender(repos)
  ) {}

  async processDueFollowUps(limit = 50): Promise<FollowUpProcessingResult> {
    const candidates = this.repos.listDueFollowUpCandidates(limit);
    let sent = 0;
    let skipped = 0;
    let failed = 0;
    for (const candidate of candidates) {
      const conversation = candidate.conversation;
      const merchant = this.repos.getMerchant(conversation.merchantId);
      if (!merchant || merchant.status !== "active") {
        skipped += 1;
        continue;
      }
      const merchantConfig = this.repos.getMerchantConfig(conversation.merchantId);
      if (!merchantConfig.smartReplyEnabled) {
        skipped += 1;
        continue;
      }
      const country = this.repos.getMerchantCountry(conversation.countryId);
      const runtimeConfig = appConfigForMerchant(this.config, merchantConfig, country);
      const content = buildStrictFlowFollowUp(conversation.flowStep || conversation.stage, conversation.language || country?.defaultLanguage || "zh");
      const flowStep = conversation.flowStep || conversation.stage || "unknown";
      const sendResult = await this.sender.send({
        runtimeConfig,
        conversation,
        content
      });
      if (sendResult.a2cSendStatus === "failed") {
        this.repos.recordFollowUp({ merchantId: conversation.merchantId, conversationId: conversation.id, flowStep, sent: false, error: sendResult.a2cSendError || "follow-up send failed" });
        failed += 1;
        continue;
      }
      this.repos.insertMessage({
        conversationId: conversation.id,
        direction: "outbound",
        externalId: sendResult.externalId,
        content,
        msgType: "text",
        language: conversation.language || country?.defaultLanguage || "unknown",
        intent: "unknown",
        rawPayload: {
          replyMode: "strict_flow",
          followupSent: true,
          followupReason: "idle_2m",
          followupStep: flowStep,
          strictFlow: true,
          strictFlowStep: flowStep,
          a2cSendStatus: sendResult.a2cSendStatus,
          a2cSendError: sendResult.a2cSendError
        }
      });
      this.repos.recordFollowUp({ merchantId: conversation.merchantId, conversationId: conversation.id, flowStep, sent: true });
      this.repos.updateCustomerMemoryFromMessage(conversation, { intent: "unknown", content, direction: "outbound" });
      sent += 1;
    }
    return { scanned: candidates.length, sent, skipped, failed };
  }
}
