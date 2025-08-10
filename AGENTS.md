# Repository Guidelines

## Project Structure & Module Organization
- Source: `src/` with Next.js App Router (`src/app`), UI in `src/components`, utilities in `src/lib`.
- API routes: `src/app/api/*` (route handlers).
- Tests: colocated `*.test.ts` in `src/lib`.
- Database: Prisma schema in `prisma/schema.prisma` (SQLite via `DATABASE_URL`).
- Static assets: `public/`.

## Build, Test, and Development Commands
- `nvm use`: use Node `22.18.0` from `.nvmrc`.
- `npm install`: install deps; runs `prisma generate` post-install.
- `npm run dev`: start Next.js dev server with Turbopack.
- `npm run build`: production build.
- `npm start`: start production server (after build).
- `npm run lint`: ESLint via Next config.
- `npm test`: run Vitest tests.
- Database init: `cp .env.example .env && npx prisma db push`.
- Docker: `docker build -t wp-audit-chat .` then `docker run -p 3000:3000 wp-audit-chat`.

## Coding Style & Naming Conventions
- Language: TypeScript, strict mode enabled.
- Linting: ESLint (`next/core-web-vitals`, `next/typescript`). Fix lint before PR.
- Indentation: 2 spaces; semicolons required; prefer double quotes.
- Components: PascalCase (`src/components/ui/Button.tsx`); hooks `useThing`.
- Modules in `src/lib`: lowercase filenames (e.g., `audit.ts`, `url.ts`).
- Paths: use alias `@/*` (e.g., `import { startAudit } from "@/lib/audit"`).

## Testing Guidelines
- Framework: Vitest (`vitest.config.ts`, node environment).
- Location: colocate as `*.test.ts` next to source (e.g., `src/lib/url.test.ts`).
- HTTP mocking: prefer `nock`; avoid real network calls.
- Run locally: `npm test` or `vitest run`.

## Commit & Pull Request Guidelines
- Commits: follow Conventional Commits (`feat:`, `fix:`, `test:`) as in history.
- PRs: clear description, link issues, note DB/schema changes, include screenshots for UI, and list test coverage touched.
- Checks: PRs should pass `lint`, `test`, and build.

## Security & Configuration
- Env: copy `.env.example` to `.env`. Optional keys: `PAGESPEED_API_KEY`, `SAFE_BROWSING_API_KEY`, `GOOGLE_API_KEY`, etc.
- Secrets: never commit `.env` or API tokens. Avoid committing local SQLite files.
- Prisma: when schema changes, run `npx prisma db push` and re-generate client if needed.
