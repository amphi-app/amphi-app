// Setup: loading files, hiding courses, Edit, the sample, Start over.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, chooseFile, loadGroup, saved, texts, fixtures } = require("./helpers.js");

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const hiddenCourses = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("zeus-schedule-hidden-courses")));
const homeCourses = (page) => texts(page, "#home-courses .course-title");

test("a group file goes straight to the timetable; hidden courses stay hidden; new ZEUS courses appear", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  assert.ok(await page.isHidden("#course-picker"));
  const all = (await saved(page)).events.length;

  await page.click("#edit-courses-btn");
  assert.match(await page.textContent("#picker-intro"), /^Untick/);
  assert.equal(await page.$$eval(".course-row input:not(:checked)", (b) => b.length), 0, "everything ticked");
  await page.fill("#course-search", "Anglais");
  await page.locator(".course-row:visible input").uncheck();
  await page.fill("#course-search", "");
  await page.click("#show-schedule-btn");
  assert.ok(!(await homeCourses(page)).includes("Anglais technique"));
  assert.deepEqual(await hiddenCourses(page), ["Anglais technique"], "only what you hid is remembered");
  assert.equal((await saved(page)).events.length, all - 10);

  // A week later ZEUS has added a course to the group.
  await page.click("#settings-btn");
  await chooseFile(page, fixtures.groupV2ICS());
  await page.waitForSelector("#week-view:not([hidden])");
  const courses = await homeCourses(page);
  assert.ok(courses.includes(fixtures.newCourseTitle), "new course shows up by itself");
  assert.ok(!courses.includes("Anglais technique"), "hidden course stays hidden");
  assert.deepEqual(errors, []);
  await context.close();
});

test("a whole-school file opens the course list, nothing ticked, with advice to narrow it in ZEUS", async () => {
  const { page, context, errors } = await openApp(app);
  await chooseFile(page, fixtures.schoolICS());
  await page.waitForSelector(".course-row");
  assert.ok(await page.isHidden("#week-view"));
  assert.equal(await page.$$eval(".course-row input:checked", (b) => b.length), 0);
  assert.match(await page.textContent("#picker-intro"), /narrow to your group/);

  await page.fill("#course-search", "Physique imaginaire");
  await page.locator(".course-row:visible input").check();
  await page.click("#show-schedule-btn");
  await page.waitForSelector("#week-view:not([hidden])");
  assert.ok((await saved(page)).events.every((e) => e.summary === "Physique imaginaire"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("Edit after reopening: Back works, and choosing the file opens the course list", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");

  await page.click("#edit-courses-btn");
  assert.ok(await page.isVisible("#upload-section"));
  assert.ok(await page.isVisible("#back-btn"));
  assert.match(await page.textContent("#error-message"), /choose your ZEUS file again/);
  await page.click("#back-btn");
  assert.ok(await page.isVisible("#week-view"));

  await page.click("#edit-courses-btn");
  await chooseFile(page, fixtures.groupICS());
  await page.waitForSelector("#course-picker:not([hidden])");
  assert.ok(await page.isHidden("#week-view"));
  assert.ok(await page.isHidden("#upload-section"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("choosing the same file twice in a row loads it both times", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await page.click("#settings-btn");
  await chooseFile(page, fixtures.groupICS());
  await page.waitForSelector("#week-view:not([hidden])");
  assert.ok(await page.isHidden("#upload-section"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("a file that isn't a timetable gets a clear message", async () => {
  const { page, context, errors } = await openApp(app);
  await chooseFile(page, "hello", "notes.ics");
  await page.waitForSelector("#error-message:not([hidden])");
  assert.match(await page.textContent("#error-message"), /didn't contain any recognizable events/);
  assert.ok(await page.isHidden("#week-view"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("the sample shows a full week around today and never replaces your own timetable", async () => {
  const { page, context, errors } = await openApp(app);
  await page.click("#load-sample-btn");
  await page.waitForSelector("#week-view:not([hidden])");
  assert.equal((await homeCourses(page)).length, 4);
  assert.ok((await texts(page, "#home-coming-up .course-title")).includes("Examen Mathematiques"));
  assert.ok((await texts(page, "#home-courses .course-next")).every((t) => t !== "No more sessions"));

  await page.click("#settings-btn");
  await chooseFile(page, fixtures.groupICS());
  await page.waitForSelector("#week-view:not([hidden])");
  const mine = (await saved(page)).events.length;
  await page.click("#settings-btn");
  await page.click("#load-sample-btn");
  await page.waitForSelector("#week-view:not([hidden])");
  assert.equal((await saved(page)).events.length, mine, "sample not saved over yours");
  assert.deepEqual(errors, []);
  await context.close();
});

test("Start over: hidden at first, cancel keeps everything, confirm wipes everything", async () => {
  const { page, context, errors } = await openApp(app);
  assert.ok(await page.isHidden("#start-over-btn"));
  await loadGroup(page);
  await page.evaluate(() => localStorage.setItem("zeus-profile-login", "jean.dupont"));
  const keys = () => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("zeus-")));
  const before = (await keys()).length;

  await page.click("#settings-btn");
  assert.ok(await page.isVisible("#start-over-btn"));
  page.once("dialog", (dialog) => dialog.dismiss());
  await page.click("#start-over-btn");
  assert.equal((await keys()).length, before);

  page.once("dialog", (dialog) => dialog.accept());
  await Promise.all([page.waitForEvent("load"), page.click("#start-over-btn")]);
  assert.deepEqual(await keys(), []);
  assert.ok(await page.isVisible("#upload-section"));
  assert.ok(await page.isHidden("#week-view"));
  assert.deepEqual(errors, []);
  await context.close();
});
