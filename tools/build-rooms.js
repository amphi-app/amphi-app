/*
  Turns a whole-school ZEUS export into data/rooms.json, which the Rooms
  tab loads for everyone. Only room names and busy times are kept: no
  course names, groups or people.

  Run it (about once a week) with the newest whole-school file:
    npm run rooms -- path/to/whole-school.ics
  then commit and push data/rooms.json.
*/
const fs = require("fs");
const path = require("path");
const { parseICS } = require("../ics.js");
const { buildOccupancy } = require("../rooms.js");

const WEEKS = 8;
const DAY = 86400000;

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run rooms -- path/to/whole-school.ics");
  process.exit(1);
}

const text = fs.readFileSync(file, "utf8");
const events = parseICS(text);
const titles = new Set(events.map((event) => event.summary));
if (titles.size <= 100) {
  console.error("That looks like one group's file. Use the whole-school export (in ZEUS, tick only EPITA).");
  process.exit(1);
}

// When ZEUS produced the file (every entry carries the export time), so the
// app can say how old the data is. Falls back to now.
const stamp = text.match(/^DTSTAMP:(\d{8}T\d{6}Z)/m);
const exportedAt = stamp
  ? new Date(stamp[1].replace(/(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z/, "$1-$2-$3T$4:$5:$6Z"))
  : new Date();

const from = new Date(exportedAt.getTime() - DAY);
const until = new Date(exportedAt.getTime() + WEEKS * 7 * DAY);
const occupancy = buildOccupancy(events, from, until);

const out = path.join(__dirname, "..", "data", "rooms.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify({ exportedAt: exportedAt.toISOString(), occupancy }));

console.log(`Wrote ${out}: ${Object.keys(occupancy).length} rooms, ZEUS data from ${exportedAt.toISOString().slice(0, 10)}, ${Math.round(fs.statSync(out).size / 1024)} KB.`);
