import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createEmptyState } from "@/lib/harness/state";
import { serializeConversationDetail } from "@/lib/harness/conversation";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = String(body.userId ?? "");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const session = await prisma.$transaction(async (tx) => {
    await tx.userSession.updateMany({
      where: { userId },
      data: { status: "archived" },
    });

    const created = await tx.userSession.create({
      data: {
        userId,
        status: "active",
        stateJson: createEmptyState("temp", userId) as unknown as object,
      },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });

    const fixedState = createEmptyState(created.id, userId);
    return tx.userSession.update({
      where: { id: created.id },
      data: { stateJson: fixedState as unknown as object },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  return NextResponse.json(serializeConversationDetail(session, session.stateJson as never));
}
