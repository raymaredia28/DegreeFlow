# DegreeFlow

**DegreeFlow** is an open-source degree planning tool built specifically for Texas A&M University Computer Science students. It lets students upload a transcript or official degree evaluation PDF, automatically parses it with AI, tracks progress against all CS degree requirements (core, emphasis areas, minors), and lets them plan future semesters — all in one place. An integrated AI assistant (powered by the TAMU AI API) answers degree-related questions in context.

---

## Table of Contents

- [Features](#features)
- [Tech Stack](#tech-stack)
- [Repository Layout](#repository-layout)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Frontend Setup](#frontend-setup)
  - [Backend Setup](#backend-setup)
- [Environment Variables](#environment-variables)
  - [Frontend (.env.local)](#frontend-envlocal)
  - [Backend (.env)](#backend-env)
- [API Reference](#api-reference)
- [Branch Strategy](#branch-strategy)
- [Deployment](#deployment)
  - [Backend — Render (Docker)](#backend--render-docker)
  - [Frontend — Firebase Hosting](#frontend--firebase-hosting)
- [Running Tests](#running-tests)
- [Contributing](#contributing)
- [License](#license)

---

## Features

- **Transcript & Degree Evaluation Parsing** — Upload a PDF transcript or official TAMU degree evaluation. DegreeFlow uses Python (`pdfplumber`) for raw transcript parsing and TAMU AI (Gemini) for structured degree evaluation extraction.
- **Degree Requirement Tracking** — Visual progress bars for core requirements, CSCE emphasis areas, and minors. The requirements engine is a pure-JS evaluator driven by a structured JSON requirements file.
- **Semester-by-Semester Planning** — Drag courses into future semesters and see real-time impact on degree completion status.
- **AI Chat Assistant** — Ask natural-language questions about your degree plan via a proxied connection to the TAMU AI chat API.
- **Admin Panel** — Authenticated admins can manage the live course catalog (add, edit, delete CSCE courses) without touching JSON files directly.
- **Firebase Auth** — Google sign-in via Firebase Authentication. Works in dev without a real Firebase project (any Bearer token accepted in dev mode).
- **Dual Storage** — Local JSON file storage for development; Firestore for production. Swap with a single env var.

---

## Tech Stack

### Frontend

| Tool | Version | Purpose |
|------|---------|---------|
| React | 18 | UI framework |
| Vite | 5 | Build tool & dev server |
| Tailwind CSS | 3 | Utility-first styling |
| Firebase JS SDK | 12 | Authentication client |
| pdfjs-dist | 4 | In-browser PDF text extraction |
| tesseract.js | 5 | OCR fallback for scanned PDFs |
| lucide-react | latest | Icon library |
| vitest + @testing-library/react | latest | Unit & component tests |

### Backend

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js (ESM) | 18+ | Runtime |
| TypeScript | 5 | Type safety |
| Express | 4 | HTTP framework |
| Firebase Admin SDK | 13 | Auth verification + Firestore |
| Zod | latest | Request validation |
| helmet / cors / compression | latest | Security & middleware |
| Python 3 + pdfplumber | 3.10+ | Transcript PDF parsing |

---

## Repository Layout

```
DegreeFlow/
├── tamu-planner/
│   ├── frontend/                    ← React + Vite SPA
│   │   ├── src/
│   │   │   ├── App.jsx              ← Root component; all main state lives here
│   │   │   ├── firebase.js          ← Firebase client initialization (Auth only)
│   │   │   ├── components/
│   │   │   │   ├── DegreeProgress.jsx
│   │   │   │   └── AdminPanel.jsx
│   │   │   ├── utils/
│   │   │   │   ├── degreeValidator.js
│   │   │   │   ├── evaluationFreshness.mjs
│   │   │   │   ├── evalCreditProgress.mjs
│   │   │   │   ├── workNotApplied.mjs
│   │   │   │   └── degreeExportHtml.mjs
│   │   │   └── data/
│   │   │       ├── emphasis_areas.json
│   │   │       └── minors.json
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   └── tailwind.config.js
│   └── server/                      ← Node.js + Express + TypeScript API
│       ├── src/
│       │   ├── app.ts
│       │   ├── index.ts
│       │   ├── config/env.ts
│       │   ├── middleware/
│       │   │   ├── auth.ts
│       │   │   └── error.ts
│       │   ├── routes/
│       │   │   ├── storage.ts
│       │   │   ├── catalog.ts
│       │   │   ├── chat.ts
│       │   │   ├── admin.ts
│       │   │   └── health.ts
│       │   ├── services/
│       │   │   ├── auth.ts
│       │   │   ├── documentType.ts
│       │   │   └── degreeEvaluationParser.ts
│       │   ├── storage/
│       │   │   ├── types.ts
│       │   │   ├── index.ts
│       │   │   ├── localDb.ts
│       │   │   ├── firestoreDb.ts
│       │   │   └── catalogStorage.ts
│       │   └── requirements/
│       │       └── evaluator.js     ← Pure-JS requirements engine
│       ├── data/
│       │   ├── courses.json         ← Full course catalog (source of truth)
│       │   ├── requirements.json    ← Degree / emphasis / minor requirement sets
│       │   ├── emphasis_areas.json
│       │   └── minors.json
│       ├── scripts/
│       │   ├── parse_transcript.py
│       │   ├── requirements.txt
│       │   └── validate-data.js
│       ├── package.json
│       ├── tsconfig.json
│       └── Dockerfile
└── DEPLOYMENT.md                    ← Full deployment guide
```

---

## Getting Started

### Prerequisites

- **Node.js** 18 or later
- **npm** 9 or later
- **Python 3.10+** with `pip`
- A Firebase project (optional for local dev — see [dev-without-Firebase](#backend-env))

### Frontend Setup

```bash
cd tamu-planner/frontend
npm install
```

Copy the example env file and fill in your values (see [Environment Variables](#environment-variables)):

```bash
cp .env.local.example .env.local
# edit .env.local
```

Start the dev server:

```bash
npm run dev        # http://localhost:5173
```

### Backend Setup

```bash
cd tamu-planner/server
npm install
pip3 install -r scripts/requirements.txt   # installs pdfplumber
```

Copy the example env file:

```bash
cp .env.example .env
# edit .env
```

Start the dev server (compiles TypeScript then runs the output):

```bash
npm run dev        # http://localhost:4000
```

Verify the server is running:

```bash
curl http://localhost:4000/health
# {"ok":true,"service":"degreeflow-server"}
```

---

## Environment Variables

### Frontend (`tamu-planner/frontend/.env.local`)

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_API_BASE=http://localhost:4000
```

### Backend (`tamu-planner/server/.env`)

```env
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN=http://localhost:5173

# Local storage (dev only)
LOCAL_DB_PATH=./data/local-db.json

# TAMU AI — required for degree evaluation parsing and chat
TAMU_AI_CHAT_API_KEY=
TAMU_AI_CHAT_API_ENDPOINT=https://chat-api.tamu.ai

# Firebase Admin — leave blank to run without Firebase in dev
FIREBASE_PROJECT_ID=
FIREBASE_CLIENT_EMAIL=
FIREBASE_PRIVATE_KEY=

# Comma-separated list of admin emails
# Leave blank in dev to grant all users admin access
ADMIN_EMAILS=
```

**Dev without Firebase:** If `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, and `FIREBASE_PRIVATE_KEY` are all left empty, the server skips real token verification, accepts any Bearer token, and treats all users as admins (if `ADMIN_EMAILS` is also empty). This is safe for local development only.

---

## API Reference

All endpoints are relative to `http://localhost:4000` in development.

| Method | Path | Auth Required | Description |
|--------|------|---------------|-------------|
| GET | `/health` | No | Server health check |
| POST | `/storage/parse-transcript` | No | Parse a transcript PDF (base64) via Python |
| POST | `/storage/detect-document-type` | No | Classify PDF as transcript or degree evaluation |
| POST | `/storage/parse-degree-evaluation` | No | Parse degree eval via TAMU AI (Gemini) |
| POST | `/storage/login` | Bearer | Find or create student profile, return saved state |
| POST | `/storage/transcript` | Bearer | Save transcript terms |
| GET | `/storage/transcript/:studentId` | Bearer | Get saved transcript |
| POST | `/storage/planner/:studentId` | Bearer | Save planner state |
| GET | `/storage/planner/:studentId` | Bearer | Get planner state |
| GET | `/api/courses` | No | Full course catalog |
| GET | `/api/minors` | No | Minor definitions |
| GET | `/api/emphases` | No | Emphasis area definitions |
| POST | `/api/requirements/evaluate-local` | No | Run degree requirements evaluation |
| POST | `/chat/completions` | No | Proxy to TAMU AI chat completions |
| GET | `/chat/models` | No | Proxy to TAMU AI models list |
| GET | `/admin/courses` | Bearer + Admin | List / search CSCE courses |
| POST | `/admin/courses` | Bearer + Admin | Add a new course |
| PUT | `/admin/courses/:id` | Bearer + Admin | Update a course |
| DELETE | `/admin/courses/:id` | Bearer + Admin | Delete a course |

---

## Branch Strategy

| Branch | Purpose |
|--------|---------|
| `deployment-test` | **Main deploy branch.** This is the branch that is built and deployed to production (Render + Firebase Hosting). All stable, reviewed changes land here before shipping. |
| `main` | Integration / staging branch. Feature branches are merged here first for review and testing before being promoted to `deployment-test`. |
| `feature/*` / personal branches | Short-lived feature and bugfix branches cut from `main`. Open a PR to `main` when ready for review. |

> **Note:** If you are deploying your own fork, point Render and Firebase Hosting at `deployment-test` (or rename it to match your workflow). Never push directly to `deployment-test` — always go through a PR.

---

## Deployment

Full step-by-step instructions are in [tamu-planner/DEPLOYMENT.md](tamu-planner/DEPLOYMENT.md). A summary follows.

### Backend — Render (Docker)

1. Create a new **Web Service** on [Render](https://render.com), connected to this repo.
2. Set:
   - **Runtime:** Docker
   - **Root Directory:** `tamu-planner/server`
   - **Branch:** `deployment-test`
   - **Health Check Path:** `/health`
3. Add all required environment variables from the [Backend env section](#backend-env) above (using production values).
4. Deploy. Verify at `https://<your-service>.onrender.com/health`.

> Render free-tier services sleep after inactivity. The first request after a cold start may take 30–60 seconds.

### Frontend — Firebase Hosting

1. Build the frontend with your production env values:

```bash
cd tamu-planner/frontend
cp .env.production.example .env.production
# set VITE_API_BASE to your Render URL
npm run build
```

2. Deploy to Firebase Hosting:

```bash
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only hosting
```

3. In Firebase Console → Authentication → Settings → Authorized domains, add your Hosting domains.

---

## Running Tests

### Frontend (Vitest)

```bash
cd tamu-planner/frontend
npm test
```

### Backend (Integration tests)

```bash
cd tamu-planner/server
npm test
```

The backend tests use local JSON storage (`NODE_ENV` is not `production`) so no Firestore connection is needed.

### Data Integrity

After editing any file in `server/data/`, run the data validator:

```bash
cd tamu-planner/server
npm run validate:data
```

This checks that `courses.json`, `requirements.json`, `emphasis_areas.json`, and `minors.json` are structurally consistent. Do not skip this step — malformed data will silently break requirement evaluation for all users.

---

## Contributing

Contributions are welcome! Here is the recommended workflow:

1. **Fork** the repository and clone your fork.
2. **Cut a branch** from `main`:
   ```bash
   git checkout main && git pull origin main
   git checkout -b your-feature-name
   ```
3. **Make your changes.** Follow the conventions below.
4. **Run tests** (`npm test` in both `frontend/` and `server/`).
5. **Open a pull request** targeting `main`.

### Code Conventions

- All styling must use **Tailwind CSS utility classes** — no CSS-in-JS or inline style objects beyond truly dynamic values.
- Both frontend and backend use **ESM** (`"type": "module"`). Use `.js` extensions in TypeScript imports (even for `.ts` source files).
- Course code normalization: always `"DEPT NNN"` uppercase with a single space. Use `normCode()` in any server-side code that touches course identifiers.
- **Do not add new npm dependencies** without discussion — open an issue first.
- **Do not edit `server/data/*.json` files manually** without running `validate:data` afterward.
- `evaluator.js` is intentionally plain JavaScript (no TypeScript). Keep it that way.
- `App.jsx` is intentionally monolithic. Do not extract state to Context or Zustand without prior discussion.
- The Firestore nested-array workaround (`sanitizeForFirestore` / `deserializeFromFirestore`) must be applied to all Firestore writes and reads. Never bypass it.
- All new backend routes that write user data must be protected by the `authenticate` middleware.

---

## License

This project is released under the [MIT License](LICENSE).
