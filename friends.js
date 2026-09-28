/*
  friends.js — sharing your timetable with a friend through a link, and
  working out where a friend's timetable says they are.

  A share link carries the class names and times for the rest of the
  semester (no rooms), packed after the "#" of the address. Browsers never
  send that part to any server, so it goes from one phone to another
  through whatever app the link was sent with, and nowhere else.
  No page code here, so it can be tested (see tests/friends.test.js).
*/

const SHARE_WEEKS = 16;
const MAX_NAME_LENGTH = 60;
const MAX_ENTRIES = 3000;
const MIN_FREE_MINUTES = 30;

// ---------------------------------------------------------------------------
// Packing a timetable into a link and back
// ---------------------------------------------------------------------------

/** { v, n: name, s: sharedAt, c: [class names], e: [[class, start, minutes]] }
 *  Times are whole minutes since 1970; each class name is stored once. */
function packTimetable(name, events, now = new Date(), weeks = SHARE_WEEKS) {
  const toMinute = (date) => Math.floor(date.getTime() / 60000);
  const until = now.getTime() + weeks * 7 * 86400000;
  const names = [];
  const index = new Map();
  const entries = [];
  for (const event of [...events].sort((a, b) => a.start - b.start)) {
    if (event.end <= now || event.start.getTime() > until) continue;
    const title = event.summary || "Class";
    if (!index.has(title)) {
      index.set(title, names.length);
      names.push(title);
    }
    entries.push([index.get(title), toMinute(event.start), toMinute(event.end) - toMinute(event.start)]);
  }
  return { v: 1, n: name, s: toMinute(now), c: names, e: entries };
}

/** Reads a packed timetable back. Anyone can make a link, so everything is
 *  checked; anything malformed throws instead of half-loading. */
function unpackTimetable(data) {
  const isInt = (x) => Number.isInteger(x);
  if (!data || data.v !== 1 || typeof data.n !== "string" || !isInt(data.s) ||
      !Array.isArray(data.c) || !Array.isArray(data.e) || data.e.length > MAX_ENTRIES ||
      !data.c.every((name) => typeof name === "string")) {
    throw new Error("Not an Amphi share link");
  }
  const events = data.e.map((entry) => {
    if (!Array.isArray(entry) || entry.length !== 3 || !entry.every(isInt)) {
      throw new Error("Not an Amphi share link");
    }
    const [classIndex, start, minutes] = entry;
    if (classIndex < 0 || classIndex >= data.c.length || minutes < 0) {
      throw new Error("Not an Amphi share link");
    }
    return {
      summary: data.c[classIndex],
      start: new Date(start * 60000),
      end: new Date((start + minutes) * 60000),
    };
  });
  const name = data.n.trim().slice(0, MAX_NAME_LENGTH);
  if (!name) throw new Error("Not an Amphi share link");
  return { name, sharedAt: new Date(data.s * 60000), events };
}

// Links are compressed ("z…") where the browser supports it, which makes them
// about a quarter of the size; otherwise plain ("j…").
async function encodeShare(packed) {
  const bytes = new TextEncoder().encode(JSON.stringify(packed));
  if (typeof CompressionStream === "undefined") return "j" + toBase64Url(bytes);
  const compressed = await new Response(
    new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))
  ).arrayBuffer();
  return "z" + toBase64Url(new Uint8Array(compressed));
}

async function decodeShare(code) {
  const kind = code[0];
  const bytes = fromBase64Url(code.slice(1));
  let json;
  if (kind === "z") {
    const inflated = await new Response(
      new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
    ).arrayBuffer();
    json = new TextDecoder().decode(inflated);
  } else if (kind === "j") {
    json = new TextDecoder().decode(bytes);
  } else {
    throw new Error("Not an Amphi share link");
  }
  return unpackTimetable(JSON.parse(json));
}

function toBase64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text) {
  const binary = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

/** Finds the share code in a pasted link (or a bare code). */
function shareCodeFrom(text) {
  const match = String(text).match(/#friend=([A-Za-z0-9_-]+)/);
  return match ? match[1] : /^[zj][A-Za-z0-9_-]+$/.test(text.trim()) ? text.trim() : null;
}

// ---------------------------------------------------------------------------
// Where a friend's timetable says they are
// ---------------------------------------------------------------------------

/**
 * { state: "class", event } while a class is on;
 * { state: "free", until } when free and something is on later today;
 * { state: "done" } when nothing else is on today.
 * `endOfToday` is the Date when today ends (in Paris time, from the app).
 */
function statusAt(events, now, endOfToday) {
  const current = events.find((event) => event.start <= now && now < event.end);
  if (current) return { state: "class", event: current };
  const next = events
    .filter((event) => event.start > now && event.start < endOfToday)
    .sort((a, b) => a.start - b.start)[0];
  return next ? { state: "free", until: next.start } : { state: "done" };
}

/**
 * The first stretch of at least MIN_FREE_MINUTES between `from` and `until`
 * when neither timetable has anything on, or null.
 */
function firstFreeTogether(myEvents, theirEvents, from, until) {
  const busy = [...myEvents, ...theirEvents]
    .filter((event) => event.end > from && event.start < until)
    .sort((a, b) => a.start - b.start);
  let cursor = from;
  for (const event of busy) {
    if (event.start - cursor >= MIN_FREE_MINUTES * 60000) return { start: cursor, end: event.start };
    if (event.end > cursor) cursor = event.end;
  }
  return until - cursor >= MIN_FREE_MINUTES * 60000 ? { start: cursor, end: until } : null;
}

// Lets Node (the tests) load this file too; browsers skip this block.
if (typeof module !== "undefined") {
  module.exports = { packTimetable, unpackTimetable, encodeShare, decodeShare, shareCodeFrom, statusAt, firstFreeTogether };
}
