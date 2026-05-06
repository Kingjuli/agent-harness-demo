import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { ToolDefinition } from "@/lib/tools/contracts";
import { Prisma } from "@prisma/client";

export const escalateInput = z.object({
  reason: z.string().min(3),
  context: z.record(z.string(), z.unknown()).default({}),
});

export const escalateOutput = z.object({
  ticketId: z.string(),
  status: z.literal("open"),
});

export const escalateTool: ToolDefinition<typeof escalateInput, typeof escalateOutput> = {
  name: "escalate_to_human",
  description: "Create escalation ticket for human support.",
  inputSchema: escalateInput,
  outputSchema: escalateOutput,
  async execute(input, ctx) {
    const ticket = await prisma.escalationTicket.create({
      data: {
        sessionId: ctx.sessionId,
        reason: input.reason,
        context: input.context as Prisma.InputJsonValue,
        status: "open",
      },
    });

    return { ticketId: ticket.id, status: "open" };
  },
};
