CREATE EXTENSION IF NOT EXISTS vector;

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
);

CREATE INDEX IF NOT EXISTS shipping_location_embedding_idx
  ON "ShippingLocation"
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 50);

CREATE INDEX IF NOT EXISTS shipping_location_city_idx
  ON "ShippingLocation" (city);

CREATE INDEX IF NOT EXISTS shipping_location_zone_idx
  ON "ShippingLocation" (zone);
