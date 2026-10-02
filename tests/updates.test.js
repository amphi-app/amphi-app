const test = require("node:test");
const assert = require("node:assert/strict");
const { shortId, buildUpdates, applyUpdates, upcomingChanges } = require("../updates.js");

const at = (day, hhmm) => new Date(`2026-10-${day}T${hhmm}:00Z`);
const entry = (uid, summary, day, from, to, location) => ({ uid, summary, start: at(day, from), end: at(day, to), location });

// Made-up IDs in ZEUS's format (real ZEUS IDs stay out of the repository).
const U1 = "11111111-2222-4333-8444-555555555555";
const U2 = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const U3 = "12345678-90ab-4cde-8f01-23456789abcd";

const mine = [
  entry(U1, "Programmation", "05", "14:00", "16:00", "KB202"),
  entry(U2, "Algorithmique", "06", "08:00", "10:00", "KB601"),
  entry(U3, "Réseaux", "07", "10:00", "12:00", "KB403"),
];
const exportedAt = at("04", "20:00");

test("ZEUS IDs are shortened, other IDs kept as they are", () => {
  assert.equal(shortId(U1), "111111112222");
  assert.equal(shortId("sample-id"), "sample-id");
});

test("a moved class gets its new time; a room change its new room", () => {
  const school = [
    entry(U1, "Programmation", "05", "12:30", "14:30", "KB202"), // moved
    entry(U2, "Algorithmique", "06", "08:00", "10:00", "KB204"), // new room
    entry(U3, "Réseaux", "07", "10:00", "12:00", "KB403"),       // unchanged
  ];
  const { events, changes } = applyUpdates(mine, buildUpdates(school, exportedAt));
  assert.equal(events[0].start.toISOString(), at("05", "12:30").toISOString());
  assert.equal(events[1].location, "KB204");
  assert.equal(events[2], mine[2], "unchanged classes are left alone");
  assert.deepEqual(changes.map((c) => [c.type, c.summary]), [["moved", "Programmation"], ["room", "Algorithmique"]]);
  assert.equal(changes[0].before.start.toISOString(), at("05", "14:00").toISOString());
});

test("a class missing from the new data is flagged, not deleted, and only once", () => {
  const school = [entry(U1, "Programmation", "05", "14:00", "16:00", "KB202"), entry(U2, "Algorithmique", "06", "08:00", "10:00", "KB601")];
  const first = applyUpdates(mine, buildUpdates(school, exportedAt));
  assert.equal(first.events.length, 3);
  assert.equal(first.events[2].missing, true);
  assert.deepEqual(first.changes.map((c) => c.type), ["missing"]);
  const again = applyUpdates(first.events, buildUpdates(school, exportedAt));
  assert.equal(again.changes.length, 0, "no repeat alert for the same missing class");
});

test("classes outside the published weeks are never flagged missing", () => {
  const far = [entry(U1, "Programmation", "05", "14:00", "16:00", "KB202")];
  far[0].start = new Date("2027-03-01T08:00:00Z");
  far[0].end = new Date("2027-03-01T10:00:00Z");
  const { changes } = applyUpdates(far, buildUpdates([], exportedAt));
  assert.equal(changes.length, 0);
});

test("a class that reappears loses its missing flag", () => {
  const flagged = [{ ...mine[0], missing: true }];
  const { events } = applyUpdates(flagged, buildUpdates([mine[0]], exportedAt));
  assert.equal(events[0].missing, false);
});

test("only covered places are published, and classes elsewhere are never flagged missing", () => {
  const atKB = (location) => location === "" || location.startsWith("KB");
  const school = [entry(U1, "Programmation", "05", "14:00", "16:00", "KB202"), entry(U2, "Algorithmique", "06", "08:00", "10:00", "Paritalie")];
  const updates = buildUpdates(school, exportedAt, undefined, atKB);
  assert.deepEqual(updates.locations, ["KB202"], "the other site's name isn't published");
  assert.equal(Object.keys(updates.entries).length, 1);
  const myClasses = [mine[0], { ...mine[1], location: "Paritalie" }, mine[2]];
  const { changes } = applyUpdates(myClasses, updates, atKB);
  assert.deepEqual(changes.map((c) => [c.type, c.summary]), [["missing", "Réseaux"]],
    "the Paritalie class is left alone; the KB class that vanished is still flagged");
});

test("alerts only cover the next 7 days", () => {
  const change = (fromDay, toDay) => ({
    type: "moved",
    before: { start: at(fromDay, "10:00") },
    after: { start: at(toDay, "10:00") },
  });
  const now = at("05", "08:00");
  const kept = upcomingChanges([change("06", "06"), change("20", "21"), change("20", "09")], now);
  assert.equal(kept.length, 2, "next week, or moved into next week");
});
