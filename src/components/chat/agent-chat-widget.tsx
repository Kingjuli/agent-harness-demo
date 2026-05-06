"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { AgentTurnResult, ConversationSummary, HarnessEvent, SessionState, ToolTrace } from "@/lib/types/domain";
import type { ReasoningEffort } from "@/lib/llm/openai";
import { ConversationList } from "@/components/chat/conversation-list";
import { ChatTimeline } from "@/components/chat/chat-timeline";
import { shortJson, statusTone, type AgentChatResponse, type ChatMessage, type SessionDetailResponse, type SessionListResponse, type TimelineItem } from "@/components/chat/types";

type RunStatus = "running" | "blocked" | "done" | "failed";
type LiveTraceStep = {
  id: string;
  label: string;
  detail: string;
  status: "done" | "active" | "waiting" | "failed";
};
type RunLog = {
  id: string;
  prompt: string;
  status: RunStatus;
  startedAt: number;
  durationMs?: number;
  steps: string[];
  toolCount: number;
  diffs: string[];
  reasoning: string[];
  assistantMessage?: string;
};

type AgentWireEvent =
  | { type: "event"; event: HarnessEvent }
  | { type: "tool_start"; tool: string; input: unknown }
  | { type: "tool_end"; trace: ToolTrace }
  | { type: "token"; token: string }
  | { type: "final"; result: AgentTurnResult }
  | { type: "complete" }
  | { type: "error"; error: string };

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarizeDiff(prev: SessionState | null, next: SessionState): string[] {
  const diffs: string[] = [];
  const prevTotal = prev?.cart.totalCents ?? 0;
  const nextTotal = next.cart.totalCents;
  if (prevTotal !== nextTotal) diffs.push(`cart_total: ${prevTotal} -> ${nextTotal}`);
  const prevStep = prev?.workflowStep ?? "browsing";
  if (prevStep !== next.workflowStep) diffs.push(`workflow_step: ${prevStep} -> ${next.workflowStep}`);
  const prevPayment = prev?.payment?.status ?? "not-started";
  const nextPayment = next.payment?.status ?? "not-started";
  if (prevPayment !== nextPayment) diffs.push(`payment_status: ${prevPayment} -> ${nextPayment}`);
  const prevAddress = prev?.customer.address ?? "";
  const nextAddress = next.customer.address ?? "";
  if (prevAddress !== nextAddress) diffs.push(`address: ${prevAddress || "missing"} -> ${nextAddress || "missing"}`);
  return diffs;
}

function traceFromResponse(runId: string, events: HarnessEvent[], tools: ToolTrace[]): TimelineItem[] {
  return [
    ...events.map(
      (ev, index): TimelineItem => ({
        id: `event-${runId}-${ev.stage}-${index}`,
        kind: "event",
        stage: ev.stage,
        title: ev.title,
        detail: ev.detail,
        ok: ev.ok,
      }),
    ),
    ...tools.map(
      (toolItem, index): TimelineItem => ({
        id: `tool-${runId}-${toolItem.tool}-${index}`,
        kind: "tool",
        tool: toolItem.tool,
        ok: toolItem.ok,
        reason: toolItem.reason,
        input: toolItem.input,
        output: toolItem.output,
      }),
    ),
  ];
}

function defaultTrace(runId: string): LiveTraceStep[] {
  return [
    { id: `${runId}-request`, label: "Request", detail: "Message queued for the agent", status: "done" },
    { id: `${runId}-agent`, label: "Agent", detail: "LangGraph ReAct loop started", status: "active" },
  ];
}

function upsertTraceStep(steps: LiveTraceStep[], step: LiveTraceStep) {
  const index = steps.findIndex((item) => item.id === step.id);
  if (index < 0) return [...steps.map((item) => (item.status === "active" ? { ...item, status: "done" as const } : item)), step];
  return steps.map((item, itemIndex) => (itemIndex === index ? step : item));
}

export function AgentChatWidget() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sessionMenuRef = useRef<HTMLDivElement | null>(null);
  const actionsMenuRef = useRef<HTMLDivElement | null>(null);
  const reasoningMenuRef = useRef<HTMLDivElement | null>(null);
  const runsMenuRef = useRef<HTMLDivElement | null>(null);
  const runCounterRef = useRef(1);
  const runStartedAtRef = useRef<Record<string, number>>({});
  const apiCopyIndexRef = useRef(0);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [sessionMenuOpen, setSessionMenuOpen] = useState(false);
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [runsMenuOpen, setRunsMenuOpen] = useState(false);
  const [paused, setPaused] = useState(false);
  const [responseStyle, setResponseStyle] = useState<"brief" | "standard" | "detailed">("standard");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>("medium");
  const [sessionId, setSessionId] = useState("");
  const [userId, setUserId] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [baseTimeline, setBaseTimeline] = useState<TimelineItem[]>([]);
  const [state, setState] = useState<SessionState | null>(null);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [lastPrompt, setLastPrompt] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [liveTrace, setLiveTrace] = useState<LiveTraceStep[]>([]);
  const [streamingDraft, setStreamingDraft] = useState("");
  const [thinkingLabel, setThinkingLabel] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSessionId(localStorage.getItem("demo_session_id") ?? "");
      setUserId(localStorage.getItem("demo_user_id") ?? "");
      setResponseStyle((localStorage.getItem("demo_response_style") as "brief" | "standard" | "detailed" | null) ?? "standard");
      setReasoningEffort((localStorage.getItem("demo_reasoning_effort") as ReasoningEffort | null) ?? "medium");
      setMounted(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<{ prompt?: string }>).detail;
      const prompt = detail?.prompt?.trim();
      if (!prompt) return;
      setOpen(true);
      setChatInput(prompt);
    };
    window.addEventListener("moringa:chat-intent", handler as EventListener);
    return () => window.removeEventListener("moringa:chat-intent", handler as EventListener);
  }, []);

  useEffect(() => {
    if (!userId || !sessionId) return;
    let cancelled = false;

    async function loadSelectedConversation() {
      setSessionLoading(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (!res.ok) return;
        const data = (await res.json()) as SessionDetailResponse;
        if (cancelled || !("sessionId" in data)) return;
        setState(data.state);
        const hydrated = hydrateTimelineFromMessages(data.messages.filter((m) => m.role === "user" || m.role === "assistant"));
        setTimeline(hydrated);
        setBaseTimeline(hydrated);
        setRuns([]);
        setLiveTrace([]);
        setStreamingDraft("");
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    async function loadConversationIndex() {
      const res = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`);
      const data = (await res.json()) as SessionListResponse;
      if (!cancelled && Array.isArray(data.sessions)) setConversations(data.sessions);
    }

    void loadSelectedConversation();
    void loadConversationIndex();
    return () => {
      cancelled = true;
    };
  }, [sessionId, userId]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!containerRef.current || !target) return;
      if (sessionMenuOpen && sessionMenuRef.current && !sessionMenuRef.current.contains(target)) {
        setSessionMenuOpen(false);
      }
      if (actionsMenuOpen && actionsMenuRef.current && !actionsMenuRef.current.contains(target)) {
        setActionsMenuOpen(false);
      }
      if (reasoningMenuOpen && reasoningMenuRef.current && !reasoningMenuRef.current.contains(target)) {
        setReasoningMenuOpen(false);
      }
      if (runsMenuOpen && runsMenuRef.current && !runsMenuRef.current.contains(target)) {
        setRunsMenuOpen(false);
      }
      if (!containerRef.current.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
    };
  }, [open, sessionMenuOpen, actionsMenuOpen, reasoningMenuOpen, runsMenuOpen]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  function hydrateTimelineFromMessages(nextMessages: ChatMessage[]) {
    return nextMessages.map((message, index): TimelineItem => ({
      id: `history-${index}`,
      kind: "message",
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));
  }

  async function refreshConversationIndex(nextSessionId = sessionId) {
    if (!userId) return;
    const res = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`);
    const data = (await res.json()) as SessionListResponse;
    if (Array.isArray(data.sessions)) setConversations(data.sessions);
    if (nextSessionId) {
      setSessionId(nextSessionId);
      localStorage.setItem("demo_session_id", nextSessionId);
    }
  }

  async function openConversation(conversation: ConversationSummary) {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, sessionId: conversation.id }),
      });
      const data = (await res.json()) as SessionDetailResponse;
      if ("error" in data && data.error) return;
      setSessionId(data.sessionId);
      localStorage.setItem("demo_session_id", data.sessionId);
      setState(data.state);
      const hydrated = hydrateTimelineFromMessages(data.messages.filter((m) => m.role === "user" || m.role === "assistant"));
      setTimeline(hydrated);
      setBaseTimeline(hydrated);
      setRuns([]);
      setLiveTrace([]);
      setStreamingDraft("");
      await refreshConversationIndex(data.sessionId);
    } finally {
      setLoading(false);
    }
  }

  async function startNewConversation() {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const res = await fetch("/api/sessions/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });
      const data = (await res.json()) as SessionDetailResponse;
      if ("error" in data && data.error) return;
      setSessionId(data.sessionId);
      localStorage.setItem("demo_session_id", data.sessionId);
      setState(data.state);
      setTimeline([]);
      setBaseTimeline([]);
      setRuns([]);
      setLiveTrace([]);
      setStreamingDraft("");
      setChatInput("");
      await refreshConversationIndex(data.sessionId);
    } finally {
      setLoading(false);
    }
  }

  async function deleteConversation(sessionIdToDelete: string) {
    if (!userId || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/sessions/${sessionIdToDelete}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentSessionId: sessionId }),
      });
      const data = (await res.json()) as { replacementSessionId?: string; error?: string };
      if ("error" in data && data.error) return;
      await refreshConversationIndex(data.replacementSessionId ?? "");
    } finally {
      setLoading(false);
    }
  }

  async function replaySession() {
    if (replaying || runs.length === 0) return;
    setReplaying(true);
    setTimeline([...baseTimeline]);
    try {
      for (const run of runs) {
        setTimeline((prev) => [...prev, { id: `replay-user-${run.id}`, kind: "message", role: "user", content: run.prompt }]);
        for (const step of run.steps) {
          await sleep(180);
          setTimeline((prev) => [
            ...prev,
            {
              id: `replay-step-${run.id}-${step}-${Date.now()}`,
              kind: "event",
              stage: "timeline",
              title: step,
              detail: "Replay",
              ok: true,
            },
          ]);
        }
        if (run.assistantMessage) {
          await sleep(180);
          setTimeline((prev) => [...prev, { id: `replay-assistant-${run.id}`, kind: "message", role: "assistant", content: run.assistantMessage ?? "" }]);
        }
      }
    } finally {
      setReplaying(false);
    }
  }

  function updateRun(id: string, patch: Partial<RunLog>) {
    setRuns((prev) => prev.map((run) => (run.id === id ? { ...run, ...patch } : run)));
  }

  async function readAgentStream(
    response: Response,
    handlers: {
      onEvent: (event: HarnessEvent) => void;
      onToolStart: (toolName: string, input: unknown) => void;
      onToolEnd: (trace: ToolTrace) => void;
      onToken: (token: string) => void;
      onFinal: (result: AgentTurnResult) => void;
    },
  ) {
    if (!response.body) throw new Error("Streaming response body was empty.");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split("\n\n");
      buffer = chunks.pop() ?? "";

      for (const chunk of chunks) {
        const dataLine = chunk
          .split("\n")
          .find((line) => line.startsWith("data:"));
        if (!dataLine) continue;

        const eventData = JSON.parse(dataLine.slice(5).trim()) as AgentWireEvent;
        if (eventData.type === "event") handlers.onEvent(eventData.event);
        if (eventData.type === "tool_start") handlers.onToolStart(eventData.tool, eventData.input);
        if (eventData.type === "tool_end") handlers.onToolEnd(eventData.trace);
        if (eventData.type === "token") handlers.onToken(eventData.token);
        if (eventData.type === "final") handlers.onFinal(eventData.result);
        if (eventData.type === "error") throw new Error(eventData.error);
      }
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || !sessionId || loading || paused) return;
    setLoading(true);
    setThinkingLabel("Thinking through your request");
    const userText = text.trim();
    setChatInput("");
    setLastPrompt(userText);
    const runId = `run-${runCounterRef.current++}`;
    const startedAt = window.performance.now();
    runStartedAtRef.current[runId] = startedAt;

    setRuns((prev) => [
      {
        id: runId,
        prompt: userText,
        status: "running",
        startedAt,
        steps: ["queued"],
        toolCount: 0,
        diffs: [],
        reasoning: [],
      },
      ...prev,
    ]);

    setTimeline((prev) => [...prev, { id: `msg-user-${runId}`, kind: "message", role: "user", content: userText }]);
    setLiveTrace(defaultTrace(runId));
    setStreamingDraft("");

    try {
      setThinkingLabel("Connecting to agent runtime");
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userMessage: userText, maxTurns: 6, stream: true, responseStyle, reasoningEffort }),
      });

      if (!res.ok) {
        const data = (await res.json()) as AgentChatResponse;
        throw new Error("error" in data ? data.error : "I could not complete that turn. Please try again.");
      }

      const streamedEvents: HarnessEvent[] = [];
      const streamedTrace: ToolTrace[] = [];
      const finalResult: { current: AgentTurnResult | null } = { current: null };

      await readAgentStream(res, {
        onEvent: (eventData) => {
          streamedEvents.push(eventData);
          setThinkingLabel(`Planning: ${eventData.title}`);
          setLiveTrace((prev) =>
            upsertTraceStep(prev, {
              id: `${runId}-event-${streamedEvents.length}`,
              label: eventData.stage,
              detail: `${eventData.title}: ${eventData.detail}`,
              status: eventData.ok ? "done" : "failed",
            }),
          );
        },
        onToolStart: (toolName, input) => {
          const apiCopy = [
            "Calling tools... convincing the API to wake up politely",
            "Talking to the API... it asked for one more second",
            "Fetching data... tiny network adventure in progress",
            "Tool call running... brewing fresh results",
          ];
          setThinkingLabel(apiCopy[apiCopyIndexRef.current % apiCopy.length]);
          apiCopyIndexRef.current += 1;
          setLiveTrace((prev) =>
            upsertTraceStep(prev, {
              id: `${runId}-tool-${toolName}`,
              label: toolName.replace(/_/g, " "),
              detail: `Calling with ${shortJson(input, 80)}`,
              status: "active",
            }),
          );
        },
        onToolEnd: (trace) => {
          streamedTrace.push(trace);
          setThinkingLabel(`Tool completed: ${trace.tool}`);
          setLiveTrace((prev) =>
            upsertTraceStep(prev, {
              id: `${runId}-tool-${trace.tool}`,
              label: trace.tool.replace(/_/g, " "),
              detail: trace.ok ? `Returned ${shortJson(trace.output, 80)}` : `Failed: ${shortJson(trace.output, 80)}`,
              status: trace.ok ? "done" : "failed",
            }),
          );
        },
        onToken: (token) => {
          setThinkingLabel("Writing response");
          setStreamingDraft((prev) => `${prev}${token}`);
        },
        onFinal: (result) => {
          setThinkingLabel("Finalizing response");
          finalResult.current = result;
        },
      });

      if (!finalResult.current) throw new Error("The stream ended before the final agent result arrived.");

      const data = finalResult.current;
      const nextTrace = Array.isArray(data.toolTrace) ? data.toolTrace : streamedTrace;
      const nextEvents = Array.isArray(data.harnessEvents) ? data.harnessEvents : streamedEvents;
      const previousState = state;
      const nextState = data.updatedState;
      setState(nextState);

      const steps = ["planning", ...nextEvents.map((ev) => ev.stage), ...nextTrace.map((tool) => `tool:${tool.tool}`), "response"];
      const traceItems = traceFromResponse(runId, nextEvents, nextTrace);
      updateRun(runId, {
        steps,
        toolCount: nextTrace.length,
        diffs: summarizeDiff(previousState, nextState),
        reasoning:
          Array.isArray(data.reasoningTrace) && data.reasoningTrace.length > 0
            ? data.reasoningTrace
            : nextEvents.map((ev) => `${ev.title}: ${ev.detail}`),
        assistantMessage: data.assistantMessage,
      });

      const blocked = nextEvents.some((ev) => !ev.ok) || nextTrace.some((tool) => !tool.ok);
      const durationMs = Math.round(window.performance.now() - (runStartedAtRef.current[runId] ?? window.performance.now()));
      setLiveTrace([
        { id: `${runId}-done-agent`, label: "Agent", detail: `LangGraph returned ${nextEvents.length} events`, status: "done" },
        { id: `${runId}-done-tools`, label: "Tools", detail: `${nextTrace.length} tool call(s) recorded`, status: "done" },
        { id: `${runId}-done-state`, label: "State", detail: summarizeDiff(previousState, nextState).join(", ") || "No state change", status: "done" },
        { id: `${runId}-done-response`, label: "Response", detail: "Customer-facing answer is ready", status: "active" },
      ]);
      await sleep(220);

      setTimeline((prev) => [
        ...prev,
        {
          id: `run-summary-${runId}`,
          kind: "run-summary",
          title: "Reasoning Trace",
          status: blocked ? "blocked" : "done",
          detail: `${nextEvents.length} events`,
          durationMs,
          toolCount: nextTrace.length,
          steps,
          trace: traceItems,
        },
        { id: `msg-assistant-${runId}`, kind: "message", role: "assistant", content: data.assistantMessage },
      ]);
      setThinkingLabel(blocked ? "Completed with issues" : "Response ready");

      updateRun(runId, {
        status: blocked ? "blocked" : "done",
        durationMs,
      });
      void refreshConversationIndex();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "I could not complete that turn. Please try again.";
      setThinkingLabel("Hit a snag while processing");
      setLiveTrace((prev) => prev.map((step) => (step.status === "active" ? { ...step, status: "failed", detail: errorMessage } : step)));
      setTimeline((prev) => [...prev, { id: `msg-assistant-error-${runId}`, kind: "message", role: "assistant", content: errorMessage }]);
      updateRun(runId, { status: "failed", durationMs: Math.round(window.performance.now() - (runStartedAtRef.current[runId] ?? window.performance.now())) });
    } finally {
      delete runStartedAtRef.current[runId];
      setLiveTrace([]);
      setStreamingDraft("");
      setLoading(false);
    }
  }

  const footerStatus = useMemo(() => state?.payment?.status ?? "not-started", [state?.payment?.status]);
  const pendingRuns = runs.filter((run) => run.status === "running" || run.status === "blocked").length;

  if (!mounted || !userId || !sessionId) return null;

  return (
    <div ref={containerRef} className="fixed right-4 bottom-4 z-50">
      {!open ? (
        <div className="chat-launcher-enter flex items-center gap-2">
          <button
            onClick={() => setOpen(true)}
            className="relative flex h-14 w-14 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-[0_14px_30px_-16px_rgba(0,0,0,0.55)] transition hover:scale-[1.03]"
            aria-label="Open shopping assistant"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
            </svg>
            {pendingRuns > 0 ? (
              <span className="absolute -top-1 -right-1 min-w-5 rounded-full bg-rose-500 px-1 py-0.5 text-center text-[10px] font-bold leading-none text-white">
                {pendingRuns}
              </span>
            ) : null}
            <span className="chat-pulse-ring absolute inset-0 rounded-full" aria-hidden="true" />
          </button>
          <span className="app-surface app-muted rounded-full px-3 py-1.5 text-xs font-medium shadow-[0_10px_24px_-18px_rgba(0,0,0,0.5)]">
            Ask Moringa
          </span>
        </div>
      ) : null}

      {open ? (
        <div className="chat-panel-enter flex h-[74vh] w-[min(92vw,860px)] flex-col overflow-hidden rounded-xl app-surface shadow-2xl">
          <div className="flex items-center justify-between border-b border-black/5 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <p className="text-sm font-semibold">Moringa Assistant</p>
              <span className="app-muted text-xs">Agent Harness</span>
            </div>
            <button onClick={() => setOpen(false)} className="app-soft rounded-md px-2 py-1 text-xs font-medium">
              Close
            </button>
          </div>

          <div className="flex min-h-0 flex-1 flex-col p-3">
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="h-0 min-h-0 flex-1">
                <ChatTimeline
                  timeline={timeline}
                  transientTrace={liveTrace}
                  streaming={loading || replaying}
                  thinkingLabel={thinkingLabel}
                  nextStepDisabled={loading || paused}
                  onNextStepClick={(value) => void sendMessage(value)}
                />
              </div>

              <div className="mt-3 shrink-0 rounded-lg app-soft p-2">
                <div className="mb-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px]">
                  <span className="app-muted">Workflow: <span className="font-medium text-[var(--foreground)]">{state?.workflowStep?.replace(/_/g, " ") ?? "browsing"}</span></span>
                  <span className="app-muted">Mode: <span className="font-medium text-[var(--foreground)]">{state?.harness?.currentMode ?? "Talking"}</span></span>
                  <span className="app-muted">Cart: <span className="font-medium text-[var(--foreground)]">{state?.cart.totalCents ?? 0}c</span></span>
                  <span className="app-muted">Payment: <span className={`font-medium ${statusTone(footerStatus)}`}>{footerStatus}</span></span>
                  <span className="app-muted">Loop: <span className="font-medium text-[var(--foreground)]">{state?.harness?.loopCount ?? 0}</span></span>
                </div>

                <div className="flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void sendMessage(chatInput);
                  }}
                    placeholder={paused ? "Assistant paused..." : "Ask for product recommendations or continue checkout..."}
                    className="app-soft flex-1 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2"
                    disabled={paused}
                  />
                  <button
                    onClick={() => void startNewConversation()}
                    disabled={loading || sessionLoading}
                    className="app-soft inline-flex h-10 w-10 items-center justify-center rounded-lg text-[var(--foreground)] disabled:opacity-50"
                    aria-label="Start new chat"
                    title="New Chat"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M12 5v14" />
                      <path d="M5 12h14" />
                    </svg>
                  </button>
                  <button onClick={() => void sendMessage(chatInput)} disabled={loading || paused} className="rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
                    {loading ? "..." : "Send"}
                  </button>
                </div>
              </div>

              <div className="mt-3 shrink-0 flex flex-wrap items-center gap-1.5">
                <div className="app-soft rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  <label htmlFor="response-style">Style</label>
                  <select
                    id="response-style"
                    value={responseStyle}
                    onChange={(e) => {
                      const next = e.target.value as "brief" | "standard" | "detailed";
                      setResponseStyle(next);
                      localStorage.setItem("demo_response_style", next);
                    }}
                    className="ml-1 rounded app-surface px-1 py-0 text-[10px]"
                  >
                    <option value="brief">Brief</option>
                    <option value="standard">Standard</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>

                <div className="app-soft rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide">
                  <label htmlFor="reasoning-effort">Reasoning</label>
                  <select
                    id="reasoning-effort"
                    value={reasoningEffort}
                    onChange={(e) => {
                      const next = e.target.value as ReasoningEffort;
                      setReasoningEffort(next);
                      localStorage.setItem("demo_reasoning_effort", next);
                    }}
                    className="ml-1 rounded app-surface px-1 py-0 text-[10px]"
                  >
                    <option value="none">None</option>
                    <option value="minimal">Minimal</option>
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="xhigh">XHigh</option>
                  </select>
                </div>

                <div ref={sessionMenuRef} className="relative">
                  <button
                    onClick={() => {
                      setSessionMenuOpen((prev) => !prev);
                      setActionsMenuOpen(false);
                      setReasoningMenuOpen(false);
                      setRunsMenuOpen(false);
                    }}
                    className="rounded-md bg-[color-mix(in_oklab,var(--surface-soft)_86%,var(--surface)_14%)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"
                  >
                    Session History ({conversations.length})
                  </button>
                  {sessionMenuOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-[360px] max-w-[78vw] rounded-md app-surface p-2 shadow-2xl">
                      <div className="mb-2 flex items-center justify-between">
                        <p className="app-muted text-[11px] font-semibold uppercase tracking-wide">Sessions</p>
                        <button
                          onClick={() => void startNewConversation()}
                          disabled={loading || sessionLoading}
                          className="app-soft rounded-md px-2 py-1 text-[11px] font-semibold uppercase disabled:opacity-50"
                        >
                          New Conversation
                        </button>
                      </div>
                      <ConversationList
                        conversations={conversations}
                        sessionId={sessionId}
                        loading={loading}
                        sessionLoading={sessionLoading}
                        onNew={() => void startNewConversation()}
                        onOpen={(conversation) => void openConversation(conversation)}
                        onDelete={(id) => void deleteConversation(id)}
                      />
                    </div>
                  ) : null}
                </div>

                <div ref={actionsMenuRef} className="relative">
                  <button
                    onClick={() => {
                      setActionsMenuOpen((prev) => !prev);
                      setSessionMenuOpen(false);
                      setReasoningMenuOpen(false);
                      setRunsMenuOpen(false);
                    }}
                    className="rounded-md bg-[color-mix(in_oklab,var(--surface-soft)_86%,var(--surface)_14%)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300"
                  >
                    Actions
                  </button>
                  {actionsMenuOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-56 rounded-md app-surface p-2 shadow-2xl">
                      <div className="flex flex-col gap-1 text-xs">
                        <button onClick={() => setPaused(true)} disabled={paused} className="app-soft rounded-md px-2.5 py-1 text-left font-medium disabled:opacity-50">
                          Pause
                        </button>
                        <button onClick={() => setPaused(false)} disabled={!paused} className="app-soft rounded-md px-2.5 py-1 text-left font-medium disabled:opacity-50">
                          Resume
                        </button>
                        <button
                          onClick={() => void sendMessage("I need a human agent to help with this checkout")}
                          disabled={loading || paused}
                          className="app-soft rounded-md px-2.5 py-1 text-left font-medium disabled:opacity-50"
                        >
                          Escalate
                        </button>
                        <button onClick={() => void sendMessage(lastPrompt)} disabled={loading || paused || !lastPrompt} className="app-soft rounded-md px-2.5 py-1 text-left font-medium disabled:opacity-50">
                          Retry
                        </button>
                        <button onClick={() => void replaySession()} disabled={replaying || runs.length === 0} className="app-soft rounded-md px-2.5 py-1 text-left font-medium disabled:opacity-50">
                          {replaying ? "Replaying..." : "Replay Session"}
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>

                <div ref={reasoningMenuRef} className="relative">
                  <button
                    onClick={() => {
                      setReasoningMenuOpen((prev) => !prev);
                      setSessionMenuOpen(false);
                      setActionsMenuOpen(false);
                      setRunsMenuOpen(false);
                    }}
                    className="rounded-md bg-[color-mix(in_oklab,var(--surface-soft)_86%,var(--surface)_14%)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300"
                  >
                    Reasoning
                  </button>
                  {reasoningMenuOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-[340px] max-w-[78vw] rounded-md app-surface p-2 shadow-2xl">
                      <p className="app-muted mb-1 text-[10px] font-bold uppercase tracking-wide">Live Trace</p>
                      <div className="max-h-[26vh] space-y-1 overflow-y-auto pr-1">
                        {liveTrace.length === 0 ? (
                          runs[0]?.reasoning?.length ? (
                            runs[0].reasoning.map((entry, index) => (
                              <div key={`reasoning-${index}`} className="app-soft rounded-md px-2 py-1.5 text-[11px]">
                                <p className="font-semibold">Reasoning summary {index + 1}</p>
                                <p className="app-muted text-[10px]">{entry}</p>
                              </div>
                            ))
                          ) : (
                            <p className="app-muted text-xs">No active reasoning trace.</p>
                          )
                        ) : (
                          liveTrace.map((step) => (
                            <div key={step.id} className="app-soft rounded-md px-2 py-1.5 text-[11px]">
                              <p className="font-semibold">{step.label}</p>
                              <p className="app-muted text-[10px]">{step.detail}</p>
                            </div>
                          ))
                        )}
                      </div>
                      {streamingDraft ? (
                        <div className="mt-2 rounded-md app-soft px-2 py-1.5">
                          <p className="app-muted text-[10px] font-bold uppercase tracking-wide">Streaming</p>
                          <p className="mt-1 text-xs">{streamingDraft}</p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div ref={runsMenuRef} className="relative">
                  <button
                    onClick={() => {
                      setRunsMenuOpen((prev) => !prev);
                      setSessionMenuOpen(false);
                      setActionsMenuOpen(false);
                      setReasoningMenuOpen(false);
                    }}
                    className="rounded-md bg-[color-mix(in_oklab,var(--surface-soft)_86%,var(--surface)_14%)] px-2 py-0.5 text-[8px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300"
                  >
                    Runs ({runs.length})
                  </button>
                  {runsMenuOpen ? (
                    <div className="absolute bottom-full left-0 z-20 mb-2 w-[360px] max-w-[78vw] rounded-md app-surface p-2 shadow-2xl">
                      <div className="max-h-[30vh] space-y-1.5 overflow-y-auto pr-1">
                        {runs.length === 0 && <p className="app-muted text-xs">No runs yet.</p>}
                        {runs.slice(0, 8).map((run) => (
                          <details key={run.id} className="app-soft rounded-md px-2 py-1.5">
                            <summary className="cursor-pointer text-[11px] font-semibold">
                              {run.status.toUpperCase()} · {run.prompt.slice(0, 28)}
                              {run.prompt.length > 28 ? "..." : ""}
                            </summary>
                            <div className="app-muted mt-1 space-y-1 text-[10px]">
                              <p>duration: {run.durationMs ?? 0}ms · tools: {run.toolCount}</p>
                              <p className="font-mono">steps: {run.steps.join(" -> ")}</p>
                              <p className="font-semibold text-slate-600">Changes</p>
                              {run.diffs.length === 0 ? <p>no state changes</p> : run.diffs.map((d) => <p key={d}>- {d}</p>)}
                              {run.status === "failed" || run.status === "blocked" ? (
                                <button
                                  onClick={() => void sendMessage(run.prompt)}
                                  disabled={loading || paused}
                                  className="app-surface mt-1 rounded px-2 py-1 text-[10px] font-semibold uppercase disabled:opacity-50"
                                >
                                  Retry This Run
                                </button>
                              ) : null}
                            </div>
                          </details>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
