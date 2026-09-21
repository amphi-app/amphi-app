# ZEUS Schedule Viewer

An English, color-coded viewer for EPITA's ZEUS timetable. You export one
`.ics` file from ZEUS (covering the whole school), pick which courses are
yours once, and this app remembers that and shows just your schedule from
then on — no login handling, no scraping, no external services.

## Run it (no install required)

Just open `index.html` in a browser. Double-click the file, or drag it into
a browser window. That's it — there's no server, no npm, no build step.

Click **"Or try it with a sample schedule"** to see it work immediately with
fake data before you have a real export.

## How to get your real schedule into it

1. Log into ZEUS (`zeus.ionis-it.com`) via Office 365.
2. In the left sidebar, open **Groupes**, and check the box next to **EPITA**
   (the top-level box — don't drill into the sub-tree, that's what this app
   does for you now).
3. Click **"Générer un ICS"** and save the file.
4. On this page, click the upload box and select that file.
5. The first time, you'll see a searchable list of every course in the
   school — search for your courses (e.g. by course name or your group code
   like "A1") and check the ones that are yours, then **"Show my schedule."**
   Your picks are remembered in the browser, so next time you load a file
   it skips straight to your schedule. Use **"← Edit my courses"** any time
   to change your picks.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | The page skeleton: upload button, course picker, and containers (`#legend`, `#schedule`) that JavaScript fills in. |
| `style.css` | All colors and layout. |
| `app.js` | Everything else: reads the file, parses the `.ics` text format, runs the course picker, classifies each class, and builds the HTML for the page. |
| `sample.ics` | A small fake schedule for the "try it with a sample" button. |

## How `app.js` works, in order

1. **`unfoldLines`** — the `.ics` format (a real spec, [RFC 5545](https://www.rfc-editor.org/rfc/rfc5545)) allows one logical line to be split across several physical lines, with continuation lines starting with a space. This joins them back together.
2. **`parseICSLine`** — splits a line like `DTSTART;TZID=Europe/Paris:20260922T083000` into its name (`DTSTART`), parameters (`TZID=Europe/Paris`), and value (`20260922T083000`).
3. **`parseICSDate`** — converts ZEUS's date format (`20260922T083000`) into a real JavaScript `Date` object.
4. **`parseICS`** — walks through every line, and between each `BEGIN:VEVENT` / `END:VEVENT` pair, builds one event object: `{ summary, location, description, start, end }`. Events with implausible dates (see below) are dropped.
5. **`getUniqueCourses`** — collects every distinct course name (the `SUMMARY` field) in the file, alphabetically, with a count of how many timetable entries each has.
6. **`renderCoursePicker`** / **`getCheckedCourseNames`** — builds the searchable checklist, and reads back which boxes are checked when you click "Show my schedule."
7. **`loadSavedSelection`** / **`saveSelection`** — read and write your course picks to the browser's `localStorage`, so you don't have to re-pick every time.
8. **`classify`** — looks at the event's French title for exam-sounding words (`examen`, `partiel`, `contrôle`) to apply a red highlight; every other course gets a stable color derived from its own name (same course name → same color, every time).
9. **`groupByDay`** / **`renderSchedule`** — sorts the *selected* events chronologically and builds the actual HTML cards you see on the page. Text is HTML-escaped before insertion, since it's free-form text written by school staff, not something we control.

## What a real ZEUS export actually contains (confirmed, not guessed)

Two rounds of checking against a real file (11,519 events, one per school
year, exported by checking "EPITA" broadly) and EPITA's own ZEUS user guide
settled several things that were originally just assumptions:

- **The `.ics` export covers the whole school, not one student.** ZEUS's own
  6-step group-narrowing flow (`Groupes → EPITA → CLASSES PREPARATOIRES →
  PREPA PARIS → SUP/SPE PARIS → tick your group`) is a French tree UI for
  filtering before export. This app's course picker replaces that flow: you
  export broadly (fewer ZEUS clicks) and filter here instead, in English,
  with search.
- **Professor name, course code, and class type (CM/TD/TP/Exam) are not in
  the `.ics` file, ever.** ZEUS's own guide shows its web UI displays these
  (via a "Code activité" / "Enseignant(s)" / "Type d'activité" popup), but
  cross-checking the raw file's field list confirms none of that makes it
  into the export — only `SUMMARY`, `LOCATION`, `DTSTART`/`DTEND`, and a
  mostly-empty `DESCRIPTION` are present. This is a hard ceiling of the
  ICS-only approach: getting those three fields reliably would require
  scraping the authenticated web UI, which reintroduces the login/ToS
  complexity this app deliberately avoids. Cut from the spec, not fixed.
- **Course titles rarely say CM/TD/TP** (only ~3% do), which is why color
  coding is per-course rather than per-type — see `classify` above.
- ZEUS's own data has at least one bogus placeholder date (year 3036, on a
  "reschedule pending" event) — filtered out in `parseICS`.

## Roadmap

- **V1 (this)** — manual upload, course picker with search + persistence,
  English display, per-course color coding, exam highlighting. Done.
- **V1.1** — weekly grid view as an alternative to the day-list view.
- **V2** — investigate whether ZEUS exposes a public per-group `.ics` URL
  that would let us skip the manual download step. Requires checking ZEUS's
  network requests while logged in — not assumed safe or possible yet.
- **V3** — one-click Google Calendar export via Google's Calendar API
  (OAuth + a Google Cloud project — a meaningfully bigger task than
  everything above combined; budget real time for it separately).
