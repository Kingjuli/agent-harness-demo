import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { createEmptyState } from "@/lib/harness/state";
import { serializeConversationDetail } from "@/lib/harness/conversation";

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

async function loadSession(sessionId: string) {
  return prisma.userSession.findUnique({
    where: { id: sessionId },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function GET(_: NextRequest, context: RouteContext) {
  const { sessionId } = await context.params;
  const session = await loadSession(sessionId);

  if (!session) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const state = (session.stateJson as object | null) ?? createEmptyState(session.id, session.userId);
  return NextResponse.json(serializeConversationDetail(session, state as never));
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  const body = await req.json().catch(() => ({}));
  const currentSessionId = String(body.currentSessionId ?? "");
  const { sessionId } = await context.params;

  const deleted = await prisma.userSession.findUnique({
    where: { id: sessionId },
    select: { id: true, userId: true },
  });

  if (!deleted) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const replacementSessionId = await prisma.$transaction(async (tx) => {
    await tx.userSession.delete({ where: { id: sessionId } });

    const remaining = await tx.userSession.findFirst({
      where: { userId: deleted.userId },
      orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    });

    if (!remaining) {
      const created = await tx.userSession.create({
        data: {
          userId: deleted.userId,
          status: "active",
          stateJson: createEmptyState("temp", deleted.userId) as unknown as object,
        },
      });

      const fixedState = createEmptyState(created.id, deleted.userId);
      const updated = await tx.userSession.update({
        where: { id: created.id },
        data: { stateJson: fixedState as unknown as object },
      });

      return updated.id;
    }

    if (currentSessionId === sessionId) {
      await tx.userSession.updateMany({
        where: { userId: deleted.userId },
        data: { status: "archived" },
      });

      await tx.userSession.update({
        where: { id: remaining.id },
        data: { status: "active" },
      });
    }

    return currentSessionId === sessionId ? remaining.id : currentSessionId || remaining.id;
  });

  return NextResponse.json({
    deletedSessionId: sessionId,
    replacementSessionId,
  });
}
