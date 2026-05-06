// Shipping quote tool for checkout totals.
import { z } from "zod";
import { ToolDefinition } from "@/lib/tools/contracts";

export const shippingQuoteInput = z.object({
  address: z.string().min(3),
});

export const shippingQuoteOutput = z.object({
  shippingCents: z.number(),
  etaDays: z.number(),
  service: z.string(),
});

export const shippingQuoteTool: ToolDefinition<typeof shippingQuoteInput, typeof shippingQuoteOutput> = {
  name: "shipping_quote",
  description: "Generate shipping estimate based on address.",
  inputSchema: shippingQuoteInput,
  outputSchema: shippingQuoteOutput,
  async execute(input) {
    const normalized = input.address.toLowerCase();
    const nearCity = normalized.includes("nairobi") || normalized.includes("kilimani") || normalized.includes("westlands");
    return {
      shippingCents: nearCity ? 500 : 900,
      etaDays: nearCity ? 1 : 3,
      service: nearCity ? "City Express" : "Standard Courier",
    };
  },
};
