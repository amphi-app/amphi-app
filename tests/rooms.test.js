const test = require("node:test");
const assert = require("node:assert/strict");
const { roomNames, campusOf, buildOccupancy, freeRoomsAt, mergeIntervals } = require("../rooms.js");

const at = (hhmm) => new Date(`2026-10-05T${hhmm}:00Z`);
const booking = (location, from, to) => ({ summary: "Cours", location, start: at(from), end: at(to) });

// Each room needs at least 5 bookings in the file to count as a real room,
// so the fixture repeats a far-away booking to make every room "real".
function schoolWith(bookings) {
  const filler = [];
  for (const room of ["KB202", "KB601", "A202", "Salle machine 302"]) {
    for (let i = 0; i < 5; i++) filler.push({ summary: "Old", location: room, start: new Date(Date.UTC(2026, 0, 5 + i, 8)), end: new Date(Date.UTC(2026, 0, 5 + i, 10)) });
  }
  return [...filler, ...bookings];
}

const window = [at("00:00"), new Date("2026-12-31T00:00:00Z")];

test("splits a ZEUS location into rooms", () => {
  assert.deepEqual(roomNames("KB002 (amphi 2), KB003 (amphi 3)"), ["KB002 (amphi 2)", "KB003 (amphi 3)"]);
  assert.deepEqual(roomNames(""), []);
});

test("knows Kremlin-Bicêtre rooms from their name", () => {
  for (const room of ["KB202", "KB001 (amphi 1)", "SM Cisco - KB105", "303 (KB3)"]) {
    assert.equal(campusOf(room), "Kremlin-Bicêtre", room);
  }
});

test("knows Villejuif rooms from their name", () => {
  for (const room of ["A202", "A105 B", "B01", "B106", "C04 (Amphithéâtre)", "C04A", "Salle machine 302", "Salle machine 311"]) {
    assert.equal(campusOf(room), "Villejuif", room);
  }
});

test("rooms nobody has placed yet stay under Other rooms", () => {
  for (const room of ["Alphago", "Amphi Conway", "321 - Salle Machine", "SM-1", "Turing", "Paritalie - 3ème Apprentissage 1"]) {
    assert.equal(campusOf(room), "Other rooms", room);
  }
});

test("rooms on no known campus are left out of the list", () => {
  const events = schoolWith([]);
  for (let i = 0; i < 6; i++) events.push({ summary: "x", location: "Turing", start: at("08:00"), end: at("09:00") });
  assert.ok(!("Turing" in buildOccupancy(events, ...window)));
});

test("joins overlapping bookings", () => {
  assert.deepEqual(mergeIntervals([[10, 20], [5, 12], [30, 40]]), [[5, 20], [30, 40]]);
});

test("a room in use now is not listed; others show when they're next booked", () => {
  const occupancy = buildOccupancy(schoolWith([
    booking("KB202", "08:00", "10:00"),
    booking("KB601", "11:00", "12:00"),
  ]), ...window);
  const free = freeRoomsAt(occupancy, at("09:00"));
  const rooms = free.map((r) => r.room);
  assert.ok(!rooms.includes("KB202"), "KB202 is in use");
  const kb601 = free.find((r) => r.room === "KB601");
  assert.equal(kb601.freeUntil.toISOString(), at("11:00").toISOString());
});

test("rooms free for less than the minimum are left out", () => {
  const occupancy = buildOccupancy(schoolWith([booking("KB601", "09:20", "10:00")]), ...window);
  assert.ok(!freeRoomsAt(occupancy, at("09:00"), 30).some((r) => r.room === "KB601"));
  assert.ok(freeRoomsAt(occupancy, at("09:00"), 15).some((r) => r.room === "KB601"));
});

test("longest-free rooms come first; nothing booked at all comes first of all", () => {
  const occupancy = buildOccupancy(schoolWith([
    booking("KB202", "10:00", "11:00"),
    booking("KB601", "15:00", "16:00"),
  ]), ...window);
  const order = freeRoomsAt(occupancy, at("09:00")).map((r) => r.room);
  assert.ok(order.indexOf("A202") < order.indexOf("KB601"));
  assert.ok(order.indexOf("KB601") < order.indexOf("KB202"));
});

test("corridors, gardens, remote sessions and rarely used places are not rooms", () => {
  const events = schoolWith([]);
  for (let i = 0; i < 6; i++) {
    for (const place of ["Couloir 1", "Jardin", "0", "Distanciel", "1 Day (Campus Cyber)"]) {
      events.push({ summary: "x", location: place, start: at("08:00"), end: at("09:00") });
    }
  }
  events.push(booking("One-off place", "08:00", "09:00"));
  const rooms = Object.keys(buildOccupancy(events, ...window));
  assert.deepEqual(rooms.sort(), ["A202", "KB202", "KB601", "Salle machine 302"]);
});

test("servedLocation: Kremlin-Bicêtre / Villejuif rooms, or no room, and nothing elsewhere", () => {
  const { servedLocation } = require("../rooms.js");
  for (const yes of ["", "KB202", "A202, A207", "303 (KB3)", "KB401 (amphi 401), EpiRoof", "SM Cisco - KB105, 0, Salle machine 311"]) {
    assert.equal(servedLocation(yes), true, yes);
  }
  for (const no of ["V102", "331 - Majeure IF", "Paritalie - 3ème Apprentissage 1", "1 Day (Campus Cyber)", "Jardin", "SM-3, Labo Majeure", "KB202, Turing"]) {
    assert.equal(servedLocation(no), false, no);
  }
});
