// Home: profile, your courses, coming up, glossary, tabs and swiping.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup, showPage, texts, fixtures } = require("./helpers.js");

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const currentTab = (page) => page.getAttribute(".nav-btn[aria-current=page]", "data-page");

test("opens on Home with your courses and what's coming up", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);

  assert.equal(await currentTab(page), "0");
  // 10:15 in Paris, though the phone is set to India (13:45 there).
  assert.equal(await page.textContent("#greeting"), "Good morning");

  const courses = await texts(page, "#home-courses .course-title");
  assert.deepEqual([...courses].sort(), [...fixtures.COURSE_TITLES].sort(), "exams, events and days off stay out");
  assert.equal(courses[0], "Atelier Python", "the class that's on now comes first");
  assert.equal(await page.textContent("#home-courses .course-next"), "Now · until 11:00 · Salle machine 390");

  const comingUp = await page.$$eval("#home-coming-up .course-card", (cards) =>
    cards.map((c) => `${c.querySelector(".kind-badge").textContent}: ${c.querySelector(".course-title").textContent}`));
  assert.deepEqual(comingUp, ["Event: Conférence Sécurité", "Exam: Examen Algèbre", "Event: Semaine d'intégration"]);

  assert.deepEqual(errors, []);
  await context.close();
});

test("French words get an English line, and the glossary lists them A to Z", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);

  const gloss = await texts(page, ".course-gloss");
  assert.ok(gloss.includes("Examen = Exam"), gloss.join(" | "));
  assert.ok(gloss.includes("Atelier = Workshop"), gloss.join(" | "));
  assert.ok(gloss.some((line) => line.startsWith("TD = Tutorial") && line.includes("Réseaux = Networks")), gloss.join(" | "));

  assert.equal(await page.$eval("#glossary", (d) => d.open), false, "closed until tapped");
  const terms = await texts(page, "#glossary-list dt");
  assert.ok(terms.length > 30 && terms.includes("Rattrapage") && terms.includes("TD"));
  assert.deepEqual(terms, [...terms].sort((a, b) => a.localeCompare(b, "fr")));

  const contact = page.locator("#home-page .contact-line");
  assert.match(await contact.textContent(), /Unofficial student project · Contact us: dev\.vashisth@epita\.fr/);
  assert.equal(await contact.locator("a").getAttribute("href"), "mailto:dev.vashisth@epita.fr");

  assert.deepEqual(errors, []);
  await context.close();
});

test("profile: name and initials from the EPITA login, remembered", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);

  assert.match(await page.textContent("#profile-name"), /Tap to add/);
  page.once("dialog", (dialog) => dialog.accept("jean-luc.dupont2"));
  await page.click("#profile-btn");
  assert.equal(await page.textContent("#profile-name"), "Jean-Luc Dupont");
  assert.equal(await page.textContent("#avatar"), "JD");

  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  assert.equal(await page.textContent("#profile-name"), "Jean-Luc Dupont");

  assert.deepEqual(errors, []);
  await context.close();
});

test("tabs, swiping, tapping a course, and settings with a way back", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);

  await page.$eval("#pager", (p) => p.scrollTo({ left: p.clientWidth, behavior: "instant" }));
  await page.waitForTimeout(200);
  assert.equal(await currentTab(page), "1", "swipe left: timetable");
  await page.$eval("#pager", (p) => p.scrollTo({ left: 0, behavior: "instant" }));
  await page.waitForTimeout(200);
  assert.equal(await currentTab(page), "0", "swipe right: Home");

  assert.deepEqual(await texts(page, ".nav-btn span"), ["Home", "Timetable", "Friends", "Rooms"]);

  await page.locator("#home-courses .course-card", { hasText: "Projet Robotique" }).click();
  await showPage(page, 1);
  assert.equal(await page.textContent("#day-title"), "Thursday");
  assert.ok((await texts(page, ".class-title")).includes("Projet Robotique"));

  await page.click("#settings-btn");
  assert.ok(await page.isVisible("#upload-section"));
  assert.ok(await page.isVisible("#back-btn"));
  await page.click("#back-btn");
  assert.ok(await page.isVisible("#week-view"));
  assert.ok(await page.isHidden("#upload-section"));

  assert.deepEqual(errors, []);
  await context.close();
});
