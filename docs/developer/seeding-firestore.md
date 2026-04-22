# Seeding Firestore

Admin-managed subjects (`CSCE`, `CPEN`, `ECEN`) live in the `courses`
Firestore collection. For new deployments, or when adding a new admin
subject, you need to populate that collection.

There are two ways to do it:

1. **Automatic on first boot** — `ensureSeeded()` runs once at server
   startup and upserts every admin-subject course from
   `data/courses.json` if `catalog_meta/seed_status.seeded` isn't true.
2. **Manual / targeted — the one-off script** (`scripts/seed-admin-subjects.mjs`).

Use the script when you want to:

- Seed a specific subject (e.g. just `CPEN`) without re-triggering the
  full bootstrap.
- Re-run the import after editing `data/courses.json` locally.
- Do a dry run to see what would be written before touching production.

## Prerequisites

Set the Firebase Admin credentials in `.env` (same ones used by the
backend):

```bash
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxx@your-project-id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
```

Getting those values:

1. Firebase Console → **Project settings** → **Service accounts**.
2. Click **Generate new private key** and download the JSON.
3. Copy `project_id`, `client_email`, and `private_key` into `.env`. Keep
   the `\n` literal escapes in `private_key`.

## Usage

All commands run from `tamu-planner/server`.

### Dry run — see what would be written

```bash
DRY_RUN=1 node scripts/seed-admin-subjects.mjs
```

Output looks like:

```text
[seed] subjects: CSCE, CPEN, ECEN
[seed] reading /.../server/data/courses.json
[seed] 412 courses to upsert: { CSCE: 336, ECEN: 76 }
[seed] DRY_RUN=1, exiting without writing.
```

### Seed a specific subject

```bash
SUBJECTS=CPEN,ECEN node scripts/seed-admin-subjects.mjs
```

### Seed everything

```bash
node scripts/seed-admin-subjects.mjs
```

The script is **idempotent**: re-running overwrites documents with the
current content from `courses.json` using `{ merge: true }`.

## Verifying

After running, check Firestore:

```bash
# Firestore console, or via the admin panel in the UI
# Counts per subject should match the [seed] summary above.
```

The script also stamps `catalog_meta/seed_status` with a timestamp and
which subjects were written, which is convenient for audit.

## Adding a new admin subject

1. Add the subject to `ADMIN_SUBJECTS` in `server/src/storage/catalogStorage.ts`.
2. Add the same subject to `ADMIN_SUBJECTS` in `server/src/routes/admin.ts`.
3. Make sure `data/courses.json` has entries with the new subject.
4. Run `SUBJECTS=<NEW_SUBJECT> node scripts/seed-admin-subjects.mjs`.
5. Redeploy.
