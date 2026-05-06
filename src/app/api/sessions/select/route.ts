import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createEmptyState } from "@/lib/harness/state";
import { serializeConversationDetail } from "@/lib/harness/conversation";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = String(body.userId ?? "");
  const sessionId = String(body.sessionId ?? "");

  if (!userId || !sessionId) {
    return NextResponse.json({ error: "userId and sessionId are required" }, { status: 400 });
  }

  const session = await prisma.userSession.findFirst({
    where: { id: sessionId, userId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    await tx.userSession.updateMany({
      where: { userId, id: { not: sessionId } },
      data: { status: "archived" },
    });

    return tx.userSession.update({
      where: { id: sessionId },
      data: { status: "active" },
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
        },
      },
    });
  });

  const state = (updated.stateJson as object | null) ?? createEmptyState(updated.id, updated.userId);
  return NextResponse.json(serializeConversationDetail(updated, state as never));
}
