# TAMU Degree Planner — Project Context

## What This App Does
A degree planning tool for Texas A&M students. Core features:
- Degree evaluation (checks progress toward graduation requirements)
- Course planning and scheduling
- PDF upload and parsing (transcripts, transfer credit evaluations)
- Transfer course handling
- Chatbot for student questions

This app was largely built by an AI agent. When adding features, match existing patterns exactly — do not refactor or restructure unless explicitly asked.

## Stack
- **Frontend:** Next.js + React + Vite
- **Backend:** Node.js + Python (separate processes)
- **Database:** Firestore (Firebase)
- **Auth:** Firebase
- **Hosting:** Frontend on Firebase, Backend on Render
- **Folder structure:**
  - `/frontend` — all Next.js/React code
  - `/backend` — Node/Python backend services

## Ground Rules
- Match existing code style, component patterns, and naming conventions throughout
- Do not introduce new dependencies unless clearly necessary — ask first if unsure
- Do not touch or refactor working code outside the scope of the current task
- Do not change database schema or Firestore collection structure without explicit instruction
- Run existing tests after making changes if a test suite exists
- Performance matters — avoid solutions that cause layout shift, slow loads, or extra network calls

## Preferences
- Keep components clean and readable
- CSS variables or Tailwind for styling — no inline style sprawl
- Theme/UI changes must not impact performance
- When in doubt about implementation approach, choose the simplest solution that fits existing patterns