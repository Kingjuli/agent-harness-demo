import { styleRuleForAgentResponse, styleRuleForNoTools } from "@/lib/prompting/style";
import {
  buildDecisionPolicySection,
  buildGenerativeUiSection,
  buildIdentitySection,
  buildInteractionSection,
  buildLiveContextSection,
  buildOutputPolicySection,
} from "@/lib/prompting/sections";
import { PromptChainInput } from "@/lib/prompting/types";
import { ResponseStyle } from "@/lib/harness/types";
import { SessionState } from "@/lib/types/domain";

export function buildAgentPromptChain(input: PromptChainInput) {
  const styleRule = styleRuleForAgentResponse(input.responseStyle);
  return [
    buildIdentitySection(),
    buildDecisionPolicySection(),
    buildInteractionSection(styleRule),
    buildGenerativeUiSection(),
    buildOutputPolicySection(),
    buildLiveContextSection(input.state, input.context),
  ].join("\n\n");
}

export function buildNoToolsPromptChain(state: SessionState, responseStyle: ResponseStyle) {
  const styleRule = styleRuleForNoTools(responseStyle);
  return `You are an apparel checkout assistant, but tool execution is currently disabled by policy for this run.
Do not claim actions were completed in systems. You may only provide guidance, ask clarifying questions, and explain the exact next step to continue when tools are enabled.
${styleRule}

Current persisted state:
${JSON.stringify(
    {
      workflowStep: state.workflowStep,
      cart: state.cart,
      customer: state.customer,
      order: state.order,
      payment: state.payment,
      requiresHuman: state.requiresHuman,
    },
    null,
    2,
  )}`;
}
