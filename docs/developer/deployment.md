# Deployment

The production setup uses:

- **Firebase Hosting** for the frontend (`tamu-planner/frontend`)
- **Render** (Docker) for the backend (`tamu-planner/server`)
- **Firestore** for persistent data
- **Firebase Authentication** for user sign-in

The canonical step-by-step — including Render environment variables and
Firebase Hosting setup — lives in
[`tamu-planner/DEPLOYMENT.md`](https://github.com/raymaredia28/DegreeFlow/blob/deployment-test/tamu-planner/DEPLOYMENT.md).
This page is the short-form overview.

## 1. Backend → Render

1. Push `deployment-test` to GitHub.
2. In the Render dashboard, create a **Web Service** pointing at the repo.
    - Runtime: **Docker**
    - Root directory: `tamu-planner/server`
    - Health check path: `/health`
3. Paste the environment variables from
   [`server/.env.render.example`](https://github.com/raymaredia28/DegreeFlow/blob/deployment-test/tamu-planner/server/.env.render.example)
   into Render's env editor, filling in real values. See
   [Environment variables](../reference/env-vars.md) for the full list.
4. Click **Create**. When the build finishes, hit
   `https://<service>.onrender.com/health` and expect `{ "ok": true }`.

## 2. Frontend → Firebase Hosting

```bash
cd tamu-planner/frontend
# point at the deployed backend
echo 'VITE_API_BASE=https://<service>.onrender.com' > .env.production
npm ci
npm run build
npx firebase deploy --only hosting
```

The first time you deploy, `firebase login` + `firebase use <project-id>`
to select the target project.

## 3. First-run Firestore seeding

From your local machine (credentials in `.env`):

```bash
cd tamu-planner/server
node scripts/seed-admin-subjects.mjs
```

See [Seeding Firestore](seeding-firestore.md) for options (dry run,
specific subjects, etc.).

## 4. Documentation → GitHub Pages

The docs site you're reading deploys automatically from
`.github/workflows/docs.yml` on every push to `deployment-test`. No manual step is
required after you enable GitHub Pages on the repo
([how](../index.md#looking-for-something-specific))… see the short
instructions at the bottom of the
[local setup page](setup.md#6-build-the-docs-locally-optional) for running
MkDocs locally while editing.

## Rollback

- **Backend**: Render keeps prior deploys — use the "Rollback" button on
  the service's Deploys tab.
- **Frontend**: `firebase hosting:releases:list` and
  `firebase hosting:releases:rollback` for the last known good version.
- **Firestore**: there is no automatic rollback. Use the one-off seed
  script with a known-good `courses.json` to restore catalog state.
