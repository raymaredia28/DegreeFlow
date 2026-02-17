# DegreeFlow Server

Node + Express + TypeScript backend with session-based auth and JSON seed data.

## Structure
- `src/index.ts`: entrypoint
- `src/app.ts`: Express app wiring
- `src/config/env.ts`: env loading + required vars
- `src/routes/`: HTTP routes
- `src/middleware/`: error handling
- `src/db/`: DB client placeholder (to be wired after DB decision)
- `src/services/`: auth/transcript parsing services (placeholder)

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

## Notes
- We will add Google OAuth, transcript parsing, and planner save endpoints here.
- DB integration will be added once we pick Postgres + ORM.
