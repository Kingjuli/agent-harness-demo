import { PrismaClient } from "@prisma/client";
import { EMBEDDING_DIMS, EMBEDDING_MODEL, OpenAIEmbeddingProvider, canonicalizeAddressDocument, toVectorLiteral } from "./embeddings.mjs";
import { SHIPPING_LOCATION_SEEDS } from "./seeds.mjs";

const TABLE_NAME = '"ShippingLocationRag"';

function seedSearchText(location) {
  return canonicalizeAddressDocument(`${location.address}, ${location.city}, ${location.zone}`);
}

export class ShippingKnowledgeRepository {
  constructor(prisma = new PrismaClient(), embeddingProvider = new OpenAIEmbeddingProvider()) {
    this.prisma = prisma;
    this.embeddingProvider = embeddingProvider;
    this.ready = false;
  }

  async ensureReady() {
    if (this.ready) return;

    await this.prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
    await this.prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS pg_trgm");

    await this.prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (
        id TEXT PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        address TEXT NOT NULL,
        city TEXT NOT NULL,
        zone TEXT NOT NULL,
        shipping_cents INTEGER NOT NULL,
        eta_days INTEGER NOT NULL,
        service TEXT NOT NULL,
        search_text TEXT NOT NULL,
        embedding vector(${EMBEDDING_DIMS}) NOT NULL,
        embedding_model TEXT NOT NULL,
        created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await this.prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS shipping_rag_embedding_idx
      ON ${TABLE_NAME}
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 50)
    `);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS shipping_rag_search_text_trgm_idx ON ${TABLE_NAME} USING gin (search_text gin_trgm_ops)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS shipping_rag_city_idx ON ${TABLE_NAME} (city)`);
    await this.prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS shipping_rag_zone_idx ON ${TABLE_NAME} (zone)`);
    await this.prisma.$executeRawUnsafe(`ALTER TABLE ${TABLE_NAME} ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP`);

    for (const location of SHIPPING_LOCATION_SEEDS) {
      const id = `ship_loc_${location.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
      const searchText = seedSearchText(location);

      const existing = await this.prisma.$queryRawUnsafe(
        `SELECT embedding_model, search_text FROM ${TABLE_NAME} WHERE code = $1 LIMIT 1`,
        location.code,
      );

      const row = Array.isArray(existing) && existing.length > 0 ? existing[0] : null;
      const shouldReembed = !row || row.embedding_model !== EMBEDDING_MODEL || row.search_text !== searchText;

      let vectorLiteral = null;
      if (shouldReembed) {
        const vector = await this.embeddingProvider.embedOne(searchText);
        vectorLiteral = toVectorLiteral(vector);
      }

      if (shouldReembed) {
        await this.prisma.$executeRawUnsafe(
          `
          INSERT INTO ${TABLE_NAME} (
            id, code, address, city, zone, shipping_cents, eta_days, service, search_text, embedding, embedding_model, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::vector, $11, CURRENT_TIMESTAMP)
          ON CONFLICT (code) DO UPDATE SET
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            zone = EXCLUDED.zone,
            shipping_cents = EXCLUDED.shipping_cents,
            eta_days = EXCLUDED.eta_days,
            service = EXCLUDED.service,
            search_text = EXCLUDED.search_text,
            embedding = EXCLUDED.embedding,
            embedding_model = EXCLUDED.embedding_model,
            updated_at = CURRENT_TIMESTAMP
          `,
          id,
          location.code,
          location.address,
          location.city,
          location.zone,
          location.shippingCents,
          location.etaDays,
          location.service,
          searchText,
          vectorLiteral,
          EMBEDDING_MODEL,
        );
      } else {
        await this.prisma.$executeRawUnsafe(
          `
          INSERT INTO ${TABLE_NAME} (
            id, code, address, city, zone, shipping_cents, eta_days, service, search_text, embedding, embedding_model, updated_at
          )
          SELECT id, code, $3, $4, $5, $6, $7, $8, $9, embedding, embedding_model, CURRENT_TIMESTAMP
          FROM ${TABLE_NAME}
          WHERE code = $2
          ON CONFLICT (code) DO UPDATE SET
            address = EXCLUDED.address,
            city = EXCLUDED.city,
            zone = EXCLUDED.zone,
            shipping_cents = EXCLUDED.shipping_cents,
            eta_days = EXCLUDED.eta_days,
            service = EXCLUDED.service,
            search_text = EXCLUDED.search_text,
            updated_at = CURRENT_TIMESTAMP
          `,
          id,
          location.code,
          location.address,
          location.city,
          location.zone,
          location.shippingCents,
          location.etaDays,
          location.service,
          searchText,
        );
      }
    }

    await this.prisma.$executeRawUnsafe(`ANALYZE ${TABLE_NAME}`);
    this.ready = true;
  }

  async retrieveHybrid(address, limit = 5) {
    await this.ensureReady();
    const queryText = canonicalizeAddressDocument(address);
    const queryEmbedding = await this.embeddingProvider.embedOne(queryText);
    const queryVector = toVectorLiteral(queryEmbedding);

    return this.prisma.$queryRawUnsafe(
      `
      WITH query AS (
        SELECT $1::text AS q, $2::vector AS qv
      )
      SELECT
        s.code,
        s.address,
        s.city,
        s.zone,
        s.shipping_cents,
        s.eta_days,
        s.service,
        (s.embedding <=> q.qv) AS vector_distance,
        similarity(s.search_text, q.q) AS lexical_score,
        (0.7 * (1 - (s.embedding <=> q.qv))) + (0.3 * similarity(s.search_text, q.q)) AS fused_score
      FROM ${TABLE_NAME} s
      CROSS JOIN query q
      ORDER BY fused_score DESC
      LIMIT $3
      `,
      queryText,
      queryVector,
      limit,
    );
  }

  async close() {
    await this.prisma.$disconnect();
  }
}
