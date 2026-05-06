import { ChatOpenAI } from "@langchain/openai";

export function getChatModel(): ChatOpenAI | null {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;

  return new ChatOpenAI({
    apiKey,
    model: process.env.OPENAI_MODEL ?? "gpt-5-mini",
  });
}
