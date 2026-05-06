import type { AgentMessage, AgentTurnResult, CartCardUiBlock, ConversationDetail, ConversationSummary, CustomerDetailsInputUiBlock, ProductListUiBlock } from "@/lib/types/domain";

export type ChatMessage = Pick<AgentMessage, "role" | "content">;
export type AgentChatResponse = AgentTurnResult | { error?: string };
export type SessionApiError = { error?: string };
export type SessionListResponse = { sessions?: ConversationSummary[] } & SessionApiError;
export type SessionDetailResponse = ConversationDetail & SessionApiError;
export type HarnessPhase = "Talking" | "Planning" | "Executing" | "Blocked" | "Recovering";
export type TimelineItem =
  | { id: string; kind: "message"; role: "user" | "assistant"; content: string }
  | { id: string; kind: "card"; cardType: "cart"; data: CartCardUiBlock["data"] }
  | { id: string; kind: "card"; cardType: "customer-details-input"; data: CustomerDetailsInputUiBlock["data"] }
  | { id: string; kind: "card"; cardType: "product-list"; data: ProductListUiBlock["data"] }
  | { id: string; kind: "event"; stage: string; title: string; detail: string; ok: boolean }
  | { id: string; kind: "tool"; tool: string; ok: boolean; reason?: string; input: unknown; output: unknown }
  | {
      id: string;
      kind: "run-summary";
      title: string;
      status: string;
      detail: string;
      durationMs?: number;
      toolCount: number;
      steps: string[];
      trace: TimelineItem[];
    };

export function isAgentTurnResult(data: AgentChatResponse): data is AgentTurnResult {
  return "assistantMessage" in data && "updatedState" in data;
}

export function compactJson(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function shortJson(value: unknown, max = 140) {
  const text = compactJson(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

export function statusTone(status: string) {
  if (status === "success" || status === "payment_completed") return "bg-emerald-100 text-emerald-700";
  if (status === "pending" || status === "payment_pending") return "bg-amber-100 text-amber-700";
  if (status === "blocked" || status === "failed" || status === "error") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}
