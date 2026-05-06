import { NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/harness/runtime";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    const userMessage = String(body.userMessage ?? "");
    const maxTurnsRaw = Number(body.maxTurns ?? 4);
    const maxTurns = Number.isFinite(maxTurnsRaw) ? Math.min(Math.max(Math.floor(maxTurnsRaw), 1), 8) : 4;

    if (!sessionId || !userMessage) {
      return NextResponse.json({ error: "sessionId and userMessage are required" }, { status: 400 });
    }

    let result = await runAgentTurn({ sessionId, userMessage, persistUserMessage: true });
    const combinedTrace = [...result.toolTrace];
    const combinedEvents = [...result.harnessEvents];

    for (let i = 1; i < maxTurns; i += 1) {
      if (result.status !== "ok") break;
      if (result.updatedState.workflowStep !== "payment_pending") break;

      result = await runAgentTurn({ sessionId, userMessage: "", persistUserMessage: false });
      combinedTrace.push(...result.toolTrace);
      combinedEvents.push(...result.harnessEvents);
    }

    return NextResponse.json({
      ...result,
      toolTrace: combinedTrace,
      harnessEvents: combinedEvents,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
