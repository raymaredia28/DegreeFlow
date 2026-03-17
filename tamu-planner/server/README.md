# DegreeFlow Backend (Skeleton)

This is a minimal Express + TypeScript backend scaffold. It is intentionally DB-agnostic for now so we can decide on the database/ORM next.

## Structure
- `src/index.ts`: entrypoint
- `src/app.ts`: Express app wiring
- `src/config/env.ts`: env loading + required vars
- `src/routes/`: HTTP routes
- `src/middleware/`: error handling
- `src/db/`: DB client placeholder (to be wired after DB decision)
- `src/services/`: auth/transcript parsing services (placeholder)

## Dev
- `npm run dev` (after installing dependencies)

## Notes
- We will add Google OAuth, transcript parsing, and planner save endpoints here.
- DB integration will be added once we pick Postgres + ORM.
