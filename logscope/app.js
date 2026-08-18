/* ==========================================================================
   Logscope: app.js
   --------------------------------------------------------------------------
   The interface. Files in, findings and a timeline out.

   Reuses ../core.js for DOM building, storage and the toast, so this page and
   the main site build markup the same way: createElement and textContent
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
    const SPLIT = window.LS_SPLIT;

    /* The analyser holds every row in memory, so it has a ceiling. Anything
       larger goes to the splitter, which streams and never holds the file. */
    const MAX_BYTES = 80 * 1024 * 1024;
    const MAX_ROWS = 600;

    let FILES = []; // { name, kind, count, table }
    let EVENTS = []; // normalised, all files merged
    let FINDINGS = [];
    let view = 'findings';
    let filterText = '';
    let filterSrc = 'all';
    let hideEmpty = false;          // timeline: drop rows with no time or no content
    let distinctBy = '';            // timeline: group by one field instead of listing
    let pendingBig = null;          // file waiting for the table splitter

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
            FILES.push({ name: name, kind: res.kind, count: 0, note: res.note || 'No rows found.', table: res.table || null });
            render();
            return;
        }
        FILES.push({ name: name, kind: res.kind, count: res.events.length, table: res.table || null });
        EVENTS = EVENTS.concat(res.events);
        EVENTS.sort((a, b) => (a.ts ? a.ts.getTime(): 0) - (b.ts ? b.ts.getTime(): 0));
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
                pendingBig = f;
                toast(f.name + ' is too big to analyse in one piece: sent to the table splitter.');
                render();
                /* after render, so we open the freshly built panel */
                const box = $('#splitBox');
                if (box) {
                    const chosen = $('#splitChosen');
                    if (chosen) chosen.textContent = f.name + '  \u00b7  ' + fmtSize(f.size);
                    box.open = true;
                    box.scrollIntoView({ block: 'center' });
                }
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

    /** Remove one file's events without touching the rest. */
    function removeFile(name) {
        FILES = FILES.filter(f => f.name !== name);
        EVENTS = EVENTS.filter(e => e.file !== name);
        recompute();
        render();
        toast('Removed ' + name);
    }

    /* --------------------------------------------------------------- helpers */

    const fmt = d => {
        if (!d) return 'n/a';
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
            if (hideEmpty && (!e.ts || (!e.actor && (!e.action || e.action.indexOf('(unrecognised') === 0)))) return false;
            if (!q) return true;
            return [e.actor, e.action, e.actorIp, e.target, e.app, e.country, e.result, e.proto, e.ua]
                .join(' ').toLowerCase().indexOf(q) >= 0;
        });
    }

    /* Fields the distinct view can group by. The accessor returns the value
       one row contributes; blanks group under (empty). */
    const DISTINCT_FIELDS = [
        ['result', 'Result', e => e.result],
        ['mfa', 'MFA', e => e.mfa],
        ['actor', 'Who', e => e.actor],
        ['action', 'What', e => e.action],
        ['ip', 'IP address', e => e.actorIp],
        ['country', 'Country', e => e.country],
        ['usertype', 'User type', e => e.extra && e.extra.userType],
        ['reason', 'Failure reason or detail', e => e.extra && (e.extra.failureReason || e.extra.resultReason || e.extra.detail)],
    ];

    /* ----------------------------------------------------------------- views */

    function viewDrop() {
        const frag = document.createDocumentFragment();

        const zone = el('div', { class: 'drop', id: 'drop', tabindex: '0', role: 'button' });
        zone.appendChild(el('p', { class: 'drop-big', text: '🔬 Drop your exported logs here' }));
        zone.appendChild(el('p', { class: 'muted' }, rich('or click to choose files. **nothing is uploaded**, everything is parsed in this browser')));
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
        frag.appendChild(splitBlock());

        return frag;
    }

    /* --------------------------------------------------- the table splitter */

    /**
     * A Purview export is one CSV with the whole record buried in an AuditData
     * JSON cell, which Excel cannot filter. This streams the file off disk and
     * writes joinable tables, so "show me everything from this IP" becomes a
     * column filter instead of a research project.
     *
     * Built once and reused across renders: a split can run for minutes, and
     * rebuilding the panel on a tab switch would orphan its progress bar and
     * throw away finished download links.
     */
    let splitNode = null;

    function splitBlock() {
        if (splitNode) return splitNode;
        const box = el('details', { class: 'paste', id: 'splitBox' });
        box.appendChild(el('summary', { text: '🧰 Split a very large Purview export into tables' }));

        box.appendChild(el('p', { class: 'muted' }, rich(
            'For exports too big to analyse in one piece, or any file where the **AuditData** column needs to become real columns. JSON exports work too: each object in the file becomes one row. The file is read in slices and never held in memory, so size is not the limit. Nothing leaves this browser.')));

        const chosen = el('p', { class: 'muted small', id: 'splitChosen', text: pendingBig ? pendingBig.name + '  \u00b7  ' + fmtSize(pendingBig.size) : 'No file chosen yet.' });

        const fileIn = el('input', {
            type: 'file', accept: '.csv,.txt,.json,.ndjson,text/csv,application/json', style: 'display:none',
            onchange: function () {
                if (this.files && this.files[0]) {
                    pendingBig = this.files[0];
                    chosen.textContent = pendingBig.name + '  \u00b7  ' + fmtSize(pendingBig.size);
                }
                this.value = '';
            },
        });
        box.appendChild(fileIn);
        box.appendChild(el('div', { class: 'btn-row' }, [
            el('button', { class: 'btn ghost', type: 'button', onclick: () => fileIn.click() }, 'Choose the CSV or JSON'),
        ]));
        box.appendChild(chosen);

        box.appendChild(el('p', { class: 'sub-h', text: 'Narrow it down first (optional)' }));
        const grid = el('div', { class: 'split-filters' });
        const fields = {};
        [
            ['ip', 'IP address', 'e.g. 198.51.100.7'],
            ['user', 'User contains', 'e.g. jo@contoso.com'],
            ['op', 'Operation contains', 'e.g. MailItemsAccessed'],
            ['text', 'Text contains', 'searches inside the JSON too'],
            ['from', 'From date', 'YYYY-MM-DD'],
            ['to', 'To date', 'YYYY-MM-DD'],
        ].forEach(([k, label, ph]) => {
            const wrap = el('label', { class: 'split-field' });
            wrap.appendChild(el('span', { text: label }));
            const inp = el('input', { type: 'text', placeholder: ph, spellcheck: 'false' });
            fields[k] = inp;
            wrap.appendChild(inp);
            grid.appendChild(wrap);
        });
        box.appendChild(grid);
        box.appendChild(el('p', { class: 'muted small' }, rich(
            'The **IP** filter looks at every address found anywhere in the record, including inside the JSON. A complete address must match exactly; end with a dot for a prefix, like `203.0.113.`. **Text contains** searches the whole raw row, so it reaches every value inside the AuditData JSON. Dates are read as **UTC**, the same clock Purview writes. Leave everything blank to convert the whole file.')));

        box.appendChild(el('p', { class: 'sub-h', text: 'Microsoft datacenter traffic (optional)' }));
        box.appendChild(el('p', { class: 'muted small' }, rich(
            'Purview rows are full of Microsoft\'s own datacenter addresses; the interesting moments are the ones from anywhere else. This tool makes **no network requests**, so it will not download the list itself: fetch the current **ServiceTags_Public** JSON from Microsoft\'s official download page (updated weekly) and load it here. Any file containing CIDR ranges works.')));
        const msLink = el('p', { class: 'muted small' });
        msLink.appendChild(el('a', {
            href: 'https://www.microsoft.com/en-us/download/details.aspx?id=56519',
            target: '_blank', rel: 'noopener noreferrer',
        }, 'Download Azure IP Ranges and Service Tags (Public Cloud) from the official Microsoft Download Center \u2197'));
        box.appendChild(msLink);
        const msStatus = el('p', { class: 'muted small', text: 'No ranges loaded yet.' });
        let msFiles = [];
        const msIn = el('input', {
            type: 'file', accept: '.json,.txt,.csv,application/json,text/plain', style: 'display:none',
            onchange: function () {
                const f = this.files && this.files[0];
                this.value = '';
                if (!f) return;
                f.text().then(text => {
                    const r = SPLIT.parseCidrList(text);
                    if (!r.count) { toast('No IP ranges found in that file'); return; }
                    /* Additive on purpose: Azure tags and the Microsoft 365
                       ranges (2603:1026:: and friends) live in separate
                       lists, and an investigation usually wants both. */
                    msRanges = SPLIT.mergeCidrSets(msRanges, r);
                    msFiles.push(f.name);
                    msStatus.textContent = msRanges.v4.length.toLocaleString() + ' IPv4 and ' + msRanges.v6.length.toLocaleString() +
                        ' IPv6 merged ranges loaded from ' + msFiles.join(' + ') +
                        '. Load another file to add its ranges: Microsoft 365 addresses (2603:1026:: and friends) are published separately from the Azure list.';
                    scopeSel.querySelectorAll('option[data-needs-ranges]').forEach(o => { o.disabled = false; });
                    toast(msRanges.count.toLocaleString() + ' Microsoft ranges active');
                });
            },
        });
        box.appendChild(msIn);
        box.appendChild(el('div', { class: 'btn-row' }, [
            el('button', { class: 'btn ghost', type: 'button', onclick: () => msIn.click() }, 'Load the Microsoft ranges file'),
            el('button', {
                class: 'btn ghost tiny', type: 'button',
                onclick: () => {
                    msRanges = null; msFiles = [];
                    msStatus.textContent = 'No ranges loaded yet.';
                    scopeSel.querySelectorAll('option[data-needs-ranges]').forEach(o => { o.disabled = true; });
                    if (scopeSel.value === 'publicNotMs' || scopeSel.value === 'excludeMs') scopeSel.value = 'any';
                },
            }, 'Start over'),
        ]));
        box.appendChild(msStatus);

        const scopeSel = el('select', { class: 'split-select', 'aria-label': 'IP scope filter' });
        [['any', 'All rows (no IP scope filter)'],
        ['private', 'Only rows mentioning a private or internal IP'],
        ['public', 'Only rows mentioning a public IP'],
        ['publicNotMs', 'Only rows with a public IP outside the Microsoft ranges (needs the file)'],
        ['excludeMs', 'Exclude every row that mentions a Microsoft datacenter IP (needs the file)']]
            .forEach(([v, label]) => {
                const o = el('option', { value: v, text: label });
                if (v === 'publicNotMs' || v === 'excludeMs') { o.setAttribute('data-needs-ranges', '1'); o.disabled = true; }
                scopeSel.appendChild(o);
            });
        box.appendChild(scopeSel);
        box.appendChild(el('p', { class: 'muted small', text: 'The scope looks at every IP in the row. Rows without any IP stay only under "All rows" and "Exclude Microsoft". Every kept row still carries its timestamp, so the remaining moments read as a timeline.' }));

        box.appendChild(el('p', { class: 'sub-h', text: 'What shape should the output have?' }));
        const msel = el('select', { class: 'split-select', 'aria-label': 'Output shape' });
        msel.appendChild(el('option', { value: 'flat', text: 'One flat file: complete rows, every column, mail items on their own lines' }));
        msel.appendChild(el('option', { value: 'tables', text: 'Joinable tables: records.csv plus one file per list inside the JSON' }));
        box.appendChild(msel);
        box.appendChild(el('p', { class: 'muted small' }, rich(
            'The flat file never splits a row: every line carries **all** columns (timestamp, IPs, device, everything), so a message and the IP it came from sit side by side. When a record touches several mail items, the record repeats, one line per item.')));

        const flatWrap = el('div');
        const flatDefs = [
            ['flatSplit', 'Split the rows into one file per workload (mail actions, files and urls, ...). Columns are never split.', false],
            ['flatLean', 'Leave out columns that are empty in every row of the file. All column names show when this is off.', false],
        ];
        const flatChecks = {};
        flatDefs.forEach(([id, label, def]) => {
            const lab = el('label', { class: 'split-check block' });
            const cbx = el('input', { type: 'checkbox' });
            cbx.checked = def;
            flatChecks[id] = cbx;
            lab.appendChild(cbx);
            lab.appendChild(el('span', { text: label }));
            flatWrap.appendChild(lab);
        });
        box.appendChild(flatWrap);

        const tablesWrap = el('div');
        tablesWrap.appendChild(el('p', { class: 'sub-h', text: 'Which tables do you need?' }));
        const tableDefs = [
            ['records', 'records.csv', 'one row per event, the JSON as columns'],
            ['parameters', 'parameters.csv', 'operation arguments, name and value'],
            ['modified', 'modified-properties.csv', 'what changed, old and new value'],
            ['mail', 'mail-items.csv', 'folders and messages touched'],
            ['affected', 'affected-items.csv', 'files and eDiscovery targets'],
            ['ipsummary', 'ip-summary.csv', 'every address with counts'],
            ['subset', 'original-rows.csv', 'the matching rows exactly as exported, loads back into Logscope'],
        ];
        const tableChecks = {};
        const twrap = el('div', { class: 'split-tables' });
        tableDefs.forEach(([id, name, hint]) => {
            const lab = el('label', { class: 'split-check', title: hint });
            const cbx = el('input', { type: 'checkbox' });
            cbx.checked = true;
            tableChecks[id] = cbx;
            lab.appendChild(cbx);
            lab.appendChild(el('span', { text: name }));
            twrap.appendChild(lab);
        });
        tablesWrap.appendChild(twrap);
        tablesWrap.appendChild(el('p', { class: 'muted small', text: 'Tables with no rows are skipped automatically. Keep original-rows.csv ticked if you may want to reload the result into the analyser.' }));

        /* Tables discovered inside the JSON (Actor, Target, ...) vary per
           file, so their checkboxes appear once a preview or split has seen
           it. Everything discovered is included unless unticked. */
        const famChecks = {};
        const famWrap = el('div', { class: 'split-tables', hidden: true });
        const famNote = el('p', { class: 'muted small', text: 'Every array inside AuditData (Actor, Target, and so on) also becomes its own table. Run a preview to list the ones in this file; all of them are included unless you untick them here.' });
        tablesWrap.appendChild(famNote);
        tablesWrap.appendChild(famWrap);

        const tmplWrap = el('div');
        box.appendChild(tablesWrap);

        function updateFamilies(list) {
            (list || []).forEach(f => {
                if (famChecks[f.name]) return;
                const lab = el('label', { class: 'split-check', title: 'rows of the ' + f.name + ' array, one line per item' });
                const cbx = el('input', { type: 'checkbox' });
                cbx.checked = f.enabled !== false;
                famChecks[f.name] = cbx;
                lab.appendChild(cbx);
                lab.appendChild(el('span', { text: f.name + '.csv' }));
                famWrap.appendChild(lab);
            });
            if (Object.keys(famChecks).length) {
                famWrap.hidden = false;
                famNote.textContent = 'Tables found inside AuditData, one line per array item. All are written unless unticked; re-run after changing.';
            }
        }

        tmplWrap.appendChild(el('p', { class: 'sub-h', text: 'Columns in records.csv' }));
        const tsel = el('select', { class: 'split-select', 'aria-label': 'Column template for records.csv' });
        Object.keys(SPLIT.TEMPLATES).forEach(id => {
            tsel.appendChild(el('option', { value: id, text: SPLIT.TEMPLATES[id].label }));
        });
        tmplWrap.appendChild(tsel);
        tmplWrap.appendChild(el('p', { class: 'muted small', text: 'The join and who-when-what columns (RowId, RecordId, CreationDate, UserId, Operation, Workload, RecordType, ResultStatus, ClientIP, AllIPs) are always included. A template only changes which JSON columns follow them.' }));
        box.appendChild(tmplWrap);

        function syncMode() {
            const flat = msel.value === 'flat';
            flatWrap.hidden = !flat;
            tablesWrap.hidden = flat;
            tmplWrap.hidden = flat;
        }
        msel.addEventListener('change', syncMode);
        syncMode();

        const status = el('p', { class: 'muted', 'aria-live': 'polite' });
        const bar = el('div', { class: 'progress', hidden: true }, el('i'));
        const results = el('div');

        let previewBtn;
        function run(preview) {
            if (!pendingBig) { toast('Choose the CSV first'); return; }
            const filters = { preview: preview };
            Object.keys(fields).forEach(k => { filters[k] = fields[k].value.trim(); });
            /* A mistyped date must stop the run, not silently filter nothing. */
            if (filters.from && isNaN(SPLIT.parseUtc(filters.from))) { toast('From date: use YYYY-MM-DD'); fields.from.focus(); return; }
            if (filters.to && isNaN(SPLIT.parseUtc(filters.to))) { toast('To date: use YYYY-MM-DD'); fields.to.focus(); return; }
            filters.template = tsel.value;
            filters.columns = colPick;
            filters.scope = scopeSel.value;
            filters.msRanges = msRanges;
            if ((filters.scope === 'publicNotMs' || filters.scope === 'excludeMs') && !msRanges) {
                toast('Load the Microsoft ranges file first');
                return;
            }
            filters.flat = msel.value === 'flat';
            filters.flatSplit = filters.flat && flatChecks.flatSplit.checked;
            filters.flatLean = filters.flat && flatChecks.flatLean.checked;
            /* The tick beside each sample mirrors the table choice. */
            Object.keys(sampleToggles).forEach(id => {
                if (sampleToggles[id] !== false) return;
                if (tableChecks[id]) tableChecks[id].checked = false;
                else if (id.indexOf('family:') === 0) { if (famChecks[id.slice(7)]) famChecks[id.slice(7)].checked = false; }
            });
            filters.flatSkip = {};
            Object.keys(sampleToggles).forEach(id => {
                if (id.indexOf('flat:') === 0 && sampleToggles[id] === false) filters.flatSkip[id.slice(5)] = true;
            });
            filters.tables = {};
            let any = false;
            if (filters.flat) {
                filters.tables = {
                    records: false, parameters: false, modified: false, mail: false, affected: false,
                    ipsummary: sampleToggles.ipsummary !== false,
                    subset: sampleToggles.subset !== false && tableChecks.subset.checked,
                };
                any = true;
            } else {
                Object.keys(tableChecks).forEach(id => {
                    filters.tables[id] = tableChecks[id].checked;
                    if (tableChecks[id].checked) any = true;
                });
            }
            filters.families = {};
            Object.keys(famChecks).forEach(name => {
                filters.families[name] = famChecks[name].checked;
                if (famChecks[name].checked) any = true;
            });
            if (!any) { toast('Tick at least one table'); return; }
            goBtn.disabled = true;
            previewBtn.disabled = true;
            results.textContent = '';
            bar.hidden = false;
            status.textContent = 'Starting...';
            SPLIT.splitUal(pendingBig, filters, {
                progress(phase, done, total, pass) {
                    const pct = total ? done / total : 0;
                    const overall = Math.round(((pass + pct) / 2) * 100);
                    bar.firstChild.style.width = overall + '%';
                    status.textContent = phase + ': ' + fmtSize(done) + ' of ' + fmtSize(total) +
                        '  (pass ' + (pass + 1) + ' of 2)';
                },
                error(msg) {
                    goBtn.disabled = false;
                    previewBtn.disabled = false;
                    bar.hidden = true;
                    status.textContent = msg;
                    toast('Split failed');
                },
                done(tables, stats) {
                    goBtn.disabled = false;
                    previewBtn.disabled = false;
                    bar.firstChild.style.width = '100%';
                    updateFamilies(stats.families);
                    renderSplitResult(results, tables, stats);
                    status.textContent = 'Done.';
                    toast(stats.preview ? 'Preview ready' : stats.matched.toLocaleString() + ' records written');
                },
            });
        }

        previewBtn = el('button', {
            class: 'btn ghost', type: 'button', onclick: () => run(true),
            title: 'Reads only the start of the file and shows how each table will look. Writes nothing.',
        }, 'Preview the first rows');
        const goBtn = el('button', { class: 'btn', type: 'button', onclick: () => run(false) }, 'Split into tables');

        box.appendChild(el('div', { class: 'btn-row' }, [previewBtn, goBtn]));
        box.appendChild(bar);
        box.appendChild(status);
        box.appendChild(results);
        splitNode = box;
        return box;
    }

    function fmtSize(n) {
        if (n > 1024 * 1024) return (n / 1024 / 1024).toFixed(1) + ' MB';
        if (n > 1024) return Math.round(n / 1024) + ' KB';
        return n + ' B';
    }

    let splitUrls = [];   // blob URLs of the previous run, revoked on replace
    let colPick = {};      // records.csv column unticks, by column name
    let sampleToggles = {};  // table id -> checkbox state, mirrored next to each sample
    let msRanges = null;   // parsed Microsoft datacenter ranges, loaded from a file

    /** A compact preview table: header plus the first rows, cells clipped for
        display only. The downloadable file is never clipped this way. The
        summary line carries the same tick as the table list, so a table can
        be deselected while looking at its rows. Columns unpacked from the
        AuditData JSON are shown indented; computed columns wear "added". */
    function sampleTable(t, open) {
        const wrap = el('details', { class: 'sample' });
        if (open) wrap.open = true;
        const summary = el('summary');
        if (t.id) {
            const lab = el('label', { class: 'split-check', title: 'untick to leave this file out of the next run' });
            const cbx = el('input', { type: 'checkbox' });
            cbx.checked = sampleToggles[t.id] !== false;
            cbx.addEventListener('click', e => e.stopPropagation());
            cbx.addEventListener('change', () => { sampleToggles[t.id] = cbx.checked; });
            lab.addEventListener('click', e => e.stopPropagation());
            lab.appendChild(cbx);
            summary.appendChild(lab);
        }
        summary.appendChild(el('span', { text: t.filename + '  \u00b7  first ' + t.sample.length + ' row' + (t.sample.length === 1 ? '' : 's') }));
        wrap.appendChild(summary);
        const scroll = el('div', { class: 'sample-wrap' });
        const table = el('table', { class: 'sample-table' });
        const clip = v => { const s = String(v === undefined ? '' : v); return s.length > 100 ? s.slice(0, 100) + '\u2026' : s; };
        const pickable = t.id === 'records' || (t.id && t.id.indexOf('flat:') === 0);
        if (t.header) {
            const tr = el('tr');
            t.header.forEach((h, i) => {
                const th = el('th');
                const derived = SPLIT.DERIVED_COLS[h];
                const addedByPos = t.addedCols !== undefined && i < t.addedCols && h !== 'RowId';
                const unpacked = t.unpackedFrom !== undefined && i >= t.unpackedFrom;
                const protectedCol = h === 'RowId' || /^creation(date|time)$/i.test(h);
                if (pickable) {
                    const lab = el('label', { class: 'col-pick', title: derived || (unpacked ? 'unpacked from the AuditData JSON: ' + h : 'from the export: ' + h) });
                    const cbx = el('input', { type: 'checkbox' });
                    cbx.checked = colPick[h] !== false;
                    if (protectedCol) { cbx.disabled = true; cbx.checked = true; lab.title += '. Always kept.'; }
                    cbx.addEventListener('change', () => { colPick[h] = cbx.checked; });
                    lab.appendChild(cbx);
                    lab.appendChild(el('span', { text: clip(h) }));
                    th.appendChild(lab);
                } else {
                    th.textContent = clip(h);
                    if (derived) th.title = derived;
                    else if (addedByPos) th.title = 'added by the splitter: copied from the parent record so this table stands alone';
                }
                if (derived || addedByPos) {
                    th.classList.add('derived');
                    th.appendChild(el('i', { class: 'added-tag', text: 'added' }));
                }
                if (unpacked) th.classList.add('unpacked');
                tr.appendChild(th);
            });
            table.appendChild(tr);
        }
        t.sample.forEach(rowCells => {
            const tr = el('tr');
            const n = t.header ? t.header.length : rowCells.length;
            for (let i = 0; i < n; i++) {
                const td = el('td', { text: clip(rowCells[i]) });
                if (t.unpackedFrom !== undefined && i >= t.unpackedFrom) td.classList.add('unpacked');
                tr.appendChild(td);
            }
            table.appendChild(tr);
        });
        scroll.appendChild(table);
        wrap.appendChild(scroll);
        if (pickable) {
            wrap.appendChild(el('p', { class: 'muted small', text: 'Untick a column to leave it out on the next run; RowId and the timestamp always stay. Indented \u21b3 columns are unpacked from the AuditData JSON; columns marked "added" do not exist in the export, the splitter computes them.' }));
        }
        return wrap;
    }

    function renderSplitResult(host, tables, stats) {
        splitUrls.forEach(u => URL.revokeObjectURL(u));
        splitUrls = [];
        host.textContent = '';

        if (stats.preview) {
            host.appendChild(el('p', { class: 'sub-h', text: 'Preview: no files were written yet' }));
            host.appendChild(el('p', { class: 'muted small', text: stats.previewPartial
                ? 'Built from the first ' + fmtSize(stats.previewBytes) + ' of the file, so every count below covers only that slice. The full split reads everything.'
                : 'The file is small enough that this preview covers all of it.' }));
        }

        if (stats.noAuditData) {
            host.appendChild(el('p', { class: 'lede' }, rich(
                '**No AuditData column found.** This does not look like a Purview / Unified Audit Log export, so there is no JSON to unpack into columns. Rows are still copied and searched for IP addresses as plain text.')));
        }

        const hasSubset = tables.some(t => t.id === 'subset');
        const hasRecords = tables.some(t => t.id === 'records');

        const s = el('div', { class: 'stats' });
        const statList = [[stats.rows.toLocaleString(), 'rows read'],
        [stats.matched.toLocaleString(), stats.preview ? 'rows matched' : 'records written'],
        [stats.ips.toLocaleString(), 'distinct IPs'],
        [stats.userCount.toLocaleString(), 'accounts']];
        if (hasRecords) statList.splice(2, 0, [stats.columns, 'records.csv columns']);
        statList.forEach(([n, l]) => {
                const c = el('div', { class: 'stat' });
                c.appendChild(el('b', { text: String(n) }));
                c.appendChild(el('span', { text: l }));
                s.appendChild(c);
            });
        if (stats.first) {
            const c = el('div', { class: 'stat wide' });
            c.appendChild(el('b', { text: String(stats.first).slice(0, 19) + '  to  ' + String(stats.last).slice(0, 19) }));
            c.appendChild(el('span', { text: 'window' }));
            s.appendChild(c);
        }
        host.appendChild(s);

        if (stats.unparsed) {
            host.appendChild(el('p', { class: 'muted small' }, rich(
                stats.unparsed.toLocaleString() + ' row(s) had no readable **AuditData** JSON. They are kept in original-rows.csv and searched for IP addresses as plain text, but contribute no columns.')));
        }
        if (stats.droppedCols) {
            host.appendChild(el('p', { class: 'muted small' }, rich(
                stats.droppedCols.toLocaleString() + ' rare column(s) did not fit records.csv. ' +
                (hasSubset ? 'Nothing is lost: the full record for every row is in **original-rows.csv**.'
                    : 'Tick **original-rows.csv** and run again if you need every column.'))));
        }
        if (stats.usersCapped) {
            host.appendChild(el('p', { class: 'muted small', text: 'The account counter stopped at 5,000 distinct accounts; treat that figure as "at least".' }));
        }
        if (stats.template && stats.template !== 'all') {
            const tl = (SPLIT.TEMPLATES[stats.template] || {}).label || stats.template;
            const tcols = Math.max(0, (stats.columns || 0) - (stats.baseCols || 10));
            host.appendChild(el('p', { class: 'muted small' }, rich(
                'Template **' + tl + '**: records.csv carries the ' + (stats.baseCols || 10) + ' fixed columns plus ' +
                tcols + ' template column' + (tcols === 1 ? '' : 's') + ', out of ' +
                (stats.availableCols || 0).toLocaleString() + ' JSON columns in the file. ' +
                (hasSubset ? 'A template hides nothing: **original-rows.csv** keeps the full record.'
                    : 'Tick **original-rows.csv** and run again if you need the rest.'))));
        }
        if (stats.familiesDropped) {
            host.appendChild(el('p', { class: 'muted small' }, rich(
                stats.familiesDropped.toLocaleString() + ' rarer JSON array table(s) beyond the first 12 were not written. The full content is always in **original-rows.csv**.')));
        }
        if (stats.familyCapped && stats.familyCapped.length) {
            host.appendChild(el('p', { class: 'muted small' }, rich(
                'The ' + stats.familyCapped.join(', ') + ' array(s) can exceed 200 items in a single record; the table carries the first 200 per record and **original-rows.csv** keeps everything.')));
        }
        if (stats.templateMissing && stats.templateMissing.length) {
            host.appendChild(el('p', { class: 'muted small', text:
                'Template columns not present in this file: ' + stats.templateMissing.join(', ') + '. Purview only writes them for the workloads that use them.' }));
        }
        if (stats.flat) {
            const wls = (stats.workloads || []).filter(w => w.enabled).length;
            host.appendChild(el('p', { class: 'muted small' }, rich(
                'Flat output: every row keeps **all ' + (stats.columns || 0) + ' columns**' +
                (stats.flatSplit ? ', split into ' + wls + ' file(s) by workload, rows only, never columns' : ' in one file') +
                (stats.mailExpanded ? '. ' + stats.mailExpanded.toLocaleString() + ' extra line(s) were added so each mail item sits on its own row, carrying the full record (IP, device, timestamp) with it' : '') +
                (stats.flatLean ? '. Columns empty in the whole file are left out (untick the lean option to keep every column name)' : '') + '.')));
        }
        if (stats.scopeCounts && (stats.msRanges || (stats.scopeCounts.private + stats.scopeCounts.public + stats.scopeCounts.microsoft) > 0)) {
            host.appendChild(el('p', { class: 'muted small' }, rich(
                'Distinct addresses in the whole file: **' + stats.scopeCounts.private.toLocaleString() + ' private**, **' +
                stats.scopeCounts.microsoft.toLocaleString() + ' Microsoft datacenter**' +
                (stats.msRanges ? ' (matched against ' + stats.msRanges.toLocaleString() + ' loaded ranges)' : ' (no ranges file loaded)') +
                ', **' + stats.scopeCounts.public.toLocaleString() + ' other public**. The Scope column in ip-summary.csv carries the class per address.')));
        }
        if (stats.userDropped) {
            host.appendChild(el('p', { class: 'muted small', text: stats.userDropped + ' column(s) you unticked are left out of records.csv. Tick them again in the preview to bring them back.' }));
        }
        if (!stats.matched) {
            host.appendChild(el('p', { class: 'lede' }, rich(
                stats.rows === 0
                    ? 'The file has no data rows beyond the header.'
                    : 'Nothing matched those filters. Check the IP against **ip-summary.csv**, which lists every address in the file.')));
        }

        if (!stats.preview) {
            host.appendChild(el('p', { class: 'sub-h', text: 'Your tables' }));
            const list = el('div', { class: 'files' });
            tables.forEach(t => {
                const url = URL.createObjectURL(t.blob);
                splitUrls.push(url);
                const a = el('a', {
                    class: 'btn ghost tiny', href: url, download: t.filename,
                    title: t.label,
                }, '\u2913 ' + t.filename + '  (' + t.rows.toLocaleString() + ')');
                list.appendChild(a);
            });
            host.appendChild(list);
        }

        const withSamples = tables.filter(t => t.sample && t.sample.length);
        if (withSamples.length) {
            host.appendChild(el('p', { class: 'sub-h', text: stats.preview ? 'How each file will look' : 'How each file looks inside' }));
            withSamples.forEach(t => host.appendChild(sampleTable(t, stats.preview || t.id === 'records' || t.id.indexOf('flat:') === 0)));
        }

        if (stats.preview) {
            host.appendChild(el('p', { class: 'muted small', text: 'Happy with the shape? Run "Split into tables" to write the files.' }));
            return;
        }

        const how = el('ul', { class: 'spot' });
        [
            'Open **records.csv** in Excel and use a normal column filter. **AllIPs** holds every address found in the record, so filtering there cannot miss one hidden in the JSON.',
            'The other tables join back on **RowId**, and on **RecordId** where the export provides one.',
            '**original-rows.csv** is the export exactly as it was written, only filtered (for a JSON file, converted to one CSV row per object). Its **AuditData** column stays raw JSON on purpose: that is what loads back into the analyser. The same content, unpacked into filterable columns, is **records.csv** and the array tables.',
            'If you filtered original-rows.csv down below 80 MB you can load it straight back into the analyser above.',
            'In the Excel-facing tables, any cell beyond the 32,767-character limit is marked `...[truncated]` rather than silently cut. The untouched value is always in original-rows.csv.',
            'Log fields can contain hostile text. In the Excel-facing tables, a cell that would start with =, +, - or @ is prefixed with an apostrophe so Excel cannot run it as a formula. original-rows.csv keeps the original bytes.',
        ].forEach(x => how.appendChild(el('li', null, rich(x))));
        host.appendChild(how);

        if (stats.topOps && stats.topOps.length) {
            host.appendChild(el('p', { class: 'sub-h', text: 'Most common operations in the file' }));
            const ul = el('ul', { class: 'matches' });
            stats.topOps.forEach(([op, n]) => ul.appendChild(el('li', { text: op + '  ·  ' + n.toLocaleString() })));
            host.appendChild(ul);
        }
    }

    function viewFindings() {
        const frag = document.createDocumentFragment();

        if (!FINDINGS.length) {
            frag.appendChild(el('p', { class: 'lede' }, rich('No detections fired. That is worth something, but it is **not** the same as "nothing happened". Check the coverage tab for what you have not loaded yet.')));
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
            sum.appendChild(el('span', { class: 'count', text: f.count + (f.source === 'aggregate' ? ' pattern' + (f.count === 1 ? '' : 's'): ' event' + (f.count === 1 ? '' : 's')) }));
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
                box.appendChild(el('p', { class: 'muted small', text: 'showing 12 of ' + f.events.length + '. Use the timeline tab to see the rest' }));
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
            tr.appendChild(el('td', { text: e.actor || 'n/a' }));
            const what = el('td');
            what.appendChild(el('span', { text: e.action || 'n/a' }));
            if (e.target) what.appendChild(el('small', { class: 'sub', text: '→ ' + e.target }));
            if (e.proto) what.appendChild(el('small', { class: 'sub', text: 'protocol: ' + e.proto }));
            if (e.extra && e.extra.paramText) what.appendChild(el('small', { class: 'sub', text: e.extra.paramText.slice(0, 160) }));
            tr.appendChild(what);
            const from = el('td');
            from.appendChild(el('span', { class: 'mono', text: e.actorIp || 'n/a' }));
            if (e.country) from.appendChild(el('small', { class: 'sub', text: e.country }));
            tr.appendChild(from);
            const res = el('td');
            res.appendChild(el('span', { text: e.result || 'n/a' }));
            if (e.mfa) res.appendChild(el('small', { class: 'sub', text: 'MFA: ' + e.mfa }));
            tr.appendChild(res);
            tb.appendChild(tr);
        });
        t.appendChild(tb);
        wrap.appendChild(t);
        return wrap;
    }

    /** The distinct view: unique values of one field, with counts and the
        who/what seen alongside each value, joined and capped for reading. */
    function distinctTable(list, fieldKey) {
        const field = DISTINCT_FIELDS.filter(f => f[0] === fieldKey)[0];
        const wrap = el('div', { class: 'table-wrap' });
        if (!field) return wrap;
        const groups = new Map();
        list.forEach(e => {
            const v = String(field[2](e) || '(empty)');
            let g = groups.get(v);
            if (!g) { g = { n: 0, who: new Set(), what: new Set(), first: null, last: null }; groups.set(v, g); }
            g.n++;
            if (e.actor && g.who.size < 6) g.who.add(e.actor);
            if (e.action && g.what.size < 8) g.what.add(e.action);
            if (e.ts) {
                if (!g.first || e.ts < g.first) g.first = e.ts;
                if (!g.last || e.ts > g.last) g.last = e.ts;
            }
        });
        const t = el('table');
        const hr = el('tr');
        [field[1] + ' (distinct)', 'Events', 'First seen', 'Last seen', 'Who', 'What'].forEach(h => hr.appendChild(el('th', { text: h })));
        const thead = el('thead');
        thead.appendChild(hr);
        t.appendChild(thead);
        const tb = el('tbody');
        Array.from(groups.entries()).sort((a, b) => b[1].n - a[1].n).forEach(([v, g]) => {
            const tr = el('tr');
            const vd = el('td', { class: 'pick', title: 'click to filter the timeline on this value' });
            vd.appendChild(el('span', { text: v }));
            vd.addEventListener('click', () => {
                filterText = v === '(empty)' ? '' : v;
                distinctBy = '';
                render();
            });
            tr.appendChild(vd);
            tr.appendChild(el('td', { class: 'mono', text: String(g.n) }));
            tr.appendChild(el('td', { class: 'mono nowrap', text: fmt(g.first) }));
            tr.appendChild(el('td', { class: 'mono nowrap', text: fmt(g.last) }));
            tr.appendChild(el('td', { text: Array.from(g.who).join('; ') || 'n/a' }));
            tr.appendChild(el('td', { text: Array.from(g.what).join('; ') || 'n/a' }));
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
            type: 'search', placeholder: 'Filter, a user, an IP, an operation…',
            value: filterText,
            oninput: function () { filterText = this.value; renderInto(); },
        }));
        const sel = el('select', {
            onchange: function () { filterSrc = this.value; render(); },
        });
        [['all', 'All sources'], ['signin', 'Sign-ins'], ['audit', 'Audit'], ['ual', 'Purview'], ['trace', 'Message trace'], ['unknown', 'Unrecognised']]
            .forEach(([v, l]) => sel.appendChild(el('option', { value: v, selected: filterSrc === v || null, text: l })));
        bar.appendChild(sel);
        const dsel = el('select', {
            title: 'Show every unique value of one field instead of the row list',
            onchange: function () { distinctBy = this.value; render(); },
        });
        dsel.appendChild(el('option', { value: '', selected: distinctBy === '' || null, text: 'All rows' }));
        DISTINCT_FIELDS.forEach(([k, label]) => {
            dsel.appendChild(el('option', { value: k, selected: distinctBy === k || null, text: 'Distinct: ' + label }));
        });
        bar.appendChild(dsel);
        const hideLab = el('label', { class: 'split-check', title: 'drop rows that carry no time, or neither an actor nor a recognisable action' });
        const hideCb = el('input', { type: 'checkbox' });
        hideCb.checked = hideEmpty;
        hideCb.addEventListener('change', () => { hideEmpty = hideCb.checked; render(); });
        hideLab.appendChild(hideCb);
        hideLab.appendChild(el('span', { text: 'Hide empty rows' }));
        bar.appendChild(hideLab);
        bar.appendChild(el('span', { class: 'muted small', text: list.length + ' of ' + EVENTS.length + ' events' }));
        frag.appendChild(bar);

        const holder = el('div', { id: 'tlHolder' });
        frag.appendChild(holder);

        function renderInto() {
            const l = filtered();
            holder.textContent = '';
            if (distinctBy) {
                holder.appendChild(distinctTable(l, distinctBy));
                holder.appendChild(el('p', { class: 'muted small', text: 'Every unique value once, with the accounts and actions seen alongside it. Click a value to filter the timeline on it.' }));
            } else {
                holder.appendChild(eventTable(l.slice(0, MAX_ROWS)));
                if (l.length > MAX_ROWS) {
                    holder.appendChild(el('p', { class: 'muted small', text: 'Showing the first ' + MAX_ROWS + ' of ' + l.length + '. Narrow the filter to see more.' }));
                }
            }
            const c = bar.querySelector('.muted');
            if (c) c.textContent = l.length + ' of ' + EVENTS.length + ' events';
        }
        renderInto();

        return frag;
    }

    function topList(title, map, note, onPick) {
        const box = el('div', { class: 'pivot' });
        box.appendChild(el('h3', { text: title }));
        if (note) box.appendChild(el('p', { class: 'muted small', text: note }));
        const rows = Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15);
        if (!rows.length) { box.appendChild(el('p', { class: 'muted', text: 'nothing here' })); return box; }
        const ul = el('ul', { class: 'bars' });
        const max = rows[0][1];
        rows.forEach(([k, n]) => {
            const li = el('li');
            if (onPick) {
                li.classList.add('pick');
                li.title = 'click to filter the timeline on "' + k + '"';
                li.addEventListener('click', () => onPick(k));
            }
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
        /* Clicking a pivot entry turns it into the timeline filter. */
        const pick = v => { filterText = v; distinctBy = ''; view = 'timeline'; render(); };

        frag.appendChild(el('p', { class: 'muted small', text: 'Click any entry to filter the timeline on it.' }));
        const grid = el('div', { class: 'pivot-grid' });
        grid.appendChild(topList('Source addresses', tally(e => e.actorIp), 'The one that does not belong is usually visible here first.', pick));
        grid.appendChild(topList('Accounts', tally(e => e.actor), '', pick));
        grid.appendChild(topList('Operations and applications', tally(e => e.action), '', pick));
        grid.appendChild(topList('Countries', tally(e => e.country), 'The country code from the location; two cities in one country count once.', pick));
        grid.appendChild(topList('Client and user agent', tally(e => (e.ua || '').slice(0, 60)), '', pick));
        grid.appendChild(topList('Authentication protocols', tally(e => e.proto), '', pick));
        frag.appendChild(grid);
        return frag;
    }

    /** The loaded files exactly as they came in, first rows as a table. */
    function viewRows() {
        const frag = document.createDocumentFragment();
        if (!FILES.length) {
            frag.appendChild(el('p', { class: 'lede', text: 'No files loaded.' }));
            return frag;
        }
        frag.appendChild(el('p', { class: 'muted small', text: 'The original columns and rows of each loaded file, untouched. The timeline and findings work on the normalised view; this is the source of truth beneath them.' }));
        FILES.forEach((f, i) => {
            const box = el('details', { class: 'sample' });
            if (i === 0) box.open = true;
            const cap = f.table ? Math.min(f.table.rows.length, MAX_ROWS) : 0;
            box.appendChild(el('summary', { text: f.name + '  \u00b7  ' + (f.table ? f.table.total.toLocaleString() + ' rows' : 'not tabular') }));
            if (!f.table) {
                box.appendChild(el('p', { class: 'muted small', text: 'This file was JSON, so there is no original row grid. The timeline shows its normalised events; the raw object of each event is in the report evidence.' }));
            } else {
                const scroll = el('div', { class: 'sample-wrap' });
                const t = el('table', { class: 'sample-table' });
                const clip = v => { const s = String(v === undefined ? '' : v); return s.length > 100 ? s.slice(0, 100) + '\u2026' : s; };
                const hr = el('tr');
                f.table.header.forEach(h => hr.appendChild(el('th', { text: clip(h) })));
                t.appendChild(hr);
                f.table.rows.slice(0, cap).forEach(row => {
                    const tr = el('tr');
                    for (let ci = 0; ci < f.table.header.length; ci++) tr.appendChild(el('td', { text: clip(row[ci]) }));
                    t.appendChild(tr);
                });
                scroll.appendChild(t);
                box.appendChild(scroll);
                if (f.table.total > cap) {
                    box.appendChild(el('p', { class: 'muted small', text: 'Showing the first ' + cap + ' of ' + f.table.total.toLocaleString() + ' rows' + (f.table.total > f.table.rows.length ? ' (the first ' + f.table.rows.length.toLocaleString() + ' are kept in memory)' : '') + '. The full file is untouched on your disk.' }));
                }
            }
            frag.appendChild(box);
        });
        return frag;
    }

    function viewCoverage() {
        const frag = document.createDocumentFragment();
        frag.appendChild(el('p', { class: 'lede' }, rich('What you have not loaded matters as much as what you have. A conclusion drawn from one log is a conclusion about one log.')));

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
        FILES.forEach(f => L.push('- ' + f.name + ' · ' + (PARSE.KIND_LABEL[f.kind] || f.kind) + ' · ' + f.count + ' events'));
        L.push('');
        L.push('- Events: ' + EVENTS.length);
        L.push('- Window: ' + fmt(c.first) + ' to ' + fmt(c.last));
        L.push('- Distinct accounts: ' + c.users + ' · addresses: ' + c.ips + ' · countries: ' + c.countries);
        L.push('');
        L.push('## Findings');
        if (!FINDINGS.length) L.push('None fired. This is not the same as "no compromise": see gaps below.');
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
            chip.appendChild(el('button', {
                class: 'chip-x', type: 'button', title: 'remove this file and its events',
                'aria-label': 'remove ' + f.name,
                onclick: () => removeFile(f.name),
            }, '×'));
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
            s.appendChild(el('b', { text: fmt(c.first) + ' → ' + fmt(c.last) }));
            s.appendChild(el('span', { text: 'window (UTC)' }));
            stats.appendChild(s);
        }
        root.appendChild(stats);

        const tabs = el('div', { class: 'tabs', role: 'tablist' });
        [['findings', 'Findings', FINDINGS.length], ['timeline', 'Timeline', EVENTS.length],
        ['pivots', 'Pivots', ''], ['rows', 'Original rows', ''], ['coverage', 'Gaps', '']]
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
        else if (view === 'rows') body.appendChild(viewRows());
        else body.appendChild(viewCoverage());
        root.appendChild(body);

        /* keep the splitter reachable after files are loaded, or an oversized
           drop would have nowhere to land */
        root.appendChild(splitBlock());
    }

    function helpBlock() {
        const frag = document.createDocumentFragment();

        const priv = el('div', { class: 'privacy' });
        priv.appendChild(el('h2', { text: '🔒 Your logs never leave this device' }));
        priv.appendChild(el('p', null, rich('This page has no server, no upload, no analytics and makes **no network requests at all**. Files are read with the browser’s own file reader and held in memory until you close the tab. You can disconnect from the network and it will work identically. That is the intended way to use it with real evidence.')));
        frag.appendChild(priv);

        const steps = el('div', { class: 'howto' });
        steps.appendChild(el('h2', { text: 'What to export, and from where' }));
        const dl = el('dl');
        [
            ['Entra sign-in logs', 'Entra admin centre → Monitoring & health → Sign-in logs → Download (JSON or CSV). **Export all four tabs**: interactive, non-interactive, service principal, managed identity. Non-interactive is where replayed tokens appear.'],
            ['Entra audit logs', 'Entra admin centre → Monitoring & health → Audit logs → Download. Prefer **JSON**: the CSV loses the old and new values that show what actually changed.'],
            ['Purview / Unified Audit Log', 'Purview → Audit → New search → Export CSV. The useful content is inside the `AuditData` column, which this tool unpacks for you.'],
            ['Message trace', 'Exchange admin centre → Mail flow → Message trace. Export this **first**: it expires in about 10 days.'],
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
        caveat.appendChild(el('p', null, rich('A triage aid. It points you at rows worth reading and explains why they matter. It does **not** decide whether you have an incident. Detections are pattern matches without your context: your VPN egress, your service accounts, your change tickets. Read the evidence, not the label.')));
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
