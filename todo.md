# Breachlight — backlog

## Files and load order
**Code:** `core.js` (DOM, storage, audience, components) → data files →
`pages.js` (one renderer per route) → `app.js` (router, search, audit, boot).

**Data:** `data-terms.js` → `data-defend.js` → `data-plays.js` → `data-trees.js`
→ `data-logs.js` → `data-ad-entra.js` → `data-ad-entra-plays.js` →
`data-phish-plays.js`

The `data-ad-entra*`, `data-logs` and `data-phish-plays` files **extend** the
arrays declared by the earlier ones with `.push()` / `.unshift()`. They must
load after them and before `pages.js`. If you add another data file, add it to
`index.html`, `audit.html` **and** the `SHELL` list in `sw.js`, and bump the
cache `VERSION`.

**Logscope** (`logscope/`): `../core.js` + `../data-logs.js` → `parse.js`
(format detection and normalisation) → `rules.js` (detections) → `app.js` (UI).

**Dev harnesses**, not linked from the site and not in the SW shell:
`audit.html` (structure + search), `overflow.html` (layout at any width),
`logscope/selftest.html` (parser and rules), plus `logscope/run-selftest.ps1`
and `logscope/shots.ps1`.

## Contracts (do not break these)
- **Zero external requests.** No fonts, no CDN, no analytics. Verified by
  grepping every shipped file for `https?://` — the only hits should be the
  canonical link, SVG namespaces inside `data:` URIs, and example text.
- **Logscope must never gain a network call.** It handles real incident
  evidence; that guarantee is the reason it is usable at all.
- `createElement` / `textContent` only. No `innerHTML`. In Logscope this is a
  security control, not a style rule — log exports contain attacker-controlled
  display names, subjects and user agents.
- Every `id` is a permanent hash target. **Never rename one.**
- `BL_AUDIT_OPS` in `data-logs.js` is the single source of truth for both the
  site's audit lookup page and Logscope's detections. `aka[]` is used for
  *matching*; `keys` is search-only and safe for natural language.
- Tree results are short and always hand off to a playbook.
- `aud` is a *default*, not a wall.
- **Technical detail is load-bearing.** GUIDs, event IDs, attribute names,
  `userAccountControl` flags and ESC numbers must be verified against current
  Microsoft documentation before being changed.
- Queries and detections are labelled starting points, never answers.

## Verifying
The editor's interactive browser tooling is unreliable; everything below runs
headlessly and is the preferred route.

1. `python -m http.server 8877 --bind 127.0.0.1` from the repository root
2. Structure + search:
   `powershell -File logscope/run-selftest.ps1 -Url http://127.0.0.1:8877/audit.html`
   Expect `clean` and `35 / 35 search checks`.
   Baseline: 7 trees / 153 nodes / 61 plays / 153 terms / 29 defences /
   32 audit ops / 8 log sources / 38 symptoms.
3. Logscope parser and rules:
   `powershell -File logscope/run-selftest.ps1`  → expect `44 / 44 passed`.
4. Layout at any width:
   `powershell -File logscope/run-selftest.ps1 -Url "http://.../overflow.html?w=320"`
   Tested clean at 320 / 345 / 360 / 390 / 414 across 29 routes.
   **The headless Edge profile caches hard** — delete `$env:TEMP\bl-edge-profile`
   and add a `?cb=` cache-buster or you will re-test the previous build.
5. Screenshots: `powershell -File logscope/shots.ps1`.
   **Headless screenshots clip and are not evidence of overflow** — they show
   false positives at narrow widths. Trust `overflow.html`, which measures
   `scrollWidth - clientWidth` in a real same-origin iframe.
6. Browser-free cross-reference check, if even headless is unavailable:
   ```powershell
   $all = (Get-ChildItem 'data-*.js' | ForEach-Object { Get-Content $_.FullName -Raw }) -join "`n"
   $declared = @{}; [regex]::Matches($all,"(?m)^\s{4,8}id:\s*'([a-z0-9\-]+)'") |
     ForEach-Object { $declared[$_.Groups[1].Value] = 1 }
   [regex]::Matches($all,"(?m)^\s*(terms|defend|plays):\s*\[([^\]]*)\]") |
     ForEach-Object { [regex]::Matches($_.Groups[2].Value,"'([a-z0-9\-]+)'") } |
     ForEach-Object { $_.Groups[1].Value } | Select-Object -Unique |
     Where-Object { -not $declared.ContainsKey($_) }
   ```

## Backlog
- [x] ~~The move to breach.labidi.eu~~ — done 2026-08-07; see MIGRATION.md.
      rami.party keeps hash-preserving redirect stubs and a self-destructing SW.
- [ ] **Point at the mail tools** (SPF/DKIM/DMARC checkers and friends) from the
      spoofing/BEC content — once they live at their final address. Keep it a link,
      not an embed: those tools make network calls and Breachlight must not.
- [x] ~~A short "what happened to me?" symptom picker~~ — shipped as the
      **Symptoms** room (`#/signs`): 34 observations across both modes, each
      mapped straight to a play, searchable under the reader's own phrasing.
- [ ] Dutch and French content packs. The structure is already data-only, so this
      is a translation job, not a code one — but `keys` must be rewritten, not
      translated, since it holds the words a frightened person actually types.
      The AD/Entra layer should stay English; the terminology is English in the
      product itself and translating it would make it harder to search.
- [ ] Printable one-page "first hour card" per playbook (print CSS exists, needs a
      dedicated layout). Highest value for `pro-ad-tier0` and `pro-ad-golden`.
- [ ] Country selector that swaps in the right reporting route, fraud hotline and
      credit-freeze mechanism. Currently deliberately jurisdiction-neutral.
- [ ] Responder mode: add Google Workspace and Okta equivalents alongside the
      Entra material, and Splunk/Elastic query variants alongside the KQL.
- [ ] AD/Entra: an Azure resource-plane playbook (managed identities, run command,
      Arc, storage account keys) — currently only reachable via the hybrid pivot.
- [ ] AD/Entra: a baseline-capture script that records the known-good state the
      persistence sweeps are meant to be compared against.
- [ ] Link the glossary inline from playbook prose (currently only via "Read next").
- [ ] Consider an `og-image.html` to match the rest of the site.

## Deliberately not doing
- No "check if this URL is safe" input box. It would be a network call, it would be
  wrong often enough to be dangerous, and it teaches the opposite of the site's
  central habit: go to the site yourself instead of judging the link.
- No scoring, no "security score", no gamification. People arrive here frightened.
- No jurisdiction-specific legal claims beyond named, checkable ones
  (GDPR 72 hours, ~120-day chargeback windows), each flagged as verify-locally.

## Sources and reading behind the content
Written from general practice rather than transcribed from any one document. The
positions that are load-bearing and worth re-checking as things change:

### Verification log
Claims checked against primary sources on **2026-07-31**. Re-check anything
licence- or date-dependent before quoting it in a report.

| Claim | Status | Source |
|---|---|---|
| `MailItemsAccessed` requires E5 / Audit Premium | **WRONG — corrected** | It is Audit **Standard** and enabled by default for E3/E5 mailboxes since the Sept 2023 expanded-logging rollout (Microsoft, "Expanding cloud logging", Jul 2023; Purview `audit-log-investigate-accounts`). Only the sensitivity-label insight on it is Premium. This error would have sent responders away from their best evidence. |
| Audit (Standard) retention 180 days | correct | Changed from 90 on **17 Oct 2023**; earlier records still 90. |
| Audit (Premium) 1 year / 10 years | correct, sharpened | 1 year applies to Entra/Exchange/OneDrive/SharePoint records **for E5-licensed users**; everything else 180 days. 10 years needs the add-on. |
| Entra sign-in & audit logs: 7 days free / 30 days P1-P2 | correct | Entra data-retention reference. |
| Risky sign-ins retention | sharpened | 7 / 30 / **90** days (Free / P1 / **P2**). |
| Graph activity logs | sharpened | **P1/P2 only**, and only what a diagnostic setting exports. |
| Device code phishing, block via CA authentication flows | correct | Microsoft explicitly recommends blocking device code flow wherever possible. |
| Device code attack chain | **incomplete — extended** | Since Feb 2025 Storm-2372 uses the Microsoft Authentication Broker client ID to get a refresh token → **register their own device** → obtain a **PRT**. Added, plus the `50199`-then-success tell, the Graph mailbox keyword search, and *restrict device registration* as a control. |
| KB5014754 | **out of date — corrected** | Full Enforcement became the default in **Feb 2025**; the **Sept 2025** update removed the fallback to Compatibility mode. The task is no longer "enable it" but "find what it broke" — hunt the no-strong-mapping KDC audit events, reissue with the SID extension or add a strong `altSecurityIdentities` mapping (`X509IssuerSerialNumber` recommended). |
| AD CS "ESC1–ESC13" | **brittle — reframed** | The numbering has grown past 13. Content now names the well-established ones and says explicitly to enumerate with current tooling rather than trusting a fixed list. |
| Message trace "~10 days" | **verified 2026-08-07** | Instant summary trace covers 10 days (90 via historical search, CSV-only, hours-slow, last 24h of archive typically unavailable). Client IP detail exists **only** in the 10-day enhanced/extended reports. "Export it first" stands. Source: message-trace-modern-eac, updated Jun 2025. |
| Sign-in error 50199 | added | AADSTS50199 = "user confirmation required" interrupt; the 50199-then-success pair is the Storm-2372 broker-flow tell. Now a Logscope aggregate rule and a pro symptom. |

Still unverified and worth checking before relying on: exact reimbursement rules
per country and the newest ESC numbers.

### Positions that are load-bearing
- Phishing-resistant MFA (FIDO2/WebAuthn passkeys) is the only factor that
  structurally defeats AiTM relay phishing — CISA and NCSC both say so plainly.
- Token/session revocation must precede password reset. Microsoft's own incident
  guidance for AiTM and token theft is explicit about this ordering, and
  `revokeSignInSessions` is the Graph call that does it.
- Persistence set to check after any identity compromise: MFA methods, OAuth
  consent grants, inbox rules and forwarding, delegation, device registration,
  app credentials. Missing one of these is the usual cause of "reinfection".
- Malicious inbox rules as a BEC indicator, and the payment-verification control
  (voice callback on a pre-held number) as the thing that actually prevents it.
- ClickFix / paste-and-run as a mainstream infostealer delivery route; the
  "no legitimate site asks you to paste a command" line is the whole defence.
- Reimbursement asymmetry: card fraud (chargeback) versus APP fraud (bank
  transfer). Rules differ by country and are moving — re-check before quoting.
- No More Ransom for free decryptors; do not recommend paying.
- StopNCII and national child-protection hotlines for image takedown.
- Recovery scams as the standard second wave against anyone already victimised.

### Directory layer specifically
- **Containment ordering differs by directory, and this is the single most
  important thing on the responder side.** On-prem: preserve evidence and protect
  backups *before* resetting anything, because uncoordinated resets warn the
  adversary and destroy the timeline. Cloud: revoke tokens *before* resetting,
  because the token is what is in use.
- krbtgt is reset **twice**, separated by full replication convergence plus the
  maximum ticket lifetime (defaults 10h + 5min skew; 24h is the common
  conservative choice). Back-to-back resets cause a domain-wide authentication
  outage. Microsoft's `New-KrbtgtKeys.ps1` is the supported tool. Read-only DCs
  each have their own krbtgt account.
- `AZUREADSSOACC$` is the most-missed step in hybrid recovery — its Kerberos key
  forges tickets that Entra ID accepts, so a domain compromise stays a cloud
  compromise until it is rotated. Microsoft suggests rotating at least monthly.
- Certificates survive password resets. AD CS is therefore the persistence most
  often missed entirely; a compromised CA private key invalidates everything it
  ever issued. Also check the NTAuth store for a rogue CA certificate.
- Application/service-principal credentials are the equivalent cloud blind spot:
  no MFA, no Conditional Access by default, and logged in a *separate* table
  (`AADServicePrincipalSignInLogs`) that user-focused monitoring never reads.
- PIM **eligible** assignments must be checked as well as active ones — attackers
  prefer eligibility because it is much quieter.
- Federation/domain changes are the highest-severity Entra finding: a hostile
  signing key asserts the MFA claim, so "MFA was satisfied" proves nothing during
  such an incident.
- Backups restore data and availability, never *trustworthiness*. If the adversary
  held Tier 0, the backup contains their persistence. This is why the
  rebuild-or-clean tree keys on log retention and sweep completeness rather than
  on whether persistence was found.
- Detection GUIDs/IDs used and worth re-verifying if edited: replication rights
  `1131f6aa-…` / `1131f6ad-…` / `89e95b76-…` (Event 4662), 4728/4732/4756 group
  changes, 4768/4769 Kerberos, 5136 directory changes, 4741 computer created,
  4886/4887/4888 certificate requests, Sysmon 10 for LSASS access,
  `DONT_REQUIRE_PREAUTH = 0x400000`, `ENROLLEE_SUPPLIES_SUBJECT = 0x1`.
- KB5014754 strong certificate binding enforcement is what closes ESC9/ESC10.
- Terminology follows current Microsoft naming (Entra ID, Entra Connect, Microsoft
  Graph PowerShell) with the old names kept in `also`/`keys`, because people
  inherit old runbooks and search for the old words.
