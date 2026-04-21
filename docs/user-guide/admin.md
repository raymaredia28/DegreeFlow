# Admin panel

!!! info "Who sees this?"
    The Admin tab only appears for users whose Google email is listed in the
    backend's `ADMIN_EMAILS` environment variable.

The admin panel lets authorized users manage the subset of the catalog that
DegreeFlow stores in Firestore — currently the subjects **CSCE**, **CPEN**,
and **ECEN**. All other subjects are loaded from the static
`data/courses.json` shipped with the backend and can't be edited from the
UI.

## What you can do

- **List** admin-managed courses with search and subject filter.
- **Create** a new course (subject, number, title, credit hours,
  description, prerequisites).
- **Edit** an existing course. Changes are versioned in Firestore and picked
  up by the next evaluation.
- **Delete** a course. The UI will warn you if any student's saved planner
  references it.

## Validation

Creating or editing a course runs server-side Zod validation. In particular:

- `primary_subject` must be one of `CSCE`, `CPEN`, or `ECEN` (case-insensitive;
  stored upper-case).
- Credit hours must be a non-negative integer.
- Course numbers must be 3 digits for CSCE/ECEN.

If validation fails, the panel shows the error message directly from the
server.

## Bulk seeding

For large imports (for example, seeding all CPEN courses from a new
`courses.json`), use the one-off script described in
[Seeding Firestore](../developer/seeding-firestore.md) instead of clicking
through the UI.
