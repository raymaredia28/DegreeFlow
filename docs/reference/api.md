# REST API

Base URL (local dev): `http://localhost:4000`
Base URL (production): your Render service URL.

Endpoints that require authentication expect a Firebase ID token in the
`Authorization: Bearer <token>` header. Admin endpoints additionally require
the caller's email to be in `ADMIN_EMAILS`.

## Health

### `GET /health`

Public. Liveness probe.

```json
{ "ok": true, "service": "degreeflow-server" }
```

## Catalog

### `GET /api/courses`

Public. Returns the full merged catalog (Firestore admin subjects + static
`courses.json`).

### `GET /api/minors`

Public. List of supported minors with their rule-set ids.

### `GET /api/emphases`

Public. List of supported emphasis areas with their rule-set ids.

### `POST /api/requirements/evaluate-local`

Public (but usually called authenticated so we can log the user). Runs a
degree evaluation.

**Body:**

```json
{
  "record": [ /* RecordTerm[] */ ],
  "planner": [ /* PlannerTerm[] */ ],
  "emphasis": "cybersecurity",
  "minor": "mathematics",
  "flags": {
    "hsForeignLanguage": true,
    "studyAbroad": false
  },
  "includePlanned": false
}
```

**Response:** a requirement-tree `EvaluationResult`.

See [Evaluation engine](../developer/evaluation-engine.md) for the shape.

## Admin (admin-only)

All admin endpoints live under `/admin` and require both `authenticate`
and `requireAdmin` middleware.

### `GET /admin/courses?search=<q>`

List all admin-managed courses. Optional case-insensitive search over code
and title.

```json
{ "courses": [ /* Course[] */ ], "total": 337 }
```

### `POST /admin/courses`

Create an admin-managed course. Body (validated with Zod):

```json
{
  "department": { "code": "CSCE", "name": "Computer Science" },
  "primary_subject": "CSCE",
  "primary_number": "482",
  "title": "Senior Capstone Design",
  "credits": 3,
  "description_raw": "...",
  "prereq_raw": "CSCE 315.",
  "prereq_courses": ["CSCE 315"]
}
```

`primary_subject` must be one of `CSCE`, `CPEN`, `ECEN` (case-insensitive,
normalized to upper-case).

### `PUT /admin/courses/:courseId`

Partial update. Body accepts any subset of the create schema. `:courseId`
is the numeric `course_id`.

### `DELETE /admin/courses/:courseId`

Remove the course from Firestore.

## Storage

### `POST /storage/parse-transcript`

Public. Upload-by-text transcript parser. Body:

```json
{ "text": "…raw text extracted from the PDF…" }
```

Returns parsed terms + courses.

### `POST /storage/detect-document-type`

Public. Returns `{"type":"transcript"}` or `{"type":"evaluation"}`.

### `POST /storage/parse-degree-evaluation`

Public. Parses a degree evaluation PDF's extracted text.

### `POST /storage/transcript` (auth)

Save the current user's academic record.

### `GET /storage/transcript/:studentId` (auth)

Load a saved academic record.

### `POST /storage/planner/:studentId` (auth)

Upsert the user's saved planner.

### `GET /storage/planner/:studentId` (auth)

Load the user's saved planner.

### `POST /storage/login` (auth)

Record a sign-in audit row.

## Chat

### `POST /chat/completions` (auth)

Proxies to the TAMU AI Chat API using the server-held key. Request/response
closely mirror the OpenAI Chat Completions shape.

### `GET /chat/models`

List models exposed by the TAMU AI Chat API.
