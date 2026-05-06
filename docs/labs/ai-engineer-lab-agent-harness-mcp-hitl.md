# AI Engineer Lab: System-Based Agents (Reasoning, Tools, HITL, MCP)

## Audience
Engineers building production AI features (backend, frontend, platform).

## Duration
~49 minutes (7 blocks × 7 minutes).

## Lab goal
Move from "prompting as a trick" to "AI as a governed software system" using this codebase.

## Repo map (read first)
- Orchestrator: `src/lib/harness/runtime.ts`
- Prompt + GenUI contract: `src/lib/harness/prompt-ui.ts`
- State machine + transitions: `src/lib/harness/state-machine.ts`
- Context/token budgeting: `src/lib/harness/context-budget.ts`
- Tool contracts and registry: `src/lib/tools/contracts.ts`, `src/lib/tools/registry.ts`
- Guardrails: `src/lib/harness/guardrails.ts`
- Chat route + approval continuation: `src/app/api/agent/chat/route.ts`

---

## Block 1 (7 min): Why Prompting Is a Feature, Not the Product

## Problem this solves
Teams ship demos that work in notebooks but fail in production due to lack of controls.

## Concepts
- Prompting = one capability.
- Production = model + tools + policy + state + observability.

## Code anchors
- `src/lib/harness/runtime.ts`
- `src/lib/types/domain.ts`

## Demo checkpoint
Explain the maturity jump:
1. Isolated prompt call
2. Tool-aware agent
3. Harness-governed agent
4. Auditable production system

---

## Block 2 (7 min): Reasoning Layer (Model Planning Loop)

## Problem this solves
How does the model decide whether to answer directly or call tools?

## Code snippet
```ts
// src/lib/harness/runtime.ts
const agent = createReactAgent({
  llm: model,
  tools: toolPermission === "allow"
    ? createAgentTools(session.id, stateRef, toolTrace, harnessEvents, input.onStream)
    : [],
  prompt: toolPermission === "allow"
    ? agentPrompt(stateRef.current, input.responseStyle ?? "standard", { stateText, catalogText: catalog.text })
    : noToolsPrompt(stateRef.current, input.responseStyle ?? "standard"),
});
```

## Demo checkpoint
Show where reasoning starts and where harness takes over.

---

## Block 3 (7 min): Tool Calling as Capability Extension

## Problem this solves
Model knowledge alone cannot mutate real systems safely.

## Code snippet
```ts
// src/lib/tools/contracts.ts
export interface ToolDefinition<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny> {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  execute: (input: z.infer<TInput>, ctx: ToolContext) => Promise<z.infer<TOutput>>;
}
```

```ts
// src/lib/tools/registry.ts
export const TOOL_REGISTRY: Record<string, AnyTool> = {
  catalog_lookup: catalogLookupTool,
  cart_update: cartUpdateTool,
  cart_view: cartViewTool,
  shipping_quote: shippingQuoteTool,
  customer_details_upsert: customerDetailsTool,
  order_create: orderCreateTool,
  payment_initiate: paymentInitiateTool,
  payment_status_check: paymentStatusCheckTool,
  escalate_to_human: escalateTool,
};
```

## Demo checkpoint
Show one request that triggers 1+ tool calls and inspect `toolTrace`.

---

## Block 4 (7 min): Human-in-the-Loop (HITL) Approval Gate

## Problem this solves
Prevent unauthorized or risky side effects.

## Code snippets
```ts
// src/lib/harness/runtime.ts
if (toolPermission === "request") {
  const requestedTools = Object.keys(TOOL_REGISTRY);
  return {
    requiresToolApproval: true,
    requestedTools,
    approvalReason: "Tool execution is set to Request mode.",
    status: "needs_input",
    // ...
  };
}
```

```ts
// src/app/api/agent/chat/route.ts
if (approvalDecision === "approved") {
  const approvedResult = await runAgentTurn({
    sessionId,
    userMessage: pending.userMessage,
    persistUserMessage: false,
    responseStyle: pending.responseStyle,
    reasoningEffort: pending.reasoningEffort,
    toolPermission: "allow",
  });
}
```

## Hands-on
1. Switch to `request` mode.
2. Ask for a tool-backed action.
3. Deny once, approve once.

## Expected
No tool side effects before approval.

---

## Block 5 (7 min): Self-Correction and Recovery Loop

## Problem this solves
Tool/API failure should degrade gracefully, not crash the workflow.

## Code snippet
```ts
// src/lib/harness/runtime.ts (createAgentTools)
try {
  const rawOutput = await definition.execute(parsedInput, { sessionId, state: stateRef.current });
  // success path
} catch (error) {
  stateRef.current = appendStateEvent(stateRef.current, {
    currentMode: "Recovering",
    recoveryNotes: compactList([...stateRef.current.harness.recoveryNotes, `${definition.name} failed: ${detail}`]),
  });
  // emit recovery event + trace
  throw error;
}
```

## Hands-on
Force a tool error temporarily and inspect `harnessEvents` + `recoveryNotes`.

---

## Block 6 (7 min): Prompt Contract + GenUI Signaling

## Problem this solves
How the model requests UI affordances without brittle keyword routing.

## Code snippets
```ts
// src/lib/harness/prompt-ui.ts (prompt contract)
// model can emit: <show_customer_details_form/>
```

```ts
// src/lib/harness/prompt-ui.ts
export function buildUiBlocks(input: { assistantMessage: string; updatedState: SessionState; traces: ToolTrace[] }) {
  // parse model tags + state, return typed UI block(s)
}
```

## Hands-on
Ask model to update contact details and verify it emits form intent + UI renders.

---

## Block 7 (7 min): MCP Positioning for Real Integrations

## Problem this solves
Avoid connector sprawl when integrating local/enterprise systems.

## What to explain
- MCP is a standard interface layer between model/harness and enterprise services.
- Keep policy and approvals in harness.
- Keep business systems stable; expose selective operations via MCP.

## Kenya-focused examples
- Payments and settlement services
- SACCO/member ledgers
- ERP/CRM read actions with approval-gated write actions

## Outcome
Engineers can map this repo architecture to MCP-backed production integrations.

---

## Validation checklist (for engineers)
- [ ] Can explain why runtime, prompt, state-machine, and context-budget are split.
- [ ] Can add a new tool with input/output schema and register it.
- [ ] Can enable/verify HITL approvals.
- [ ] Can observe recovery behavior on tool failure.
- [ ] Can add one new GenUI tag contract and render flow.

## Run commands
```bash
npm install
npm run dev
npm run test
npm run lint
```

## Stretch tasks
1. Add `customer_balance_lookup` as a new tool and wire trace output.
2. Add policy: require approval only when amount > threshold.
3. Add a second UI tag for "show payment summary" and render it.
