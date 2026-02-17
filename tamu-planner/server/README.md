# DegreeFlow Server

Node + Express + Prisma backend with session-based auth and JSON seed data.

## Setup

1. Create a local Postgres database.
2. Copy `.env.example` to `.env` and update `DATABASE_URL` + `SESSION_SECRET`.
3. Install dependencies:

```bash
npm install
```

## Database

```bash
npm run db:generate
npm run db:push
npm run db:seed
```

## Run

```bash
npm run dev
```

## Seed Data

Edit the JSON files in `data/`:
- `data/courses.json`
- `data/emphasis_areas.json`
- `data/minors.json`
- `data/course_emphasis.json`
- `data/course_minor.json`

Re-run `npm run db:seed` after edits.
