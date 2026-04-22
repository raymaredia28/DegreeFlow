# Evaluation engine

The evaluation engine turns **(academic record + planner + emphasis +
minor)** into a completion report for the selected degree plan.

Its entry point is `evaluateRequirementsLocal()` on the server. A
lightweight mirror exists in the frontend (`src/lib/evaluation.js`) to
compute a **signature** used to skip redundant API calls.

## Inputs

```ts
type EvaluationInput = {
  record: Array<RecordTerm>;          // completed + in-progress
  planner?: Array<PlannerTerm>;       // optional projected plan
  emphasis: string;                   // e.g. "cybersecurity"
  minor?: string;                     // optional
  flags: {
    hsForeignLanguage?: boolean;
    studyAbroad?: boolean;
  };
};
```

## Algorithm (high level)

1. **Normalize courses** — uppercase codes, strip whitespace, map through
   `getCanonicalCode()` to collapse equivalencies.
2. **Filter eligible courses** — drop rows where `countsTowardDegree ===
   false`, then apply grade gates (C- minimum for required courses,
   D- minimum for most electives).
3. **Build a bucket map** — `code → bestInstance` so that retakes prefer
   the highest grade and most recent term.
4. **Walk the requirement tree** for the selected emphasis/minor:
    - At each leaf, try to claim a course from the bucket map.
    - Claimed courses are *removed* from the pool so they can't double-count
      across incompatible requirements.
    - Internal nodes (`and`, `or`, `count`, `hours`) aggregate child
      results.
5. **Emit a result tree** mirroring the rule tree, with:
    - `satisfied: boolean`
    - `hoursRequired`, `hoursEarned`, `hoursInProgress`
    - `matchedCourses: RecordCourse[]`
    - `missing: RequirementNode[]` (leaves that couldn't be satisfied)

## Double-counting

The engine supports two forms of intentional double-counting:

- **Shared core ↔ emphasis** — some emphasis tracks explicitly allow a
  core CS course to satisfy both a core slot and a track slot. These are
  encoded on the requirement node (`allowShareWith: [id, …]`).
- **University core attributes** — a single course can satisfy multiple
  university-core buckets if it carries multiple attributes (e.g.
  `UCC-W` and `UCC-ICD`). This is allowed because that's how TAMU's own
  evaluation works.

Anything else is strict single-claim.

## Signature & cache

The frontend computes an input signature (`computeEvaluationSignature`)
from the record, planner, emphasis, minor, and flags. If the current
signature equals the last one we successfully evaluated, we reuse the
cached result instead of re-calling the backend. The Academic Record's
"Unsaved changes" banner is driven by the same idea: if the local record
differs from the server's saved version, we know a new evaluation is
stale.

## Adding a new emphasis

1. Create a new rule file under `server/src/requirements/tracks/<name>.ts`.
2. Export a `RequirementNode` tree (see existing tracks for the pattern).
3. Register it in `server/src/requirements/index.ts`.
4. Add a human-friendly label in the frontend's emphasis `<select>`.
5. Add a Vitest snapshot-style test under `frontend/src/lib/__tests__/`
   that evaluates a known record against the new emphasis.
