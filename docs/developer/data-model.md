# Data model

DegreeFlow's data falls into three buckets:

1. **Catalog data** — the master list of courses and their metadata.
2. **Requirement rule sets** — declarative specs for CS core, emphases,
   and minors.
3. **Per-user data** — academic records, planners, and audit rows.

## 1. Catalog

A course document looks roughly like this:

```json
{
  "course_id": 482198,
  "codes": ["CSCE 482"],
  "primary_subject": "CSCE",
  "primary_number": "482",
  "title": "Senior Capstone Design",
  "credit_hours": 3,
  "description": "...",
  "prerequisites": [
    ["CSCE 315"],
    ["CSCE 313"]
  ],
  "offered_terms": ["Fall", "Spring"],
  "attributes": ["UCC-W"]
}
```

Notes:

- `course_id` is the Firestore document id (as a string). Numeric in JSON.
- `prerequisites` is a **list of OR-groups** — the outer list is AND, each
  inner list is OR. `[["MATH 151"], ["CSCE 121","ENGR 102"]]` means
  *MATH 151 AND (CSCE 121 OR ENGR 102)*.
- Courses whose `primary_subject` is in the admin set come from Firestore;
  everything else comes from `data/courses.json`.

## 2. Requirement rule sets

Located in `server/src/requirements/`. Each rule set is a tree of
**requirement nodes** with these common shapes:

- `and` — every child must pass.
- `or` — at least one child must pass.
- `count` — at least `n` children must pass (e.g. "3 of these 6 electives").
- `hours` — accumulate `n` credit hours from matching courses.
- `course` / `any-of` — leaf that matches one specific course or a list.

A typical CS core requirement looks like:

```ts
{
  id: "cs.core.csce-411",
  kind: "course",
  code: "CSCE 411",
  label: "CSCE 411 — Analysis of Algorithms",
}
```

The evaluator walks this tree against the user's record and returns a
parallel tree of `{ satisfied, progress, missing, matchedCourses }`
results.

## 3. Per-user data (Firestore)

```
users/{uid}/
├── profile            # { email, createdAt, lastLoginAt }
├── transcript         # { terms: [...] }  — saved academic record
├── planner            # { terms: [...] }  — future semester plans
└── logins/{ts}        # append-only sign-in audit rows
```

Full Firestore layout: [Firestore schema](../reference/firestore-schema.md).

## Course equivalencies

`src/lib/evaluation.js` (frontend) and `src/services/evaluator.ts` (server)
share a list of equivalent-course groups, e.g.:

```ts
const EQUIVALENT_COURSE_GROUPS = [
  ["ACCT 209", "ACCT 229"],
  ["MATH 151", "MATH 171"],
  ["MATH 152", "MATH 172"],
  // ...
];
```

`getCanonicalCode(code)` returns the first code in the group containing
`code`. The evaluator normalizes both the record and the rule-set codes to
their canonicals before comparing.
