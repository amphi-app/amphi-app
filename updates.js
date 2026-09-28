/*
  updates.js — keeping each student's timetable up to date from the weekly
  whole-school export, without them downloading anything.

  Every ZEUS entry has a permanent ID that survives time and room changes.
  The maintainer publishes data/updates.json each week: for every entry in
  the next few weeks, its ID, time and room (no course names). Each phone
  looks up its own classes by ID and corrects anything that moved.

  What this can't do: add classes that are new to your group (a new entry
  doesn't say which group it's for). Entries that vanish are flagged, not
  deleted, because ZEUS sometimes re-creates an entry under a new ID.
  No page code here, so it can be tested (see tests/updates.test.js).
*/

const UPDATE_WEEKS = 8;
const ALERT_DAYS = 7;

/** ZEUS IDs are 36-character GUIDs; the first 12 hex digits are plenty to
 *  tell ~10,000 entries apart and keep the published file small. */
function shortId(uid) {
  const hex = uid.replace(/-/g, "");
  return /^[0-9a-f]{32}$/i.test(hex) ? hex.slice(0, 12).toLowerCase() : uid;
}

const minuteOf = (date) => Math.floor(date.getTime() / 60000);

/** The published file: times are minutes after `base`; rooms are stored once. */
function buildUpdates(events, exportedAt, weeks = UPDATE_WEEKS) {
  const base = minuteOf(exportedAt) - 24 * 60;
  const end = base + 24 * 60 + weeks * 7 * 24 * 60;
  const locations = [];
  const locationIndex = new Map();
  const entries = {};
  for (const event of events) {
    if (!event.uid) continue;
    const start = minuteOf(event.start);
    if (start < base || start >= end) continue;
    const location = event.location || "";
    if (!locationIndex.has(location)) {
      locationIndex.set(location, locations.length);
      locations.push(location);
    }
    entries[shortId(event.uid)] = [start - base, minuteOf(event.end) - start, locationIndex.get(location)];
  }
  return { exportedAt: exportedAt.toISOString(), base, end, locations, entries };
}

/**
 * Applies published updates to your own events.
 * Returns { events, changes }: the corrected events (same order), and every
 * change as { type: "moved" | "room" | "missing", summary, before, after }.
 * Only call this when the published data is newer than your own copy.
 */
function applyUpdates(myEvents, updates) {
  const changes = [];
  const events = myEvents.map((event) => {
    if (!event.uid) return event;
    const record = updates.entries[shortId(event.uid)];
    const startMinute = minuteOf(event.start);

    if (!record) {
      // Only entries the published data should have covered can be "missing".
      const covered = startMinute >= updates.base && startMinute < updates.end;
      if (!covered || event.missing) return event;
      changes.push({ type: "missing", summary: event.summary, before: event, after: event });
      return { ...event, missing: true };
    }

    const [offset, minutes, locationIndex] = record;
    const start = new Date((updates.base + offset) * 60000);
    const end = new Date((updates.base + offset + minutes) * 60000);
    const location = updates.locations[locationIndex] || "";
    const moved = start.getTime() !== event.start.getTime() || end.getTime() !== event.end.getTime();
    const roomChanged = location !== (event.location || "");
    if (!moved && !roomChanged && !event.missing) return event;

    const updated = { ...event, start, end, location, missing: false };
    if (moved) changes.push({ type: "moved", summary: event.summary, before: event, after: updated });
    else if (roomChanged) changes.push({ type: "room", summary: event.summary, before: event, after: updated });
    return updated;
  });
  return { events, changes };
}

/** Changes worth an alert: ones that touch the next ALERT_DAYS days. */
function upcomingChanges(changes, now = new Date()) {
  const until = now.getTime() + ALERT_DAYS * 86400000;
  const soon = (date) => date >= now && date.getTime() < until;
  return changes.filter((change) => soon(change.before.start) || soon(change.after.start));
}

// Lets Node (the tests and the build script) load this file too.
if (typeof module !== "undefined") {
  module.exports = { shortId, buildUpdates, applyUpdates, upcomingChanges };
}
