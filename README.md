# ZEUS Schedule Viewer

An English, color-coded viewer for EPITA's ZEUS timetable. V1 is deliberately
small: it reads a `.ics` file you export from ZEUS and displays it — no login
handling, no scraping, no external services.

## Run it (no install required)

Just open `index.html` in a browser. Double-click the file, or drag it into
a browser window. That's it — there's no server, no npm, no build step.

Click **"Or try it with a sample schedule"** to see it work immediately with
fake data before you have a real export.

## How to get your real schedule into it

1. Log into ZEUS, navigate to your timetable, click **"Générer un ICS"**.
2. Save the downloaded `.ics` file.
3. On this page, click the upload box and select that file.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | The page skeleton: upload button, and two empty containers (`#legend`, `#schedule`) that JavaScript fills in. |
| `style.css` | All colors and layout. Class-type colors are CSS variables at the top of the file. |
| `app.js` | Everything else: reads the file, parses the `.ics` text format, classifies each class, and builds the HTML for the page. |
| `sample.ics` | A fake schedule you can inspect as a reference for what a real ZEUS export should roughly look like. |

## How `app.js` works, in order

1. **`unfoldLines`** — the `.ics` format (a real spec, [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)) allows one logical line to be split across several physical lines, with continuation lines starting with a space. This joins them back together.
2. **`parseICSLine`** — splits a line like `DTSTART;TZID=Europe/Paris:20260922T083000` into its name (`DTSTART`), parameters (`TZID=Europe/Paris`), and value (`20260922T083000`).
3. **`parseICSDate`** — converts ZEUS's date format (`20260922T083000`) into a real JavaScript `Date` object.
4. **`parseICS`** — walks through every line, and between each `BEGIN:VEVENT` / `END:VEVENT` pair, builds one event object: `{ summary, location, description, start, end }`.
5. **`classify`** — looks at the event's French title (e.g. `"CM - Algorithmique"`) and matches it against patterns in `CLASS_TYPES` to decide if it's a Lecture, Tutorial, Lab, or Exam, and which color to use.
6. **`groupByDay`** / **`renderSchedule`** — sorts everything chronologically and builds the actual HTML cards you see on the page.

## Known limitation — please send a real sample

**I have never seen an actual ZEUS `.ics` export**, only guessed at its shape
from how these academic scheduling systems typically work. The `CLASS_TYPES`
patterns in `app.js` (matching `CM`, `TD`, `TP`, `Examen`) and the assumption
that professor names live in `DESCRIPTION` are both guesses. Once you export
a real file, share it (redact your name/student ID if you want) so the
patterns can be corrected against real data.

## Roadmap

- **V1 (this)** — manual upload, English display, color coding. Done.
- **V1.1** — weekly grid view as an alternative to the day-list view.
- **V2** — investigate whether ZEUS exposes a public per-group `.ics` URL
  (common in French school scheduling systems) that would let us skip the
  manual download step. This requires checking ZEUS's network requests while
  logged in — it cannot be assumed safe or possible without that check.
- **V3** — one-click Google Calendar export via Google's Calendar API
  (requires OAuth setup, a Google Cloud project, and is a meaningfully bigger
  task than everything above combined — budget real time for it separately).
