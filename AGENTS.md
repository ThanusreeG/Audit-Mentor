# AGENTS.md

This file gives coding agents enough context to work safely in this repo.

## Product

AI Smart Contract Audit Assistant is a beginner-focused Web3 security training app.

The user pastes or uploads Solidity source. The backend LLM analyzes the contract, scores risk, creates hidden vulnerability findings, then the UI teaches the user through a hint-first practice flow. The app should not reveal vulnerability answers before the user works through hints.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Prisma
- SQLite for local development
- DeepSeek/OpenAI-compatible chat completion API

## Important Commands

```bash
npm install
npm run db:push
npm run dev
npm run lint
npm run build
```

Local app URL:

```text
http://127.0.0.1:3000
```

## Environment

Required env vars:

```text
DATABASE_URL
LLM_URL
LLM_BASE_URL
LLM_MODEL
LLM_API_KEY
```

Current local DeepSeek-compatible defaults:

```text
LLM_URL=https://api.deepseek.com
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-pro
```

The private handoff zip may include `.env` and `.env.local` with a real API key. Do not print or expose the key in logs, docs, screenshots, or public commits.

## Core Files

- `src/app/api/analyze/route.ts`
  - LLM-first contract analysis.
  - Creates the audit session, risk score, feature flags, and hidden findings.
  - Local heuristic analysis is only a fallback if the LLM fails.

- `src/app/api/hint/route.ts`
  - Generates practice hints with the backend LLM.
  - Falls back to stored hints only if the LLM route fails.

- `src/app/api/guess/route.ts`
  - Sends user guesses to the backend LLM for correctness checks.
  - Uses strict local fallback only if the LLM is unavailable or returns invalid JSON.

- `src/app/api/reveal/route.ts`
  - Reveals the full vulnerability after the hint/guess flow allows it.

- `src/app/api/report/route.ts`
  - Creates the final learning/performance report.

- `src/components/AuditFlow.tsx`
  - Main client-side state machine for risk review, reading guide, summary, hint-first practice, reveal, and report.

- `src/lib/llm.ts`
  - Shared server-side LLM client.
  - DeepSeek uses `/chat/completions`; other OpenAI-compatible local servers usually use `/v1/chat/completions`.

- `src/lib/prompts.ts`
  - Prompt contracts for analysis, hints, guess judging, summary review, and reports.

## UX Rules

- Do not reveal vulnerabilities during the initial risk score step.
- Do not show vulnerability count during practice.
- Practice is hint-first:
  1. Show Hint 1.
  2. Ask the user to guess.
  3. Correct guess reveals full answer immediately.
  4. Wrong or skipped guess advances to Hint 2, then Hint 3.
  5. After Hint 3, reveal is allowed.
- The final report can show total vulnerabilities and performance stats.

## Safety Rules For Agents

- Do not commit `node_modules`, `.next`, `dist`, `out`, local SQLite DBs, or local zip files.
- Keep `.env` and `.env.local` ignored by Git.
- Do not remove LLM usage from analysis, summary review, hints, guesses, or reports unless explicitly asked.
- If changing prompts, preserve JSON-only output where the route parser expects JSON.
- Run `npm run lint` and `npm run build` before handing off.

## Deployment Notes

SQLite is fine for local development. For public hosting on Vercel/serverless, migrate Prisma to a hosted database such as Postgres because local SQLite files are not persistent across serverless deployments.
