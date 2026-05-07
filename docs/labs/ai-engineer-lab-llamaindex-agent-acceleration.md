# AI Engineer Lab: LlamaIndex for Agentic Acceleration

## Audience
Engineers shipping AI features with limited time and small teams.

## What You’ll Walk Away With
By the end of this lab, you should be able to:
1. Explain where LlamaIndex reduces custom engineering effort in agentic systems.
2. Choose when to use LlamaIndex abstractions vs custom harness code.
3. Assemble a minimal agentic pipeline using LlamaIndex primitives.
4. Integrate MCP-exposed tools and retrieval into that pipeline.
5. Evaluate tradeoffs: speed, control, observability, and lock-in.

## Quick Definitions
- LlamaIndex: Framework for building retrieval and agent workflows with reusable components.
- Agentic application: AI system that plans, uses tools, and handles multi-step tasks.
- Abstraction leverage: Using framework primitives to avoid rebuilding common infrastructure.

## Why this lab
Most teams can build agentic demos quickly but lose time on infrastructure code. LlamaIndex helps teams ship faster by providing ready-made retrieval, tool orchestration, and workflow components.

---

## What Work LlamaIndex Removes

## Key point
LlamaIndex removes repetitive plumbing so engineers can focus on domain logic.

Manual build path:
```text
custom retriever wiring
+ custom ranking/fusion orchestration
+ custom tool execution loop
+ custom agent step loop
+ custom memory/state glue
+ custom tracing hooks
```

LlamaIndex-assisted path:
```text
index/retriever primitives
+ built-in query engines
+ tool wrappers
+ agent workflow primitives
+ memory abstractions
+ callback/tracing integrations
```

Use this rule:
```text
if requirement is standard -> use framework primitive
if requirement is domain-specific or policy-critical -> customize in harness
```

## Checkpoint
Can you name two components you should not hand-build for v1?

---

## Minimal LlamaIndex Agent Stack

## Key point
Start with the smallest stack that supports retrieval + tool use + guardrails.

Concept snippet (retrieval setup):
```python
# pseudocode
from llama_index.core import VectorStoreIndex, SimpleDirectoryReader

docs = SimpleDirectoryReader("data/").load_data()
index = VectorStoreIndex.from_documents(docs)
retriever = index.as_retriever(similarity_top_k=5)
```

Concept snippet (tool-enabled agent):
```python
# pseudocode
from llama_index.core.tools import FunctionTool
from llama_index.core.agent import ReActAgent

shipping_tool = FunctionTool.from_defaults(fn=get_shipping_quote)
agent = ReActAgent.from_tools([shipping_tool], retriever=retriever)
result = agent.chat("Quote shipping to Kisii town")
```

Concept snippet (MCP integration pattern):
```text
llamaindex agent
 -> tool wrapper
 -> mcp client
 -> mcp server tool
 -> response normalized back to agent
```

## Checkpoint
Can you explain what remains your responsibility after adopting framework primitives?

---

## Integration Strategy and Tradeoffs

## Key point
Framework acceleration is useful only if boundaries and reliability remain clear.

Recommended boundary model:
```text
harness owns policy, approvals, session state, audit trail
llamaindex owns retrieval/agent primitives and workflow acceleration
mcp owns external tool contract and transport
```

Tradeoff matrix:
- Speed: Faster initial delivery with framework defaults.
- Control: Lower low-level control unless you extend/override internals.
- Reliability: Better baseline if you keep explicit gating and eval loops.
- Portability: Higher migration cost if framework-specific patterns spread everywhere.

Evaluation loop:
```text
start with framework defaults
measure with offline and staging eval
override only bottlenecked layers
keep policy-critical logic outside framework internals
```

## Checkpoint
Where would you draw the boundary between fast abstraction use and custom reliability code?

---

## Appendix A: Suggested Exercise
1. Implement one retrieval flow with LlamaIndex defaults.
2. Wire one MCP-backed tool through a tool wrapper.
3. Add confidence gating at harness level.
4. Compare delivery time vs the custom baseline path.

## Appendix B: Decision Heuristic
Use LlamaIndex when:
- You need to ship a reliable prototype quickly.
- Your retrieval/tooling needs are mostly standard.
- Team capacity is constrained.

Use custom-first when:
- You need strict low-level control over orchestration.
- Compliance or policy requires explicit bespoke execution paths.
- Framework constraints block critical requirements.
