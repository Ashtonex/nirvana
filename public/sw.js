/* eslint-disable no-restricted-globals */
const VERSION = 'v4';
const SHELL_CACHE = `nirvana-shell-${VERSION}`;
const RUNTIME_CACHE = `nirvana-runtime-${VERSION}`;

// Minimal app-shell assets. Keep this list small and stable.
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('nirvana-offline', 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve({
      getAll: (store) => new Promise((res, rej) => {
        const tx = request.result.transaction(store, 'readonly');
        const req = tx.objectStore(store).getAll();
        req.onsuccess = () => res(req.result);
        req.onerror = () => rej(req.error);
      }),
      delete: (store, id) => new Promise((res, rej) => {
        const tx = request.result.transaction(store, 'readwrite');
        tx.objectStore(store).delete(id);
        tx.oncomplete = () => res();
        tx.onerror = () => rej(tx.error);
      })
    });
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('pending-sales')) {
        db.createObjectStore('pending-sales', { keyPath: 'id' });
      }
    };
  });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE)
      .then((cache) => cache.addAll(SHELL_ASSETS))
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

// Network-first for HTML navigations (pages), fallback to cached shell.
async function handleNavigate(request) {
  try {
    const fresh = await fetch(request);
    const cache = await caches.open(RUNTIME_CACHE);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await caches.match(request);
    if (cached) return cached;
    return (await caches.match('/')) || Response.error();
  }
}

// Cache-first for static assets.
async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, fresh.clone());
  return fresh;
}

// Background sync: push queued offline sales when back online
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-sales') {
    event.waitUntil((async () => {
      const db = await openDB();
      const sales = await db.getAll('pending-sales');
      for (const sale of sales) {
        try {
          const response = await fetch('/api/sales/offline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(sale)
          });
          if (response.ok) {
            await db.delete('pending-sales', sale.id);
          }
        } catch (e) {
          // Keep in queue; will retry on next sync
          console.error('Failed to sync sale:', e);
        }
      }
    })());
  }
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin.
  if (url.origin !== self.location.origin) return;

  // Never interfere with API calls.
  if (isApi(url)) return;

  // Ignore non-GET.
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
