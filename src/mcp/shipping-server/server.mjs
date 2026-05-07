import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createShippingMcpServer, shutdownShippingMcp } from "./core.mjs";

const server = createShippingMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

const shutdown = async () => {
  await shutdownShippingMcp();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
