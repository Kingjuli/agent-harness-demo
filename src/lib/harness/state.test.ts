// Tests for session state initialization and defaults.
import { describe, expect, it } from "vitest";
import { serializeConversationDetail, serializeConversationMessages, serializeConversationSummary } from "@/lib/harness/conversation";
import { createEmptyState } from "@/lib/harness/state";

describe("session state", () => {
  it("creates default state", () => {
    const s = createEmptyState("session-1", "u_amina");
    expect(s.sessionId).toBe("session-1");
    expect(s.workflowStep).toBe("browsing");
    expect(s.cart.items).toHaveLength(0);
  });
});

describe("conversation messages", () => {
  it("serializes persisted messages for the client", () => {
    const messages = serializeConversationMessages([
      {
        id: "m1",
        role: "assistant",
        content: "Welcome back.",
        createdAt: new Date("2026-05-06T08:00:00.000Z"),
      },
      {
        id: "m2",
        role: "unexpected",
        content: "Hello",
        createdAt: new Date("2026-05-06T08:01:00.000Z"),
      },
    ]);

    expect(messages).toEqual([
      {
        id: "m1",
        role: "assistant",
        content: "Welcome back.",
        createdAt: "2026-05-06T08:00:00.000Z",
      },
      {
        id: "m2",
        role: "user",
        content: "Hello",
        createdAt: "2026-05-06T08:01:00.000Z",
      },
    ]);
  });

  it("summarizes sessions for the conversation list", () => {
    const summary = serializeConversationSummary({
      id: "s1",
      userId: "u1",
      currentStep: "reviewing_order",
      status: "active",
      createdAt: new Date("2026-05-06T08:00:00.000Z"),
      updatedAt: new Date("2026-05-06T09:00:00.000Z"),
      messages: [
        {
          id: "m1",
          role: "assistant",
          content: "Your order is ready.",
          createdAt: new Date("2026-05-06T09:00:00.000Z"),
        },
      ],
    });

    expect(summary.preview).toBe("Your order is ready.");
    expect(summary.messageCount).toBe(1);
    expect(summary.isActive).toBe(true);
  });

  it("serializes conversation details with ordered messages", () => {
    const state = createEmptyState("s1", "u1");
    const detail = serializeConversationDetail(
      {
        id: "s1",
        userId: "u1",
        currentStep: "browsing",
        status: "active",
        createdAt: new Date("2026-05-06T08:00:00.000Z"),
        updatedAt: new Date("2026-05-06T09:00:00.000Z"),
        messages: [
          {
            id: "m2",
            role: "assistant",
            content: "Second",
            createdAt: new Date("2026-05-06T08:01:00.000Z"),
          },
          {
            id: "m1",
            role: "user",
            content: "First",
            createdAt: new Date("2026-05-06T08:00:00.000Z"),
          },
        ],
      },
      state,
    );

    expect(detail.messages.map((message) => message.id)).toEqual(["m1", "m2"]);
  });
});
