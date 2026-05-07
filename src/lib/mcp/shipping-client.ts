import fs from "node:fs";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

export interface ShippingCandidate {
  code: string;
  address: string;
  city: string;
  zone: string;
  shippingCents: number;
  etaDays: number;
  service: string;
  confidence: number;
}

type ShippingQuoteResponse = {
  query: string;
  best: ShippingCandidate | null;
  alternatives: ShippingCandidate[];
  count: number;
};

function readLocalEnvVars(): Partial<Record<"DATABASE_URL" | "OPENAI_API_KEY", string>> {
  const envPath = path.resolve(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return {};
  const lines = fs.readFileSync(envPath, "utf8").split("\n");
  const out: Partial<Record<"DATABASE_URL" | "OPENAI_API_KEY", string>> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 1) continue;
    const key = trimmed.slice(0, idx).trim();
    if (key !== "DATABASE_URL" && key !== "OPENAI_API_KEY") continue;
    const raw = trimmed.slice(idx + 1).trim();
    const value = raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    out[key] = value;
  }

  return out;
}

function buildMcpEnv() {
  const fromFile = readLocalEnvVars();
  return {
    ...process.env,
    DATABASE_URL: process.env.DATABASE_URL ?? fromFile.DATABASE_URL,
    OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? fromFile.OPENAI_API_KEY,
  };
}

function parseStructuredOrText<T>(result: unknown): T {
  const payload = result as {
    isError?: boolean;
    structuredContent?: unknown;
    content?: Array<{ type?: string; text?: string }>;
  };
  if (payload.structuredContent) {
    return payload.structuredContent as T;
  }

  const text = payload.content?.find((item) => item.type === "text")?.text;
  if (!text) {
    throw new Error("MCP tool returned no parseable payload");
  }

  if (payload.isError) {
    throw new Error(`MCP tool error: ${text}`);
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`MCP returned non-JSON payload: ${text}`);
  }
}

export async function getShippingQuoteViaMcp(address: string): Promise<ShippingQuoteResponse> {
  const variant = (process.env.SHIPPING_MCP_SERVER_VARIANT ?? "classic").toLowerCase();
  const serverPath = variant === "llamaindex"
    ? path.resolve(process.cwd(), "src/mcp/shipping-server-llamaindex/server.mjs")
    : path.resolve(process.cwd(), "src/mcp/shipping-server/server.mjs");

  const client = new Client(
    { name: "agent-harness-demo", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: buildMcpEnv(),
  });

  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: "get_shipping_quote",
      arguments: { address },
    });

    return parseStructuredOrText<ShippingQuoteResponse>(response);
  } finally {
    await client.close();
  }
}
