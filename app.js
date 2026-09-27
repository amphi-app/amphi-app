/*
  ZEUS Schedule Viewer — app.js

  This file does four jobs, in order:
    1. Parse a .ics file's text into a plain JavaScript array of event objects.
       (A real ZEUS export covers the WHOLE school, not just one student.)
    2. Let the student pick which courses are theirs from that full list,
       remembering the choice in the browser for next time.
    3. Classify each event (course color, or Exam) from its French title.
    4. Render the selected events as an app-style week view, in Paris time.

  There is no build step. The browser reads this file directly.
*/

// ---------------------------------------------------------------------------
// STEP 0: Configuration
// ---------------------------------------------------------------------------
// Confirmed against a real ZEUS export: course titles (SUMMARY) almost never
// carry a CM/TD/TP prefix, so we can't color-code by class type. Instead,
// each distinct course name gets a stable color (same course = same color
// every time, via a hash), and exam-sounding titles get a red highlight
// on top of that, since that pattern *does* show up reliably in real data.
const EXAM_PATTERN = /\b(examen|partiel|contr[oô]le)\b/i;

// Cards are filled with these colors and carry white text, so every color
// here is dark enough to keep that text readable.
const PALETTE = [
  "#2f7d4f", "#4f46e5", "#b45309", "#7c3aed", "#be185d",
  "#0f766e", "#c2410c", "#1d4ed8", "#4d7c0f", "#0e7490",
];

/** Simple deterministic string hash so the same course name always maps to
 *  the same palette color, without having to track a name->color table. */
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function colorForCourse(summary) {
  return PALETTE[hashString(summary) % PALETTE.length];
}

// A small embedded sample so you can see the app work without needing a
// real ZEUS export yet. Times end in "Z" (UTC), exactly like real ZEUS
// exports do — 06:30Z is 08:30 in Paris during summer time.
const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Sample//EN
BEGIN:VEVENT
SUMMARY:Algorithmique
DTSTART:20260922T063000Z
DTEND:20260922T083000Z
LOCATION:Amphi B
DESCRIPTION:
END:VEVENT
BEGIN:VEVENT
SUMMARY:Bases de donnees GR A1
DTSTART:20260922T090000Z
DTEND:20260922T110000Z
LOCATION:Salle 214
DESCRIPTION:
END:VEVENT
BEGIN:VEVENT
SUMMARY:Programmation systeme GR A1
DTSTART:20260923T120000Z
DTEND:20260923T150000Z
LOCATION:Salle Info 3
DESCRIPTION:Salle sous reserve de changement
END:VEVENT
BEGIN:VEVENT
SUMMARY:Examen Mathematiques
DTSTART:20260925T070000Z
DTEND:20260925T090000Z
LOCATION:Amphi A
DESCRIPTION:2H EXAMEN
END:VEVENT
END:VCALENDAR
`;

// ---------------------------------------------------------------------------
// STEP 2: Decide how to color/badge each event
// ---------------------------------------------------------------------------

function classify(summary = "") {
  if (EXAM_PATTERN.test(summary)) {
    return { isExam: true, color: "var(--color-exam)" };
  }
  return { isExam: false, color: colorForCourse(summary) };
}

// ZEUS course titles often end in a group label like "GR A1" or "GPE B1".
const GROUP_PATTERN = /\b(?:GR|GPE)\s*([A-Z]\d?)\b/i;

function extractGroup(summary = "") {
  const match = summary.match(GROUP_PATTERN);
  return match ? `Group ${match[1].toUpperCase()}` : "";
}

// ---------------------------------------------------------------------------
// STEP 3: Dates — everything in Paris time
// ---------------------------------------------------------------------------
// ZEUS stores times in UTC. Classes happen in Paris, so we always display
// Paris time, even when the phone viewing this is set to another time zone.
const PARIS = "Europe/Paris";

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit", minute: "2-digit", timeZone: PARIS,
});

// "en-CA" happens to format dates as YYYY-MM-DD, which makes a handy key.
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric", month: "2-digit", day: "2-digit", timeZone: PARIS,
});

/** The Paris calendar date an event happens on, e.g. "2026-09-22". */
function parisDateKey(date) {
  return dateKeyFormatter.format(date);
}

// Day keys are plain calendar dates, so we do date math on them in UTC,
// where there's no daylight-saving shift to trip over.
function keyToDate(key) {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDays(key, days) {
  const date = keyToDate(key);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function mondayOf(key) {
  const weekday = keyToDate(key).getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  return addDays(key, -((weekday + 6) % 7));
}

const weekdayShort = new Intl.DateTimeFormat("en-GB", { weekday: "short", timeZone: "UTC" });
const weekdayLong = new Intl.DateTimeFormat("en-GB", { weekday: "long", timeZone: "UTC" });
const dayMonth = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

function formatDuration(ms) {
  const minutes = Math.round(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

// ---------------------------------------------------------------------------
// STEP 4: Render the week view — day tabs on top, that day's classes below
// ---------------------------------------------------------------------------

// Event text (SUMMARY/LOCATION/DESCRIPTION) is free-form text written by
// school staff, not something we control — escape it before it goes into
// innerHTML so it can never be interpreted as markup.
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

const ICON_CLOCK = `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>`;
const ICON_PIN = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/></svg>`;

let eventsByDay = new Map(); // "2026-09-22" -> that day's classes, in time order
let selectedDay = "";

function indexByDay(events) {
  const byDay = new Map();
  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    const key = parisDateKey(event.start);
    if (!byDay.has(key)) byDay.set(key, []);
    byDay.get(key).push(event);
  }
  return byDay;
}

/** Open on your next class: today if you still have one, otherwise the
 *  next day that does. If the whole file is in the past, its last day. */
function pickStartDay(events) {
  const now = new Date();
  const sorted = [...events].sort((a, b) => a.start - b.start);
  const next = sorted.find((event) => event.end >= now) || sorted[sorted.length - 1];
  return parisDateKey(next.start);
}

function renderWeek() {
  const monday = mondayOf(selectedDay);
  const today = parisDateKey(new Date());
  const tabs = document.getElementById("day-tabs");
  tabs.innerHTML = "";

  for (let i = 0; i < 7; i++) {
    const key = addDays(monday, i);
    const count = (eventsByDay.get(key) || []).length;
    if (i === 6 && count === 0 && key !== selectedDay) continue; // hide an empty Sunday

    const tab = document.createElement("button");
    tab.type = "button";
    tab.className = "day-tab";
    tab.classList.toggle("is-selected", key === selectedDay);
    tab.classList.toggle("is-today", key === today);
    tab.setAttribute("aria-pressed", String(key === selectedDay));
    tab.innerHTML = `
      <span class="day-tab-name">${weekdayShort.format(keyToDate(key))}</span>
      <span class="day-tab-count">${count || ""}</span>
    `;
    tab.addEventListener("click", () => {
      selectedDay = key;
      renderWeek();
    });
    tabs.appendChild(tab);
  }

  const sunday = addDays(monday, 6);
  document.getElementById("week-label").textContent =
    `${dayMonth.format(keyToDate(monday))} – ${dayMonth.format(keyToDate(sunday))}`;

  renderDay();
}

function renderDay() {
  const dayEvents = eventsByDay.get(selectedDay) || [];
  const date = keyToDate(selectedDay);

  document.getElementById("day-title").textContent = weekdayLong.format(date);
  document.getElementById("day-subtitle").textContent =
    `${dayMonth.format(date)} · ` +
    (dayEvents.length === 0
      ? "No classes"
      : `${dayEvents.length} ${dayEvents.length === 1 ? "class" : "classes"} scheduled`);

  const container = document.getElementById("schedule");
  container.innerHTML = "";

  if (dayEvents.length === 0) {
    container.innerHTML = `<p class="empty-day">Nothing scheduled.</p>`;
    return;
  }

  let latestEnd = null;
  for (const event of dayEvents) {
    // Show a gap of 15+ minutes as an explicit break, so free time is obvious.
    if (latestEnd && event.start - latestEnd >= 15 * 60 * 1000) {
      const gap = document.createElement("div");
      gap.className = "break-row";
      gap.textContent = `Break · ${formatDuration(event.start - latestEnd)}`;
      container.appendChild(gap);
    }
    container.appendChild(renderCard(event));
    if (!latestEnd || event.end > latestEnd) latestEnd = event.end;
  }
}

function renderCard(event) {
  const type = classify(event.summary);
  const group = extractGroup(event.summary);
  const start = timeFormatter.format(event.start);
  const end = timeFormatter.format(event.end);

  const row = document.createElement("div");
  row.className = "timeline-row";
  row.innerHTML = `
    <div class="timeline-time">${start}</div>
    <article class="class-card" style="--card-color: ${type.color}">
      <div class="class-card-top">
        <h3 class="class-title">${escapeHTML(event.summary || "Untitled class")}</h3>
        ${type.isExam ? `<span class="class-badge">Exam</span>` : ""}
      </div>
      ${event.description ? `<p class="class-note">${escapeHTML(event.description)}</p>` : ""}
      <div class="chips">
        <span class="chip">${ICON_CLOCK}${start} – ${end}</span>
        ${event.location ? `<span class="chip">${ICON_PIN}${escapeHTML(event.location)}</span>` : ""}
        ${group ? `<span class="chip">${escapeHTML(group)}</span>` : ""}
      </div>
    </article>
  `;
  return row;
}

function showWeekView(events, updatedAt) {
  eventsByDay = indexByDay(events);
  selectedDay = pickStartDay(events);
  renderUpdatedLabel(updatedAt);
  document.getElementById("upload-section").hidden = true;
  document.getElementById("course-picker").hidden = true;
  document.getElementById("week-view").hidden = false;
  renderWeek();
}

/** "Updated today" / "Updated 3 days ago", so you know how fresh this is. */
function renderUpdatedLabel(updatedAt) {
  const label = document.getElementById("updated-label");
  const days = Math.floor((Date.now() - updatedAt.getTime()) / 86400000);
  if (parisDateKey(updatedAt) === parisDateKey(new Date())) {
    label.textContent = "Updated today";
  } else {
    label.textContent = `Updated ${days <= 1 ? "yesterday" : `${days} days ago`}`;
  }
  // After a week, nudge towards reloading — ZEUS schedules do change.
  label.classList.toggle("is-stale", days >= 7);
}

// ---------------------------------------------------------------------------
// Remembering your schedule between visits
// ---------------------------------------------------------------------------
// Only your own classes are saved (a few KB), not the whole-school file, so
// the app opens instantly — even offline — without re-uploading anything.

const SCHEDULE_STORAGE_KEY = "zeus-schedule-my-events";

function saveMySchedule(events) {
  try {
    localStorage.setItem(SCHEDULE_STORAGE_KEY, JSON.stringify({ savedAt: new Date(), events }));
  } catch {
    // Ignore — the app still works for this session, it just won't remember.
  }
}

function loadMySchedule() {
  try {
    const saved = JSON.parse(localStorage.getItem(SCHEDULE_STORAGE_KEY));
    if (!saved || saved.events.length === 0) return null;
    // JSON turns Dates into text, so turn them back into Dates.
    const events = saved.events.map((event) => ({
      ...event,
      start: new Date(event.start),
      end: new Date(event.end),
    }));
    return { savedAt: new Date(saved.savedAt), events };
  } catch {
    return null;
  }
}

function showError(message) {
  const errorEl = document.getElementById("error-message");
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

// ---------------------------------------------------------------------------
// STEP 2 (continued): Hiding courses you don't take
// ---------------------------------------------------------------------------
// A ZEUS file narrowed to your group is already your timetable, so every
// course shows by default. We remember the courses you HIDE, not the ones
// you keep: that way a course ZEUS adds to your group later shows up on its
// own, instead of being silently left out.

const HIDDEN_STORAGE_KEY = "zeus-schedule-hidden-courses";

// Past this many different course names, the file is almost certainly the
// whole school rather than one group (the real whole-school export had 917).
const WHOLE_SCHOOL_COURSE_COUNT = 100;

// localStorage can throw (private browsing, disabled site data, etc.), and
// this is a convenience feature, not something the app depends on — so any
// failure here should just mean "don't remember," not a broken page.
function loadHiddenCourses() {
  try {
    const raw = localStorage.getItem(HIDDEN_STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveHiddenCourses(hiddenSet) {
  try {
    localStorage.setItem(HIDDEN_STORAGE_KEY, JSON.stringify([...hiddenSet]));
  } catch {
    // Ignore — the app still works for this session, it just won't remember.
  }
}

let allEvents = [];

// ---------------------------------------------------------------------------
// Loading a schedule from a URL instead of a file
// ---------------------------------------------------------------------------
// ZEUS's "Générer un ICS" link (https://zeus.ionis-it.com/api/group/.../ics/...)
// turned out to work with no login at all — the token in the URL is enough.
// If the ZEUS server also allows cross-origin browser requests (CORS) to that
// endpoint, we can fetch it directly and never ask for a manual upload again.
// If it doesn't allow that, fetch() fails and we fall back to the file input.

const URL_STORAGE_KEY = "zeus-schedule-ics-url";

function loadSavedUrl() {
  try {
    return localStorage.getItem(URL_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveUrl(url) {
  try {
    localStorage.setItem(URL_STORAGE_KEY, url);
  } catch {
    // Ignore — the app still works for this session, it just won't remember.
  }
}

function forgetSavedUrl() {
  try {
    localStorage.removeItem(URL_STORAGE_KEY);
  } catch {
    // Nothing to do if storage isn't available.
  }
}

async function loadFromURL(url, { isAutoLoad = false } = {}) {
  showError("");
  try {
    const response = await fetch(url);
    if (!response.ok) {
      showError(`ZEUS responded with an error (HTTP ${response.status}). The link may have expired.`);
      return;
    }
    const text = await response.text();
    saveUrl(url);
    document.getElementById("saved-url-note").hidden = false;
    loadScheduleFromText(text);
  } catch (err) {
    console.error(err);
    if (isAutoLoad) {
      // Fail quietly on auto-load (e.g. no signal) — keep the link and just
      // keep showing the saved copy; the next visit tries again.
      return;
    }
    showError(
      "Couldn't load that link directly — ZEUS's server may not allow this app to fetch it " +
      "from the browser (a security setting called CORS). Open the link in a new tab to " +
      "download the file, then choose that file above."
    );
  }
}

/** Every distinct course name in the file, alphabetically, with how many
 *  timetable entries each one has. */
function getUniqueCourses(events) {
  const counts = new Map();
  for (const event of events) {
    const name = event.summary || "Untitled";
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function renderCoursePicker(courses, hidden) {
  const picker = document.getElementById("course-picker");
  const list = document.getElementById("course-list");
  list.innerHTML = "";

  document.getElementById("picker-intro").textContent =
    courses.length > WHOLE_SCHOOL_COURSE_COUNT
      ? "This file covers the whole school, and courses with the same name in different " +
        "groups can't be told apart here. For an accurate timetable, narrow to your group " +
        "in ZEUS first (Groupes → EPITA → … → tick your group), then click \"Générer un ICS\". " +
        "Otherwise, tick your courses below."
      : "Untick any course you don't take (like an elective you didn't choose). " +
        "Courses ZEUS adds to your group later will show up automatically.";

  for (const course of courses) {
    const row = document.createElement("label");
    row.className = "course-row";
    row.dataset.name = course.name.toLowerCase();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = course.name;
    checkbox.checked = !hidden.has(course.name);

    const nameSpan = document.createElement("span");
    nameSpan.className = "course-name";
    nameSpan.textContent = course.name;

    const countSpan = document.createElement("span");
    countSpan.className = "course-count";
    countSpan.textContent = course.count;

    row.append(checkbox, nameSpan, countSpan);
    list.appendChild(row);
  }

  picker.hidden = false;
}

function getCheckedCourseNames() {
  const boxes = document.querySelectorAll("#course-list input[type=checkbox]:checked");
  return new Set([...boxes].map((box) => box.value));
}

function getHiddenCourseNames() {
  const boxes = document.querySelectorAll("#course-list input[type=checkbox]:not(:checked)");
  return new Set([...boxes].map((box) => box.value));
}

function updateShowButton() {
  const count = getCheckedCourseNames().size;
  document.getElementById("show-schedule-btn").textContent =
    count === 0 ? "Show my schedule" : `Show my schedule (${count} ${count === 1 ? "course" : "courses"})`;
}

// The sample is for trying the app out, so it must never overwrite your
// real saved courses or timetable.
let isSampleData = false;

function showFilteredSchedule() {
  const hidden = getHiddenCourseNames();
  const shown = allEvents.filter((event) => !hidden.has(event.summary));
  if (shown.length === 0) {
    showError("Every course is unticked — tick at least one from the list.");
    return;
  }

  if (!isSampleData) {
    saveHiddenCourses(hidden);
    saveMySchedule(shown);
  }
  showError("");
  showWeekView(shown, new Date());
}

function loadScheduleFromText(text, { isSample = false } = {}) {
  try {
    const events = parseICS(text);
    if (events.length === 0) {
      showError("That file didn't contain any recognizable events.");
      return;
    }
    showError("");
    isSampleData = isSample;
    allEvents = events;

    const courses = getUniqueCourses(events);
    const hidden = isSample ? new Set() : loadHiddenCourses();

    if (courses.length > WHOLE_SCHOOL_COURSE_COUNT && hidden.size === 0) {
      // First time with a whole-school file: start with nothing ticked and
      // let the student tick their courses.
      renderCoursePicker(courses, new Set(courses.map((course) => course.name)));
      updateShowButton();
      document.getElementById("week-view").hidden = true;
      return;
    }

    // A file narrowed to your group (or one we've seen before): go straight
    // to the timetable, minus anything you've hidden.
    renderCoursePicker(courses, hidden);
    updateShowButton();
    showFilteredSchedule();
  } catch (err) {
    showError("Couldn't read that file — is it a valid .ics export from ZEUS?");
    console.error(err);
  }
}

// ---------------------------------------------------------------------------
// Wiring: connect the HTML elements to the functions above
// ---------------------------------------------------------------------------

document.getElementById("ics-input").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById("file-drop-label").textContent = file.name;

  const reader = new FileReader();
  reader.onload = () => loadScheduleFromText(reader.result);
  reader.onerror = () => showError("Couldn't read that file.");
  reader.readAsText(file);
});

document.getElementById("load-sample-btn").addEventListener("click", () => {
  loadScheduleFromText(SAMPLE_ICS, { isSample: true });
});

document.getElementById("course-list").addEventListener("change", updateShowButton);

document.getElementById("course-search").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  for (const row of document.querySelectorAll(".course-row")) {
    row.style.display = row.dataset.name.includes(query) ? "" : "none";
  }
});

document.getElementById("show-schedule-btn").addEventListener("click", showFilteredSchedule);

document.getElementById("edit-courses-btn").addEventListener("click", () => {
  document.getElementById("week-view").hidden = true;
  if (allEvents.length === 0) {
    // Opened from the saved copy, which only has your own classes — the
    // full course list lives in the ZEUS file, so that's needed again.
    document.getElementById("upload-section").hidden = false;
    showError("To change your courses, load your ZEUS file or link again. Courses you've hidden will stay hidden.");
    return;
  }
  const hidden = isSampleData ? getHiddenCourseNames() : loadHiddenCourses();
  renderCoursePicker(getUniqueCourses(allEvents), hidden);
  updateShowButton();
});

document.getElementById("change-source-btn").addEventListener("click", () => {
  document.getElementById("upload-section").hidden = false;
  document.getElementById("week-view").hidden = true;
});

document.getElementById("prev-week-btn").addEventListener("click", () => {
  selectedDay = addDays(selectedDay, -7);
  renderWeek();
});

document.getElementById("next-week-btn").addEventListener("click", () => {
  selectedDay = addDays(selectedDay, 7);
  renderWeek();
});

document.getElementById("today-btn").addEventListener("click", () => {
  selectedDay = parisDateKey(new Date());
  renderWeek();
});

document.getElementById("load-url-btn").addEventListener("click", () => {
  const url = document.getElementById("ics-url-input").value.trim();
  if (url) loadFromURL(url);
});

document.getElementById("ics-url-input").addEventListener("keydown", (event) => {
  if (event.key === "Enter") document.getElementById("load-url-btn").click();
});

document.getElementById("forget-url-btn").addEventListener("click", () => {
  forgetSavedUrl();
  document.getElementById("saved-url-note").hidden = true;
  document.getElementById("ics-url-input").value = "";
});

// ---------------------------------------------------------------------------
// On page load
// ---------------------------------------------------------------------------

// 1. Show the saved copy of your schedule straight away (works offline).
const mySchedule = loadMySchedule();
if (mySchedule) {
  showWeekView(mySchedule.events, mySchedule.savedAt);
}

// 2. If you saved a ZEUS link, refresh from it in the background — this is
//    what gets us from "six ZEUS clicks" to zero.
const savedUrl = loadSavedUrl();
if (savedUrl) {
  document.getElementById("ics-url-input").value = savedUrl;
  document.getElementById("saved-url-note").hidden = false;
  loadFromURL(savedUrl, { isAutoLoad: true });
}

// 3. Let the app be installed to the home screen and open offline.
//    Service workers only run on a real web address, not a double-clicked file.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(console.error);
}
