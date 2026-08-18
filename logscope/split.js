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
     original-rows.csv       matching rows in the ORIGINAL schema, so a
                             filtered slice can be loaded back into Logscope
     <Array>.csv             one table per discovered array inside AuditData

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
    const MAX_FAMILIES = 12;           // discovered JSON array tables, by frequency
    const FAMILY_KEYS = 48;            // columns per discovered table
    const FAMILY_ITEMS = 200;          // array items written per record

    /* ------------------------------------------------------------------ CSV */

    function csvCell(v) {
        if (v === null || v === undefined) return '';
        let s = typeof v === 'string' ? v : String(v);
        if (s.length > CELL_MAX) s = s.slice(0, CELL_MAX) + '...[truncated]';
        /* Log fields are attacker-influenced. A cell starting with = + - @ or a
           tab runs as a formula when the CSV opens in Excel, so those cells
           are prefixed with an apostrophe. Plain negative numbers stay
           numbers; original-rows.csv (rawCell) keeps the original bytes. */
        if (/^[=+@\t\r]/.test(s) || (s.charAt(0) === '-' && !/^-\d+(\.\d+)?$/.test(s))) s = "'" + s;
        if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    /** Untruncated variant for machine-read output. Excel is not the reader. */
    function rawCell(v) {
        if (v === null || v === undefined) return '';
        const s = typeof v === 'string' ? v : String(v);
        if (/[",\r\n]/.test(s) || /^\s|\s$/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
        return s;
    }

    const csvRow = arr => arr.map(csvCell).join(',') + '\r\n';

    /** Buffered writer. Finished chunks become Blobs so they leave the JS heap.
        `rawCells` disables the Excel cell cap: original-rows.csv is re-ingested
        by the analyser, and truncating a JSON cell would corrupt it silently.
        The first few rows are kept as `sample` so the UI can show how the
        file will look before anyone opens it in Excel. */
    function makeSink(filename, header, rawCells) {
        const parts = [];
        const cell = rawCells ? rawCell : csvCell;
        const sample = [];
        let buf = '\uFEFF';            // BOM, so Excel reads UTF-8 correctly
        let rows = 0;
        if (header) buf += csvRow(header);
        return {
            filename: filename,
            header: header || null,
            sample: sample,
            write(arr) {
                if (sample.length < 6) {
                    sample.push(arr.map(x => (x === null || x === undefined) ? '' : String(x)));
                }
                buf += arr.map(cell).join(',') + '\r\n';
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

    /**
     * Incremental splitter for JSON exports: an array of objects, a single
     * wrapper object, or NDJSON. Emits the raw text of each complete
     * top-level object, so a JSON file becomes AuditData-style records
     * without ever holding the whole file as one string.
     */
    function makeJsonStream(onObject) {
        let depth = 0, buf = '', inString = false, escaped = false, started = false;
        return {
            push(text) {
                if (!started) { started = true; if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); }
                for (let i = 0; i < text.length; i++) {
                    const c = text[i];
                    if (depth === 0) {
                        if (c === '{') { depth = 1; buf = c; }
                        continue;              // skip [ ] , whitespace between objects
                    }
                    buf += c;
                    if (inString) {
                        if (escaped) { escaped = false; continue; }
                        if (c === '\\') { escaped = true; continue; }
                        if (c === '"') inString = false;
                        continue;
                    }
                    if (c === '"') { inString = true; continue; }
                    if (c === '{') depth++;
                    else if (c === '}') {
                        depth--;
                        if (depth === 0) { onObject(buf); buf = ''; }
                    }
                }
            },
            end() { },
        };
    }

    /** Read a File in slices, decoding as UTF-8 across boundaries.
        `limit` stops after that many bytes: enough for a preview. */
    function streamFile(file, onText, onDone, onError, onProgress, limit) {
        const dec = new TextDecoder('utf-8');
        const end = Math.min(file.size, limit || file.size);
        let offset = 0;
        function step() {
            if (offset >= end) {
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
                if (onProgress) onProgress(Math.min(offset, end), end);
                /* Yield so the browser can paint the progress bar. */
                setTimeout(step, 0);
            };
            fr.onerror = () => onError(fr.error || new Error('read failed'));
            fr.readAsArrayBuffer(file.slice(offset, Math.min(offset + CHUNK, end)));
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

    /* --------------------------------------------------------- IP scoping */

    /** Addresses that can only be internal: RFC1918, loopback, link-local,
        CGNAT, unique-local and link-local IPv6. */
    function isPrivateIp(ip) {
        if (ip.indexOf(':') >= 0) {
            return ip === '::1' || /^f[cd]/.test(ip) || ip.indexOf('fe80:') === 0;
        }
        const o = ip.split('.').map(Number);
        return o[0] === 10 || o[0] === 127 ||
            (o[0] === 172 && o[1] >= 16 && o[1] <= 31) ||
            (o[0] === 192 && o[1] === 168) ||
            (o[0] === 169 && o[1] === 254) ||
            (o[0] === 100 && o[1] >= 64 && o[1] <= 127);
    }

    function ip4ToInt(ip) {
        const o = ip.split('.');
        return (((+o[0]) * 16777216) + ((+o[1]) * 65536) + ((+o[2]) * 256) + (+o[3])) >>> 0;
    }

    function ip6ToBig(ip) {
        const dbl = ip.indexOf('::');
        let head = [], tail = [];
        if (dbl >= 0) {
            head = ip.slice(0, dbl).split(':').filter(Boolean);
            tail = ip.slice(dbl + 2).split(':').filter(Boolean);
        } else {
            head = ip.split(':');
        }
        const groups = head.concat(new Array(8 - head.length - tail.length).fill('0'), tail);
        let n = 0n;
        for (let i = 0; i < 8; i++) n = (n << 16n) + BigInt(parseInt(groups[i] || '0', 16) || 0);
        return n;
    }

    /**
     * Pull every CIDR out of any text: the official ServiceTags JSON, a CSV,
     * or a pasted list. Every range in such a file is a Microsoft range, so
     * the union is the right answer.
     */
    function parseCidrList(text) {
        const v4 = [], v6 = [];
        const re4 = /\b(\d{1,3}(?:\.\d{1,3}){3})\/(\d{1,2})\b/g;
        let m;
        while ((m = re4.exec(text)) !== null) {
            const bits = +m[2];
            if (bits > 32 || !validIp(m[1])) continue;
            const size = bits === 32 ? 1 : Math.pow(2, 32 - bits);
            const start = bits === 0 ? 0 : (ip4ToInt(m[1]) - (ip4ToInt(m[1]) % size)) >>> 0;
            v4.push([start, (start + size - 1) >>> 0]);
        }
        const re6 = /([0-9a-fA-F:]{2,45}::?[0-9a-fA-F:]*)\/(\d{1,3})/g;
        while ((m = re6.exec(text)) !== null) {
            const ip = m[1].toLowerCase();
            const bits = +m[2];
            if (bits > 128 || !isIpv6(ip)) continue;
            const shift = BigInt(128 - bits);
            const start = (ip6ToBig(ip) >> shift) << shift;
            v6.push([start, start + ((1n << shift) - 1n)]);
        }
        v4.sort((a, b) => a[0] - b[0]);
        v6.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
        return { v4: v4, v6: v6, count: v4.length + v6.length };
    }

    /** Classifier: private, microsoft (inside the loaded ranges), or public. */
    function makeScope(ranges) {
        function inRanges(ip) {
            if (!ranges || !ranges.count) return false;
            if (ip.indexOf(':') < 0) {
                const n = ip4ToInt(ip);
                let lo = 0, hi = ranges.v4.length - 1;
                while (lo <= hi) {
                    const mid = (lo + hi) >> 1, r = ranges.v4[mid];
                    if (n < r[0]) hi = mid - 1; else if (n > r[1]) lo = mid + 1; else return true;
                }
                return false;
            }
            let b;
            try { b = ip6ToBig(ip); } catch (e) { return false; }
            let lo = 0, hi = ranges.v6.length - 1;
            while (lo <= hi) {
                const mid = (lo + hi) >> 1, r = ranges.v6[mid];
                if (b < r[0]) hi = mid - 1; else if (b > r[1]) lo = mid + 1; else return true;
            }
            return false;
        }
        return function (ip) {
            if (isPrivateIp(ip)) return 'private';
            return inRanges(ip) ? 'microsoft' : 'public';
        };
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

    /** Purview writes many arrays as [{Name, Value}, ...]. Collapsed into
        `Family.Name` columns they become filterable in Excel, which is where
        DeviceProperties.OS, DeviceProperties.BrowserType and
        ExtendedProperties.UserAgent come from. */
    const isNameValue = x => x !== null && typeof x === 'object' && !Array.isArray(x) &&
        typeof x.Name === 'string' && x.Name !== '' &&
        Object.keys(x).every(k => k === 'Name' || k === 'Value');

    /**
     * Walk the AuditData object into flat `Dotted.Path` scalars. Arrays named
     * above are skipped here and emitted as child rows instead; name/value
     * pair arrays become `Family.Name` columns; other arrays of scalars are
     * joined, and short arrays of objects are indexed.
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
                if (v.length && v.every(isNameValue)) {
                    v.forEach(x => {
                        const nk = key + '.' + x.Name;
                        const val = x.Value === undefined ? '' : x.Value;
                        /* Repeated names keep every value, not just the last. */
                        if (out[nk] !== undefined && out[nk] !== val) out[nk] = out[nk] + '; ' + val;
                        else out[nk] = val;
                    });
                    return;
                }
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

    /* Columns the splitter creates rather than copies from the export. The
       UI marks them so nobody hunts for AllIPs in Purview. */
    const DERIVED_COLS = {
        RowId: 'added by the splitter: row number in file order, the join key for every table',
        AllIPs: 'added by the splitter: every IP address found anywhere in the record, including inside the JSON',
    };

    /* Column templates for records.csv. An entry ending in '.' matches every
       flattened key in that family; anything else matches one key, case
       insensitively. BASE_COLS are always present, so who, when, what and
       from where survive every template. */
    const TEMPLATES = {
        all: { label: 'Everything (most common columns first)', cols: null },
        signin: {
            label: 'Sign-ins and identity',
            cols: ['UserKey', 'UserType', 'ObjectId', 'Id', 'ApplicationId',
                'AzureActiveDirectoryEventType', 'LogonError', 'ActorIpAddress',
                'ActorUPN', 'Actor.', 'Target.', 'TargetUserOrGroupName',
                'ExtendedProperties.RequestType', 'ExtendedProperties.ResultStatusDetail',
                'ExtendedProperties.UserAgent', 'AppAccessContext.'],
        },
        device: {
            label: 'Devices, browsers and agents',
            cols: ['ActorIpAddress', 'DeviceProperties.', 'DeviceDisplayName',
                'ExtendedProperties.UserAgent', 'UserAgent', 'BrowserName', 'BrowserVersion',
                'Platform', 'ClientInfoString', 'ClientAppId', 'AppId', 'ClientVersion',
                'ClientProcessName', 'GeoLocation'],
        },
        mail: {
            label: 'Mailbox activity',
            cols: ['MailboxOwnerUPN', 'MailboxGuid', 'LogonType', 'InternalLogonType',
                'LogonUserSid', 'ClientInfoString', 'ClientIPAddress', 'ClientProcessName',
                'ClientVersion', 'OperationProperties.', 'OperationCount', 'Item.',
                'Folder.', 'DestFolder.', 'CrossMailboxOperation', 'SendAsUserSmtp',
                'SendOnBehalfOfUserSmtp', 'SaveToSentItems', 'Subject', 'MessageId'],
        },
        files: {
            label: 'Files, SharePoint and OneDrive',
            cols: ['ObjectId', 'SiteUrl', 'SourceRelativeUrl', 'SourceFileName',
                'SourceFileExtension', 'ItemType', 'EventSource', 'ListId',
                'ListItemUniqueId', 'WebId', 'TargetUserOrGroupName', 'TargetUserOrGroupType',
                'UserAgent', 'ApplicationDisplayName', 'AuthenticationType',
                'BrowserName', 'BrowserVersion', 'Platform', 'DeviceDisplayName', 'GeoLocation'],
        },
    };

    /** Expand one template entry against the keys seen in the file. */
    function templateHits(entry, rankedKeys, seen) {
        const isFam = entry.charAt(entry.length - 1) === '.';
        const want = (isFam ? entry.slice(0, -1) : entry).toLowerCase();
        return rankedKeys.filter(k => {
            if (seen.has(k)) return false;
            const lk = k.toLowerCase();
            if (isFam) return lk === want || lk.indexOf(want + '.') === 0 || lk.indexOf(want + '[') === 0;
            return lk === want;
        });
    }

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

    function matches(filters, ips, user, op, created, hay, scopeFn) {
        if (filters.ip) {
            const want = filters.ip.trim().toLowerCase();
            if (want) {
                /* A complete address must match exactly: 1.2.3.4 must never
                   catch 11.2.3.45 or 1.2.3.40 in an investigation. Anything
                   partial works as a prefix. */
                const hit = validIp(want)
                    ? ips.indexOf(want) >= 0
                    : ips.some(x => x.indexOf(want) === 0);
                if (!hit) return false;
            }
        }
        if (filters.scope && filters.scope !== 'any' && scopeFn) {
            const scopes = ips.map(scopeFn);
            /* excludeMs keeps rows with no IPs at all: nothing Microsoft is
               mentioned there. The keep-only options need a matching IP. */
            if (filters.scope === 'excludeMs') {
                if (scopes.indexOf('microsoft') >= 0) return false;
            } else if (filters.scope === 'private') {
                if (scopes.indexOf('private') < 0) return false;
            } else if (filters.scope === 'public') {
                if (scopes.indexOf('public') < 0 && scopes.indexOf('microsoft') < 0) return false;
            } else if (filters.scope === 'publicNotMs') {
                if (scopes.indexOf('public') < 0) return false;
            }
        }
        if (filters.user) {
            if (String(user || '').toLowerCase().indexOf(filters.user.trim().toLowerCase()) < 0) return false;
        }
        if (filters.op) {
            if (String(op || '').toLowerCase().indexOf(filters.op.trim().toLowerCase()) < 0) return false;
        }
        if (filters.text) {
            /* Searches the raw row, so it reaches every corner of the
               AuditData JSON, including rows whose JSON would not parse. */
            if (String(hay || '').indexOf(filters.text.trim().toLowerCase()) < 0) return false;
        }
        if (filters.from || filters.to) {
            /* A row with no readable timestamp is kept: losing evidence to a
               date filter is worse than showing one row too many. */
            const t = parseUtc(created);
            if (!isNaN(t)) {
                if (filters.from && t < parseUtc(filters.from)) return false;
                if (filters.to && t > parseUtc(filters.to) + 86399000) return false;
            }
        }
        return true;
    }

    /** UAL timestamps are UTC but written without a zone designator; parsing
        them as local time shifts rows across date-filter boundaries. */
    function parseUtc(s) {
        if (!s) return NaN;
        const t = String(s).trim();
        if (/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(t)) {
            return Date.parse(t.replace(' ', 'T') + 'Z');
        }
        return Date.parse(t);
    }

    /** Top-level arrays of objects that are not already special-cased become
        their own discovered tables: Actor, Target, AlertLinks and whatever
        else the workload writes. Pure name/value lists are excluded, they are
        already full columns in records.csv. */
    function isFamilyArray(k, v) {
        return Array.isArray(v) && v.length > 0 &&
            !CHILD_ARRAYS[k] && k !== 'Folders' &&
            v.some(x => x !== null && typeof x === 'object' && !Array.isArray(x)) &&
            !v.every(isNameValue);
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
        const famStat = new Map();     // family name -> { rows, keys: Map }
        /* Preview reads only the head of the file: enough to show the shape
           without paying for two passes over 175 MB. The last row in the
           slice may be cut mid-record, so the parser is never end()ed and
           the partial tail is discarded. */
        const PREVIEW_BYTES = 2 * CHUNK;
        const preview = !!filters.preview;
        const limit = preview ? Math.min(file.size, PREVIEW_BYTES) : file.size;
        const partial = limit < file.size;
        const chosen = filters.tables || null;
        const wants = id => !chosen || !!chosen[id];
        /* Flat mode: one row keeps every column; mail items expand into one
           row each, carrying the whole record with them. Optionally the rows
           are split into one file per Workload, never by column. */
        const flatMode = !!filters.flat;
        const flatSplit = flatMode && !!filters.flatSplit;
        const flatLean = flatMode && !!filters.flatLean;
        const flatSkip = filters.flatSkip || {};
        const wlStat = new Map();      // workload -> { rows, filledOrig, filledFlat, hasMail }
        const wlKey = ad => String((ad && ad.Workload) || 'other');
        /* Classifies every address as private, microsoft or public; without a
           loaded ranges file nothing is ever 'microsoft'. */
        const scopeFn = makeScope(filters.msRanges || null);
        const stats = {
            rows: 0, parsed: 0, unparsed: 0, matched: 0,
            first: '', last: '', ips: 0, users: new Set(), ops: new Map(),
            usersCapped: false, droppedCols: 0,
            preview: preview, previewPartial: partial, previewBytes: limit,
            template: TEMPLATES[filters.template] ? filters.template : 'all',
            templateMissing: [],
            families: [], familiesDropped: 0, familyCapped: [],
            flat: flatMode, flatSplit: flatSplit, flatLean: flatLean,
            workloads: [], mailExpanded: 0,
        };

        /* One row stream for both input kinds. A JSON export (an array of
           objects, one wrapper object, or NDJSON) is converted on the fly:
           each object becomes one AuditData-style row, and the rest of the
           pipeline is identical. */
        const JSON_HEADER = ['CreationDate', 'UserIds', 'Operations', 'AuditData'];
        let jsonMode = false;
        function makeSource(onRow) {
            let inner = null;
            return {
                push(text) {
                    if (!inner) {
                        const first = text.replace(/^\uFEFF/, '').match(/\S/);
                        jsonMode = !!first && (first[0] === '{' || first[0] === '[');
                        if (jsonMode) {
                            header = JSON_HEADER.slice();
                            hmap = headerIndex(header);
                            stats.noAuditData = false;
                            stats.jsonSource = true;
                            inner = makeJsonStream(function (objText) {
                                const o = parseJson(objText);
                                const created = (o && pick(o, ['CreationTime', 'createdDateTime', 'activityDateTime', 'timestamp', 'time'])) || '';
                                const user = (o && pick(o, ['UserId', 'userPrincipalName', 'UserKey'])) || '';
                                const op = (o && pick(o, ['Operation', 'operationName', 'activityDisplayName'])) || '';
                                onRow([String(created), String(user), String(op), objText]);
                            });
                        } else {
                            inner = makeCsvStream(onRow);
                        }
                    }
                    inner.push(text);
                },
                end() { if (inner) inner.end(); },
            };
        }

        /* ---------------- pass one: learn the shape of the file ---------------- */
        function passOne() {
            const src = makeSource(function (row) {
                if (!header) {
                    header = row.slice();
                    hmap = headerIndex(header);
                    /* The one column this tool exists for. Its absence means
                       the file is not a Purview export; say so, loudly. */
                    stats.noAuditData = hmap['auditdata'] === undefined;
                    return;
                }
                if (row.length === 1 && row[0] === '') return;
                stats.rows++;
                const o = rowObject(header, row);
                const adRaw = pick(o, ['AuditData', 'auditdata']);
                const ad = parseJson(adRaw);
                const created = (ad && pick(ad, ['CreationTime'])) || pick(o, ['CreationDate', 'CreationTime']);
                const user = (ad && pick(ad, ['UserId'])) || pick(o, ['UserIds', 'UserId']);
                const op = (ad && pick(ad, ['Operation'])) || pick(o, ['Operations', 'Operation']);
                let ips;
                if (ad) {
                    stats.parsed++;
                    const flat = flatten(ad, '', Object.create(null));
                    /* Count every key on every row; gating the whole loop once
                       the cap was reached skewed the frequencies that decide
                       which columns records.csv gets. */
                    Object.keys(flat).forEach(k => {
                        if (colCount.has(k)) colCount.set(k, colCount.get(k) + 1);
                        else if (colCount.size < MAX_COLS * 3) colCount.set(k, 1);
                    });
                    /* Learn every table-like array in the JSON and its columns. */
                    Object.keys(ad).forEach(k => {
                        if (!isFamilyArray(k, ad[k])) return;
                        let f = famStat.get(k);
                        if (!f) {
                            if (famStat.size >= MAX_FAMILIES * 2) return;
                            f = { rows: 0, keys: new Map() };
                            famStat.set(k, f);
                        }
                        f.rows++;
                        ad[k].slice(0, FAMILY_ITEMS).forEach(item => {
                            if (!item || typeof item !== 'object' || Array.isArray(item)) return;
                            const fi = flatten(item, '', Object.create(null));
                            Object.keys(fi).forEach(fk => {
                                if (f.keys.has(fk)) f.keys.set(fk, f.keys.get(fk) + 1);
                                else if (f.keys.size < FAMILY_KEYS * 2) f.keys.set(fk, 1);
                            });
                        });
                    });
                    ips = harvestIps(flat, adRaw);
                } else {
                    /* A row whose JSON would not parse still holds evidence.
                       Harvest the raw text so the IP filter and the summary
                       cannot silently lose it. */
                    stats.unparsed++;
                    ips = harvestIps({}, row.join(' '));
                }
                if (flatMode) {
                    /* Which columns actually carry a value, per workload, so
                       the lean option can drop the ones empty everywhere. */
                    const wl = wlKey(ad);
                    let w = wlStat.get(wl);
                    if (!w) { w = { rows: 0, filledOrig: new Set(), filledFlat: new Set(), hasMail: false }; wlStat.set(wl, w); }
                    w.rows++;
                    for (let ci = 0; ci < header.length; ci++) {
                        if (row[ci] !== undefined && row[ci] !== '') w.filledOrig.add(ci);
                    }
                    if (ad) {
                        const fl = flatten(ad, '', Object.create(null));
                        Object.keys(fl).forEach(k => { if (fl[k] !== '') w.filledFlat.add(k); });
                        if (Array.isArray(ad.Folders) && ad.Folders.some(f => f && ((f.FolderItems || []).length || f.Path))) w.hasMail = true;
                    }
                }
                if (created) {
                    if (!stats.first || created < stats.first) stats.first = created;
                    if (!stats.last || created > stats.last) stats.last = created;
                }
                if (user) {
                    if (stats.users.size < 5000) stats.users.add(String(user).toLowerCase());
                    else stats.usersCapped = true;
                }
                if (op) stats.ops.set(op, (stats.ops.get(op) || 0) + 1);
                ips.forEach(ip => {
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
                t => src.push(t),
                () => {
                    if (!partial) src.end();
                    stats.ips = ipStat.size;
                    stats.msRanges = (filters.msRanges && filters.msRanges.count) || 0;
                    stats.scopeCounts = { private: 0, microsoft: 0, public: 0 };
                    ipStat.forEach((v, ip) => { stats.scopeCounts[scopeFn(ip)]++; });
                    passTwo();
                },
                e => cb.error('Could not read the file: ' + (e && e.message ? e.message : e)),
                (a, b) => cb.progress('Reading and indexing', a, b, 0),
                limit);
        }

        /* ---------------- pass two, flat: complete rows, never split by column */
        function passTwoFlat() {
            const ranked = Array.from(colCount.entries()).sort((a, b) => b[1] - a[1]);
            const unpackedAll = ranked.slice(0, MAX_COLS).map(e => e[0]).sort();
            stats.droppedCols += Math.max(0, ranked.length - MAX_COLS);
            stats.availableCols = ranked.length;

            const isTs = c => /^creation(date|time)$/i.test(String(c));
            const colOff = filters.columns || null;
            /* The row must stay complete where it matters: the join key and
               the timestamp can never be unticked. */
            const droppedCol = c => !!colOff && colOff[c] === false && c !== 'RowId' && !isTs(c);

            const ITEM_COLS = ['Folder.Path', 'Item.Index', 'Item.InternetMessageId', 'Item.SizeInBytes', 'Item.Subject'];
            const subset = makeSink('original-rows.csv', null, true);
            const ipsum = makeSink('ip-summary.csv', ['IP', 'Scope', 'Records', 'FirstSeen', 'LastSeen', 'DistinctUsers', 'Users', 'Operations']);
            if (wants('subset')) subset.write(header);

            /* One sink per workload when splitting by rows, one for the lot
               otherwise. Every file carries the full column set unless the
               lean option drops columns that are empty in that whole file. */
            const usedNames = new Set(['ip-summary.csv', 'original-rows.csv']);
            const sinks = new Map();
            const wlNames = flatSplit ? Array.from(wlStat.keys()) : ['all'];
            const unionW = { rows: 0, filledOrig: new Set(), filledFlat: new Set(), hasMail: false };
            wlStat.forEach(w => {
                unionW.rows += w.rows;
                w.filledOrig.forEach(i => unionW.filledOrig.add(i));
                w.filledFlat.forEach(k => unionW.filledFlat.add(k));
                if (w.hasMail) unionW.hasMail = true;
            });
            wlNames.forEach(wl => {
                const w = flatSplit ? wlStat.get(wl) : unionW;
                const enabled = flatSkip[wl] !== true;
                stats.workloads.push({ name: wl, records: w.rows, enabled: enabled });
                if (!enabled) return;
                const headKeep = [];
                header.forEach((h, i) => {
                    if (droppedCol(h)) return;
                    if (flatLean && !w.filledOrig.has(i) && !isTs(h)) return;
                    headKeep.push(i);
                });
                const unpackedKeep = unpackedAll.filter(k => {
                    if (droppedCol(k)) return false;
                    if (flatLean && !w.filledFlat.has(k)) return false;
                    return true;
                });
                const itemKeep = w.hasMail ? ITEM_COLS : [];
                const base = (wl === 'all' ? 'events-flat' : 'events-' + wl.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40));
                let fn = base + '.csv', n = 2;
                while (usedNames.has(fn.toLowerCase())) { fn = base + '-' + (n++) + '.csv'; }
                usedNames.add(fn.toLowerCase());
                const cols = ['RowId'].concat(headKeep.map(i => header[i]), ['AllIPs'], unpackedKeep, itemKeep);
                sinks.set(wl, {
                    headKeep: headKeep, unpackedKeep: unpackedKeep, itemKeep: itemKeep,
                    unpackedFrom: 1 + headKeep.length + 1,
                    sink: makeSink(fn, cols),
                });
            });

            let hdr2 = jsonMode, rowId = 0;
            const src = makeSource(function (row) {
                if (!hdr2) { hdr2 = true; return; }
                if (row.length === 1 && row[0] === '') return;
                rowId++;
                const o = rowObject(header, row);
                const adRaw = pick(o, ['AuditData', 'auditdata']);
                const ad = parseJson(adRaw);
                const created = (ad && pick(ad, ['CreationTime'])) || pick(o, ['CreationDate', 'CreationTime']);
                const user = (ad && pick(ad, ['UserId'])) || pick(o, ['UserIds', 'UserId']);
                const op = (ad && pick(ad, ['Operation'])) || pick(o, ['Operations', 'Operation']);
                const fl = ad ? flatten(ad, '', Object.create(null)) : {};
                const ips = ad ? harvestIps(fl, adRaw) : harvestIps({}, row.join(' '));
                const hay = filters.text ? row.join('\u0000').toLowerCase() : '';
                if (!matches(filters, ips, user, op, created, hay, scopeFn)) return;
                stats.matched++;

                if (wants('subset')) subset.write(row);

                const s = sinks.get(flatSplit ? wlKey(ad) : 'all');
                if (!s) return;
                const front = [rowId].concat(
                    s.headKeep.map(i => row[i] === undefined ? '' : row[i]),
                    [ips.join('; ')],
                    s.unpackedKeep.map(k => fl[k]));
                if (s.itemKeep.length && ad && Array.isArray(ad.Folders) && ad.Folders.length) {
                    /* One line per mail item, the whole record repeated on
                       each, so message, IP, device and timestamp share a row. */
                    let wrote = 0;
                    ad.Folders.forEach(f => {
                        const path = (f && f.Path) || '';
                        const items = (f && f.FolderItems && f.FolderItems.length) ? f.FolderItems : [null];
                        items.forEach((it, idx) => {
                            s.sink.write(front.concat([path, idx,
                                (it && it.InternetMessageId) || '',
                                (it && it.SizeInBytes) || '',
                                (it && it.Subject) || '']));
                            wrote++;
                        });
                    });
                    if (wrote > 1) stats.mailExpanded += wrote - 1;
                } else {
                    s.sink.write(s.itemKeep.length ? front.concat(['', '', '', '', '']) : front);
                }
            });

            streamFile(file,
                t => src.push(t),
                function () {
                    if (!partial) src.end();
                    if (wants('ipsummary')) {
                        Array.from(ipStat.entries())
                            .sort((a, b) => b[1].n - a[1].n)
                            .forEach(([ip, s]) => ipsum.write([
                                ip, scopeFn(ip), s.n, s.first, s.last, s.users.size,
                                Array.from(s.users).join('; '),
                                Array.from(s.ops).join('; '),
                            ]));
                    }

                    const fixed = [];
                    sinks.forEach((s, wl) => {
                        fixed.push({
                            id: 'flat:' + wl, sink: s.sink, unpackedFrom: s.unpackedFrom,
                            label: wl === 'all'
                                ? 'Every event with every column on one row; mail items expanded to one line each'
                                : 'Complete rows for the ' + wl + ' workload, every column, mail items expanded',
                        });
                    });
                    fixed.push({ id: 'ipsummary', label: 'IP summary, every address in the file with counts', sink: ipsum });
                    fixed.push({ id: 'subset', label: 'The matching rows exactly as the export wrote them, nothing truncated, ready to load back into Logscope', sink: subset });
                    const tables = fixed.filter(t => t.sink.rows > (t.id === 'subset' ? 1 : 0))
                        .map(t => ({
                            id: t.id,
                            label: t.label,
                            filename: t.sink.filename,
                            rows: t.id === 'subset' ? t.sink.rows - 1 : t.sink.rows,
                            header: t.sink.header || (t.id === 'subset' ? t.sink.sample[0] : null),
                            sample: t.id === 'subset' ? t.sink.sample.slice(1) : t.sink.sample,
                            unpackedFrom: t.unpackedFrom,
                            blob: preview ? null : t.sink.blob(),
                        }));

                    stats.topOps = Array.from(stats.ops.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
                    stats.userCount = stats.users.size;
                    const firstFlat = tables.filter(t => t.id.indexOf('flat:') === 0)[0];
                    stats.columns = firstFlat ? firstFlat.header.length : 0;
                    stats.baseCols = 0;
                    cb.done(tables, stats);
                },
                e => cb.error('Could not read the file: ' + (e && e.message ? e.message : e)),
                (a, b) => cb.progress('Building the tables', a, b, 1),
                limit);
        }

        /* ---------------- pass two: write the tables ---------------- */
        function passTwo() {
            if (flatMode) return passTwoFlat();
            const ranked = Array.from(colCount.entries())
                .filter(e => BASE_COLS.indexOf(e[0]) < 0)
                .sort((a, b) => b[1] - a[1]);
            const tmpl = TEMPLATES[stats.template];
            let extra;
            if (!tmpl.cols) {
                extra = ranked.slice(0, MAX_COLS).map(e => e[0]).sort();
                /* Anything beyond the cap is absent from records.csv but never
                   lost: original-rows.csv retains the full record. Say so
                   rather than hiding it. */
                stats.droppedCols += Math.max(0, ranked.length - MAX_COLS);
            } else {
                /* Template order is the column order; a family keeps its most
                   frequent key first. Entries with no match are reported so a
                   surprising Excel file explains itself. */
                const rankedKeys = ranked.map(e => e[0]);
                const seen = new Set();
                extra = [];
                tmpl.cols.forEach(entry => {
                    const hits = templateHits(entry, rankedKeys, seen);
                    if (!hits.length) { stats.templateMissing.push(entry); return; }
                    hits.forEach(k => { seen.add(k); extra.push(k); });
                });
                extra = extra.slice(0, MAX_COLS);
            }
            stats.availableCols = ranked.length;

            /* Preview checkboxes can drop any column except the RowId join
               key and the timestamp: every event must keep its time. */
            const colOff = filters.columns || null;
            const droppedCol = c => !!colOff && colOff[c] === false && c !== 'RowId' && !/^creation(date|time)$/i.test(String(c));
            const keepBase = BASE_COLS.filter(c => !droppedCol(c));
            const extraKept = extra.filter(k => !droppedCol(k));
            stats.userDropped = (BASE_COLS.length - keepBase.length) + (extra.length - extraKept.length);
            extra = extraKept;

            const records = makeSink('records.csv', keepBase.concat(extra));
            const params = makeSink('parameters.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Source', 'Name', 'Value']);
            const modprop = makeSink('modified-properties.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Name', 'OldValue', 'NewValue']);
            const mail = makeSink('mail-items.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'FolderPath', 'InternetMessageId', 'SizeInBytes', 'Subject']);
            const affected = makeSink('affected-items.csv', ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Name', 'Value']);
            const subset = makeSink('original-rows.csv', null, true);
            const ipsum = makeSink('ip-summary.csv', ['IP', 'Scope', 'Records', 'FirstSeen', 'LastSeen', 'DistinctUsers', 'Users', 'Operations']);

            /* One sink per discovered JSON array table, most frequent first.
               A checkbox unticks one by name; new discoveries default to on.
               Filenames are deduplicated case-insensitively: Windows treats
               Records.csv and records.csv as the same download. */
            const famOff = filters.families || {};
            const usedNames = new Set(['records.csv', 'parameters.csv', 'modified-properties.csv',
                'mail-items.csv', 'affected-items.csv', 'ip-summary.csv', 'original-rows.csv']);
            const famRanked = Array.from(famStat.entries()).sort((a, b) => b[1].rows - a[1].rows);
            stats.familiesDropped = Math.max(0, famRanked.length - MAX_FAMILIES);
            const famSinks = new Map();
            famRanked.slice(0, MAX_FAMILIES).forEach(([name, f]) => {
                stats.families.push({ name: name, records: f.rows, enabled: famOff[name] !== false });
                if (famOff[name] === false) return;
                const base = (name.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 40) || 'array');
                let fn = base + '.csv', n = 2;
                while (usedNames.has(fn.toLowerCase())) { fn = base + '-' + (n++) + '.csv'; }
                usedNames.add(fn.toLowerCase());
                const cols = Array.from(f.keys.entries()).sort((a, b) => b[1] - a[1])
                    .slice(0, FAMILY_KEYS).map(e => e[0]).sort();
                famSinks.set(name, {
                    cols: cols,
                    sink: makeSink(fn, ['RowId', 'RecordId', 'CreationDate', 'UserId', 'Operation', 'Item'].concat(cols)),
                });
            });

            if (wants('subset')) subset.write(header);

            let hdr2 = jsonMode, rowId = 0;
            const src = makeSource(function (row) {
                if (!hdr2) { hdr2 = true; return; }
                if (row.length === 1 && row[0] === '') return;
                rowId++;
                const o = rowObject(header, row);
                const adRaw = pick(o, ['AuditData', 'auditdata']);
                const ad = parseJson(adRaw);
                const created = (ad && pick(ad, ['CreationTime'])) || pick(o, ['CreationDate', 'CreationTime']);
                const user = (ad && pick(ad, ['UserId'])) || pick(o, ['UserIds', 'UserId']);
                const op = (ad && pick(ad, ['Operation'])) || pick(o, ['Operations', 'Operation']);
                const recId = (ad && pick(ad, ['Id', 'RecordId'])) || pick(o, ['Identity', 'RecordId']);

                const flat = ad ? flatten(ad, '', Object.create(null)) : {};
                const ips = ad ? harvestIps(flat, adRaw) : harvestIps({}, row.join(' '));
                const hay = filters.text ? row.join('\u0000').toLowerCase() : '';
                if (!matches(filters, ips, user, op, created, hay, scopeFn)) return;
                stats.matched++;

                if (wants('subset')) subset.write(row);

                if (wants('records')) {
                    const baseAll = [
                        rowId, recId, created, user, op,
                        (ad && pick(ad, ['Workload'])) || '',
                        (ad && pick(ad, ['RecordType'])) || pick(o, ['RecordType']),
                        (ad && pick(ad, ['ResultStatus'])) || '',
                        (ad && cleanIp(pick(ad, ['ClientIP', 'ClientIPAddress', 'ActorIpAddress']))) || '',
                        ips.join('; '),
                    ];
                    const base = [];
                    for (let bi = 0; bi < BASE_COLS.length; bi++) {
                        if (!droppedCol(BASE_COLS[bi])) base.push(baseAll[bi]);
                    }
                    records.write(base.concat(extra.map(k => flat[k])));
                }

                if (!ad) return;

                if (wants('parameters') || wants('modified') || wants('affected')) {
                    Object.keys(CHILD_ARRAYS).forEach(name => {
                        const arr = ad[name];
                        if (!Array.isArray(arr)) return;
                        arr.forEach(item => {
                            if (!item || typeof item !== 'object') return;
                            if (CHILD_ARRAYS[name] === 'modified') {
                                if (!wants('modified')) return;
                                modprop.write([rowId, recId, created, user, op,
                                    item.Name || item.displayName || '',
                                    item.OldValue !== undefined ? item.OldValue : (item.oldValue || ''),
                                    item.NewValue !== undefined ? item.NewValue : (item.newValue || '')]);
                            } else if (CHILD_ARRAYS[name] === 'affected') {
                                if (!wants('affected')) return;
                                affected.write([rowId, recId, created, user, op,
                                    item.Name || item.Type || '',
                                    item.Id || item.Value || JSON.stringify(item).slice(0, 400)]);
                            } else {
                                if (!wants('parameters')) return;
                                params.write([rowId, recId, created, user, op, name,
                                    item.Name || '', item.Value === undefined ? '' : item.Value]);
                            }
                        });
                    });
                }

                if (wants('mail') && Array.isArray(ad.Folders)) {
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

                famSinks.forEach((fs, name) => {
                    const arr = ad[name];
                    if (!isFamilyArray(name, arr)) return;
                    if (arr.length > FAMILY_ITEMS && stats.familyCapped.indexOf(name) < 0) stats.familyCapped.push(name);
                    arr.slice(0, FAMILY_ITEMS).forEach((item, idx) => {
                        if (!item || typeof item !== 'object' || Array.isArray(item)) return;
                        const fi = flatten(item, '', Object.create(null));
                        fs.sink.write([rowId, recId, created, user, op, idx].concat(fs.cols.map(k => fi[k])));
                    });
                });
            });

            streamFile(file,
                t => src.push(t),
                function () {
                    if (!partial) src.end();
                    if (wants('ipsummary')) {
                        Array.from(ipStat.entries())
                            .sort((a, b) => b[1].n - a[1].n)
                            .forEach(([ip, s]) => ipsum.write([
                                ip, scopeFn(ip), s.n, s.first, s.last, s.users.size,
                                Array.from(s.users).join('; '),
                                Array.from(s.ops).join('; '),
                            ]));
                    }

                    const fixed = [
                        { id: 'records', label: 'Records, one row per audit event with the JSON flattened into columns', sink: records, unpackedFrom: keepBase.length },
                        { id: 'parameters', label: 'Parameters, operation arguments as name and value', sink: params, addedCols: 6 },
                        { id: 'modified', label: 'Modified properties, what changed from what to what', sink: modprop, addedCols: 5 },
                        { id: 'mail', label: 'Mail items, folders and messages touched', sink: mail, addedCols: 5, unpackedFrom: 5 },
                        { id: 'affected', label: 'Affected items, files and eDiscovery targets', sink: affected, addedCols: 5 },
                        { id: 'ipsummary', label: 'IP summary, every address in the file with counts', sink: ipsum },
                        { id: 'subset', label: 'The matching rows exactly as Purview wrote them, nothing truncated, ready to load back into Logscope', sink: subset },
                    ];
                    famSinks.forEach((fs, name) => {
                        fixed.push({ id: 'family:' + name, label: 'Rows of the ' + name + ' array inside AuditData, one line per item', sink: fs.sink, addedCols: 6, unpackedFrom: 6 });
                    });
                    const tables = fixed.filter(t => t.sink.rows > (t.id === 'subset' ? 1 : 0))
                        .map(t => ({
                            id: t.id,
                            label: t.label,
                            filename: t.sink.filename,
                            rows: t.id === 'subset' ? t.sink.rows - 1 : t.sink.rows,
                            header: t.sink.header || (t.id === 'subset' ? t.sink.sample[0] : null),
                            sample: t.id === 'subset' ? t.sink.sample.slice(1) : t.sink.sample,
                            unpackedFrom: t.unpackedFrom,
                            addedCols: t.addedCols,
                            blob: preview ? null : t.sink.blob(),
                        }));

                    stats.topOps = Array.from(stats.ops.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12);
                    stats.userCount = stats.users.size;
                    stats.columns = extra.length + keepBase.length;
                    stats.baseCols = keepBase.length;
                    cb.done(tables, stats);
                },
                e => cb.error('Could not read the file: ' + (e && e.message ? e.message : e)),
                (a, b) => cb.progress('Building the tables', a, b, 1),
                limit);
        }

        passOne();
    }

    window.LS_SPLIT = {
        splitUal, flatten, cleanIp, validIp, isIpv6, harvestIps,
        makeCsvStream, makeJsonStream, csvCell, csvRow, parseUtc, TEMPLATES, DERIVED_COLS,
        parseCidrList, makeScope, isPrivateIp,
    };
})();
