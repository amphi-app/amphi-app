/*
  Made-up ZEUS data for the browser tests. Everything here is invented:
  course titles, rooms (KB9xx, A9xx, B9xx, "Salle machine 390"…) and IDs.
  Real ZEUS exports must never be committed (they're school data), so the
  tests build files that look like ZEUS's instead.

  The tests run at a fixed moment, NOW (Wednesday 7 Oct 2026, 10:15 in
  Paris), so "now", "today" and "next class" never depend on the real date.
*/
const { buildOccupancy, servedLocation } = require("../../rooms.js");
const { buildUpdates } = require("../../updates.js");

// --- Paris time ---------------------------------------------------------
const offsetFormatter = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" });

function parisOffsetMinutes(date) {
  const zone = offsetFormatter.formatToParts(date).find((part) => part.type === "timeZoneName").value;
  const match = zone.match(/GMT([+-])(\d+)(?::(\d+))?/);
  return match ? (match[1] === "-" ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3] || 0)) : 0;
}

/** The moment it is `hour:minute` in Paris on `dayKey` ("2026-10-07"). */
function paris(dayKey, hour, minute = 0) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const asIfUTC = Date.UTC(y, m - 1, d, hour, minute);
  return new Date(asIfUTC - parisOffsetMinutes(new Date(asIfUTC)) * 60000);
}

function addDays(dayKey, days) {
  const date = new Date(`${dayKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const MONDAY = "2026-10-05";
const NOW = paris("2026-10-07", 10, 15); // Wednesday, during Atelier Python
const WEEKS = 10;

// --- ZEUS-style .ics text -------------------------------------------------
let uidCounter = 0;
// Amphi tells entries apart by the first 12 hex digits (shortId in
// updates.js), so the counter goes at the start, as random ZEUS IDs differ there.
const fakeUid = () => `${(++uidCounter).toString(16).padStart(8, "0")}-0000-4000-8000-000000000000`;
const stamp = (date) => date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (text) => text.replace(/\\/g, "\\\\").replace(/,/g, "\\,").replace(/;/g, "\\;");

/** An entry: { uid, summary, start, end, location } with a fresh fake ID. */
function entry(summary, dayKey, [fromH, fromM], [toH, toM], location = "") {
  return { uid: fakeUid(), summary, start: paris(dayKey, fromH, fromM), end: paris(dayKey, toH, toM), location };
}

function toICS(events, exportedAt = NOW) {
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Amphi test fixtures//EN"];
  for (const event of events) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:${event.uid}`,
      `DTSTAMP:${stamp(exportedAt)}`,
      `DTSTART:${stamp(event.start)}`,
      `DTEND:${stamp(event.end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
      `LOCATION:${escapeText(event.location || "")}`,
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// --- Your group's timetable ----------------------------------------------
// [title, weekday (0 = Monday), from, to, room]
const WEEKLY = [
  ["Algorithmique des graphes fictifs", 0, [8, 30], [10, 30], "KB910"],
  ["TD Réseaux", 0, [11, 0], [13, 0], "KB920"],
  ["Atelier Python", 2, [9, 0], [11, 0], "Salle machine 390"],
  ["Projet Robotique", 3, [14, 0], [17, 0], "A901"],
  ["Anglais technique", 4, [10, 0], [12, 0], "B901"],
  ["Cours délocalisé", 4, [14, 0], [16, 0], "Site Ouest 12"], // another site
];

function weekly([title, weekday, from, to, room], weeks = WEEKS, startWeek = 0) {
  const events = [];
  for (let week = startWeek; week < startWeek + weeks; week++) {
    events.push(entry(title, addDays(MONDAY, week * 7 + weekday), from, to, room));
  }
  return events;
}

const ONE_OFFS = [
  ["Conférence Sécurité", addDays(MONDAY, 3), [18, 0], [20, 0], "KB900 (amphi 9)"], // event
  ["Examen Algèbre", addDays(MONDAY, 8), [9, 0], [11, 0], "A902, A903"],           // exam
  ["Semaine d'intégration", addDays(MONDAY, 14), [9, 0], [17, 0], "KB900 (amphi 9)"], // event
  ["RATTRAPAGES S9", addDays(MONDAY, 22), [9, 0], [12, 0], "A902"],                // exam
  ["Férié fictif", addDays(MONDAY, 30), [0, 0], [23, 59], ""],                            // day off
];

const groupEvents = [
  ...WEEKLY.flatMap((course) => weekly(course)),
  ...ONE_OFFS.map(([title, day, from, to, room]) => entry(title, day, from, to, room)),
];
const COURSE_TITLES = WEEKLY.map(([title]) => title);

/** The group file as ZEUS would export it. */
const groupICS = () => toICS(groupEvents);

/** The same group a week later: ZEUS added a course. */
const newCourse = ["Cours de soutien", 1, [16, 0], [18, 0], "KB930"];
const groupV2ICS = () => toICS([...groupEvents, ...weekly(newCourse)]);

// --- A friend's timetable (in class at NOW) --------------------------------
const friendEvents = [
  ...weekly(["Compilation", 2, [10, 0], [12, 0], "KB930"], 4),
  ...weekly(["Logique", 3, [9, 0], [11, 0], "KB930"], 4),
];
const friendICS = () => toICS(friendEvents);

// --- The whole school ---------------------------------------------------------
// Your group, another group in the same rooms, and enough different titles
// (over 100) to look like a whole-school export.
const otherGroups = [
  ...weekly(["Mathématiques discrètes", 1, [8, 0], [10, 0], "KB910"]),
  ...weekly(["Physique imaginaire", 3, [8, 0], [12, 0], "B901"]),
  ...weekly(["Systèmes", 4, [9, 0], [12, 0], "KB930"]),
  ...Array.from({ length: 120 }, (_, i) =>
    entry(`Option ${String(i + 1).padStart(3, "0")}`, addDays(MONDAY, 7 + (i % 5)), [17, 0], [18, 0], "KB940")),
];
const schoolEvents = [...groupEvents, ...otherGroups];
const schoolICS = () => toICS(schoolEvents);

// --- The weekly data files (data/rooms.json, data/updates.json) -------------
// Published 2 hours before NOW. Compared with your group file, ZEUS has since:
// moved next Monday's TD Réseaux to 14:00, moved tomorrow's Projet Robotique
// to A905, and dropped Friday's Anglais technique.
const WEEKLY_EXPORT = new Date(NOW.getTime() - 2 * 3600000);
const nextMonday = addDays(MONDAY, 7);
const thursday = addDays(MONDAY, 3);
const friday = addDays(MONDAY, 4);
const sameDay = (date, dayKey) => paris(dayKey, 0) <= date && date < paris(addDays(dayKey, 1), 0);

function schoolLater() {
  const events = [];
  for (const event of schoolEvents) {
    if (event.summary === "Anglais technique" && sameDay(event.start, friday)) continue;
    if (event.summary === "TD Réseaux" && sameDay(event.start, nextMonday)) {
      events.push({ ...event, start: paris(nextMonday, 14), end: paris(nextMonday, 16) });
    } else if (event.summary === "Projet Robotique" && sameDay(event.start, thursday)) {
      events.push({ ...event, location: "A905" });
    } else {
      events.push(event);
    }
  }
  return events;
}

function weeklyData() {
  const later = schoolLater();
  const from = new Date(WEEKLY_EXPORT.getTime() - 86400000);
  const until = new Date(WEEKLY_EXPORT.getTime() + 8 * 7 * 86400000);
  return {
    rooms: { exportedAt: WEEKLY_EXPORT.toISOString(), occupancy: buildOccupancy(later, from, until) },
    updates: buildUpdates(later, WEEKLY_EXPORT, 8, servedLocation),
  };
}

module.exports = {
  NOW, MONDAY, paris, addDays,
  groupICS, groupV2ICS, friendICS, schoolICS, weeklyData,
  COURSE_TITLES, newCourseTitle: newCourse[0],
};
