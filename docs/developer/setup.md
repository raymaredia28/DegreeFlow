# Local setup

## Prerequisites

- **Node.js 20+** and npm
- **Firebase project** with Firestore and Authentication enabled
- A service-account JSON for that project
- (Optional) **Python 3.10+** if you want to build the docs site locally

## 1. Clone and install

```bash
git clone https://github.com/raymaredia28/DegreeFlow.git
cd DegreeFlow/tamu-planner

# backend
cd server && npm install && cd ..

# frontend
cd frontend && npm install && cd ..
```

## 2. Configure environment

### Backend (`tamu-planner/server/.env`)

Copy the template and fill in values:

```bash
cp server/.env.example server/.env
```

Minimum required:

```bash
NODE_ENV=development
PORT=4000
CLIENT_ORIGIN=http://localhost:5173

FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

ADMIN_EMAILS=you@example.com

TAMU_AI_CHAT_API_KEY=...
TAMU_AI_CHAT_API_ENDPOINT=https://chat-api.tamu.ai
SESSION_SECRET=some-long-random-string
```

See [Environment variables](../reference/env-vars.md) for the full list.

### Frontend (`tamu-planner/frontend/.env`)

```bash
VITE_API_BASE=http://localhost:4000
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
```

## 3. Run both services

In two terminals:

```bash
# terminal 1 — backend
cd tamu-planner/server
npm run dev
```

```bash
# terminal 2 — frontend
cd tamu-planner/frontend
npm run dev
```

Open <http://localhost:5173>. The frontend will hit the API at `VITE_API_BASE`.

## 4. Seed admin subjects (first run)

If your Firestore doesn't yet contain the CSCE/CPEN/ECEN course documents,
run the one-off seeder — see [Seeding Firestore](seeding-firestore.md).

## 5. Run tests

```bash
cd tamu-planner/frontend
npm run test          # vitest

cd ../server
npx tsc --noEmit      # type-check
```

## 6. Build the docs locally (optional)

From the **repo root**, create a Python venv and install MkDocs:

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-docs.txt
```

Then either preview with live-reload:

```bash
mkdocs serve
```

Visit <http://127.0.0.1:8000/DegreeFlow/>. Edits to any file under `docs/`
or `mkdocs.yml` refresh the browser automatically.

Or produce the static site the way CI does, which fails on any broken
internal link:

```bash
mkdocs build --strict
```

The rendered HTML lands in `./site/` (gitignored). Useful as a final check
before pushing.

!!! tip "`python` vs `python3`"
    On WSL and most Ubuntu installs the binary is `python3`, not `python`.
    If `python3 -m venv` complains about a missing `ensurepip` module, run
    `sudo apt install python3-venv` first.
