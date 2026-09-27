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
// STEP 1: Parse raw .ics text into an array of event objects
// ---------------------------------------------------------------------------

/**
 * The ICS format (RFC 5545) sometimes wraps a single logical line across
 * multiple physical lines: a continuation line starts with a space or tab.
 * This joins those back into one line each.
 */
function unfoldLines(rawLines) {
  const lines = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && lines.length > 0) {
      lines[lines.length - 1] += line.slice(1);
    } else if (line.length > 0) {
      lines.push(line);
    }
  }
  return lines;
}

/** Splits one ICS line like "DTSTART;TZID=Europe/Paris:20260922T083000"
 *  into its name, parameters, and value. */
function parseICSLine(line) {
  const colonIndex = line.indexOf(":");
  const left = colonIndex === -1 ? line : line.slice(0, colonIndex);
  const value = colonIndex === -1 ? "" : line.slice(colonIndex + 1);
  const [name, ...params] = left.split(";");
  return { name: name.toUpperCase(), value, params };
}

/** ICS escapes commas, semicolons, and newlines with a backslash. */
function unescapeICSText(value) {
  return value
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\");
}

/** Turns "20260922T083000" or "20260922T083000Z" into a JS Date. */
function parseICSDate(value) {
  const isUTC = value.endsWith("Z");
  const clean = value.replace("Z", "");
  const year = Number(clean.slice(0, 4));
  const month = Number(clean.slice(4, 6)) - 1; // JS months are 0-indexed
  const day = Number(clean.slice(6, 8));
  const hour = Number(clean.slice(9, 11)) || 0;
  const minute = Number(clean.slice(11, 13)) || 0;
  const second = Number(clean.slice(13, 15)) || 0;

  return isUTC
    ? new Date(Date.UTC(year, month, day, hour, minute, second))
    : new Date(year, month, day, hour, minute, second);
}

// ZEUS's own data has at least one bogus placeholder date (year 3036, seen
// on a "date to be rescheduled" event). Anything wildly outside a normal
// school-year window is a data bug, not a real class, so we drop it rather
// than show "your class in March 3036."
const MIN_YEAR = new Date().getFullYear() - 1;
const MAX_YEAR = new Date().getFullYear() + 3;

function isPlausibleDate(date) {
  const year = date.getFullYear();
  return year >= MIN_YEAR && year <= MAX_YEAR;
}

/**
 * Parses the full text of a .ics file into an array of:
 *   { summary, location, description, start: Date, end: Date }
 */
function parseICS(text) {
  const lines = unfoldLines(text.split(/\r\n|\n|\r/));
  const events = [];
  let current = null;

  for (const line of lines) {
    if (line === "BEGIN:VEVENT") {
      current = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (current && current.start && isPlausibleDate(current.start)) {
        current.end = current.end || current.start; // DTEND is optional in the ICS spec
        events.push(current);
      }
      current = null;
      continue;
    }
    if (!current) continue;

    const { name, value } = parseICSLine(line);
    switch (name) {
      // .trim() because some real ZEUS entries have a stray leading space
      // ("SUMMARY: Anglais général 1"), which would otherwise make the same
      // course look like two different ones in the picker below.
      case "SUMMARY":
        current.summary = unescapeICSText(value).trim();
        break;
      case "LOCATION":
        current.location = unescapeICSText(value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeICSText(value).trim();
        break;
      case "DTSTART":
        current.start = parseICSDate(value);
        break;
      case "DTEND":
        current.end = parseICSDate(value);
        break;
    }
  }

  return events;
}

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

function showWeekView(events) {
  eventsByDay = indexByDay(events);
  selectedDay = pickStartDay(events);
  document.getElementById("upload-section").hidden = true;
  document.getElementById("course-picker").hidden = true;
  document.getElementById("week-view").hidden = false;
  renderWeek();
}

function showError(message) {
  const errorEl = document.getElementById("error-message");
  errorEl.textContent = message;
  errorEl.hidden = !message;
}

// ---------------------------------------------------------------------------
// STEP 2 (continued): Course picker — a real ZEUS export covers every
// course in the school, so the student has to tell us which ones are theirs.
// ---------------------------------------------------------------------------

const STORAGE_KEY = "zeus-schedule-selected-courses";

// localStorage can throw (private browsing, disabled site data, etc.), and
// this is a convenience feature, not something the app depends on — so any
// failure here should just mean "don't remember," not a broken page.
function loadSavedSelection() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSelection(selectedSet) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...selectedSet]));
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
      // Fail quietly on auto-load — the file upload is still right there.
      forgetSavedUrl();
      document.getElementById("saved-url-note").hidden = true;
      return;
    }
    showError(
      "Couldn't load that link directly — ZEUS's server may not allow this app to fetch it " +
      "from the browser (a security setting called CORS). Download the file from that link " +
      "instead and upload it below."
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

function renderCoursePicker(courses, selected) {
  const picker = document.getElementById("course-picker");
  const list = document.getElementById("course-list");
  list.innerHTML = "";

  for (const course of courses) {
    const row = document.createElement("label");
    row.className = "course-row";
    row.dataset.name = course.name.toLowerCase();

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = course.name;
    checkbox.checked = selected.has(course.name);

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

function showFilteredSchedule() {
  const selected = getCheckedCourseNames();
  saveSelection(selected);

  const filtered = allEvents.filter((event) => selected.has(event.summary));
  if (filtered.length === 0) {
    showError("No courses selected — pick at least one from the list.");
    return;
  }

  showError("");
  showWeekView(filtered);
}

function loadScheduleFromText(text) {
  try {
    const events = parseICS(text);
    if (events.length === 0) {
      showError("That file didn't contain any recognizable events.");
      return;
    }
    showError("");
    allEvents = events;

    const courses = getUniqueCourses(events);
    const saved = loadSavedSelection();
    renderCoursePicker(courses, saved);

    // If we already know their courses from last time, skip straight to
    // the schedule — but only for names that still exist in this file.
    const stillValid = [...saved].filter((name) => courses.some((c) => c.name === name));
    if (stillValid.length > 0) {
      showFilteredSchedule();
    } else {
      document.getElementById("week-view").hidden = true;
    }
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
  loadScheduleFromText(SAMPLE_ICS);
});

document.getElementById("course-search").addEventListener("input", (event) => {
  const query = event.target.value.toLowerCase();
  for (const row of document.querySelectorAll(".course-row")) {
    row.style.display = row.dataset.name.includes(query) ? "" : "none";
  }
});

document.getElementById("show-schedule-btn").addEventListener("click", showFilteredSchedule);

document.getElementById("edit-courses-btn").addEventListener("click", () => {
  const selected = getCheckedCourseNames();
  renderCoursePicker(getUniqueCourses(allEvents), selected);
  document.getElementById("week-view").hidden = true;
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

// On page load, if we have a saved link from a previous visit, use it
// automatically — this is what gets us from "six ZEUS clicks" to zero.
const savedUrl = loadSavedUrl();
if (savedUrl) {
  document.getElementById("ics-url-input").value = savedUrl;
  document.getElementById("saved-url-note").hidden = false;
  loadFromURL(savedUrl, { isAutoLoad: true });
}
