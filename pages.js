/* ==========================================================================
   Breachlight — pages.js
   --------------------------------------------------------------------------
   Everything that turns data into a screen: the decision-tree walker and one
   renderer per route.

   Exposes window.BLP. Loads after core.js and all data files, before app.js.
   app.js owns routing, search and the structural audit; nothing in here knows
   about the URL beyond producing links.
   ========================================================================== */

(function () {
    'use strict';

    const C = window.BLC;
    const { el, append, rich, store, toast, tag, sevTag, sectionHead, pageHead, linkCard, codeBlock } = C;

    const TREES = window.BL_TREES || [];
    const PLAYS = window.BL_PLAYS || [];
    const PLAY_CATS = window.BL_PLAY_CATS || [];
    const TERMS = window.BL_TERMS || [];
    const TERM_CATS = window.BL_CATS || [];
    const DEFEND = window.BL_DEFEND || [];
    const DEFEND_CATS = window.BL_DEFEND_CATS || [];
    const LOG_SOURCES = window.BL_LOG_SOURCES || [];
    const AUDIT_OPS = window.BL_AUDIT_OPS || [];
    const SYMPTOMS = window.BL_SYMPTOMS || [];
    const SYMPTOM_GROUPS = window.BL_SYMPTOM_GROUPS || [];

    const AUD = () => C.getAud();
    const forAud = it => C.forAud(it);

    /* ------------------------------------------------------------ the trees */

    /**
     * The walker. A reader answers a few questions and lands on an instruction
     * rather than a page of prose. Every result hands off to a playbook — the
     * tree routes, it does not replace.
     */
    function renderTree(tree, autoStart, bare) {
        const sec = el('section', { class: 'card tree', id: 'tree-' + tree.id });
        if (!bare) {
            sec.appendChild(el('h3', null, [
                el('span', { class: 'g', 'aria-hidden': 'true', text: tree.glyph }),
                document.createTextNode(tree.title),
            ]));
            if (tree.lede) sec.appendChild(el('p', { class: 'lede' }, rich(tree.lede)));
        }

        const trail = el('ol', { class: 'trail' });
        /* aria-live so the new question or result is announced; focus follows
           the click so keyboard users are not dropped at the removed button. */
        const body = el('div', { 'aria-live': 'polite' });
        const controls = el('div', { class: 'btn-row' });
        append(sec, [trail, body, controls]);

        let stack = [];

        function goTo(id, moveFocus) {
            const node = tree.nodes[id];
            body.textContent = '';
            if (!node) {
                body.appendChild(el('p', { class: 'note', text: 'That branch is missing. Start again.' }));
                return;
            }

            if (node.result) {
                const r = el('div', { class: 'tree-result' });
                const h = el('h4', { tabindex: '-1' }, document.createTextNode(node.result));
                const t = sevTag(node.tag);
                if (t) h.appendChild(t);
                r.appendChild(h);
                const ol = el('ol');
                (node.steps || []).forEach(s => ol.appendChild(el('li', null, rich(s))));
                r.appendChild(ol);
                if (node.note) r.appendChild(el('p', { class: 'note' }, rich(node.note)));
                if (node.link) {
                    r.appendChild(el('div', { class: 'btn-row' }, [
                        el('a', { class: 'btn', href: node.link }, 'Open the full playbook →'),
                    ]));
                }
                body.appendChild(r);
            } else {
                body.appendChild(el('p', { class: 'tree-question', tabindex: '-1' }, rich(node.q)));
                if (node.hint) body.appendChild(el('p', { class: 'note', text: node.hint }));
                const opts = el('div', { class: 'tree-opts' });
                (node.options || []).forEach(o => {
                    opts.appendChild(el('button', {
                        type: 'button', class: 'tree-opt',
                        onclick: () => { stack.push({ id: id, answer: o.a }); goTo(o.to, true); },
                    }, [
                        el('span', null, o.a),
                        el('span', { class: 'arrow', 'aria-hidden': 'true', text: '→' }),
                    ]));
                });
                body.appendChild(opts);
            }

            if (moveFocus) {
                const target = body.querySelector('.tree-question, .tree-result h4');
                if (target) target.focus({ preventScroll: true });
            }

            trail.textContent = '';
            stack.forEach(s => trail.appendChild(el('li', { text: s.answer })));
            trail.hidden = !stack.length;

            controls.textContent = '';
            if (stack.length) {
                controls.appendChild(el('button', {
                    class: 'btn ghost', type: 'button',
                    onclick: () => { const prev = stack.pop(); goTo(prev.id, true); },
                }, '← Back'));
                controls.appendChild(el('button', {
                    class: 'btn ghost', type: 'button',
                    onclick: () => { stack = []; goTo(tree.start, true); },
                }, 'Start again'));
            }
        }

        if (autoStart) goTo(tree.start);
        else {
            body.appendChild(el('div', { class: 'btn-row' }, [
                el('button', { class: 'btn', type: 'button', onclick: () => goTo(tree.start, true) }, 'Start ▸'),
            ]));
        }
        return sec;
    }

    /* ------------------------------------------------------------------ home */

    function pageHome() {
        const frag = document.createDocumentFragment();
        const aud = AUD();

        /* First visit only: one paragraph that explains the two modes and the
           colour change, then never appears again. The toggle itself is not
           self-explanatory to someone who has never seen the site — and that
           is exactly who arrives here frightened. */
        if (!store.get('seenModes', false)) {
            const intro = el('div', { class: 'mode-intro', role: 'note' });
            intro.appendChild(el('p', null, rich(
                'This site has **two modes**, switched at the top right. **🙂 For me** (amber) is written for the person it happened to — plain words, no tools assumed. **🛡 For responders** (cyan) is for whoever holds the alert at work. The colour tells you which one you are reading, and nothing is locked away — each mode still links to the other.')));
            intro.appendChild(el('button', {
                class: 'btn ghost tiny', type: 'button',
                onclick: function () { store.set('seenModes', true); intro.remove(); },
            }, 'Got it'));
            frag.appendChild(intro);
        }

        const bar = el('div', { class: 'panic-bar' });
        if (aud === 'user') {
            bar.appendChild(el('h2', { text: '⚠ If money is moving right now' }));
            bar.appendChild(el('p', null, rich('Stop reading. Phone your bank on the number **printed on the back of your card** and say you are reporting fraud. Recall windows are measured in minutes. Everything else on this site will still be here in ten minutes; the money will not.')));
        } else {
            bar.appendChild(el('h2', { text: '⚠ Before you reset that password' }));
            bar.appendChild(el('p', null, rich('**Revoke the sessions and refresh tokens first.** A password reset does not invalidate an issued token, and skipping this is the single most common reason an attacker is still inside an hour after "remediation".')));
        }
        frag.appendChild(bar);

        frag.appendChild(pageHead(
            aud === 'pro' ? 'Responder mode' : 'Personal mode',
            'Breachlight',
            '🔦',
            aud === 'pro'
                ? 'Triage trees, containment playbooks and the vocabulary, arranged for the first hour. Written for the person holding the alert, not for the slide deck afterwards.'
                : 'Something has happened, or you think it might have. Answer a few questions and you will get a specific instruction instead of a lecture. Nothing you type here leaves your device.'
        ));

        const starter = TREES.filter(t => t.aud === aud)[0];
        if (starter) {
            frag.appendChild(sectionHead('Start here', 'A few questions, then a specific answer.'));
            frag.appendChild(renderTree(starter, true));
        }

        const quick = aud === 'pro'
            ? [
                ['A user was phished', '#/t/pro-phish'],
                ['Which logs do I pull?', '#/play/pro-log-collection'],
                ['Device code phishing', '#/play/pro-device-code'],
                ['Logged in without MFA', '#/play/pro-token-theft'],
                ['Enterprise app appeared', '#/play/pro-entra-app'],
                ['Suspicious inbox rule', '#/play/pro-inbox-rules'],
                ['Help desk was tricked', '#/play/pro-helpdesk'],
                ['Domain admin compromised', '#/play/pro-ad-tier0'],
                ['Ransomware', '#/play/pro-ransomware'],
                ['Who has to be told', '#/play/pro-comms'],
            ]
            : [
                ['Money has gone', '#/play/card-fraud'],
                ['I sent money myself', '#/play/money-transfer'],
                ['I typed my password in', '#/play/entered-password'],
                ['I gave someone a code', '#/play/gave-code'],
                ['My email is being read', '#/play/mailbox-compromise'],
                ['I clicked a link', '#/play/clicked-link'],
                ['I scanned a QR code', '#/play/qr-scanned'],
                ['My files are encrypted', '#/play/ransomware-home'],
                ['My computer seems infected', '#/play/computer-malware'],
                ['My phone seems infected', '#/play/phone-malware'],
                ['Someone is blackmailing me', '#/play/sextortion-threat'],
                ['I’m being locked out', '#/play/account-takeover'],
            ];
        frag.appendChild(sectionHead('Straight there', 'If you already know what happened.'));
        const jump = el('div', { class: 'jump' });
        quick.forEach(([t, h]) => jump.appendChild(el('a', { class: 'jump-link urgent', href: h }, t)));
        frag.appendChild(jump);

        frag.appendChild(sectionHead(aud === 'pro' ? 'The rooms' : 'The five rooms'));
        const grid = el('div', { class: 'grid' });
        grid.appendChild(linkCard('#/triage', '🧭', 'Triage',
            aud === 'pro'
                ? 'Alert routing and scoping questions for the first ten minutes.'
                : 'Answer questions, get an instruction. Start here if you are not sure what happened.',
            [tag(TREES.filter(forAud).length + ' guides')]));
        grid.appendChild(linkCard('#/signs', '👁', 'Symptoms',
            aud === 'pro'
                ? 'From a specific alert or observation straight to the playbook that handles it.'
                : 'Start from the thing you noticed — “mail marked read”, “no signal”, “a small strange charge” — and go straight to the answer.',
            [tag(SYMPTOMS.filter(forAud).length + ' signs')]));
        grid.appendChild(linkCard('#/plays', '📕', 'Playbooks',
            aud === 'pro'
                ? 'Containment, investigation and eradication steps per incident class.'
                : 'Step-by-step responses to each specific thing that can go wrong.',
            [tag(PLAYS.filter(p => p.aud === aud).length + ' playbooks')]));
        grid.appendChild(linkCard('#/terms', '📖', 'Glossary',
            'What the words mean, how to recognise each attack, and a real example of it.',
            [tag(TERMS.length + ' terms')]));
        grid.appendChild(linkCard('#/defend', '🛡', 'Defence bench',
            aud === 'pro'
                ? 'Controls that hold when awareness training does not — plus the advice to hand out.'
                : 'What actually reduces the chance of being here again, worth-per-minute first.',
            [tag(DEFEND.length + ' guides')]));
        if (aud === 'pro') {
            grid.appendChild(linkCard('logscope/', '🔬', 'Logscope',
                'Drop in exported Entra, Purview or message-trace logs and get a timeline and findings. Runs entirely in this browser — nothing is uploaded.',
                [tag('offline tool', 'ok')]));
        }
        frag.appendChild(grid);

        if (aud === 'user') {
            frag.appendChild(sectionHead('The three that matter most', 'If you do nothing else today.'));
            const three = el('div', { class: 'grid' });
            [['email-first', '📧'], ['mfa-upgrade', '🗝'], ['never-click', '🚷']].forEach(([id, g]) => {
                const d = DEFEND.filter(x => x.id === id)[0];
                if (d) three.appendChild(linkCard('#/defend/' + d.id, g, d.title, d.lede.split('. ')[0] + '.', [tag(d.effort, 'accent')]));
            });
            frag.appendChild(three);
        }

        return frag;
    }

    /* ---------------------------------------------------------------- triage */

    function pageTriage(id) {
        const frag = document.createDocumentFragment();
        const mine = TREES.filter(forAud);

        if (id) {
            const t = mine.filter(x => x.id === id)[0] || TREES.filter(x => x.id === id)[0];
            if (!t) return pageMissing();
            frag.appendChild(pageHead('Triage', t.title, t.glyph, t.lede));
            frag.appendChild(renderTree(t, true, true));
            frag.appendChild(el('div', { class: 'btn-row' }, [
                el('a', { class: 'btn ghost', href: '#/triage' }, '← All triage guides'),
            ]));
            return frag;
        }

        frag.appendChild(pageHead('Triage', 'Work out what you are dealing with', '🧭',
            AUD() === 'pro'
                ? 'Routing questions for the first ten minutes, and scoping walks for a compromised identity or directory. Each result hands off to a playbook.'
                : 'You do not have to know the name of what happened. Answer the questions and each guide will hand you to the right instructions.'));

        const grid = el('div', { class: 'grid wide' });
        mine.forEach(t => {
            grid.appendChild(linkCard('#/t/' + t.id, t.glyph, t.title, t.lede,
                [tag(Object.keys(t.nodes).length + ' steps')]));
        });
        frag.appendChild(grid);

        const other = TREES.filter(t => !forAud(t));
        if (other.length) {
            frag.appendChild(sectionHead(AUD() === 'pro' ? 'Written for the person affected' : 'Written for responders',
                'Different mode — still readable, switch at the top to make it the default.'));
            const g2 = el('div', { class: 'grid wide' });
            other.forEach(t => g2.appendChild(linkCard('#/t/' + t.id, t.glyph, t.title, t.lede, [tag('other mode')])));
            frag.appendChild(g2);
        }
        return frag;
    }

    /* ------------------------------------------------------------- playbooks */

    function playCard(p) {
        return linkCard('#/play/' + p.id, p.glyph, p.title, p.lede.split('. ')[0] + '.',
            [sevTag(p.urgency)], p.urgency === 'critical');
    }

    function pagePlays() {
        const frag = document.createDocumentFragment();
        const aud = AUD();
        frag.appendChild(pageHead('Playbooks', aud === 'pro' ? 'Response by incident class' : 'What to do about the specific thing that happened', '📕',
            aud === 'pro'
                ? 'Containment first, investigation second, notification always. Queries are starting points for your own environment, not answers.'
                : 'Find the one that matches. If nothing matches, use the triage guide and it will bring you back here.'));

        PLAY_CATS.filter(c => c.aud === aud).forEach(cat => {
            const items = PLAYS.filter(p => p.aud === aud && p.cat === cat.id);
            if (!items.length) return;
            frag.appendChild(sectionHead(cat.glyph + '  ' + cat.title));
            const grid = el('div', { class: 'grid wide' });
            items.forEach(p => grid.appendChild(playCard(p)));
            frag.appendChild(grid);
        });

        /* The other mode is reachable, not walled off: a responder advising a
           victim needs the personal steps, and vice versa. */
        const other = PLAYS.filter(p => p.aud !== aud);
        if (other.length) {
            frag.appendChild(sectionHead(
                aud === 'pro' ? '🙂  Written for the person it happened to' : '🛡  Written for responders',
                aud === 'pro'
                    ? 'Hand these to the affected user — they assume no tooling and no jargon.'
                    : 'What a security team does at their end. Useful if you are reporting this to one.'));
            const grid = el('div', { class: 'grid wide' });
            other.forEach(p => grid.appendChild(playCard(p)));
            frag.appendChild(grid);
        }
        return frag;
    }

    /* --------------------------------------------------- embedded catalogues */

    /**
     * The audit-operation lookup. Rendered from BL_AUDIT_OPS, which is the same
     * catalogue the Logscope rules use — so a finding in the tool and a lookup
     * here always agree.
     */
    function renderAuditOps() {
        const frag = document.createDocumentFragment();
        const CATS = [
            { id: 'apps', title: 'Applications, service principals and consent', glyph: '🤖' },
            { id: 'roles', title: 'Directory roles and PIM', glyph: '👑' },
            { id: 'federation', title: 'Domains and federation', glyph: '🏅' },
            { id: 'policy', title: 'Policy, trust and tenant settings', glyph: '🚦' },
            { id: 'auth', title: 'Authentication methods and resets', glyph: '🔐' },
            { id: 'devices', title: 'Devices', glyph: '💻' },
            { id: 'mailbox', title: 'Mailbox (Purview / Exchange)', glyph: '📬' },
            { id: 'files', title: 'Files, sharing and eDiscovery', glyph: '📂' },
            { id: 'org', title: 'Organisation-wide changes', glyph: '🏢' },
        ];

        CATS.forEach(cat => {
            const items = AUDIT_OPS.filter(o => o.cat === cat.id);
            if (!items.length) return;
            frag.appendChild(sectionHead(cat.glyph + '  ' + cat.title));
            items.forEach(o => {
                const box = el('details', { class: 'op' });
                const sum = el('summary');
                sum.appendChild(el('code', { class: 'op-name', text: o.op }));
                sum.appendChild(sevTag(o.sev));
                sum.appendChild(el('span', { class: 'op-src', text: o.src === 'ual' ? 'Purview' : 'Entra' }));
                box.appendChild(sum);

                box.appendChild(el('p', { class: 'op-means' }, rich(o.means)));

                if (o.aka && o.aka.length) {
                    box.appendChild(el('p', { class: 'also', text: 'also logged as: ' + o.aka.join(' · ') }));
                }
                if (o.check && o.check.length) {
                    box.appendChild(el('p', { class: 'spot-h', text: 'Check before you decide' }));
                    const ul = el('ul', { class: 'spot' });
                    o.check.forEach(s => ul.appendChild(el('li', null, rich(s))));
                    box.appendChild(ul);
                }
                if (o.actions && o.actions.length) {
                    box.appendChild(el('p', { class: 'spot-h', text: 'If it is real' }));
                    const ol = el('ol', { class: 'spot' });
                    o.actions.forEach(s => ol.appendChild(el('li', null, rich(s))));
                    box.appendChild(ol);
                }
                if (o.link) {
                    box.appendChild(el('div', { class: 'btn-row' }, [
                        el('a', { class: 'btn ghost', href: o.link }, 'Full playbook →'),
                    ]));
                }
                frag.appendChild(box);
            });
        });
        return frag;
    }

    /** The log-source reference, rendered from BL_LOG_SOURCES. */
    function renderLogSources() {
        const frag = document.createDocumentFragment();
        frag.appendChild(sectionHead('The sources', 'Marked “essential” means you cannot conclude an investigation without it.'));

        LOG_SOURCES.forEach(s => {
            const box = el('details', { class: 'op logsrc' });
            const sum = el('summary');
            sum.appendChild(el('span', { class: 'g', 'aria-hidden': 'true', text: s.glyph }));
            sum.appendChild(el('b', { text: s.name }));
            if (s.must) sum.appendChild(tag('essential', 'critical'));
            if (s.tool) sum.appendChild(tag('Logscope reads this', 'ok'));
            box.appendChild(sum);

            box.appendChild(el('p', { class: 'op-means' }, rich(s.what)));

            if (s.aka && s.aka.length) box.appendChild(el('p', { class: 'also', text: 'also called ' + s.aka.join(', ') }));

            box.appendChild(el('p', { class: 'spot-h', text: 'What it holds' }));
            const ul = el('ul', { class: 'spot' });
            s.holds.forEach(x => ul.appendChild(el('li', null, rich(x))));
            box.appendChild(ul);

            box.appendChild(el('p', { class: 'spot-h', text: 'Fields worth reading' }));
            box.appendChild(el('p', { class: 'eg' }, rich(s.fields)));

            box.appendChild(el('p', { class: 'spot-h', text: 'Retention' }));
            box.appendChild(el('p', null, rich(s.retention)));

            box.appendChild(el('p', { class: 'spot-h', text: 'How to export it' }));
            const ol = el('ol', { class: 'spot' });
            s.exportHow.forEach(x => ol.appendChild(el('li', null, rich(x))));
            box.appendChild(ol);

            if (s.gotchas && s.gotchas.length) {
                box.appendChild(el('p', { class: 'spot-h', text: 'Traps' }));
                const gu = el('ul', { class: 'spot' });
                s.gotchas.forEach(x => gu.appendChild(el('li', null, rich(x))));
                box.appendChild(gu);
            }
            frag.appendChild(box);
        });

        frag.appendChild(el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn', href: 'logscope/' }, '🔬 Open Logscope — read an export now'),
        ]));
        return frag;
    }

    const EMBEDS = { auditops: renderAuditOps, logsources: renderLogSources };

    function pagePlay(id) {
        const p = PLAYS.filter(x => x.id === id)[0];
        if (!p) return pageMissing();
        const frag = document.createDocumentFragment();

        const cat = PLAY_CATS.filter(c => c.id === p.cat)[0];
        frag.appendChild(pageHead(
            (p.aud === 'pro' ? 'Responder · ' : '') + (cat ? cat.title : 'Playbook'),
            p.title, p.glyph, p.lede));

        if (p.clock) {
            frag.appendChild(el('p', { class: 'play-clock' }, [
                el('span', { 'aria-hidden': 'true', text: '⏱' }),
                el('span', null, rich(p.clock)),
            ]));
        }

        if (p.signs && p.signs.length) {
            const s = el('div', { class: 'signs' });
            s.appendChild(el('h3', { text: 'This is you if…' }));
            const ul = el('ul');
            p.signs.forEach(x => ul.appendChild(el('li', null, rich(x))));
            s.appendChild(ul);
            frag.appendChild(s);
        }

        (p.sections || []).forEach(sec => {
            const box = el('div', { class: 'step-block ' + (sec.kind || 'do') });
            const h = el('h3', null, document.createTextNode(sec.h));
            if (sec.kind === 'first') h.appendChild(tag('do this first', 'critical'));
            if (sec.kind === 'dont') h.appendChild(tag('avoid', 'critical'));
            if (sec.kind === 'evidence') h.appendChild(tag('preserve', 'accent'));
            if (sec.kind === 'note') h.appendChild(tag('context', 'info'));
            box.appendChild(h);
            const list = el(sec.kind === 'dont' || sec.kind === 'note' ? 'ul' : 'ol');
            (sec.steps || []).forEach(x => list.appendChild(el('li', null, rich(x))));
            box.appendChild(list);
            frag.appendChild(box);
        });

        /* Some playbooks are a rendered catalogue rather than prose. */
        if (p.render && EMBEDS[p.render]) frag.appendChild(EMBEDS[p.render]());

        if (p.queries && p.queries.length) {
            frag.appendChild(sectionHead('Starting queries', 'Adapt to your own schema and retention. These are hypotheses, not answers.'));
            p.queries.forEach(q => frag.appendChild(codeBlock(q.label, q.lang, q.q)));
        }

        frag.appendChild(relatedBlock(p));

        frag.appendChild(el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn ghost', href: '#/plays' }, '← All playbooks'),
            el('a', { class: 'btn ghost', href: '#/triage' }, 'Back to triage'),
        ]));
        return frag;
    }

    function relatedBlock(p) {
        const frag = document.createDocumentFragment();
        const links = [];
        (p.terms || []).forEach(id => {
            const t = TERMS.filter(x => x.id === id)[0];
            if (t) links.push(el('a', { class: 'jump-link', href: '#/terms/' + t.id }, '📖 ' + t.term));
        });
        (p.defend || []).forEach(id => {
            const d = DEFEND.filter(x => x.id === id)[0];
            if (d) links.push(el('a', { class: 'jump-link', href: '#/defend/' + d.id }, '🛡 ' + d.title));
        });
        (p.plays || []).forEach(id => {
            const o = PLAYS.filter(x => x.id === id)[0];
            if (o && o.id !== p.id) links.push(el('a', { class: 'jump-link', href: '#/play/' + o.id }, '📕 ' + o.title));
        });
        if (!links.length) return frag;
        frag.appendChild(sectionHead('Read next'));
        const jump = el('div', { class: 'jump' });
        links.forEach(l => jump.appendChild(l));
        frag.appendChild(jump);
        return frag;
    }

    /* -------------------------------------------------------------- glossary */

    let termFilter = 'all';

    function termCard(t) {
        const box = el('section', { class: 'term', id: 'term-' + t.id });
        const h = el('h3', null, [
            el('span', { class: 'g', 'aria-hidden': 'true', text: t.glyph }),
            document.createTextNode(t.term),
        ]);
        const cat = TERM_CATS.filter(c => c.id === t.cat)[0];
        if (cat) h.appendChild(tag(cat.title, t.cat === 'defence' ? 'ok' : t.cat === 'pro' ? 'info' : ''));
        box.appendChild(h);

        const meta = [];
        if (t.also && t.also.length) meta.push('also called ' + t.also.join(', '));
        if (t.say) meta.push('said ' + t.say);
        if (meta.length) box.appendChild(el('p', { class: 'also', text: meta.join(' · ') }));

        box.appendChild(el('p', null, rich(t.what)));

        if (t.spot && t.spot.length) {
            box.appendChild(el('p', { class: 'spot-h', text: 'How to spot it' }));
            const ul = el('ul', { class: 'spot' });
            t.spot.forEach(s => ul.appendChild(el('li', null, rich(s))));
            box.appendChild(ul);
        }
        if (t.eg) box.appendChild(el('p', { class: 'eg' }, rich(t.eg)));
        return box;
    }

    function pageTerms(anchor) {
        const frag = document.createDocumentFragment();

        /* A direct link to a term must always be able to show it — a category
           filter left over from an earlier visit would silently hide it. */
        if (anchor) {
            const target = TERMS.filter(t => t.id === anchor)[0];
            if (target && termFilter !== 'all' && target.cat !== termFilter) termFilter = 'all';
        }

        frag.appendChild(pageHead('Glossary', 'What the words actually mean', '📖',
            'Every term someone might use at you — by a bank, an IT department or a news article — in plain language, with the tell that lets you recognise it and a real example.'));

        const az = el('div', { class: 'az' });
        const cats = [{ id: 'all', title: 'Everything', glyph: '✦' }].concat(TERM_CATS);
        cats.forEach(c => {
            az.appendChild(el('button', {
                type: 'button',
                'aria-pressed': String(termFilter === c.id),
                onclick: () => { termFilter = c.id; if (BLP.rerender) BLP.rerender(); },
            }, c.glyph + '  ' + c.title));
        });
        frag.appendChild(az);

        const shown = TERMS.filter(t => termFilter === 'all' || t.cat === termFilter);
        const cat = TERM_CATS.filter(c => c.id === termFilter)[0];
        if (cat) frag.appendChild(el('p', { class: 'lede', text: cat.blurb }));

        const grid = el('div', { class: 'grid wide' });
        shown.slice().sort((a, b) => a.term.localeCompare(b.term)).forEach(t => grid.appendChild(termCard(t)));
        frag.appendChild(grid);

        if (anchor) setTimeout(() => {
            const target = document.getElementById('term-' + anchor);
            if (target) {
                target.scrollIntoView({ block: 'center' });
                target.style.borderColor = 'var(--accent)';
            }
        }, 40);

        return frag;
    }

    /* --------------------------------------------------------------- defence */

    function pageDefend(id) {
        const frag = document.createDocumentFragment();

        if (id) {
            const d = DEFEND.filter(x => x.id === id)[0];
            if (!d) return pageMissing();
            const cat = DEFEND_CATS.filter(c => c.id === d.cat)[0];
            frag.appendChild(pageHead(cat ? cat.title : 'Defence', d.title, d.glyph, d.lede));

            frag.appendChild(el('div', { class: 'def-head' }, [
                tag(d.impact === 'high' ? 'high impact' : 'worth doing', d.impact === 'high' ? 'ok' : ''),
                tag(d.effort, 'accent'),
            ]));

            /* A checklist that remembers — the reader will come back to it. */
            const key = 'check.' + d.id;
            let done = store.get(key, []);
            const bar = el('div', { class: 'progress' }, el('i'));
            const list = el('ul', { class: 'checklist' });

            function paint() {
                const pct = d.steps.length ? Math.round(done.length / d.steps.length * 100) : 0;
                bar.firstChild.style.width = pct + '%';
            }

            d.steps.forEach((s, i) => {
                const li = el('li', { class: done.indexOf(i) >= 0 ? 'done' : '' });
                const cb = el('input', {
                    type: 'checkbox', id: 'ck-' + d.id + '-' + i,
                    checked: done.indexOf(i) >= 0 || null,
                    onchange: function () {
                        if (this.checked) { if (done.indexOf(i) < 0) done.push(i); }
                        else done = done.filter(x => x !== i);
                        li.className = this.checked ? 'done' : '';
                        store.set(key, done);
                        paint();
                    },
                });
                li.appendChild(cb);
                li.appendChild(el('label', { for: 'ck-' + d.id + '-' + i }, el('span', null, rich(s))));
                list.appendChild(li);
            });
            frag.appendChild(sectionHead('The checklist', 'Ticks are saved on this device only.'));
            frag.appendChild(bar);
            frag.appendChild(list);
            paint();

            (d.detail || []).forEach(sec => {
                const box = el('div', { class: 'step-block note' });
                box.appendChild(el('h3', { text: sec.h }));
                const ul = el('ul');
                sec.p.forEach(x => ul.appendChild(el('li', null, rich(x))));
                box.appendChild(ul);
                frag.appendChild(box);
            });

            frag.appendChild(relatedBlock(d));
            frag.appendChild(el('div', { class: 'btn-row' }, [
                el('a', { class: 'btn ghost', href: '#/defend' }, '← All defences'),
            ]));
            return frag;
        }

        frag.appendChild(pageHead('Defence bench', AUD() === 'pro' ? 'Controls that hold' : 'How not to be here again', '🛡',
            AUD() === 'pro'
                ? 'Awareness training does not scale against a proxy that shows the user a genuine login page. These are the controls that make a stolen credential insufficient by design.'
                : 'Ordered by how much good each one does per minute spent. The first three are worth more than everything else combined.'));

        /* Every defence is shown in both modes — a responder needs the personal
           advice to hand out, and a home user simply ignores the last sections.
           Responder mode only reorders, putting the technical ones first. */
        const PRO_FIRST = ['ad', 'org'];
        const cats = DEFEND_CATS.slice();
        if (AUD() === 'pro') {
            const rank = c => { const i = PRO_FIRST.indexOf(c.id); return i < 0 ? PRO_FIRST.length : i; };
            cats.sort((a, b) => rank(a) - rank(b));
        }

        cats.forEach(cat => {
            const items = DEFEND.filter(d => d.cat === cat.id);
            if (!items.length) return;
            frag.appendChild(sectionHead(cat.glyph + '  ' + cat.title));
            const grid = el('div', { class: 'grid wide' });
            items.forEach(d => grid.appendChild(linkCard('#/defend/' + d.id, d.glyph, d.title,
                d.lede.split('. ')[0] + '.',
                [tag(d.impact === 'high' ? 'high impact' : 'worth doing', d.impact === 'high' ? 'ok' : ''), tag(d.effort, 'accent')])));
            frag.appendChild(grid);
        });
        return frag;
    }

    /* ----------------------------------------------------------------- about */

    function pageAbout(version) {
        const frag = document.createDocumentFragment();
        frag.appendChild(pageHead('About', 'What this is, and what it is not', '🔦',
            'Breachlight is a triage reference for the moment after something has gone wrong online — and a bench of things worth doing before it does.'));

        const blocks = [
            {
                h: 'Two modes, one body of knowledge',
                kind: 'note',
                steps: [
                    '**Personal mode** is written for whoever it happened to. It assumes no jargon, no tooling and no colleagues, and it puts the thing with a deadline first.',
                    '**Responder mode** is written for whoever gets the alert. It assumes an identity provider, an EDR and a log platform, and it says containment before investigation because that ordering is where most responses go wrong.',
                    'The switch is at the top of every page. Content from the other mode is still reachable — it is a default, not a wall.',
                ],
            },
            {
                h: 'How it is built',
                kind: 'note',
                steps: [
                    'Static HTML, CSS and JavaScript. No framework, no build step, no dependencies.',
                    '**Zero external requests.** No fonts, no CDN, no analytics, no trackers. A page that tells you not to trust strange servers has no business calling any.',
                    'Everything you type, tick or drop in stays in this browser. There is no back end to send it to — which is what makes **Logscope** safe to use with real incident evidence.',
                    'It works offline once loaded, and can be installed as an app.',
                ],
            },
            {
                h: 'What it is not',
                kind: 'dont',
                steps: [
                    'Not legal advice, not financial advice, and not a substitute for your bank, your insurer or your lawyer.',
                    'Not a replacement for your employer’s incident process — if you have one, it wins.',
                    'Not jurisdiction-specific. Reporting routes, reimbursement rules and notification deadlines vary by country; where a rule is named here, verify it locally.',
                    'Not an authority on your tenant. Queries and detection rules are starting points that must be adapted to your own schema, licensing and retention.',
                    'Not a helpline. If a crime has been committed, report it to the police.',
                ],
            },
            {
                h: 'The three things worth remembering',
                kind: 'first',
                steps: [
                    '**Never take the link.** Go to the site yourself, from a bookmark or the app. This alone defeats most of what is described here.',
                    '**Never read a code aloud, to anyone, ever.** No legitimate organisation has ever needed one.',
                    '**Changing a password is not enough** — revoke the sessions too, or they stay inside.',
                ],
            },
        ];

        blocks.forEach(b => {
            const box = el('div', { class: 'step-block ' + b.kind });
            box.appendChild(el('h3', { text: b.h }));
            const ul = el('ul');
            b.steps.forEach(s => ul.appendChild(el('li', null, rich(s))));
            box.appendChild(ul);
            frag.appendChild(box);
        });

        frag.appendChild(sectionHead('Counts'));
        const grid = el('div', { class: 'grid' });
        [['🧭', TREES.length + ' triage guides', TREES.reduce((n, t) => n + Object.keys(t.nodes).length, 0) + ' decision points'],
        ['�', SYMPTOMS.length + ' symptoms', 'observations mapped straight to a playbook'],
        ['�📕', PLAYS.length + ' playbooks', PLAYS.filter(p => p.aud === 'user').length + ' personal · ' + PLAYS.filter(p => p.aud === 'pro').length + ' responder'],
        ['📖', TERMS.length + ' glossary terms', TERM_CATS.length + ' categories'],
        ['🛡', DEFEND.length + ' defence guides', DEFEND.reduce((n, d) => n + d.steps.length, 0) + ' checklist items'],
        ['🔔', AUDIT_OPS.length + ' audit operations', 'shared by the site and Logscope'],
        ['🪵', LOG_SOURCES.length + ' log sources', LOG_SOURCES.filter(s => s.tool).length + ' readable in Logscope']]
            .forEach(([g, a, b]) => {
                const c = el('div', { class: 'card' });
                c.appendChild(el('h3', null, [el('span', { class: 'g', 'aria-hidden': 'true', text: g }), document.createTextNode(a)]));
                c.appendChild(el('p', { text: b }));
                grid.appendChild(c);
            });
        frag.appendChild(grid);

        frag.appendChild(el('p', { class: 'muted' }, rich(
            'Version ' + version + '. Lives at breach.labidi.eu; built in the rami.party workshop. Found something wrong, out of date or hard to find? The most useful thing you can report is **the word you searched for that found nothing**.')));

        return frag;
    }

    /* -------------------------------------------------------------- symptoms */

    /**
     * The reverse of the trees: start from the thing you noticed. One click
     * from observation to instructions — no questions in between, because the
     * reader arriving here already has the observation in hand.
     */
    function symptomCard(s, groupGlyph) {
        const a = el('a', { class: 'card symptom' + (s.sev === 'critical' ? ' urgent' : ''), href: s.link });
        a.appendChild(el('h3', null, [
            el('span', { class: 'g', 'aria-hidden': 'true', text: groupGlyph }),
            document.createTextNode(s.see),
        ]));
        a.appendChild(el('p', null, rich(s.means)));
        const m = el('div', { class: 'meta' });
        m.appendChild(sevTag(s.sev));
        a.appendChild(m);
        return a;
    }

    function pageSigns() {
        const frag = document.createDocumentFragment();
        const aud = AUD();

        frag.appendChild(pageHead('Symptoms',
            aud === 'pro' ? 'From alert to playbook' : 'What am I seeing?', '👁',
            aud === 'pro'
                ? 'The common observations, mapped straight to the playbook that deals with them. For anything not listed, start at alert triage.'
                : 'Find the thing you noticed and it will take you straight to the instructions — no questions in between. If nothing matches, the **triage guide** works it out with you.'));

        SYMPTOM_GROUPS.filter(g => g.aud === aud).forEach(g => {
            const items = SYMPTOMS.filter(s => s.group === g.id);
            if (!items.length) return;
            frag.appendChild(sectionHead(g.glyph + '  ' + g.title));
            const grid = el('div', { class: 'grid wide' });
            items.forEach(s => grid.appendChild(symptomCard(s, g.glyph)));
            frag.appendChild(grid);
        });

        frag.appendChild(sectionHead('Nothing matches?', 'Two other ways in.'));
        const jump = el('div', { class: 'jump' });
        [[aud === 'pro' ? 'Start alert triage' : 'Answer a few questions instead', aud === 'pro' ? '#/t/pro-start' : '#/t/start'],
        ['Something feels wrong but nothing obvious happened', aud === 'pro' ? '#/t/pro-scope' : '#/play/not-sure'],
        ['Browse all playbooks', '#/plays']]
            .forEach(([t, h]) => jump.appendChild(el('a', { class: 'jump-link', href: h }, t)));
        frag.appendChild(jump);

        /* The other mode stays reachable — a responder recognises a user's
           description here, and a user can see what their IT team watches. */
        const otherAud = aud === 'pro' ? 'user' : 'pro';
        const otherGroups = SYMPTOM_GROUPS.filter(g => g.aud === otherAud);
        if (otherGroups.length) {
            frag.appendChild(sectionHead(
                aud === 'pro' ? '🙂  What the person affected notices' : '🛡  What a security team watches for',
                'Different mode — still readable, switch at the top to make it the default.'));
            const g2 = el('div', { class: 'grid wide' });
            otherGroups.forEach(g => {
                SYMPTOMS.filter(s => s.group === g.id).forEach(s => g2.appendChild(symptomCard(s, g.glyph)));
            });
            frag.appendChild(g2);
        }

        return frag;
    }

    function pageMissing() {
        const frag = document.createDocumentFragment();
        frag.appendChild(pageHead('Not found', 'That page does not exist', '🕳',
            'The link may be old, or mistyped. Everything is reachable from the rooms below.'));
        const jump = el('div', { class: 'jump' });
        C.PAGES.forEach(p => jump.appendChild(el('a', { class: 'jump-link', href: p.href }, p.label)));
        frag.appendChild(jump);
        return frag;
    }

    const BLP = {
        renderTree,
        home: pageHome, triage: pageTriage, plays: pagePlays, play: pagePlay,
        terms: pageTerms, defend: pageDefend, about: pageAbout, missing: pageMissing,
        signs: pageSigns,
        rerender: null,
    };

    window.BLP = BLP;
})();
