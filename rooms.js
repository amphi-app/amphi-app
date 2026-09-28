/*
  rooms.js — which rooms have no class booked at a given time.

  Built from the WHOLE-SCHOOL ZEUS file, the only file that lists every
  room booking. A room with nothing booked in ZEUS might still be locked or
  used informally, so the app says "no class booked", never "free".
  No page code here, so it can be tested (see tests/rooms.test.js).
*/

// Which campus each room is on, decided from its name. Rooms that match no
// rule are listed under "Other rooms". Edit this table to fix a campus.
const CAMPUS_RULES = [
  { campus: "Kremlin-Bicêtre", pattern: /^KB|\bKB\d|\(KB\d\)/i },
  // A/B/C followed by a number ("A202", "C04 (Amphithéâtre)"), so "Alphago"
  // and "Amphi Conway" don't count; and "Salle machine 302" to "311".
  { campus: "Villejuif", pattern: /^[ABC]\d|^Salle machine 3\d\d/i },
];
const OTHER_CAMPUS = "Other rooms";

// Places that appear in ZEUS but aren't rooms you'd go and sit in.
const NOT_A_ROOM = /^(\d+|couloir.*|jardin|hall.*|epiroof|salle de r[ée]union|distanciel|teams|.*campus cyber.*)$/i;

// A room booked fewer times than this in the whole file is probably a
// one-off location, not a real teaching room.
const MIN_BOOKINGS = 5;

function roomNames(location = "") {
  return location.split(",").map((name) => name.trim()).filter(Boolean);
}

function campusOf(room) {
  const rule = CAMPUS_RULES.find((r) => r.pattern.test(room));
  return rule ? rule.campus : OTHER_CAMPUS;
}

/**
 * Turns the whole-school events into { room: [[startMinute, endMinute], ...] }
 * for bookings between `from` and `until` (Dates). Times are whole minutes
 * since 1970, which keeps the saved copy small.
 */
function buildOccupancy(events, from, until) {
  const counts = new Map();
  for (const event of events) {
    for (const room of roomNames(event.location)) counts.set(room, (counts.get(room) || 0) + 1);
  }

  const occupancy = {};
  for (const event of events) {
    if (event.end <= from || event.start >= until) continue;
    for (const room of roomNames(event.location)) {
      if (NOT_A_ROOM.test(room) || counts.get(room) < MIN_BOOKINGS) continue;
      (occupancy[room] ||= []).push([toMinute(event.start), toMinute(event.end)]);
    }
  }
  // Rooms that are real but have nothing booked in the window are free throughout.
  for (const [room, count] of counts) {
    if (!NOT_A_ROOM.test(room) && count >= MIN_BOOKINGS) occupancy[room] ||= [];
  }
  for (const room of Object.keys(occupancy)) occupancy[room] = mergeIntervals(occupancy[room]);
  return occupancy;
}

function toMinute(date) {
  return Math.floor(date.getTime() / 60000);
}

/** Sorts bookings and joins overlapping ones, so the lookups below stay simple. */
function mergeIntervals(intervals) {
  const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [start, end] of sorted) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) last[1] = Math.max(last[1], end);
    else merged.push([start, end]);
  }
  return merged;
}

/**
 * Rooms with no class booked at `at` (a Date) for at least `minMinutes`.
 * Each result is { room, campus, freeUntil } where freeUntil is the Date of
 * the next booking, or null if nothing else is booked in the data.
 * Sorted so the rooms free the longest come first.
 */
function freeRoomsAt(occupancy, at, minMinutes = 30) {
  const now = toMinute(at);
  const results = [];
  for (const [room, bookings] of Object.entries(occupancy)) {
    if (bookings.some(([start, end]) => start <= now && now < end)) continue;
    const next = bookings.find(([start]) => start > now);
    if (next && next[0] - now < minMinutes) continue;
    results.push({ room, campus: campusOf(room), freeUntil: next ? new Date(next[0] * 60000) : null });
  }
  return results.sort((a, b) => {
    const aEnd = a.freeUntil ? a.freeUntil.getTime() : Infinity;
    const bEnd = b.freeUntil ? b.freeUntil.getTime() : Infinity;
    return bEnd - aEnd || a.room.localeCompare(b.room, "en", { numeric: true });
  });
}

// Lets Node (the tests) load this file too; browsers skip this block.
if (typeof module !== "undefined") {
  module.exports = { roomNames, campusOf, buildOccupancy, freeRoomsAt, mergeIntervals };
}
