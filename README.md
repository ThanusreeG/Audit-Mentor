# AI Smart Contract Audit Assistant

An educational Web3 security trainer for beginner smart contract auditors.

The app lets a user paste or upload Solidity code, then guides them through:

1. LLM-based contract analysis and risk scoring.
2. A beginner-friendly contract reading guide.
3. Optional contract-understanding summary feedback.
4. Hint-first vulnerability practice.
5. Final reveal and performance report.

The app is designed to teach auditing instead of immediately dumping answers.

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Prisma
- SQLite for local development
- DeepSeek/OpenAI-compatible chat completions API

## Local Setup

If you are receiving this as a handoff zip from a collaborator, start with `FRIEND_SETUP.md`.

Install dependencies:

```bash
npm install
```

Create your local env file:

```bash
cp .env.example .env.local
```

If you received this as a private handoff zip, `.env` and `.env.local` may already be included. Otherwise, edit `.env.local` and add your LLM API key:

```bash
DATABASE_URL="file:./dev.db"
LLM_URL=https://api.deepseek.com
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-pro
LLM_API_KEY=your-deepseek-api-key
```

Set up the local SQLite database:

```bash
npm run db:push
```

Run the development server:

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## Build

```bash
npm run lint
npm run build
npm run start
```

## MacBook Backend + GitHub Pages Frontend

This repo can run in two deployment modes:

- MacBook backend: full Next.js server with API routes, Prisma, SQLite, and LLM secrets.
- GitHub Pages frontend: static exported UI that calls the MacBook backend API.

Keep `.env` and `.env.local` only on the MacBook. Do not add LLM keys to GitHub.

Run the backend on the MacBook:

```bash
npm install
npm run db:push
npm run dev:server
```

Backend URL:

```text
http://127.0.0.1:3000
```

If other people need to use the GitHub Pages frontend against your MacBook, expose the backend through an HTTPS tunnel such as ngrok or Cloudflare Tunnel and use that public HTTPS URL. A GitHub Pages page opened on someone else's computer cannot call `localhost` on your MacBook.

Build the static frontend locally:

```bash
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000 npm run build:frontend
```

If deploying to a project GitHub Pages URL like `https://YOUR_USERNAME.github.io/YOUR_REPO/`, set the base path:

```bash
PAGES_BASE_PATH=/YOUR_REPO NEXT_PUBLIC_API_BASE_URL=https://YOUR_BACKEND_TUNNEL npm run build:frontend
```

The static files are written to `out/`.

GitHub Pages deployment is configured in `.github/workflows/deploy-frontend.yml`. In GitHub repo settings, set these repository variables if needed:

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR_BACKEND_TUNNEL
PAGES_BASE_PATH=/YOUR_REPO
```

The app shows backend reachability in the header, but users cannot change the backend URL in the browser. Update `NEXT_PUBLIC_API_BASE_URL` in GitHub variables and redeploy when the tunnel URL changes.

## Deployment Notes

Set these environment variables on your hosting provider:

```text
DATABASE_URL
LLM_URL
LLM_BASE_URL
LLM_MODEL
LLM_API_KEY
NEXT_PUBLIC_API_BASE_URL
CORS_ORIGINS
```

For a quick hosted MVP, SQLite can work only on platforms with persistent disk. For Vercel or other serverless platforms, use a hosted database such as Postgres and update `prisma/schema.prisma` accordingly.

## Security Notes

- Do not commit `.env` or `.env.local`.
- The private handoff zip may include `.env` and `.env.local` so collaborators can run the MVP immediately.
- Do not share real API keys in public repos or screenshots.
- Rotate the LLM API key before making a public GitHub repository or public deployment.
- Uploaded contracts are sent to the configured backend LLM for analysis.
- If you use private or client-owned contracts, add a clear privacy policy before making the app public.

## Useful Commands

```bash
npm run dev
npm run lint
npm run build
npm run db:push
npm run db:studio
```
