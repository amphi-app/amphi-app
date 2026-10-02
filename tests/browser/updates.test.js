// Weekly data: classes ZEUS moved get corrected, and Home lists the changes.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup, showPage, saved, texts, fixtures } = require("./helpers.js");

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

/** Pretends your timetable file was loaded `days` before NOW. */
async function loadedDaysAgo(page, days) {
  await page.evaluate((iso) => {
    const data = JSON.parse(localStorage.getItem("zeus-schedule-my-events"));
    data.savedAt = iso;
    localStorage.setItem("zeus-schedule-my-events", JSON.stringify(data));
  }, new Date(fixtures.NOW.getTime() - days * 86400000).toISOString());
  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  await page.waitForTimeout(300);
}

test("a file newer than the weekly data is left alone", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await page.waitForTimeout(300);
  assert.ok(await page.isHidden("#changes-card"));
  assert.ok((await saved(page)).events.every((e) => !e.changed));
  assert.deepEqual(errors, []);
  await context.close();
});

test("older timetables are corrected, with an alert for each change in the next 7 days", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await loadedDaysAgo(page, 3);

  assert.ok(await page.isVisible("#changes-card"));
  const rows = (await texts(page, ".change-row")).map((r) => r.replace(/\s+/g, " "));
  assert.equal(rows.length, 3, rows.join(" | "));
  assert.match(rows[0], /^New room Projet Robotique .*14:00 · A901 → A905$/);
  assert.match(rows[1], /^Check Anglais technique .*10:00 · no longer in ZEUS/);
  assert.match(rows[2], /^Moved TD Réseaux .*11:00 → 14:00$/);
  assert.ok(!rows.some((r) => r.includes("Cours délocalisé")), "a class at another site isn't in the data, and isn't flagged");
  assert.equal((await saved(page)).savedAt, new Date(fixtures.NOW.getTime() - 2 * 3600000).toISOString(), "now dated from the weekly data");

  await page.locator(".change-row", { hasText: "TD Réseaux" }).click();
  await showPage(page, 1);
  assert.equal(await page.textContent("#day-title"), "Monday");
  const moved = page.locator(".class-card", { hasText: "TD Réseaux" });
  assert.equal(await moved.locator(".change-badge").textContent(), "Moved");
  assert.match(await moved.textContent(), /14:00 – 16:00/);

  await showPage(page, 0);
  await page.click("#dismiss-changes-btn");
  assert.ok(await page.isHidden("#changes-card"));
  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  await page.waitForTimeout(300);
  assert.ok(await page.isHidden("#changes-card"), "the same weekly data isn't applied twice");
  assert.deepEqual(errors, []);
  await context.close();
});

test("timetables saved before Amphi kept ZEUS IDs get a one-time hint", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await page.evaluate(() => {
    const data = JSON.parse(localStorage.getItem("zeus-schedule-my-events"));
    data.events.forEach((e) => delete e.uid);
    localStorage.setItem("zeus-schedule-my-events", JSON.stringify(data));
  });
  await loadedDaysAgo(page, 3);
  assert.match(await page.textContent("#error-message"), /Load your ZEUS file once more/);
  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  await page.waitForTimeout(300);
  assert.ok(await page.isHidden("#error-message"), "only once");
  assert.deepEqual(errors, []);
  await context.close();
});
