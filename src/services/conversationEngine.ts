import type { A2CWebhookPayload, WebhookProcessor } from "./webhookProcessor.js";

export interface InboundConversationMessage {
  payload: A2CWebhookPayload;
  merchantId?: string;
  simulation?: boolean;
}

export interface ConversationEngineResult {
  status: string;
  conversationId?: string;
}

type QueuedConversationJob = InboundConversationMessage;

export class ConversationEngine {
  private readonly queue: QueuedConversationJob[] = [];
  private activeJobs = 0;

  constructor(
    private readonly processor: Pick<WebhookProcessor, "process" | "processDueFollowUps">,
    private readonly options: { concurrency?: number } = {}
  ) {}

  async handleInboundMessage(input: InboundConversationMessage): Promise<ConversationEngineResult> {
    return this.processor.process(input.payload, input.merchantId, { simulation: input.simulation });
  }

  enqueueInboundMessage(input: InboundConversationMessage): { status: string; queueDepth: number } {
    if (input.payload.type !== "CUSTOMER_MESSAGE") return { status: "ignored", queueDepth: this.queue.length };
    this.queue.push(input);
    this.drainQueue();
    return { status: "queued", queueDepth: this.queue.length + this.activeJobs };
  }

  processDueFollowUps(limit = 50): Promise<{ scanned: number; sent: number; skipped: number; failed: number }> {
    return this.processor.processDueFollowUps(limit);
  }

  private drainQueue(): void {
    while (this.activeJobs < this.concurrency && this.queue.length) {
      const job = this.queue.shift();
      if (!job) return;
      this.activeJobs += 1;
      setImmediate(() => {
        this.handleInboundMessage(job)
          .catch((error) => {
            console.warn("queued conversation processing failed", error);
          })
          .finally(() => {
            this.activeJobs -= 1;
            this.drainQueue();
          });
      });
    }
  }

  private get concurrency(): number {
    return Math.max(1, this.options.concurrency ?? Number(process.env.WEBHOOK_WORKER_CONCURRENCY || 4));
  }
}
