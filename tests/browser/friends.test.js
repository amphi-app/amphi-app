// Friends: sharing your timetable by link, and seeing where a friend is.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup, showPage, texts, fixtures } = require("./helpers.js");
const { packTimetable, encodeShare } = require("../../friends.js");

/** The message shown after a tap (decoding a link takes a moment). */
async function message(page) {
  await page.waitForSelector("#error-message:not([hidden])");
  const text = await page.textContent("#error-message");
  await page.evaluate(() => showError(""));
  return text;
}

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

async function shareLink() {
  const sam = await openApp(app);
  await sam.context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: app.base.replace(/\/$/, "") });
  await loadGroup(sam.page, fixtures.friendICS());
  await showPage(sam.page, 2);
  assert.match(await sam.page.textContent("#friends-list"), /Share your timetable/);
  sam.page.once("dialog", (dialog) => dialog.accept("sam.lee"));
  await sam.page.bringToFront(); // copying to the clipboard needs the page in front
  await sam.page.click("#share-btn");
  await sam.page.waitForSelector("#error-message:not([hidden])");
  assert.match(await sam.page.textContent("#error-message"), /Link copied/);
  const link = await sam.page.evaluate(() => navigator.clipboard.readText());
  assert.ok(link.startsWith(`${app.base}index.html#friend=z`), link.slice(0, 60));
  assert.deepEqual(sam.errors, []);
  await sam.context.close();
  return link;
}

test("a friend's link adds them, with where their timetable says they are", async () => {
  const link = await shareLink();
  const { page, context, errors } = await openApp(app, {
    hash: link.slice(link.indexOf("#")),
    onDialog: (dialog) => dialog.accept(),
  });
  await page.waitForSelector("#error-message:not([hidden])");
  assert.match(await page.textContent("#error-message"), /Set up Amphi below/);
  assert.equal(await page.evaluate(() => location.hash), "", "code taken out of the address");

  await loadGroup(page);
  await showPage(page, 2);
  const row = (await texts(page, ".friend-row"))[0].replace(/\s+/g, " ");
  assert.match(row, /Sam Lee/);
  assert.match(row, /In class · Compilation · until 12:00/);
  assert.match(row, /Both free today 12:00–20:00/);
  assert.match(row, /Shared today/);

  await page.fill("#friend-link-input", link);
  await page.click("#add-friend-btn");
  assert.match(await message(page), /Sam Lee is now in your friends/);
  assert.equal((await page.$$(".friend-row")).length, 1, "the same friend again replaces, not duplicates");

  await page.locator(".friend-row", { hasText: "Sam Lee" }).locator(".remove-friend").click();
  assert.doesNotMatch(await page.textContent("#friends-list"), /Sam Lee/);
  assert.deepEqual(errors, []);
  await context.close();
});

test("broken and hostile links are refused or shown as plain text", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  await showPage(page, 2);

  await page.fill("#friend-link-input", "https://amphi-app.github.io/#friend=zAAAA");
  await page.click("#add-friend-btn");
  assert.match(await message(page), /isn't a working Amphi friend link/);

  await page.fill("#friend-link-input", "just some text");
  await page.click("#add-friend-btn");
  assert.match(await message(page), /Paste the whole link/);

  const hostile = await encodeShare(packTimetable('<img src=x onerror="window.pwned=1">', [], fixtures.NOW));
  await page.fill("#friend-link-input", `https://amphi-app.github.io/#friend=${hostile}`);
  await page.click("#add-friend-btn");
  assert.match(await message(page), /is now in your friends/);
  assert.equal(await page.evaluate(() => window.pwned), undefined);
  assert.equal((await page.$$("#friends-list img")).length, 0);
  assert.deepEqual(errors, []);
  await context.close();
});

test("the sample timetable can't be shared", async () => {
  const { page, context, errors } = await openApp(app);
  await page.click("#load-sample-btn");
  await page.waitForSelector("#week-view:not([hidden])");
  await showPage(page, 2);
  await page.click("#share-btn");
  assert.match(await message(page), /Load your own ZEUS timetable first/);
  assert.deepEqual(errors, []);
  await context.close();
});
