// Conversation serialization helpers for API responses and UI hydration.
import { AgentMessage, ConversationDetail, ConversationSummary, SessionState, WorkflowStep } from "@/lib/types/domain";

type PersistedConversationMessage = {
  id: string;
  role: string;
  content: string;
  createdAt: Date;
};

type PersistedConversationSession = {
  id: string;
  userId: string;
  currentStep: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  messages: PersistedConversationMessage[];
  messageCount?: number;
};

export function serializeConversationMessages(messages: PersistedConversationMessage[]): AgentMessage[] {
  return messages.map((message) => ({
    id: message.id,
    role: message.role === "assistant" || message.role === "system" ? message.role : "user",
    content: message.content,
    createdAt: message.createdAt.toISOString(),
  }));
}

function trimPreview(content: string) {
  const collapsed = content.replace(/\s+/g, " ").trim();
  return collapsed.length > 72 ? `${collapsed.slice(0, 69)}...` : collapsed;
}

export function serializeConversationSummary(session: PersistedConversationSession): ConversationSummary {
  const lastMessage = session.messages[0];

  return {
    id: session.id,
    userId: session.userId,
    currentStep: session.currentStep as WorkflowStep,
    status: session.status,
    createdAt: session.createdAt.toISOString(),
    updatedAt: session.updatedAt.toISOString(),
    messageCount: session.messageCount ?? session.messages.length,
    preview: lastMessage ? trimPreview(lastMessage.content) : "No messages yet",
    isActive: session.status === "active",
  };
}

export function serializeConversationDetail(session: PersistedConversationSession, state: SessionState): ConversationDetail {
  return {
    sessionId: session.id,
    userId: session.userId,
    currentStep: session.currentStep as WorkflowStep,
    status: session.status,
    state,
    messages: serializeConversationMessages([...session.messages].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())),
  };
}
