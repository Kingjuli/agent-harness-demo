import { NextRequest, NextResponse } from "next/server";
import { runAgentTurn } from "@/lib/harness/runtime";
import type { AgentStreamEvent, ResponseStyle, ToolPermission } from "@/lib/harness/types";
import type { ReasoningEffort } from "@/lib/llm/openai";

const pendingApprovals = new Map<
  string,
  {
    sessionId: string;
    userMessage: string;
    responseStyle: ResponseStyle;
    reasoningEffort: ReasoningEffort;
  }
>();

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
    const toolPermission = (["allow", "deny", "request"].includes(String(body.toolPermission))
      ? String(body.toolPermission)
      : "allow") as ToolPermission;
    const approvalRequestId = typeof body.approvalRequestId === "string" ? body.approvalRequestId : "";
    const approvalDecision = body.approved === true ? "approved" : body.approved === false ? "denied" : null;

    if (!sessionId || !userMessage) {
      if (!(approvalRequestId && approvalDecision)) {
        return NextResponse.json({ error: "sessionId and userMessage are required" }, { status: 400 });
      }
    }

    if (approvalRequestId && approvalDecision) {
      const pending = pendingApprovals.get(approvalRequestId);
      if (!pending || pending.sessionId !== sessionId) {
        return NextResponse.json({ error: "Approval request not found or expired." }, { status: 404 });
      }
      pendingApprovals.delete(approvalRequestId);

      if (approvalDecision === "denied") {
        const deniedResult = await runAgentTurn({
          sessionId,
          userMessage: pending.userMessage,
          persistUserMessage: false,
          responseStyle: pending.responseStyle,
          reasoningEffort: pending.reasoningEffort,
          toolPermission: "deny",
        });
        return NextResponse.json({
          ...deniedResult,
          requiresToolApproval: false,
        });
      }

      const approvedResult = await runAgentTurn({
        sessionId,
        userMessage: pending.userMessage,
        persistUserMessage: false,
        responseStyle: pending.responseStyle,
        reasoningEffort: pending.reasoningEffort,
        toolPermission: "allow",
      });
      return NextResponse.json({
        ...approvedResult,
        requiresToolApproval: false,
      });
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
                toolPermission,
              });
              if (result.requiresToolApproval && result.approvalRequestId) {
                pendingApprovals.set(result.approvalRequestId, {
                  sessionId,
                  userMessage,
                  responseStyle,
                  reasoningEffort,
                });
              }

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
                  toolPermission,
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

    let result = await runAgentTurn({ sessionId, userMessage, persistUserMessage: true, responseStyle, reasoningEffort, toolPermission });
    if (result.requiresToolApproval && result.approvalRequestId) {
      pendingApprovals.set(result.approvalRequestId, {
        sessionId,
        userMessage,
        responseStyle,
        reasoningEffort,
      });
    }
    const combinedTrace = [...result.toolTrace];
    const combinedEvents = [...result.harnessEvents];

    for (let i = 1; i < maxTurns; i += 1) {
      if (result.status !== "ok") break;
      if (result.updatedState.workflowStep !== "payment_pending") break;

      result = await runAgentTurn({ sessionId, userMessage: "", persistUserMessage: false, responseStyle, reasoningEffort, toolPermission });
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
