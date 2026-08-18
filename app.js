/* ==========================================================================
   Breachlight: app.js
   --------------------------------------------------------------------------
   Routing, search, the structural audit and boot. Presentation lives in
   pages.js; primitives live in core.js.

   Load order: core.js → data-*.js → pages.js → app.js

   Run BL.audit() in the console after any data edit. It is the gate: it
   validates every tree path, every cross-reference and every link target,
   including the audit-operation catalogue that Logscope shares.
   ========================================================================== */

(function () {
    'use strict';

    const VERSION = '2.2.0';

    const C = window.BLC;
    const P = window.BLP;
    const { el, plain, $ } = C;

    const TREES = window.BL_TREES || [];
    const PLAYS = window.BL_PLAYS || [];
    const PLAY_CATS = window.BL_PLAY_CATS || [];
    const TERMS = window.BL_TERMS || [];
    const TERM_CATS = window.BL_CATS || [];
    const DEFEND = window.BL_DEFEND || [];
    const DEFEND_CATS = window.BL_DEFEND_CATS || [];
    const AUDIT_OPS = window.BL_AUDIT_OPS || [];
    const LOG_SOURCES = window.BL_LOG_SOURCES || [];
    const SYMPTOMS = window.BL_SYMPTOMS || [];
    const SYMPTOM_GROUPS = window.BL_SYMPTOM_GROUPS || [];

    const main = $('#main');

    /* ---------------------------------------------------------------- search */

    /**
     * Three weighted fields: title, keys, body. Whole-word beats substring, and
     * matching every term as a whole word gets a bonus. Someone typing
     * "money gone from bank" should not be beaten by an incidental "money".
     */
    let INDEX = null;

    function buildIndex() {
        const idx = [];
        const push = (kind, id, title, sub, href, keys, body, aud) =>
            idx.push({
                kind, id, href, aud,
                title, sub,
                t: title.toLowerCase(),
                k: (keys || '').toLowerCase(),
                b: body.toLowerCase(),
            });

        TREES.forEach(t => {
            const body = [t.lede].concat(Object.keys(t.nodes).map(n => {
                const nd = t.nodes[n];
                return nd.result ? nd.result + ' ' + (nd.steps || []).join(' '): nd.q + ' ' + (nd.options || []).map(o => o.a).join(' ');
            })).join(' ');
            push('triage', t.id, t.title, t.lede, '#/t/' + t.id, t.keys, plain(body), t.aud);
        });

        PLAYS.forEach(p => {
            const body = [p.lede, p.clock || ''].concat(p.signs || []).concat((p.sections || []).reduce((a, s) => a.concat([s.h], s.steps || []), [])).join(' ');
            push('playbook', p.id, p.title, p.lede, '#/play/' + p.id, p.keys, plain(body), p.aud);
        });

        TERMS.forEach(t => {
            const body = [t.what, t.eg || ''].concat(t.spot || []).concat(t.also || []).join(' ');
            push('term', t.id, t.term, t.what, '#/terms/' + t.id, t.keys, plain(body), t.aud);
        });

        DEFEND.forEach(d => {
            const body = [d.lede].concat(d.steps || []).concat((d.detail || []).reduce((a, s) => a.concat([s.h], s.p || []), [])).join(' ');
            push('defence', d.id, d.title, d.lede, '#/defend/' + d.id, d.keys, plain(body), d.aud);
        });

        /* Audit operations and log sources are searchable in their own right: people arrive having typed the exact operation name from an alert. */
        AUDIT_OPS.forEach(o => {
            const body = [o.means].concat(o.check || []).concat(o.actions || []).concat(o.aka || []).join(' ');
            push('audit event', o.op, o.op, o.means, '#/play/pro-audit-triage',
                (o.aka || []).join(' ') + ' ' + (o.keys || '') + ' audit event operation log', plain(body), 'pro');
        });

        LOG_SOURCES.forEach(s => {
            const body = [s.what, s.fields, s.retention].concat(s.holds || []).concat(s.exportHow || []).join(' ');
            push('log source', s.id, s.name, s.what, '#/play/pro-log-collection',
                (s.aka || []).join(' ') + ' log export retention which logs', plain(body), 'pro');
        });

        /* Symptoms are indexed under the reader's own phrasing. "unread mail
           marked read" should land here before anywhere else. */
        SYMPTOMS.forEach(s => {
            push('symptom', s.id, s.see, s.means, s.link, s.keys, plain(s.means), s.aud);
        });

        return idx;
    }

    function scoreField(field, term) {
        if (!field) return 0;
        if (field.indexOf(term) < 0) return 0;
        const whole = new RegExp('(^|[^a-z0-9])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z0-9]|$)');
        return whole.test(field) ? 1 : 0.45;
    }

    function search(q) {
        if (!INDEX) INDEX = buildIndex();
        const terms = q.toLowerCase().split(/\s+/).filter(t => t.length > 1);
        if (!terms.length) return [];

        const aud = C.getAud();
        const out = [];
        INDEX.forEach(it => {
            let score = 0, allWhole = true;
            terms.forEach(term => {
                const st = scoreField(it.t, term);
                const sk = scoreField(it.k, term);
                const sb = scoreField(it.b, term);
                if (Math.max(st, sk, sb) < 1) allWhole = false;
                score += st * 5 + sk * 3 + sb * 1;
            });
            if (score <= 0) return;
            if (allWhole) score *= 1.6;
            if (it.aud === aud) score *= 1.25;
            out.push({ it, score });
        });

        return out.sort((a, b) => b.score - a.score).slice(0, 40);
    }

    function pageSearch(q) {
        const frag = document.createDocumentFragment();
        const hits = search(q);
        frag.appendChild(C.pageHead('Search',
            hits.length ? hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + q + '”' : 'Nothing found for “' + q + '”',
            '🔍',
            hits.length ? null : 'Try a plainer word. What you did, not what it is called. "I clicked a link", "money gone", "code", "QR", "encrypted", "dcsync", "device code".'));

        if (!hits.length) {
            const jump = el('div', { class: 'jump' });
            [['I clicked a link', '#/play/clicked-link'], ['Money is gone', '#/play/card-fraud'],
            ['A user was phished', '#/t/pro-phish'], ['Which logs do I pull?', '#/play/pro-log-collection'],
            ['Start the triage guide', '#/triage'], ['Browse the glossary', '#/terms']]
                .forEach(([t, h]) => jump.appendChild(el('a', { class: 'jump-link', href: h }, t)));
            frag.appendChild(jump);

            /* A search that found nothing is the single most useful thing a
            reader can report, so ask for it here rather than on the About page. */
            frag.appendChild(el('div', { class: 'btn-row' }, [
                el('a', {
                    class: 'btn ghost',
                    href: 'mailto:breachlight@labidi.eu?subject=' +
                    encodeURIComponent('Breachlight: nothing found for "' + q + '"') +
                    '&body=' + encodeURIComponent('I searched for: ' + q + '\n\n' +
                    'What I was hoping to find:\n\n\n' +
                    '---\nBreachlight v' + VERSION),
                }, '✉ Tell us this word found nothing'),
            ]));
            return frag;
        }

        const list = el('div', { class: 'hits' });
        hits.forEach(h => {
            const a = el('a', { class: 'hit', href: h.it.href });
            a.appendChild(el('span', { class: 'kind', text: h.it.kind }));
            a.appendChild(el('b', { text: h.it.title }));
            a.appendChild(el('small', { text: plain(h.it.sub).slice(0, 190) }));
            list.appendChild(a);
        });
        frag.appendChild(list);
        return frag;
    }

    /* ---------------------------------------------------------------- router */

    /** decodeURIComponent that cannot take the router down with it. */
    function safeDecode(s) {
        try { return decodeURIComponent(s); } catch (e) { return s; }
    }

    let lastHash = null;

    function render() {
        const raw = (location.hash || '#/').replace(/^#\/?/, '');
        const parts = raw.split('/').filter(Boolean).map(safeDecode);
        const head = parts[0] || '';

        let frag, railId = head;
        switch (head) {
            case '': frag = P.home(); railId = ''; break;
            case 'triage': frag = P.triage(null); break;
            case 't': frag = P.triage(parts[1]); railId = 'triage'; break;
            case 'signs': frag = P.signs(); break;
            case 'plays': frag = P.plays(); break;
            case 'play': frag = P.play(parts[1]); railId = 'plays'; break;
            case 'terms': frag = P.terms(parts[1]); railId = 'terms'; break;
            case 'defend': frag = P.defend(parts[1]); railId = 'defend'; break;
            case 'about': frag = P.about(VERSION); break;
            case 'q': frag = pageSearch(parts.slice(1).join('/')); railId = ''; break;
            default: frag = P.missing(); railId = '';
        }

        main.textContent = '';
        main.appendChild(frag);
        C.markRail(railId);

        /* Scroll to the top on real navigation, but not when re-rendering the
           same route (glossary filter chips, audience switch). */
        const changed = lastHash !== location.hash;
        lastHash = location.hash;
        if (changed && (!parts[1] || head === 'q')) window.scrollTo(0, 0);

        const TITLES = {
            '': 'Breachlight, what to do the moment after you clicked',
            triage: 'Triage', t: 'Triage', signs: 'Symptoms', plays: 'Playbooks', play: 'Playbook',
            terms: 'Glossary', defend: 'Defence bench', about: 'About', q: 'Search',
        };
        const label = TITLES[head];
        document.title = head === '' ? TITLES[''] : (label ? label + ' · Breachlight' : 'Breachlight');
    }

    /* ----------------------------------------------------------------- audit */

    /**
     * Structural validation. Every tree option must point at a node that
     * exists, every path must terminate, and every cross-reference must
     * resolve. Run BL.audit() in the console.
     */
    function audit() {
        const problems = [];
        const ids = { play: {}, term: {}, defend: {}, tree: {} };
        PLAYS.forEach(p => { if (ids.play[p.id]) problems.push('duplicate play id: ' + p.id); ids.play[p.id] = 1; });
        TERMS.forEach(t => { if (ids.term[t.id]) problems.push('duplicate term id: ' + t.id); ids.term[t.id] = 1; });
        DEFEND.forEach(d => { if (ids.defend[d.id]) problems.push('duplicate defend id: ' + d.id); ids.defend[d.id] = 1; });
        TREES.forEach(t => { if (ids.tree[t.id]) problems.push('duplicate tree id: ' + t.id); ids.tree[t.id] = 1; });

        const LINKS = [
            ['#/play/', 'play'], ['#/defend/', 'defence'],
            ['#/t/', 'tree'], ['#/terms/', 'term'],
        ];
        const bagFor = { play: ids.play, defence: ids.defend, tree: ids.tree, term: ids.term };

        function checkLink(link, where) {
            if (!link) return;
            const match = LINKS.filter(l => link.indexOf(l[0]) === 0)[0];
            if (match) {
                const target = link.slice(match[0].length);
                if (!bagFor[match[1]][target]) problems.push(where + ' links to missing ' + match[1] + ' "' + target + '"');
            } else if (link.indexOf('#/') === 0 && link.split('/').length > 2) {
                problems.push(where + ' has an unrecognised link "' + link + '"');
            }
        }

        TREES.forEach(tree => {
            const where = 'tree "' + tree.id + '"';
            if (!tree.nodes[tree.start]) problems.push(where + ': start node "' + tree.start + '" missing');
            const reached = {};
            const walk = (id, path) => {
                if (path.indexOf(id) >= 0) { problems.push(where + ': loop at "' + id + '"'); return; }
                const node = tree.nodes[id];
                if (!node) { problems.push(where + ': missing node "' + id + '"'); return; }
                reached[id] = 1;
                if (node.result) {
                    if (!node.steps || !node.steps.length) problems.push(where + ': result "' + id + '" has no steps');
                    checkLink(node.link, where + ': result "' + id + '"');
                    return;
                }
                if (!node.options || !node.options.length) { problems.push(where + ': question "' + id + '" has no options'); return; }
                node.options.forEach(o => walk(o.to, path.concat([id])));
            };
            walk(tree.start, []);
            Object.keys(tree.nodes).forEach(id => {
                if (!reached[id]) problems.push(where + ': node "' + id + '" is unreachable');
            });
        });

        const xref = (item, list, bag, label, what) => {
            (list || []).forEach(id => {
                if (!bag[id]) problems.push(what + ' "' + item.id + '" references missing ' + label + ' "' + id + '"');
            });
        };
        const EMBEDS = ['auditops', 'logsources'];
        PLAYS.forEach(p => {
            xref(p, p.terms, ids.term, 'term', 'play');
            xref(p, p.defend, ids.defend, 'defence', 'play');
            xref(p, p.plays, ids.play, 'play', 'play');
            if (!PLAY_CATS.some(c => c.id === p.cat && c.aud === p.aud)) problems.push('play "' + p.id + '" has unknown category "' + p.cat + '" for audience ' + p.aud);
            if (!p.sections || !p.sections.length) problems.push('play "' + p.id + '" has no sections');
            if (p.render && EMBEDS.indexOf(p.render) < 0) problems.push('play "' + p.id + '" has unknown render "' + p.render + '"');
        });
        DEFEND.forEach(d => {
            xref(d, d.terms, ids.term, 'term', 'defence');
            if (!DEFEND_CATS.some(c => c.id === d.cat)) problems.push('defence "' + d.id + '" has unknown category "' + d.cat + '"');
            if (!d.steps || !d.steps.length) problems.push('defence "' + d.id + '" has no steps');
        });
        TERMS.forEach(t => {
            if (!TERM_CATS.some(c => c.id === t.cat)) problems.push('term "' + t.id + '" has unknown category "' + t.cat + '"');
        });

        /* The audit-operation catalogue is shared with Logscope, so a broken
           entry here degrades the tool's findings too. */
        const seenOps = {};
        AUDIT_OPS.forEach(o => {
            const key = o.op.toLowerCase();
            if (seenOps[key]) problems.push('duplicate audit operation: ' + o.op);
            seenOps[key] = 1;
            checkLink(o.link, 'audit operation "' + o.op + '"');
            if (!o.means) problems.push('audit operation "' + o.op + '" has no meaning');
            if (!o.actions || !o.actions.length) problems.push('audit operation "' + o.op + '" has no actions');
            if (['critical', 'high', 'medium', 'info'].indexOf(o.sev) < 0) problems.push('audit operation "' + o.op + '" has odd severity "' + o.sev + '"');
        });
        LOG_SOURCES.forEach(s => {
            if (!s.holds || !s.holds.length) problems.push('log source "' + s.id + '" has no contents');
            if (!s.exportHow || !s.exportHow.length) problems.push('log source "' + s.id + '" has no export instructions');
        });

        /* The symptom index routes frightened people. A broken link here is a
           dead end at the worst possible moment. */
        const seenSy = {};
        SYMPTOMS.forEach(s => {
            if (seenSy[s.id]) problems.push('duplicate symptom id: ' + s.id);
            seenSy[s.id] = 1;
            if (!s.see || !s.means) problems.push('symptom "' + s.id + '" is missing text');
            if (!SYMPTOM_GROUPS.some(g => g.id === s.group && g.aud === s.aud)) problems.push('symptom "' + s.id + '" has unknown group "' + s.group + '" for audience ' + s.aud);
            if (['critical', 'high', 'medium'].indexOf(s.sev) < 0) problems.push('symptom "' + s.id + '" has odd severity "' + s.sev + '"');
            if (!s.link) problems.push('symptom "' + s.id + '" has no link');
            else checkLink(s.link, 'symptom "' + s.id + '"');
        });

        const summary = {
            trees: TREES.length,
            nodes: TREES.reduce((n, t) => n + Object.keys(t.nodes).length, 0),
            plays: PLAYS.length,
            terms: TERMS.length,
            defences: DEFEND.length,
            auditOps: AUDIT_OPS.length,
            logSources: LOG_SOURCES.length,
            symptoms: SYMPTOMS.length,
            problems: problems,
        };
        if (problems.length) console.warn('Breachlight audit: ' + problems.length + ' problem(s)', problems);
        else console.log('Breachlight audit: clean.', summary);
        return summary;
    }

    /* ------------------------------------------------------------------ boot */

    function wireSearch() {
        const input = $('#q');
        let t = null;
        input.addEventListener('input', function () {
            clearTimeout(t);
            const v = input.value.trim();
            t = setTimeout(() => {
                /* location.replace, not assignment. Typing a query must not
                   deposit one history entry per keystroke. */
                if (!v) {
                    if (location.hash.indexOf('#/q/') === 0) location.replace('#/');
                    return;
                }
                location.replace('#/q/' + encodeURIComponent(v));
            }, 220);
        });
        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') { input.value = ''; input.blur(); location.hash = '#/'; }
        });
        document.addEventListener('keydown', e => {
            if (e.key === '/' && document.activeElement !== input && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)) {
                e.preventDefault(); input.focus(); input.select();
            }
        });
    }

    function wireInstall() {
        let deferred = null;
        const btn = $('#installBtn');
        window.addEventListener('beforeinstallprompt', e => {
            e.preventDefault(); deferred = e; btn.hidden = false;
        });
        btn.addEventListener('click', () => {
            if (!deferred) return;
            deferred.prompt();
            deferred.userChoice.then(() => { deferred = null; btn.hidden = true; });
        });
    }

    function boot() {
        C.applyAud();
        C.buildRail();
        C.onAudChange = () => { C.buildRail(); render(); };
        P.rerender = render;

        document.querySelectorAll('[data-aud-set]').forEach(b => {
            b.addEventListener('click', () => C.setAud(b.dataset.audSet));
        });
        wireSearch();
        wireInstall();
        $('#verLine').textContent = 'v' + VERSION;

        window.addEventListener('hashchange', render);
        render();

        if ('serviceWorker' in navigator && location.protocol !== 'file:') {
            window.addEventListener('load', () => {
                navigator.serviceWorker.register('sw.js').catch(() => { /* offline is a bonus, not a requirement */ });
            });
        }

        window.BL = { audit, search, VERSION };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
