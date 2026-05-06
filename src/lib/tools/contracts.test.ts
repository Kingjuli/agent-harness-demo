import { describe, expect, it } from "vitest";
import { catalogLookupInput } from "@/lib/tools/catalog";
import { cartUpdateInput } from "@/lib/tools/cart";

describe("tool schemas", () => {
  it("validates catalog lookup input", () => {
    const parsed = catalogLookupInput.parse({ category: "hoodie", color: "blue", size: "M" });
    expect(parsed.category).toBe("hoodie");
  });

  it("rejects invalid cart quantity", () => {
    expect(() => cartUpdateInput.parse({ sku: "HD-BLU-M", quantity: 0 })).toThrow();
  });
});
