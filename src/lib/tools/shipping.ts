// Shipping quote tool for checkout totals.
import { z } from "zod";
import { ToolDefinition } from "@/lib/tools/contracts";
import { searchShippingCandidatesViaMcp } from "@/lib/mcp/shipping-client";

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
  description: "Generate shipping estimate based on address via MCP shipping service.",
  inputSchema: shippingQuoteInput,
  outputSchema: shippingQuoteOutput,
  async execute(input) {
    const candidates = await searchShippingCandidatesViaMcp(input.address);
    const best = candidates[0];
    if (!best) {
      throw new Error("No shipping candidates returned by MCP server");
    }

    return {
      shippingCents: best.shippingCents,
      etaDays: best.etaDays,
      service: best.service,
    };
  },
};
