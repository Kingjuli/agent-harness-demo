import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { serializeConversationDetail } from "@/lib/harness/conversation";
import { createEmptyState } from "@/lib/harness/state";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const userId = String(body.userId ?? "");

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const existing = await prisma.userSession.findFirst({
    where: { userId, status: "active" },
    orderBy: { updatedAt: "desc" },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (existing) {
    const state = (existing.stateJson as object | null) ?? createEmptyState(existing.id, existing.userId);
    return NextResponse.json(serializeConversationDetail(existing, state as never));
  }

  const created = await prisma.userSession.create({
    data: {
      userId,
      stateJson: createEmptyState("temp", userId) as unknown as object,
    },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const fixedState = createEmptyState(created.id, userId);
  const updated = await prisma.userSession.update({
    where: { id: created.id },
    data: { stateJson: fixedState as unknown as object },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const state = (updated.stateJson as object | null) ?? createEmptyState(updated.id, updated.userId);
  return NextResponse.json(serializeConversationDetail(updated, state as never));
}
