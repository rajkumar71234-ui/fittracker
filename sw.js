// Caches only the app itself so it opens fast. Your data always goes to/from GitHub, never this cache.
const CACHE = 'fittracker-v136';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png', './icons/apple-touch-icon.png', './icons/logo.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/config.json')) return;
  const isPage = e.request.mode === 'navigate' || url.pathname.endsWith('.html') || url.pathname.endsWith('/');
  if (isPage) {
    // network first, so updates you push to GitHub show up straight away
    e.respondWith(fetch(e.request.url, { cache: 'no-store' }).then((r) => { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html'))));
  } else {
    e.respondWith(caches.match(e.request).then((r) => r || fetch(e.request)));
  }
});

// meal reminders: show the push, and open the app's "tell me what you ate" screen when tapped
self.addEventListener('push', (e) => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch (x) { d = { body: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.title || '🍽️ Meal time', {
    body: d.body || 'Already eaten? Tap and tell me what you ate.', icon: './icons/icon-192.png', badge: './icons/icon-192.png',
    tag: 'meal-' + (d.slot || ''), renotify: true, data: { url: d.url || './' },
  }));
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const url = new URL((e.notification.data || {}).url || './', self.registration.scope).href;
  const talk = new URL(url).searchParams.get('talk');
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((cs) => {
    for (const c of cs) if (c.url.startsWith(self.registration.scope)) { if (talk) c.postMessage({ talk }); return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
