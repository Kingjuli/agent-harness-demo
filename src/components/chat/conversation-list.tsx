import type { ConversationSummary } from "@/lib/types/domain";

type Props = {
  conversations: ConversationSummary[];
  sessionId: string;
  loading: boolean;
  sessionLoading: boolean;
  onNew: () => void;
  onOpen: (conversation: ConversationSummary) => void;
  onDelete: (sessionId: string) => void;
};

export function ConversationList({ conversations, sessionId, loading, sessionLoading, onNew, onOpen, onDelete }: Props) {
  return (
    <div className="app-soft rounded-lg p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="app-muted text-xs font-semibold uppercase tracking-[0.12em]">Sessions</p>
        <button
          onClick={onNew}
          disabled={loading || sessionLoading}
          className="app-surface rounded-md px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide disabled:opacity-50"
        >
          New
        </button>
      </div>
      <div className="space-y-2">
        {conversations.length === 0 && <p className="app-muted text-sm">No saved conversations yet.</p>}
        {conversations.map((conversation) => {
          const selected = conversation.id === sessionId;
          return (
            <div key={conversation.id} className={`rounded-md p-2.5 ${selected ? "app-surface shadow-[inset_0_0_0_1px_var(--accent)]" : "app-surface"}`}>
              <button className="w-full text-left" onClick={() => onOpen(conversation)} disabled={loading || sessionLoading}>
                <p className="truncate text-sm font-semibold">{conversation.currentStep.replace(/_/g, " ")}</p>
                <p className="app-muted mt-1 truncate text-xs">{conversation.preview}</p>
              </button>
              <div className="mt-2 flex items-center justify-between">
                <button onClick={() => onOpen(conversation)} disabled={loading || sessionLoading} className="app-muted text-[10px] font-semibold uppercase">
                  Open
                </button>
                <button onClick={() => onDelete(conversation.id)} disabled={loading || sessionLoading} className="text-[10px] font-semibold uppercase text-rose-500">
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
