// Factory helpers for initializing a new session state.
import { SessionState } from "@/lib/types/domain";

export function createEmptyState(sessionId: string, userId: string): SessionState {
  return {
    sessionId,
    userId,
    workflowStep: "browsing",
    harness: {
      goal: "Guide the customer from product intent to paid apparel order.",
      currentMode: "Talking",
      loopCount: 0,
      lastIntent: "new_session",
      lastPlan: [],
      observations: [],
      guardrailFindings: [],
      recoveryNotes: [],
    },
    preferences: {},
    cart: {
      items: [],
      subtotalCents: 0,
      shippingCents: 0,
      totalCents: 0,
      currency: "USD",
    },
    customer: {},
    confidence: 0.9,
    requiresHuman: false,
  };
}
