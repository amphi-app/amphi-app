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
3. Click **"Générer un ICS"**. This gives you a link like
   `https://zeus.ionis-it.com/api/group/1/ics/XXXXXXXXXX` — confirmed to work
   with no login required, just that link. **Copy the link** (don't just
   download the file).
4. On this page, paste that link into the **"…or paste your ZEUS calendar
   link"** box and click **Load**. If ZEUS's server allows this app to fetch
   it directly, it loads immediately and is remembered — next time you open
   the page, it loads automatically, no clicks at all.
   - If that fails, it's because ZEUS's server blocks direct browser fetches
     from other sites (a security setting called CORS) — download the file
     from that same link instead and use the upload box below it. Same
     result, just needs a fresh download when your schedule changes instead
     of refreshing automatically.
5. The first time, you'll see a searchable list of every course in the
   school — search for your courses (e.g. by course name or your group code
   like "A1") and check the ones that are yours, then **"Show my schedule."**
   Your picks are remembered in the browser, so next time you load a file
   it skips straight to your schedule. Use **"← Edit my courses"** any time
   to change your picks.

**Treat that link like a password.** The token at the end of it is enough
by itself to read your schedule, no login required — don't post it publicly
(a public repo, a public chat, etc.). It's stored only in your own browser's
`localStorage`, never sent anywhere except directly to ZEUS.

## Project structure

| File | Purpose |
|---|---|
| `index.html` | The page skeleton: upload panel, course picker, and the week view (`#day-tabs`, `#schedule`) that JavaScript fills in. |
| `style.css` | All colors and layout — a dark, mobile-first design. Colors are tokens at the top of the file. |
| `app.js` | Everything else: reads the file, parses the `.ics` text format, runs the course picker, and builds the week view. |
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
9. **`parisDateKey`** / **`addDays`** / **`mondayOf`** — date helpers. ZEUS stores times in UTC; classes happen in Paris, so every time and date is shown in Paris time even if your phone is set to another time zone.
10. **`showWeekView`** / **`pickStartDay`** — groups your selected classes by day and opens on your next class (today if you still have one, otherwise the next day that does).
11. **`renderWeek`** / **`renderDay`** / **`renderCard`** — draws the day tabs (with class counts, today outlined), then the chosen day's classes as cards with time, room and group chips, with a "Break" marker for gaps of 15+ minutes. Text is HTML-escaped before insertion, since it's free-form text written by school staff, not something we control.

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

## The ZEUS link: what's confirmed, what isn't yet

`https://zeus.ionis-it.com/api/group/{id}/ics/{token}` was tested directly:
opening it in a private browser window (no login) downloaded the calendar
successfully — the token alone is a working credential, no session needed.
That's what makes the "paste your link" flow above possible at all.

**Still open:** whether ZEUS's server sends the `Access-Control-Allow-Origin`
header needed for a webpage's own JavaScript to `fetch()` that URL directly.
This sandbox's network is locked down to a small allowlist and can't reach
`zeus.ionis-it.com` to check — it has to be tested from a real browser
(which is exactly what happens the first time you use the "paste your link"
box above). The app is built to handle either outcome cleanly: if fetch
works, everything after the first paste is automatic; if it doesn't, you'll
get a clear error telling you to fall back to downloading + uploading, no
broken page either way. Both paths were tested locally (a fake endpoint with
and without the CORS header) before this shipped.

If it does turn out to allow cross-origin fetches, the same link should also
work directly in **Google Calendar → Other calendars → From URL** — a native
one-click subscription with no code and no OAuth, which would mean V3 is
already solved by the link itself, not something to build.

## Roadmap

Target: finished by December.

- **V1** — load-by-link with auto-refresh (falls back to manual
  upload if the browser blocks it), course picker with search +
  persistence, English display, per-course color coding, exam
  highlighting. Done.
- **V1.1** — app-style week view: dark theme, day tabs with class counts,
  timeline cards with time/room/group chips, break markers, Paris-time
  display. Done. (Professor name and Lecture/Practical badges are not
  possible — see "What a real ZEUS export actually contains" above.)
- **V1.2** — make it installable to a phone's home screen (a PWA: a
  manifest file plus an icon), and host it (e.g. GitHub Pages) so it's a
  real URL instead of a local file.
- **V2** — confirmed unnecessary if the CORS check above comes back
  positive (no separate backend/proxy needed to auto-fetch). If it comes
  back negative, revisit whether a small proxy is worth building just to
  remove the manual-download step.
- **V3** — try subscribing to the ZEUS link directly from Google Calendar's
  own "From URL" import first (see above) before building anything custom.
