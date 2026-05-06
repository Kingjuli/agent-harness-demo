# AI Agent Harness Demo (Next.js)

A single-app Next.js demo that teaches how to build an AI agent harness for apparel checkout.

## What this includes
- Start Session screen (no auth, selectable demo users)
- Storefront + conversational checkout UI
- LangGraph runtime loop for agent/harness orchestration
- Structured harness events for observe, plan, tool, guardrail, recovery, and response stages
- Multi-step turn plans with visible step status and tool reasoning
- OpenAI model integration (`gpt-5-mini` default)
- Strict tool contracts with zod schemas
- Prisma + Postgres persistence for sessions, traces, orders, and payments
- Deterministic payment simulation (`pending -> success`)

## Tech stack
- Next.js App Router + TypeScript + Tailwind
- LangGraph + LangChain Core + LangChain OpenAI
- Prisma + PostgreSQL
- Vitest for unit tests

## Quick start
1. Install dependencies
```bash
npm install
```

2. Configure environment
```bash
cp .env.example .env.local
```
Update `DATABASE_URL` and `OPENAI_API_KEY`.

3. Generate Prisma client
```bash
npm run prisma:generate
```

4. Create database schema (choose one)
```bash
npm run prisma:push
# or
npm run prisma:migrate -- --name init
```

5. Start the app
```bash
npm run dev
```

Open `http://localhost:3000`.

## Demo flow
1. Select a demo user on `/start`.
2. Go to `/storefront` and pick a product or send chat messages.
3. Harness observes intent and state, creates a plan, and executes the next allowed tool steps.
4. Guardrails block missing customer details or payment without confirmation.
5. Harness creates the order, initiates payment, checks provider status, and records recovery when a tool fails.
6. Harness panel shows workflow state, plan status, event stream, observations, and tool traces.

## API routes
- `POST /api/session/init` — create/load session
- `GET /api/demo/users` — list demo users
- `POST /api/agent/chat` — execute one agent turn
- `POST /api/payment/status` — manual payment status check

## Core architecture map
- `src/lib/harness/runtime.ts` — LangGraph nodes + routing
- `src/lib/harness/state.ts` — harness state defaults
- `src/lib/harness/guardrails.ts` — policy checks
- `src/lib/tools/*` — tool definitions and business handlers
- `src/lib/tools/registry.ts` — tool registry
- `src/lib/types/domain.ts` — shared contracts
- `prisma/schema.prisma` — persistence models

## Verification
```bash
npm run test
npm run lint
npm run build
```
