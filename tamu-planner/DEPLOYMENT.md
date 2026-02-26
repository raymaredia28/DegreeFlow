# DegreeFlow Deployment (Render + Firebase Hosting)

This guide deploys:
- Backend (`server`) to Render free web service
- Frontend (`frontend`) to Firebase Hosting

## 0. Pre-deploy checks

1. Make sure your code is committed and pushed to GitHub.
2. Rotate any exposed secrets before deploying.
3. Confirm your Firebase project exists and Firestore is enabled.

## 1. Deploy backend to Render first

The backend must be live before building/deploying frontend because frontend needs `VITE_API_BASE`.

### 1.1 Create Render service

1. Go to Render dashboard.
2. Click `New +` -> `Web Service`.
3. Connect your GitHub repo.
4. Configure:
   - Name: `degreeflow-backend` (or your choice)
   - Runtime: `Docker`
   - Root Directory: `tamu-planner/server`
   - Branch: your deploy branch (usually `main`)
   - Plan: `Free`
   - Health Check Path: `/health`

### 1.2 Add Render environment variables

Copy values from `server/.env.render.example` and set them in Render.

Required:
- `NODE_ENV=production`
- `PORT=10000`
- `CLIENT_ORIGIN=https://<your-project-id>.web.app,https://<your-project-id>.firebaseapp.com`
- `TAMU_AI_CHAT_API_KEY=<your value>`
- `TAMU_AI_CHAT_API_ENDPOINT=https://chat-api.tamu.ai`
- `FIREBASE_PROJECT_ID=<your firebase project id>`
- `FIREBASE_CLIENT_EMAIL=<service account client email>`
- `FIREBASE_PRIVATE_KEY=<service account private key with \n escapes>`
- `SESSION_SECRET=<long random string>`

Notes:
- `DATABASE_URL` is currently unused in this codebase.
- `LOCAL_DB_PATH` can stay `./data/local-db.json`.

### 1.3 Deploy and verify backend

1. Click `Create Web Service`.
2. Wait for build/deploy to finish.
3. Open `https://<your-render-service>.onrender.com/health`.
4. Expected response:

```json
{"ok":true,"service":"degreeflow-server"}
```

If health fails, check Render logs for:
- Missing env vars
- Invalid `FIREBASE_PRIVATE_KEY` formatting
- Python dependency install issues

## 2. Deploy frontend to Firebase Hosting

### 2.1 Prepare production env file

From `tamu-planner/frontend`:

```bash
cp .env.production.example .env.production
```

Edit `.env.production`:
- `VITE_API_BASE=https://<your-render-service>.onrender.com`
- Firebase web app values (`VITE_FIREBASE_*`)

### 2.2 Build frontend

From `tamu-planner/frontend`:

```bash
npm install
npm run build
```

### 2.3 Login and deploy to Firebase Hosting

From `tamu-planner/frontend`:

```bash
npx firebase-tools login
npx firebase-tools use <your-project-id>
npx firebase-tools deploy --only hosting
```

The hosting config is already in:
- `frontend/firebase.json`
- `frontend/.firebaserc`

## 3. Post-deploy Firebase Auth setup

In Firebase Console -> Authentication -> Settings -> Authorized domains, add:
- `<your-project-id>.web.app`
- `<your-project-id>.firebaseapp.com`

If you use a custom domain, add it too.

## 4. Final integration checks

1. Open hosted frontend URL.
2. Sign in with Google.
3. Check browser network tab:
   - Requests go to Render URL from `VITE_API_BASE`.
   - No CORS errors.
4. Test:
   - `/api/courses` loading
   - transcript upload (`/storage/parse-transcript`)
   - planner save/load
   - chat endpoint (`/chat/completions`)

## 5. Known free-tier behavior

Render free services sleep after inactivity. First API call may take time (cold start). This is expected.
