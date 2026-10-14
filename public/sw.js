/* eslint-disable no-restricted-globals */
const VERSION = 'v5';
const SHELL_CACHE = `nirvana-shell-${VERSION}`;
const RUNTIME_CACHE = `nirvana-runtime-${VERSION}`;

// Pre-cache essential application shell assets
const SHELL_ASSETS = [
  '/',
  '/staff-login',
  '/mobile-menu',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS).catch((err) => console.warn('[SW] Shell cache partial fail:', err)))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k.startsWith('nirvana-') && ![SHELL_CACHE, RUNTIME_CACHE].includes(k))
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

function isNextStatic(url) {
  return url.pathname.startsWith('/_next/static/');
}

function isIconOrManifest(url) {
  return url.pathname === '/manifest.json' || url.pathname.startsWith('/icon-');
}

function isApi(url) {
  return url.pathname.startsWith('/api/');
}

// Network-first for HTML navigations (pages), with resilient fallback to cached routes
async function handleNavigate(request) {
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    const staffLogin = await caches.match('/staff-login');
    if (staffLogin) return staffLogin;
    return (await caches.match('/')) || Response.error();
  }
}

// Cache-first for static assets
async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  try {
    const fresh = await fetch(request);
    if (fresh.ok) {
      const cache = await caches.open(RUNTIME_CACHE);
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch {
    return Response.error();
  }
}

// Background sync: push queued offline sales when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sales') {
    event.waitUntil((async () => {
      // Notify clients to run their sync engine
      const clients = await self.clients.matchAll();
      clients.forEach(client => {
        client.postMessage({ type: 'TRIGGER_BACKGROUND_SYNC' });
      });
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin
  if (url.origin !== self.location.origin) return;

  // Never interfere with API calls
  if (isApi(url)) return;

  // Ignore non-GET
  if (request.method !== 'GET') return;

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigate(request));
    return;
  }

  if (isNextStatic(url) || isIconOrManifest(url)) {
    event.respondWith(handleStatic(request));
    return;
  }
});
