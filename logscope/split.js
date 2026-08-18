/* ==========================================================================
   Logscope, split.js
   --------------------------------------------------------------------------
   Turning one enormous Purview export into tables you can actually filter.

   A Unified Audit Log export is a CSV where the column that matters,
   `AuditData`, is a JSON document per row. Excel shows it as one unreadable
   cell, so you cannot filter on a client IP, an operation parameter or a
   mailbox folder, which is exactly what an investigation needs.

   This module streams the file off disk in slices, so a 175 MB export never
   exists in memory as a string, and writes out a set of joinable CSV tables:

     records.csv             one row per audit record, JSON flattened to columns
     parameters.csv          the Parameters array, one row per name/value
     modified-properties.csv the ModifiedProperties array, old and new values
     mail-items.csv          Folders[].FolderItems[], one row per message
     affected-items.csv      AffectedItems, for file and eDiscovery operations
     ip-summary.csv          every IP seen, with counts and who used it
     subset.csv              matching rows in the ORIGINAL schema, so a
                             filtered slice can be loaded back into Logscope

   Everything joins on `RowId`, which is assigned in file order, and on
   `RecordId` where the export provides one.

   Two passes over the file. The first discovers the JSON keys present and
   builds the IP summary; the second writes the tables. Re-reading a local
   file is cheap and it keeps peak memory flat.

   No network calls, and none may ever be added. Exposes window.LS_SPLIT.
   ========================================================================== */

(function () {
    'use strict';

    const CHUNK = 4 * 1024 * 1024;     // slice size read from disk
    const FLUSH = 4 * 1024 * 1024;     // buffered output before it goes to a Blob
    const MAX_COLS = 220;              // guard against pathological key explosion
    const CELL_MAX = 32000;            // Excel refuses a cell beyond 32,767
    const SET_CAP = 40;                // distinct values remembered per IP

    /* ------------------------------------------------------------------ CSV */

    function csvCell(v) {
        if (v === null || v === undefined) return '';
        let s = typeof v === 'string' ? v : String(v);
        if (s.length > CELL_MAX) s = s.slice(0, CELL_MAX) + '...[truncated]';
        if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    const csvRow = arr => arr.map(csvCell).join(',') + '\r\n';

    /** Buffered writer. Finished chunks become Blobs so they leave the JS heap. */
    function makeSink(filename, header) {
        const parts = [];
        let buf = '\uFEFF';            // BOM, so Excel reads UTF-8 correctly
        let rows = 0;
        if (header) buf += csvRow(header);
        return {
            filename: filename,
            write(arr) {
                buf += csvRow(arr);
                rows++;
                if (buf.length > FLUSH) { parts.push(new Blob([buf])); buf = ''; }
            },
            get rows() { return rows; },
            blob() {
                if (buf) { parts.push(new Blob([buf])); buf = ''; }
                return new Blob(parts, { type: 'text/csv;charset=utf-8' });
            },
        };
    }

    /* -------------------------------------------------- streaming CSV parser */

    /**
     * Incremental RFC 4180 parser. Fed arbitrary text chunks; emits complete
     * rows. Quoted fields containing commas, quotes and newlines survive a
     * chunk boundary landing anywhere inside them.
     */
    function makeCsvStream(onRow) {
        let field = '', row = [], inQuotes = false, quotePending = false, started = false;
        return {
            push(text) {
                if (!started) { started = true; if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); }
                for (let i = 0; i < text.length; i++) {
                    const c = text[i];
                    if (quotePending) {
                        quotePending = false;
                        if (c === '"') { field += '"'; continue; }
                        inQuotes = false;
                        /* fall through and handle c as an ordinary character */
                    }
                    if (inQuotes) {
                        if (c === '"') { quotePending = true; continue; }
                        field += c;
                        continue;
                    }
                    if (c === '"') { inQuotes = true; continue; }
                    if (c === ',') { row.push(field); field = ''; continue; }
                    if (c === '\r') continue;
                    if (c === '\n') { row.push(field); onRow(row); row = []; field = ''; continue; }
                    field += c;
                }
            },
            end() {
                if (quotePending) quotePending = false;
                if (field.length || row.length) { row.push(field); onRow(row); }
            },
        };
    }

    /** Read a File in slices, decoding as UTF-8 across boundaries. */
    function streamFile(file, onText, onDone, onError, onProgress) {
        const dec = new TextDecoder('utf-8');
        let offset = 0;
        function step() {
            if (offset >= file.size) {
                const tail = dec.decode();
                if (tail) onText(tail);
                onDone();
                return;
            }
            const fr = new FileReader();
            fr.onload = function () {
                try {
                    onText(dec.decode(new Uint8Array(fr.result), { stream: true }));
                } catch (e) {
                    onError(e);
                    return;
                }
                offset += CHUNK;
                if (onProgress) onProgress(Math.min(offset, file.size), file.size);
                /* Yield so the browser can paint the progress bar. */
                setTimeout(step, 0);
            };
            fr.onerror = () => onError(fr.error || new Error('read failed'));
            fr.readAsArrayBuffer(file.slice(offset, offset + CHUNK));
        }
        step();
    }

    /* --------------------------------------------------------------- IP bits */

    const IPV4 = /\b(?:\d{1,3}\.){3}\d{1,3}\b/g;
    const IPV6 = /\b(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}\b/gi;

    /** Purview writes "1.2.3.4:51142" and "[2001:db8::1]:443". Strip the port. */
    function cleanIp(v) {
        let s = String(v || '').trim();
        if (!s) return '';
        const br = s.match(/^\[([^\]]+)\](?::\d+)?$/);
        if (br) return br[1].toLowerCase();
        if (/^(?:\d{1,3}\.){3}\d{1,3}:\d+$/.test(s)) return s.split(':')[0];
        return s.toLowerCase();
    }

    function isIpv6(s) {
        if (!s || s.indexOf(':') < 0) return false;
        /* 09:45:00 in a timestamp looks like an address to a loose regex. */
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) return false;
        /* A lone colon at either end is a truncated match, not an address. */
        if (/^:[^:]/.test(s) || /[^:]:$/.test(s)) return false;
        const dbl = s.indexOf('::');
        if (dbl >= 0 && s.indexOf('::', dbl + 2) >= 0) return false;
        const parts = s.split(':');
        if (dbl < 0 && parts.length !== 8) return false;
        if (dbl >= 0 && parts.length > 8) return false;
        return parts.every(p => p === '' || /^[0-9a-f]{1,4}$/.test(p));
    }

    function validIp(s) {
        if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(s)) return s.split('.').every(o => +o <= 255);
        return isIpv6(s);
    }

    /** Every IP anywhere in the record, so a filter cannot miss a nested one. */
    function harvestIps(flat, rawJson) {
        const found = new Set();
        Object.keys(flat).forEach(k => {
            if (!/ip|address/i.test(k)) return;
            const c = cleanIp(flat[k]);
            if (c && validIp(c)) found.add(c);
        });
        const text = rawJson || '';
        let m;
        IPV4.lastIndex = 0;
        while ((m = IPV4.exec(text)) !== null) {
            if (validIp(m[0])) found.add(m[0]);
        }
        IPV6.lastIndex = 0;
        while ((m = IPV6.exec(text)) !== null) {
            const c = m[0].toLowerCase();
            if (isIpv6(c)) found.add(c);
        }
        return Array.from(found);
    }

    /* ------------------------------------------------------------ flattening */

    /* Arrays lifted into their own tables rather than squashed into a cell. */
    const CHILD_ARRAYS = {
        Parameters: 'parameters',
        OperationProperties: 'parameters',
        ExtendedProperties: 'parameters',
        ModifiedProperties: 'modified',
        AffectedItems: 'affected',
    };

    /**
     * Walk the AuditData object into flat `Dotted.Path` scalars. Arrays named
     * above are skipped here and emitted as child rows instead; other arrays
     * of scalars are joined, and short arrays of objects are indexed.
     */
    function flatten(obj, prefix, out, depth) {
        out = out || {};
        depth = depth || 0;
        if (depth > 6 || obj === null || typeof obj !== 'object') return out;
        Object.keys(obj).forEach(k => {
            const v = obj[k];
            const key = prefix ? prefix + '.' + k : k;
            if (v === null || v === undefined) return;
            if (Array.isArray(v)) {
                if (!prefix && CHILD_ARRAYS[k]) return;          // handled as a table
                if (k === 'Folders' && !prefix) return;          // handled as a table
                if (!v.length) return;
                if (v.every(x => x === null || typeof x !== 'object')) {
                    out[key] = v.join('; ');
                } else {
                    v.slice(0, 5).forEach((x, i) => flatten(x, key + '[' + i + ']', out, depth + 1));
                    if (v.length > 5) out[key + '.Count'] = v.length;
                }
                return;
            }
            if (typeof v === 'object') { flatten(v, key, out, depth + 1); return; }
            out[key] = v;
        });
        return out;
    }

    function parseJson(s) {
        if (typeof s !== 'string') return null;
        const t = s.trim();
        if (!t || t[0] !== '{') return null;
        try { return JSON.parse(t); } catch (e) { return null; }
    }

    /* ------------------------------------------------------------- the split */

    const BASE_COLS = [
        'RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Workload',
        'RecordType', 'ResultStatus', 'ClientIP', 'AllIPs',
    ];

    function pick(obj, names) {
        for (let i = 0; i < names.length; i++) {
            const v = obj[names[i]];
            if (v !== undefined && v !== null && v !== '') return v;
        }
        return '';
    }

    function headerIndex(header) {
        const map = {};
        header.forEach((h, i) => { map[String(h).trim().toLowerCase().replace(/[^a-z0-9]/g, '')] = i; });
        return map;
    }

    function rowObject(header, row) {
        const o = {};
        for (let i = 0; i < header.length; i++) o[header[i]] = row[i] === undefined ? '' : row[i];
        return o;
    }

    function matches(filters, ips, user, op, created) {
        if (filters.ip) {
            const want = filters.ip.trim().toLowerCase();
            if (want && !ips.some(x => x === want || x.indexOf(want) >= 0)) return false;
        }
        if (filters.user) {
            if (String(user || '').toLowerCase().indexOf(filters.user.trim().toLowerCase()) < 0) return false;
        }
        if (filters.op) {
            if (String(op || '').toLowerCase().indexOf(filters.op.trim().toLowerCase()) < 0) return false;
        }
        if (filters.from || filters.to) {
            const t = Date.parse(created);
            if (!isNaN(t)) {
                if (filters.from && t < Date.parse(filters.from)) return false;
                if (filters.to && t > Date.parse(filters.to) + 86399000) return false;
            }
        }
        return true;
    }

    /**
     * Split `file` into tables. Calls back with progress, then with the result:
     *   { tables: [{filename, blob, rows, label}], stats: {...} }
     */
    function splitUal(file, filters, cb) {
        filters = filters || {};
        let header = null, hmap = null;
        const colCount = new Map();
        const ipStat = new Map();
        const stats = {
            rows: 0, parsed: 0, unparsed: 0, matched: 0,
            first: '', last: '', ips: 0, users: new Set(), ops: new Map(),
        };

        /* ---------------- pass one: learn the shape of the file ---------------- */
        function passOne() {
            const csv = makeCsvStream(function (row) {
                if (!header) { header = row.slice(); hmap = headerIndex(header); return; }
                if (row.length === 1 && row[0] === '') return;
                stats.rows++;
                const o = rowObject(header, row);
                const adRaw = pick(o, ['AuditData', 'auditdata']);
                const ad = parseJson(adRaw);
                if (!ad) { stats.unparsed++; return; }
                stats.parsed++;
                const flat = flatten(ad, '', {});
                if (colCount.size < MAX_COLS) {
                    Object.keys(flat).forEach(k => colCount.set(k, (colCount.get(k) || 0) + 1));
                }
                const created = pick(ad, ['CreationTime']) || pick(o, ['CreationDate']);
                if (created) {
                    if (!stats.first || created < stats.first) stats.first = created;
                    if (!stats.last || created > stats.last) stats.last = created;
                }
                const user = pick(ad, ['UserId']) || pick(o, ['UserIds']);
                const op = pick(ad, ['Operation']) || pick(o, ['Operations']);
                if (user && stats.users.size < 5000) stats.users.add(String(user).toLowerCase());
                if (op) stats.ops.set(op, (stats.ops.get(op) || 0) + 1);
                harvestIps(flat, adRaw).forEach(ip => {
                    let s = ipStat.get(ip);
                    if (!s) { s = { n: 0, first: created, last: created, users: new Set(), ops: new Set() }; ipStat.set(ip, s); }
                    s.n++;
                    if (created) {
                        if (!s.first || created < s.first) s.first = created;
                        if (!s.last || created > s.last) s.last = created;
                    }
                    if (user && s.users.size < SET_CAP) s.users.add(user);
                    if (op && s.ops.size < SET_CAP) s.ops.add(op);
                });
            });
            streamFile(file,
                t => csv.push(t),
                () => { csv.end(); stats.ips = ipStat.size; passTwo(); },
                e => cb.error('Could not read the file: ' + (e && e.message ? e.message : e)),
                (a, b) => cb.progress('Reading and indexing', a, b, 0));
        }

        /* ---------------- pass two: write the tables ---------------- */
        function passTwo() {
            const extra = Array.from(colCount.entries())
                .filter(e => BASE_COLS.indexOf(e[0]) < 0)
                .sort((a, b) => b[1] - a[1])
                .slice(0, MAX_COLS)
                .map(e => e[0])
                .sort();

            const records = makeSink('records.csv', BASE_COLS.concat(extra));
            const params = makeSink('parameters.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Source', 'Name', 'Value']);
            const modprop = makeSink('modified-properties.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Name', 'OldValue', 'NewValue']);
            const mail = makeSink('mail-items.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'FolderPath', 'InternetMessageId', 'SizeInBytes', 'Subject']);
            const affected = makeSink('affected-items.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Name', 'Value']);
            const subset = makeSink('subset.csv', null);
            const ipsum = makeSink('ip-summary.csv', ['IP', 'Records', 'FirstSeen', 'LastSeen', 'DistinctUsers', 'Users', 'Operations']);

            subset.write(header);

            let hdr2 = null, rowId = 0;
            const csv = makeCsvStream(function (row) {
                if (!hdr2) { hdr2 = true; return; }
                if (row.length === 1 && row[0] === '') return;
                rowId++;
                const o = rowObject(header, row);
                const adRaw = pick(o, ['AuditData', 'auditdata']);
                const ad = parseJson(adRaw);
                const created = (ad && pick(ad, ['CreationTime'])) || pick(o, ['CreationDate']);
                const user = (ad && pick(ad, ['UserId'])) || pick(o, ['UserIds']);
                const op = (ad && pick(ad, ['Operation'])) || pick(o, ['Operations']);
                const recId = (ad && pick(ad, ['Id', 'RecordId'])) || pick(o, ['Identity', 'RecordId']);

                const flat = ad ? flatten(ad, '', {}) : {};
                const ips = ad ? harvestIps(flat, adRaw) : [];
                if (!matches(filters, ips, user, op, created)) return;
                stats.matched++;

                subset.write(row);

                const base = [
                    rowId, recId, created, user, op,
                    (ad && pick(ad, ['Workload'])) || '',
                    (ad && pick(ad, ['RecordType'])) || pick(o, ['RecordType']),
                    (ad && pick(ad, ['ResultStatus'])) || '',
                    (ad && cleanIp(pick(ad, ['ClientIP', 'ClientIPAddress', 'ActorIpAddress']))) || '',
                    ips.join('; '),
                ];
                records.write(base.concat(extra.map(k => flat[k])));

                if (!ad) return;

                Object.keys(CHILD_ARRAYS).forEach(name => {
                    const arr = ad[name];
                    if (!Array.isArray(arr)) return;
                    arr.forEach(item => {
                        if (!item || typeof item !== 'object') return;
                        if (CHILD_ARRAYS[name] === 'modified') {
                            modprop.write([rowId, recId, created, user, op,
                                item.Name || item.displayName || '',
                                item.OldValue !== undefined ? item.OldValue : (item.oldValue || ''),
                                item.NewValue !== undefined ? item.NewValue : (item.newValue || '')]);
                        } else if (CHILD_ARRAYS[name] === 'affected') {
                            affected.write([rowId, recId, created, user, op,
                                item.Name || item.Type || '',
                                item.Id || item.Value || JSON.stringify(item).slice(0, 400)]);
                        } else {
                            params.write([rowId, recId, created, user, op, name,
                                item.Name || '', item.Value === undefined ? '' : item.Value]);
                        }
                    });
                });

                if (Array.isArray(ad.Folders)) {
                    ad.Folders.forEach(f => {
                        const path = (f && f.Path) || '';
                        const items = (f && f.FolderItems) || [];
                        if (!items.length) {
                            mail.write([rowId, recId, created, user, op, path, '', '', '']);
                            return;
                        }
                        items.forEach(it => {
                            mail.write([rowId, recId, created, user, op, path,
                                (it && it.InternetMessageId) || '',
                                (it && it.SizeInBytes) || '',
                                (it && it.Subject) || '']);
                        });
                    });
                }
            });

            streamFile(file,
                t => csv.push(t),
                function () {
                    csv.end();
                    Array.from(ipStat.entries())
                        .sort((a, b) => b[1].n - a[1].n)
                        .forEach(([ip, s]) => ipsum.write([
                            ip, s.n, s.first, s.last, s.users.size,
                            Array.from(s.users).join('; '),
                            Array.from(s.ops).join('; '),
                        ]));

                    const tables = [
                        { label: 'Records, one row per audit event with the JSON flattened into columns', sink: records },
                        { label: 'Parameters, operation arguments as name and value', sink: params },
                        { label: 'Modified properties, what changed from what to what', sink: modprop },
                        { label: 'Mail items, folders and messages touched', sink: mail },
                        { label: 'Affected items, files and eDiscovery targets', sink: affected },
                        { label: 'IP summary, every address in the file with counts', sink: ipsum },
                        { label: 'Subset in the original schema, ready to load back into Logscope', sink: subset },
                    ].filter(t => t.sink.rows > 0)
                        .map(t => ({
                            label: t.label,
                            filename: t.sink.filename,
                            rows: t.sink.rows,
                            blob: t.sink.blob(),
                        }));

                    stats.topOps = Array.from(stats.ops.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
                    stats.userCount = stats.users.size;
                    stats.columns = extra.length + BASE_COLS.length;
                    cb.done(tables, stats);
                },
                e => cb.error('Could not read the file: ' + (e && e.message ? e.message : e)),
                (a, b) => cb.progress('Building the tables', a, b, 1));
        }

        passOne();
    }

    window.LS_SPLIT = {
        splitUal, flatten, cleanIp, validIp, isIpv6, harvestIps,
        makeCsvStream, csvCell, csvRow,
    };
})();
