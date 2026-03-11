/* eslint-disable no-restricted-globals */
const VERSION = 'v1';
const SHELL_CACHE = `nirvana-shell-${VERSION}`;
const RUNTIME_CACHE = `nirvana-runtime-${VERSION}`;

// Minimal app-shell assets. Keep this list small and stable.
const SHELL_ASSETS = [
  '/',
  '/manifest.json',
  '/icon-192.png',
  '/icon-512.png',
];

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

// Network-first for HTML navigations (dashboard pages), fallback to cached shell.
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

// Cache-first for static assets (fast + offline-safe).
async function handleStatic(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(RUNTIME_CACHE);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Only handle same-origin requests.
  if (url.origin !== self.location.origin) return;

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

const CACHE_NAME = 'nirvana-v3';
const OFFLINE_URL = '/';

// Pre-cache all app routes for offline use
const APP_ROUTES = [
    '/',
    '/login',
    '/staff-login',
    '/inventory',
    '/shops',
    '/finance',
    '/reports',
    '/employees',
    '/transfers',
    '/intelligence',
    '/chat',
    '/quotations',
];

// Assets to cache for offline use
const STATIC_ASSETS = [
    '/',
    '/manifest.json',
    '/icon-192.png',
    '/icon-512.png',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            // Cache app routes
            return cache.addAll([...STATIC_ASSETS, ...APP_ROUTES]).catch((err) => {
                console.log('Cache addAll failed:', err);
                // Still try to cache what we can
                return cache.addAll(STATIC_ASSETS);
            });
        })
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => name !== CACHE_NAME)
                    .map((name) => caches.delete(name))
            );
        })
    );
    self.clients.claim();
});

// Handle offline sales - queue them and sync when online
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-sales') {
        event.waitUntil(syncPendingSales());
    }
});

async function syncPendingSales() {
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
            console.error('Failed to sync sale:', e);
        }
    }
}

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

self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Skip non-GET requests (POST for sales)
    if (event.request.method !== 'GET') {
        return;
    }
    
    // For navigation requests, try network first, fallback to cache
    if (event.request.mode === 'navigate') {
        event.respondWith(
            fetch(event.request)
                .then((response) => {
                    // Cache the successful response
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                    return response;
                })
                .catch(() => {
                    return caches.match(event.request).then((cachedResponse) => {
                        return cachedResponse || caches.match('/');
                    });
                })
        );
        return;
    }
    
    // For static assets, try cache first, then network
    event.respondWith(
        caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            return fetch(event.request).then((networkResponse) => {
                // Cache static assets
                if (networkResponse.ok && (
                    url.pathname.endsWith('.js') ||
                    url.pathname.endsWith('.css') ||
                    url.pathname.endsWith('.png') ||
                    url.pathname.endsWith('.ico') ||
                    url.pathname.startsWith('/_next/static/')
                )) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            });
        })
    );
});
