/* ==========================================================================
 Breachlight: sw.js
 --------------------------------------------------------------------------
 Offline support only. There is no back end and no telemetry, so this worker
 exists purely so the site still opens on a phone with no signal.

 Strategy: NETWORK FIRST, cache as fallback.
 A cache-first worker on a site like this ships stale advice and stale code,
 and the pages here are edited often. Network-first costs a few milliseconds
 online and behaves identically offline.
 ========================================================================== */

const VERSION = 'breachlight-v6';
const SHELL = [
 './',
 './index.html',
 './style.css',
 './core.js',
 './pages.js',
 './app.js',
 './data-terms.js',
 './data-defend.js',
 './data-plays.js',
 './data-trees.js',
 './data-logs.js',
 './data-ad-entra.js',
 './data-ad-entra-plays.js',
 './data-phish-plays.js',
 './manifest.webmanifest',
 './logscope/',
 './logscope/index.html',
 './logscope/logscope.css',
 './logscope/parse.js',
 './logscope/rules.js',
 './logscope/app.js',
];

self.addEventListener('install', event => {
 event.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()).catch(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
 event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
 const req = event.request;
 if (req.method !== 'GET') return;

 const url = new URL(req.url);
 if (url.origin !== self.location.origin) return;

 event.respondWith(fetch(req).then(res => {
 if (res && res.ok && res.type === 'basic') {
 const copy = res.clone();
 caches.open(VERSION).then(c => c.put(req, copy)).catch(() => { });
 }
 return res;
 }).catch(() => caches.match(req).then(hit => hit || caches.match('./index.html'))));
});
