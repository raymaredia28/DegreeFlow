# Firestore schema

DegreeFlow uses two logical regions in the same Firestore project:

1. **Catalog region** — read-heavy, shared across all users.
2. **User region** — one subtree per authenticated user.

## Collection: `courses`

Document id: the numeric `course_id` stringified.

Populated by `catalogStorage.ensureSeeded()` and by the admin panel.
Contains only admin-managed subjects (`CSCE`, `CPEN`, `ECEN`).

```json
{
  "course_id": 482198,
  "codes": ["CSCE 482"],
  "aliases": ["CSCE 482"],
  "primary_subject": "CSCE",
  "primary_number": "482",
  "department": { "code": "CSCE", "name": "Computer Science" },
  "title": "Senior Capstone Design",
  "credits": 3,
  "description_raw": "...",
  "prereq_raw": "CSCE 315.",
  "prereq_courses": ["CSCE 315"],
  "categories": ["UCC-W"]
}
```

!!! note
    Courses for non-admin subjects (MATH, PHYS, ENGL, …) live in
    `tamu-planner/server/data/courses.json` and are **not** stored in
    Firestore.

## Collection: `catalog_meta`

### Document `seed_status`

Written by `ensureSeeded()` and by `scripts/seed-admin-subjects.mjs`.

```json
{
  "seeded": true,
  "seeded_at": "2026-04-18T18:22:11.502Z",
  "last_subjects": ["CSCE", "CPEN", "ECEN"],
  "last_count": 412
}
```

When `seeded === true`, the runtime bootstrap short-circuits and skips
re-seeding. Delete or flip this doc to force a re-seed on next startup.

## Collection: `users/{uid}/…`

`uid` is the Firebase Auth user id.

### Document `profile`

```json
{
  "email": "student@tamu.edu",
  "displayName": "Ada Lovelace",
  "createdAt": "2026-01-14T04:10:01.000Z",
  "lastLoginAt": "2026-04-18T15:03:44.000Z"
}
```

### Document `transcript`

```json
{
  "terms": [
    {
      "label": "Fall 2024",
      "courses": [
        {
          "code": "CSCE 121",
          "title": "Intro to Program Design and Concepts",
          "credits": 4,
          "grade": "A",
          "status": "completed",
          "countsTowardDegree": true
        }
      ]
    }
  ],
  "updatedAt": "2026-04-18T15:03:44.000Z"
}
```

### Document `planner`

```json
{
  "terms": [
    {
      "label": "Fall 2026",
      "courses": [
        { "code": "CSCE 411", "credits": 3 },
        { "code": "CSCE 451", "credits": 3 }
      ]
    }
  ],
  "updatedAt": "2026-04-18T15:04:02.000Z"
}
```

### Subcollection `users/{uid}/logins`

Append-only audit rows (document id = timestamp):

```json
{
  "at": "2026-04-18T15:03:44.000Z",
  "userAgent": "Mozilla/5.0 ...",
  "ip": "203.0.113.7"
}
```

## Suggested security rules

The production deployment already enforces writes through the backend
(Admin SDK), so client-side writes can be locked down:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /courses/{id} {
      allow read: if true;
      allow write: if false;
    }
    match /catalog_meta/{id} {
      allow read, write: if false;
    }
    match /users/{uid}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

Admin writes go through the Node backend using a service account, which
bypasses these rules.
