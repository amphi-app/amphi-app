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
// These patterns are a best guess at how ZEUS labels class types in the
// SUMMARY field (e.g. "CM - Algorithmique"). Once we have a real exported
// .ics file from ZEUS, check it against this list and adjust the patterns —
// this is the one place you'll likely need to edit after testing with real data.
const CLASS_TYPES = [
  { match: /\bCM\b/i, label: "Lecture", color: "var(--color-lecture)" },
  { match: /\bTD\b/i, label: "Tutorial", color: "var(--color-tutorial)" },
  { match: /\bTP\b/i, label: "Lab", color: "var(--color-lab)" },
  { match: /\b(examen|contr[oô]le|partiel|ds)\b/i, label: "Exam", color: "var(--color-exam)" },
];
const DEFAULT_TYPE = { label: "Class", color: "var(--color-default)" };

// A small embedded sample so you can see the app work without needing a
// real ZEUS export yet. Real files will look the same shape as this.
const SAMPLE_ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Sample//EN
BEGIN:VEVENT
SUMMARY:CM - Algorithmique
DTSTART:20260922T083000
DTEND:20260922T103000
LOCATION:Amphi B
DESCRIPTION:Prof. Martin Dubois
END:VEVENT
BEGIN:VEVENT
SUMMARY:TD - Bases de donnees
DTSTART:20260922T110000
DTEND:20260922T130000
LOCATION:Salle 214
DESCRIPTION:Prof. Alice Nguyen
END:VEVENT
BEGIN:VEVENT
SUMMARY:TP - Programmation systeme
DTSTART:20260923T140000
DTEND:20260923T170000
LOCATION:Salle Info 3
DESCRIPTION:Prof. Karim Haddad
END:VEVENT
BEGIN:VEVENT
SUMMARY:Examen - Mathematiques
DTSTART:20260925T090000
DTEND:20260925T110000
LOCATION:Amphi A
DESCRIPTION:Surveillant: Prof. Sophie Laurent
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
      if (current && current.start) events.push(current);
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
// STEP 2: Classify each event by type
// ---------------------------------------------------------------------------

function classify(summary = "") {
  for (const type of CLASS_TYPES) {
    if (type.match.test(summary)) return type;
  }
  return DEFAULT_TYPE;
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

function renderLegend(events) {
  const legend = document.getElementById("legend");
  const typesUsed = new Map();
  for (const event of events) {
    const type = classify(event.summary);
    typesUsed.set(type.label, type.color);
  }

  legend.innerHTML = "";
  for (const [label, color] of typesUsed) {
    const item = document.createElement("div");
    item.className = "legend-item";
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${label}`;
    legend.appendChild(item);
  }
  legend.hidden = typesUsed.size === 0;
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

      card.innerHTML = `
        <div class="event-top-row">
          <span class="event-time">${timeRange}</span>
          <span class="event-type-badge" style="background:${type.color}">${type.label}</span>
        </div>
        <div class="event-title">${event.summary || "Untitled class"}</div>
        <div class="event-meta">
          ${event.location ? `📍 ${event.location}` : ""}
          ${event.description ? `&nbsp;·&nbsp;${event.description}` : ""}
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

function loadScheduleFromText(text) {
  try {
    const events = parseICS(text);
    if (events.length === 0) {
      showError("That file didn't contain any recognizable events.");
      return;
    }
    showError("");
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
