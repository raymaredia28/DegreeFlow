# DegreeFlow

**DegreeFlow** is a degree-planning application built for Texas A&M University
Computer Science students as part of CSCE 482 (Spring 2026). It augments the
university's built-in degree planner with transcript parsing, automated
requirements evaluation, a prerequisite-aware semester planner, and an AI
chat assistant.

---

## What you can do with it

- :material-file-upload: **Upload your transcript or degree evaluation PDF** and have
  courses extracted, cleaned up, and pinned to the correct terms.
- :material-clipboard-check-outline: **Run a degree evaluation** against the CS requirement
  set — including emphasis areas and minors — and see which requirements are
  satisfied, in progress, or missing.
- :material-calendar-text: **Build a multi-semester plan** that respects prerequisites,
  credit limits, and course equivalences.
- :material-sitemap: **Visualize prerequisite chains** as an interactive graph.
- :material-robot-outline: **Ask the assistant** ("what should I take next semester?")
  and optionally let it propose planner changes for your review.
- :material-shield-account: **Administer the course catalog** (admin-managed subjects
  `CSCE`, `CPEN`, `ECEN`) through the built-in admin panel, backed by Firestore.

## Two audiences, two guides

<div class="grid cards" markdown>

- :material-account-outline: **[User guide](user-guide/index.md)**

    How to sign in, upload your transcript, build a plan, and run evaluations.
    Start here if you're a student (or an advisor) using DegreeFlow.

- :material-code-tags: **[Developer guide](developer/index.md)**

    Repo layout, local setup, architecture, data model, and how the evaluation
    engine works. Start here if you're contributing code or operating a
    deployment.

</div>

## Looking for something specific?

- REST endpoints → [API reference](reference/api.md)
- Environment variables → [Environment variables](reference/env-vars.md)
- Firestore layout → [Firestore schema](reference/firestore-schema.md)

## Repository

Source lives at [github.com/raymaredia28/DegreeFlow](https://github.com/raymaredia28/DegreeFlow).
This site is regenerated on every push to `deployment-test`.
