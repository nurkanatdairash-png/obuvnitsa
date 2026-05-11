'use strict';

const CACHE = 'obuvnitsa-v1';

// self.registration.scope is the base URL dynamically —
// works for both root deployments (Netlify) and subdirectory deployments (GitHub Pages /site/)
const BASE = self.registration.scope;

const SHELL = [
  BASE,
  BASE + 'index.html',
  BASE + 'styles.css',
  BASE + 'app.js',
  BASE + 'icon.svg',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.50.0/dist/umd/supabase.min.js',
];

// ── Install: pre-cache the app shell ─────────────────────
self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache =>
      Promise.allSettled(SHELL.map(url => cache.add(url)))
    )
  );
});

// ── Activate: delete stale caches from old SW versions ───
self.addEventListener('activate', e => {
  self.clients.claim();
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

// ── Fetch ─────────────────────────────────────────────────
self.addEventListener('fetch', e => {
  const req = e.request;
  const url = new URL(req.url);

  // Never intercept Supabase API / auth / realtime
  if (url.hostname.endsWith('.supabase.co')) return;

  // Only cache GET requests
  if (req.method !== 'GET') return;

  // Navigation requests → always serve index.html from cache
  if (req.mode === 'navigate') {
    e.respondWith(
      caches.match(BASE + 'index.html').then(cached => {
        if (cached) return cached;
        return fetch(req).then(resp => {
          if (resp.ok) caches.open(CACHE).then(c => c.put(BASE + 'index.html', resp.clone()));
          return resp;
        });
      })
    );
    return;
  }

  // All other assets: serve from cache instantly, refresh in background
  e.respondWith(
    caches.open(CACHE).then(async cache => {
      const cached = await cache.match(req);
      const networkFetch = fetch(req).then(resp => {
        if (resp.ok) cache.put(req, resp.clone());
        return resp;
      }).catch(() => null);
      return cached || networkFetch;
    })
  );
});
