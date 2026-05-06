# AI Agent Harness Demo (Next.js)

A single-app Next.js demo of a storefront assistant with an AI agent harness for conversational apparel checkout.

## What this includes
- Branded storefront (`Moringa Apparrels`) with a floating chat assistant widget
- Start Session flow with selectable demo users (no auth)
- LangGraph runtime loop for observe/plan/tool/guardrail/recovery/response orchestration
- Streaming turn UX with:
  - inline transient reasoning trace while a response is in progress
  - collapsed persisted `Reasoning Trace` block per completed assistant turn
  - always-visible phase label (last known phase remains until replaced)
- Clickable next-step suggestions from assistant responses via tags:
  - `<next_step>...</next_step>` rendered as action chips
  - clicking a chip sends it as a normal user message
- Session management and controls:
  - session history
  - pause/resume/escalate/retry/replay actions
  - response style and reasoning effort controls
- Strict tool contracts with zod schemas + deterministic payment simulation (`pending -> success`)
- Prisma persistence for sessions, messages, traces, orders, and payments

## Tech stack
- Next.js App Router + TypeScript + Tailwind
- LangGraph + LangChain Core + LangChain OpenAI
- Prisma + PostgreSQL
- Vitest

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

4. Create database schema
```bash
npm run prisma:push
# or
npm run prisma:migrate -- --name init
```

5. Start development server
```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Demo flow
1. Select a demo user on `/start`.
2. Enter `/storefront`.
3. Open the floating assistant or click product actions that prefill chat intent.
4. Agent observes state, plans tool use, executes allowed actions, and streams progress.
5. Guardrails enforce checkout rules (details completeness, payment confirmation semantics).
6. Completed turns persist a collapsed reasoning trace plus customer-facing assistant output.

## Chat behavior details
- Input supports multiline editing (minimum 2 lines):
  - `Enter` sends
  - `Shift+Enter` inserts a newline
- Assistant phase labels are debounced to reduce flicker and do not disappear between phases.
- Reasoning trace styling uses subtle section-level borders rather than noisy per-item backgrounds.

## API routes
- `POST /api/session/init` — create/load session
- `GET /api/demo/users` — list demo users
- `POST /api/agent/chat` — run agent turn (supports streaming)
- `POST /api/payment/status` — manual payment status check

## Core architecture map
- `src/lib/harness/runtime.ts` — LangGraph orchestration, prompt rules, streaming events
- `src/lib/harness/state.ts` — harness state defaults
- `src/lib/harness/guardrails.ts` — checkout policy checks
- `src/lib/tools/*` — tool definitions and business handlers
- `src/lib/tools/registry.ts` — tool registry
- `src/components/chat/*` — floating widget, timeline, session list, chat types
- `src/lib/data/seeds.ts` — demo catalog + users
- `prisma/schema.prisma` — persistence models

## Verification
```bash
npm run lint
npm run test
npm run build
```
