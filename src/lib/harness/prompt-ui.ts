// Prompt contracts and GenUI block assembly logic.
import { missingCustomerFields } from "@/lib/harness/state-machine";
import { hasCustomerDetailsFormTag, hasSuccessfulToolCall, extractProductSkusForUi, lookupProductsBySku, pickTopConfidenceBlock } from "@/lib/harness/ui-block-utils";
import { sanitizeCustomerResponse } from "@/lib/harness/response-sanitizer";
import { AgentTurnResult, SessionState, ToolTrace } from "@/lib/types/domain";
import { buildAgentPromptChain, buildNoToolsPromptChain } from "@/lib/prompting";
import { ResponseStyle } from "@/lib/harness/types";
export { sanitizeCustomerResponse };

export function agentPrompt(state: SessionState, responseStyle: ResponseStyle, context: { stateText: string; catalogText: string }) {
  return buildAgentPromptChain({ state, responseStyle, context });
}

export function noToolsPrompt(state: SessionState, responseStyle: ResponseStyle) {
  return buildNoToolsPromptChain(state, responseStyle);
}

export function buildUiBlocks(input: { assistantMessage: string; updatedState: SessionState; traces: ToolTrace[] }): AgentTurnResult["ui"] {
  const candidates: Array<{ confidence: number; block: NonNullable<AgentTurnResult["ui"]>[number] }> = [];
  if (hasSuccessfulToolCall(input.traces, "cart_view")) {
    candidates.push({
      confidence: 0.9,
      block: {
        type: "cart_card",
        version: 1,
        data: {
          items: input.updatedState.cart.items,
          subtotalCents: input.updatedState.cart.subtotalCents,
          shippingCents: input.updatedState.cart.shippingCents,
          totalCents: input.updatedState.cart.totalCents,
          currency: input.updatedState.cart.currency,
          itemCount: input.updatedState.cart.items.reduce((sum, item) => sum + item.quantity, 0),
        },
      },
    });
  }

  const missing = missingCustomerFields(input.updatedState.customer);
  const inCheckoutFlow =
    input.updatedState.workflowStep === "collecting_customer_details" ||
    input.updatedState.workflowStep === "reviewing_order" ||
    input.updatedState.workflowStep === "payment_pending";
  const modelRequestedForm = hasCustomerDetailsFormTag(input.assistantMessage);
  const isTerminalStep = input.updatedState.workflowStep === "payment_completed" || input.updatedState.workflowStep === "escalated";

  const shouldShowCustomerDetailsCard = !isTerminalStep && ((inCheckoutFlow && missing.length > 0) || modelRequestedForm);

  if (shouldShowCustomerDetailsCard) {
    const confidence = inCheckoutFlow && missing.length > 0 ? 0.98 : 0.86;
    candidates.push({
      confidence,
      block: {
        type: "customer_details_input_card",
        version: 1,
        data: {
          title: "Customer details",
          description: "All fields are optional. Update any value and save to continue.",
          name: input.updatedState.customer.name,
          email: input.updatedState.customer.email,
          phone: input.updatedState.customer.phone,
          address: input.updatedState.customer.address,
        },
      },
    });
  }

  const requestedSkus = extractProductSkusForUi(input.assistantMessage, input.updatedState);
  if (requestedSkus.length > 0) {
    const products = lookupProductsBySku(requestedSkus);
    if (products.length > 0) {
      candidates.push({
        confidence: 0.88,
        block: {
          type: "product_list_card",
          version: 1,
          data: {
            title: products.length > 1 ? "Referenced products" : "Referenced product",
            products: products.map((product) => ({
              sku: product.sku,
              name: product.name,
              category: product.category,
              color: product.color,
              size: product.size,
              priceCents: product.priceCents,
              stock: product.stock,
            })),
          },
        },
      });
    }
  }

  return pickTopConfidenceBlock(candidates);
}
