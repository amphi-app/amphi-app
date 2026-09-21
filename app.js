/*
  ZEUS Schedule Viewer — app.js

  This file does three jobs, in order:
    1. Parse a .ics file's text into a plain JavaScript array of event objects.
    2. Classify each event (Lecture / Tutorial / Lab / Exam) from its French title.
    3. Render those events as English, color-coded cards grouped by day.

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
      case "SUMMARY":
        current.summary = unescapeICSText(value);
        break;
      case "LOCATION":
        current.location = unescapeICSText(value);
        break;
      case "DESCRIPTION":
        current.description = unescapeICSText(value);
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

// A single student's semester is unlikely to have more than a couple hundred
// events. A much bigger number almost certainly means this export wasn't
// filtered to one person (a real ZEUS export we inspected had 11,000+
// events covering the whole school) — worth telling the user rather than
// silently rendering thousands of cards that aren't theirs.
const LIKELY_UNFILTERED_THRESHOLD = 300;

function loadScheduleFromText(text) {
  try {
    const events = parseICS(text);
    if (events.length === 0) {
      showError("That file didn't contain any recognizable events.");
      return;
    }
    if (events.length > LIKELY_UNFILTERED_THRESHOLD) {
      showError(
        `This file has ${events.length} events — that's far more than one student's schedule. ` +
        `It's likely the whole school's calendar rather than just yours. Showing it anyway, but ` +
        `see the README for why this happens and what to do about it.`
      );
    } else {
      showError("");
    }
    renderLegend(events);
    renderSchedule(events);
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
