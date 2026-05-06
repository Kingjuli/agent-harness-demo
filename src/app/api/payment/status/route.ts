import { NextRequest, NextResponse } from "next/server";
import { getTool } from "@/lib/tools/registry";
import { prisma } from "@/lib/db/prisma";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const sessionId = String(body.sessionId ?? "");
  const paymentRef = String(body.paymentRef ?? "");

  if (!sessionId || !paymentRef) {
    return NextResponse.json({ error: "sessionId and paymentRef are required" }, { status: 400 });
  }

  const session = await prisma.userSession.findUnique({ where: { id: sessionId } });
  if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });

  const tool = getTool("payment_status_check");
  const output = await tool.execute({ paymentRef }, { sessionId, state: session.stateJson as never });

  return NextResponse.json(output);
}
