# wp-audit-chat

Next.js app that audits WordPress sites and streams progress.

Uses [Prisma](https://www.prisma.io/) with a SQLite database file.

## Setup

1. Install Node using [nvm](https://github.com/nvm-sh/nvm):
   ```sh
   nvm use
   node --version
   npm install
   cp .env.example .env # sets DATABASE_URL for SQLite
   npx prisma db push # create the dev.db SQLite file
   npm run dev
   ```

The development server uses the `dev.db` SQLite file specified in `.env`.

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

## Privacy

No audit data is shared with third parties.
