# AI Engineer Lab: MCP + RAG Track

## Audience
Engineers shipping AI features into real products.

## Duration
20 minutes.

## What You’ll Walk Away With
By the end of this lab, you should be able to:
1. Explain MCP architecture across transport, tool contract, orchestration, and retrieval layers.
2. Define system boundaries and ownership for the AI toolchain.
3. Design hybrid retrieval using dense vectors plus lexical ranking.
4. Apply confidence/ambiguity gating for answer, clarify, or abstain decisions.
5. Evaluate retrieval with offline metrics and iterate from evidence, not gut feel.

## Quick Definitions
- MCP: A standard way for models/agents to call tools.
- RAG: Retrieve relevant records first, then respond using those records.
- Hybrid retrieval: Combine vector similarity and lexical similarity.
- Confidence gating: Flagging results that are too weak or too ambiguous.

## Big Picture Flow
```text
user asks shipping quote
 -> harness calls shipping_quote tool
 -> mcp client calls get_shipping_quote
 -> rag pipeline retrieves and ranks candidates
 -> confidence gate checks ambiguity
 -> best quote returns to checkout
```

---

## Module 1 (6 min): Boundaries and Integration Path

## Why this matters
When a quote is wrong or a tool fails, the fastest fix comes from knowing exactly which layer owns the problem. This section makes those boundaries explicit.

MCP reference: [https://modelcontextprotocol.io](https://modelcontextprotocol.io)

Start with harness ownership: the harness decides when to call shipping.
```ts
// src/lib/tools/shipping.ts
const quote = await getShippingQuoteViaMcp(input.address);
if (!quote.best) throw new Error("No shipping candidates returned by MCP server");
```

Then MCP ownership: the MCP client handles the tool invocation contract.
```ts
// src/lib/mcp/shipping-client.ts
const response = await client.callTool({
  name: "get_shipping_quote",
  arguments: { address },
});
```

In one line:
```text
harness: policy + workflow
mcp: tool contract + transport
rag: retrieval quality + confidence
```

## Checkpoint
If a shipping quote fails, can you name the owner layer before writing a fix?

---

## Module 2 (8 min): Hybrid RAG Retrieval and Confidence

## Why this matters
Vector-only search often looks good in demos, then misses real-world phrasing. Hybrid retrieval is more forgiving and more reliable under messy user input.

Step 1: turn normalized user text into an embedding.
```js
// src/mcp/shipping-server/rag/embeddings.mjs
const response = await this.client.embeddings.create({ model: this.model, input: normalized });
const vector = response.data?.[0]?.embedding;
```

Step 2: retrieve candidates with vector + lexical scoring, then fuse the score.
```sql
SELECT
  (s.embedding <=> q.qv) AS vector_distance,
  similarity(s.search_text, q.q) AS lexical_score,
  (0.7 * (1 - (s.embedding <=> q.qv))) + (0.3 * similarity(s.search_text, q.q)) AS fused_score
FROM "ShippingLocationRag" s
ORDER BY fused_score DESC
LIMIT $3;
```

Step 3: apply confidence gating so we avoid low-trust answers.
```js
// src/mcp/shipping-server/rag/pipeline.mjs
const lowConfidence = !best || best.confidence < this.minConfidence;
const ambiguous = !!best && !!second && margin < this.minMargin;
const requiresClarification = lowConfidence || ambiguous;
```

Pipeline at a glance:
```text
query -> canonicalize -> embed
rows <- hybrid_retrieve(vector + lexical)
rank by fused_score
if confidence low or margin small: require clarification
return best + alternatives + diagnostics
```

## Checkpoint
Can you explain why this pipeline avoids returning a confident but wrong destination match?

---

## Module 3 (6 min): Measurement and Release Readiness

## Why this matters
If you do not measure retrieval quality, you cannot trust improvements. This section turns quality into concrete numbers.

Track the basics first:
```js
// src/mcp/shipping-server/eval/run-eval.mjs
if (bestCode === expectedCode) top1 += 1;
if (top3Codes.includes(expectedCode)) top3 += 1;
if (result.confidence?.requiresClarification) ambiguous += 1;
```

Then summarize the run:
```js
const summary = {
  top1Accuracy: pct(top1, total),
  top3Recall: pct(top3, total),
  ambiguityRate: pct(ambiguous, total),
};
```

Evaluation flow:
```text
for each labeled query:
  run pipeline
  compare expected vs returned candidates
aggregate top1/top3/ambiguity
use thresholds as release gate
```

Suggested release gates:
- Top-1 accuracy >= 95%
- Top-3 recall >= 99%
- Ambiguity rate <= 20%

## Checkpoint
Based on your latest eval report, do these numbers justify shipping now?

---

## Appendix A: Essential Commands
```bash
# infra + schema
docker compose up -d
npm run prisma:generate
npm run prisma:push

# run services
npm run dev
npm run mcp:shipping
npm run mcp:shipping:http

# quality
npm run test
npm run mcp:shipping:eval
```

## Appendix B: Fast Verification
```bash
docker compose exec -T postgres psql -U postgres -d agent_harness_demo -c "SELECT extname FROM pg_extension WHERE extname='vector';"
docker compose exec -T postgres psql -U postgres -d agent_harness_demo -c "SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector AS cosine_distance;"
```

## Appendix C: Failure Mapping
- `OPENAI_API_KEY is required`: env missing in active process.
- `extension "vector" is not available`: wrong DB image or wrong DB target.
- `UserSession does not exist`: schema not pushed to active DB.
