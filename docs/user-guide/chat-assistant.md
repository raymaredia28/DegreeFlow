# Chat assistant

The **Chat** tab is a conversational helper backed by the TAMU AI Chat API.
It has read access to your academic record, current planner, and the latest
degree evaluation, which lets it answer questions like:

- *"What CS electives can I take next fall?"*
- *"I want to graduate in Spring 2027 — does my plan get me there?"*
- *"What's the difference between CSCE 420 and CSCE 421?"*
- *"Swap out my Fall term to avoid 8 AMs."*

## Ask vs. Act

Every assistant response falls into one of two modes:

- **Ask:** the assistant replies in plain text only.
- **Act:** the assistant produces a proposed set of planner changes
  (add / remove / move courses) and shows them as a **diff**.

Proposed changes never apply automatically. Review the diff card that
appears, then click **Apply** or **Discard**.

## Privacy of your data

Requests are sent to the university's chat API endpoint. Only the minimum
context needed to answer your question is included — typically your current
emphasis, minor, and a summary of completed/planned courses. Raw transcripts
are **not** forwarded.

## When it doesn't know

The assistant is grounded on the course catalog shipped with DegreeFlow. If
a course isn't in the catalog (e.g. a special topics section that hasn't been
added yet) it will say so rather than guess. Admins can add missing
admin-managed courses from the [Admin panel](admin.md).
