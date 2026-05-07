const MCP_BACKED_TOOLS = new Set<string>(["shipping_quote"]);

function titleCaseFromToolName(toolName: string) {
  return toolName.replaceAll("_", " ");
}

export function isMcpBackedTool(toolName: string) {
  return MCP_BACKED_TOOLS.has(toolName);
}

export function formatToolDisplayName(toolName: string) {
  const base = titleCaseFromToolName(toolName);
  return isMcpBackedTool(toolName) ? `[MCP] ${base}` : base;
}

export function formatToolLogName(toolName: string) {
  return isMcpBackedTool(toolName) ? `mcp:${toolName}` : toolName;
}
