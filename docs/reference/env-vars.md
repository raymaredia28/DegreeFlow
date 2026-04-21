# Environment variables

## Backend (`tamu-planner/server/.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `NODE_ENV` | no | `development` | `production` enables Firestore + Firebase auth; `development` allows local JSON storage and dev auth bypass. |
| `PORT` | no | `4000` | Port the Express server listens on. Render should set this to `10000`. |
| `CLIENT_ORIGIN` | yes | — | Comma-separated list of allowed CORS origins (e.g. `http://localhost:5173,https://your-project.web.app`). |
| `DATABASE_URL` | no | — | Reserved; not currently used by the code. |
| `LOCAL_DB_PATH` | no | `./data/local-db.json` | File-based fallback store used when Firebase creds are absent. |
| `FIREBASE_PROJECT_ID` | prod | — | Firebase project id. |
| `FIREBASE_CLIENT_EMAIL` | prod | — | Service-account email. |
| `FIREBASE_PRIVATE_KEY` | prod | — | Service-account private key; keep literal `\n` escapes. |
| `ADMIN_EMAILS` | no | — | Comma-separated list of emails granted admin access. |
| `TAMU_AI_CHAT_API_KEY` | for chat | — | API key for the TAMU AI Chat API. |
| `TAMU_AI_CHAT_API_ENDPOINT` | no | `https://chat-api.tamu.ai` | Base URL for the chat API. |
| `SESSION_SECRET` | yes | `replace_me` | Signing secret for server-managed sessions. Use a long random string. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | no | — | Reserved for non-Firebase Google OAuth flows; not required when using Firebase Auth on the frontend. |

### Notes

- In **development**, leave the `FIREBASE_*` vars blank to use the local
  JSON store. Authentication is relaxed — any signed-in user is accepted,
  and admin checks fall back to `ADMIN_EMAILS`.
- In **production**, all three `FIREBASE_*` vars are required. The
  service will refuse to start without them.
- For Render, also add `NODE_VERSION=20` (the Dockerfile pins Node but the
  build cache benefits from an explicit hint).

## Frontend (`tamu-planner/frontend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE` | yes | Base URL of the backend (e.g. `http://localhost:4000`). |
| `VITE_FIREBASE_API_KEY` | yes | Firebase web SDK key. |
| `VITE_FIREBASE_AUTH_DOMAIN` | yes | Usually `<project-id>.firebaseapp.com`. |
| `VITE_FIREBASE_PROJECT_ID` | yes | Firebase project id (matches backend). |
| `VITE_FIREBASE_STORAGE_BUCKET` | yes | Usually `<project-id>.appspot.com`. |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | yes | From Firebase console. |
| `VITE_FIREBASE_APP_ID` | yes | From Firebase console. |

All `VITE_*` vars are baked into the bundle at build time. Use
`.env.production` when running `npm run build` for deploys, and
`.env.development` for local work.
