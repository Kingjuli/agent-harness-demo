import Image from "next/image";
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

function money(cents: number, currency: "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(cents / 100);
}

function categoryImage(category: "hoodie" | "tshirt" | "jacket" | "dress"): string {
  if (category === "hoodie") return "/products/hoodie.svg";
  if (category === "tshirt") return "/products/tshirt.svg";
  if (category === "jacket") return "/products/jacket.svg";
  return "/products/dress.svg";
}

const CartCard = memo(function CartCard({ item }: { item: Extract<TimelineItem, { kind: "card"; cardType: "cart" }> }) {
  return (
    <div className="text-left">
      <div className="inline-block w-full max-w-[95%] rounded-xl border border-black/10 bg-white/90 p-3 dark:border-white/10 dark:bg-black/20">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">Cart</h4>
          <span className="rounded-full app-soft px-2 py-0.5 text-[11px]">{item.data.itemCount} item(s)</span>
        </div>
        {item.data.items.length === 0 ? (
          <p className="app-muted text-sm">Your cart is empty.</p>
        ) : (
          <div className="space-y-1.5">
            {item.data.items.map((line, idx) => (
              <div key={`${line.sku}-${idx}`} className="flex items-start justify-between gap-3 text-sm">
                <div>
                  <p className="font-medium">{line.name}</p>
                  <p className="app-muted text-xs">{line.color} · {line.size} · qty {line.quantity}</p>
                </div>
                <p className="font-semibold">{money(line.unitPriceCents * line.quantity, item.data.currency)}</p>
              </div>
            ))}
            <div className="mt-2 border-t border-black/10 pt-2 text-sm dark:border-white/10">
              <div className="flex justify-between"><span className="app-muted">Subtotal</span><span>{money(item.data.subtotalCents, item.data.currency)}</span></div>
              <div className="flex justify-between"><span className="app-muted">Shipping</span><span>{money(item.data.shippingCents, item.data.currency)}</span></div>
              <div className="mt-1 flex justify-between font-semibold"><span>Total</span><span>{money(item.data.totalCents, item.data.currency)}</span></div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
});

const ProductListCard = memo(function ProductListCard({
  item,
  onProductPick,
  disabled = false,
}: {
  item: Extract<TimelineItem, { kind: "card"; cardType: "product-list" }>;
  onProductPick?: (message: string) => void;
  disabled?: boolean;
}) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  function refreshScrollState() {
    if (!railRef.current) return;
    const el = railRef.current;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  useEffect(() => {
    refreshScrollState();
  }, [item.data.products.length]);

  function scrollRail(direction: "left" | "right") {
    if (!railRef.current) return;
    const delta = direction === "left" ? -220 : 220;
    railRef.current.scrollBy({ left: delta, behavior: "smooth" });
    window.setTimeout(refreshScrollState, 220);
  }

  return (
    <div className="text-left">
      <div className="inline-block w-full max-w-[95%] rounded-xl border border-black/10 bg-white/90 p-3 dark:border-white/10 dark:bg-black/20">
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-sm font-semibold">{item.data.title}</h4>
          <div className="flex items-center gap-1.5">
            <span className="rounded-full app-soft px-2 py-0.5 text-[11px]">{item.data.products.length} item(s)</span>
            <button
              onClick={() => scrollRail("left")}
              disabled={!canScrollLeft}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md app-soft text-xs disabled:opacity-40"
              aria-label="Scroll products left"
            >
              ←
            </button>
            <button
              onClick={() => scrollRail("right")}
              disabled={!canScrollRight}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md app-soft text-xs disabled:opacity-40"
              aria-label="Scroll products right"
            >
              →
            </button>
          </div>
        </div>
        <div
          ref={railRef}
          onScroll={refreshScrollState}
          className="flex gap-2 overflow-x-auto pb-1 pr-1"
          style={{ scrollbarWidth: "thin" }}
        >
          {item.data.products.map((product) => (
            <article key={product.sku} className="app-surface w-[186px] shrink-0 overflow-hidden rounded-lg shadow-[0_14px_28px_-22px_rgba(15,23,42,0.45)]">
              <div className="app-soft relative h-20 w-full overflow-hidden">
                <Image src={categoryImage(product.category)} alt={product.name} fill className="object-cover" sizes="186px" />
              </div>
              <div className="p-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="line-clamp-1 text-[13px] font-semibold">{product.name}</p>
                    <p className="app-muted text-xs">{product.color} · {product.size}</p>
                    <p className="app-muted text-[11px]">{product.sku}</p>
                  </div>
                  <p className="text-[13px] font-bold">{money(product.priceCents, "USD")}</p>
                </div>
                <div className="mt-1 flex items-center justify-between">
                  <p className="app-muted text-xs">Stock: {product.stock}</p>
                  <button
                    onClick={() => onProductPick?.(`Add SKU ${product.sku} (${product.name}, ${product.color}, size ${product.size}) to my cart.`)}
                    disabled={disabled}
                    className="rounded-md app-soft px-2 py-0.5 text-[11px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Select
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
});

export function ChatTimeline({
  timeline,
  transientTrace = [],
  streaming = false,
  thinkingLabel = "",
  onNextStepClick,
  onProductPick,
  onCustomerDetailsSubmit,
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
  onProductPick?: (value: string) => void;
  onCustomerDetailsSubmit?: (value: { name?: string; email?: string; phone?: string; address?: string }) => void;
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
            <div
              key={item.id}
              className={
                item.role === "user"
                  ? "text-right"
                  : "text-left border-b border-black/5 pb-2.5 shadow-[0_8px_12px_-14px_rgba(15,23,42,0.55)] dark:border-white/10"
              }
            >
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
                      className="rounded-full bg-[color-mix(in_oklab,var(--surface-soft)_84%,var(--surface)_16%)] px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:brightness-95 dark:text-slate-200 disabled:cursor-not-allowed disabled:opacity-50"
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

        if (item.kind === "card" && item.cardType === "cart") {
          return <CartCard key={item.id} item={item} />;
        }
        if (item.kind === "card" && item.cardType === "customer-details-input") {
          return (
            <CustomerDetailsInputCard
              key={`${item.id}:${item.data.name ?? ""}:${item.data.email ?? ""}:${item.data.phone ?? ""}:${item.data.address ?? ""}`}
              data={item.data}
              disabled={nextStepDisabled}
              onSubmit={onCustomerDetailsSubmit}
            />
          );
        }
        if (item.kind === "card" && item.cardType === "product-list") {
          return <ProductListCard key={item.id} item={item} onProductPick={onProductPick} disabled={nextStepDisabled} />;
        }

        return (
          <details key={item.id} className="group rounded-lg border border-black/10 p-2.5 dark:border-white/10">
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
              <div className="rounded-md border border-black/10 px-2 py-1.5 dark:border-white/10">
                <div className="space-y-1.5 text-[11px]">
                  {item.trace.map((traceItem) => {
                    if (traceItem.kind === "event") {
                      return (
                        <p key={traceItem.id}>
                          <span className="font-semibold uppercase">{traceItem.stage}</span>
                          <span className="app-muted"> · {traceItem.title}</span>
                          {traceItem.detail ? <span className="app-muted"> - {traceItem.detail}</span> : null}
                        </p>
                      );
                    }
                    if (traceItem.kind === "tool") {
                      return (
                        <p key={traceItem.id}>
                          <span className="font-mono font-semibold">{traceItem.tool}</span>
                          <span className={`ml-1 ${traceItem.ok ? "text-emerald-600" : "text-rose-600"}`}>{traceItem.ok ? "ok" : "failed"}</span>
                          {traceItem.reason ? <span className="app-muted"> - {traceItem.reason}</span> : null}
                        </p>
                      );
                    }
                    return null;
                  })}
                </div>
              </div>
            </div>
          </details>
        );
      }),
    [nextStepDisabled, onCustomerDetailsSubmit, onNextStepClick, onProductPick, timeline],
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
          <div className="rounded-md border border-black/10 px-2.5 py-2 dark:border-white/10">
            <div className="space-y-1.5">
              {transientTrace.map((step) => (
                <div key={step.id} className="text-left">
                  <div className="inline-flex max-w-[95%] items-center gap-2 px-0.5 py-0.5 text-xs">
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

function CustomerDetailsInputCard({
  data,
  disabled,
  onSubmit,
}: {
  data: {
    title: string;
    description?: string;
    name?: string;
    email?: string;
    phone?: string;
    address?: string;
  };
  disabled: boolean;
  onSubmit?: (value: { name?: string; email?: string; phone?: string; address?: string }) => void;
}) {
  const [name, setName] = useState(data.name ?? "");
  const [email, setEmail] = useState(data.email ?? "");
  const [phone, setPhone] = useState(data.phone ?? "");
  const [address, setAddress] = useState(data.address ?? "");
  return (
    <div className="text-left">
      <div className="inline-block w-full max-w-[95%] rounded-xl border border-black/10 bg-white/90 p-3 dark:border-white/10 dark:bg-black/20">
        <p className="mb-1 text-sm font-semibold">{data.title}</p>
        {data.description ? <p className="mb-2 app-muted text-xs">{data.description}</p> : null}
        <div className="grid gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Full name (optional)"
            className="h-9 w-full rounded-md border border-black/10 bg-transparent px-2 text-sm outline-none dark:border-white/10"
            disabled={disabled}
          />
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Email (optional)"
            className="h-9 w-full rounded-md border border-black/10 bg-transparent px-2 text-sm outline-none dark:border-white/10"
            disabled={disabled}
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone number (optional)"
            className="h-9 w-full rounded-md border border-black/10 bg-transparent px-2 text-sm outline-none dark:border-white/10"
            disabled={disabled}
          />
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder="Delivery address (optional)"
            className="h-9 w-full rounded-md border border-black/10 bg-transparent px-2 text-sm outline-none dark:border-white/10"
            disabled={disabled}
          />
          <button
            onClick={() =>
              onSubmit?.({
                name: name.trim() || undefined,
                email: email.trim() || undefined,
                phone: phone.trim() || undefined,
                address: address.trim() || undefined,
              })
            }
            disabled={disabled}
            className="h-9 rounded-md bg-[var(--accent)] px-3 text-xs font-semibold text-white disabled:opacity-50"
          >
            Save details
          </button>
        </div>
      </div>
    </div>
  );
}
