import { z } from "zod";

export const RETRIEVE_INPUT_SCHEMA = z.object({
  query: z.string().min(3),
  topK: z.number().int().min(1).max(5).default(5),
});

export class HybridRetriever {
  constructor(repository) {
    this.repository = repository;
  }

  async retrieve(input) {
    const parsed = RETRIEVE_INPUT_SCHEMA.parse(input);
    const rows = await this.repository.retrieveHybrid(parsed.query, parsed.topK);

    return rows.map((row) => ({
      code: row.code,
      address: row.address,
      city: row.city,
      zone: row.zone,
      shippingCents: row.shipping_cents,
      etaDays: row.eta_days,
      service: row.service,
      vectorDistance: Number(row.vector_distance ?? 1),
      lexicalScore: Number(row.lexical_score ?? 0),
      fusedScore: Number(row.fused_score ?? 0),
    }));
  }
}
