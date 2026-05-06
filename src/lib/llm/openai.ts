// OpenAI model factory with runtime-safe defaults.
import { ChatOpenAI } from "@langchain/openai";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

export function getChatModel(reasoningEffort: ReasoningEffort = "medium"): ChatOpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
    streaming: true,
    useResponsesApi: true,
    reasoning: {
      effort: reasoningEffort,
      summary: "detailed",
    },
  });
}
