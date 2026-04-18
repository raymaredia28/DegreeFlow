# DegreeFlow — Project Context

## What This App Does

DegreeFlow is a degree planning tool for Texas A&M CS students. It lets students:
- Upload a PDF transcript or degree evaluation and parse it automatically
- Track progress against CS degree requirements (core, emphasis areas, minors)
- Plan future courses semester by semester
- Chat with an AI assistant (via TAMU AI API) for degree questions
- Admins can manage the course catalog through an admin panel

## Repository Layout

```
DegreeFlow/
├── CLAUDE.md                  ← this file
├── tamu-planner/
│   ├── frontend/              ← React + Vite SPA
│   │   ├── src/
│   │   │   ├── App.jsx        ← monolithic root component (~2500+ lines); all main state lives here
│   │   │   ├── firebase.js    ← Firebase client init (Auth only)
│   │   │   ├── components/
│   │   │   │   ├── DegreeProgress.jsx   ← degree progress bars/status
│   │   │   │   └── AdminPanel.jsx       ← admin course catalog UI
│   │   │   ├── utils/
│   │   │   │   ├── degreeValidator.js          ← client-side requirement validation
│   │   │   │   ├── evaluationFreshness.mjs     ← signature to detect stale eval
│   │   │   │   ├── evalCreditProgress.mjs      ← credit progress from eval result
│   │   │   │   ├── workNotApplied.mjs          ← reconciles courses not in any requirement
│   │   │   │   └── degreeExportHtml.mjs        ← HTML export of degree plan
│   │   │   ├── data/
│   │   │   │   ├── csRequirements.json         ← (legacy/unused) static requirements
│   │   │   │   ├── emphasis_areas.json
│   │   │   │   └── minors.json
│   │   │   └── __tests__/     ← vitest unit tests
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── tailwind.config.js
│   │   └── firebase.json      ← Firebase Hosting config
│   └── server/                ← Node.js + Express + TypeScript API
│       ├── src/
│       │   ├── app.ts         ← Express app factory (cors, helmet, compression)
│       │   ├── index.ts       ← server entry point
│       │   ├── config/env.ts  ← all env var definitions/validation
│       │   ├── middleware/
│       │   │   ├── auth.ts    ← authenticate() and requireAdmin() middleware
│       │   │   └── error.ts   ← 404 + error handler middleware
│       │   ├── routes/
│       │   │   ├── storage.ts ← transcript/planner CRUD + PDF parse endpoints
│       │   │   ├── catalog.ts ← course catalog + requirements evaluation
│       │   │   ├── chat.ts    ← TAMU AI proxy (completions + models)
│       │   │   ├── admin.ts   ← admin course CRUD (auth + isAdmin required)
│       │   │   └── health.ts  ← GET /health
│       │   ├── services/
│       │   │   ├── auth.ts               ← Firebase Admin token verification
│       │   │   ├── documentType.ts       ← heuristic: transcript vs. degree eval PDF
│       │   │   └── degreeEvaluationParser.ts ← AI prompt builder + normalizer
│       │   ├── storage/
│       │   │   ├── types.ts        ← Student, PlannerState, TranscriptTerm types
│       │   │   ├── index.ts        ← re-exports from active storage provider
│       │   │   ├── localDb.ts      ← local JSON file storage (dev)
│       │   │   ├── firestoreDb.ts  ← Firestore storage (prod)
│       │   │   └── catalogStorage.ts ← dual-mode course catalog storage
│       │   ├── requirements/
│       │   │   └── evaluator.js    ← pure-JS requirements engine (no TS)
│       │   └── db/index.ts         ← storage provider selector
│       ├── data/
│       │   ├── courses.json        ← full course catalog (source of truth)
│       │   ├── requirements.json   ← all degree/emphasis/minor requirement sets
│       │   ├── emphasis_areas.json ← CSCE emphasis area definitions
│       │   ├── minors.json         ← minor definitions
│       │   └── local-db.json       ← local dev user data (gitignored in spirit)
│       ├── scripts/
│       │   ├── parse_transcript.py ← Python (pdfplumber) transcript PDF parser
│       │   ├── requirements.txt    ← Python deps (pdfplumber)
│       │   └── validate-data.js    ← validates data/*.json integrity
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
├── scraper.py / scraper2.py    ← one-off data scraping scripts (not part of app)
└── build.py                    ← one-off build helper script (not part of app)
```

## Tech Stack

### Frontend
| Thing | Version |
|-------|---------|
| React | 18 |
| Vite | 5 |
| Tailwind CSS | 3 |
| Firebase (Auth client) | 12 |
| pdfjs-dist | 4 (PDF text extraction in-browser) |
| tesseract.js | 5 (OCR fallback) |
| lucide-react | icon library |
| vitest | test runner |
| @testing-library/react | component tests |

### Backend
| Thing | Version |
|-------|---------|
| Node.js | ESM (`"type":"module"`) |
| TypeScript | 5 |
| Express | 4 |
| Firebase Admin SDK | 13 |
| zod | request validation |
| helmet / cors / compression | middleware |
| Python 3 + pdfplumber | transcript PDF parsing (called via `execFile`) |

## Running Locally

### Frontend
```bash
cd tamu-planner/frontend
npm install
npm run dev        # http://localhost:5173
npm run build      # outputs to dist/
npm test           # vitest run
```

Create `tamu-planner/frontend/.env.local`:
```
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_BASE=http://localhost:4000
```

### Backend
```bash
cd tamu-planner/server
npm install
pip3 install -r scripts/requirements.txt   # pdfplumber
npm run dev        # builds TS then runs node dist/index.js
npm start          # runs pre-built dist/
npm test           # integration tests (uses local JSON storage)
```

Create `tamu-planner/server/.env`:
```
PORT=4000
CLIENT_ORIGIN=http://localhost:5173
NODE_ENV=development
LOCAL_DB_PATH=./data/local-db.json
TAMU_AI_CHAT_API_KEY=...
TAMU_AI_CHAT_API_ENDPOINT=https://chat-api.tamu.ai   # optional, this is the default
FIREBASE_PROJECT_ID=...
FIREBASE_CLIENT_EMAIL=...
FIREBASE_PRIVATE_KEY=...   # include literal \n chars or multiline
ADMIN_EMAILS=admin@tamu.edu,other@tamu.edu
```

**Dev without Firebase:** Leave `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY` empty. The server will accept any Bearer token, decode it as a JWT if possible, and treat empty `ADMIN_EMAILS` as granting all users admin access.

## API Endpoints

All at `http://localhost:4000` in dev.

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/health` | none | health check |
| POST | `/storage/parse-transcript` | none | parse transcript PDF (base64) via Python |
| POST | `/storage/detect-document-type` | none | classify PDF lines as transcript/degree-eval |
| POST | `/storage/parse-degree-evaluation` | none | parse degree eval via TAMU AI (Gemini) |
| POST | `/storage/login` | Bearer | find/create student, return saved state |
| POST | `/storage/transcript` | Bearer | save transcript terms |
| GET | `/storage/transcript/:studentId` | Bearer | get transcript |
| POST | `/storage/planner/:studentId` | Bearer | save planner state |
| GET | `/storage/planner/:studentId` | Bearer | get planner state |
| GET | `/api/courses` | none | full course catalog |
| GET | `/api/minors` | none | minor definitions |
| GET | `/api/emphases` | none | emphasis area definitions |
| POST | `/api/requirements/evaluate-local` | none | evaluate degree requirements |
| POST | `/chat/completions` | none | proxy to TAMU AI chat API |
| GET | `/chat/models` | none | proxy to TAMU AI models list |
| GET | `/admin/courses` | Bearer+Admin | list/search CSCE courses |
| POST | `/admin/courses` | Bearer+Admin | add course |
| PUT | `/admin/courses/:id` | Bearer+Admin | update course |
| DELETE | `/admin/courses/:id` | Bearer+Admin | delete course |

## Firestore Collection Structure (Production)

```
users/{uid}                         ← student profile doc
  user_id, first_name, last_name, email, created_at, updated_at

users/{uid}/transcript/current      ← single doc holds all transcript terms
  id, user_id, terms[], created_at, updated_at

users/{uid}/planner/current         ← single doc holds opaque planner payload
  id, user_id, payload (JSON blob), created_at, updated_at

courses/{courseId}                  ← CSCE courses only (admin-managed)
  All course fields. Nested arrays stored as {group:[...]} due to Firestore limit.

catalog_meta/seed_status            ← tracks whether Firestore has been seeded
  seeded, seeded_at, count
```

## Storage Dual-Mode

- **Dev (`NODE_ENV != production`):** all user data stored in `data/local-db.json`; catalog read from `data/courses.json`
- **Prod (`NODE_ENV=production`):** user data in Firestore; CSCE catalog in Firestore `courses` collection (non-CSCE always from `courses.json`); seeded automatically on first request

## Key Patterns & Conventions

- **App.jsx is intentionally monolithic.** All top-level state (transcript, planner, evaluation results, auth, modals) lives here. Do not extract state to Context or Zustand without explicit instruction.
- **Course code normalization:** `"DEPT NNN"` uppercase, single space. Used consistently in evaluator and catalog indexing. Always use `normCode()` in server code.
- **Evaluation flow:** Frontend uploads PDF → server parses it → frontend sends course list to `/api/requirements/evaluate-local` → server runs `evaluator.js` → returns grouped results. The evaluator is pure JS (no TS), keep it that way.
- **Nested arrays in Firestore:** Firestore rejects arrays-of-arrays. `catalogStorage.ts` wraps them as `{group:[...]}` on write and unwraps on read. Never bypass `sanitizeForFirestore`/`deserializeFromFirestore`.
- **Admin detection:** purely by email string match against `ADMIN_EMAILS` env var. No role stored in Firestore.
- **Catalog cache:** 5-minute in-memory cache in `catalogStorage.ts`. Call `invalidateCatalogCache()` after any write.
- **Zod for all request validation** on the server — don't skip it for new routes.
- **Python transcript parser** is invoked via `execFile('python3', ['scripts/parse_transcript.py', tmpPath])`. Requires `pdfplumber` installed in the server's Python environment.
- **Degree evaluation AI model:** `protected.gemini-2.0-flash-lite` via `https://chat-api.tamu.ai`. Has a built-in retry (2 attempts) on failure.
- **Styling:** Tailwind CSS utility classes only. No CSS-in-JS, no inline style objects beyond truly dynamic values.
- **ESM everywhere:** both frontend and server use `"type":"module"`. Use `.js` extensions in TS imports (even for `.ts` source files). Use `.mjs` extension for utility files in frontend that are also run directly (e.g. vitest tests).

## Data Files — Do Not Edit Manually

`server/data/requirements.json`, `courses.json`, `emphasis_areas.json`, `minors.json` are the authoritative source of truth for all degree logic. Editing them carelessly will break requirement evaluation for all users. Run `npm run validate:data` after any changes. In production, `courses.json` is the seed source for the Firestore `courses` collection (CSCE only).

## Deployment

- **Frontend:** Firebase Hosting (`firebase deploy` from `tamu-planner/frontend/`)
- **Backend:** Render, deployed as a Docker container (`tamu-planner/server/Dockerfile`)
- See `tamu-planner/DEPLOYMENT.md` for full deployment steps.

## Things That Need Extra Care

1. **`server/data/*.json`** — degree requirement logic. Do not reformat or restructure without running `validate:data`.
2. **`evaluator.js`** — complex pure-JS requirement engine. Test thoroughly after any changes.
3. **Firestore nested-array workaround** (`sanitizeForFirestore`/`deserializeFromFirestore`) — must be applied to all Firestore writes/reads in `catalogStorage.ts`.
4. **`App.jsx`** — very large file. Understand existing state flow before adding new state or effects.
5. **`authenticate` middleware** — guards all user data routes. Do not add new routes that write user data without it.
6. **TAMU AI API key** — required for degree evaluation and chat features. Without it those endpoints return 500.
7. **Python environment** — `python3` and `pdfplumber` must be available in the server's runtime environment for transcript parsing to work.
