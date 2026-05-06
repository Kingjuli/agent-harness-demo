import { ResponseStyle } from "@/lib/harness/types";

export function styleRuleForAgentResponse(responseStyle: ResponseStyle) {
  if (responseStyle === "brief") return "Keep the final response short (2-4 sentences max) and only include essential next actions.";
  if (responseStyle === "detailed") return "Provide a fuller answer with clear sections and practical detail (typically 6-12 sentences when useful).";
  return "Keep the final customer response concise but complete (typically 4-8 sentences when needed).";
}

export function styleRuleForNoTools(responseStyle: ResponseStyle) {
  if (responseStyle === "brief") return "Keep the response short (2-4 sentences max).";
  if (responseStyle === "detailed") return "Provide a fuller response with clear sections and practical detail.";
  return "Keep the response concise but complete.";
}
