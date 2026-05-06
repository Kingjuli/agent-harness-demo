import { memo, useEffect, useMemo, useRef, useState, type TouchEvent, type WheelEvent } from "react";
import { shortJson, type TimelineItem } from "@/components/chat/types";

function parseNextSteps(content: string) {
  const nextSteps: string[] = [];
  const cleaned = content
    .replace(/<next_step>([\s\S]*?)<\/next_step>/gi, (_, rawStep: string) => {
      const step = rawStep.trim().replace(/\s+/g, " ");
      if (step) nextSteps.push(step);
      return "";
    })
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { cleaned, nextSteps };
}

const EventChip = memo(function EventChip({ item }: { item: Extract<TimelineItem, { kind: "event" }> }) {
  return (
    <div className="text-left">
      <div className="inline-block max-w-[95%] rounded-md app-soft px-3 py-1.5 text-xs">
        <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${item.ok ? "bg-emerald-500" : "bg-rose-500"}`} />
        <span className="font-semibold uppercase tracking-wide">{item.stage}</span>
        <span className="mx-1 app-muted">·</span>
        <span>{item.title}</span>
        {item.detail ? <span className="app-muted"> - {item.detail}</span> : null}
      </div>
    </div>
  );
});

const ToolChip = memo(function ToolChip({ item }: { item: Extract<TimelineItem, { kind: "tool" }> }) {
  const [copied, setCopied] = useState(false);
  const inputText = useMemo(() => shortJson(item.input, 5000), [item.input]);
  const outputText = useMemo(() => shortJson(item.output, 5000), [item.output]);

  async function copyPayload() {
    const text = `tool: ${item.tool}\nstatus: ${item.ok ? "ok" : "failed"}\ninput: ${inputText}\noutput: ${outputText}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="text-left">
      <details className="inline-block max-w-[95%] rounded-md app-soft px-2.5 py-1.5 text-xs">
        <summary className="flex cursor-pointer list-none items-center gap-2">
          <span className="font-mono font-semibold">{item.tool}</span>
          <span className={item.ok ? "text-emerald-600" : "text-rose-600"}>{item.ok ? "ok" : "failed"}</span>
          {item.reason ? <span className="app-muted truncate">- {item.reason}</span> : null}
          <span className="app-muted">in/out</span>
        </summary>
        <div className="mt-1.5 space-y-1">
          <div className="app-muted rounded-md app-surface px-2 py-1 font-mono text-[10px] break-words">in: {inputText}</div>
          <div className="app-muted rounded-md app-surface px-2 py-1 font-mono text-[10px] break-words">out: {outputText}</div>
          <button onClick={copyPayload} className="app-soft rounded px-2 py-1 text-[10px] font-semibold uppercase tracking-wide">
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </details>
    </div>
  );
});

export function ChatTimeline({
  timeline,
  transientTrace = [],
  streaming = false,
  thinkingLabel = "",
  onNextStepClick,
  nextStepDisabled = false,
}: {
  timeline: TimelineItem[];
  transientTrace?: Array<{
    id: string;
    label: string;
    detail: string;
    status: "done" | "active" | "waiting" | "failed";
  }>;
  streaming?: boolean;
  thinkingLabel?: string;
  onNextStepClick?: (value: string) => void;
  nextStepDisabled?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const endRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!stickToBottom && !streaming) return;
    const raf = requestAnimationFrame(() => {
      endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
    });
    return () => cancelAnimationFrame(raf);
  }, [timeline, transientTrace, thinkingLabel, stickToBottom, streaming]);

  function handleScroll() {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setStickToBottom(distanceFromBottom < 28);
  }

  function handleWheelCapture(event: WheelEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  function handleTouchMoveCapture(event: TouchEvent<HTMLDivElement>) {
    event.stopPropagation();
  }

  const rendered = useMemo(
    () =>
      timeline.map((item) => {
        if (item.kind === "message") {
          const parsed = item.role === "assistant" ? parseNextSteps(item.content) : { cleaned: item.content, nextSteps: [] };
          return (
            <div key={item.id} className={item.role === "user" ? "text-right" : "text-left"}>
              <span
                className={
                  item.role === "user"
                    ? "inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-[var(--accent)] px-3 py-2 text-sm leading-relaxed text-white"
                    : "inline-block max-w-[92%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md app-soft px-3 py-2 text-sm leading-relaxed"
                }
              >
                {parsed.cleaned}
              </span>
              {item.role === "assistant" && parsed.nextSteps.length > 0 ? (
                <div className="mt-2 flex max-w-[92%] flex-wrap gap-1.5">
                  {parsed.nextSteps.map((step, index) => (
                    <button
                      key={`${item.id}-next-${index}`}
                      onClick={() => onNextStepClick?.(step)}
                      disabled={nextStepDisabled}
                      className="rounded-full app-soft px-2.5 py-1 text-xs font-medium hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {step}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          );
        }

        if (item.kind === "event") {
          return <EventChip key={item.id} item={item} />;
        }

        if (item.kind === "tool") {
          return <ToolChip key={item.id} item={item} />;
        }

        return (
          <details key={item.id} className="group rounded-lg bg-[color-mix(in_oklab,var(--surface-soft)_88%,var(--surface)_12%)] p-2.5">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-xs">
              <span className="mt-0.5 inline-flex h-4 w-4 items-center justify-center rounded-sm app-surface">
                <svg
                  viewBox="0 0 20 20"
                  className="h-3 w-3 transition-transform group-open:rotate-90"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M7 4l6 6-6 6" />
                </svg>
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{item.title}</span>
                <span className="app-muted">{item.detail}</span>
                <span className={`font-semibold uppercase tracking-wide ${item.status === "failed" || item.status === "blocked" ? "text-rose-600" : "text-emerald-600"}`}>
                  {item.status}
                </span>
                <span className="app-muted">{item.toolCount} tools · {item.durationMs ?? 0}ms</span>
              </span>
            </summary>
            <div className="mt-2 space-y-2 pt-1">
              <p className="app-muted text-[11px] font-mono">{item.steps.join(" -> ")}</p>
              {item.trace.map((traceItem) => {
                if (traceItem.kind === "event") return <EventChip key={traceItem.id} item={traceItem} />;
                if (traceItem.kind === "tool") return <ToolChip key={traceItem.id} item={traceItem} />;
                return null;
              })}
            </div>
          </details>
        );
      }),
    [nextStepDisabled, onNextStepClick, timeline],
  );

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      onWheelCapture={handleWheelCapture}
      onTouchMoveCapture={handleTouchMoveCapture}
      className="app-soft h-full min-h-0 overflow-y-auto overscroll-contain rounded-lg p-3"
    >
      {timeline.length === 0 && <p className="app-muted text-sm">No messages yet.</p>}
      <div className="space-y-2.5">
        {rendered}
        {streaming && transientTrace.length > 0 ? (
          <div className="space-y-1.5">
            {transientTrace.map((step) => (
              <div key={step.id} className="text-left">
                <div className="inline-flex max-w-[95%] items-center gap-2 rounded-md app-soft px-2.5 py-1 text-xs">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      step.status === "failed" ? "bg-rose-500" : step.status === "active" ? "bg-[var(--accent)] animate-pulse" : "bg-emerald-500"
                    }`}
                  />
                  <span className="font-semibold">{step.label}</span>
                  <span className="app-muted">- {step.detail}</span>
                </div>
              </div>
            ))}
          </div>
        ) : null}
        {thinkingLabel ? (
          <div className="text-left">
            <div className="inline-flex items-center gap-2 rounded-full app-soft px-3 py-1 text-xs">
              <span className={`h-2 w-2 rounded-full bg-[var(--accent)] ${streaming ? "animate-pulse" : ""}`} />
              <span className="app-muted">{thinkingLabel}</span>
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>
    </div>
  );
}
