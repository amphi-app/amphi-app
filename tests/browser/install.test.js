// The "Put Amphi on your home screen" card on Home.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup } = require("./helpers.js");

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

const steps = (page) => page.textContent("#install-steps");

test("iPhone Safari: Share steps until dismissed, and stays dismissed", async () => {
  const { page, context, errors } = await openApp(app, { device: "iPhone 13" });
  await loadGroup(page);
  assert.ok(await page.isVisible("#install-card"));
  assert.match(await steps(page), /Share.*Add to Home Screen/);
  await page.click("#dismiss-install-btn");
  assert.ok(await page.isHidden("#install-card"));
  await page.reload();
  await page.waitForSelector("#week-view:not([hidden])");
  assert.ok(await page.isHidden("#install-card"));
  assert.deepEqual(errors, []);
  await context.close();
});

test("Chrome on iPhone is sent to Safari; Android gets the menu steps", async () => {
  const { devices } = require("playwright");
  const chromeUA = devices["iPhone 13"].userAgent.replace("Version/", "CriOS/120.0 Version/");
  let opened = await openApp(app, { device: "iPhone 13", context: { userAgent: chromeUA } });
  await loadGroup(opened.page);
  assert.match(await steps(opened.page), /in Safari/);
  await opened.context.close();

  opened = await openApp(app, { device: "Pixel 7" });
  await loadGroup(opened.page);
  assert.match(await steps(opened.page), /Install app/);
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
});

test("no card on a computer, with the sample, or once installed", async () => {
  let opened = await openApp(app, { context: { viewport: { width: 1280, height: 800 }, hasTouch: false } });
  await loadGroup(opened.page);
  assert.ok(await opened.page.isHidden("#install-card"), "computer");
  await opened.context.close();

  opened = await openApp(app, { device: "iPhone 13" });
  await opened.page.click("#load-sample-btn");
  await opened.page.waitForSelector("#week-view:not([hidden])");
  assert.ok(await opened.page.isHidden("#install-card"), "sample");
  await opened.context.close();

  opened = await openApp(app, { device: "iPhone 13" });
  await opened.page.evaluate(() => Object.defineProperty(navigator, "standalone", { value: true }));
  await loadGroup(opened.page);
  assert.ok(await opened.page.isHidden("#install-card"), "installed");
  assert.deepEqual(opened.errors, []);
  await opened.context.close();
});
