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

export class ShippingMcpServerComponent {
  constructor(pipeline) {
    this.pipeline = pipeline;
    this.server = new Server(
      { name: "shipping-mcp-server", version: "0.5.0" },
      { capabilities: { tools: {} } },
    );
  }

  build() {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: "search_shipping_candidates",
          description: "Hybrid RAG retrieval of top shipping candidates (vector + lexical fusion).",
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
          description: "Resolve best quote plus alternatives with confidence diagnostics.",
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
          description: "Return MCP component and RAG pipeline readiness.",
          inputSchema: { type: "object", properties: {}, additionalProperties: false },
        },
      ],
    }));

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        const toolName = request.params.name;
        const args = request.params.arguments ?? {};

        if (toolName === "shipping_health") {
          const result = await this.pipeline.health();
          return mkSuccessPayload({
            ...result,
            component: "shipping-mcp-server-component",
            server: "shipping-mcp-server",
            version: "0.5.0",
          });
        }

        if (toolName === "search_shipping_candidates") {
          return mkSuccessPayload(await this.pipeline.searchCandidates(args));
        }

        if (toolName === "get_shipping_quote") {
          return mkSuccessPayload(await this.pipeline.getBestQuote(args));
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
