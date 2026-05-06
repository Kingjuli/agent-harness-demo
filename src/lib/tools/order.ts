// Order creation tool backed by persistence.
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { makeRef } from "@/lib/utils/id";
import { ToolDefinition } from "@/lib/tools/contracts";
import { Prisma } from "@prisma/client";

export const orderCreateInput = z.object({
  shippingCents: z.number().int().nonnegative(),
});

export const orderCreateOutput = z.object({
  orderRef: z.string(),
  totalCents: z.number(),
});

export const orderCreateTool: ToolDefinition<typeof orderCreateInput, typeof orderCreateOutput> = {
  name: "order_create",
  description: "Create a draft order from current cart and customer profile.",
  inputSchema: orderCreateInput,
  outputSchema: orderCreateOutput,
  async execute(input, ctx) {
    const orderRef = makeRef("ORD");
    const subtotal = ctx.state.cart.items.reduce((acc, item) => acc + item.quantity * item.unitPriceCents, 0);
    const totalCents = subtotal + input.shippingCents;

    await prisma.orderRecord.create({
      data: {
        sessionId: ctx.sessionId,
        orderRef,
        status: "created",
        customerName: ctx.state.customer.name,
        email: ctx.state.customer.email,
        phone: ctx.state.customer.phone,
        address: ctx.state.customer.address,
        totalCents,
        currency: "USD",
        payload: {
          items: ctx.state.cart.items,
          shippingCents: input.shippingCents,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    return { orderRef, totalCents };
  },
};
