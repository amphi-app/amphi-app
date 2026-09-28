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
// Each distinct course name gets a stable color (same course = same color
// every time, via a hash). Exams are red and days off grey; which entries
// are exams, events or days off is decided in kinds.js.

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

let titleCounts = new Map(); // how many times each title appears in your timetable

const KIND_LABELS = { exam: "Exam", event: "Event", dayoff: "Day off" };

function countTitles(events) {
  const counts = new Map();
  for (const event of events) counts.set(event.summary, (counts.get(event.summary) || 0) + 1);
  return counts;
}

/** { kind: "course" | "exam" | "event" | "dayoff", color } */
function classify(summary = "") {
  const kind = kindOf(summary, titleCounts.get(summary));
  if (kind === "exam") return { kind, color: "var(--color-exam)" };
  if (kind === "dayoff") return { kind, color: "var(--color-dayoff)" };
  return { kind, color: colorForCourse(summary) };
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
        ${type.kind !== "course" ? `<span class="class-badge">${KIND_LABELS[type.kind]}</span>` : ""}
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

let shownEvents = []; // your classes (hidden courses already removed)

function showWeekView(events, updatedAt) {
  shownEvents = events;
  titleCounts = countTitles(events);
  eventsByDay = indexByDay(events);
  selectedDay = pickStartDay(events);
  renderUpdatedLabel(updatedAt);
  renderHome(updatedAt);
  document.getElementById("upload-section").hidden = true;
  document.getElementById("course-picker").hidden = true;
  document.getElementById("week-view").hidden = false;
  renderWeek();
}

/** "Updated today" / "Updated 3 days ago", so you know how fresh this is. */
function describeUpdated(updatedAt) {
  const days = Math.floor((Date.now() - updatedAt.getTime()) / 86400000);
  if (parisDateKey(updatedAt) === parisDateKey(new Date())) return { text: "Updated today", days };
  return { text: `Updated ${days <= 1 ? "yesterday" : `${days} days ago`}`, days };
}

function renderUpdatedLabel(updatedAt) {
  const label = document.getElementById("updated-label");
  const { text, days } = describeUpdated(updatedAt);
  label.textContent = text;
  // After a week, nudge towards reloading — ZEUS schedules do change.
  label.classList.toggle("is-stale", days >= 7);
}

// ---------------------------------------------------------------------------
// STEP 5: The Home page — profile on top, your courses below
// ---------------------------------------------------------------------------

const PROFILE_STORAGE_KEY = "zeus-profile-login";

function loadLogin() {
  try {
    return localStorage.getItem(PROFILE_STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function saveLogin(login) {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, login);
  } catch {
    // Ignore — the app still works for this session, it just won't remember.
  }
}

/** EPITA logins are firstname.lastname, so "jean-luc.dupont2" -> "Jean-Luc Dupont". */
function nameFromLogin(login) {
  return login
    .split(".")
    .map((part) => part.replace(/\d+$/, ""))
    .filter(Boolean)
    .map((part) => part.split("-").map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join("-"))
    .join(" ");
}

const hourFormatter = new Intl.DateTimeFormat("en-GB", { hour: "numeric", hourCycle: "h23", timeZone: PARIS });

function greetingForNow() {
  const hour = Number(hourFormatter.format(new Date()));
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function renderProfile() {
  const name = nameFromLogin(loadLogin());
  const nameEl = document.getElementById("profile-name");
  nameEl.textContent = name || "Tap to add your EPITA login";
  nameEl.classList.toggle("is-empty", !name);
  document.getElementById("greeting").textContent = greetingForNow();
  document.getElementById("avatar").textContent =
    name ? name.split(" ").map((word) => word[0]).join("").slice(0, 2) : "?";
}

/** One entry per course: its next session (if any) and how many are left. */
function summarizeCourses(events) {
  const now = new Date();
  const byName = new Map();
  for (const event of events) {
    const name = event.summary || "Untitled class";
    if (!byName.has(name)) byName.set(name, { name, next: null, remaining: 0 });
    const course = byName.get(name);
    if (event.end >= now) {
      course.remaining++;
      if (!course.next || event.start < course.next.start) course.next = event;
    }
  }
  // Soonest next session first; finished courses at the bottom.
  return [...byName.values()].sort((a, b) => {
    if (a.next && b.next) return a.next.start - b.next.start;
    if (a.next || b.next) return a.next ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

const nextDayFormatter = new Intl.DateTimeFormat("en-GB", {
  weekday: "short", day: "numeric", month: "short", timeZone: PARIS,
});

function describeNext(event) {
  const now = new Date();
  if (!event) return "No more sessions";
  const place = event.location ? ` · ${event.location}` : "";
  if (event.start <= now) return `Now · until ${timeFormatter.format(event.end)}${place}`;
  const day = parisDateKey(event.start) === parisDateKey(now) ? "Today" : nextDayFormatter.format(event.start);
  return `${day} · ${timeFormatter.format(event.start)}${place}`;
}

// How many exams/events/days off "Coming up" shows — just the nearest few.
const COMING_UP_LIMIT = 3;

function renderHome(updatedAt) {
  renderProfile();
  const entries = summarizeCourses(shownEvents);
  const courses = entries.filter((entry) => classify(entry.name).kind === "course");
  const comingUp = entries
    .filter((entry) => classify(entry.name).kind !== "course" && entry.next)
    .slice(0, COMING_UP_LIMIT);

  document.getElementById("courses-summary").textContent =
    `${courses.length} ${courses.length === 1 ? "course" : "courses"} · ${describeUpdated(updatedAt).text}`;

  const courseList = document.getElementById("home-courses");
  courseList.innerHTML = "";
  for (const course of courses) {
    courseList.appendChild(renderHomeCard(course,
      `<div class="course-left"><strong>${course.remaining}</strong><span>left</span></div>`));
  }

  const comingUpList = document.getElementById("home-coming-up");
  comingUpList.innerHTML = "";
  for (const entry of comingUp) {
    const label = KIND_LABELS[classify(entry.name).kind];
    comingUpList.appendChild(renderHomeCard(entry, `<span class="kind-badge">${label}</span>`));
  }
  document.getElementById("coming-up-section").hidden = comingUp.length === 0;
}

/** One tappable card on Home; `rightSide` is the HTML shown on its right. */
function renderHomeCard(entry, rightSide) {
  const card = document.createElement("button");
  card.type = "button";
  card.className = "course-card";
  card.style.setProperty("--card-color", classify(entry.name).color);
  card.innerHTML = `
    <div class="course-info">
      <p class="course-title">${escapeHTML(entry.name)}</p>
      <p class="course-next">${escapeHTML(describeNext(entry.next))}</p>
    </div>
    ${rightSide}
  `;
  // Tapping a card jumps to its next session in the timetable.
  card.addEventListener("click", () => {
    if (entry.next) selectedDay = parisDateKey(entry.next.start);
    renderWeek();
    goToPage(1);
  });
  return card;
}

// ---------------------------------------------------------------------------
// Swiping between Home and Timetable
// ---------------------------------------------------------------------------
// The pages sit side by side in a sideways-scrolling box that snaps to each
// page (CSS "scroll-snap"), so the browser handles the swipe itself. We just
// keep the bottom tab bar in sync and let its buttons jump between pages.

const pager = document.getElementById("pager");

function goToPage(index) {
  pager.scrollTo({ left: index * pager.clientWidth, behavior: "smooth" });
}

const ROOMS_PAGE = 2;
let currentPage = 0;

pager.addEventListener("scroll", () => {
  const page = Math.round(pager.scrollLeft / pager.clientWidth);
  if (page === currentPage) return;
  currentPage = page;
  for (const button of document.querySelectorAll(".nav-btn")) {
    if (Number(button.dataset.page) === page) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  }
  // Recompute free rooms on arrival, so "Now" really means now.
  if (page === ROOMS_PAGE) renderRooms();
}, { passive: true });

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
// But ZEUS doesn't currently allow other websites to read it (no CORS header
// for amphi-app.github.io), so fetch() fails and students upload the file
// instead. This code starts working as-is if ZEUS allows Amphi.

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

function showSavedUrlState(hasUrl) {
  document.getElementById("saved-url-note").hidden = !hasUrl;
  document.getElementById("refresh-btn").hidden = !hasUrl;
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
    showSavedUrlState(true);
    loadScheduleFromText(text);
  } catch (err) {
    console.error(err);
    if (isAutoLoad) {
      // Fail quietly on auto-load (e.g. no signal) — keep the link and just
      // keep showing the saved copy; the next visit tries again.
      return;
    }
    showError(
      "Couldn't load that link: ZEUS doesn't let Amphi read links directly yet. Open the " +
      "link in your browser to download the file, then choose it with \"Choose your ZEUS " +
      "timetable file\" above."
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
// STEP 6: Free rooms
// ---------------------------------------------------------------------------
// Uses the whole-school ZEUS file, which lists every room booking. Only a
// small summary is saved (which room is booked when, for the next 8 weeks),
// not the file itself. The room logic lives in rooms.js.

const ROOMS_STORAGE_KEY = "zeus-rooms";
const ROOMS_CAMPUS_KEY = "zeus-rooms-campus";
const ROOMS_WEEKS = 8;
const TIME_CHOICES = [0, 1, 2, 3]; // hours from now

let roomData = null; // { savedAt: Date, occupancy }
let roomsHoursAhead = 0;
let roomsCampus = "Kremlin-Bicêtre";

function loadRoomSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem(ROOMS_STORAGE_KEY));
    if (saved) roomData = { savedAt: new Date(saved.savedAt), occupancy: saved.occupancy };
    roomsCampus = localStorage.getItem(ROOMS_CAMPUS_KEY) || roomsCampus;
  } catch {
    // Nothing saved, or storage unavailable: show the setup instead.
  }
}

function saveRoomData() {
  try {
    localStorage.setItem(ROOMS_STORAGE_KEY, JSON.stringify(roomData));
  } catch {
    // Ignore — the app still works for this session, it just won't remember.
  }
}

function loadRoomsFromText(text) {
  try {
    const events = parseICS(text);
    // A group's own file only has that group's bookings, which would make
    // almost every room look free.
    if (getUniqueCourses(events).length <= WHOLE_SCHOOL_COURSE_COUNT) {
      showError("That looks like one group's file. Free rooms needs the whole-school file: in ZEUS, tick only EPITA, then Générer un ICS.");
      return;
    }
    const now = new Date();
    const from = new Date(now.getTime() - 86400000);
    const until = new Date(now.getTime() + ROOMS_WEEKS * 7 * 86400000);
    roomData = { savedAt: now, occupancy: buildOccupancy(events, from, until) };
    saveRoomData();
    showError("");
    renderRooms();
  } catch (err) {
    showError("Couldn't read that file — is it a valid .ics export from ZEUS?");
    console.error(err);
  }
}

function readRoomsFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => loadRoomsFromText(reader.result);
  reader.onerror = () => showError("Couldn't read that file.");
  reader.readAsText(file);
  event.target.value = ""; // so choosing the same file again still triggers
}

/** A row of toggle buttons; `onPick` runs with the chosen value. */
function renderChips(containerId, options, selected, onPick) {
  const container = document.getElementById(containerId);
  container.innerHTML = "";
  for (const { value, label } of options) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "chip-btn";
    chip.textContent = label;
    chip.setAttribute("aria-pressed", String(value === selected));
    chip.addEventListener("click", () => onPick(value));
    container.appendChild(chip);
  }
}

function renderRooms() {
  document.getElementById("rooms-setup").hidden = Boolean(roomData);
  document.getElementById("rooms-view").hidden = !roomData;
  if (!roomData) return;

  const updated = describeUpdated(roomData.savedAt);
  const updatedLabel = document.getElementById("rooms-updated");
  updatedLabel.textContent = `ZEUS data: ${updated.text.toLowerCase()}`;
  updatedLabel.classList.toggle("is-stale", updated.days >= 7);

  const at = new Date(Date.now() + roomsHoursAhead * 3600000);
  // Filtering here too, in case this data was saved before unplaced rooms were dropped.
  const campuses = [...new Set(Object.keys(roomData.occupancy).map(campusOf))]
    .filter((campus) => campus !== OTHER_CAMPUS)
    .sort();
  if (!campuses.includes(roomsCampus)) roomsCampus = campuses[0];

  renderChips("campus-chips", campuses.map((c) => ({ value: c, label: c })), roomsCampus, (campus) => {
    roomsCampus = campus;
    try { localStorage.setItem(ROOMS_CAMPUS_KEY, campus); } catch { /* not remembered */ }
    renderRooms();
  });
  renderChips("time-chips", TIME_CHOICES.map((hours) => ({
    value: hours,
    label: hours === 0 ? "Now" : timeFormatter.format(new Date(Date.now() + hours * 3600000)),
  })), roomsHoursAhead, (hours) => {
    roomsHoursAhead = hours;
    renderRooms();
  });

  // "Rest of the day" when a room's next booking isn't today (or there's none).
  const today = parisDateKey(at);
  const rooms = freeRoomsAt(roomData.occupancy, at)
    .filter((room) => room.campus === roomsCampus)
    .map((room) => ({ ...room, restOfDay: !room.freeUntil || parisDateKey(room.freeUntil) !== today }))
    .sort((a, b) => (b.restOfDay - a.restOfDay) ||
      (a.restOfDay ? 0 : b.freeUntil - a.freeUntil) ||
      a.room.localeCompare(b.room, "en", { numeric: true }));

  document.getElementById("rooms-subtitle").textContent =
    `${rooms.length} ${rooms.length === 1 ? "room" : "rooms"} with no class booked ` +
    (roomsHoursAhead === 0 ? "right now" : `at ${timeFormatter.format(at)}`);

  const hour = Number(hourFormatter.format(at));
  const weekday = weekdayShort.format(keyToDate(today));
  const notes = [];
  if (weekday === "Sat" || weekday === "Sun" || hour < 8 || hour >= 20) {
    notes.push("Outside usual hours: buildings may be closed. ZEUS doesn't list opening hours.");
  }
  const note = document.getElementById("rooms-note");
  note.textContent = notes.join(" ");
  note.hidden = notes.length === 0;

  const list = document.getElementById("rooms-list");
  list.innerHTML = "";
  if (rooms.length === 0) {
    list.innerHTML = `<p class="empty-day">No rooms without a class at this time.</p>`;
    return;
  }
  for (const room of rooms) {
    const row = document.createElement("div");
    row.className = "room-row";
    const until = room.restOfDay ? "Rest of the day" : `Until ${timeFormatter.format(room.freeUntil)}`;
    row.innerHTML = `
      <span class="room-name">${escapeHTML(room.room)}</span>
      <span class="room-until${room.restOfDay ? " is-long" : ""}">${until}</span>
    `;
    list.appendChild(row);
  }
}

document.getElementById("rooms-input").addEventListener("change", readRoomsFile);
document.getElementById("rooms-reload-input").addEventListener("change", readRoomsFile);

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

document.getElementById("edit-courses-btn").addEventListener("click", async () => {
  // Opened from the saved copy, which only has your own classes — the full
  // course list lives in the ZEUS file, so fetch it again from the saved link.
  if (allEvents.length === 0 && loadSavedUrl()) {
    await loadFromURL(loadSavedUrl());
  }
  document.getElementById("week-view").hidden = true;
  if (allEvents.length === 0) {
    document.getElementById("upload-section").hidden = false;
    showError("To change your courses, load your ZEUS link or file again. Courses you've hidden will stay hidden.");
    return;
  }
  const hidden = isSampleData ? getHiddenCourseNames() : loadHiddenCourses();
  renderCoursePicker(getUniqueCourses(allEvents), hidden);
  updateShowButton();
});

document.getElementById("refresh-btn").addEventListener("click", async (event) => {
  const button = event.currentTarget;
  button.disabled = true;
  button.textContent = "Refreshing…";
  await loadFromURL(loadSavedUrl());
  button.disabled = false;
  button.textContent = "Refresh";
});

function openSourceSettings() {
  const hasTimetable = eventsByDay.size > 0;
  document.getElementById("upload-section").hidden = false;
  document.getElementById("week-view").hidden = true;
  document.getElementById("back-btn").hidden = !hasTimetable;
  document.getElementById("start-over-btn").hidden = !hasTimetable;
}

// Wipes everything this app saved (link, timetable, hidden courses, login)
// and reloads, so the app opens like it's the first time.
document.getElementById("start-over-btn").addEventListener("click", () => {
  if (!confirm("Start over? This removes your saved link, timetable and settings from this phone.")) return;
  try {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("zeus-")) localStorage.removeItem(key);
    }
  } catch {
    // Storage unavailable — nothing was saved, so there's nothing to clear.
  }
  location.reload();
});

document.getElementById("change-source-btn").addEventListener("click", openSourceSettings);
document.getElementById("settings-btn").addEventListener("click", openSourceSettings);

document.getElementById("profile-btn").addEventListener("click", () => {
  const login = prompt("Your EPITA login, as shown on Forge (e.g. firstname.lastname):", loadLogin());
  if (login === null) return; // cancelled
  saveLogin(login.trim().toLowerCase());
  renderProfile();
});

for (const button of document.querySelectorAll(".nav-btn")) {
  button.addEventListener("click", () => goToPage(Number(button.dataset.page)));
}

// Errors float on top of everything; tap to dismiss.
document.getElementById("error-message").addEventListener("click", () => showError(""));

document.getElementById("back-btn").addEventListener("click", () => {
  showError("");
  document.getElementById("upload-section").hidden = true;
  document.getElementById("week-view").hidden = false;
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
  showSavedUrlState(false);
  document.getElementById("ics-url-input").value = "";
});

// ---------------------------------------------------------------------------
// On page load
// ---------------------------------------------------------------------------

// 1. Show the saved copy of your schedule straight away (works offline),
//    and any saved free-rooms data.
loadRoomSettings();
renderRooms();
const mySchedule = loadMySchedule();
if (mySchedule) {
  showWeekView(mySchedule.events, mySchedule.savedAt);
}

// 2. If you saved a ZEUS link, refresh from it in the background — this is
//    what gets us from "six ZEUS clicks" to zero.
const savedUrl = loadSavedUrl();
if (savedUrl) {
  document.getElementById("ics-url-input").value = savedUrl;
  showSavedUrlState(true);
  loadFromURL(savedUrl, { isAutoLoad: true });
}

// 3. Let the app be installed to the home screen and open offline.
//    Service workers only run on a real web address, not a double-clicked file.
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("sw.js").catch(console.error);
}
