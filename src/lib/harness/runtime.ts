import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { prisma } from "@/lib/db/prisma";
import { getChatModel, type ReasoningEffort } from "@/lib/llm/openai";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { TOOL_REGISTRY } from "@/lib/tools/registry";
import { validateStateForCheckout } from "@/lib/harness/guardrails";
import { createEmptyState } from "@/lib/harness/state";
import {
  AgentMessage,
  AgentTurnResult,
  Cart,
  CustomerProfile,
  HarnessEvent,
  HarnessMode,
  HarnessPlanStep,
  Payment,
  Product,
  SessionState,
  ToolTrace,
} from "@/lib/types/domain";

export type AgentStreamEvent =
  | { type: "event"; event: HarnessEvent }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; trace: ToolTrace }
  | { type: "token"; token: string }
  | { type: "final"; result: AgentTurnResult };

type AgentStreamSink = (event: AgentStreamEvent) => void | Promise<void>;
export type ResponseStyle = "brief" | "standard" | "detailed";

class AgentTokenStreamHandler extends BaseCallbackHandler {
  name = "agent_token_stream";
  lc_prefer_streaming = true;

  constructor(private readonly onStream?: AgentStreamSink) {
    super();
  }

  async handleLLMNewToken(token: string) {
    if (!token) return;
    await this.onStream?.({ type: "token", token });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function event(stage: HarnessEvent["stage"], title: string, detail: string, ok = true): HarnessEvent {
  return { stage, title, detail, ok, at: nowIso() };
}

function compactList(values: string[], max = 5) {
  return values.filter(Boolean).slice(-max);
}

function normalizeState(state: SessionState, sessionId: string, userId: string): SessionState {
  if (state.harness?.currentMode) return state;
  return {
    ...state,
    sessionId,
    userId,
    harness: {
      ...createEmptyState(sessionId, userId).harness,
      ...state.harness,
    },
  };
}

function appendStateEvent(state: SessionState, next: Partial<SessionState["harness"]>): SessionState {
  return {
    ...state,
    harness: {
      ...state.harness,
      ...next,
    },
  };
}

async function appendTrace(sessionId: string, node: string, detail: unknown) {
  await prisma.harnessTrace.create({ data: { sessionId, node, detail: detail as object } });
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function productSummary(product: Product) {
  return `${product.sku}: ${product.name} (${product.color}, ${product.size}) for ${dollars(product.priceCents)}`;
}

function catalogContext() {
  return PRODUCT_CATALOG.map((p) => `${productSummary(p)}, stock ${p.stock}`).join("\n");
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

function lastAssistantText(messages: BaseMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.getType() === "ai") {
      const text = contentToText(message.content);
      if (text) return text;
    }
  }
  return "";
}

function extractReasoningTrace(messages: BaseMessage[]): string[] {
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

function toLangChainMessages(history: AgentMessage[], currentUserMessage: string) {
  const messages: BaseMessage[] = history.slice(-10).map((message) => {
    if (message.role === "assistant") return new AIMessage(message.content);
    return new HumanMessage(message.content);
  });

  const promptText = currentUserMessage.trim() || "Continue the current workflow from the persisted state.";
  messages.push(new HumanMessage(promptText));
  return messages;
}

function toAgentHistory(
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

function stateSnapshot(state: SessionState) {
  return {
    workflowStep: state.workflowStep,
    cart: state.cart,
    customer: state.customer,
    order: state.order,
    payment: state.payment,
    requiresHuman: state.requiresHuman,
  };
}

function toolPlan(toolTrace: ToolTrace[]): HarnessPlanStep[] {
  if (toolTrace.length === 0) {
    return [
      {
        id: "agent_response",
        label: "Answer from agent reasoning",
        reason: "The LangGraph agent chose not to call a tool for this turn.",
        status: "done",
      },
    ];
  }

  return toolTrace.map((trace, index) => ({
    id: `${trace.tool}_${index + 1}`,
    label: trace.tool.replaceAll("_", " "),
    tool: trace.tool,
    reason: trace.reason ?? "Selected by the LangGraph agent.",
    status: trace.ok ? "done" : "blocked",
  }));
}

function missingCustomerFields(customer: CustomerProfile) {
  return ["name", "email", "phone", "address"].filter((field) => !customer[field as keyof CustomerProfile]);
}

function applyToolOutput(
  state: SessionState,
  toolName: string,
  input: Record<string, unknown>,
  output: Record<string, unknown>,
): SessionState {
  if (toolName === "catalog_lookup") {
    const matches = (output.matches ?? []) as Product[];
    return appendStateEvent(state, {
      observations: compactList([
        ...state.harness.observations,
        matches.length
          ? `Catalog returned ${matches.length} match(es): ${matches.slice(0, 3).map(productSummary).join("; ")}.`
          : "Catalog returned no matching products.",
      ]),
    });
  }

  if (toolName === "cart_update") {
    const cart = output.cart as Cart;
    const selectedSku = String(output.selectedSku);
    const selectedProduct = PRODUCT_CATALOG.find((p) => p.sku === selectedSku);
    return {
      ...state,
      selectedProduct,
      cart,
      workflowStep: "collecting_customer_details",
    };
  }

  if (toolName === "customer_details_upsert") {
    const customer = output.customer as CustomerProfile;
    const missingFields = (output.missingFields ?? []) as string[];
    return appendStateEvent(
      {
        ...state,
        customer,
      },
      missingFields.length > 0
        ? {
            currentMode: "Blocked",
            guardrailFindings: compactList([...state.harness.guardrailFindings, `Missing customer fields: ${missingFields.join(", ")}.`]),
          }
        : { currentMode: "Executing" },
    );
  }

  if (toolName === "shipping_quote") {
    return {
      ...state,
      cart: {
        ...state.cart,
        shippingCents: Number(output.shippingCents),
        totalCents: state.cart.subtotalCents + Number(output.shippingCents),
      },
    };
  }

  if (toolName === "order_create") {
    const shippingCents = Number(input.shippingCents ?? state.cart.shippingCents);
    const cart = {
      ...state.cart,
      shippingCents,
      totalCents: Number(output.totalCents),
    };
    return {
      ...state,
      cart,
      order: {
        orderRef: String(output.orderRef),
        status: "created",
        cart,
        customer: state.customer,
      },
      workflowStep: "reviewing_order",
    };
  }

  if (toolName === "payment_initiate") {
    const payment: Payment = {
      paymentRef: String(output.paymentRef),
      orderRef: String(input.orderRef),
      amountCents: Number(input.amountCents),
      method: input.method === "mpesa" || input.method === "paypal" ? input.method : "card",
      status: output.status as Payment["status"],
    };
    return {
      ...state,
      payment,
      workflowStep: "payment_pending",
    };
  }

  if (toolName === "payment_status_check") {
    const status = output.status as Payment["status"];
    return {
      ...state,
      payment: state.payment
        ? {
            ...state.payment,
            status,
          }
        : undefined,
      workflowStep: status === "success" ? "payment_completed" : "payment_pending",
    };
  }

  if (toolName === "escalate_to_human") {
    return {
      ...state,
      requiresHuman: true,
      workflowStep: "escalated",
    };
  }

  return state;
}

function finalMode(state: SessionState, hasToolError: boolean): HarnessMode {
  if (hasToolError) return "Recovering";
  if (state.workflowStep === "payment_completed") return "Complete";
  if (state.workflowStep === "escalated") return "Complete";
  if (state.harness.currentMode === "Blocked") return "Blocked";
  return "Talking";
}

function finalStatus(state: SessionState, hasToolError: boolean): AgentTurnResult["status"] {
  if (hasToolError) return "error";
  if (state.workflowStep === "escalated") return "escalated";
  if (state.harness.currentMode === "Blocked") return "needs_input";
  return "ok";
}

async function emit(onStream: AgentStreamSink | undefined, eventData: AgentStreamEvent) {
  await onStream?.(eventData);
}

function createAgentTools(sessionId: string, stateRef: { current: SessionState }, traces: ToolTrace[], harnessEvents: HarnessEvent[], onStream?: AgentStreamSink) {
  return Object.values(TOOL_REGISTRY).map((definition) =>
    tool(
      async (input) => {
        const parsedInput = definition.inputSchema.parse(input) as Record<string, unknown>;
        await emit(onStream, { type: "tool_start", tool: definition.name, input: parsedInput });

        try {
          const rawOutput = await definition.execute(parsedInput, { sessionId, state: stateRef.current });
          const output = definition.outputSchema.parse(rawOutput) as Record<string, unknown>;
          stateRef.current = applyToolOutput(stateRef.current, definition.name, parsedInput, output);
          const trace = { tool: definition.name, input: parsedInput, output, ok: true, reason: "Selected by LangGraph ReAct agent." };
          const toolEvent = event("tool", definition.name, `Executed with input ${JSON.stringify(parsedInput)}.`);
          traces.push(trace);
          harnessEvents.push(toolEvent);
          await emit(onStream, { type: "tool_end", trace });
          await emit(onStream, { type: "event", event: toolEvent });
          await appendTrace(sessionId, "agent_tool", { tool: definition.name, input: parsedInput, output });

          return JSON.stringify({
            ok: true,
            output,
            state: stateSnapshot(stateRef.current),
          });
        } catch (error) {
          const detail = error instanceof Error ? error.message : "Unknown tool failure";
          const trace = { tool: definition.name, input: parsedInput, output: { error: detail }, ok: false, reason: "Tool call failed inside LangGraph agent." };
          traces.push(trace);
          stateRef.current = appendStateEvent(stateRef.current, {
            currentMode: "Recovering",
            recoveryNotes: compactList([...stateRef.current.harness.recoveryNotes, `${definition.name} failed: ${detail}`]),
          });
          const recoveryEvent = event("recovery", "Tool failure handled", `${definition.name} failed: ${detail}`, false);
          harnessEvents.push(recoveryEvent);
          await emit(onStream, { type: "tool_end", trace });
          await emit(onStream, { type: "event", event: recoveryEvent });
          await appendTrace(sessionId, "agent_tool_error", { tool: definition.name, input: parsedInput, error: detail });
          throw error;
        }
      },
      {
        name: definition.name,
        description: definition.description,
        schema: definition.inputSchema,
      },
    ),
  );
}

function agentPrompt(state: SessionState, responseStyle: ResponseStyle) {
  const missing = missingCustomerFields(state.customer);
  const styleRule =
    responseStyle === "brief"
      ? "Keep the final response short (2-4 sentences max) and only include essential next actions."
      : responseStyle === "detailed"
        ? "Provide a fuller answer with clear sections and practical detail (typically 6-12 sentences when useful)."
        : "Keep the final customer response concise but complete (typically 4-8 sentences when needed).";
  return `You are an apparel checkout agent running inside a LangGraph ReAct loop.
Use tools for real catalog, cart, customer, order, payment, and escalation actions. Do not invent results that tools can provide.

Rules:
- For catalog questions or recommendations, call catalog_lookup when live product facts are needed.
- Add an item to cart only after the product is identifiable by SKU or by a clear single match from catalog_lookup.
- Before order_create, customer name, email, phone, address, and a shipping_quote are required.
- Do not call payment_initiate unless the user explicitly confirms payment with words like pay, pay now, checkout, confirm, or complete payment.
- If payment is pending, call payment_status_check before giving a final payment answer.
- ${styleRule}
- For longer responses, use clean formatting that renders well in chat:
  * Start with a one-line direct answer.
  * Use short paragraphs with blank lines between sections.
  * Use simple "-" bullet lists for options, next steps, or summaries.
  * Keep lines readable and avoid dense unbroken blocks.
- If there are useful follow-up actions, append 1-3 clickable next-step tags at the end using this exact format:
  <next_step>Short action text the user can click</next_step>
  Keep each tag as one line, plain text inside, and place them after the main response body.
- Never reveal internal reasoning, planning notes, or draft text.
- Never include meta phrases such as "final message", "let's", "we should", or "craft the response" in customer output.

Current persisted state:
${JSON.stringify(stateSnapshot(state), null, 2)}

Missing customer fields: ${missing.join(", ") || "none"}

Catalog:
${catalogContext()}`;
}

function sanitizeCustomerResponse(message: string) {
  const metaLinePatterns = [
    /^\s*(so\s+)?final message[:\-]/i,
    /^\s*let'?s\s+/i,
    /^\s*we\s+(must|should|can)\s+/i,
    /^\s*but earlier\b/i,
    /^\s*craft\b/i,
    /^\s*internal\b/i,
    /^\s*reasoning\b/i,
  ];

  const cleaned = message
    .split("\n")
    .filter((line) => !metaLinePatterns.some((pattern) => pattern.test(line)))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!cleaned) {
    return "I can help with that. Tell me what you want to browse, add to cart, or check out next.";
  }

  return cleaned;
}

async function persistTurn(input: {
  sessionId: string;
  userMessage: string;
  persistUserMessage: boolean;
  assistantMessage: string;
  state: SessionState;
}) {
  const messageData = [
    input.persistUserMessage && input.userMessage.trim() ? { role: "user", content: input.userMessage } : null,
    { role: "assistant", content: input.assistantMessage },
  ].filter(Boolean) as { role: string; content: string }[];

  await prisma.userSession.update({
    where: { id: input.sessionId },
    data: {
      currentStep: input.state.workflowStep,
      stateJson: input.state as unknown as object,
      messages: {
        createMany: {
          data: messageData,
        },
      },
    },
  });
}

export async function runAgentTurn(input: {
  sessionId: string;
  userMessage: string;
  persistUserMessage?: boolean;
  onStream?: AgentStreamSink;
  responseStyle?: ResponseStyle;
  reasoningEffort?: ReasoningEffort;
}): Promise<AgentTurnResult> {
  const session = await prisma.userSession.findUnique({
    where: { id: input.sessionId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!session) throw new Error("Session not found");

  const persistedState = (session.stateJson as SessionState | null) ?? createEmptyState(session.id, session.userId);
  const state = normalizeState(persistedState, session.id, session.userId);
  const stateRef = {
    current: appendStateEvent(state, {
      currentMode: "Planning",
      loopCount: state.harness.loopCount + 1,
      observations: compactList([...state.harness.observations, "LangGraph ReAct agent received the turn and will decide tool use."]),
    }),
  };

  const model = getChatModel(input.reasoningEffort ?? "medium");
  if (!model) {
    throw new Error("OPENAI_API_KEY is required to run the LangGraph agent.");
  }

  const toolTrace: ToolTrace[] = [];
  const observedEvent = event("observe", "Input observed", input.userMessage.trim() || "Continuing current workflow from state.");
  const harnessEvents = [observedEvent];
  await emit(input.onStream, { type: "event", event: observedEvent });
  const agent = createReactAgent({
    llm: model,
    tools: createAgentTools(session.id, stateRef, toolTrace, harnessEvents, input.onStream),
    prompt: agentPrompt(stateRef.current, input.responseStyle ?? "standard"),
  });

  await appendTrace(session.id, "agent_start", {
    userMessage: input.userMessage,
    state: stateSnapshot(stateRef.current),
  });

  const result = await agent.invoke(
    {
      messages: toLangChainMessages(toAgentHistory(session.messages), input.userMessage),
    },
    {
      recursionLimit: 12,
      callbacks: [new AgentTokenStreamHandler(input.onStream)],
    },
  );

  let assistantMessage = lastAssistantText(result.messages as BaseMessage[]);
  const reasoningTrace = extractReasoningTrace(result.messages as BaseMessage[]);
  if (!assistantMessage) {
    assistantMessage = "I handled the latest step, but I do not have a customer-ready response yet.";
  }
  assistantMessage = sanitizeCustomerResponse(assistantMessage);

  const hasToolError = toolTrace.some((trace) => !trace.ok);
  let updatedState = appendStateEvent(stateRef.current, {
    currentMode: finalMode(stateRef.current, hasToolError),
    lastPlan: toolPlan(toolTrace),
    lastIntent: "langgraph_agent",
  });

  if (updatedState.workflowStep === "reviewing_order" || updatedState.workflowStep === "payment_pending") {
    const check = validateStateForCheckout(updatedState);
    const guardrailEvent = check.ok
      ? event("guardrail", "Checkout validation passed", `Workflow step ${updatedState.workflowStep} can continue.`)
      : event("guardrail", "Checkout validation failed", check.reason ?? "Checkout state failed validation.", false);
    harnessEvents.push(guardrailEvent);
    await emit(input.onStream, { type: "event", event: guardrailEvent });
    if (!check.ok) {
      updatedState = appendStateEvent(updatedState, {
        currentMode: "Blocked",
        guardrailFindings: compactList([...updatedState.harness.guardrailFindings, check.reason ?? "Checkout state failed validation."]),
      });
    }
  }

  const planEvent = event("plan", "Agent loop completed", `LangGraph selected ${toolTrace.length} tool call(s).`);
  const responseEvent = event("response", "Response composed", assistantMessage);
  harnessEvents.push(planEvent);
  harnessEvents.push(responseEvent);
  await emit(input.onStream, { type: "event", event: planEvent });
  await emit(input.onStream, { type: "event", event: responseEvent });
  await appendTrace(session.id, "agent_finish", {
    assistantMessage,
    toolTrace,
    state: stateSnapshot(updatedState),
  });

  await persistTurn({
    sessionId: session.id,
    userMessage: input.userMessage,
    persistUserMessage: input.persistUserMessage ?? true,
    assistantMessage,
    state: updatedState,
  });

  const resultPayload = {
    assistantMessage,
    updatedState,
    toolTrace,
    harnessEvents,
    reasoningTrace,
    status: finalStatus(updatedState, hasToolError),
  };
  await emit(input.onStream, { type: "final", result: resultPayload });
  return resultPayload;
}
