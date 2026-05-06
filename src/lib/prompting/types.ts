import { ResponseStyle } from "@/lib/harness/types";
import { SessionState } from "@/lib/types/domain";

export type PromptContext = {
  stateText: string;
  catalogText: string;
};

export type PromptChainInput = {
  state: SessionState;
  responseStyle: ResponseStyle;
  context: PromptContext;
};
