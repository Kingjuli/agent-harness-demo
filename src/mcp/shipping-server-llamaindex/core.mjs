import fs from "node:fs";
import path from "node:path";
import { ShippingKnowledgeRepository } from "../shipping-server/rag/repository.mjs";
import { ShippingMcpLlamaIndexServerComponent } from "./components/shipping-mcp-llamaindex-server-component.mjs";
import { ConfidencePostprocessor } from "./llamaindex/postprocessor.mjs";
import { ShippingQueryEngine } from "./llamaindex/query-engine.mjs";
import { HybridRetriever } from "./llamaindex/retriever.mjs";

function loadEnvLocalForMcp() {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (key !== "DATABASE_URL" && key !== "OPENAI_API_KEY" && key !== "OPENAI_EMBEDDING_MODEL") continue;
    if (process.env[key]) continue;
    const raw = trimmed.slice(idx + 1).trim();
    process.env[key] = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
  }
}

loadEnvLocalForMcp();

const repository = new ShippingKnowledgeRepository();
const retriever = new HybridRetriever(repository);
const postprocessor = new ConfidencePostprocessor();
const queryEngine = new ShippingQueryEngine(retriever, postprocessor);

export function createShippingLlamaIndexMcpServer() {
  return new ShippingMcpLlamaIndexServerComponent(queryEngine, repository).build();
}

export async function shutdownShippingLlamaIndexMcp() {
  await repository.close();
}
