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

const VERSION = 'breachlight-v8';
const SHELL = [
    './',
    './index.html',
    './style.css?v=1',
    './core.js?v=1',
    './pages.js?v=1',
    './app.js?v=1',
    './data-terms.js?v=1',
    './data-defend.js?v=1',
    './data-plays.js?v=1',
    './data-trees.js?v=1',
    './data-logs.js?v=1',
    './data-ad-entra.js?v=1',
    './data-ad-entra-plays.js?v=1',
    './data-phish-plays.js?v=1',
    './manifest.webmanifest?v=1',
    './logscope/',
    './logscope/index.html',
    './logscope/logscope.css?v=1',
    './logscope/parse.js?v=1',
    './logscope/split.js?v=1',
    './logscope/rules.js?v=1',
    './logscope/app.js?v=1',
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
            }).catch(() =>
                /* ignoreSearch: a ?v= mismatch must never turn into a dead
                   page when the network is already gone. */
                caches.match(req, { ignoreSearch: true })
                    .then(hit => hit || caches.match('./index.html'))));
});
