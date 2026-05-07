import OpenAI from "openai";

export const EMBEDDING_MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small";
export const EMBEDDING_DIMS = 1536;

function normalizeText(input) {
  return String(input ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9\s,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function assertEmbeddingVector(values) {
  if (!Array.isArray(values) || values.length !== EMBEDDING_DIMS) {
    throw new Error(`Embedding dimension mismatch. Expected ${EMBEDDING_DIMS}, got ${Array.isArray(values) ? values.length : "unknown"}.`);
  }
}

export function toVectorLiteral(values) {
  return `[${values.map((v) => Number(v.toFixed(8))).join(",")}]`;
}

export function canonicalizeAddressDocument(input) {
  return normalizeText(input);
}

export class OpenAIEmbeddingProvider {
  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for shipping RAG embeddings.");
    }

    this.client = new OpenAI({ apiKey });
    this.model = EMBEDDING_MODEL;
  }

  async embedOne(text) {
    const normalized = canonicalizeAddressDocument(text);
    if (!normalized) {
      throw new Error("Cannot embed empty address text.");
    }

    const response = await this.client.embeddings.create({
      model: this.model,
      input: normalized,
    });

    const vector = response.data?.[0]?.embedding;
    assertEmbeddingVector(vector);
    return vector;
  }
}
