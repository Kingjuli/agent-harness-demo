import { NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/harness/runtime";
import type { AgentStreamEvent, ResponseStyle } from "@/lib/harness/runtime";
import type { ReasoningEffort } from "@/lib/llm/openai";

function encodeSse(event: AgentStreamEvent | { type: "complete" } | { type: "error"; error: string }) {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sessionId = String(body.sessionId ?? "");
    const userMessage = String(body.userMessage ?? "");
    const maxTurnsRaw = Number(body.maxTurns ?? 4);
    const maxTurns = Number.isFinite(maxTurnsRaw) ? Math.min(Math.max(Math.floor(maxTurnsRaw), 1), 8) : 4;
    const shouldStream = body.stream === true;
    const responseStyle = (body.responseStyle === "brief" || body.responseStyle === "detailed" ? body.responseStyle : "standard") as ResponseStyle;
    const reasoningEffort = (["none", "minimal", "low", "medium", "high", "xhigh"].includes(String(body.reasoningEffort))
      ? String(body.reasoningEffort)
      : "medium") as ReasoningEffort;

    if (!sessionId || !userMessage) {
      return NextResponse.json({ error: "sessionId and userMessage are required" }, { status: 400 });
    }

    if (shouldStream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          const send = (event: AgentStreamEvent | { type: "complete" } | { type: "error"; error: string }) => {
            controller.enqueue(encoder.encode(encodeSse(event)));
          };

          void (async () => {
            try {
              let result = await runAgentTurn({
                sessionId,
                userMessage,
                persistUserMessage: true,
                onStream: send,
                responseStyle,
                reasoningEffort,
              });

              for (let i = 1; i < maxTurns; i += 1) {
                if (result.status !== "ok") break;
                if (result.updatedState.workflowStep !== "payment_pending") break;

                result = await runAgentTurn({
                  sessionId,
                  userMessage: "",
                  persistUserMessage: false,
                  onStream: send,
                  responseStyle,
                  reasoningEffort,
                });
              }

              send({ type: "complete" });
            } catch (error) {
              send({ type: "error", error: error instanceof Error ? error.message : "Unknown error" });
            } finally {
              controller.close();
            }
          })();
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    let result = await runAgentTurn({ sessionId, userMessage, persistUserMessage: true, responseStyle, reasoningEffort });
    const combinedTrace = [...result.toolTrace];
    const combinedEvents = [...result.harnessEvents];

    for (let i = 1; i < maxTurns; i += 1) {
      if (result.status !== "ok") break;
      if (result.updatedState.workflowStep !== "payment_pending") break;

      result = await runAgentTurn({ sessionId, userMessage: "", persistUserMessage: false, responseStyle, reasoningEffort });
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
