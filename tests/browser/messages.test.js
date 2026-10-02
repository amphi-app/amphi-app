// The floating message box: goes away by itself, or when swiped up or tapped.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startApp, openApp, loadGroup } = require("./helpers.js");

let app;
before(async () => { app = await startApp(); });
after(async () => { await app.close(); });

/** Drags a finger on the message by `dy` px (negative = up). */
async function drag(page, context, dy) {
  const box = await page.locator("#error-message").boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
  for (let i = 1; i <= 5; i++) {
    await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + (dy * i) / 5 }] });
  }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
}

test("swipe up dismisses; a short drag or a swipe down doesn't; tap dismisses", async () => {
  const { page, context, errors } = await openApp(app);
  await loadGroup(page);
  const box = "#error-message";

  await page.evaluate(() => showError("Something went wrong"));
  assert.ok(await page.isVisible(box));
  const onTop = await page.$eval(box, (e) => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + 10, r.y + 10) === e; });
  assert.ok(onTop, "floats above the app");

  await drag(page, context, -25);
  assert.ok(await page.isVisible(box), "short drag: stays");
  assert.equal(await page.$eval(box, (e) => e.style.transform), "", "and springs back");
  await drag(page, context, 60);
  assert.ok(await page.isVisible(box), "swipe down: stays");
  await drag(page, context, -60);
  assert.ok(await page.isHidden(box), "swipe up: gone");

  await page.evaluate(() => showError("Tap me"));
  await page.click(box);
  assert.ok(await page.isHidden(box), "tap: gone");

  await page.evaluate(() => { showError("x"); const b = document.getElementById("error-message"); b.style.transform = "translateY(-20px)"; b.dispatchEvent(new Event("touchcancel")); });
  assert.equal(await page.$eval(box, (e) => e.style.transform), "", "a cancelled swipe puts it back");
  assert.deepEqual(errors, []);
  await context.close();
});

test("good news goes after 4 s, errors after 8 s, and a new message restarts the count", async () => {
  const { page, context, errors } = await openApp(app);
  const box = "#error-message";
  await page.evaluate(() => showToast("Saved"));
  await page.clock.runFor(3500);
  assert.ok(await page.isVisible(box));
  await page.clock.runFor(1000);
  assert.ok(await page.isHidden(box));

  await page.evaluate(() => showError("First"));
  await page.clock.runFor(6000);
  await page.evaluate(() => showError("Second"));
  await page.clock.runFor(3000);
  assert.equal(await page.textContent(box), "Second");
  assert.ok(await page.isVisible(box));
  await page.clock.runFor(5500);
  assert.ok(await page.isHidden(box));
  assert.deepEqual(errors, []);
  await context.close();
});
