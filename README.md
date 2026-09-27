# ZEUS Timetable

Your EPITA ZEUS timetable, in English, on your phone. Load your group's
calendar export from ZEUS once, and after that the app opens straight to
your next class and works offline.

No login handling, no server, no external services — it's four plain files
(`index.html`, `style.css`, `ics.js`, `app.js`) that run in any browser.

## Using it

1. **Get your group's ZEUS data (once).** Log into `zeus.ionis-it.com`
   (Office 365), open **Groupes** in the left sidebar and narrow down to your
   own group (e.g. EPITA → CLASSES PREPARATOIRES → PREPA PARIS → SPE PARIS →
   tick your group), then click **"Générer un ICS"**. ZEUS offers a link and
   a download:
   - **Copy the link** and paste it into the app's "paste your ZEUS calendar
     link" box. If ZEUS allows it (see "Still open" below), the app then
     refreshes itself from that link every time you open it — you never do
     the ZEUS clicks again.
   - **Or download the file** and choose it with the upload box. Works
     everywhere; use **Reload** in the app to load a fresh file when ZEUS
     changes.
2. **Hide anything you don't take** (optional). The app shows your whole
   group's timetable straight away. If your group has a course you didn't
   choose (an elective, say), tap **Edit courses** and untick it. The app
   remembers what you *hid*, so a course ZEUS adds to your group later
   still shows up automatically.

   Don't use the whole-school export (ticking just "EPITA"): many courses
   share a name across groups ("Algorithmique" alone covers 491 sessions),
   and nothing in the file tells them apart, so you'd get other groups'
   classes mixed in. The app warns you if you load one.
3. **Use it.** The app opens on your next class. Day tabs show how many
   classes each day has (today is outlined in green); arrows move between
   weeks. "Updated today / 3 days ago" shows how fresh your copy is — it
   turns yellow after a week as a reminder to reload.
4. **Install it** (once it's online): on iPhone, Safari → Share → "Add to
   Home Screen"; on Android, Chrome → menu → "Install app". It then opens
   full-screen like an app, and works without internet.

**Treat your ZEUS link like a password.** The code at the end of it is
enough by itself to read the timetable, no login needed. The app keeps it
only in your own browser's storage and sends it nowhere except ZEUS. Never
paste it into the code or anywhere public.

## Putting it online (GitHub Pages)

Service workers (offline mode) and home-screen install only work from a
real `https://` address, not a double-clicked file. GitHub Pages hosts this
for free:

1. The repo must be **public** for free Pages — or keep it private with
   GitHub Pro, which is free for students through the GitHub Student
   Developer Pack. Nothing secret is in the repo either way.
2. Repo **Settings → Pages → Source: "Deploy from a branch"**, pick the
   branch this code is on and the **/ (root)** folder, Save.
3. After a minute the site is live at
   `https://<your-username>.github.io/Project-EPI/`.

After changing any app file, bump `CACHE_NAME` in `sw.js` (`v1` → `v2`) so
installed copies pick up the new version cleanly.

## Working on it

- **Run it locally:** double-click `index.html`. Everything works except
  offline mode/installing. To test those too, run
  `python3 -m http.server` in this folder and open `http://localhost:8000`.
- **Run the tests:** `npm test` (needs Node.js; nothing to install). They
  cover reading the calendar format, including the ZEUS quirks
  below. Run them after every change to `ics.js`.

| File | What it does |
|---|---|
| `index.html` | Page structure: upload panel, course picker, week view. |
| `style.css` | All the looks — dark, mobile-first. Colors are tokens at the top. |
| `ics.js` | Reads the `.ics` calendar format. No page code, so it's testable. |
| `app.js` | Everything on screen: course picker, week view, saving, startup. |
| `sw.js` | Service worker: keeps copies of the app files so it opens offline. |
| `manifest.webmanifest`, `icons/` | Name and icons used when installed to a home screen. |
| `tests/ics.test.js` | Automated tests for `ics.js`. |
| `sample.ics` | The small fake timetable behind "try it with a sample". |

### How the code flows

1. **`parseICS`** (`ics.js`) turns the file's text into a list of events:
   `{ uid, summary, location, description, start, end }`. It un-wraps long
   lines, un-escapes text, trims stray spaces, and drops nonsense dates.
2. **`loadScheduleFromText`** (`app.js`) decides what's next: a file for
   one group goes straight to the timetable; a whole-school file (over 100
   different course names) opens the course picker first.
3. **`getUniqueCourses` / `renderCoursePicker`** list every distinct course
   with a tick box; **`saveHiddenCourses`** remembers the unticked ones.
4. **`showFilteredSchedule`** drops hidden courses, saves the rest
   (**`saveMySchedule`**), and opens the week view.
5. **`showWeekView` → `renderWeek` → `renderDay` → `renderCard`** draw the
   day tabs and the cards. All dates and times are computed in Paris time
   (**`parisDateKey`**), because ZEUS stores UTC and a phone may be set to
   another time zone.
6. **`classify`** colors each card: exam-sounding titles in red, every other
   course a stable color derived from its name (**`colorForCourse`**).
7. On startup, the saved copy is shown immediately, then refreshed from your
   ZEUS link in the background if you saved one.

## What ZEUS's export does and doesn't contain (confirmed)

Checked against a real 11,519-event export and EPITA's own ZEUS guide:

- **What's in it depends on what you tick in ZEUS.** Ticking just "EPITA"
  exports the whole school, where same-named courses in different groups
  can't be told apart; narrowing to your group first gives exactly your
  timetable. That's why the app expects a group export.
- **Professor name, course code and class type (lecture/lab/exam) are not in
  the file.** ZEUS's website shows them, but its export never includes them,
  so no app built on the export can show them. Exams are detected from the
  title instead (`examen`, `partiel`, `contrôle`), and group labels like
  "GR A1" are read from the title too.
- **ZEUS has data glitches** the app guards against: stray leading spaces in
  titles, and at least one placeholder event dated year 3036.
- **The ZEUS link needs no login** — opening it in a private window
  downloads the file.

### Still open

Whether ZEUS allows *other websites'* JavaScript to fetch that link (a
browser rule called CORS). This can only be checked from a real browser:
paste your link into the app. If it loads, auto-refresh works; if you get
the red "Couldn't load that link directly" message, use the file download
instead — everything else works the same.
