/*
  ics.js — reading and writing the .ics calendar format (RFC 5545).

  Nothing in here touches the page, so it can be tested outside a browser
  (see tests/ics.test.js, run with `npm test`). app.js uses these functions.
*/

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/**
 * The ICS format sometimes wraps a single logical line across multiple
 * physical lines: a continuation line starts with a space or tab.
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

/** ICS escapes backslashes, commas, semicolons and newlines with a backslash.
 *  One pass, so an escaped backslash followed by "n" stays a backslash + "n". */
function unescapeICSText(value) {
  return value.replace(/\\([\\;,nN])/g, (_, char) => (char === "n" || char === "N" ? "\n" : char));
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
 *   { uid, summary, location, description, start: Date, end: Date }
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
        current.end = current.end || current.start; // DTEND is optional in the spec
        // Every event needs a stable ID so a calendar app can recognise it
        // again on a later import. ZEUS provides one; the sample doesn't.
        current.uid = current.uid || `${formatICSDate(current.start)}-${encodeURIComponent(current.summary || "")}@zeus-timetable`;
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
      // course look like two different ones in the course picker.
      case "SUMMARY":
        current.summary = unescapeICSText(value).trim();
        break;
      case "LOCATION":
        current.location = unescapeICSText(value).trim();
        break;
      case "DESCRIPTION":
        current.description = unescapeICSText(value).trim();
        break;
      case "UID":
        current.uid = value.trim();
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
// Writing — used to export your selected classes for Google/Apple Calendar
// ---------------------------------------------------------------------------

/** The reverse of unescapeICSText. The backslash goes first, so the
 *  backslashes added for the other characters aren't doubled up. */
function escapeICSText(value) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** A Date as "20260922T063000Z" (always UTC). */
function formatICSDate(date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

const utf8 = new TextEncoder();

/** The spec limits lines to 75 bytes; longer ones continue on the next line
 *  after a space. Counted in bytes, not letters, because "é" takes 2 bytes. */
function foldLine(line) {
  const parts = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = utf8.encode(char).length;
    if (bytes + size > 75) {
      parts.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  parts.push(current);
  return parts.join("\r\n");
}

/** Builds a complete .ics file from an array of events (same shape parseICS returns). */
function buildICS(events, now = new Date()) {
  const stamp = formatICSDate(now);
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ZEUS Timetable//EN",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:EPITA Timetable",
    "X-WR-TIMEZONE:Europe/Paris",
  ];

  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${formatICSDate(event.start)}`,
      `DTEND:${formatICSDate(event.end)}`,
      `SUMMARY:${escapeICSText(event.summary || "")}`,
    );
    if (event.location) lines.push(`LOCATION:${escapeICSText(event.location)}`);
    if (event.description) lines.push(`DESCRIPTION:${escapeICSText(event.description)}`);
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

// Lets Node (the tests) load this file too; browsers skip this block.
if (typeof module !== "undefined") {
  module.exports = { parseICS, buildICS, foldLine, unescapeICSText, escapeICSText };
}
