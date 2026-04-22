# Degree evaluation

Click **Generate** on the Dashboard tab to run a degree evaluation. The
result is a tree of **requirement groups**, each showing:

- A completion bar (hours satisfied / hours required)
- The specific courses that counted toward it
- What's still missing, if anything

## Requirement groups

Typical groups you'll see for CS include:

| Group | What it checks |
|---|---|
| **University core** | State-mandated core (English, gov, math, science, creative arts, etc.) |
| **Computer Science core** | CSCE 121 → 465 chain, plus required math (MATH 151/152/304/308, STAT 211) |
| **Track / emphasis** | Courses specific to your selected emphasis (e.g. Cybersecurity track) |
| **CS track electives** | Upper-level CSCE electives not consumed by the core or track |
| **General electives / hours** | Total-hours and residency requirements |
| **Minor** (optional) | If you selected a minor, its requirement list |

## Projected vs. current

By default the evaluation uses only your **completed** and **in-progress**
courses. To see the effect of your Planner, toggle **Include planned
courses** before clicking Generate. The completion bars fill based on the
assumption those planned courses will be passed.

## Interpreting common states

- :material-check-circle-outline: Green bar at 100 %: requirement satisfied.
- :material-progress-clock: Half-filled blue bar: in progress — the course is
  on your record but not yet graded.
- :material-alert-circle-outline: Yellow gap: the group needs `N` more hours
  of a specified list of courses.
- :material-close-circle-outline: Red slot: a required course hasn't been
  taken or planned.

## Re-running after edits

Editing the academic record does **not** automatically re-run the
evaluation. Hit **Update Record**, wait for the confirmation, then click
**Generate** again.
