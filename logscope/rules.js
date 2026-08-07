/* ==========================================================================
   Logscope — rules.js
   --------------------------------------------------------------------------
   The detections. Two kinds:

     event rules      look at one normalised event at a time
     aggregate rules  look at the whole set, for things a single row cannot
                      show — spray patterns, impossible travel, bulk download

   Most audit and Purview detections are generated from BL_AUDIT_OPS in
   ../data-logs.js, so the tool and the site can never disagree about what an
   operation means or what to do about it. Add an operation there and it
   appears here automatically.

   Exposes window.LS_RULES.
   ========================================================================== */

(function () {
    'use strict';

    const CATALOGUE = window.BL_AUDIT_OPS || [];

    /** Normalise an operation name for comparison: case, spaces, dashes and
        the en-dash Microsoft uses in some portal strings all vary. */
    function norm(s) {
        return String(s || '').toLowerCase().replace(/[\s\-–—_.]/g, '');
    }

    /* ------------------------------------------------ catalogue-driven rules */

    const opIndex = {};
    CATALOGUE.forEach(entry => {
        [entry.op].concat(entry.aka || []).forEach(name => {
            const k = norm(name);
            if (k) opIndex[k] = entry;
        });
    });

    function catalogueLookup(action) {
        return opIndex[norm(action)] || null;
    }

    /* ----------------------------------------------------------- event rules */

    const LEGACY_CLIENTS = [
        'imap', 'pop', 'smtp', 'exchange activesync', 'activesync',
        'exchange web services', 'other clients', 'authenticated smtp',
        'exchange online powershell', 'mapi over http',
    ];

    const eventRules = [
        {
            id: 'device-code',
            sev: 'critical',
            title: 'Device code flow authentication',
            why: 'The user authenticated on the real Microsoft page but the tokens went to whichever machine started the flow. There is no fake site to spot, and it yields a refresh token that outlives the code by weeks. In most tenants the healthy baseline for this is close to zero.',
            actions: [
                'Revoke refresh tokens and sessions for this user now — a password reset does nothing to a token.',
                'Check the non-interactive sign-in log for the same user; that is where the attacker’s use of the token appears.',
                'Search the whole export for other device code sign-ins — these campaigns are never aimed at one person.',
                'Block device code flow in Conditional Access afterwards, and allow-list the few genuine cases.',
            ],
            link: '../#/play/pro-device-code',
            match: ev => ev.src === 'signin' && /devicecode/i.test(ev.proto || ''),
        },
        {
            id: 'auth-transfer',
            sev: 'high',
            title: 'Authentication transfer (QR "continue on another device")',
            why: 'The flow that lets a sign-in move from one device to another by scanning a code. Abused the same way as device code phishing, and equally invisible to URL-checking instincts.',
            actions: [
                'Confirm with the user that they deliberately transferred a sign-in between their own devices.',
                'If not: revoke tokens and treat it as device code phishing.',
                'Block authentication transfer in Conditional Access unless you use it deliberately.',
            ],
            link: '../#/play/pro-device-code',
            match: ev => ev.src === 'signin' && /transfer/i.test((ev.extra && ev.extra.transfer) || ''),
        },
        {
            id: 'token-prior-claim',
            sev: 'high',
            title: 'MFA satisfied by a claim already in the token',
            why: 'The sign-in succeeded without the user doing anything, because the token already carried the MFA claim. That is normal for a legitimate session — and it is exactly what a replayed stolen token looks like. Judge it on the source, not the event.',
            actions: [
                'Compare the IP, ASN and user agent against the same user’s normal pattern.',
                'If the source is unfamiliar, treat as session token theft: revoke refresh tokens first, then reset.',
                'Verify the revocation worked by re-checking activity fifteen minutes later.',
            ],
            link: '../#/play/pro-token-theft',
            match: ev => ev.src === 'signin' && ev.mfa === 'prior' && ev.result === 'success',
        },
        {
            id: 'single-factor-success',
            sev: 'medium',
            title: 'Successful sign-in with a single factor',
            why: 'A password alone was enough. Either no policy required MFA for this application, or an exclusion applied. Both are findings in their own right, independent of whether this particular sign-in was hostile.',
            actions: [
                'Identify which application and which policy (or absence of one) allowed it.',
                'Check Conditional Access exclusion groups — that is usually the answer.',
            ],
            link: '../#/defend/entra-hardening',
            match: ev => ev.src === 'signin' && ev.mfa === 'single' && ev.result === 'success',
        },
        {
            id: 'legacy-auth',
            sev: 'high',
            title: 'Legacy authentication protocol',
            why: 'Legacy protocols cannot perform MFA, so they bypass every modern control you have. Basic authentication was retired across Exchange Online, which changes how to read this: a **failed** legacy attempt is now routine background noise, while a **successful** one means either SMTP AUTH (still permitted per-mailbox) or a workload where basic auth survives — and that is a genuine finding worth chasing.',
            actions: [
                'Check the result first. Sort the successes from the failures before spending any time here.',
                'For any success: identify the protocol and the mailbox. `Authenticated SMTP` is the usual survivor — it is enabled per-mailbox and frequently forgotten after a printer or line-of-business app was set up years ago.',
                'If it succeeded from an unfamiliar source, treat the credential as compromised: these accounts rarely have MFA and their passwords are often ancient.',
                'Block legacy authentication tenant-wide in Conditional Access, and disable SMTP AUTH per-mailbox where nothing needs it.',
            ],
            link: '../#/defend/entra-hardening',
            match: ev => ev.src === 'signin' &&
                LEGACY_CLIENTS.some(c => String((ev.extra && ev.extra.clientApp) || '').toLowerCase().indexOf(c) >= 0),
        },
        {
            id: 'ca-not-applied',
            sev: 'medium',
            title: 'Successful sign-in with no Conditional Access policy applied',
            why: 'No policy covered this sign-in at all. In a cloud-first estate Conditional Access is the perimeter, so a gap in coverage is a gap in the firewall.',
            actions: [
                'Work out why: an excluded user, an excluded application, or no policy scoped to it.',
                'Review exclusion groups — they accumulate members and rarely lose them.',
            ],
            link: '../#/defend/entra-hardening',
            match: ev => ev.src === 'signin' && ev.result === 'success' &&
                /notapplied/i.test(ev.ca || ''),
        },
        {
            id: 'risky-signin',
            sev: 'high',
            title: 'Sign-in flagged as risky by Identity Protection',
            why: 'Microsoft’s own detection fired — anonymous IP, unfamiliar properties, malware-linked address, leaked credentials or a token anomaly.',
            actions: [
                'Read the specific detection type rather than the risk level alone.',
                'Do not dismiss the risky user without investigating; the dismissal is recorded and will be read back to you.',
            ],
            link: '../#/play/pro-impossible-travel',
            match: ev => ev.src === 'signin' && /^(high|medium)$/i.test(ev.risk || ''),
        },
        {
            id: 'guest-signin',
            sev: 'info',
            title: 'External or guest identity',
            why: 'A guest authenticated. Guests are authenticated by somebody else’s security team, are frequently over-permissioned, and can hold directory roles.',
            actions: [
                'Check whether this guest holds any directory role or elevated group membership.',
                'Turn on access reviews so stale guests expire without anyone having to remember.',
            ],
            link: '../#/terms/cross-tenant',
            match: ev => ev.src === 'signin' && /guest/i.test((ev.extra && ev.extra.userType) || ''),
        },
        {
            id: 'unknown-format',
            sev: 'info',
            title: 'Rows this tool did not recognise',
            why: 'The format was not one of the supported exports, so only the raw rows are shown and no detections ran against them.',
            actions: [
                'Check you exported from the right blade, and prefer JSON where the portal offers it.',
                'The timeline below still lists the rows so they are not lost.',
            ],
            link: '../#/play/pro-log-collection',
            match: ev => ev.src === 'unknown',
        },
    ];

    /* ------------------------------------------------------- aggregate rules */

    function groupBy(list, keyFn) {
        const m = new Map();
        list.forEach(x => {
            const k = keyFn(x);
            if (!k) return;
            if (!m.has(k)) m.set(k, []);
            m.get(k).push(x);
        });
        return m;
    }

    const aggregateRules = [
        {
            id: 'multi-country',
            sev: 'high',
            title: 'One account signing in from several countries',
            why: 'Geography alone is a weak signal — VPNs, roaming and corporate egress produce it constantly. It becomes meaningful when it appears alongside a new device, an unfamiliar ASN, or an absent MFA interaction.',
            actions: [
                'Rule out the boring explanations first: VPN, travel, inspection proxy, mobile carrier NAT, automation under a user identity.',
                'Contact the user out of band — phone or chat, never email.',
                'If real: revoke sessions and tokens first, then reset, then audit authentication methods.',
            ],
            link: '../#/play/pro-impossible-travel',
            run(events) {
                const out = [];
                const signins = events.filter(e => e.src === 'signin' && e.result === 'success' && e.country);
                groupBy(signins, e => e.actor.toLowerCase()).forEach((list, user) => {
                    const countries = Array.from(new Set(list.map(e => e.country)));
                    if (countries.length > 2) {
                        out.push({ detail: user + ' — ' + countries.length + ' countries: ' + countries.join(', '), events: list });
                    }
                });
                return out;
            },
        },
        {
            id: 'spray-then-success',
            sev: 'critical',
            title: 'Repeated failures followed by a success',
            why: 'The signature of password spraying or credential stuffing that eventually worked. The success is the part that matters, and it is easy to miss in a list sorted by time.',
            actions: [
                'Treat the succeeding account as compromised: revoke sessions, reset, audit persistence.',
                'Check how many other accounts were attempted from the same source.',
                'Confirm smart lockout and legacy authentication blocking are both in place.',
            ],
            link: '../#/play/pro-user-clicked',
            run(events) {
                const out = [];
                const signins = events.filter(e => e.src === 'signin');
                groupBy(signins, e => e.actor.toLowerCase()).forEach((list, user) => {
                    const sorted = list.slice().sort((a, b) => (a.ts || 0) - (b.ts || 0));
                    const failures = sorted.filter(e => e.result !== 'success');
                    const success = sorted.filter(e => e.result === 'success');
                    if (failures.length >= 5 && success.length) {
                        const firstSuccess = success[0];
                        const before = failures.filter(f => f.ts && firstSuccess.ts && f.ts < firstSuccess.ts);
                        if (before.length >= 5) {
                            out.push({
                                detail: user + ' — ' + before.length + ' failures before a successful sign-in',
                                events: before.slice(-5).concat([firstSuccess]),
                            });
                        }
                    }
                });
                return out;
            },
        },
        {
            id: 'rare-source',
            sev: 'medium',
            title: 'Sources seen only once or twice',
            why: 'Not suspicious on its own, but the fastest way to spot the one session that does not belong among hundreds that do. Read these first when you do not yet know what you are looking for.',
            actions: [
                'Compare each rare address against the user’s normal pattern and your own egress ranges.',
                'Pivot on any that also appear in the audit log — that combination is rarely innocent.',
            ],
            link: '../#/play/pro-log-collection',
            run(events) {
                const out = [];
                const withIp = events.filter(e => e.actorIp && e.src === 'signin' && e.result === 'success');
                const byIp = groupBy(withIp, e => e.actorIp);
                const rare = [];
                byIp.forEach((list, ip) => { if (list.length <= 2) rare.push({ ip, list }); });
                if (rare.length && rare.length <= 40) {
                    rare.forEach(r => out.push({
                        detail: r.ip + (r.list[0].country ? ' (' + r.list[0].country + ')' : '') +
                            ' — ' + r.list.length + ' sign-in' + (r.list.length === 1 ? '' : 's') +
                            ' for ' + Array.from(new Set(r.list.map(e => e.actor))).join(', '),
                        events: r.list,
                    }));
                }
                return out;
            },
        },
        {
            id: 'bulk-download',
            sev: 'high',
            title: 'Bulk file download or sync',
            why: 'Volume and rate are what separate exfiltration from work. A hundred downloads in two minutes is collection; five over an afternoon is somebody doing their job.',
            actions: [
                'Enumerate exactly what was taken and assess it for personal or regulated data.',
                'Start the notification clock from the moment you became aware, and record that timestamp.',
            ],
            link: '../#/play/pro-log-collection',
            run(events) {
                const out = [];
                const dl = events.filter(e => e.src === 'ual' &&
                    /^(FileDownloaded|FileSyncDownloadedFull|FileAccessed)$/i.test(e.action));
                groupBy(dl, e => e.actor.toLowerCase()).forEach((list, user) => {
                    if (list.length >= 50) out.push({ detail: user + ' — ' + list.length + ' file events', events: list.slice(0, 25) });
                });
                return out;
            },
        },
        {
            id: 'outbound-burst',
            sev: 'high',
            title: 'High outbound mail volume from one sender',
            why: 'During a mailbox compromise this is usually onward phishing to contacts and suppliers, or a fraudulent payment instruction being pushed out before anyone notices.',
            actions: [
                'Identify every recipient and warn them quickly, before the message lands.',
                'Purge the messages from internal recipients.',
                'Message trace expires in about 10 days — export it before anything else.',
            ],
            link: '../#/play/pro-inbox-rules',
            run(events) {
                const out = [];
                const sent = events.filter(e => e.src === 'trace' || (e.src === 'ual' && /^(Send|SendAs|SendOnBehalf)$/i.test(e.action)));
                groupBy(sent, e => e.actor.toLowerCase()).forEach((list, user) => {
                    if (list.length >= 25) out.push({ detail: user + ' — ' + list.length + ' outbound messages', events: list.slice(0, 25) });
                });
                return out;
            },
        },
        {
            id: 'chain',
            sev: 'critical',
            title: 'A sign-in followed within an hour by a persistence change',
            why: 'The sequence is the finding, far more than either event alone. Atypical sign-in → new authentication method, new application credential, new consent, new inbox rule or new device is the standard shape of a takeover being made permanent.',
            actions: [
                'Treat the identity as compromised and work the full persistence sweep.',
                'Revoke sessions and refresh tokens before resetting the password.',
                'Record the exact sequence and timestamps — this is the core of the timeline.',
            ],
            link: '../#/play/pro-entra-persistence',
            run(events) {
                const out = [];
                const HOUR = 60 * 60 * 1000;
                const persistence = events.filter(e => {
                    if (e.src !== 'audit' && e.src !== 'ual') return false;
                    const c = catalogueLookup(e.action);
                    return c && (c.sev === 'critical' || c.sev === 'high');
                });
                const signins = events.filter(e => e.src === 'signin' && e.result === 'success' && e.ts);
                persistence.forEach(p => {
                    if (!p.ts || !p.actor) return;
                    const near = signins.filter(s =>
                        s.actor && s.actor.toLowerCase() === p.actor.toLowerCase() &&
                        p.ts - s.ts >= 0 && p.ts - s.ts <= HOUR);
                    if (near.length) {
                        const s = near[near.length - 1];
                        out.push({
                            detail: p.actor + ' — sign-in from ' + (s.actorIp || 'unknown') +
                                (s.country ? ' (' + s.country + ')' : '') +
                                ' then "' + p.action + '" ' +
                                Math.round((p.ts - s.ts) / 60000) + ' min later',
                            events: [s, p],
                        });
                    }
                });
                return out;
            },
        },
        {
            id: 'interrupt-then-success',
            sev: 'critical',
            title: 'Error 50199 followed by a success — the broker-flow phishing tell',
            why: 'AADSTS50199 is the "user confirmation required" interrupt. In current device-code and broker-client phishing (the Storm-2372 pattern) the victim sees exactly this prompt, confirms it for the attacker, and the success minutes later is the attacker’s session — often followed by device registration and a Primary Refresh Token. Legitimate 50199s exist, but the interrupt-then-success pair from the same account deserves to be read, not skimmed.',
            actions: [
                'Treat the success as the attacker’s until shown otherwise: check its IP, ASN and user agent against the user’s normal pattern.',
                'Check the audit log for a **device registered** by this user shortly after — that is the PRT being minted, and the device must be deleted, not just the tokens revoked.',
                'Revoke refresh tokens and sessions, then reset. The order matters.',
                'Block device code flow and restrict device registration in Conditional Access afterwards.',
            ],
            link: '../#/play/pro-device-code',
            run(events) {
                const out = [];
                const HOUR = 60 * 60 * 1000;
                const signins = events.filter(e => e.src === 'signin' && e.ts && e.actor);
                const interrupts = signins.filter(e => /failure 50199\b/.test(e.result || ''));
                interrupts.forEach(i => {
                    const after = signins.filter(s =>
                        s.result === 'success' &&
                        s.actor.toLowerCase() === i.actor.toLowerCase() &&
                        s.ts - i.ts > 0 && s.ts - i.ts <= HOUR);
                    if (after.length) {
                        out.push({
                            detail: i.actor + ' — 50199 interrupt, then success ' +
                                Math.round((after[0].ts - i.ts) / 60000) + ' min later from ' +
                                (after[0].actorIp || 'unknown'),
                            events: [i, after[0]],
                        });
                    }
                });
                return out;
            },
        },
        {
            id: 'fast-travel',
            sev: 'high',
            title: 'Successful sign-ins from two countries within two hours',
            why: 'Multi-country alone is weak — this is the stronger version, with the clock attached. Two successes from different countries closer together than a plane could manage means at least one of them is not the user: a VPN, a proxy, corporate egress, or an attacker. The pair is printed so you can judge which.',
            actions: [
                'Identify which of the two sources is normal for this user — the other one is the question.',
                'Rule out the boring answers: VPN and mobile-carrier egress produce this constantly. ASN and user agent settle it faster than geography.',
                'If neither source can be explained, treat it as an active session from stolen credentials or a stolen token: revoke first, reset second.',
            ],
            link: '../#/play/pro-impossible-travel',
            run(events) {
                const out = [];
                const WINDOW = 2 * 60 * 60 * 1000;
                const signins = events.filter(e =>
                    e.src === 'signin' && e.result === 'success' && e.ts && e.country && e.actor);
                groupBy(signins, e => e.actor.toLowerCase()).forEach((list, user) => {
                    const sorted = list.slice().sort((a, b) => a.ts - b.ts);
                    for (let i = 1; i < sorted.length; i++) {
                        const a = sorted[i - 1], b = sorted[i];
                        if (a.country !== b.country && b.ts - a.ts <= WINDOW) {
                            out.push({
                                detail: user + ' — ' + a.country + ' then ' + b.country + ' ' +
                                    Math.round((b.ts - a.ts) / 60000) + ' min apart',
                                events: [a, b],
                            });
                            break;   /* one finding per user keeps the noise down */
                        }
                    }
                });
                return out;
            },
        },
    ];

    /* ------------------------------------------------------------- the run */

    /**
     * Apply everything. Returns findings sorted by severity, each carrying the
     * events that produced it so the analyst can read the evidence rather than
     * trust the label.
     */
    function run(events) {
        const findings = [];

        /* Catalogue-driven: audit and Purview operations. */
        const byOp = new Map();
        events.forEach(ev => {
            if (ev.src !== 'audit' && ev.src !== 'ual') return;
            const entry = catalogueLookup(ev.action);
            if (!entry) return;
            if (!byOp.has(entry.op)) byOp.set(entry.op, { entry, events: [] });
            byOp.get(entry.op).events.push(ev);
        });
        byOp.forEach(({ entry, events: evs }) => {
            findings.push({
                id: 'op:' + entry.op,
                sev: entry.sev,
                title: entry.op,
                why: entry.means,
                check: entry.check || [],
                actions: entry.actions || [],
                link: entry.link ? '../' + entry.link : '',
                events: evs,
                count: evs.length,
                source: 'catalogue',
            });
        });

        /* Event rules. */
        eventRules.forEach(rule => {
            const hits = events.filter(ev => {
                try { return rule.match(ev); } catch (e) { return false; }
            });
            if (!hits.length) return;
            findings.push({
                id: rule.id, sev: rule.sev, title: rule.title, why: rule.why,
                check: [], actions: rule.actions, link: rule.link,
                events: hits, count: hits.length, source: 'rule',
            });
        });

        /* Aggregate rules. */
        aggregateRules.forEach(rule => {
            let groups = [];
            try { groups = rule.run(events) || []; } catch (e) { groups = []; }
            if (!groups.length) return;
            findings.push({
                id: rule.id, sev: rule.sev, title: rule.title, why: rule.why,
                check: [], actions: rule.actions, link: rule.link,
                events: groups.reduce((a, g) => a.concat(g.events), []),
                groups: groups,
                count: groups.length, source: 'aggregate',
            });
        });

        const ORDER = { critical: 0, high: 1, medium: 2, info: 3 };
        findings.sort((a, b) => (ORDER[a.sev] ?? 9) - (ORDER[b.sev] ?? 9) || b.count - a.count);
        return findings;
    }

    /**
     * What is missing. A phishing investigation that only ever looked at
     * interactive sign-ins has not finished, and the tool should say so
     * rather than presenting a confident-looking empty result.
     */
    function coverage(events) {
        const present = new Set(events.map(e => e.src));
        const kinds = new Set(events.filter(e => e.src === 'signin').map(e => e.kind));
        const gaps = [];

        if (!present.has('signin')) {
            gaps.push({ sev: 'critical', text: '**No sign-in logs loaded.** You cannot establish how or when access happened without them.' });
        } else if (!kinds.has('non-interactive') && !kinds.has('csv')) {
            gaps.push({ sev: 'high', text: '**Only interactive sign-ins appear to be loaded.** Replayed session tokens show up in the *non-interactive* table — export that tab too, plus service principal sign-ins.' });
        }
        if (!present.has('audit')) {
            gaps.push({ sev: 'critical', text: '**No audit logs loaded.** Sign-ins tell you they got in; audit logs tell you what they left behind. This is where application credentials, consent, role assignments and federation changes live.' });
        }
        if (!present.has('ual')) {
            gaps.push({ sev: 'high', text: '**No Purview / Unified Audit Log loaded.** Without it you cannot say what was read, sent, forwarded, downloaded or searched — which is what a breach assessment actually turns on.' });
        }
        if (!present.has('trace')) {
            gaps.push({ sev: 'medium', text: 'No message trace loaded. It expires in roughly 10 days, so export it early even if you do not need it yet.' });
        }
        gaps.push({ sev: 'info', text: 'Graph activity logs are never in a portal export — they exist only if a diagnostic setting was configured beforehand. If you do not have them, note the gap and enable them afterwards.' });
        return gaps;
    }

    window.LS_RULES = { run, coverage, catalogueLookup, norm, eventRules, aggregateRules };
})();
