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

## What we learned from a real ZEUS export (no longer guessing)

A real `.ics` file was inspected directly (11,519 events, 917 distinct
course/group names, spanning 2026–2029). Three things changed based on that:

1. **There is no professor-name field.** No `ORGANIZER`, no `ATTENDEE`, and
   `DESCRIPTION` is empty on almost every event — where it has content, it's
   logistics notes ("A REPLANIFIER", "2H EXAMEN"), never a name. This feature
   is cut from the spec until we find another data source for it, because
   the ICS export cannot supply it.
2. **Course titles rarely say CM/TD/TP.** Only ~3% of course names carry a
   type marker. Color coding is now per-course (a stable color derived from
   the course name itself) instead of per-type, with a separate red "Exam"
   highlight layered on top since exam-sounding titles (`EXAMEN`, `PARTIEL`,
   `CONTROLE`) do show up reliably (~3% of names, but consistent).
3. **The export we tested was not scoped to one student.** It contained the
   entire school's calendar across every course and cohort, not just one
   group's classes. If your real export looks the same, "enter your group
   code" can't work as a single filter — the group labels are per-course
   (`GR A1`, `ACF GR B1`, ...), not one code spanning your whole schedule.
   **This is unresolved** and blocks the auto-filter feature until we know:
   does *your own* ZEUS login produce a smaller, already-filtered file, or
   does everyone get this same full dump? The app currently shows a warning
   banner (and still renders everything) when a loaded file has more than
   300 events, since that's a strong signal it isn't one person's schedule.

Also fixed while looking at real data: one event had a placeholder date of
year 3036 (a ZEUS data bug, not a real class) — now filtered out — and event
text is now HTML-escaped before rendering, since it's free-form text written
by school staff and shouldn't be trusted as safe markup.

## Roadmap

- **V1 (this)** — manual upload, English display, per-course color coding,
  exam highlighting. Done.
- **V1.1** — resolve the group-filtering question above, then build
  whatever it implies: either a simple "already filtered, just display it"
  path, or a search/filter UI over the full export.
- **V1.2** — weekly grid view as an alternative to the day-list view.
- **V2** — investigate whether ZEUS exposes a public per-group `.ics` URL
  that would let us skip the manual download step. Requires checking ZEUS's
  network requests while logged in — not assumed safe or possible yet.
- **V3** — one-click Google Calendar export via Google's Calendar API
  (OAuth + a Google Cloud project — a meaningfully bigger task than
  everything above combined; budget real time for it separately).
