// Context-packing and token-budget helpers for model input construction.
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { AgentMessage, ContextUsageSummary, Product } from "@/lib/types/domain";

const MODEL_CONTEXT_WINDOW_TOKENS = 128_000;
const RESERVED_OUTPUT_TOKENS = 2_000;
const SAFETY_BUFFER_TOKENS = 14_000;
const MAX_CONTEXT_TOKENS = MODEL_CONTEXT_WINDOW_TOKENS - RESERVED_OUTPUT_TOKENS - SAFETY_BUFFER_TOKENS;
export const HISTORY_BUDGET_TOKENS = 9_000;
export const STATE_BUDGET_TOKENS = 5_000;
export const CATALOG_BUDGET_TOKENS = 4_000;
export const REASONING_BUDGET_TOKENS = 900;
const TOOL_CONTRACT_BUDGET_TOKENS = 1_100;

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function productSummary(product: Product) {
  return `${product.sku}: ${product.name} (${product.color}, ${product.size}) for ${dollars(product.priceCents)}`;
}

export function estimateTokens(text: string) {
  return Math.ceil(text.length / 4);
}

export function trimToTokenBudget(text: string, maxTokens: number) {
  if (maxTokens <= 0) return "";
  const maxChars = maxTokens * 4;
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars - 1).trimEnd()}…`;
}

export function catalogContext(maxTokens = CATALOG_BUDGET_TOKENS) {
  let used = 0;
  const lines: string[] = [];
  for (const product of PRODUCT_CATALOG) {
    const line = `${productSummary(product)}, stock ${product.stock}`;
    const tokens = estimateTokens(line);
    if (used + tokens > maxTokens) break;
    lines.push(line);
    used += tokens;
  }
  return { text: lines.join("\n"), usedTokens: used, maxTokens };
}

function contentToText(content: BaseMessage["content"]) {
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if ("text" in part && typeof part.text === "string") return part.text;
      return "";
    })
    .join("")
    .trim();
}

export function lastAssistantText(messages: BaseMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.getType() === "ai") {
      const text = contentToText(message.content);
      if (text) return text;
    }
  }
  return "";
}

export function extractReasoningTrace(messages: BaseMessage[]): string[] {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.getType() !== "ai") continue;
    const aiMessage = message as AIMessage;
    const additional = aiMessage.additional_kwargs as {
      reasoning?: {
        summary?: Array<{ text?: string }>;
      };
    };
    const reasoning = additional?.reasoning;
    if (!reasoning?.summary?.length) continue;
    return reasoning.summary
      .map((part) => part?.text?.trim() ?? "")
      .filter(Boolean);
  }
  return [];
}

export function toLangChainMessages(history: AgentMessage[], currentUserMessage: string) {
  const promptText = currentUserMessage.trim() || "Continue the current workflow from the persisted state.";
  const currentUserTokens = estimateTokens(`user:${promptText}`);
  const availableHistoryTokens = Math.max(0, HISTORY_BUDGET_TOKENS - currentUserTokens);

  const selected: AgentMessage[] = [];
  let usedHistoryTokens = 0;
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    const tokenCost = estimateTokens(`${msg.role}:${msg.content}`);
    if (usedHistoryTokens + tokenCost > availableHistoryTokens) break;
    selected.push(msg);
    usedHistoryTokens += tokenCost;
  }
  selected.reverse();

  const messages: BaseMessage[] = selected.map((message) => (message.role === "assistant" ? new AIMessage(message.content) : new HumanMessage(message.content)));
  messages.push(new HumanMessage(promptText));
  return {
    messages,
    usage: {
      usedTokens: usedHistoryTokens + currentUserTokens,
      maxTokens: HISTORY_BUDGET_TOKENS,
      detail: `${selected.length} history messages + current user message`,
    },
  };
}

export function toAgentHistory(
  messages: {
    id: string;
    role: string;
    content: string;
    createdAt: Date;
  }[],
): AgentMessage[] {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: message.id,
      role: message.role as AgentMessage["role"],
      content: message.content,
      createdAt: message.createdAt.toISOString(),
    }));
}

export function buildContextUsage(input: {
  historyUsedTokens: number;
  historyMaxTokens: number;
  historyDetail: string;
  stateUsedTokens: number;
  stateMaxTokens: number;
  catalogUsedTokens: number;
  catalogMaxTokens: number;
  reasoningUsedTokens?: number;
  reasoningDetail?: string;
}): ContextUsageSummary {
  const categories = [
    {
      key: "history" as const,
      usedTokens: input.historyUsedTokens,
      maxTokens: input.historyMaxTokens,
      usagePercent: Math.round((input.historyUsedTokens / input.historyMaxTokens) * 100),
      detail: input.historyDetail,
    },
    {
      key: "workflow_state" as const,
      usedTokens: input.stateUsedTokens,
      maxTokens: input.stateMaxTokens,
      usagePercent: Math.round((input.stateUsedTokens / input.stateMaxTokens) * 100),
      detail: "Serialized workflow/cart/customer/order/payment state",
    },
    {
      key: "catalog" as const,
      usedTokens: input.catalogUsedTokens,
      maxTokens: input.catalogMaxTokens,
      usagePercent: Math.round((input.catalogUsedTokens / input.catalogMaxTokens) * 100),
      detail: "Catalog lines available to the agent prompt",
    },
    {
      key: "reasoning_trace" as const,
      usedTokens: input.reasoningUsedTokens ?? 0,
      maxTokens: REASONING_BUDGET_TOKENS,
      usagePercent: Math.round(((input.reasoningUsedTokens ?? 0) / REASONING_BUDGET_TOKENS) * 100),
      detail: input.reasoningDetail ?? "No reasoning trace attached to input context",
    },
    {
      key: "tool_contracts" as const,
      usedTokens: TOOL_CONTRACT_BUDGET_TOKENS,
      maxTokens: TOOL_CONTRACT_BUDGET_TOKENS,
      usagePercent: 100,
      detail: "Static tool schemas/contract instructions",
    },
  ];
  const totalUsedTokens = categories.reduce((sum, category) => sum + category.usedTokens, 0);
  return {
    modelContextWindowTokens: MODEL_CONTEXT_WINDOW_TOKENS,
    reservedOutputTokens: RESERVED_OUTPUT_TOKENS,
    safetyBufferTokens: SAFETY_BUFFER_TOKENS,
    maxContextTokens: MAX_CONTEXT_TOKENS,
    totalUsedTokens,
    totalUsagePercent: Math.round((totalUsedTokens / MAX_CONTEXT_TOKENS) * 100),
    categories,
  };
}
