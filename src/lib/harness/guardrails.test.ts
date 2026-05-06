// Tests for checkout guardrail behavior.
import { describe, expect, it } from "vitest";
import { createEmptyState } from "@/lib/harness/state";
import { validateStateForCheckout } from "@/lib/harness/guardrails";

describe("guardrails", () => {
  it("blocks empty cart", () => {
    const state = createEmptyState("s1", "u1");
    const result = validateStateForCheckout(state);
    expect(result.ok).toBe(false);
  });

  it("blocks missing customer details", () => {
    const state = createEmptyState("s1", "u1");
    state.cart.items.push({
      sku: "HD-BLU-M",
      name: "Classic Hoodie",
      color: "blue",
      size: "M",
      quantity: 1,
      unitPriceCents: 4200,
    });
    const result = validateStateForCheckout(state);
    expect(result.ok).toBe(false);
  });
});
