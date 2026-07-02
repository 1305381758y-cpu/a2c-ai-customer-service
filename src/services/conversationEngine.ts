import type { InboundConversationMessage } from "./inboundMessage.js";

export interface ConversationEngineResult {
  status: string;
  conversationId?: string;
}

export interface QueuedConversationResult {
  status: "queued" | "ignored";
  queueDepth: number;
}

export interface ConversationProcessor {
  handleInboundMessage(input: InboundConversationMessage): Promise<ConversationEngineResult>;
  processDueFollowUps(limit?: number): Promise<{ scanned: number; sent: number; skipped: number; failed: number }>;
}

type QueuedConversationJob = InboundConversationMessage;
type InboundProcessingMode = "auto" | "sync" | "async";

export class ConversationEngine {
  private readonly queue: QueuedConversationJob[] = [];
  private activeJobs = 0;

  constructor(
    private readonly processor: ConversationProcessor,
    private readonly options: { concurrency?: number; asyncProcessing?: boolean } = {}
  ) {}

  async receiveInboundMessage(input: InboundConversationMessage, options: { mode?: InboundProcessingMode } = {}): Promise<ConversationEngineResult | QueuedConversationResult> {
    if (this.shouldProcessAsync(options.mode || "auto")) {
      return this.enqueueInboundMessage(input);
    }
    return this.handleInboundMessage(input);
  }

  async handleInboundMessage(input: InboundConversationMessage): Promise<ConversationEngineResult> {
    return this.processor.handleInboundMessage(input);
  }

  async simulateInboundMessage(input: Omit<InboundConversationMessage, "simulation">): Promise<ConversationEngineResult> {
    return this.handleInboundMessage({ ...input, simulation: true });
  }

  enqueueInboundMessage(input: InboundConversationMessage): QueuedConversationResult {
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

  private shouldProcessAsync(mode: InboundProcessingMode): boolean {
    if (mode === "async") return true;
    if (mode === "sync") return false;
    if (this.options.asyncProcessing !== undefined) return this.options.asyncProcessing;
    if (process.env.WEBHOOK_ASYNC_ENABLED === "false") return false;
    if (process.env.WEBHOOK_ASYNC_ENABLED === "true") return true;
    return process.env.NODE_ENV !== "test";
  }
}
