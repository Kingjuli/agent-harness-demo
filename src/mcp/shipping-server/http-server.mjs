import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createShippingMcpServer, shutdownShippingMcp } from "./core.mjs";

const host = process.env.MCP_HOST ?? "127.0.0.1";
const port = Number(process.env.MCP_PORT ?? 8787);

const app = createMcpExpressApp({ host });
app.use((req, res, next) => {
  if (req.method === "POST") {
    return expressJson(req, res, next);
  }
  return next();
});

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined,
});

const server = createShippingMcpServer();
await server.connect(transport);

app.all("/mcp", async (req, res) => {
  try {
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown transport error";
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});

const httpServer = app.listen(port, host, () => {
  console.log(`shipping-mcp-server streamable HTTP listening on http://${host}:${port}/mcp`);
});

function expressJson(req, res, next) {
  let body = "";
  req.on("data", (chunk) => {
    body += chunk;
  });
  req.on("end", () => {
    if (!body) {
      req.body = undefined;
      next();
      return;
    }

    try {
      req.body = JSON.parse(body);
      next();
    } catch {
      res.status(400).json({ error: "Invalid JSON body" });
    }
  });
}

const shutdown = async () => {
  httpServer.close(async () => {
    await shutdownShippingMcp();
    process.exit(0);
  });
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
