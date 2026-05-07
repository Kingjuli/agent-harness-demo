// Deterministic state transition helpers applied after tool execution.
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { createEmptyState } from "@/lib/harness/state";
import { formatToolDisplayName } from "@/lib/tools/labels";
import {
  AgentTurnResult,
  Cart,
  CustomerProfile,
  HarnessMode,
  HarnessPlanStep,
  Payment,
  Product,
  SessionState,
  ToolTrace,
} from "@/lib/types/domain";

export function compactList(values: string[], max = 5) {
  return values.filter(Boolean).slice(-max);
}

export function normalizeState(state: SessionState, sessionId: string, userId: string): SessionState {
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

export function appendStateEvent(state: SessionState, next: Partial<SessionState["harness"]>): SessionState {
  return {
    ...state,
    harness: {
      ...state.harness,
      ...next,
    },
  };
}

export function stateSnapshot(state: SessionState) {
  return {
    workflowStep: state.workflowStep,
    cart: state.cart,
    customer: state.customer,
    order: state.order,
    payment: state.payment,
    requiresHuman: state.requiresHuman,
  };
}

function dollars(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function productSummary(product: Product) {
  return `${product.sku}: ${product.name} (${product.color}, ${product.size}) for ${dollars(product.priceCents)}`;
}

export function toolPlan(toolTrace: ToolTrace[]): HarnessPlanStep[] {
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
    label: formatToolDisplayName(trace.tool),
    tool: trace.tool,
    reason: trace.reason ?? "Selected by the LangGraph agent.",
    status: trace.ok ? "done" : "blocked",
  }));
}

export function missingCustomerFields(customer: CustomerProfile) {
  return ["name", "email", "phone", "address"].filter((field) => !customer[field as keyof CustomerProfile]);
}

export function applyToolOutput(
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

export function finalMode(state: SessionState, hasToolError: boolean): HarnessMode {
  if (hasToolError) return "Recovering";
  if (state.workflowStep === "payment_completed") return "Complete";
  if (state.workflowStep === "escalated") return "Complete";
  if (state.harness.currentMode === "Blocked") return "Blocked";
  return "Talking";
}

export function finalStatus(state: SessionState, hasToolError: boolean): AgentTurnResult["status"] {
  if (hasToolError) return "error";
  if (state.workflowStep === "escalated") return "escalated";
  if (state.harness.currentMode === "Blocked") return "needs_input";
  return "ok";
}
