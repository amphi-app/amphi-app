# Amphi

Your EPITA ZEUS timetable, in English, on your phone. Load your group's
calendar export from ZEUS once, and after that the app opens straight to
your next class and works offline.

Amphi is an unofficial student project. No login handling, no server, no
external services: it's a handful of plain files that run in any browser.
Live at **https://amphi-app.github.io/**.

## Using it

1. **Get your group's ZEUS data (once).** Log into `zeus.ionis-it.com`
   (Office 365), open **Groupes** in the left sidebar and narrow down to your
   own group (e.g. EPITA → CLASSES PREPARATOIRES → PREPA PARIS → SPE PARIS →
   tick your group), then click **"Générer un ICS"** and **download the
   file** (on iPhone: open the link, tap download; it lands in Files →
   Downloads). Choose that file in Amphi. The app has a built-in "How do I
   get the file?" guide for classmates. ZEUS changes during the semester,
   so download a fresh file every week or two; Amphi shows how old your
   copy is.
   - Amphi can also refresh itself straight from your ZEUS link (paste it
     in the link box), but only once ZEUS allows it; see "Not allowed yet"
     below.
2. **Hide anything you don't take** (optional). The app shows your whole
   group's timetable straight away. If your group has a course you didn't
   choose (an elective, say), tap **Edit courses** and untick it. The app
   remembers what you *hid*, so a course ZEUS adds to your group later
   still shows up automatically.

   Don't use the whole-school export (ticking just "EPITA"): many courses
   share a name across groups ("Algorithmique" alone covers 491 sessions),
   and nothing in the file tells them apart, so you'd get other groups'
   classes mixed in. The app warns you if you load one.
3. **Use it.** The app opens on **Home**: your name (tap it to enter your
   EPITA login, e.g. `dev.vashisth`) and your courses, each with its next
   session — tap one to jump to that day. Exams, events (forums,
   hackathons, EPI'ACK…) and days off are kept out of that list and shown
   in **Coming up** instead; ZEUS doesn't say which is which, so
   `kinds.js` works it out from the titles. If something lands in the
   wrong place, add its title to `tests/kinds.test.js` and adjust the
   word lists. **Swipe left** for the timetable,
   right to come back (or use the tabs at the bottom). The timetable opens
   on your next class. Day tabs show how many
   classes each day has (today is outlined in green); arrows move between
   weeks. "Updated today / 3 days ago" shows how fresh your copy is — it
   turns yellow after a week as a reminder to reload.
4. **Friends** (third tab) shows where each friend's timetable says they
   are: in class (which one, until when), free until their next class, or
   done for the day, plus when you're both free today. Tap **Share my
   timetable** to send a link; a friend who opens it (or pastes it into
   their Friends tab) adds you. The link carries class names and times for
   the rest of the semester, never rooms, and travels after the `#` of the
   address, which browsers never send to any server. Friends are added only
   from links they sent you, and each shows when it was shared (yellow after
   two weeks, as a hint to share again). On iPhone, links open in Safari,
   not the installed app, so paste them into the Friends tab instead.
5. **Free rooms** (fourth tab) lists rooms with no class booked right now,
   or in 1–3 hours, at Kremlin-Bicêtre or Villejuif, with how long each
   stays that way. Nothing to set up: the room data ships with the app
   (see "Updating the free-rooms data"). It says "no class booked", not
   "free": a room can still be locked or used informally, and the list is
   only as fresh as the last update (about 2% of room bookings change per
   week). Campuses are recognised from room names by `CAMPUS_RULES` in
   `rooms.js`; rooms on other campuses and sites are left out.
6. **Install it** (once it's online): on iPhone, Safari → Share → "Add to
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
2. Repo **Settings → Pages → Source: "Deploy from a branch"**, pick
   `main` and the **/ (root)** folder, Save.
3. After a minute the site is live. This repo lives in the `amphi-app`
   organisation and is named `amphi-app.github.io`, so its address is
   `https://amphi-app.github.io/` (a repo with any other name would be at
   `https://amphi-app.github.io/<repo-name>/`; the app works at either).

After changing any app file, bump `CACHE_NAME` in `sw.js` (`amphi-v8` →
`amphi-v9`) so installed copies pick up the new version cleanly.

## Updating the free-rooms data (about once a week)

1. In ZEUS, open **Groupes**, tick only **EPITA**, click **Générer un ICS**
   and download the file.
2. In this folder, run `npm run rooms -- path/to/that-file.ics`. It writes
   `data/rooms.json`, containing only room names and busy times: no course
   names, groups or people.
3. Commit and push `data/rooms.json`. Everyone's Rooms tab picks it up the
   next time they open it with internet.

## Working on it

- **Run it locally:** double-click `index.html`. Everything works except
  offline mode/installing. To test those too, run
  `python3 -m http.server` in this folder and open `http://localhost:8000`.
- **Run the tests:** `npm test` (needs Node.js; nothing to install). They
  cover reading the calendar format, including the ZEUS quirks
  below. Run them after every change to `ics.js`.

| File | What it does |
|---|---|
| `index.html` | Page structure: setup screens (link/upload, course picker) and the app itself (Home + Timetable pages, tab bar). |
| `style.css` | All the looks — dark, mobile-first. Colors are tokens at the top. |
| `ics.js` | Reads the `.ics` calendar format. No page code, so it's testable. |
| `kinds.js` | Decides whether an entry is a course, exam, event or day off, from its title. Testable too. |
| `rooms.js` | Works out which rooms have no class booked at a given time, and which campus each room is on. Testable too. |
| `friends.js` | Packs a timetable into a share link and reads it back; works out a friend's status and when you're both free. Testable too. |
| `data/rooms.json` | The room busy times everyone's Rooms tab uses, built by `tools/build-rooms.js`. |
| `app.js` | Everything on screen: setup, Home page, timetable, swiping, saving, startup. |
| `sw.js` | Service worker: keeps copies of the app files so it opens offline. |
| `manifest.webmanifest`, `icons/` | Name and icons used when installed to a home screen. |
| `tests/` | Automated tests for `ics.js`, `kinds.js` (real ZEUS titles), `rooms.js` and `friends.js`. |
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

### Not allowed yet: reading ZEUS links directly

ZEUS doesn't let other websites read its links: the response has no
`Access-Control-Allow-Origin` header for `https://amphi-app.github.io`, so
browsers block the app from reading it (the browser rule called CORS).
Opening the link yourself still works; only a website's code is blocked.
Until ZEUS allows Amphi, students download the file and upload it. The
link-loading code is already in the app and works as soon as ZEUS allows it.
