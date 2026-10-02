// Timetable: day tabs, cards, badges, breaks, the red "now" line.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup, showPage, texts, fixtures } = require("./helpers.js");
const { paris, addDays, MONDAY } = fixtures;

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

/** Where the now line is, and where each card is, in px from the top of the list. */
const layout = (page) => page.evaluate(() => {
  const line = document.querySelector("#schedule .now-line");
  return {
    y: line ? line.offsetTop + 1 : null,
    time: line ? line.textContent : null,
    cards: [...document.querySelectorAll("#schedule .class-card")].map((c) => ({ top: c.offsetTop, bottom: c.offsetTop + c.offsetHeight })),
    covered: [...document.querySelectorAll(".timeline-time.is-covered")].map((l) => l.textContent),
  };
});

test("opens on today's classes, in Paris time, with tabs for the week", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await showPage(page, 1);

  assert.equal(await page.textContent("#day-title"), "Wednesday");
  assert.equal(await page.textContent("#week-label"), "5 Oct – 11 Oct");
  assert.deepEqual(await texts(page, ".day-tab-name"), ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"], "an empty Sunday is left out");
  assert.equal(await page.textContent(".day-tab.is-today .day-tab-name"), "Wed");
  assert.deepEqual(await texts(page, ".timeline-time"), ["09:00"]);
  assert.match(await page.textContent(".class-card"), /09:00 – 11:00/);

  await page.locator(".day-tab", { hasText: "Mon" }).click();
  assert.match(await page.textContent("#schedule"), /Break · 30 min/);
  assert.match(await page.textContent(".class-gloss >> nth=1"), /TD = Tutorial.*Réseaux = Networks/);

  await page.click("#next-week-btn");
  assert.equal(await page.textContent("#week-label"), "12 Oct – 18 Oct");
  await page.locator(".day-tab", { hasText: "Tue" }).click();
  const exam = page.locator(".class-card", { hasText: "Examen Algèbre" });
  assert.equal(await exam.locator(".class-badge").textContent(), "Exam");
  assert.match(await exam.textContent(), /A902, A903/);

  await page.click("#today-btn");
  assert.equal(await page.textContent("#day-title"), "Wednesday");
  assert.deepEqual(errors, []);
  await context.close();
});

test("now line: inside the class that's on, as far down as the class has got", async () => {
  const { page, context, errors } = await openApp(app); // Wed 10:15, Atelier Python 09:00–11:00
  await loadGroup(page);
  await showPage(page, 1);

  let now = await layout(page);
  const card = now.cards[0];
  assert.equal(now.time, "10:15");
  assert.ok(Math.abs(now.y - (card.top + 0.625 * (card.bottom - card.top))) <= 2, JSON.stringify(now));

  await page.clock.fastForward("00:30:00"); // 10:45 → 87.5%
  now = await layout(page);
  assert.equal(now.time, "10:45", "moves by itself");
  assert.ok(Math.abs(now.y - (card.top + 0.875 * (card.bottom - card.top))) <= 2, JSON.stringify(now));

  await page.locator(".day-tab", { hasText: "Thu" }).click();
  assert.equal((await layout(page)).y, null, "only on today");
  assert.deepEqual(errors, []);
  await context.close();
});

test("now line: in the gap between classes, at the top before them, below after them", async () => {
  const monday = addDays(MONDAY, 7); // 08:30–10:30 and 11:00–13:00
  for (const [hour, minute, where] of [[7, 0, "top"], [10, 45, "gap"], [11, 5, "second"], [19, 20, "bottom"]]) {
    const { page, context, errors } = await openApp(app, { now: paris(monday, hour, minute) });
    await loadGroup(page);
    await showPage(page, 1);
    await page.click("#today-btn");
    const { y, cards, covered } = await layout(page);
    const label = `${hour}:${minute} ${where} → ${JSON.stringify({ y, cards })}`;
    if (where === "top") assert.ok(y <= cards[0].top + 1, label);
    if (where === "gap") assert.ok(y > cards[0].bottom && y < cards[1].top, label);
    if (where === "second") {
      assert.ok(y > cards[1].top && y < cards[1].bottom, label);
      assert.deepEqual(covered, ["11:00"], "the start time under the red time is hidden");
    }
    if (where === "bottom") assert.ok(y > cards[1].bottom, label);
    assert.deepEqual(errors, []);
    await context.close();
  }
});

test("at midnight, the today outline moves to the next day", async () => {
  const { page, context, errors } = await openApp(app, { now: paris("2026-10-07", 23, 59) });
  await loadGroup(page);
  await showPage(page, 1);
  await page.clock.fastForward("00:01:00");
  assert.equal(await page.textContent(".day-tab.is-today .day-tab-name"), "Thu");
  assert.deepEqual(errors, []);
  await context.close();
});
