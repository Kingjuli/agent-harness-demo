// Shared harness-level types used across runtime, API routes, and chat UI.
import { AgentTurnResult, HarnessEvent, ToolTrace } from "@/lib/types/domain";

export type ResponseStyle = "brief" | "standard" | "detailed";
export type ToolPermission = "allow" | "deny" | "request";

export type AgentStreamEvent =
  | { type: "event"; event: HarnessEvent }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; trace: ToolTrace }
  | { type: "token"; token: string }
  | { type: "reasoning"; text: string }
  | { type: "final"; result: AgentTurnResult };

export type AgentStreamSink = (event: AgentStreamEvent) => void | Promise<void>;
