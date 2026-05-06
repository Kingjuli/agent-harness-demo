import { PrismaClient } from "@prisma/client";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

const prisma = new PrismaClient();

const SHIPPING_LOCATION_SEEDS = [
  { code: "NBO-WESTLANDS", address: "Westlands, Nairobi", city: "Nairobi", zone: "nairobi_core", shippingCents: 500, etaDays: 1, service: "City Express" },
  { code: "NBO-KILIMANI", address: "Kilimani, Nairobi", city: "Nairobi", zone: "nairobi_core", shippingCents: 500, etaDays: 1, service: "City Express" },
  { code: "NBO-LAVINGTON", address: "Lavington, Nairobi", city: "Nairobi", zone: "nairobi_core", shippingCents: 550, etaDays: 1, service: "City Express" },
  { code: "NBO-KAREN", address: "Karen, Nairobi", city: "Nairobi", zone: "nairobi_outskirts", shippingCents: 700, etaDays: 2, service: "Metro Courier" },
  { code: "NBO-RUIRU", address: "Ruiru, Kiambu", city: "Kiambu", zone: "nairobi_outskirts", shippingCents: 750, etaDays: 2, service: "Metro Courier" },
  { code: "NBO-THIKA", address: "Thika, Kiambu", city: "Kiambu", zone: "nairobi_outskirts", shippingCents: 800, etaDays: 2, service: "Metro Courier" },
  { code: "MSA-NYALI", address: "Nyali, Mombasa", city: "Mombasa", zone: "regional", shippingCents: 950, etaDays: 3, service: "Standard Courier" },
  { code: "MSA-MTWAPA", address: "Mtwapa, Kilifi", city: "Kilifi", zone: "regional", shippingCents: 980, etaDays: 3, service: "Standard Courier" },
  { code: "KSM-MILIMANI", address: "Milimani, Kisumu", city: "Kisumu", zone: "regional", shippingCents: 1020, etaDays: 3, service: "Standard Courier" },
  { code: "ELD-PIONEER", address: "Pioneer, Eldoret", city: "Uasin Gishu", zone: "regional", shippingCents: 1100, etaDays: 4, service: "Standard Courier" },
  { code: "NKR-LANET", address: "Lanet, Nakuru", city: "Nakuru", zone: "regional", shippingCents: 990, etaDays: 3, service: "Standard Courier" },
  { code: "KII-TOWN", address: "Kisii Town, Kisii", city: "Kisii", zone: "regional", shippingCents: 1120, etaDays: 4, service: "Standard Courier" },
];

const EMBEDDING_DIMS = 12;
let initialized = false;

function normalizeText(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function hashToken(token) {
  let hash = 2166136261;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function embedAddress(input) {
  const clean = normalizeText(input);
  if (!clean) return new Array(EMBEDDING_DIMS).fill(0);

  const vector = new Array(EMBEDDING_DIMS).fill(0);
  const tokens = clean.split(" ");

  for (const token of tokens) {
    const h = hashToken(token);
    for (let i = 0; i < EMBEDDING_DIMS; i += 1) {
      const shifted = (h >>> (i % 8)) & 0xff;
      vector[i] += shifted / 255;
    }
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

function toVectorLiteral(values) {
  return `[${values.map((v) => Number(v.toFixed(8))).join(",")}]`;
}

function confidenceFromDistance(distance) {
  const value = 1 - distance;
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, Number(value.toFixed(4))));
}

async function ensureReady() {
  if (initialized) return;

  await prisma.$executeRawUnsafe("CREATE EXTENSION IF NOT EXISTS vector");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ShippingLocation" (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL UNIQUE,
      address TEXT NOT NULL,
      city TEXT NOT NULL,
      zone TEXT NOT NULL,
      shipping_cents INTEGER NOT NULL,
      eta_days INTEGER NOT NULL,
      service TEXT NOT NULL,
      embedding vector(12) NOT NULL,
      created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS shipping_location_embedding_idx
    ON "ShippingLocation"
    USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 50)
  `);
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS shipping_location_city_idx ON "ShippingLocation" (city)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS shipping_location_zone_idx ON "ShippingLocation" (zone)');

  for (const location of SHIPPING_LOCATION_SEEDS) {
    const id = `ship_loc_${location.code.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`;
    const vector = toVectorLiteral(embedAddress(`${location.address}, ${location.city}`));

    await prisma.$executeRawUnsafe(
      `
      INSERT INTO "ShippingLocation" (
        id, code, address, city, zone, shipping_cents, eta_days, service, embedding
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::vector)
      ON CONFLICT (code) DO UPDATE SET
        address = EXCLUDED.address,
        city = EXCLUDED.city,
        zone = EXCLUDED.zone,
        shipping_cents = EXCLUDED.shipping_cents,
        eta_days = EXCLUDED.eta_days,
        service = EXCLUDED.service,
        embedding = EXCLUDED.embedding,
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
      vector,
    );
  }

  initialized = true;
}

async function searchShippingCandidates(address, limit = 5) {
  await ensureReady();

  const normalizedLimit = Math.max(1, Math.min(Math.floor(limit), 5));
  const queryEmbedding = toVectorLiteral(embedAddress(address));

  const rows = await prisma.$queryRawUnsafe(
    `
    SELECT
      code,
      address,
      city,
      zone,
      shipping_cents,
      eta_days,
      service,
      (embedding <=> $1::vector) AS distance
    FROM "ShippingLocation"
    ORDER BY embedding <=> $1::vector ASC
    LIMIT $2
    `,
    queryEmbedding,
    normalizedLimit,
  );

  return rows.map((row) => ({
    code: row.code,
    address: row.address,
    city: row.city,
    zone: row.zone,
    shippingCents: row.shipping_cents,
    etaDays: row.eta_days,
    service: row.service,
    confidence: confidenceFromDistance(Number(row.distance)),
  }));
}

const server = new Server(
  {
    name: "shipping-mcp-server",
    version: "0.1.0",
  },
  {
    capabilities: {
      tools: {},
    },
  },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "search_shipping_candidates",
      description: "Return top shipping quote candidates for a free-text address using pgvector similarity.",
      inputSchema: {
        type: "object",
        properties: {
          address: { type: "string", minLength: 3 },
          limit: { type: "number", minimum: 1, maximum: 5 },
        },
        required: ["address"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name !== "search_shipping_candidates") {
    throw new Error(`Unknown tool: ${request.params.name}`);
  }

  const args = request.params.arguments ?? {};
  const address = typeof args.address === "string" ? args.address.trim() : "";
  const limit = typeof args.limit === "number" ? args.limit : 5;

  if (!address) {
    throw new Error("address is required");
  }

  const matches = await searchShippingCandidates(address, limit);

  return {
    content: [
      {
        type: "text",
        text: JSON.stringify({
          query: address,
          count: matches.length,
          matches,
        }),
      },
    ],
  };
});

const transport = new StdioServerTransport();
await server.connect(transport);
