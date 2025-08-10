**Overview**
- Purpose: Deploy a Next.js (App Router) app with API routes, Server‑Sent Events (SSE) streaming, and Prisma using SQLite by default.
- Key constraints: In‑memory event bus (Node `EventEmitter`) is used to stream audit progress. This requires a single long‑lived Node process to reliably keep state between the POST that starts an audit and the SSE stream that consumes updates.
- Storage: Prisma is configured for SQLite (`DATABASE_URL=file:./dev.db`), which needs persistent disk.

**Best Option (Recommended)**
- Single container on a host with persistent storage (Docker on a VPS, Fly.io with a volume, or Render Web Service with a disk).
- Why: Preserves Node process memory for the event emitter and provides a durable SQLite file without refactoring.

**Production Profiles**
- Minimal changes (recommended now):
  - Use the included `Dockerfile` and mount a persistent volume at `/app/prisma` (SQLite lives at `prisma/dev.db`).
  - Run one‑time `npx prisma db push` against the mounted volume, then run `npm start`.
- Cloud serverless (future refactor):
  - Vercel/Netlify require redesign: replace in‑memory emitter with a shared bus (e.g., Redis Pub/Sub) and switch SQLite to a managed DB (Postgres/MySQL). Without that, progress streaming can break on cold starts or multi‑instance routing.

**Environment Variables**
- Copy `.env.example` to `.env` and set as needed:
  - `DATABASE_URL`: keep default `file:./dev.db` for SQLite on persistent disk.
  - Optional: `PAGESPEED_API_KEY`, `GOOGLE_API_KEY`, `SAFE_BROWSING_API_KEY`, `WPSCAN_API_TOKEN`/`WPVULNDB_API_TOKEN`.
- For containers, pass envs via `--env-file .env` or platform secrets.

**Docker (VPS, Any Cloud With Docker)**
- Build:
  - `docker build -t wp-audit-chat .`
- Create a named volume for the database (persists across updates):
  - `docker volume create wp-audit-chat-db`
- Initialize the database schema (one‑time or after schema changes):
  - `docker run --rm \
      -p 3000:3000 \
      -v wp-audit-chat-db:/app/prisma \
      --env-file .env \
      wp-audit-chat npx prisma db push`
- Run the app:
  - `docker run -d \
      --name wp-audit-chat \
      -p 3000:3000 \
      -v wp-audit-chat-db:/app/prisma \
      --env-file .env \
      wp-audit-chat`
- Update flow:
  - `docker pull` your new image (or rebuild), then `docker stop && docker rm && docker run ...` with the same volume attached.

**Fly.io (Great Fit With Persistent Volume)**
- Init: `fly launch` (choose Node/3000). When asked about a DB, select No (we use SQLite on a volume).
- Create a volume: `fly volumes create data --size 1`
- Mount the volume at `/app/prisma` in `fly.toml` (mounts > source: `data`, destination: `/app/prisma`).
- One‑time schema push: `fly ssh console -C "cd /app && npx prisma db push"`
- Deploy: `fly deploy`
- Notes: Scale to 1 machine to keep emitter state in a single process (`fly scale count 1`).

**Render.com (Web Service With Disk)**
- Create a Web Service from your repo.
- Add a Persistent Disk mounted at `/app/prisma` (at least 1 GB).
- Build command: `npm run build`
- Start command: `npm start`
- One‑time job (or shell) to run: `npx prisma db push`
- Instance count: 1 (to keep in‑memory event bus consistent).

**Vercel (Caveats + How To Proceed If Needed)**
- Caveats:
  - Serverless functions are ephemeral; in‑memory `EventEmitter` will not reliably survive between requests or across instances.
  - SQLite on Vercel’s FS is ephemeral; use a managed DB instead (e.g., Vercel Postgres/Neon or PlanetScale) and change `DATABASE_URL` + Prisma provider.
- If you must deploy to Vercel now:
  - Expect event streaming to work only as long as a single function instance handles both start + stream. This is not guaranteed.
  - Prefer a refactor first: move progress updates to Redis Pub/Sub (Upstash) and poll/stream from Redis; switch Prisma to Postgres.

**Manual Node (No Docker)**
- Host needs Node `22.18.0` (see `.nvmrc`).
- Steps:
  - `nvm use`
  - `npm install`
  - `cp .env.example .env` and set env vars
  - `npx prisma db push` (creates `prisma/dev.db`)
  - `npm run build`
  - `npm start` (listens on `PORT` or `3000`)
- Persist the `prisma/` directory (e.g., don’t deploy to a read‑only or ephemeral FS).

**Verification Checklist**
- App boots: open `http://<host>:3000/`.
- Start an audit and watch live progress messages.
- Summary persists across restarts (confirms DB volume works).
- Outbound network allowed to target sites and APIs (PageSpeed, Safe Browsing, WPScan if token provided).

**Troubleshooting**
- SSE doesn’t update after starting an audit:
  - Ensure single instance deployment (no auto‑scaling) or refactor to a shared event bus.
- Database resets after restart:
  - Confirm your volume is mounted at `/app/prisma` and `DATABASE_URL` is `file:./dev.db` (resolves to `prisma/dev.db`).
- Timeouts when fetching sites:
  - Some hosts block outbound traffic or have short timeouts; adjust platform or increase timeouts if allowed.
- Missing Prisma client:
  - Ensure `npm install` ran (Dockerfile builds it) and that `postinstall` generated the Prisma client.

**Choosing a Path**
- Want simplest, reliable prod now: Docker (or Fly/Render) with a persistent volume and a single replica.
- Want serverless elasticity: plan a refactor to managed DB + Redis Pub/Sub for progress, then Vercel is a good fit.

