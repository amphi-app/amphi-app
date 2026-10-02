// Run with: npm test   (uses Node's built-in test runner, nothing to install)
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseICS, unescapeICSText } = require("../ics.js");

// Dates are built from the current year so the "plausible year" filter in
// ics.js never makes these tests start failing in a future year.
const YEAR = new Date().getFullYear();

function calendar(...eventBlocks) {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", ...eventBlocks.flat(), "END:VCALENDAR"].join("\r\n");
}

function event(fields) {
  return ["BEGIN:VEVENT", ...fields, "END:VEVENT"];
}

test("parses a ZEUS-style event: UTC times, trimmed title, escaped text", () => {
  const [parsed] = parseICS(calendar(event([
    "UID:11111111-2222-4333-8444-555555555555",
    `DTSTART:${YEAR}0922T063000Z`,
    `DTEND:${YEAR}0922T083000Z`,
    "SUMMARY: Anglais général 1",
    "LOCATION:323 - Salle Machine\\, 322 - Salle Machine",
    "DESCRIPTION:Ligne 1\\nLigne 2",
  ])));

  assert.equal(parsed.uid, "11111111-2222-4333-8444-555555555555");
  assert.equal(parsed.summary, "Anglais général 1");
  assert.equal(parsed.location, "323 - Salle Machine, 322 - Salle Machine");
  assert.equal(parsed.description, "Ligne 1\nLigne 2");
  assert.equal(parsed.start.toISOString(), `${YEAR}-09-22T06:30:00.000Z`);
  assert.equal(parsed.end.toISOString(), `${YEAR}-09-22T08:30:00.000Z`);
});

test("joins folded (wrapped) lines back together", () => {
  const [parsed] = parseICS(calendar(event([
    `DTSTART:${YEAR}0922T063000Z`,
    "SUMMARY:Initiation",
    "  à la crypto",
  ])));
  assert.equal(parsed.summary, "Initiation à la crypto");
});

test("drops events with nonsense years, like ZEUS's year-3036 placeholder", () => {
  const events = parseICS(calendar(
    event(["DTSTART:30360320T080000Z", "SUMMARY:Conception de compilateurs"]),
    event([`DTSTART:${YEAR}0922T063000Z`, "SUMMARY:Algorithmique"]),
  ));
  assert.deepEqual(events.map((e) => e.summary), ["Algorithmique"]);
});

test("an event without an end time ends when it starts", () => {
  const [parsed] = parseICS(calendar(event([`DTSTART:${YEAR}0922T063000Z`, "SUMMARY:Férié"])));
  assert.equal(parsed.end.getTime(), parsed.start.getTime());
});

test("a literal backslash followed by n is not turned into a line break", () => {
  assert.equal(unescapeICSText("C:\\\\new"), "C:\\new");
});
