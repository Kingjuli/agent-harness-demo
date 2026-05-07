import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

function mkSuccessPayload(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data) }],
    structuredContent: data,
    isError: false,
  };
}

function mkErrorPayload(message) {
  return {
    content: [{ type: "text", text: message }],
    isError: true,
  };
}

export class ShippingMcpLlamaIndexServerComponent {
  constructor(queryEngine, repository) {
    this.queryEngine = queryEngine;
    this.repository = repository;
    this.server = new Server(
      { name: "shipping-mcp-llamaindex-server", version: "0.1.0" },
      { capabilities: { tools: {} } },
    );
  }

  build() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_shipping_candidates",
          description: "LlamaIndex-style retrieval pipeline for top shipping candidates.",
          inputSchema: {
            type: "object",
            properties: {
              address: { type: "string", minLength: 3 },
              limit: { type: "integer", minimum: 1, maximum: 5, default: 5 },
            },
            required: ["address"],
            additionalProperties: false,
          },
        },
        {
          name: "get_shipping_quote",
          description: "Resolve a quote using retriever + postprocessor query engine.",
          inputSchema: {
            type: "object",
            properties: {
              address: { type: "string", minLength: 3 },
            },
            required: ["address"],
            additionalProperties: false,
          },
        },
        {
          name: "shipping_health",
          description: "Return MCP component and query-engine readiness.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const toolName = request.params.name;
        const args = request.params.arguments ?? {};

        if (toolName === "shipping_health") {
          const result = await this.queryEngine.health(this.repository);
          return mkSuccessPayload({
            ...result,
            component: "shipping-mcp-llamaindex-server-component",
            server: "shipping-mcp-llamaindex-server",
            version: "0.1.0",
          });
        }

        if (toolName === "search_shipping_candidates") {
          return mkSuccessPayload(await this.queryEngine.searchCandidates(args));
        }

        if (toolName === "get_shipping_quote") {
          return mkSuccessPayload(await this.queryEngine.getBestQuote(args));
        }

        return mkErrorPayload(`Unknown tool: ${toolName}`);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown tool error";
        return mkErrorPayload(message);
      }
    });

    return this.server;
  }
}
