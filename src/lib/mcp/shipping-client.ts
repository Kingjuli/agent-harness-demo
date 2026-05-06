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

function parseCandidates(result: unknown): ShippingCandidate[] {
  const payload = result as { content?: Array<{ type?: string; text?: string }> };
  const text = payload.content?.find((item) => item.type === "text")?.text;
  if (!text) return [];

  const parsed = JSON.parse(text) as { matches?: ShippingCandidate[] };
  return Array.isArray(parsed.matches) ? parsed.matches : [];
}

export async function searchShippingCandidatesViaMcp(address: string): Promise<ShippingCandidate[]> {
  const serverPath = path.resolve(process.cwd(), "src/mcp/shipping-server/server.mjs");

  const client = new Client(
    { name: "agent-harness-demo", version: "0.1.0" },
    { capabilities: { tools: {} } },
  );

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    env: process.env,
  });

  try {
    await client.connect(transport);
    const response = await client.callTool({
      name: "search_shipping_candidates",
      arguments: {
        address,
        limit: 5,
      },
    });

    return parseCandidates(response);
  } finally {
    await client.close();
  }
}
