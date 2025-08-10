# wp-audit-chat

Next.js app that audits WordPress sites and streams progress.

Uses [Prisma](https://www.prisma.io/) with a SQLite database file.

## Features

- Live audit progress via SSE with a single Node process.
- Summary dashboard with lightweight charts:
  - Security headers: present vs missing + chips.
  - Social tags: Open Graph/Twitter coverage bars.
  - Cookies: Secure/HttpOnly compliance tiles and bars.
  - Mixed content: count, list, and ratio bar against total assets.
  - Pages overview: images-without-alt, JS, and CSS per page.
  - SSL & platform: issuer, validity, days-to-expire gauge, asset and caching details.
  - Plugins/themes: up-to-date vs outdated bars, vulnerable items with counts.
  - Accessibility: violations count and list.

## Setup

1. Install Node using [nvm](https://github.com/nvm-sh/nvm):
   ```sh
   nvm use
   node --version
   npm install
   cp .env.example .env # sets DATABASE_URL for SQLite
   # add your PageSpeed Insights API key to .env as PAGESPEED_API_KEY
   # add your Safe Browsing API key to .env as SAFE_BROWSING_API_KEY
   npx prisma db push # create the dev.db SQLite file
   npm run dev
   ```

The development server uses the `dev.db` SQLite file specified in `.env`.

## Run, Build, Lint, Test

- Dev: `npm run dev`
- Build: `npm run build`
- Start: `npm start`
- Lint: `npm run lint`
- Test: `npm test`

## Deploy

See DEPLOYMENT.md for options and trade-offs. The recommended path is a single container with a persistent volume for SQLite and a single replica to keep the in-memory event bus reliable.

Quick start with Docker Compose:

```sh
cp .env.example .env
docker compose up -d --build
# open http://localhost:3000
```

## Locked Versions

| Package | Version |
| --- | --- |
| next | 15.4.6 |
| react | 19.1.0 |
| react-dom | 19.1.0 |
| @prisma/client | 6.13.0 |
| @react-pdf/renderer | 4.3.0 |
| @shadcn/ui | 0.0.4 |
| @radix-ui/react-slot | 1.2.3 |
| cheerio | 1.1.2 |
| class-variance-authority | 0.7.1 |
| clsx | 2.1.1 |
| got | 14.4.7 |
| lucide-react | 0.539.0 |
| tailwind-merge | 3.3.1 |
| tailwindcss-animate | 1.0.7 |
| zod | 4.0.15 |
| @eslint/eslintrc | 3.3.1 |
| @playwright/test | 1.54.2 |
| @tailwindcss/postcss | 4.1.11 |
| @types/node | 24.2.1 |
| @types/react | 19.1.9 |
| @types/react-dom | 19.1.7 |
| eslint | 9.32.0 |
| eslint-config-next | 15.4.6 |
| prisma | 6.13.0 |
| tailwindcss | 4.1.11 |
| typescript | 5.9.2 |
| vitest | 3.2.4 |

## How scoring works

_TBD_

## Limits

- Prototype audit engine with basic checks only.
- Progress streaming relies on an in-memory event emitter; deploy as a single instance unless you refactor to a shared bus (e.g., Redis Pub/Sub).
- SQLite requires persistent disk. For serverless, switch to a managed DB and shared pub/sub.

## Privacy

No audit data is shared with third parties.
