# Breachlight · breach.labidi.eu

**What to do the moment after you clicked.** Incident triage for two audiences:
the person it happened to, and the responder holding the alert.

- **Triage trees**: answer a few questions, get a specific instruction.
- **Symptoms**. Start from the thing you noticed ("mail marked read",
 "no signal", "a small strange charge") and go straight to the answer.
- **Playbooks**: step-by-step responses per incident, personal and responder.
- **Glossary**: 153 terms in plain language, with the tell and a real example.
- **Defence bench**: what actually reduces the odds, worth-per-minute first.
- **Logscope** (`/logscope/`): an offline reader for exported Entra sign-in /
 audit logs, Purview UAL and message traces: findings, timeline, pivots and
 evidence gaps, entirely in the browser.

## Principles

- **Zero external requests.** No fonts, no CDNs, no analytics, no trackers.
 A site that tells you not to trust strange servers has no business calling any.
- **Nothing you type leaves the device.** There is no back end. Logscope reads
 real incident evidence, which is only acceptable because it never phones home.
- Two modes, one body of knowledge: a default, not a wall.
- Never blame the reader. Queries and detections are starting points, not answers.

## Stack

Static HTML/CSS/JS. No framework, no build step, no dependencies. Content lives
in `data-*.js`; rendering in `core.js` → `pages.js` → `app.js`; offline support
via a network-first service worker.

## Development

```powershell
python -m http.server 8877 --bind 127.0.0.1
# structure + search → expect clean, 35/35
powershell -File logscope/run-selftest.ps1 -Url "http://127.0.0.1:8877/audit.html"
# Logscope parser + rules → expect 44/44
powershell -File logscope/run-selftest.ps1
# layout at any width → expect clean at 320/360/414
powershell -File logscope/run-selftest.ps1 -Url "http://127.0.0.1:8877/overflow.html?w=320"
```

Contracts, verification details and the backlog live in [todo.md](todo.md).
The move from `rami.party/workshop/breachlight/` is documented in
[MIGRATION.md](MIGRATION.md).

Built in the [rami.party](https://rami.party/) workshop.
