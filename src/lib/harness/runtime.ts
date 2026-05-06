import { StateGraph, START, END } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { prisma } from "@/lib/db/prisma";
import { getChatModel } from "@/lib/llm/openai";
import { getTool } from "@/lib/tools/registry";
import { validateStateForCheckout } from "@/lib/harness/guardrails";
import { createEmptyState } from "@/lib/harness/state";
import {
  AgentIntentBoundary,
  AgentTurnResult,
  HarnessEvent,
  HarnessMode,
  HarnessPlanStep,
  Product,
  SessionState,
  ToolTrace,
} from "@/lib/types/domain";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";

type RuntimePlanStep = HarnessPlanStep & {
  input?: Record<string, unknown>;
};

type HarnessGraphState = {
  sessionId: string;
  userMessage: string;
  persistUserMessage: boolean;
  state: SessionState;
  assistantMessage: string;
  toolTrace: ToolTrace[];
  harnessEvents: HarnessEvent[];
  action: "talk" | "ask" | "tool" | "escalate" | "done";
  intent: AgentIntentBoundary;
  plannedSteps: RuntimePlanStep[];
  status: AgentTurnResult["status"];
};

const CATEGORY_WORDS = ["hoodie", "tshirt", "jacket", "dress"];
const COLOR_WORDS = ["black", "blue", "red", "white", "green", "pink", "navy", "brown", "gray"];
const SIZE_WORDS = ["xs", "s", "m", "l", "xl"];
const RECOMMENDATION_WORDS = ["recommend", "suggest", "advice", "casual", "warm", "chilly", "cold", "evening", "cheap", "cheaper", "affordable", "style", "match", "wear", "options", "available"];
const CHECKOUT_MUTATION_WORDS = ["add", "buy", "cart", "checkout", "get me", "i need", "i want", "order", "purchase", "take"];
const CATALOG_QUESTION_WORDS = ["available", "compare", "do you have", "how much", "options", "price", "show", "what", "which"];

function nowIso() {
  return new Date().toISOString();
}

function event(stage: HarnessEvent["stage"], title: string, detail: string, ok = true): HarnessEvent {
  return { stage, title, detail, ok, at: nowIso() };
}

function publicPlan(steps: RuntimePlanStep[]): HarnessPlanStep[] {
  return steps.map(({ id, label, tool, reason, status }) => ({ id, label, tool, reason, status }));
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

function parsePreference(text: string): Partial<SessionState["preferences"]> {
  const lower = text.toLowerCase();
  const category = CATEGORY_WORDS.find((c) => lower.includes(c));
  const color = COLOR_WORDS.find((c) => lower.includes(c));
  const size = SIZE_WORDS.find((s) => lower.includes(` ${s} `) || lower.endsWith(` ${s}`));
  const quantityMatch = lower.match(/\b(\d+)\b/);
  const quantity = quantityMatch ? Number(quantityMatch[1]) : undefined;

  return {
    category,
    color,
    size: size?.toUpperCase(),
    quantity,
  };
}

function chooseProduct(state: SessionState) {
  return PRODUCT_CATALOG.find((p) => {
    const p1 = state.preferences.category ? p.category === state.preferences.category : true;
    const p2 = state.preferences.color ? p.color === state.preferences.color : true;
    const p3 = state.preferences.size ? p.size === state.preferences.size : true;
    return p1 && p2 && p3;
  });
}

function hasAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function hasProductSignal(text: string) {
  return CATEGORY_WORDS.some((word) => text.includes(word)) || COLOR_WORDS.some((word) => text.includes(word));
}

function inferIntent(text: string, state: SessionState): AgentIntentBoundary {
  const lower = text.toLowerCase();
  if (lower.includes("help") || lower.includes("agent") || lower.includes("human")) {
    return { kind: "human_escalation", requiresTool: true, checkoutMutation: false, reason: "User asked for human support." };
  }
  if (state.payment?.status === "pending") {
    return {
      kind: "payment_status_monitoring",
      requiresTool: true,
      checkoutMutation: false,
      reason: "Existing payment is pending and needs provider observation.",
    };
  }
  if (lower.includes("pay") || lower.includes("checkout") || lower.includes("confirm")) {
    return {
      kind: "payment_confirmation",
      requiresTool: true,
      checkoutMutation: true,
      reason: "User is confirming a checkout/payment mutation.",
    };
  }
  if (lower.includes("@") || lower.includes("phone") || lower.includes("address") || lower.includes("name")) {
    return {
      kind: "customer_details",
      requiresTool: true,
      checkoutMutation: true,
      reason: "User supplied customer details needed for checkout.",
    };
  }
  if (lower.includes("compare") || lower.includes(" versus ") || lower.includes(" vs ")) {
    return {
      kind: "catalog_question",
      requiresTool: false,
      checkoutMutation: false,
      reason: "User asked to compare catalog items without changing checkout state.",
    };
  }
  if (RECOMMENDATION_WORDS.some((word) => lower.includes(word))) {
    return {
      kind: "product_recommendation",
      requiresTool: false,
      checkoutMutation: false,
      reason: "User asked for guidance, not a cart/order/payment mutation.",
    };
  }
  if (state.cart.items.length === 0 && hasAny(lower, CATALOG_QUESTION_WORDS) && !hasAny(lower, CHECKOUT_MUTATION_WORDS)) {
    return {
      kind: "catalog_question",
      requiresTool: false,
      checkoutMutation: false,
      reason: "User asked a read-only catalog question.",
    };
  }
  if (state.cart.items.length === 0 && (hasProductSignal(lower) || hasAny(lower, CHECKOUT_MUTATION_WORDS))) {
    return {
      kind: "cart_mutation",
      requiresTool: true,
      checkoutMutation: true,
      reason: "User provided product-selection language that may update the cart.",
    };
  }
  if (state.cart.items.length === 0) {
    return {
      kind: "catalog_question",
      requiresTool: false,
      checkoutMutation: false,
      reason: "No checkout mutation was requested.",
    };
  }
  return {
    kind: "checkout_progression",
    requiresTool: true,
    checkoutMutation: true,
    reason: "Existing checkout needs the next guarded step.",
  };
}

function planStep(id: string, label: string, reason: string, tool?: string, input?: Record<string, unknown>): RuntimePlanStep {
  return { id, label, reason, tool, input, status: "pending" };
}

function compactList(values: string[], max = 5) {
  return values.filter(Boolean).slice(-max);
}

function extractCustomerDetails(text: string, known: SessionState["customer"]): SessionState["customer"] {
  const email = text.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone = text.match(/\+?\d[\d\s-]{6,}/)?.[0]?.trim();
  const nameMatch = text.match(/(?:my name is|name is|i am|i'm)\s+([^,.;]+)/i);
  const addressMatch = text.match(/(?:address is|deliver(?:y)? to|ship to)\s+(.+)$/i);

  return {
    name: nameMatch?.[1]?.trim() ?? known.name,
    email: email ?? known.email,
    phone: phone ?? known.phone,
    address: addressMatch?.[1]?.trim() ?? known.address,
  };
}

function productSummary(product: Product) {
  return `${product.name} (${product.color}, ${product.size})`;
}

function catalogContext() {
  return PRODUCT_CATALOG.map((p) => `${p.sku}: ${p.name}, ${p.category}, ${p.color}, ${p.size}, $${(p.priceCents / 100).toFixed(2)}, stock ${p.stock}`).join("\n");
}

function catalogMatches(state: SessionState) {
  return PRODUCT_CATALOG.filter((p) => {
    const categoryOk = state.preferences.category ? p.category === state.preferences.category : true;
    const colorOk = state.preferences.color ? p.color === state.preferences.color : true;
    const sizeOk = state.preferences.size ? p.size === state.preferences.size : true;
    return categoryOk && colorOk && sizeOk && p.stock > 0;
  });
}

function fallbackOpenResponse(intent: AgentIntentBoundary, userMessage: string, state: SessionState) {
  const matches = catalogMatches(state);
  const warm = PRODUCT_CATALOG.filter((p) => p.category === "hoodie" || p.category === "jacket").slice(0, 3);
  const cheap = [...PRODUCT_CATALOG].sort((a, b) => a.priceCents - b.priceCents).slice(0, 3);
  const picks =
    matches.length > 0
      ? matches.slice(0, 3)
      : userMessage.toLowerCase().includes("cheap") || userMessage.toLowerCase().includes("affordable")
        ? cheap
        : warm;

  if (intent.kind === "product_recommendation") {
    return `I would start with ${picks.map(productSummary).join(", ")}. If you want to buy one, tell me the color, item type, and size.`;
  }

  if (intent.kind === "catalog_question") {
    return matches.length > 0
      ? `I found ${matches.length} matching option(s): ${matches.slice(0, 3).map(productSummary).join(", ")}. Tell me the exact item and size when you want me to add one to cart.`
      : "I can answer catalog questions and compare options; tell me a category, color, size, or budget to narrow the choices.";
  }

  return "I can help you browse, compare products, pick an item, collect checkout details, create an order, and complete payment when you explicitly confirm.";
}

async function appendTrace(sessionId: string, node: string, detail: unknown) {
  await prisma.harnessTrace.create({ data: { sessionId, node, detail: detail as object } });
}

async function ingestUserInputNode(g: HarnessGraphState): Promise<Partial<HarnessGraphState>> {
  const pref = parsePreference(g.userMessage);
  const intent = inferIntent(g.userMessage, g.state);
  const nextState: SessionState = {
    ...g.state,
    harness: {
      ...g.state.harness,
      currentMode: "Planning",
      loopCount: g.state.harness.loopCount + 1,
      lastIntent: intent.kind,
      observations: compactList([
        ...g.state.harness.observations,
        `User intent looked like ${intent.kind}; requiresTool=${intent.requiresTool}; checkoutMutation=${intent.checkoutMutation}; extracted preferences ${JSON.stringify(pref)}.`,
      ]),
    },
    preferences: { ...g.state.preferences, ...pref },
  };

  const harnessEvents = [
    ...g.harnessEvents,
    event("observe", "Input observed", `Intent: ${intent.kind}. ${intent.reason} Preference signals: ${JSON.stringify(pref)}.`),
  ];

  await appendTrace(g.sessionId, "ingest_user_input", { message: g.userMessage, intent, pref });
  return { state: nextState, intent, harnessEvents };
}

async function planNextActionNode(g: HarnessGraphState): Promise<Partial<HarnessGraphState>> {
  const lower = g.userMessage.toLowerCase();
  const state = g.state;
  let plannedSteps: RuntimePlanStep[] = [];

  if (!g.intent.requiresTool) {
    plannedSteps = [
      {
        id: "model_conversation",
        label: g.intent.kind === "catalog_question" ? "Answer without changing checkout state" : "Recommend with catalog context",
        reason: g.intent.reason,
        status: "done",
      },
    ];
    const nextState = appendStateEvent(state, {
      currentMode: "Talking",
      lastPlan: publicPlan(plannedSteps),
      observations: compactList([...state.harness.observations, "No mutating tool needed; route stayed in model conversation."]),
    });
    return {
      action: "talk",
      plannedSteps,
      state: nextState,
      harnessEvents: [
        ...g.harnessEvents,
        event("plan", "Conversation plan", "Harness allows model/catalog reasoning because no cart, order, payment, or handoff mutation is being requested."),
      ],
    };
  }

  if (g.intent.kind === "human_escalation") {
    plannedSteps = [
      planStep("escalate", "Open human handoff", "The user explicitly asked for human support.", "escalate_to_human", {
        reason: "User requested human support",
        context: { userMessage: g.userMessage, workflowStep: state.workflowStep },
      }),
    ];
    const nextState = appendStateEvent(state, { currentMode: "Planning", lastPlan: publicPlan(plannedSteps) });
    return {
      action: "escalate",
      plannedSteps,
      state: nextState,
      harnessEvents: [...g.harnessEvents, event("plan", "Escalation plan", "Harness will preserve context and create a support ticket.")],
    };
  }

  if (state.cart.items.length === 0) {
    const product = chooseProduct(state);
    plannedSteps = [
      planStep("catalog", "Inspect catalog", "The harness checks real stock before promising an item.", "catalog_lookup", {
        category: state.preferences.category,
        color: state.preferences.color,
        size: state.preferences.size,
      }),
    ];

    if (product) {
      plannedSteps.push(
        planStep("cart", "Add selected item to cart", "A single catalog match satisfies the user's preference.", "cart_update", {
          sku: product.sku,
          quantity: state.preferences.quantity ?? 1,
        }),
      );
    }

    const nextState = appendStateEvent(state, { currentMode: "Planning", lastPlan: publicPlan(plannedSteps) });
    return {
      action: "tool",
      plannedSteps,
      state: nextState,
      harnessEvents: [
        ...g.harnessEvents,
        event(
          "plan",
          "Product discovery plan",
          product ? `Lookup catalog, then add ${productSummary(product)} to cart.` : "Lookup catalog, then decide whether to ask, recommend, or add.",
        ),
      ],
    };
  }

  const hasDetails = state.customer.name && state.customer.email && state.customer.phone && state.customer.address;
  if (!hasDetails) {
    const known = state.customer;
    if (!known.name || !known.email || !known.phone || !known.address) {
      if (lower.includes("name") || lower.includes("email") || lower.includes("phone") || lower.includes("address") || lower.includes("@")) {
        const customer = extractCustomerDetails(g.userMessage, known);
        plannedSteps = [
          planStep("customer", "Update customer profile", "Checkout is blocked until required delivery details are present.", "customer_details_upsert", {
            name: customer.name,
            email: customer.email,
            phone: customer.phone,
            address: customer.address,
          }),
        ];
        const nextState = appendStateEvent(state, { currentMode: "Planning", lastPlan: publicPlan(plannedSteps) });
        const email = lower.includes("@") ? g.userMessage.match(/[\w.-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0] : undefined;
        return {
          action: "tool",
          plannedSteps,
          state: nextState,
          harnessEvents: [...g.harnessEvents, event("plan", "Profile completion plan", `Update profile details. Email signal: ${email ?? "not found"}.`)],
        };
      }

      const missing = ["name", "email", "phone", "address"].filter((field) => !known[field as keyof typeof known]);
      const nextState = appendStateEvent(state, {
        lastPlan: [
          {
            id: "ask_details",
            label: "Ask for missing checkout details",
            reason: `Missing fields: ${missing.join(", ")}.`,
            status: "blocked",
          },
        ],
        currentMode: "Blocked",
        guardrailFindings: compactList([...state.harness.guardrailFindings, `Missing customer fields: ${missing.join(", ")}.`]),
      });
      return {
        action: "ask",
        assistantMessage:
          "Please share your full name, email, phone number, and delivery address so I can create your order.",
        status: "needs_input",
        state: nextState,
        harnessEvents: [...g.harnessEvents, event("guardrail", "Checkout blocked", `Missing customer fields: ${missing.join(", ")}.`, false)],
      };
    }
  }

  if (!state.order) {
    plannedSteps = [
      planStep("shipping", "Quote delivery and create order", "The harness needs a delivery price before creating the order.", "shipping_quote", {
        address: state.customer.address,
      }),
    ];
    const nextState = appendStateEvent(state, { currentMode: "Planning", lastPlan: publicPlan(plannedSteps) });
    return {
      action: "tool",
      plannedSteps,
      state: nextState,
      harnessEvents: [...g.harnessEvents, event("plan", "Order preparation plan", "Quote shipping, then create a draft order from state.")],
    };
  }

  if (state.order && !state.payment) {
    if (lower.includes("pay") || lower.includes("checkout") || lower.includes("confirm")) {
      plannedSteps = [
        planStep("payment", "Initiate payment", "The user confirmed checkout and state passed required order checks.", "payment_initiate", {
          orderRef: state.order.orderRef,
          amountCents: state.order.cart.totalCents,
          method: "card",
        }),
      ];
      const nextState = appendStateEvent(state, { currentMode: "Planning", lastPlan: publicPlan(plannedSteps) });
      return {
        action: "tool",
        plannedSteps,
        state: nextState,
        harnessEvents: [...g.harnessEvents, event("plan", "Payment plan", "Initiate payment only after explicit user confirmation.")],
      };
    }

    const nextState = appendStateEvent(state, {
      lastPlan: [
        {
          id: "await_payment_confirmation",
          label: "Wait for payment confirmation",
          reason: "Payment should not start without explicit confirmation.",
          status: "blocked",
        },
      ],
      currentMode: "Blocked",
    });
    return {
      action: "ask",
      assistantMessage: `Order ${state.order.orderRef} is ready. Total is $${(state.order.cart.totalCents / 100).toFixed(2)}. Reply 'pay now' to initiate payment.`,
      status: "needs_input",
      state: nextState,
      harnessEvents: [...g.harnessEvents, event("guardrail", "Payment paused", "Harness is waiting for explicit payment confirmation.")],
    };
  }

  if (state.payment?.status === "pending") {
    plannedSteps = [
      planStep("payment_status", "Poll payment provider", "Payment is pending, so the harness observes provider state before responding.", "payment_status_check", {
        paymentRef: state.payment.paymentRef,
      }),
    ];
    const nextState = appendStateEvent(state, { currentMode: "Planning", lastPlan: publicPlan(plannedSteps) });
    return {
      action: "tool",
      plannedSteps,
      state: nextState,
      harnessEvents: [...g.harnessEvents, event("plan", "Payment monitoring plan", "Check payment status and update workflow state.")],
    };
  }

  const nextState = appendStateEvent(state, {
    currentMode: "Complete",
    lastPlan: [
      {
        id: "complete",
        label: "Return final checkout status",
        reason: "The workflow has reached a terminal state.",
        status: "done",
      },
    ],
  });
  return { action: "done", state: nextState, harnessEvents: [...g.harnessEvents, event("plan", "Workflow complete", "No more tool calls are needed.")] };
}

async function executeToolNode(g: HarnessGraphState): Promise<Partial<HarnessGraphState>> {
  if ((g.action !== "tool" && g.action !== "escalate") || g.plannedSteps.length === 0) return {};

  let nextState = { ...g.state };
  const toolTrace: ToolTrace[] = [...g.toolTrace];
  const harnessEvents = [...g.harnessEvents];
  const plannedSteps = [...g.plannedSteps];
  let assistantMessage = g.assistantMessage;
  let status = g.status;

  for (const [idx, step] of plannedSteps.entries()) {
    if (!step.tool) continue;

    nextState = appendStateEvent(nextState, { currentMode: "Executing" });
    plannedSteps[idx] = { ...step, status: "running" };
    const tool = getTool(step.tool);
    const parsedInput = tool.inputSchema.parse(step.input ?? {});

    try {
      const rawOutput = await tool.execute(parsedInput, { sessionId: g.sessionId, state: nextState });
      const output = tool.outputSchema.parse(rawOutput) as Record<string, unknown>;

      toolTrace.push({ tool: tool.name, input: parsedInput, output, ok: true, reason: step.reason });
      harnessEvents.push(event("tool", tool.name, `Executed for: ${step.reason}`));
      plannedSteps[idx] = { ...plannedSteps[idx], status: "done" };

      if (tool.name === "catalog_lookup") {
        const matches = output.matches as Product[];
        nextState = appendStateEvent(nextState, {
          observations: compactList([
            ...nextState.harness.observations,
            matches.length
              ? `Catalog returned ${matches.length} match(es): ${matches.slice(0, 3).map(productSummary).join("; ")}.`
              : "Catalog returned no matching products.",
          ]),
        });

        if (nextState.cart.items.length === 0 && !plannedSteps.some((s) => s.tool === "cart_update")) {
          if (matches.length === 1) {
            const product = matches[0];
            const cartTool = getTool("cart_update");
            const cartInput = cartTool.inputSchema.parse({ sku: product.sku, quantity: nextState.preferences.quantity ?? 1 });
            const cartOutput = cartTool.outputSchema.parse(
              await cartTool.execute(cartInput, { sessionId: g.sessionId, state: nextState }),
            ) as Record<string, unknown>;

            toolTrace.push({
              tool: "cart_update",
              input: cartInput,
              output: cartOutput,
              ok: true,
              reason: "Catalog narrowed the product to one available SKU.",
            });
            harnessEvents.push(event("tool", "cart_update", `Auto-selected ${productSummary(product)} after catalog observation.`));
            nextState = {
              ...nextState,
              selectedProduct: product,
              cart: cartOutput.cart as SessionState["cart"],
              workflowStep: "collecting_customer_details",
            };
          } else if (matches.length > 1) {
          assistantMessage = `I found ${matches.length} options: ${matches.slice(0, 3).map(productSummary).join(", ")}. Tell me the color and size you prefer.`;
          status = "needs_input";
          plannedSteps[idx] = { ...plannedSteps[idx], status: "blocked" };
          nextState = appendStateEvent(nextState, { currentMode: "Blocked" });
          harnessEvents.push(event("guardrail", "Choice needed", "The harness found multiple valid products and paused instead of guessing.", false));
          break;
        } else {
          assistantMessage = "I could not find that exact item. Try another category, color, or size.";
          status = "needs_input";
          nextState = appendStateEvent(nextState, {
            currentMode: "Recovering",
            recoveryNotes: compactList([...nextState.harness.recoveryNotes, "No product matched the current constraints."]),
          });
          harnessEvents.push(event("recovery", "No catalog match", "The harness recovered by asking the user to adjust search constraints.", false));
          break;
        }
        }
      }

      if (tool.name === "cart_update") {
        const selectedSku = String(output.selectedSku);
        nextState = {
          ...nextState,
          selectedProduct: PRODUCT_CATALOG.find((p) => p.sku === selectedSku),
          cart: output.cart as SessionState["cart"],
          workflowStep: "collecting_customer_details",
        };
      }

      if (tool.name === "customer_details_upsert") {
        nextState = { ...nextState, customer: output.customer as SessionState["customer"] };
        const missingFields = output.missingFields as string[];
        if (missingFields.length > 0) {
          assistantMessage = `I still need: ${missingFields.join(", ")}.`;
          status = "needs_input";
          nextState = appendStateEvent(nextState, {
            currentMode: "Blocked",
            guardrailFindings: compactList([...nextState.harness.guardrailFindings, `Missing customer fields: ${missingFields.join(", ")}.`]),
          });
          harnessEvents.push(event("guardrail", "Profile incomplete", `Missing fields: ${missingFields.join(", ")}.`, false));
          break;
        }
      }

      if (tool.name === "shipping_quote") {
        const createOrder = getTool("order_create");
        const orderInput = createOrder.inputSchema.parse({ shippingCents: Number(output.shippingCents) });
        const orderOutput = createOrder.outputSchema.parse(
          await createOrder.execute(orderInput, { sessionId: g.sessionId, state: nextState }),
        ) as { orderRef: string; totalCents: number };

        const orderState = {
          orderRef: orderOutput.orderRef,
          status: "created" as const,
          cart: {
            ...nextState.cart,
            shippingCents: Number(output.shippingCents),
            totalCents: nextState.cart.subtotalCents + Number(output.shippingCents),
          },
          customer: nextState.customer,
        };

        nextState = {
          ...nextState,
          cart: orderState.cart,
          order: orderState,
          workflowStep: "reviewing_order",
        };

        toolTrace.push({
          tool: "order_create",
          input: orderInput,
          output: orderOutput,
          ok: true,
          reason: "Shipping quote completed the data needed to create the order.",
        });
        harnessEvents.push(event("tool", "order_create", `Created order ${orderOutput.orderRef} after shipping quote.`));
      }

      if (tool.name === "payment_initiate") {
        nextState = {
          ...nextState,
          payment: {
            paymentRef: String(output.paymentRef),
            orderRef: nextState.order?.orderRef ?? "",
            amountCents: nextState.order?.cart.totalCents ?? 0,
            method: "card",
            status: output.status as "pending" | "success" | "failed",
          },
          workflowStep: "payment_pending",
        };
      }

      if (tool.name === "payment_status_check") {
        nextState = {
          ...nextState,
          payment: {
            ...nextState.payment!,
            status: output.status as "pending" | "success" | "failed",
          },
          workflowStep: output.status === "success" ? "payment_completed" : "payment_pending",
        };
        if (output.status === "success") {
          nextState = appendStateEvent(nextState, { currentMode: "Complete" });
        }
      }

      if (tool.name === "escalate_to_human") {
        nextState = {
          ...nextState,
          requiresHuman: true,
          workflowStep: "escalated",
        };
        status = "escalated";
      }

      await appendTrace(g.sessionId, "execute_tool", { tool: tool.name, parsedInput, output, reason: step.reason });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown tool failure";
      toolTrace.push({ tool: tool.name, input: parsedInput, output: { error: detail }, ok: false, reason: step.reason });
      plannedSteps[idx] = { ...plannedSteps[idx], status: "blocked" };
      nextState = appendStateEvent(nextState, {
        currentMode: "Recovering",
        recoveryNotes: compactList([...nextState.harness.recoveryNotes, `${tool.name} failed: ${detail}`]),
      });
      harnessEvents.push(event("recovery", "Tool failure handled", `${tool.name} failed: ${detail}`, false));
      assistantMessage = "I hit a checkout tool issue and kept your current state. Please retry that step.";
      status = "error";
      break;
    }
  }

  const mode: HarnessMode =
    status === "error"
      ? "Recovering"
      : status === "needs_input"
        ? nextState.harness.currentMode ?? "Talking"
        : nextState.harness.currentMode === "Complete"
          ? "Complete"
          : "Talking";
  nextState = appendStateEvent(nextState, { currentMode: mode, lastPlan: publicPlan(plannedSteps) });
  return { state: nextState, toolTrace, plannedSteps, assistantMessage, status, harnessEvents };
}

async function applyGuardrailsNode(g: HarnessGraphState): Promise<Partial<HarnessGraphState>> {
  if (g.state.workflowStep === "reviewing_order" || g.state.workflowStep === "payment_pending") {
    const check = validateStateForCheckout(g.state);
    if (!check.ok) {
      const nextState = appendStateEvent(g.state, {
        currentMode: "Blocked",
        guardrailFindings: compactList([...g.state.harness.guardrailFindings, check.reason ?? "Checkout state failed validation."]),
      });
      return {
        action: "ask",
        assistantMessage: check.reason ?? "I still need more information.",
        status: "needs_input",
        state: nextState,
        harnessEvents: [
          ...g.harnessEvents,
          event("guardrail", "Checkout validation failed", check.reason ?? "Checkout state failed validation.", false),
        ],
      };
    }
  }

  const harnessEvents = [...g.harnessEvents, event("guardrail", "Policy checks passed", `Workflow step ${g.state.workflowStep} is allowed to continue.`)];
  await appendTrace(g.sessionId, "apply_guardrails", { step: g.state.workflowStep, ok: true });
  return { harnessEvents };
}

async function composeResponseNode(g: HarnessGraphState): Promise<Partial<HarnessGraphState>> {
  const model = getChatModel();

  let message = g.assistantMessage;

  if (g.action === "talk") {
    message = fallbackOpenResponse(g.intent, g.userMessage, g.state);
  } else if (g.state.workflowStep === "collecting_customer_details") {
    message ||= "I found your item and added it to cart. Share name, email, phone, and address so I can prepare checkout.";
  } else if (g.state.workflowStep === "reviewing_order" && g.state.order) {
    message ||= `Order ${g.state.order.orderRef} is prepared. Total is $${(g.state.order.cart.totalCents / 100).toFixed(2)}. Reply 'pay now' to continue.`;
  } else if (g.state.workflowStep === "payment_pending") {
    message ||= "Payment initiated. I am checking status now.";
  } else if (g.state.workflowStep === "payment_completed") {
    message ||= `Payment successful for order ${g.state.order?.orderRef}. Your checkout is complete.`;
  } else if (g.state.workflowStep === "escalated") {
    message ||= "I have escalated this to a human support specialist with your context.";
  } else if (g.state.harness.observations.length > 0 && g.status === "needs_input") {
    message ||= "I need one more detail before I can continue safely.";
  } else {
    message ||= "Tell me the apparel category, color, and size you want to buy.";
  }

  if (model && (g.action === "talk" || !g.assistantMessage)) {
    const result = await model.invoke([
      new HumanMessage(
        `You are a capable apparel checkout agent inside a controlled harness.
The user can ask open questions, ask for recommendations, compare products, or proceed with checkout.
You may reason naturally, but do not claim that cart, order, payment, or escalation changes happened unless the harness tool trace did it.
Keep the response under 3 sentences.

Current intent: ${g.intent.kind}
Intent boundary: requiresTool=${g.intent.requiresTool}; checkoutMutation=${g.intent.checkoutMutation}; reason=${g.intent.reason}
Current workflow step: ${g.state.workflowStep}
Cart items: ${g.state.cart.items.map((item) => `${item.quantity}x ${item.name} ${item.color} ${item.size}`).join(", ") || "empty"}
Catalog:
${catalogContext()}

User message: ${g.userMessage}
Draft direction: ${message}`,
      ),
    ]);
    message = String(result.content);
  }

  const harnessEvents = [...g.harnessEvents, event("response", "Response composed", message)];
  await appendTrace(g.sessionId, "compose_response", { message });
  const nextState = appendStateEvent(g.state, {
    currentMode: g.state.harness.currentMode === "Complete" ? "Complete" : g.state.harness.currentMode === "Blocked" ? "Blocked" : "Talking",
  });
  return { assistantMessage: message, state: nextState, status: g.state.workflowStep === "payment_completed" ? "ok" : g.status ?? "ok", harnessEvents };
}

async function finalizeTurnNode(g: HarnessGraphState): Promise<Partial<HarnessGraphState>> {
  const messageData = [
    g.persistUserMessage && g.userMessage.trim() ? { role: "user", content: g.userMessage } : null,
    { role: "assistant", content: g.assistantMessage },
  ].filter(Boolean) as Array<{ role: string; content: string }>;

  await prisma.userSession.update({
    where: { id: g.sessionId },
    data: {
      currentStep: g.state.workflowStep,
      stateJson: g.state as unknown as object,
      messages: {
        createMany: {
          data: messageData,
        },
      },
    },
  });

  await appendTrace(g.sessionId, "finalize_turn", { status: g.status ?? "ok" });
  return {};
}

function routeAfterPlan(g: HarnessGraphState): string {
  if (g.action === "tool") return "execute_tool";
  if (g.action === "escalate") return "execute_tool";
  return "compose_response";
}

export async function runAgentTurn(input: { sessionId: string; userMessage: string; persistUserMessage?: boolean }): Promise<AgentTurnResult> {
  const session = await prisma.userSession.findUnique({ where: { id: input.sessionId } });
  if (!session) throw new Error("Session not found");

  const persistedState = (session.stateJson as SessionState | null) ?? createEmptyState(session.id, session.userId);
  const state = normalizeState(persistedState, session.id, session.userId);

  const graph = new StateGraph<HarnessGraphState>({
    channels: {
      sessionId: null,
      userMessage: null,
      persistUserMessage: null,
      state: null,
      assistantMessage: null,
      toolTrace: null,
      harnessEvents: null,
      action: null,
      intent: null,
      plannedSteps: null,
      status: null,
    },
  })
    .addNode("ingest_user_input", ingestUserInputNode)
    .addNode("plan_next_action", planNextActionNode)
    .addNode("execute_tool", executeToolNode)
    .addNode("apply_guardrails", applyGuardrailsNode)
    .addNode("compose_response", composeResponseNode)
    .addNode("finalize_turn", finalizeTurnNode)
    .addEdge(START, "ingest_user_input")
    .addEdge("ingest_user_input", "plan_next_action")
    .addConditionalEdges("plan_next_action", routeAfterPlan, ["execute_tool", "compose_response"])
    .addEdge("execute_tool", "apply_guardrails")
    .addEdge("apply_guardrails", "compose_response")
    .addEdge("compose_response", "finalize_turn")
    .addEdge("finalize_turn", END)
    .compile();

  const result = (await graph.invoke({
    sessionId: input.sessionId,
    userMessage: input.userMessage,
    persistUserMessage: input.persistUserMessage ?? true,
    state,
    assistantMessage: "",
    toolTrace: [],
    harnessEvents: [],
    action: "ask",
    intent: {
      kind: "catalog_question",
      requiresTool: false,
      checkoutMutation: false,
      reason: "Initial placeholder before ingesting user input.",
    },
    plannedSteps: [],
    status: "ok",
  })) as HarnessGraphState;

  return {
    assistantMessage: result.assistantMessage,
    updatedState: result.state,
    toolTrace: Array.isArray(result.toolTrace) ? result.toolTrace : [],
    harnessEvents: Array.isArray(result.harnessEvents) ? result.harnessEvents : [],
    status: result.status ?? "ok",
  };
}
