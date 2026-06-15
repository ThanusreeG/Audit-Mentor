# Friend Setup Guide

This zip is intentionally GitHub-flexible.

It does not include a `.git` folder, Git history, or any remote URL. You can create your own GitHub repository under any account or organization.

## 1. Unzip

```bash
unzip ai-audit-assistant-handoff-2026-06-13.zip
cd product-idea-an-ai-audit-assistant
```

If your unzip tool creates a different folder name, `cd` into that folder instead.

## 2. Install

```bash
npm install
```

## 3. Check Environment

This private handoff includes `.env` and `.env.local` with the DeepSeek backend LLM settings.

Expected values:

```text
DATABASE_URL="file:./dev.db"
LLM_URL=https://api.deepseek.com
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-v4-pro
LLM_API_KEY=<provided in .env.local>
```

Do not commit real API keys to a public repo.

## 4. Set Up Local Database

```bash
npm run db:push
```

## 5. Run Locally

```bash
npm run dev
```

Open:

```text
http://127.0.0.1:3000
```

## 6. Create Your Own GitHub Repo

```bash
git init
git add .
git commit -m "Initial AI audit assistant MVP"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
git push -u origin main
```

Important: `.env` and `.env.local` are ignored by `.gitignore`, so they will not be pushed by default.

## 7. Deploy

### Option A: MacBook backend and GitHub Pages frontend

Run the backend on the MacBook:

```bash
npm run db:push
npm run dev:server
```

Use this backend URL when you are opening the frontend on the same Mac:

```text
http://127.0.0.1:3000
```

For a public GitHub Pages frontend used from other computers, expose the MacBook backend through an HTTPS tunnel and use the tunnel URL. Do not put LLM API keys in GitHub.

Build the static frontend:

```bash
NEXT_PUBLIC_API_BASE_URL=https://YOUR_BACKEND_TUNNEL npm run build:frontend
```

For a project Pages URL such as `https://YOUR_USERNAME.github.io/YOUR_REPO/`, include:

```bash
GITHUB_PAGES_BASE_PATH=/YOUR_REPO NEXT_PUBLIC_API_BASE_URL=https://YOUR_BACKEND_TUNNEL npm run build:frontend
```

The GitHub Pages workflow is already included at `.github/workflows/deploy-frontend.yml`. In the GitHub repository, set these repository variables before running it if applicable:

```text
NEXT_PUBLIC_API_BASE_URL=https://YOUR_BACKEND_TUNNEL
GITHUB_PAGES_BASE_PATH=/YOUR_REPO
```

The frontend header also has a Backend status button where you can change the API URL after deployment.

### Option B: Full-stack hosting

For Vercel or other serverless hosting:

1. Create a hosted database, preferably Postgres.
2. Update `prisma/schema.prisma` from SQLite to the hosted database provider.
3. Add production environment variables in the hosting dashboard:

```text
DATABASE_URL
LLM_URL
LLM_BASE_URL
LLM_MODEL
LLM_API_KEY
NEXT_PUBLIC_API_BASE_URL
CORS_ORIGINS
```

SQLite is okay for local development, but it is not ideal for serverless production unless your platform provides persistent disk.

## 8. Useful Commands

```bash
npm run lint
npm run build
npm run db:studio
```

## Notes For LLM Agents

Read `AGENTS.md` before changing the code. It explains the product flow, important files, and rules that must be preserved.
