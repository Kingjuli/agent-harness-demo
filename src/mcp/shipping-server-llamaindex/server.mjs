import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createShippingLlamaIndexMcpServer, shutdownShippingLlamaIndexMcp } from "./core.mjs";

const server = createShippingLlamaIndexMcpServer();
const transport = new StdioServerTransport();
await server.connect(transport);

const teardown = async () => {
  await shutdownShippingLlamaIndexMcp();
  process.exit(0);
};

process.on("SIGINT", teardown);
process.on("SIGTERM", teardown);
