// When Amphi comes back on screen and a new version is published, it reloads
// into it, but never while you're typing, never in a loop, never offline.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup, showPage } = require("./helpers.js");

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

test("reloads into a new version when it comes back on screen", async () => {
  const { page, context, errors } = await openApp(app);
  let published = null; // null: the real sw.js
  let offline = false;
  await context.route("**/sw.js", (route) => {
    if (offline) return route.abort("internetdisconnected");
    if (!published) return route.continue();
    return route.fulfill({ contentType: "text/javascript", body: `const CACHE_NAME = "${published}";` });
  });
  await loadGroup(page);
  const resume = async () => {
    await page.evaluate(() => { window.sameDocument = true; document.dispatchEvent(new Event("visibilitychange")); });
    await page.waitForTimeout(800);
    return !(await page.evaluate(() => window.sameDocument === true)); // true = reloaded
  };

  assert.equal(await resume(), false, "same version: no reload");
  published = "amphi-v9999";
  assert.equal(await resume(), true, "new version: reloads");
  await page.waitForSelector("#week-view:not([hidden])");
  assert.equal(await resume(), false, "files still old: no reload loop");

  await page.evaluate(() => localStorage.removeItem("zeus-reloaded-for"));
  await showPage(page, 2);
  await page.focus("#friend-link-input");
  assert.equal(await resume(), false, "typing: waits");
  await page.evaluate(() => document.activeElement.blur());
  assert.equal(await resume(), true, "reloads next time instead");

  await page.waitForSelector("#week-view:not([hidden])");
  await page.evaluate(() => localStorage.removeItem("zeus-reloaded-for"));
  offline = true;
  assert.equal(await resume(), false, "offline: no reload");
  assert.deepEqual(errors, []);
  await context.close();
});
