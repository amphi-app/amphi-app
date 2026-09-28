/*
  Turns a whole-school ZEUS export into the two files every student's app
  loads, so nobody but the maintainer downloads anything:
    data/rooms.json    which rooms are booked when (Rooms tab)
    data/updates.json  each entry's latest time and room, by ZEUS ID
                       (keeps everyone's timetable up to date; updates.js)
  Neither contains course names, groups or people.

  Run it (about once a week) with the newest whole-school file:
    npm run data -- path/to/whole-school.ics
  then commit and push the data folder.
*/
const fs = require("fs");
const path = require("path");
const { parseICS } = require("../ics.js");
const { buildOccupancy } = require("../rooms.js");
const { buildUpdates } = require("../updates.js");

const WEEKS = 8;
const DAY = 86400000;

const file = process.argv[2];
if (!file) {
  console.error("Usage: npm run data -- path/to/whole-school.ics");
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

const dataDir = path.join(__dirname, "..", "data");
fs.mkdirSync(dataDir, { recursive: true });

function write(name, content) {
  const file = path.join(dataDir, name);
  fs.writeFileSync(file, JSON.stringify(content));
  return `${name} (${Math.round(fs.statSync(file).size / 1024)} KB)`;
}

const updates = buildUpdates(events, exportedAt);
const written = [
  write("rooms.json", { exportedAt: exportedAt.toISOString(), occupancy }),
  write("updates.json", updates),
];
console.log(`ZEUS data from ${exportedAt.toISOString().slice(0, 10)}: ${Object.keys(occupancy).length} rooms, ${Object.keys(updates.entries).length} entries.`);
console.log(`Wrote ${written.join(" and ")}. Now commit and push the data folder.`);
