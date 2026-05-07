import fs from "node:fs";
import path from "node:path";
import { ShippingMcpServerComponent } from "./components/shipping-mcp-server-component.mjs";
import { ShippingRagPipeline } from "./rag/pipeline.mjs";
import { ShippingKnowledgeRepository } from "./rag/repository.mjs";

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
const ragPipeline = new ShippingRagPipeline(repository);

export function createShippingMcpServer() {
  return new ShippingMcpServerComponent(ragPipeline).build();
}

export async function shutdownShippingMcp() {
  await repository.close();
}
