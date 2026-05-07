import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createShippingLlamaIndexMcpServer, shutdownShippingLlamaIndexMcp } from "./core.mjs";

const host = process.env.MCP_HTTP_HOST ?? "127.0.0.1";
const port = Number(process.env.MCP_HTTP_PORT ?? 3401);

const app = express();
app.use(express.json({ limit: "2mb" }));

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

const server = createShippingLlamaIndexMcpServer();
await server.connect(transport);

app.post("/mcp", async (req, res) => {
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transport error";
    res.status(500).json({ error: message });
  }
});

const listener = app.listen(port, host, () => {
  console.log(`shipping-mcp-llamaindex-server streamable HTTP listening on http://${host}:${port}/mcp`);
});

const teardown = async () => {
  listener.close();
  await shutdownShippingLlamaIndexMcp();
  process.exit(0);
};

process.on("SIGINT", teardown);
process.on("SIGTERM", teardown);
