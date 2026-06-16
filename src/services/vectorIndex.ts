import { generateGeminiEmbedding, type GeminiConfig } from "../clients/gemini.js";
import type { Repositories, VectorSearchHit } from "../repositories.js";

export type EmbeddingFn = (config: GeminiConfig, text: string) => Promise<{ embedding: number[]; model: string }>;

export class VectorIndexService {
  constructor(
    private readonly repos: Repositories,
    private readonly embed: EmbeddingFn = generateGeminiEmbedding
  ) {}

  async embedPending(input: {
    config: GeminiConfig;
    merchantId?: string;
    countryId?: string;
    limit?: number;
  }): Promise<{ embedded: number; failed: number; pending: number }> {
    const pending = this.repos.listPendingVectorDocuments({
      merchantId: input.merchantId,
      countryId: input.countryId,
      limit: input.limit ?? 20
    });
    let embedded = 0;
    let failed = 0;
    for (const document of pending) {
      try {
        const result = await this.embed(input.config, document.content);
        this.repos.markVectorEmbedded(document.id, result.embedding, result.model);
        embedded += 1;
      } catch (error) {
        this.repos.markVectorFailed(document.id, error instanceof Error ? error.message : "embedding failed");
        failed += 1;
      }
    }
    return { embedded, failed, pending: pending.length };
  }

  async rebuild(input: {
    config: GeminiConfig;
    merchantId?: string;
    countryId?: string;
    embedNow?: boolean;
    limit?: number;
  }): Promise<{ deleted: number; queued: number; embedded: number; failed: number }> {
    const rebuilt = this.repos.rebuildVectorIndex({ merchantId: input.merchantId, countryId: input.countryId });
    if (!input.embedNow) return { ...rebuilt, embedded: 0, failed: 0 };
    const processed = await this.embedPending({
      config: input.config,
      merchantId: input.merchantId,
      countryId: input.countryId,
      limit: input.limit ?? 100
    });
    return { ...rebuilt, embedded: processed.embedded, failed: processed.failed };
  }

  async retrieve(input: {
    config: GeminiConfig;
    merchantId: string;
    countryId: string;
    customerKey: string;
    conversationId: string;
    query: string;
    limit?: number;
  }): Promise<VectorSearchHit[]> {
    const query = input.query.trim();
    if (query.length < 2 || /^https?:\/\/\S+$/i.test(query)) return [];
    await this.embedPending({
      config: input.config,
      merchantId: input.merchantId,
      countryId: input.countryId,
      limit: 6
    });
    try {
      const result = await this.embed(input.config, query);
      return this.repos.searchVectorDocuments({
        merchantId: input.merchantId,
        countryId: input.countryId,
        customerKey: input.customerKey,
        conversationId: input.conversationId,
        embedding: result.embedding,
        limit: input.limit ?? 8
      });
    } catch {
      return [];
    }
  }
}
