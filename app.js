/*
  ZEUS Schedule Viewer — app.js

  This file does four jobs, in order:
    1. Parse a .ics file's text into a plain JavaScript array of event objects.
       (A real ZEUS export covers the WHOLE school, not just one student.)
    2. Let the student pick which courses are theirs from that full list,
       remembering the choice in the browser for next time.
    3. Classify each event (course color, or Exam) from its French title.
    4. Render the selected events as English, color-coded cards grouped by day.

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

const PALETTE = [
  "#4f7cff", "#2fb380", "#e0a300", "#a855f7", "#ef6ea8",
  "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#06b6d4",
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
// real ZEUS export yet. Real files will look the same shape as this.
const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Sample//EN
BEGIN:VEVENT
SUMMARY:Algorithmique
DTSTART:20260922T083000
DTEND:20260922T103000
LOCATION:Amphi B
DESCRIPTION:
END:VEVENT
BEGIN:VEVENT
SUMMARY:Bases de donnees GR A1
DTSTART:20260922T110000
DTEND:20260922T130000
LOCATION:Salle 214
DESCRIPTION:
END:VEVENT
BEGIN:VEVENT
SUMMARY:Programmation systeme GR A1
DTSTART:20260923T140000
DTEND:20260923T170000
LOCATION:Salle Info 3
DESCRIPTION:Salle sous reserve de changement
END:VEVENT
BEGIN:VEVENT
SUMMARY:Examen Mathematiques
DTSTART:20260925T090000
DTEND:20260925T110000
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

// ---------------------------------------------------------------------------
// STEP 3: Render events into the page
// ---------------------------------------------------------------------------

const timeFormatter = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });
const dayFormatter = new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" });

function groupByDay(events) {
  const groups = new Map();
  for (const event of events) {
    const key = event.start.toDateString();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  // Sort days chronologically, and events within each day chronologically.
  const sortedKeys = [...groups.keys()].sort(
    (a, b) => new Date(a) - new Date(b)
  );
  for (const key of sortedKeys) {
    groups.get(key).sort((a, b) => a.start - b.start);
  }
  return sortedKeys.map((key) => ({ key, events: groups.get(key) }));
}

// Event text (SUMMARY/LOCATION/DESCRIPTION) is free-form text written by
// school staff, not something we control — escape it before it goes into
// innerHTML so it can never be interpreted as markup.
function escapeHTML(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function renderLegend(events) {
  const legend = document.getElementById("legend");
  const hasExam = events.some((event) => classify(event.summary).isExam);

  legend.innerHTML = "";
  if (hasExam) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:var(--color-exam)"></span>Exam`;
    legend.appendChild(item);
  }
  const note = document.createElement("div");
  note.className = "legend-item";
  note.textContent = "Every other course gets its own consistent color.";
  legend.appendChild(note);
  legend.hidden = false;
}

function renderSchedule(events) {
  const container = document.getElementById("schedule");
  container.innerHTML = "";

  if (events.length === 0) {
    container.innerHTML = `<p class="error">No events found in that file.</p>`;
    return;
  }

  for (const { key, events: dayEvents } of groupByDay(events)) {
    const dayGroup = document.createElement("div");
    dayGroup.className = "day-group";

    const heading = document.createElement("h2");
    heading.className = "day-heading";
    heading.textContent = dayFormatter.format(new Date(key));
    dayGroup.appendChild(heading);

    for (const event of dayEvents) {
      const type = classify(event.summary);

      const card = document.createElement("div");
      card.className = "event-card";
      card.style.borderLeftColor = type.color;

      const timeRange = `${timeFormatter.format(event.start)} – ${timeFormatter.format(event.end)}`;
      const title = escapeHTML(event.summary || "Untitled class");
      const location = event.location ? escapeHTML(event.location) : "";
      const note = event.description ? escapeHTML(event.description) : "";

      card.innerHTML = `
        <div class="event-top-row">
          <span class="event-time">${timeRange}</span>
          ${type.isExam ? `<span class="event-type-badge" style="background:${type.color}">Exam</span>` : ""}
        </div>
        <div class="event-title">${title}</div>
        <div class="event-meta">
          ${location ? `📍 ${location}` : ""}
          ${note ? `&nbsp;·&nbsp;${note}` : ""}
        </div>
      `;

      dayGroup.appendChild(card);
    }

    container.appendChild(dayGroup);
  }
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

  document.getElementById("course-picker").hidden = true;
  document.getElementById("schedule-header").hidden = false;

  if (filtered.length === 0) {
    showError("No courses selected — pick at least one from the list.");
    document.getElementById("legend").hidden = true;
    document.getElementById("schedule").innerHTML = "";
    return;
  }

  showError("");
  renderLegend(filtered);
  renderSchedule(filtered);
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
      document.getElementById("schedule-header").hidden = true;
      document.getElementById("legend").hidden = true;
      document.getElementById("schedule").innerHTML = "";
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
  document.getElementById("schedule-header").hidden = true;
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
