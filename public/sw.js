// Basic service worker to satisfy PWA requirements
self.addEventListener('install', (event) => {
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    // We need a fetch event handler for the app to be installable
    // This can be empty or handle caching as needed
    event.respondWith(fetch(event.request));
});
