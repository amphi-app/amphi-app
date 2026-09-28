// The browser loads every script into one shared space, so two files that
// define the same top-level name break the page (the second file fails to
// load at all). Node loads files separately and would never notice, so this
// test checks for it directly.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const scripts = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map((m) => m[1]);

test("index.html loads the app's scripts", () => {
  assert.ok(scripts.includes("app.js") && scripts.length >= 2, scripts.join(", "));
});

test("no two scripts define the same top-level name", () => {
  const definedIn = new Map();
  for (const file of scripts) {
    for (const line of fs.readFileSync(path.join(root, file), "utf8").split("\n")) {
      const match = line.match(/^(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|var|class)\s+([A-Za-z_$][\w$]*))/);
      if (!match) continue;
      const name = match[1] || match[2];
      if (!definedIn.has(name)) definedIn.set(name, []);
      definedIn.get(name).push(file);
    }
  }
  const clashes = [...definedIn].filter(([, files]) => files.length > 1).map(([name, files]) => `${name} (${files.join(", ")})`);
  assert.deepEqual(clashes, []);
});
