# Backend

The backend is an Express + TypeScript service in `tamu-planner/server`.
This page walks through how the process boots, how requests are routed,
and the key functions inside each module.

## Entry point

The process starts at `src/index.ts`, which builds the Express app with
`createApp()` and then listens on `env.port`. On startup it also warms
the in-memory course catalog cache so the first request is fast.

```ts
// src/index.ts
const app = createApp();
app.listen(env.port, () => {
  console.log(`Server listening on port ${env.port}`);
  catalogStorage
    .getFullCatalog()
    .then((courses) =>
      console.log(`[startup] Catalog cache warmed (${courses.length} courses)`)
    )
    .catch((err) =>
      console.warn("[startup] Failed to warm catalog cache:", err)
    );
});
```

`createApp()` lives in `src/app.ts` and wires middleware in a fixed order:

| Step | Middleware | Purpose |
|---|---|---|
| 1 | `helmet()` | Hardened HTTP headers. |
| 2 | `compression()` | gzip response bodies. |
| 3 | `cors(...)` | Allows only origins listed in `CLIENT_ORIGIN`. |
| 4 | `express.json({ limit: "12mb" })` | Accepts large transcript payloads. |
| 5 | `apiRouter` | The single router that mounts every feature area. |
| 6 | `notFound`, `errorHandler` | Fallback + JSON error envelope. |

## Environment config

`src/config/env.ts` reads `.env` via dotenv, validates that the required
vars (`PORT`, `CLIENT_ORIGIN`) exist, and exports a typed `env` object.
Multi-value vars are parsed at load time:

- `CLIENT_ORIGIN` → `env.clientOrigins: string[]` (comma-split, trimmed)
- `TAMU_AI_CHAT_API_ENDPOINT` → trimmed + trailing-slash stripped
- `ADMIN_EMAILS` → lower-cased array for O(1) admin checks

See [Environment variables](../reference/env-vars.md) for the full list.

## Directory layout

Each directory owns one responsibility. The table below maps directory →
purpose → the exported symbols you'll use most:

| Directory | Responsibility | Key exports |
|---|---|---|
| `src/` | App bootstrap | `createApp`, `index.ts` (entrypoint) |
| `src/config/` | Environment loading + validation | `env` |
| `src/middleware/` | Cross-cutting request handling | `authenticate`, `requireAdmin`, `errorHandler`, `notFound` |
| `src/routes/` | HTTP endpoints grouped by feature | `apiRouter`, `healthRouter`, `catalogRouter`, `adminRouter`, `storageRouter`, `chatRouter` |
| `src/services/` | Business logic not tied to HTTP | `verifyBearerToken`, `ensureFirebaseApp`, `isAdminEmail`, `detectDocumentType`, `extractJsonFromAiResponse`, `normalizeToTranscriptFormat`, `buildDegreeEvaluationPrompt` |
| `src/storage/` | Data access (catalog + user state) | `catalogStorage`, `getOrCreateStudent`, `saveTranscriptTerms`, `getTranscriptForStudent`, `savePlannerState`, `getPlannerState` |
| `src/requirements/` | Degree requirement rule sets + evaluator | `evaluateRequirements` (JS module) |
| `scripts/` | One-off ops scripts | `seed-admin-subjects.mjs` |
| `data/` | Static catalog + rule data | `courses.json`, `minors.json`, `emphasis_areas.json` |

## Routing

`src/routes/index.ts` composes every feature router under a single
`apiRouter`:

```ts
export const apiRouter = Router();
apiRouter.use(healthRouter);    // /health
apiRouter.use(storageRouter);   // /storage/*
apiRouter.use(chatRouter);      // /chat/*
apiRouter.use(catalogRouter);   // /api/*
apiRouter.use(adminRouter);     // /admin/*
```

Only the **admin router** applies auth globally via
`adminRouter.use("/admin", authenticate, requireAdmin)`. Every other router
decides per-endpoint whether auth is needed.

Endpoint inventory: [REST API reference](../reference/api.md).

## Middleware

### `authenticate(req, res, next)` — `src/middleware/auth.ts`

Resolves the caller to an `AuthUser` by delegating to
`verifyBearerToken(req.headers.authorization)`. On success it attaches the
user to `req.user`; on failure it short-circuits with `401 Unauthorized`.

```ts
export async function authenticate(req, res, next) {
  try {
    req.user = await verifyBearerToken(req.headers.authorization);
    next();
  } catch {
    res.status(401).json({ error: "Unauthorized" });
  }
}
```

### `requireAdmin(req, res, next)`

Must run after `authenticate`. Rejects with `403 Forbidden` unless
`req.user.isAdmin` is `true`.

### `errorHandler(err, req, res, next)` — `src/middleware/error.ts`

Terminal error handler. Logs the method + path + error, then returns
`{ error: "Internal server error" }` in production and `{ error: message }`
in development. Never leaks stack traces to clients.

### `notFound(req, res)`

Sibling 404 handler. Includes the requested path in dev for easier
debugging; omits it in production.

## Services

Services are stateless helpers used by routes. Put code here if it has
logic beyond "forward the request body to storage."

### `src/services/auth.ts` — Firebase auth glue

| Symbol | Purpose |
|---|---|
| `ensureFirebaseApp()` | Idempotently initializes the Firebase Admin SDK with `cert()` credentials, falling back to `applicationDefault()` in environments that provide it (e.g. GCP). |
| `isAdminEmail(email)` | `O(1)` membership check against the pre-lowered `env.adminEmails` list. |
| `decodeJwtPayload(token)` | Best-effort base64url JWT decode **without signature verification**. Only used in dev mode. |
| `verifyBearerToken(header)` | Returns an `AuthUser`. In production, verifies the Firebase ID token via `getAuth().verifyIdToken(token)`. In dev without Firebase creds, accepts any token and synthesizes a user — useful for running the API fully offline. |

```ts
export type AuthUser = {
  uid: string;
  email: string;
  name: string;
  picture: string;
  isAdmin: boolean;
};
```

!!! warning "Dev-mode bypass"
    If `NODE_ENV !== "production"` **and** Firebase credentials are missing,
    `verifyBearerToken` returns a synthetic user without validating the
    token. This is intentional — it lets contributors run the backend with
    zero Firebase setup — but it must never happen in production. The check
    is safe because `NODE_ENV=production` forces the real-token path.

### `src/services/documentType.ts` — PDF classifier

`detectDocumentType(lines: string[])` scores the uploaded document against
two marker lists and returns `"transcript" | "degree-evaluation" |
"unknown"`. The route at `POST /storage/detect-document-type` calls it
before picking a parser.

```ts
const TRANSCRIPT_MARKERS = ["SUBJ NO", "COURSE TITLE", "TRANSCRIPT TOTALS", ...];
const DEGREE_EVAL_MARKERS = ["DEGREE EVALUATION", "PROGRAM REQUIREMENTS", ...];
```

### `src/services/degreeEvaluationParser.ts` — AI-assisted parser

Parses degree-evaluation PDFs by prompting the TAMU AI Chat API and
normalizing the response into the same shape as a transcript.

| Symbol | Purpose |
|---|---|
| `buildDegreeEvaluationPrompt(lines)` | Constructs the LLM prompt (system + user) from OCR/PDF text. |
| `extractJsonFromAiResponse(raw)` | Strips Markdown code fences and trims to the outermost `{...}`, returning a parsed object or `null`. |
| `normalizeToTranscriptFormat(raw)` | Validates the LLM output with a Zod schema, maps term codes like `202431` → `"Fall 2024"` via `TERM_SUFFIX_MAP`, and returns `TranscriptTerm[]`. |

## Storage

### Catalog — `src/storage/catalogStorage.ts`

Exports `catalogStorage: CatalogStorageProvider`, a single object that
implements either the local or Firestore backend depending on
`NODE_ENV`:

```ts
const useLocal = env.nodeEnv !== "production";
export const catalogStorage = useLocal
  ? localCatalogStorage
  : firestoreCatalogStorage;
```

Both implementations satisfy the same interface:

```ts
interface CatalogStorageProvider {
  getAllCourses(): Promise<any[]>;      // admin-managed subjects only
  getFullCatalog(): Promise<any[]>;     // admin + static, deduped
  getCourseById(id: number): Promise<any | null>;
  addCourse(course: any): Promise<any>;
  updateCourse(id: number, updates: Record<string, unknown>): Promise<any | null>;
  deleteCourse(id: number): Promise<boolean>;
}
```

Supporting functions:

| Function | Purpose |
|---|---|
| `isAdminCourse(c)` | `true` iff `c.primary_subject` is in `ADMIN_SUBJECTS` (`CSCE`, `CPEN`, `ECEN`). |
| `sanitizeForFirestore(obj)` | Strips `undefined` values and wraps nested arrays as `{ group: [...] }` — Firestore forbids both. |
| `deserializeFromFirestore(obj)` | Inverse of `sanitizeForFirestore`: unwraps `{ group: [...] }` back to nested arrays so the rest of the app sees the original shape. |
| `ensureSeeded()` | Idempotent one-shot migration of admin-subject courses from `courses.json` into the `courses` collection. Gated on the `catalog_meta/seed_status` doc. |
| `getFirestoreAdminCourses()` | Reads every doc in `courses`, deserializes, and returns them. |
| `invalidateCatalogCache()` | Clears the 5-minute in-memory cache after any mutation. |

The **full catalog cache** keeps the merged list in memory for 5 minutes
so hot paths (`/api/courses`, the evaluator) don't re-read the JSON file
on every request.

### User state — `src/storage/{localDb,firestoreDb}.ts`

`src/storage/index.ts` picks a provider the same way as the catalog, then
re-exports these functions:

| Function | Purpose |
|---|---|
| `getOrCreateStudent({ uid, email?, name? })` | Upsert a `Student` record keyed by Firebase uid. Returns the canonical row. |
| `saveTranscriptTerms(studentId, terms)` | Persist the full academic record (overwrite semantics). |
| `getTranscriptForStudent(studentId)` | Load the previously-saved record; empty array if none. |
| `savePlannerState(studentId, payload)` | Upsert the planner. Returns `PlannerState` with `created_at` / `updated_at`. |
| `getPlannerState(studentId)` | Load the planner or `null`. |

Types live in `src/storage/types.ts` (`Student`, `PlannerState`,
`TranscriptCourse`, `TranscriptTerm`, `StorageProvider`).

## Routes: function-level notes

### `catalogRouter` — `src/routes/catalog.ts`

| Endpoint | Handler notes |
|---|---|
| `GET /api/courses` | Returns `{ courses }` from `catalogStorage.getFullCatalog()` (cache-backed). |
| `GET /api/minors` | Reads `data/minors.json` through the local `loadJson(name)` helper. |
| `GET /api/emphases` | Reads `data/emphasis_areas.json`. |
| `POST /api/requirements/evaluate-local` | Normalizes each submitted course to `"DEPT NNN"` with a small `normCode` helper, looks each one up in a `catalogIndex: Map<string, Course>`, and hands the result to the pure-JS `evaluateRequirements(...)` function from `src/requirements/`. |

Evaluator input is strongly shaped by the `CourseEntry` interface (see the
top of the file). The `evaluationPriority` flag lets the front end nudge
tie-breaking inside `anyOf` clauses.

### `adminRouter` — `src/routes/admin.ts`

Every handler is wrapped by `authenticate` + `requireAdmin`. Writes are
validated by `courseCreateSchema` / `courseUpdateSchema` (Zod):

```ts
primary_subject: z
  .string()
  .min(1)
  .transform((s) => s.toUpperCase())
  .refine((s) => ADMIN_SUBJECTS.includes(s), {
    message: `primary_subject must be one of ${ADMIN_SUBJECTS.join(", ")}`,
  });
```

Reads support a case-insensitive `search` query over the concatenation of
`"<subject> <number>"` and the course title.

### `storageRouter` — `src/routes/storage.ts`

Mix of public endpoints (PDF parsing helpers) and authed endpoints (save /
load per-user state). The authed handlers always derive `studentId` from
`req.user.uid`, never from the client — clients can *request* a path
parameter but the middleware re-asserts ownership.

### `chatRouter` — `src/routes/chat.ts`

`POST /chat/completions` validates the body with a Zod schema
(`{ messages: {role, content}[], model?, stream? }`), then proxies to
`${env.tamuAiApiEndpoint}/api/v1/chat/completions` with
`Authorization: Bearer ${env.tamuAiApiKey}`. Returns `500` with an
informative error if `TAMU_AI_CHAT_API_KEY` isn't configured.

### `healthRouter` — `src/routes/health.ts`

`GET /health` returns `{ ok: true, service: "degreeflow-server" }`. Used
by Render's health check.

## Error handling conventions

Routes should `try { … } catch (err) { next(err); }` and let
`errorHandler` produce the response. Don't reach into `res` from a catch
block — the middleware already handles production/dev messaging and
stack-trace redaction.

Zod parse failures don't go through the error middleware: routes return
`400` directly with `{ error: "Invalid …", issues: parsed.error.issues }`
so the caller gets actionable field-level errors.

## Adding a new feature area

1. Create `src/routes/<feature>.ts` that exports `export const
   <feature>Router = Router();`.
2. Register it in `src/routes/index.ts` (`apiRouter.use(<feature>Router)`).
3. If it needs auth, add `authenticate` (and optionally `requireAdmin`)
   per-endpoint.
4. Put non-HTTP logic in `src/services/<feature>.ts` so it can be unit
   tested.
5. Add the new endpoints to [REST API reference](../reference/api.md).
