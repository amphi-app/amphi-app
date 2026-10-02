/*
  Shared setup for the browser tests: serves the app from this folder, starts
  Chromium, and opens Amphi like a phone at a fixed time (fixtures.NOW), with
  the weekly data files replaced by made-up ones.

  Run with: npm run test:browser   (needs Playwright; see README).
*/
const fs = require("fs");
const http = require("http");
const path = require("path");
const { chromium, devices } = require("playwright");
const fixtures = require("./fixtures.js");

const ROOT = path.join(__dirname, "..", "..");
const TYPES = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css",
  ".json": "application/json", ".webmanifest": "application/manifest+json",
  ".svg": "image/svg+xml", ".png": "image/png",
};

function startServer() {
  const server = http.createServer((req, res) => {
    let urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    if (urlPath.endsWith("/")) urlPath += "index.html";
    const file = path.join(ROOT, urlPath);
    if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    res.writeHead(200, { "Content-Type": TYPES[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-cache" });
    fs.createReadStream(file).pipe(res);
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// In Claude Code's cloud sessions Chromium is pre-installed here; elsewhere
// Playwright uses the one from `npx playwright install chromium`.
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  return fs.existsSync("/opt/pw-browsers/chromium") ? "/opt/pw-browsers/chromium" : undefined;
}

/** One browser and server per test file: call in before(), close in after(). */
async function startApp() {
  const server = await startServer();
  const browser = await chromium.launch({ executablePath: chromiumPath() });
  const base = `http://127.0.0.1:${server.address().port}/`;
  return {
    base,
    browser,
    async close() {
      await browser.close();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

const PHONE = { viewport: { width: 390, height: 844 }, hasTouch: true };

/**
 * Opens Amphi in a fresh phone-sized browser. Options:
 *   now       the moment the page thinks it is (default fixtures.NOW; null = real time)
 *   device    a Playwright device name ("iPhone 13") instead of the plain phone
 *   weeklyData  false to leave data/*.json as they are in the repository
 *   serviceWorker  true to let the service worker run (offline tests)
 *   hash      added to the address (friend links)
 *   onDialog  answers confirm/prompt dialogs, set up before the page loads
 *             (a friend link asks straight away)
 * The phone is set to India time on purpose: Amphi must show Paris times.
 */
async function openApp(app, options = {}) {
  const { now = fixtures.NOW, device, weeklyData = true, serviceWorker = false, hash = "", onDialog, context: extra = {} } = options;
  const context = await app.browser.newContext({
    ...(device ? devices[device] : PHONE),
    timezoneId: "Asia/Kolkata",
    serviceWorkers: serviceWorker ? "allow" : "block",
    ...extra,
  });
  if (weeklyData) {
    const data = fixtures.weeklyData();
    await context.route("**/data/rooms.json", (route) => route.fulfill({ json: data.rooms }));
    await context.route("**/data/updates.json", (route) => route.fulfill({ json: data.updates }));
  }
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (onDialog) page.on("dialog", onDialog);
  if (now) await page.clock.install({ time: now });
  await page.goto(`${app.base}index.html${hash}`);
  return { context, page, errors };
}

/** Chooses a timetable file, as a student would. */
async function chooseFile(page, text, name = "timetable.ics") {
  await page.setInputFiles("#ics-input", { name, mimeType: "text/calendar", buffer: Buffer.from(text) });
}

/** Chooses a group file and waits for the timetable. */
async function loadGroup(page, text = fixtures.groupICS()) {
  await chooseFile(page, text);
  await page.waitForSelector("#week-view:not([hidden])");
}

/** Jumps to a tab without the sliding animation (which a frozen clock stalls). */
async function showPage(page, index) {
  await page.evaluate((i) => pager.scrollTo({ left: i * pager.clientWidth, behavior: "instant" }), index);
  await page.waitForTimeout(100);
}

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("zeus-schedule-my-events")));
const texts = (page, selector) => page.$$eval(selector, (els) => els.map((el) => el.textContent.trim()));

module.exports = { startApp, openApp, chooseFile, loadGroup, showPage, saved, texts, fixtures };
