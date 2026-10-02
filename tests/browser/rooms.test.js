// Rooms: rooms with no class booked, by campus and time, only when open.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup, showPage, texts, fixtures } = require("./helpers.js");
const { paris } = fixtures;

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

async function openRooms(options) {
  const opened = await openApp(app, options);
  await loadGroup(opened.page);
  await showPage(opened.page, 3);
  await opened.page.waitForSelector("#rooms-view:not([hidden])");
  return opened;
}
const rooms = (page) => texts(page, ".room-row .room-name");
const chips = (page) => texts(page, "#time-chips .chip-btn");

test("lists rooms with no class booked now, per campus, and remembers the campus", async () => {
  const { page, context, errors } = await openRooms(); // Wed 10:15
  assert.deepEqual(await texts(page, "#campus-chips .chip-btn"), ["Kremlin-Bicêtre", "Villejuif"]);
  assert.equal(await page.textContent("#rooms-updated"), "ZEUS data: updated today");
  const kb = await rooms(page);
  assert.ok(kb.includes("KB910") && kb.includes("KB920"), kb.join(", "));
  assert.match(await page.textContent("#rooms-subtitle"), /rooms with no class booked right now$/);

  await page.locator("#campus-chips .chip-btn", { hasText: "Villejuif" }).click();
  const vj = await rooms(page);
  assert.ok(vj.includes("A901"), vj.join(", "));
  assert.ok(!vj.includes("Salle machine 390"), "Atelier Python is on in it");

  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  await showPage(page, 3);
  assert.equal(await page.textContent('#campus-chips .chip-btn[aria-pressed="true"]'), "Villejuif");
  assert.deepEqual(errors, []);
  await context.close();
});

test("opening hours: Monday to Saturday 8:00–20:00, and later times only when open", async () => {
  const wed = "2026-10-07";
  const cases = [
    [paris(wed, 7, 59), false, ["Now", "08:59", "09:59", "10:59"]],
    [paris(wed, 8, 0), true, ["Now", "09:00", "10:00", "11:00"]],
    [paris(wed, 17, 30), true, ["Now", "18:30", "19:30"]],
    [paris(wed, 19, 59), true, ["Now"]],
    [paris(wed, 20, 0), false, ["Now"]],
    [paris("2026-10-10", 18, 0), true, ["Now", "19:00"]], // Saturday
    [paris("2026-10-11", 12, 0), false, ["Now"]],         // Sunday
    [paris("2026-10-12", 5, 0), false, ["Now", "08:00"]], // Monday early
  ];
  for (const [now, open, expectedChips] of cases) {
    const { page, context, errors } = await openRooms({ now });
    const label = now.toISOString();
    assert.deepEqual(await chips(page), expectedChips, label);
    if (open) {
      assert.ok((await rooms(page)).length > 0, label);
    } else {
      assert.equal((await rooms(page)).length, 0, label);
      assert.equal(await page.textContent("#rooms-subtitle"), "Campus likely closed right now", label);
      assert.match(await page.textContent("#rooms-list"), /Monday to Saturday, 8:00 to 20:00/);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("a later time lists rooms then; one that's no longer offered falls back to Now", async () => {
  const { page, context, errors } = await openRooms({ now: paris("2026-10-12", 5, 0) });
  await page.locator("#time-chips .chip-btn", { hasText: "08:00" }).click();
  assert.match(await page.textContent("#rooms-subtitle"), /at 08:00$/);
  assert.ok((await rooms(page)).length > 0);
  await context.close();

  const later = await openRooms({ now: paris("2026-10-07", 16, 30) });
  await later.page.locator("#time-chips .chip-btn", { hasText: "19:30" }).click();
  await later.page.clock.fastForward("01:00:00");
  await later.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await later.page.waitForTimeout(200);
  assert.match(await later.page.textContent("#rooms-subtitle"), /right now$/);
  assert.deepEqual(await chips(later.page), ["Now", "18:30", "19:30"]);
  assert.deepEqual([...errors, ...later.errors], []);
  await later.context.close();
});

test("if the room data can't load, it says so", async () => {
  const { page, context, errors } = await openApp(app, { weeklyData: false, context: {} });
  await context.route("**/data/rooms.json", (route) => route.fulfill({ status: 404, body: "Not found" }));
  await page.reload();
  await loadGroup(page);
  await showPage(page, 3);
  assert.match(await page.textContent("#rooms-status"), /Couldn't load room data/);
  assert.ok(await page.isHidden("#rooms-view"));
  await context.close();
});

test("works offline once opened", async () => {
  const { page, context } = await openApp(app, { serviceWorker: true, weeklyData: false, now: null });
  await loadGroup(page);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 }).catch(() => {});
  await page.reload();
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await context.setOffline(true);
  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  await showPage(page, 3);
  await page.waitForSelector("#rooms-view:not([hidden])");
  await context.close();
});
