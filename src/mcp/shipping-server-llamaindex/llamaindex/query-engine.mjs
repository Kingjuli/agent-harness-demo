import { z } from "zod";

export const SEARCH_INPUT_SCHEMA = z.object({
  address: z.string().min(3),
  limit: z.number().int().min(1).max(5).default(5),
});

const QUOTE_INPUT_SCHEMA = z.object({
  address: z.string().min(3),
});

function toMatch(row) {
  return {
    code: row.code,
    address: row.address,
    city: row.city,
    zone: row.zone,
    shippingCents: row.shippingCents,
    etaDays: row.etaDays,
    service: row.service,
    confidence: row.confidence,
    retrieval: {
      vectorDistance: row.vectorDistance,
      lexicalScore: row.lexicalScore,
      fusedScore: row.fusedScore,
    },
  };
}

export class ShippingQueryEngine {
  constructor(retriever, postprocessor) {
    this.retriever = retriever;
    this.postprocessor = postprocessor;
  }

  async searchCandidates(input) {
    const parsed = SEARCH_INPUT_SCHEMA.parse(input);
    const nodes = await this.retriever.retrieve({ query: parsed.address, topK: parsed.limit });
    const processed = this.postprocessor.process(nodes);

    const ordered = [processed.best, ...processed.alternatives].filter(Boolean);

    return {
      query: parsed.address,
      count: ordered.length,
      matches: ordered.map(toMatch),
      retrievalStrategy: "llamaindex_style_hybrid_retriever",
    };
  }

  async getBestQuote(input) {
    const parsed = QUOTE_INPUT_SCHEMA.parse(input);
    const nodes = await this.retriever.retrieve({ query: parsed.address, topK: 5 });
    const processed = this.postprocessor.process(nodes);

    const best = processed.best ? toMatch(processed.best) : null;
    const alternatives = processed.alternatives.map(toMatch);

    return {
      query: parsed.address,
      best,
      alternatives,
      count: processed.count,
      confidence: processed.diagnostics,
      retrievalStrategy: "llamaindex_style_hybrid_retriever",
    };
  }

  async health(repository) {
    await repository.ensureReady();
    return {
      status: "ok",
      ready: true,
      engine: "shipping-query-engine",
      retrievalStrategy: "llamaindex_style_hybrid_retriever",
    };
  }
}
