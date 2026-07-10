# TTC LinkedIn Research Score

Local-first recruiting research tool for turning a vacancy into sourcing queries, running LinkedIn provider searches, caching profiles, scoring candidates with inspectable evidence, recording recruiter decisions, exporting selected candidates, tracking costs, and backing up local data.

## Requirements

- Node.js compatible with the checked-in lockfile
- pnpm 11
- Local SQLite/libSQL database, defaulting to `.data/app.sqlite`

## Setup

```bash
pnpm install
pnpm run db:migrate
pnpm run dev
```

The app runs at `http://localhost:3000` by default.

## Environment

Copy `.env.example` to `.env` when needed.

- `NUXT_DATABASE_URL`: defaults to `file:.data/app.sqlite`
- `OPENROUTER_API_KEY`: enables live vacancy analysis
- `NUXT_APIFY_TOKEN` or `APIFY_TOKEN`: enables live Apify sourcing

## Local Operations

```bash
pnpm run check
pnpm run local:ship
```

Backups are available through:

- `GET /api/admin/backup` to download a JSON backup
- `POST /api/admin/backup` with a backup JSON body to restore local data

## Product Flow

1. Create a vacancy from pasted text or PDF.
2. Generate and approve the vacancy analysis.
3. Generate and approve sourcing queries.
4. Run mock or Apify sourcing.
5. Calculate deterministic profile scores.
6. Review evidence and make recruiter decisions.
7. Export shortlisted candidates as CSV.