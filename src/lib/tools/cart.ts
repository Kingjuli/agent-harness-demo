// Cart mutation/read tools with strict schemas.
import { z } from "zod";
import { PRODUCT_CATALOG } from "@/lib/data/seeds";
import { ToolDefinition } from "@/lib/tools/contracts";

export const cartUpdateInput = z.object({
  sku: z.string(),
  quantity: z.number().int().positive(),
});

export const cartUpdateOutput = z.object({
  cart: z.object({
    items: z.array(
      z.object({
        sku: z.string(),
        name: z.string(),
        color: z.string(),
        size: z.string(),
        quantity: z.number(),
        unitPriceCents: z.number(),
      }),
    ),
    subtotalCents: z.number(),
    shippingCents: z.number(),
    totalCents: z.number(),
    currency: z.literal("USD"),
  }),
  selectedSku: z.string(),
});

export const cartUpdateTool: ToolDefinition<typeof cartUpdateInput, typeof cartUpdateOutput> = {
  name: "cart_update",
  description: "Add or update cart quantity for a given SKU.",
  inputSchema: cartUpdateInput,
  outputSchema: cartUpdateOutput,
  async execute(input, ctx) {
    const product = PRODUCT_CATALOG.find((p) => p.sku === input.sku);
    if (!product) {
      throw new Error("Product SKU not found");
    }

    const items = [...ctx.state.cart.items];
    const idx = items.findIndex((i) => i.sku === input.sku);
    if (idx >= 0) {
      items[idx] = { ...items[idx], quantity: input.quantity };
    } else {
      items.push({
        sku: product.sku,
        name: product.name,
        color: product.color,
        size: product.size,
        quantity: input.quantity,
        unitPriceCents: product.priceCents,
      });
    }

    const subtotalCents = items.reduce((sum, it) => sum + it.quantity * it.unitPriceCents, 0);
    const shippingCents = subtotalCents > 0 ? 700 : 0;
    const totalCents = subtotalCents + shippingCents;

    return {
      cart: {
        items,
        subtotalCents,
        shippingCents,
        totalCents,
        currency: "USD",
      },
      selectedSku: product.sku,
    };
  },
};

export const cartViewInput = z.object({});

export const cartViewOutput = z.object({
  cart: z.object({
    items: z.array(
      z.object({
        sku: z.string(),
        name: z.string(),
        color: z.string(),
        size: z.string(),
        quantity: z.number(),
        unitPriceCents: z.number(),
      }),
    ),
    subtotalCents: z.number(),
    shippingCents: z.number(),
    totalCents: z.number(),
    currency: z.literal("USD"),
  }),
});

export const cartViewTool: ToolDefinition<typeof cartViewInput, typeof cartViewOutput> = {
  name: "cart_view",
  description: "Read the latest persisted cart snapshot for display.",
  inputSchema: cartViewInput,
  outputSchema: cartViewOutput,
  async execute(_input, ctx) {
    return {
      cart: ctx.state.cart,
    };
  },
};
