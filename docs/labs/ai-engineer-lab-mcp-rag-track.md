# AI Engineer Lab: MCP + RAG Track (Shipping Service)

## Audience
Engineers implementing production agent integrations.

## Duration
~75 minutes (6 blocks).

## Outcome
By the end of this lab, engineers will:
1. Understand how this repo separates MCP transport, MCP tool contract, and RAG retrieval pipeline.
2. Run and verify a hybrid vector+lexical RAG flow behind an MCP server.
3. Evaluate retrieval quality with measurable metrics.
4. Diagnose failures using concrete checks (env, DB extension, schema, retrieval confidence).

## Track Scope
This track is only about the shipping MCP service and RAG retrieval path. It does not cover generic prompt engineering.

## Architecture Map
- MCP server entry (stdio): `src/mcp/shipping-server/server.mjs`
- MCP server entry (streamable HTTP): `src/mcp/shipping-server/http-server.mjs`
- MCP composition root: `src/mcp/shipping-server/core.mjs`
- MCP component (tools + handlers): `src/mcp/shipping-server/components/shipping-mcp-server-component.mjs`
- RAG pipeline (hybrid retrieval + confidence): `src/mcp/shipping-server/rag/pipeline.mjs`
- RAG repository (pgvector + pg_trgm + seed/embedding lifecycle): `src/mcp/shipping-server/rag/repository.mjs`
- Embedding provider (OpenAI embeddings): `src/mcp/shipping-server/rag/embeddings.mjs`
- Eval dataset: `src/mcp/shipping-server/eval/cases.json`
- Eval runner: `src/mcp/shipping-server/eval/run-eval.mjs`
- Harness tool adapter to MCP: `src/lib/mcp/shipping-client.ts`
- Agent tool using MCP adapter: `src/lib/tools/shipping.ts`

---

## Block 0: Prerequisites and Environment (10 min)

## Goal
Ensure the MCP server and Next app share the same DB and API credentials.

## Required variables
In `.env.local`:
- `DATABASE_URL`
- `OPENAI_API_KEY`

Example:
```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:55434/agent_harness_demo"
OPENAI_API_KEY="..."
OPENAI_MODEL="gpt-5-mini"
```

## Bring up Postgres (pgvector image)
```bash
docker compose up -d
```

## Verify extension and DB health
```bash
docker compose exec -T postgres psql -U postgres -d agent_harness_demo -c "SELECT extname FROM pg_extension WHERE extname='vector';"
docker compose exec -T postgres psql -U postgres -d agent_harness_demo -c "SELECT '[1,2,3]'::vector <=> '[1,2,4]'::vector AS cosine_distance;"
```

## Sync Prisma schema
```bash
npm run prisma:generate
npm run prisma:push
```

## Expected result
- `vector` extension exists.
- vector operator query returns a numeric distance.
- Prisma sync completes without errors.

---

## Block 1: MCP Boundary Design (10 min)

## Goal
Understand what belongs in MCP vs what belongs in harness.

## MCP tools exposed
From `shipping-mcp-server-component.mjs`:
- `search_shipping_candidates`
- `get_shipping_quote`
- `shipping_health`

## Design rule
- Harness owns policy, approvals, and user conversation.
- MCP owns integration boundary and deterministic tool contracts.
- RAG pipeline owns retrieval quality and confidence diagnostics.

## Quick run (stdio server)
```bash
npm run mcp:shipping
```

## Quick run (streamable HTTP server)
```bash
npm run mcp:shipping:http
```

## Expected result
MCP server starts without missing-env errors and accepts tool calls via adapter.

---

## Block 2: RAG Pipeline Walkthrough (15 min)

## Goal
Understand the exact retrieval flow used in production path.

## Flow implemented
1. Canonicalize query text.
2. Generate OpenAI embedding for the query.
3. Hybrid retrieval in SQL:
   - vector similarity (`<=>`)
   - lexical similarity (`similarity` from `pg_trgm`)
4. Score fusion:
   - `fused_score = 0.7 * vector_score + 0.3 * lexical_score`
5. Return top-k with retrieval diagnostics.
6. Compute confidence and ambiguity signals in pipeline.

## Key files to inspect
- `rag/embeddings.mjs`
- `rag/repository.mjs`
- `rag/pipeline.mjs`

## Expected result
Engineers can explain why this is more stable than vector-only retrieval.

---

## Block 3: Harness Integration Path (10 min)

## Goal
Trace one end-to-end shipping quote call from chat to MCP to DB and back.

## Path
1. Agent chooses `shipping_quote` tool.
2. `src/lib/tools/shipping.ts` calls `getShippingQuoteViaMcp`.
3. `src/lib/mcp/shipping-client.ts` spawns MCP server process (stdio transport).
4. MCP tool handler calls RAG pipeline.
5. Pipeline returns `best + alternatives + confidence`.
6. `shipping_quote` maps best quote to cart shipping fields.

## Expected result
Engineers can identify the exact failure point when a tool error occurs.

---

## Block 4: Reliability Validation (15 min)

## Goal
Measure retrieval quality instead of relying on intuition.

## Run evaluation
```bash
npm run mcp:shipping:eval
```

## Metrics reported
- `top1Accuracy`
- `top3Recall`
- `ambiguityRate`
- detailed misses

## Acceptance criteria (example baseline)
- Top-1 accuracy >= 95%
- Top-3 recall >= 99%
- Ambiguity rate <= 20% on current dataset

## Expected result
A JSON report that can be used as a release gate for retrieval changes.

---

## Block 5: Failure Diagnosis Playbook (15 min)

## Goal
Resolve common failures quickly with deterministic checks.

## Failure: `OPENAI_API_KEY is required`
Checks:
1. Confirm `.env.local` has `OPENAI_API_KEY`.
2. Restart process (`npm run dev` or `npm run mcp:shipping`).

## Failure: `extension "vector" is not available`
Checks:
1. Ensure DB is pgvector image (`pgvector/pgvector:pg16`).
2. Verify extension query from Block 0.
3. Ensure app points to same DB as container.

## Failure: `table UserSession does not exist`
Checks:
1. Run `npm run prisma:push` against the active `DATABASE_URL`.
2. Restart Next dev server and clear `.next` if needed.

## Failure: quote mismatch for similar addresses
Checks:
1. Run `npm run mcp:shipping:eval`.
2. Inspect `retrieval` diagnostics in responses.
3. Tune fusion weights or dataset coverage; do not add hardcoded if/else routing.

---

## Teaching Script (No-Fluff)
Use this order when teaching:
1. Show architecture map and strict boundaries.
2. Run env/DB checks live.
3. Run one quote call and trace files touched.
4. Run eval and discuss metrics.
5. Trigger one failure intentionally, fix with playbook.

This sequence demonstrates production engineering behavior: define contracts, verify infra, measure quality, and debug with evidence.

---

## Commands Reference
```bash
# Setup
npm install
docker compose up -d
npm run prisma:generate
npm run prisma:push

# Servers
npm run dev
npm run mcp:shipping
npm run mcp:shipping:http

# Quality
npm run test
npm run mcp:shipping:eval
```
