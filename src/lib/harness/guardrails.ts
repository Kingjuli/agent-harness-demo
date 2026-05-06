// Guardrail checks that gate risky workflow transitions.
import { SessionState } from "@/lib/types/domain";

export function validateStateForCheckout(state: SessionState): { ok: boolean; reason?: string } {
  if (state.cart.items.length === 0) return { ok: false, reason: "Cart is empty." };
  if (!state.customer.name || !state.customer.email || !state.customer.phone || !state.customer.address) {
    return { ok: false, reason: "Missing customer details." };
  }
  return { ok: true };
}
