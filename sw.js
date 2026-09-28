/*
  sw.js — the "service worker": a small script the browser runs in the
  background. It saves copies of the app's own files so the app still
  opens with no internet (in the metro, in a basement classroom).

  Strategy: always try the network first, so you get the latest version
  whenever you're online; fall back to the saved copy only when offline.
  Requests to other sites (like ZEUS) are left completely alone.
*/

const CACHE_NAME = "amphi-v16";
const APP_FILES = [
  "./",
  "./index.html",
  "./style.css",
  "./ics.js",
  "./kinds.js",
  "./rooms.js",
  "./friends.js",
  "./updates.js",
  "./data/rooms.json",
  "./data/updates.json",
  "./app.js",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  // Delete caches from older versions of this file.
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(names.filter((name) => name !== CACHE_NAME).map((name) => caches.delete(name)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request, { ignoreSearch: true }))
  );
});
