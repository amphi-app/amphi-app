const test = require("node:test");
const assert = require("node:assert/strict");
const {
  packTimetable, unpackTimetable, encodeShare, decodeShare, shareCodeFrom, statusAt, firstFreeTogether,
} = require("../friends.js");

const at = (day, hhmm) => new Date(`2026-10-${day}T${hhmm}:00Z`);
const cls = (summary, day, from, to) => ({ summary, start: at(day, from), end: at(day, to), location: "KB202" });

const timetable = [
  cls("Algorithmique", "05", "08:00", "10:00"),
  cls("Probabilités discrètes", "05", "12:00", "13:30"),
  cls("Algorithmique", "06", "08:00", "10:00"),
  cls("Old class", "01", "08:00", "10:00"), // already over: not shared
];

test("a shared timetable reads back the same, without rooms", async () => {
  const code = await encodeShare(packTimetable("Elliot", timetable, at("05", "07:00")));
  const friend = await decodeShare(code);
  assert.equal(friend.name, "Elliot");
  assert.equal(friend.sharedAt.toISOString(), at("05", "07:00").toISOString());
  assert.deepEqual(friend.events.map((e) => [e.summary, e.start.toISOString(), e.end.toISOString()]), [
    ["Algorithmique", at("05", "08:00").toISOString(), at("05", "10:00").toISOString()],
    ["Probabilités discrètes", at("05", "12:00").toISOString(), at("05", "13:30").toISOString()],
    ["Algorithmique", at("06", "08:00").toISOString(), at("06", "10:00").toISOString()],
  ]);
  assert.ok(friend.events.every((e) => !("location" in e)), "rooms are never shared");
});

test("a semester of classes still makes a link a phone can send", async () => {
  const many = [];
  for (let week = 0; week < 16; week++) {
    for (let day = 0; day < 5; day++) {
      for (const [from, to] of [["08:00", "10:00"], ["10:15", "12:15"], ["13:30", "15:30"], ["15:45", "17:45"]]) {
        const start = new Date(Date.UTC(2026, 9, 5 + week * 7 + day, ...from.split(":").map(Number)));
        const end = new Date(Date.UTC(2026, 9, 5 + week * 7 + day, ...to.split(":").map(Number)));
        many.push({ summary: `Course ${(day * 4 + week) % 18}`, start, end });
      }
    }
  }
  const code = await encodeShare(packTimetable("Elliot", many, new Date(Date.UTC(2026, 9, 5))));
  assert.ok(code.length < 6000, `link code is ${code.length} characters`);
  assert.equal((await decodeShare(code)).events.length, many.length);
});

test("finds the code in a pasted link or on its own", () => {
  assert.equal(shareCodeFrom("https://amphi-app.github.io/#friend=zAbc_-9"), "zAbc_-9");
  assert.equal(shareCodeFrom("  zAbc_-9 "), "zAbc_-9");
  assert.equal(shareCodeFrom("hello"), null);
});

test("broken or made-up links are refused", async () => {
  await assert.rejects(decodeShare("zNotReallyData"));
  await assert.rejects(decodeShare("x123"));
  assert.throws(() => unpackTimetable({ v: 1, n: "Eve", s: 1, c: ["A"], e: [[5, 1, 1]] }));
  assert.throws(() => unpackTimetable({ v: 1, n: "   ", s: 1, c: [], e: [] }));
  assert.throws(() => unpackTimetable({ v: 2, n: "Eve", s: 1, c: [], e: [] }));
});

test("status: in class, free until the next class, or done for the day", () => {
  const endOfDay = at("05", "22:00");
  assert.equal(statusAt(timetable, at("05", "09:00"), endOfDay).event.summary, "Algorithmique");
  const free = statusAt(timetable, at("05", "10:30"), endOfDay);
  assert.equal(free.state, "free");
  assert.equal(free.until.toISOString(), at("05", "12:00").toISOString());
  assert.equal(statusAt(timetable, at("05", "14:00"), endOfDay).state, "done");
});

test("free together: the first gap where neither has a class", () => {
  const mine = [cls("Mine", "05", "10:00", "12:30")];
  const slot = firstFreeTogether(mine, timetable, at("05", "08:00"), at("05", "18:00"));
  assert.equal(slot.start.toISOString(), at("05", "13:30").toISOString());
  assert.equal(slot.end.toISOString(), at("05", "18:00").toISOString());
});

test("free together ignores gaps shorter than 30 minutes", () => {
  const mine = [cls("Mine", "05", "10:00", "11:45"), cls("Mine", "05", "12:00", "18:00")];
  assert.equal(firstFreeTogether(mine, timetable, at("05", "10:00"), at("05", "18:00")), null);
});
