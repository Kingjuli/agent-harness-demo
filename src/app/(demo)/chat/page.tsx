"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Card, SectionTitle } from "@/components/ui";
import type { AgentMessage, AgentTurnResult, SessionState, Product, ConversationSummary, ConversationDetail } from "@/lib/types/domain";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { formatCurrency } from "@/lib/utils/money";

type ChatMessage = Pick<AgentMessage, "role" | "content">;
type AgentChatResponse = AgentTurnResult | { error?: string };
type SessionApiError = { error?: string };
type SessionListResponse = { sessions?: ConversationSummary[] } & SessionApiError;
type SessionDetailResponse = ConversationDetail & SessionApiError;
type HarnessPhase = "Talking" | "Planning" | "Executing" | "Blocked" | "Recovering";
type TimelineItem =
  | { id: string; kind: "message"; role: "user" | "assistant"; content: string }
  | { id: string; kind: "event"; stage: string; title: string; detail: string; ok: boolean }
  | { id: string; kind: "tool"; tool: string; ok: boolean; reason?: string; input: unknown; output: unknown };

function isAgentTurnResult(data: AgentChatResponse): data is AgentTurnResult {
  return "assistantMessage" in data && "updatedState" in data;
}

const DEMO_PRESETS = [
  {
    title: "Product intent",
    label: "Talk",
    prompt: "I need a blue hoodie in size M",
    note: "Model captures preference; harness checks catalog before promising.",
  },
  {
    title: "Checkout block",
    label: "Block",
    prompt: "Checkout now",
    note: "Guardrail should pause until required customer details exist.",
  },
  {
    title: "Recover details",
    label: "Recover",
    prompt: "My name is Amina Wanjiku, email amina@example.com, phone +254712345678, address Westlands, Nairobi",
    note: "Harness updates state and moves toward order creation.",
  },
  {
    title: "Payment gate",
    label: "Execute",
    prompt: "Pay now",
    note: "Payment only starts after explicit user confirmation.",
  },
  {
    title: "Human handoff",
    label: "Escalate",
    prompt: "I need a human agent to help with this checkout",
    note: "Harness preserves context and creates support handoff.",
  },
];

function categoryImage(category: Product["category"]): string {
  if (category === "hoodie") return "/products/hoodie.svg";
  if (category === "tshirt") return "/products/tshirt.svg";
  if (category === "jacket") return "/products/jacket.svg";
  return "/products/dress.svg";
}

function statusTone(status: string) {
  if (status === "success" || status === "payment_completed") return "bg-emerald-100 text-emerald-700";
  if (status === "pending" || status === "payment_pending") return "bg-amber-100 text-amber-700";
  if (status === "blocked" || status === "failed" || status === "error") return "bg-rose-100 text-rose-700";
  return "bg-slate-100 text-slate-700";
}

function eventTone(ok: boolean) {
  return ok ? "border-teal-200 bg-teal-50 text-teal-900" : "border-rose-200 bg-rose-50 text-rose-900";
}

function compactJson(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function shortJson(value: unknown, max = 140) {
  const text = compactJson(value).replace(/\s+/g, " ");
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function phaseTone(phase: HarnessPhase, active: boolean) {
  if (!active) return "border-slate-200 bg-white text-slate-500";
  if (phase === "Blocked") return "border-rose-200 bg-rose-50 text-rose-800";
  if (phase === "Recovering") return "border-amber-200 bg-amber-50 text-amber-800";
  if (phase === "Executing") return "border-teal-200 bg-teal-50 text-teal-800";
  return "border-slate-300 bg-slate-900 text-white";
}

function describeHarnessPhase(phase: HarnessPhase) {
  if (phase === "Talking") return "Model reads the customer request and responds in checkout language.";
  if (phase === "Planning") return "Harness converts intent into a short, inspectable next-step plan.";
  if (phase === "Executing") return "Harness calls tools and writes state only after checks pass.";
  if (phase === "Blocked") return "Guardrails pause the workflow when required data or consent is missing.";
  return "Harness keeps state, records the issue, and asks for the next safe input.";
}

export default function StorefrontPage() {
  const [sessionId, setSessionId] = useState<string>(() => (typeof window === "undefined" ? "" : (localStorage.getItem("demo_session_id") ?? "")));
  const [userId] = useState<string>(() => (typeof window === "undefined" ? "" : (localStorage.getItem("demo_user_id") ?? "")));
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [state, setState] = useState<SessionState | null>(null);
  const [trace, setTrace] = useState<AgentTurnResult["toolTrace"]>([]);
  const [events, setEvents] = useState<AgentTurnResult["harnessEvents"]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!sessionId || !userId) router.push("/start");
  }, [router, sessionId, userId]);

  useEffect(() => {
    if (!userId || !sessionId) return;

    let cancelled = false;

    async function loadSelectedConversation() {
      setSessionLoading(true);
      try {
        const res = await fetch(`/api/sessions/${sessionId}`);
        if (res.ok) {
          const data = (await res.json()) as SessionDetailResponse;
          if (!cancelled && "sessionId" in data) {
            setState(data.state);
            const nextMessages = data.messages.filter((m) => m.role === "user" || m.role === "assistant");
            setMessages(nextMessages);
            hydrateTimelineFromMessages(nextMessages);
          }
          return;
        }

        const initRes = await fetch("/api/session/init", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        });
        const data = (await initRes.json()) as SessionDetailResponse;
        if (!cancelled && "sessionId" in data) {
          setSessionId(data.sessionId);
          localStorage.setItem("demo_session_id", data.sessionId);
          setState(data.state);
          const nextMessages = data.messages.filter((m) => m.role === "user" || m.role === "assistant");
          setMessages(nextMessages);
          hydrateTimelineFromMessages(nextMessages);
        }
      } finally {
        if (!cancelled) setSessionLoading(false);
      }
    }

    async function loadConversationIndex() {
      const res = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`);
      const data = (await res.json()) as SessionListResponse;
      if (!cancelled && Array.isArray(data.sessions)) {
        setConversations(data.sessions);
      }
    }

    void loadSelectedConversation();
    void loadConversationIndex();

    return () => {
      cancelled = true;
    };
  }, [sessionId, userId]);

  const featuredCatalog = useMemo(() => PRODUCT_CATALOG.slice(0, 8), []);
  const activePhases = useMemo(() => {
    const phases = new Set<HarnessPhase>();
    if (messages.length > 0 || loading) phases.add("Talking");
    if ((state?.harness?.lastPlan ?? []).length > 0 || events.some((ev) => ev.stage === "plan")) phases.add("Planning");
    if (trace.length > 0 || events.some((ev) => ev.stage === "tool")) phases.add("Executing");
    if ((state?.harness?.lastPlan ?? []).some((step) => step.status === "blocked") || events.some((ev) => ev.stage === "guardrail" && !ev.ok)) {
      phases.add("Blocked");
    }
    if ((state?.harness?.recoveryNotes ?? []).length > 0 || events.some((ev) => ev.stage === "recovery")) phases.add("Recovering");
    return phases;
  }, [events, loading, messages.length, state?.harness?.lastPlan, state?.harness?.recoveryNotes, trace.length]);

  function hydrateTimelineFromMessages(nextMessages: ChatMessage[]) {
    setTimeline(
      nextMessages.map((message, index): TimelineItem => ({
        id: `history-${index}`,
        kind: "message",
        role: message.role === "assistant" ? "assistant" : "user",
        content: message.content,
      })),
    );
  }

  async function refreshConversationIndex(nextSessionId = sessionId) {
    if (!userId) return;
    const res = await fetch(`/api/sessions?userId=${encodeURIComponent(userId)}`);
    const data = (await res.json()) as SessionListResponse;
    if (Array.isArray(data.sessions)) {
      setConversations(data.sessions);
    }
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
      const nextMessages = data.messages.filter((m) => m.role === "user" || m.role === "assistant");
      setMessages(nextMessages);
      hydrateTimelineFromMessages(nextMessages);
      setTrace([]);
      setEvents([]);
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
      setMessages([]);
      setTimeline([]);
      setTrace([]);
      setEvents([]);
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

      const nextSessionId = data.replacementSessionId ?? "";
      await refreshConversationIndex(nextSessionId);

      if (nextSessionId) {
        const detailRes = await fetch(`/api/sessions/${nextSessionId}`);
        if (detailRes.ok) {
          const detail = (await detailRes.json()) as SessionDetailResponse;
          if ("sessionId" in detail) {
            setState(detail.state);
            const nextMessages = detail.messages.filter((m) => m.role === "user" || m.role === "assistant");
            setMessages(nextMessages);
            hydrateTimelineFromMessages(nextMessages);
            setTrace([]);
            setEvents([]);
          }
        }
      }
    } finally {
      setLoading(false);
    }
  }

  async function sendMessage(text: string) {
    if (!text.trim() || !sessionId || loading) return;
    setLoading(true);
    const userText = text.trim();
    setMessages((prev) => [...prev, { role: "user", content: userText }]);
    setTimeline((prev) => [...prev, { id: `msg-user-${Date.now()}`, kind: "message", role: "user", content: userText }]);

    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userMessage: userText, maxTurns: 6 }),
      });
      const data = (await res.json()) as AgentChatResponse;

      if (!res.ok || !isAgentTurnResult(data)) {
        const errorMessage = "error" in data ? data.error : undefined;
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content: errorMessage ?? "I could not complete that turn. Please try again.",
          },
        ]);
        return;
      }

      setMessages((prev) => [...prev, { role: "assistant", content: data.assistantMessage }]);
      setState(data.updatedState);
      const nextTrace = Array.isArray(data.toolTrace) ? data.toolTrace : [];
      const nextEvents = Array.isArray(data.harnessEvents) ? data.harnessEvents : [];
      setTrace(nextTrace);
      setEvents(nextEvents);
      setTimeline((prev) => [
        ...prev,
        ...nextEvents.map((ev, idx) => ({
          id: `event-${Date.now()}-${idx}`,
          kind: "event" as const,
          stage: ev.stage,
          title: ev.title,
          detail: ev.detail,
          ok: ev.ok,
        })),
        ...nextTrace.map((tool, idx) => ({
          id: `tool-${Date.now()}-${idx}`,
          kind: "tool" as const,
          tool: tool.tool,
          ok: tool.ok,
          reason: tool.reason,
          input: tool.input,
          output: tool.output,
        })),
        { id: `msg-assistant-${Date.now()}`, kind: "message", role: "assistant", content: data.assistantMessage },
      ]);
      setChatInput("");
      void refreshConversationIndex();
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen px-4 py-6 md:px-6 md:py-8">
      <div className="mx-auto max-w-7xl">
        <div className="fade-rise mb-4 flex flex-wrap items-end justify-between gap-3 rounded-2xl border border-white/70 bg-gradient-to-r from-slate-900 to-teal-800 px-5 py-5 text-white">
          <div>
            <p className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-200">Live Demo</p>
            <h1 className="mt-1 text-2xl font-bold md:text-3xl">AI Apparel Storefront</h1>
            <p className="mt-1 text-sm text-teal-100">Customer checkout with live harness execution.</p>
          </div>
          <button
            onClick={() => {
              localStorage.removeItem("demo_session_id");
              localStorage.removeItem("demo_user_id");
              router.push("/start");
            }}
            className="rounded-full border border-white/30 bg-white/10 px-4 py-2 text-xs font-semibold tracking-wide uppercase transition hover:bg-white/20"
          >
            Switch User
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-12">
          <Card className="fade-rise md:col-span-4">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Conversations</SectionTitle>
              <button
                onClick={() => void startNewConversation()}
                disabled={loading || sessionLoading}
                className="rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
              >
                New
              </button>
            </div>

            <div className="mt-3 space-y-2">
              {conversations.length === 0 && <p className="text-sm text-slate-500">No saved conversations yet.</p>}
              {conversations.map((conversation) => {
                const selected = conversation.id === sessionId;
                return (
                  <div
                    key={conversation.id}
                    className={`rounded-xl border p-3 transition ${selected ? "border-teal-300 bg-teal-50/70" : "border-slate-200 bg-white"}`}
                  >
                    <button className="w-full text-left" onClick={() => void openConversation(conversation)} disabled={loading || sessionLoading}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{conversation.currentStep.replace(/_/g, " ")}</p>
                          <p className="mt-1 truncate text-xs text-slate-600">{conversation.preview}</p>
                        </div>
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                            conversation.isActive ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {conversation.isActive ? "Active" : "Saved"}
                        </span>
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{conversation.messageCount} messages</span>
                        <span>{new Date(conversation.updatedAt).toLocaleDateString()}</span>
                      </div>
                    </button>

                    <div className="mt-2 flex items-center justify-between">
                      <button
                        onClick={() => void openConversation(conversation)}
                        disabled={loading || sessionLoading}
                        className="text-[11px] font-semibold uppercase tracking-wide text-slate-600 transition hover:text-teal-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Open
                      </button>
                      <button
                        onClick={() => void deleteConversation(conversation.id)}
                        disabled={loading || sessionLoading}
                        className="text-[11px] font-semibold uppercase tracking-wide text-rose-600 transition hover:text-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">How it helps</p>
              <p className="mt-2 text-sm text-slate-600">
                Resume older sessions, branch into a fresh conversation, or delete a dead end without losing the active demo state.
              </p>
            </div>
          </Card>

          <Card className="fade-rise md:col-span-5">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Model Conversation</SectionTitle>
              <span className="rounded-full bg-slate-100 px-2 py-1 text-[11px] font-semibold text-slate-700">
                {sessionLoading ? "Loading session" : "Customer visible"}
              </span>
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {featuredCatalog.slice(0, 3).map((p) => (
                <button
                  key={p.sku}
                  onClick={() => sendMessage(`I want ${p.color} ${p.category} size ${p.size}`)}
                  disabled={loading}
                  className="overflow-hidden rounded-xl border border-slate-200 bg-white text-left transition hover:border-teal-300 hover:bg-teal-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <div className="relative h-24 w-full">
                    <Image src={categoryImage(p.category)} alt={p.name} fill className="object-cover" sizes="(max-width: 768px) 100vw, 220px" />
                  </div>
                  <div className="p-3">
                    <p className="text-sm font-semibold text-slate-900">{p.name}</p>
                    <p className="text-xs text-slate-600">
                      {p.color} / {p.size}
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">{formatCurrency(p.priceCents)}</p>
                  </div>
                </button>
              ))}
            </div>

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {DEMO_PRESETS.slice(0, 3).map((preset) => (
                <button
                  key={preset.title}
                  onClick={() => sendMessage(preset.prompt)}
                  disabled={loading}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left transition hover:border-teal-300 hover:bg-teal-50/60 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-slate-900">{preset.title}</span>
                    <span className="shrink-0 rounded-full bg-slate-900 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{preset.label}</span>
                  </span>
                  <span className="mt-1 block text-xs text-slate-500">{preset.prompt}</span>
                  <span className="mt-2 block text-[11px] leading-4 text-slate-400">{preset.note}</span>
                </button>
              ))}
            </div>

            <div className="mt-3 h-[330px] overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              {timeline.length === 0 && <p className="text-sm text-slate-500">No messages yet.</p>}
              <div className="space-y-2">
                {timeline.map((item) => {
                  if (item.kind === "message") {
                    return (
                      <div key={item.id} className={item.role === "user" ? "text-right" : "text-left"}>
                        <span
                          className={
                            item.role === "user"
                              ? "inline-block rounded-2xl rounded-br-sm bg-teal-600 px-3 py-2 text-sm text-white"
                              : "inline-block rounded-2xl rounded-bl-sm border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                          }
                        >
                          {item.content}
                        </span>
                      </div>
                    );
                  }

                  if (item.kind === "event") {
                    return (
                      <div key={item.id} className="text-left">
                        <div className={`inline-block max-w-[95%] rounded-xl border px-3 py-2 ${eventTone(item.ok)}`}>
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em]">
                            Harness {item.stage}
                          </p>
                          <p className="mt-1 text-sm font-semibold">{item.title}</p>
                          <p className="mt-1 text-xs opacity-80">{item.detail}</p>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <div key={item.id} className="text-left">
                      <div className="inline-block max-w-[95%] rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-900">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">Tool</p>
                          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${item.ok ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                            {item.ok ? "ok" : "failed"}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-semibold">{item.tool}</p>
                        {item.reason && <p className="mt-1 text-xs text-slate-500">{item.reason}</p>}
                        <p className="mt-1 text-xs text-slate-500">in: {shortJson(item.input, 90)}</p>
                        <p className="mt-1 text-xs text-slate-500">out: {shortJson(item.output, 90)}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-3 flex gap-2">
              <input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") sendMessage(chatInput);
                }}
                placeholder="Ask for product recommendations or continue checkout..."
                className="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-teal-300 focus:ring-2"
              />
              <button
                onClick={() => sendMessage(chatInput)}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-700"
                disabled={loading}
              >
                {loading ? "..." : "Send"}
              </button>
            </div>
          </Card>

          <Card className="fade-rise md:col-span-3">
            <div className="flex items-center justify-between gap-3">
              <SectionTitle>Harness Control</SectionTitle>
              <span className="rounded-full bg-slate-900 px-2 py-1 text-[11px] font-semibold text-white">Loop {state?.harness?.loopCount ?? 0}</span>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-slate-500">Step</p>
                <p className="mt-1 break-words font-semibold text-slate-900">{state?.workflowStep ?? "browsing"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-slate-500">Intent</p>
                <p className="mt-1 break-words font-semibold text-slate-900">{state?.harness?.lastIntent ?? "new_session"}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-slate-500">Cart</p>
                <p className="mt-1 font-semibold text-slate-900">{formatCurrency(state?.cart.totalCents ?? 0)}</p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-white p-3">
                <p className="text-slate-500">Payment</p>
                <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(state?.payment?.status ?? "not-started")}`}>
                  {state?.payment?.status ?? "not-started"}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Demo Story</p>
              <div className="grid gap-2">
                {(["Talking", "Planning", "Executing", "Blocked", "Recovering"] as HarnessPhase[]).map((phase) => {
                  const active = activePhases.has(phase);
                  return (
                    <div key={phase} className={`rounded-xl border px-3 py-2 ${phaseTone(phase, active)}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-semibold">{phase}</p>
                        <span className="text-[10px] font-bold uppercase tracking-wide">{active ? "seen" : "waiting"}</span>
                      </div>
                      <p className="mt-1 text-[11px] leading-4 opacity-80">{describeHarnessPhase(phase)}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-slate-200 bg-white p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Execution in chat</p>
              <p className="mt-2 text-xs leading-5 text-slate-600">
                Harness events and tool calls are now rendered inline in the conversation stream so attendees can follow each step in order.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
