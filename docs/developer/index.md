# Developer guide

This guide is for anyone contributing code to DegreeFlow or operating a
deployment.

## Repository layout

```
DegreeFlow/
├── docs/                     # this documentation site (MkDocs)
├── mkdocs.yml
├── requirements-docs.txt
└── tamu-planner/
    ├── frontend/             # React + Vite app, Firebase Hosting
    │   ├── src/
    │   ├── public/
    │   └── package.json
    └── server/               # Express + TypeScript API, Render/Docker
        ├── src/
        │   ├── routes/       # HTTP routes (catalog, admin, storage, …)
        │   ├── storage/      # Firestore / local-db adapters
        │   ├── services/     # auth, transcript parsing, evaluation
        │   └── requirements/ # requirement rule sets
        ├── data/
        │   └── courses.json  # static catalog, used for non-admin subjects
        ├── scripts/          # one-off ops scripts
        └── package.json
```

## Where to start

- [Local setup](setup.md) — get the frontend and backend running against
  Firebase in under 10 minutes.
- [Architecture](architecture.md) — the big picture: services, data flow,
  and responsibilities.
- [Evaluation engine](evaluation-engine.md) — the most subtle part of the
  codebase, with the rules for requirement matching.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite, Tailwind, Lucide icons |
| Backend | Node 20, Express, TypeScript, Zod |
| Auth | Firebase Authentication (Google) |
| Data | Firestore (admin subjects + user state), static JSON (rest) |
| PDF parsing | Server-side `pdfjs-dist`, in-browser Tesseract fallback |
| AI chat | TAMU AI Chat API |
| Tests | Vitest (frontend), tsc + ad-hoc scripts (backend) |
| Hosting | Firebase Hosting (frontend), Render (backend) |
| Docs | MkDocs Material → GitHub Pages |

## Contributing

See [setup](setup.md) to get going. Open a PR against `deployment-test` with a focused
commit description. Linter runs on CI; tests are encouraged for any change
to the evaluation engine or requirement rules.
