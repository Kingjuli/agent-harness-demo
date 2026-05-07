import { z } from "zod";

export const SEARCH_INPUT_SCHEMA = z.object({
  address: z.string().min(3),
  limit: z.number().int().min(1).max(5).default(5),
});

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function confidenceFromFusedScore(score) {
  return Number(clamp01(score).toFixed(4));
}

function mapRow(row) {
  return {
    code: row.code,
    address: row.address,
    city: row.city,
    zone: row.zone,
    shippingCents: row.shipping_cents,
    etaDays: row.eta_days,
    service: row.service,
    confidence: confidenceFromFusedScore(Number(row.fused_score ?? 0)),
    retrieval: {
      vectorDistance: Number(row.vector_distance ?? 1),
      lexicalScore: Number(row.lexical_score ?? 0),
      fusedScore: Number(row.fused_score ?? 0),
    },
  };
}

export class ShippingRagPipeline {
  constructor(repository) {
    this.repository = repository;
    this.minConfidence = 0.45;
    this.minMargin = 0.05;
  }

  async searchCandidates(input) {
    const parsed = SEARCH_INPUT_SCHEMA.parse(input);

    // Reliable RAG flow:
    // 1) Canonicalize query text and compute production embedding
    // 2) Run hybrid retrieval (vector + lexical) in SQL
    // 3) Fuse scores and return top-k with diagnostics
    const rows = await this.repository.retrieveHybrid(parsed.address, parsed.limit);
    const matches = rows.map(mapRow);

    return {
      query: parsed.address,
      count: matches.length,
      matches,
      retrievalStrategy: "hybrid_vector_lexical_fusion",
    };
  }

  async getBestQuote(input) {
    const parsed = SEARCH_INPUT_SCHEMA.pick({ address: true }).parse(input);
    const search = await this.searchCandidates({ address: parsed.address, limit: 5 });

    const best = search.matches[0] ?? null;
    const second = search.matches[1] ?? null;
    const margin = best && second ? best.confidence - second.confidence : best ? best.confidence : 0;

    const lowConfidence = !best || best.confidence < this.minConfidence;
    const ambiguous = !!best && !!second && margin < this.minMargin;

    return {
      query: search.query,
      best,
      alternatives: search.matches.slice(1),
      count: search.count,
      confidence: {
        minAccepted: this.minConfidence,
        marginAccepted: this.minMargin,
        observedTop1: best?.confidence ?? 0,
        observedMargin: Number(margin.toFixed(4)),
        requiresClarification: lowConfidence || ambiguous,
      },
      retrievalStrategy: search.retrievalStrategy,
    };
  }

  async health() {
    await this.repository.ensureReady();
    return {
      status: "ok",
      ready: true,
      pipeline: "shipping-rag-pipeline",
      retrievalStrategy: "hybrid_vector_lexical_fusion",
    };
  }
}
