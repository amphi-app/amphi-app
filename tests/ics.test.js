// Run with: npm test   (uses Node's built-in test runner, nothing to install)
const test = require("node:test");
const assert = require("node:assert/strict");
const { parseICS, buildICS, foldLine, unescapeICSText } = require("../ics.js");

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
    "UID:abc-123",
    `DTSTART:${YEAR}0922T063000Z`,
    `DTEND:${YEAR}0922T083000Z`,
    "SUMMARY: Anglais général 1",
    "LOCATION:323 - Salle Machine\\, 322 - Salle Machine",
    "DESCRIPTION:Ligne 1\\nLigne 2",
  ])));

  assert.equal(parsed.uid, "abc-123");
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

test("events without a UID get a stable one", () => {
  const text = calendar(event([`DTSTART:${YEAR}0922T063000Z`, "SUMMARY:Algorithmique"]));
  assert.ok(parseICS(text)[0].uid);
  assert.equal(parseICS(text)[0].uid, parseICS(text)[0].uid);
});

test("a literal backslash followed by n is not turned into a line break", () => {
  assert.equal(unescapeICSText("C:\\\\new"), "C:\\new");
});

test("exported calendars read back identically, special characters included", () => {
  const original = [{
    uid: "abc-123",
    summary: "Examen; maths, partie 1 \\ bis",
    location: "Amphi A, Amphi B",
    description: "2H EXAMEN\nApportez une calculatrice. ".repeat(4).trim(),
    start: new Date(Date.UTC(YEAR, 8, 25, 7, 0)),
    end: new Date(Date.UTC(YEAR, 8, 25, 9, 0)),
  }];

  const [roundTripped] = parseICS(buildICS(original));
  assert.deepEqual(roundTripped, original[0]);
});

test("exported lines never exceed 75 bytes, even with accented letters", () => {
  const folded = foldLine("DESCRIPTION:" + "é".repeat(100));
  for (const line of folded.split("\r\n")) {
    assert.ok(Buffer.byteLength(line, "utf8") <= 75, `line too long: ${line}`);
  }
  assert.equal(folded.replace(/\r\n /g, ""), "DESCRIPTION:" + "é".repeat(100));
});
