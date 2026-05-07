// Main harness orchestrator: model loop, tools, guardrails, and persistence.
import { BaseCallbackHandler } from "@langchain/core/callbacks/base";
import { BaseMessage } from "@langchain/core/messages";
import { tool } from "@langchain/core/tools";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { prisma } from "@/lib/db/prisma";
import { validateStateForCheckout } from "@/lib/harness/guardrails";
import { createEmptyState } from "@/lib/harness/state";
import {
  buildContextUsage,
  CATALOG_BUDGET_TOKENS,
  catalogContext,
  estimateTokens,
  extractReasoningTrace,
  HISTORY_BUDGET_TOKENS,
  lastAssistantText,
  REASONING_BUDGET_TOKENS,
  STATE_BUDGET_TOKENS,
  toAgentHistory,
  toLangChainMessages,
  trimToTokenBudget,
} from "@/lib/harness/context-budget";
import { agentPrompt, buildUiBlocks, noToolsPrompt, sanitizeCustomerResponse } from "@/lib/harness/prompt-ui";
import {
  appendStateEvent,
  applyToolOutput,
  compactList,
  finalMode,
  finalStatus,
  normalizeState,
  stateSnapshot,
  toolPlan,
} from "@/lib/harness/state-machine";
import { getChatModel, type ReasoningEffort } from "@/lib/llm/openai";
import { formatToolDisplayName, formatToolLogName } from "@/lib/tools/labels";
import { TOOL_REGISTRY } from "@/lib/tools/registry";
import { AgentTurnResult, HarnessEvent, SessionState, ToolTrace } from "@/lib/types/domain";
import { AgentStreamEvent, AgentStreamSink, ResponseStyle, ToolPermission } from "@/lib/harness/types";

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

  async handleChatModelStreamEvent(event: { event: string; delta?: { type?: string; reasoning?: string } }) {
    if (event.event !== "content-block-delta") return;
    if (event.delta?.type !== "reasoning-delta") return;
    const text = event.delta.reasoning?.trim();
    if (!text) return;
    await this.onStream?.({ type: "reasoning", text });
  }
}

function nowIso() {
  return new Date().toISOString();
}

function event(stage: HarnessEvent["stage"], title: string, detail: string, ok = true): HarnessEvent {
  return { stage, title, detail, ok, at: nowIso() };
}

async function appendTrace(sessionId: string, node: string, detail: unknown) {
  await prisma.harnessTrace.create({ data: { sessionId, node, detail: detail as object } });
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
          const toolEvent = event("tool", formatToolDisplayName(definition.name), `Executed ${formatToolLogName(definition.name)} with input ${JSON.stringify(parsedInput)}.`);
          traces.push(trace);
          harnessEvents.push(toolEvent);
          await emit(onStream, { type: "tool_end", trace });
          await emit(onStream, { type: "event", event: toolEvent });
          await appendTrace(sessionId, "agent_tool", { tool: formatToolLogName(definition.name), input: parsedInput, output });

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
          await appendTrace(sessionId, "agent_tool_error", { tool: formatToolLogName(definition.name), input: parsedInput, error: detail });
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
  toolPermission?: ToolPermission;
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
  const toolPermission = input.toolPermission ?? "allow";
  const stateText = trimToTokenBudget(JSON.stringify(stateSnapshot(state), null, 2), STATE_BUDGET_TOKENS);
  const stateUsedTokens = estimateTokens(stateText);
  const catalog = catalogContext(CATALOG_BUDGET_TOKENS);
  const baseContextUsage = buildContextUsage({
    historyUsedTokens: 0,
    historyMaxTokens: HISTORY_BUDGET_TOKENS,
    historyDetail: "No history packed for this path",
    stateUsedTokens,
    stateMaxTokens: STATE_BUDGET_TOKENS,
    catalogUsedTokens: catalog.usedTokens,
    catalogMaxTokens: catalog.maxTokens,
  });

  if (toolPermission === "request") {
    const requestedTools = Object.keys(TOOL_REGISTRY);
    const approvalRequestId = `approval_${session.id}_${Date.now()}`;
    const assistantMessage = "I need your approval to use tools so I can continue this request.";
    const approvalEvent = event("plan", "Tool approval required", `Pending approval for: ${requestedTools.join(", ")}`, true);

    const updatedState = appendStateEvent(state, {
      currentMode: "Blocked",
      observations: compactList([...state.harness.observations, `Tool approval requested for ${requestedTools.join(", ")}.`]),
    });

    const resultPayload: AgentTurnResult = {
      assistantMessage,
      updatedState,
      toolTrace: [],
      harnessEvents: [approvalEvent],
      contextUsage: baseContextUsage,
      reasoningTrace: ["Tool execution is gated by policy and requires explicit user approval."],
      requiresToolApproval: true,
      approvalRequestId,
      requestedTools,
      approvalReason: "Tool execution is set to Request mode.",
      status: "needs_input",
    };
    await emit(input.onStream, { type: "event", event: approvalEvent });
    await emit(input.onStream, { type: "final", result: resultPayload });
    return resultPayload;
  }

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
    tools: toolPermission === "allow" ? createAgentTools(session.id, stateRef, toolTrace, harnessEvents, input.onStream) : [],
    prompt:
      toolPermission === "allow"
        ? agentPrompt(stateRef.current, input.responseStyle ?? "standard", { stateText, catalogText: catalog.text })
        : noToolsPrompt(stateRef.current, input.responseStyle ?? "standard"),
  });

  await appendTrace(session.id, "agent_start", {
    userMessage: input.userMessage,
    state: stateSnapshot(stateRef.current),
  });

  const packedMessages = toLangChainMessages(toAgentHistory(session.messages), input.userMessage);
  const result = await agent.invoke(
    {
      messages: packedMessages.messages,
    },
    {
      recursionLimit: 12,
      callbacks: [new AgentTokenStreamHandler(input.onStream)],
    },
  );

  let assistantMessage = lastAssistantText(result.messages as BaseMessage[]);
  const rawAssistantMessage = assistantMessage;
  const reasoningTrace = extractReasoningTrace(result.messages as BaseMessage[]);
  const reasoningUsedTokens = Math.min(estimateTokens(reasoningTrace.join("\n")), REASONING_BUDGET_TOKENS);
  const contextUsage = buildContextUsage({
    historyUsedTokens: packedMessages.usage.usedTokens,
    historyMaxTokens: packedMessages.usage.maxTokens,
    historyDetail: packedMessages.usage.detail,
    stateUsedTokens,
    stateMaxTokens: STATE_BUDGET_TOKENS,
    catalogUsedTokens: catalog.usedTokens,
    catalogMaxTokens: catalog.maxTokens,
    reasoningUsedTokens,
    reasoningDetail: reasoningTrace.length ? `${reasoningTrace.length} line(s)` : "No reasoning summary line(s)",
  });
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

  const resultPayload: AgentTurnResult = {
    assistantMessage,
    updatedState,
    toolTrace,
    harnessEvents,
    ui: buildUiBlocks({ assistantMessage: rawAssistantMessage, updatedState, traces: toolTrace }),
    contextUsage,
    reasoningTrace,
    status: finalStatus(updatedState, hasToolError),
  };
  await emit(input.onStream, { type: "final", result: resultPayload });
  return resultPayload;
}
