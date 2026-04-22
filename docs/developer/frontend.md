# Frontend

The frontend is a Vite + React 18 app in `tamu-planner/frontend`.

## Key files

| Path | Responsibility |
|---|---|
| `src/App.jsx` | Tab shell, authentication state, top-level routing between screens. Holds the academic record, planner state, and dirty-flag logic. |
| `src/components/DegreeProgress.jsx` | Renders the evaluation result returned by the backend. |
| `src/components/AdminPanel.jsx` | Course catalog admin UI (CSCE/CPEN/ECEN CRUD). |
| `src/components/DegreePlanner*.jsx` | Planner grid, term cards, course cards. |
| `src/components/PrerequisitesGraph.jsx` | React Flow-based prereq visualization. |
| `src/firebase.js` | Firebase SDK initialization (auth + Firestore client-side reads). |
| `src/lib/api.js` | Thin fetch wrapper that attaches the Firebase ID token to requests. |
| `src/lib/evaluation.js` | Helpers: equivalence groups, signature hashing, client-side guards. |

## State management

State is plain React — no Redux. The major pieces live on `App.jsx`:

- `authUser` — the current Firebase user.
- `transcriptTerms` + `reviewTerms` — saved vs. in-flight academic record.
- `isTranscriptDirty` — derived flag that drives the "Unsaved changes"
  banner.
- `semesterPlans` — future-term plans, autosaved to Firestore.
- `degreeResult` + `lastEvaluationSignature` — most recent evaluation and
  an input-hash used to avoid duplicate API calls.

## Styling

Tailwind CSS with a small palette override. Icons come from
[`lucide-react`](https://lucide.dev). No CSS modules.

## Testing

Vitest with `jsdom` and `@testing-library/react`. Run with:

```bash
npm run test
```

Tests currently focus on the evaluation helpers in `src/lib/`. When adding
new requirement logic, prefer pushing it into `lib/` so it's testable
without mounting components.
