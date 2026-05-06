import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { serializeConversationSummary } from "@/lib/harness/conversation";

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")?.trim() ?? "";

  if (!userId) {
    return NextResponse.json({ error: "userId is required" }, { status: 400 });
  }

  const sessions = await prisma.userSession.findMany({
    where: { userId },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      userId: true,
      currentStep: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          role: true,
          content: true,
          createdAt: true,
        },
      },
      _count: {
        select: {
          messages: true,
        },
      },
    },
  });

  return NextResponse.json({
    sessions: sessions.map((session) =>
      serializeConversationSummary({
        ...session,
        messageCount: session._count.messages,
      }),
    ),
  });
}
