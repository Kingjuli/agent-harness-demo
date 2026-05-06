import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { makeRef } from "@/lib/utils/id";
import { ToolDefinition } from "@/lib/tools/contracts";

export const paymentInitiateInput = z.object({
  orderRef: z.string(),
  amountCents: z.number().int().positive(),
  method: z.enum(["card", "mpesa", "paypal"]),
});

export const paymentInitiateOutput = z.object({
  paymentRef: z.string(),
  status: z.enum(["pending", "success", "failed"]),
});

export const paymentStatusCheckInput = z.object({
  paymentRef: z.string(),
});

export const paymentStatusCheckOutput = z.object({
  paymentRef: z.string(),
  status: z.enum(["pending", "success", "failed"]),
});

export const paymentInitiateTool: ToolDefinition<typeof paymentInitiateInput, typeof paymentInitiateOutput> = {
  name: "payment_initiate",
  description: "Initiate payment and return pending status.",
  inputSchema: paymentInitiateInput,
  outputSchema: paymentInitiateOutput,
  async execute(input) {
    const order = await prisma.orderRecord.findUnique({ where: { orderRef: input.orderRef } });
    if (!order) throw new Error("Order not found");

    const paymentRef = makeRef("PAY");

    await prisma.paymentRecord.create({
      data: {
        orderId: order.id,
        paymentRef,
        status: "pending",
        amountCents: input.amountCents,
        currency: "USD",
        method: input.method,
      },
    });

    return { paymentRef, status: "pending" };
  },
};

export const paymentStatusCheckTool: ToolDefinition<typeof paymentStatusCheckInput, typeof paymentStatusCheckOutput> = {
  name: "payment_status_check",
  description: "Check payment state using deterministic transitions.",
  inputSchema: paymentStatusCheckInput,
  outputSchema: paymentStatusCheckOutput,
  async execute(input) {
    const payment = await prisma.paymentRecord.findUnique({ where: { paymentRef: input.paymentRef } });
    if (!payment) throw new Error("Payment not found");

    const nextChecks = payment.statusChecks + 1;
    let nextStatus: "pending" | "success" | "failed" = payment.status as "pending" | "success" | "failed";

    // Deterministic strategy: check#1 remains pending, check#2 succeeds.
    if (payment.status === "pending" && nextChecks >= 2) {
      nextStatus = "success";
    }

    await prisma.paymentRecord.update({
      where: { paymentRef: input.paymentRef },
      data: {
        statusChecks: nextChecks,
        status: nextStatus,
      },
    });

    if (nextStatus === "success") {
      await prisma.orderRecord.update({ where: { id: payment.orderId }, data: { status: "paid" } });
    }

    return { paymentRef: input.paymentRef, status: nextStatus };
  },
};
