/* ==========================================================================
   Logscope — app.js
   --------------------------------------------------------------------------
   The interface. Files in, findings and a timeline out.

   Reuses ../core.js for DOM building, storage and the toast, so this page and
   the main site build markup the same way — createElement and textContent
   only, never innerHTML. Log exports contain attacker-controlled strings
   (display names, subjects, user agents), so that rule is a security control
   here, not a style preference.

   Nothing in this file performs a network request.
   ========================================================================== */

(function () {
    'use strict';

    const C = window.BLC;
    const { el, rich, $, toast, tag, sevTag } = C;
    const PARSE = window.LS_PARSE;
    const RULES = window.LS_RULES;

    const MAX_BYTES = 25 * 1024 * 1024;
    const MAX_ROWS = 600;

    let FILES = [];      // { name, kind, count }
    let EVENTS = [];     // normalised, all files merged
    let FINDINGS = [];
    let view = 'findings';
    let filterText = '';
    let filterSrc = 'all';

    const out = () => $('#out');

    /* ------------------------------------------------------------- ingestion */

    function ingest(text, name) {
        let res;
        try {
            res = PARSE.parseText(text, name);
        } catch (e) {
            toast('Could not read ' + name);
            return;
        }
        if (!res.events.length) {
            FILES.push({ name: name, kind: res.kind, count: 0, note: res.note || 'No rows found.' });
            render();
            return;
        }
        FILES.push({ name: name, kind: res.kind, count: res.events.length });
        EVENTS = EVENTS.concat(res.events);
        EVENTS.sort((a, b) => (a.ts ? a.ts.getTime() : 0) - (b.ts ? b.ts.getTime() : 0));
        recompute();
        toast(res.events.length + ' events from ' + name);
        render();
    }

    function recompute() {
        FINDINGS = RULES.run(EVENTS);
    }

    function readFiles(fileList) {
        Array.prototype.slice.call(fileList).forEach(f => {
            if (f.size > MAX_BYTES) {
                toast(f.name + ' is over 25 MB — split it or filter the export');
                return;
            }
            const reader = new FileReader();
            reader.onload = () => ingest(String(reader.result || ''), f.name);
            reader.onerror = () => toast('Could not open ' + f.name);
            reader.readAsText(f);
        });
    }

    function clearAll() {
        FILES = []; EVENTS = []; FINDINGS = [];
        filterText = ''; filterSrc = 'all';
        render();
        toast('Cleared');
    }

    /* --------------------------------------------------------------- helpers */

    const fmt = d => {
        if (!d) return '—';
        const p = n => String(n).padStart(2, '0');
        return d.getUTCFullYear() + '-' + p(d.getUTCMonth() + 1) + '-' + p(d.getUTCDate()) +
            ' ' + p(d.getUTCHours()) + ':' + p(d.getUTCMinutes()) + ':' + p(d.getUTCSeconds());
    };

    function counts() {
        const users = new Set(), ips = new Set(), countries = new Set(), apps = new Set();
        let first = null, last = null;
        EVENTS.forEach(e => {
            if (e.actor) users.add(e.actor.toLowerCase());
            if (e.actorIp) ips.add(e.actorIp);
            if (e.country) countries.add(e.country);
            if (e.app) apps.add(e.app);
            if (e.ts) {
                if (!first || e.ts < first) first = e.ts;
                if (!last || e.ts > last) last = e.ts;
            }
        });
        return { users: users.size, ips: ips.size, countries: countries.size, apps: apps.size, first, last };
    }

    function filtered() {
        const q = filterText.trim().toLowerCase();
        return EVENTS.filter(e => {
            if (filterSrc !== 'all' && e.src !== filterSrc) return false;
            if (!q) return true;
            return [e.actor, e.action, e.actorIp, e.target, e.app, e.country, e.result, e.proto, e.ua]
                .join(' ').toLowerCase().indexOf(q) >= 0;
        });
    }

    /* ----------------------------------------------------------------- views */

    function viewDrop() {
        const frag = document.createDocumentFragment();

        const zone = el('div', { class: 'drop', id: 'drop', tabindex: '0', role: 'button' });
        zone.appendChild(el('p', { class: 'drop-big', text: '🔬 Drop your exported logs here' }));
        zone.appendChild(el('p', { class: 'muted' }, rich('or click to choose files — **nothing is uploaded**, everything is parsed in this browser')));
        zone.appendChild(el('p', { class: 'muted small', text: 'Entra sign-in logs · Entra audit logs · Purview / Unified Audit Log · message trace · JSON or CSV' }));

        const input = el('input', {
            type: 'file', id: 'fileInput', multiple: true,
            accept: '.json,.csv,.txt,.ndjson,application/json,text/csv,text/plain',
            style: 'display:none',
            onchange: function () { readFiles(this.files); this.value = ''; },
        });
        zone.appendChild(input);
        zone.addEventListener('click', () => input.click());
        zone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } });
        ['dragenter', 'dragover'].forEach(ev => zone.addEventListener(ev, e => {
            e.preventDefault(); zone.classList.add('over');
        }));
        ['dragleave', 'drop'].forEach(ev => zone.addEventListener(ev, e => {
            e.preventDefault(); zone.classList.remove('over');
        }));
        zone.addEventListener('drop', e => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
        });
        frag.appendChild(zone);

        const paste = el('details', { class: 'paste' });
        paste.appendChild(el('summary', { text: 'Or paste the text instead' }));
        const ta = el('textarea', {
            rows: '6', spellcheck: 'false',
            placeholder: 'Paste JSON or CSV rows here, then press Read.',
        });
        paste.appendChild(ta);
        paste.appendChild(el('div', { class: 'btn-row' }, [
            el('button', {
                class: 'btn', type: 'button',
                onclick: () => {
                    const v = ta.value.trim();
                    if (!v) { toast('Nothing pasted'); return; }
                    ingest(v, 'pasted text');
                    ta.value = '';
                },
            }, 'Read'),
        ]));
        frag.appendChild(paste);

        return frag;
    }

    function viewFindings() {
        const frag = document.createDocumentFragment();

        if (!FINDINGS.length) {
            frag.appendChild(el('p', { class: 'lede' }, rich(
                'No detections fired. That is worth something, but it is **not** the same as "nothing happened" — check the coverage tab for what you have not loaded yet.')));
            return frag;
        }

        const summary = el('div', { class: 'sev-row' });
        ['critical', 'high', 'medium', 'info'].forEach(s => {
            const n = FINDINGS.filter(f => f.sev === s).length;
            if (n) summary.appendChild(el('span', { class: 'sev-pill ' + s }, n + ' ' + s));
        });
        frag.appendChild(summary);

        FINDINGS.forEach(f => {
            const box = el('details', { class: 'finding ' + f.sev });
            const sum = el('summary');
            sum.appendChild(el('b', { text: f.title }));
            sum.appendChild(sevTag(f.sev));
            sum.appendChild(el('span', { class: 'count', text: f.count + (f.source === 'aggregate' ? ' pattern' + (f.count === 1 ? '' : 's') : ' event' + (f.count === 1 ? '' : 's')) }));
            box.appendChild(sum);

            box.appendChild(el('p', { class: 'why' }, rich(f.why)));

            if (f.check && f.check.length) {
                box.appendChild(el('p', { class: 'sub-h', text: 'Check before you decide' }));
                const ul = el('ul');
                f.check.forEach(x => ul.appendChild(el('li', null, rich(x))));
                box.appendChild(ul);
            }
            if (f.actions && f.actions.length) {
                box.appendChild(el('p', { class: 'sub-h', text: 'If it is real' }));
                const ol = el('ol');
                f.actions.forEach(x => ol.appendChild(el('li', null, rich(x))));
                box.appendChild(ol);
            }

            if (f.groups) {
                box.appendChild(el('p', { class: 'sub-h', text: 'Matches' }));
                const ul = el('ul', { class: 'matches' });
                f.groups.slice(0, 20).forEach(g => ul.appendChild(el('li', { text: g.detail })));
                box.appendChild(ul);
            }

            box.appendChild(el('p', { class: 'sub-h', text: 'Evidence' }));
            box.appendChild(eventTable(f.events.slice(0, 12)));
            if (f.events.length > 12) {
                box.appendChild(el('p', { class: 'muted small', text: 'showing 12 of ' + f.events.length + ' — use the timeline tab to see the rest' }));
            }

            if (f.link) {
                box.appendChild(el('div', { class: 'btn-row' }, [
                    el('a', { class: 'btn ghost', href: f.link }, 'Full playbook →'),
                ]));
            }
            frag.appendChild(box);
        });

        return frag;
    }

    function eventTable(list) {
        const wrap = el('div', { class: 'table-wrap' });
        const t = el('table');
        const thead = el('thead');
        const hr = el('tr');
        ['Time (UTC)', 'Source', 'Who', 'What', 'From', 'Result'].forEach(h => hr.appendChild(el('th', { text: h })));
        thead.appendChild(hr);
        t.appendChild(thead);

        const tb = el('tbody');
        list.forEach(e => {
            const tr = el('tr');
            tr.appendChild(el('td', { class: 'mono nowrap', text: fmt(e.ts) }));
            tr.appendChild(el('td', null, el('span', { class: 'src src-' + e.src, text: e.src })));
            tr.appendChild(el('td', { text: e.actor || '—' }));
            const what = el('td');
            what.appendChild(el('span', { text: e.action || '—' }));
            if (e.target) what.appendChild(el('small', { class: 'sub', text: '→ ' + e.target }));
            if (e.proto) what.appendChild(el('small', { class: 'sub', text: 'protocol: ' + e.proto }));
            if (e.extra && e.extra.paramText) what.appendChild(el('small', { class: 'sub', text: e.extra.paramText.slice(0, 160) }));
            tr.appendChild(what);
            const from = el('td');
            from.appendChild(el('span', { class: 'mono', text: e.actorIp || '—' }));
            if (e.country) from.appendChild(el('small', { class: 'sub', text: e.country }));
            tr.appendChild(from);
            const res = el('td');
            res.appendChild(el('span', { text: e.result || '—' }));
            if (e.mfa) res.appendChild(el('small', { class: 'sub', text: 'MFA: ' + e.mfa }));
            tr.appendChild(res);
            tb.appendChild(tr);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        return wrap;
    }

    function viewTimeline() {
        const frag = document.createDocumentFragment();
        const list = filtered();

        const bar = el('div', { class: 'filter-bar' });
        bar.appendChild(el('input', {
            type: 'search', placeholder: 'Filter — a user, an IP, an operation…',
            value: filterText,
            oninput: function () { filterText = this.value; renderInto(); },
        }));
        const sel = el('select', {
            onchange: function () { filterSrc = this.value; render(); },
        });
        [['all', 'All sources'], ['signin', 'Sign-ins'], ['audit', 'Audit'], ['ual', 'Purview'], ['trace', 'Message trace'], ['unknown', 'Unrecognised']]
            .forEach(([v, l]) => sel.appendChild(el('option', { value: v, selected: filterSrc === v || null, text: l })));
        bar.appendChild(sel);
        bar.appendChild(el('span', { class: 'muted small', text: list.length + ' of ' + EVENTS.length + ' events' }));
        frag.appendChild(bar);

        const holder = el('div', { id: 'tlHolder' });
        frag.appendChild(holder);

        function renderInto() {
            const l = filtered();
            holder.textContent = '';
            holder.appendChild(eventTable(l.slice(0, MAX_ROWS)));
            if (l.length > MAX_ROWS) {
                holder.appendChild(el('p', { class: 'muted small', text: 'Showing the first ' + MAX_ROWS + ' of ' + l.length + '. Narrow the filter to see more.' }));
            }
            const c = bar.querySelector('.muted');
            if (c) c.textContent = l.length + ' of ' + EVENTS.length + ' events';
        }
        renderInto();

        return frag;
    }

    function topList(title, map, note) {
        const box = el('div', { class: 'pivot' });
        box.appendChild(el('h3', { text: title }));
        if (note) box.appendChild(el('p', { class: 'muted small', text: note }));
        const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (!rows.length) { box.appendChild(el('p', { class: 'muted', text: 'nothing here' })); return box; }
        const ul = el('ul', { class: 'bars' });
        const max = rows[0][1];
        rows.forEach(([k, n]) => {
            const li = el('li');
            li.appendChild(el('span', { class: 'bar-label', text: k }));
            const track = el('span', { class: 'bar-track' });
            track.appendChild(el('i', { style: 'width:' + Math.max(3, Math.round(n / max * 100)) + '%' }));
            li.appendChild(track);
            li.appendChild(el('span', { class: 'bar-n', text: String(n) }));
            ul.appendChild(li);
        });
        box.appendChild(ul);
        return box;
    }

    function viewPivots() {
        const frag = document.createDocumentFragment();
        const tally = keyFn => {
            const m = new Map();
            EVENTS.forEach(e => { const k = keyFn(e); if (k) m.set(k, (m.get(k) || 0) + 1); });
            return m;
        };

        const grid = el('div', { class: 'pivot-grid' });
        grid.appendChild(topList('Source addresses', tally(e => e.actorIp), 'The one that does not belong is usually visible here first.'));
        grid.appendChild(topList('Accounts', tally(e => e.actor)));
        grid.appendChild(topList('Operations and applications', tally(e => e.action)));
        grid.appendChild(topList('Countries', tally(e => e.country)));
        grid.appendChild(topList('Client and user agent', tally(e => (e.ua || '').slice(0, 60))));
        grid.appendChild(topList('Authentication protocols', tally(e => e.proto)));
        frag.appendChild(grid);
        return frag;
    }

    function viewCoverage() {
        const frag = document.createDocumentFragment();
        frag.appendChild(el('p', { class: 'lede' }, rich(
            'What you have not loaded matters as much as what you have. A conclusion drawn from one log is a conclusion about one log.')));

        const gaps = RULES.coverage(EVENTS);
        gaps.forEach(g => {
            const box = el('div', { class: 'gap ' + g.sev });
            box.appendChild(sevTag(g.sev));
            box.appendChild(el('span', null, rich(g.text)));
            frag.appendChild(box);
        });

        frag.appendChild(el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn', href: '../#/play/pro-log-collection' }, 'How to export each one →'),
        ]));
        return frag;
    }

    /* ---------------------------------------------------------------- report */

    function buildReport() {
        const c = counts();
        const L = [];
        L.push('# Logscope triage summary');
        L.push('');
        L.push('Generated locally in the browser. Times are UTC.');
        L.push('');
        L.push('## Input');
        FILES.forEach(f => L.push('- ' + f.name + ' — ' + (PARSE.KIND_LABEL[f.kind] || f.kind) + ' — ' + f.count + ' events'));
        L.push('');
        L.push('- Events: ' + EVENTS.length);
        L.push('- Window: ' + fmt(c.first) + ' to ' + fmt(c.last));
        L.push('- Distinct accounts: ' + c.users + ' · addresses: ' + c.ips + ' · countries: ' + c.countries);
        L.push('');
        L.push('## Findings');
        if (!FINDINGS.length) L.push('None fired. This is not the same as "no compromise" — see gaps below.');
        FINDINGS.forEach(f => {
            L.push('');
            L.push('### [' + f.sev.toUpperCase() + '] ' + f.title + ' (' + f.count + ')');
            L.push('');
            L.push(f.why.replace(/\*\*/g, '**'));
            if (f.groups) {
                L.push('');
                f.groups.slice(0, 20).forEach(g => L.push('- ' + g.detail));
            }
            if (f.actions && f.actions.length) {
                L.push('');
                L.push('Actions:');
                f.actions.forEach((a, i) => L.push((i + 1) + '. ' + a));
            }
            L.push('');
            L.push('Sample evidence:');
            f.events.slice(0, 8).forEach(e => {
                L.push('- ' + fmt(e.ts) + ' | ' + e.src + ' | ' + (e.actor || '-') + ' | ' + (e.action || '-') +
                    ' | ' + (e.actorIp || '-') + (e.country ? ' (' + e.country + ')' : '') + ' | ' + (e.result || '-'));
            });
        });
        L.push('');
        L.push('## Evidence gaps');
        RULES.coverage(EVENTS).forEach(g => L.push('- [' + g.sev + '] ' + g.text.replace(/\*\*/g, '')));
        L.push('');
        L.push('---');
        L.push('Produced by Logscope (Breachlight). Detections are triage aids, not conclusions.');
        return L.join('\n');
    }

    function downloadReport() {
        if (!EVENTS.length) { toast('Load a log first'); return; }
        const text = buildReport();
        const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = el('a', { href: url, download: 'logscope-summary.md' });
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast('Report downloaded');
    }

    /* ----------------------------------------------------------------- shell */

    function render() {
        const root = out();
        root.textContent = '';

        if (!EVENTS.length && !FILES.length) {
            root.appendChild(viewDrop());
            root.appendChild(helpBlock());
            return;
        }

        /* loaded files */
        const files = el('div', { class: 'files' });
        FILES.forEach(f => {
            const chip = el('span', { class: 'file-chip' + (f.count ? '' : ' bad') });
            chip.appendChild(el('b', { text: f.name }));
            chip.appendChild(el('span', { text: ' · ' + (PARSE.KIND_LABEL[f.kind] || f.kind) + ' · ' + f.count }));
            files.appendChild(chip);
        });
        files.appendChild(el('button', { class: 'btn ghost tiny', type: 'button', onclick: clearAll }, 'Clear all'));
        root.appendChild(files);

        const c = counts();
        const stats = el('div', { class: 'stats' });
        [[EVENTS.length, 'events'], [c.users, 'accounts'], [c.ips, 'addresses'],
        [c.countries, 'countries'], [FINDINGS.filter(f => f.sev === 'critical').length, 'critical findings']]
            .forEach(([n, l]) => {
                const s = el('div', { class: 'stat' });
                s.appendChild(el('b', { text: String(n) }));
                s.appendChild(el('span', { text: l }));
                stats.appendChild(s);
            });
        if (c.first) {
            const s = el('div', { class: 'stat wide' });
            s.appendChild(el('b', { text: fmt(c.first) + '  →  ' + fmt(c.last) }));
            s.appendChild(el('span', { text: 'window (UTC)' }));
            stats.appendChild(s);
        }
        root.appendChild(stats);

        const tabs = el('div', { class: 'tabs', role: 'tablist' });
        [['findings', 'Findings', FINDINGS.length], ['timeline', 'Timeline', EVENTS.length],
        ['pivots', 'Pivots', ''], ['coverage', 'Gaps', '']]
            .forEach(([id, label, n]) => {
                tabs.appendChild(el('button', {
                    type: 'button', role: 'tab',
                    'aria-selected': String(view === id),
                    onclick: () => { view = id; render(); },
                }, label + (n === '' ? '' : ' (' + n + ')')));
            });
        tabs.appendChild(el('button', { type: 'button', class: 'tab-act', onclick: downloadReport }, '⤓ Report'));
        tabs.appendChild(el('button', {
            type: 'button', class: 'tab-act',
            onclick: () => { $('#fileMore').click(); },
        }, '+ Add file'));
        root.appendChild(tabs);

        const more = el('input', {
            type: 'file', id: 'fileMore', multiple: true, style: 'display:none',
            accept: '.json,.csv,.txt,.ndjson',
            onchange: function () { readFiles(this.files); this.value = ''; },
        });
        root.appendChild(more);

        const body = el('div', { class: 'tab-body' });
        if (view === 'findings') body.appendChild(viewFindings());
        else if (view === 'timeline') body.appendChild(viewTimeline());
        else if (view === 'pivots') body.appendChild(viewPivots());
        else body.appendChild(viewCoverage());
        root.appendChild(body);
    }

    function helpBlock() {
        const frag = document.createDocumentFragment();

        const priv = el('div', { class: 'privacy' });
        priv.appendChild(el('h2', { text: '🔒 Your logs never leave this device' }));
        priv.appendChild(el('p', null, rich(
            'This page has no server, no upload, no analytics and makes **no network requests at all**. Files are read with the browser’s own file reader and held in memory until you close the tab. You can disconnect from the network and it will work identically — that is the intended way to use it with real evidence.')));
        frag.appendChild(priv);

        const steps = el('div', { class: 'howto' });
        steps.appendChild(el('h2', { text: 'What to export, and from where' }));
        const dl = el('dl');
        [
            ['Entra sign-in logs', 'Entra admin centre → Monitoring & health → Sign-in logs → Download (JSON or CSV). **Export all four tabs** — interactive, non-interactive, service principal, managed identity. Non-interactive is where replayed tokens appear.'],
            ['Entra audit logs', 'Entra admin centre → Monitoring & health → Audit logs → Download. Prefer **JSON** — the CSV loses the old and new values that show what actually changed.'],
            ['Purview / Unified Audit Log', 'Purview → Audit → New search → Export CSV. The useful content is inside the `AuditData` column, which this tool unpacks for you.'],
            ['Message trace', 'Exchange admin centre → Mail flow → Message trace. Export this **first** — it expires in about 10 days.'],
        ].forEach(([t, d]) => {
            dl.appendChild(el('dt', { text: t }));
            dl.appendChild(el('dd', null, rich(d)));
        });
        steps.appendChild(dl);
        steps.appendChild(el('div', { class: 'btn-row' }, [
            el('a', { class: 'btn ghost', href: '../#/play/pro-log-collection' }, 'The full log guide →'),
            el('a', { class: 'btn ghost', href: '../#/play/pro-audit-triage' }, 'Audit event lookup →'),
        ]));
        frag.appendChild(steps);

        const caveat = el('div', { class: 'privacy warn' });
        caveat.appendChild(el('h2', { text: '⚠ What this is not' }));
        caveat.appendChild(el('p', null, rich(
            'A triage aid. It points you at rows worth reading and explains why they matter — it does **not** decide whether you have an incident. Detections are pattern matches without your context: your VPN egress, your service accounts, your change tickets. Read the evidence, not the label.')));
        frag.appendChild(caveat);

        return frag;
    }

    /* ------------------------------------------------------------------ boot */

    function boot() {
        document.documentElement.dataset.aud = 'pro';
        render();

        /* Drag anywhere on the page, not only over the box. */
        ['dragover', 'drop'].forEach(ev => document.addEventListener(ev, e => e.preventDefault()));
        document.addEventListener('drop', e => {
            if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) readFiles(e.dataTransfer.files);
        });

        window.LOGSCOPE = {
            events: () => EVENTS,
            findings: () => FINDINGS,
            report: buildReport,
            clear: clearAll,
        };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
})();
