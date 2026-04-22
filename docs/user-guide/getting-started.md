# Getting started

## 1. Sign in

Open the deployed app URL (for example `https://degreeflow-3227a.web.app`)
and click **Sign in with Google**. DegreeFlow uses Firebase Authentication —
no separate account is needed.

!!! info "Admin access"
    Admin features (managing the course catalog) are only visible if your
    Google email is on the configured `ADMIN_EMAILS` list. Regular users see
    the user-facing tabs only.

## 2. Upload a transcript or degree evaluation

In the **Academic Record** section (inside the Planner tab), click
**Upload PDF**. DegreeFlow accepts:

- Your official **TAMU transcript** (Howdy → Records → View/Print Unofficial
  Transcript → PDF).
- A **TAMU degree evaluation** PDF.

The server auto-detects which document type you uploaded and uses the
appropriate parser. If OCR is needed (scanned or low-text PDFs), it runs
Tesseract in the browser.

## 3. Review the parsed record

After a successful upload you'll see a term-by-term breakdown with grades and
credits. Before continuing, spot-check for:

- Courses placed in the wrong term (drag and drop to fix)
- Transfer or pass/fail rows you want to exclude from the evaluation
  (uncheck **Count toward degree**)
- Missing manual entries (e.g. courses from an older system) — see
  [Academic record](academic-record.md) for how to handle edits

When the record is correct, click **Update Record** to save.

## 4. Pick emphasis and minor

At the top of the Dashboard tab, select your **Emphasis** (e.g. *Cybersecurity*,
*Data Science*) and **Minor** (if any). These drive which requirement sets are
evaluated.

Check any additional flags that apply to you:

- *Completed 2 years of same foreign language in HS*
- *Completed a Study Abroad (SABR) course*

## 5. Generate an evaluation

Click **Generate**. The result appears beneath the button and breaks your
degree into requirement groups with completion bars.

From here, you can:

- [Build a semester plan](planner.md) for remaining coursework
- [Explore prerequisites](prerequisites.md)
- [Ask the chat assistant](chat-assistant.md) for suggestions

## Privacy note

Transcripts are stored in your account (keyed by Firebase UID) so you can
resume later. You can clear everything from the Academic Record section via
the **Clear Record** button at any time.
