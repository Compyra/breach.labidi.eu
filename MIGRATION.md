# Breachlight — migration from `rami.party/workshop/breachlight/` to `breach.labidi.eu`

Status of each step is ticked as it is completed. Steps marked **manual** need
the repository owner (DNS, GitHub settings, pushes).

## 1 · Move the site into this repository

- [x] Copy the entire project tree (site + `logscope/` + dev harnesses + `todo.md`)
      from `rami.party/workshop/breachlight/` into the repository root.
- [x] `CNAME` file containing `breach.labidi.eu` (GitHub Pages custom domain).
- [x] Canonical link in `index.html` → `https://breach.labidi.eu/`.
- [x] `robots.txt` allowing all, pointing at the sitemap (house pattern).
- [x] `sitemap.xml` — exactly two URLs, `/` and `/logscope/`; everything else is
      a hash route and fragments are not indexed separately.
- [x] `404.html` — styled like the site, zero external requests, links back to
      the rooms. GitHub Pages serves it for any non-existent path.
- [x] About page copy: "part of the workshop at rami.party" → lives at
      breach.labidi.eu, built in the rami.party workshop.
- [x] Dev harness defaults updated for the new layout
      (`logscope/run-selftest.ps1`, `logscope/shots.ps1`, comments in
      `audit.html` / `overflow.html`, verification section of `todo.md`).
- [x] Service worker cache name bumped (`breachlight-v6`) — new origin means a
      fresh cache regardless, but the bump keeps the convention.
- [x] README.md describing the project.

## 2 · Leave a polite trail at the old address

In `rami.party` (separate repository — its changes ship with rami.party's next
deploy, independent of this one):

- [x] `workshop/breachlight/index.html` → redirect stub to
      `https://breach.labidi.eu/` **preserving the `#/…` hash**, with meta
      refresh fallback and a manual link. Old deep links keep working.
- [x] `workshop/breachlight/logscope/index.html` → same, to `/logscope/`.
- [x] `workshop/breachlight/sw.js` → self-destructing service worker
      (installs, deletes all `breachlight-*` caches, unregisters), so visitors
      with the old worker installed get exactly one stale load, then the stub.
- [x] All other old files removed (data, pages, styles, harnesses).
- [x] `projects.js` — the workshop card now points at
      `https://breach.labidi.eu/`.
- [x] `sitemap.xml` — the two `/workshop/breachlight/…` URLs removed.

## 3 · Verification (all green before going online)

Run from the repository root:

```powershell
python -m http.server 8877 --bind 127.0.0.1          # serve this repo
powershell -File logscope/run-selftest.ps1 -Url "http://127.0.0.1:8877/audit.html"
#   → clean — 7 trees / 153 nodes / 61 plays / 153 terms / 29 defences /
#     32 audit ops / 8 log sources / 38 symptoms · 35/35 search checks
powershell -File logscope/run-selftest.ps1            # Logscope: 44/44
powershell -File logscope/run-selftest.ps1 -Url "http://127.0.0.1:8877/overflow.html?w=320"
#   → clean at 320 / 360 / 414 across 31 routes
```

- [x] Structural audit clean, 35/35 search checks.
- [x] Logscope self-test 44/44.
- [x] No horizontal overflow at 320/360/414 px.
- [x] Zero-external grep: only the canonical link, SVG namespaces in `data:`
      URIs and example text inside authored copy.
- [x] Old-address redirect stubs verified (hash preserved, SW self-destructs).

## 4 · Going online — **manual**

- [ ] DNS: `CNAME` record `breach` → `compyra.github.io.` at the DNS provider
      (same as the other `*.labidi.eu` sites).
- [ ] Push this repository: `git push origin main`.
- [ ] GitHub → repo → Settings → Pages → deploy from `main` / root.
      The `CNAME` file sets the custom domain; tick **Enforce HTTPS** once the
      certificate is issued (can take a few minutes after DNS propagates).
- [ ] Push `rami.party` (redirect stubs + projects.js + sitemap changes ride
      along with its other pending work).
- [ ] After both are live: hard-refresh the old URL once and confirm it lands
      on `https://breach.labidi.eu/` with the hash intact; run through
      `#/triage`, `#/signs`, a playbook and Logscope on the new domain.
- [ ] Later (separate task): point the mail tools and Breachlight at each other
      as **links, not embeds** — Logscope must never gain a network call.

## Notes

- The web app is path-relative throughout; nothing in the code referenced the
  workshop path except the canonical link and the dev harness defaults.
- `bl.*` localStorage (audience, checklist ticks) does not migrate across
  origins. Acceptable: it is convenience state, not data.
- The PWA install on the old scope dies with the self-destructing worker;
  users can reinstall from the new domain.
