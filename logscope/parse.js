/* ==========================================================================
 Logscope: parse.js
 --------------------------------------------------------------------------
 Format detection and normalisation for exported Microsoft logs.

 Everything here runs in the browser on a string the user dropped in. There
 is no network call in this file, and there must never be one. The whole
 value of this tool is that real incident evidence never leaves the machine.

 Supported inputs
 • Entra ID sign-in logs JSON (portal / Graph) and CSV
 • Entra ID audit logs JSON (portal / Graph) and CSV
 • Purview Unified Audit Log CSV with an AuditData JSON column, and
 Search-UnifiedAuditLog JSON output
 • Exchange message trace CSV
 • NDJSON of any of the above

 Everything is normalised to one flat event shape so the rules and the
 timeline only have to understand one thing:

 { ts, tsRaw, src, actor, actorIp, action, target, app, result,
 country, proto, ua, mfa, ca, risk, device, kind, extra, raw }

 Exposes window.LS_PARSE.
 ========================================================================== */

(function () {
 'use strict';

 /* ------------------------------------------------------------------ CSV */

 /**
 * RFC 4180 CSV. Written out longhand rather than with a regex because the
 * Purview AuditData column is a JSON blob full of commas, quotes and
 * newlines, and a naive split destroys exactly the evidence we came for.
 */
 function parseCSV(text) {
 const rows = [];
 let row = [], field = '', i = 0, inQuotes = false;

 if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM

 while (i < text.length) {
 const c = text[i];
 if (inQuotes) {
 if (c === '"') {
 if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
 inQuotes = false; i++; continue;
 }
 field += c; i++; continue;
 }
 if (c === '"') { inQuotes = true; i++; continue; }
 if (c === ',') { row.push(field); field = ''; i++; continue; }
 if (c === '\r') { i++; continue; }
 if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; i++; continue; }
 field += c; i++;
 }
 if (field.length || row.length) { row.push(field); rows.push(row); }
 return rows;
 }

 function rowsToObjects(rows) {
 if (!rows.length) return [];
 const head = rows[0].map(h => String(h).trim());
 const out = [];
 for (let r = 1; r < rows.length; r++) {
 if (rows[r].length === 1 && rows[r][0] === '') continue; // blank line
 const o = {};
 for (let c = 0; c < head.length; c++) o[head[c]] = rows[r][c] === undefined ? '' : rows[r][c];
 out.push(o);
 }
 return out;
 }

 /** Case- and punctuation-insensitive field lookup, because header text
 varies between portal versions and locales. */
 function pick(obj, names) {
 const keys = Object.keys(obj);
 for (const want of names) {
 const w = want.toLowerCase().replace(/[^a-z0-9]/g, '');
 for (const k of keys) {
 if (k.toLowerCase().replace(/[^a-z0-9]/g, '') === w) {
 const v = obj[k];
 if (v !== undefined && v !== null && v !== '') return v;
 }
 }
 }
 return '';
 }

 function tryJson(v) {
 if (typeof v !== 'string') return v;
 const s = v.trim();
 if (!s || (s[0] !== '{' && s[0] !== '[')) return null;
 try { return JSON.parse(s); } catch (e) { return null; }
 }

 function toDate(v) {
 if (!v) return null;
 const d = new Date(v);
 if (!isNaN(d.getTime())) return d;
 /* Portal CSV sometimes exports "3/14/2026, 2:04:11 PM" or
 "14/03/2026 14:04:11". Try the unambiguous parts. */
 const m = String(v).match(/(\d{1,4})[/-](\d{1,2})[/-](\d{1,4})[,\sT]+(\d{1,2}):(\d{2}):?(\d{2})?/);
 if (m) {
 const a = +m[1], b = +m[2], c = +m[3];
 const year = a > 31 ? a : c;
 const first = a > 31 ? b : a;
 const second = a > 31 ? c : b;
 /* Day-first if the first number cannot be a month. */
 const day = first > 12 ? first : second;
 const mon = first > 12 ? second : first;
 const d2 = new Date(Date.UTC(year, mon - 1, day, +m[4], +m[5], +(m[6] || 0)));
 if (!isNaN(d2.getTime())) return d2;
 }
 return null;
 }

 const str = v => (v === undefined || v === null) ? '' : String(v);

 /* ------------------------------------------------------------- detection */

 function looksLikeSigninJson(o) {
 return o && (o.userPrincipalName !== undefined || o.userDisplayName !== undefined) &&
 (o.appDisplayName !== undefined || o.clientAppUsed !== undefined ||
 o.createdDateTime !== undefined || o.ipAddress !== undefined);
 }
 function looksLikeAuditJson(o) {
 return o && (o.activityDisplayName !== undefined || o.loggedByService !== undefined ||
 (o.initiatedBy !== undefined && o.targetResources !== undefined));
 }
 function looksLikeUalJson(o) {
 return o && (o.AuditData !== undefined ||
 (o.Operations !== undefined && o.CreationDate !== undefined) ||
 (o.Operation !== undefined && o.RecordType !== undefined));
 }

 function detectFromHeaders(headers) {
 const h = headers.map(x => String(x).toLowerCase().replace(/[^a-z0-9]/g, ''));
 const has = n => h.indexOf(n) >= 0;
 if (has('auditdata') || (has('operations') && has('userids'))) return 'ual';
 if (has('senderaddress') || has('recipientaddress') || has('messagetraceid')) return 'trace';
 if (has('activity') && has('actor')) return 'audit';
 if (has('username') || has('ipaddress') || has('application')) {
 /* Both exports have "Date (UTC)". The sign-in one always carries a
 user or application column; the audit one carries Activity. */
 if (has('activity')) return 'audit';
 return 'signin';
 }
 if (has('signinerrorcode') || has('conditionalaccess')) return 'signin';
 return 'unknown';
 }

 /* ----------------------------------------------------------- normalisers */

 function normSigninJson(o) {
 const loc = o.location || {};
 const dev = o.deviceDetail || {};
 const st = o.status || {};
 const details = Array.isArray(o.authenticationDetails) ? o.authenticationDetails : [];

 let mfa = '';
 const detailText = JSON.stringify(details).toLowerCase();
 if (detailText.indexOf('previously satisfied') >= 0) mfa = 'prior';
 else if (details.some(d => d.succeeded && d.authenticationStepRequirement &&
 String(d.authenticationStepRequirement).toLowerCase().indexOf('multifactor') >= 0)) mfa = 'satisfied';
 else if (str(o.authenticationRequirement).toLowerCase() === 'multifactorauthentication') mfa = 'satisfied';
 else if (str(o.authenticationRequirement).toLowerCase() === 'singlefactorauthentication') mfa = 'single';

 return {
 ts: toDate(o.createdDateTime), tsRaw: str(o.createdDateTime),
 src: 'signin',
 kind: o.isInteractive === false ? 'non-interactive' : (o.servicePrincipalId ? 'service principal' : 'interactive'),
 actor: str(o.userPrincipalName || o.userDisplayName || o.servicePrincipalName),
 actorIp: str(o.ipAddress),
 action: str(o.appDisplayName || o.clientAppUsed || 'sign-in'),
 target: str(o.resourceDisplayName),
 app: str(o.appDisplayName),
 result: (st.errorCode === 0 || str(st.errorCode) === '0') ? 'success' : ('failure ' + str(st.errorCode)),
 country: str(loc.countryOrRegion),
 proto: str(o.authenticationProtocol || o.originalTransferMethod),
 ua: str(o.userAgent),
 mfa: mfa,
 ca: str(o.conditionalAccessStatus),
 risk: str(o.riskLevelDuringSignIn),
 device: str(dev.displayName || dev.deviceId),
 extra: {
 asn: str(o.autonomousSystemNumber),
 clientApp: str(o.clientAppUsed),
 userType: str(o.userType),
 compliant: dev.isCompliant, managed: dev.isManaged, trust: str(dev.trustType),
 failureReason: str(st.failureReason),
 transfer: str(o.originalTransferMethod),
 resourceId: str(o.resourceId),
 appId: str(o.appId),
 },
 raw: o,
 };
 }

 function normSigninCsv(o) {
 const status = str(pick(o, ['Status', 'Sign-in status']));
 const errCode = str(pick(o, ['Sign-in error code', 'Error code']));
 const mfaResult = str(pick(o, ['Multifactor authentication result', 'MFA result'])).toLowerCase();
 let mfa = '';
 if (mfaResult.indexOf('previously satisfied') >= 0 || mfaResult.indexOf('claim in the token') >= 0) mfa = 'prior';
 else if (mfaResult.indexOf('satisf') >= 0 || mfaResult.indexOf('success') >= 0) mfa = 'satisfied';
 else if (str(pick(o, ['Authentication requirement'])).toLowerCase().indexOf('single') >= 0) mfa = 'single';

 return {
 ts: toDate(pick(o, ['Date (UTC)', 'Date', 'Date time', 'CreationTime'])),
 tsRaw: str(pick(o, ['Date (UTC)', 'Date'])),
 src: 'signin',
 kind: 'csv',
 actor: str(pick(o, ['Username', 'User principal name', 'User', 'UserId'])),
 actorIp: str(pick(o, ['IP address', 'IP address (seen by resource)', 'IP'])),
 action: str(pick(o, ['Application', 'App'])) || 'sign-in',
 target: str(pick(o, ['Resource'])),
 app: str(pick(o, ['Application', 'App'])),
 result: (!errCode || errCode === '0') && /success/i.test(status || 'Success') ? 'success' : ('failure ' + errCode),
 country: str(pick(o, ['Location'])),
 proto: str(pick(o, ['Authentication Protocol', 'Original transfer method'])),
 ua: str(pick(o, ['User agent'])),
 mfa: mfa,
 ca: str(pick(o, ['Conditional Access'])),
 risk: str(pick(o, ['Risk level during sign-in', 'Risk state'])),
 device: str(pick(o, ['Device ID', 'Device'])),
 extra: {
 asn: str(pick(o, ['Autonomous system number'])),
 clientApp: str(pick(o, ['Client app'])),
 userType: str(pick(o, ['User type'])),
 failureReason: str(pick(o, ['Failure reason'])),
 transfer: str(pick(o, ['Original transfer method'])),
 joinType: str(pick(o, ['Join Type'])),
 compliantRaw: str(pick(o, ['Compliant'])),
 },
 raw: o,
 };
 }

 function normAuditJson(o) {
 const by = o.initiatedBy || {};
 const user = by.user || {};
 const app = by.app || {};
 const targets = Array.isArray(o.targetResources) ? o.targetResources : [];
 const t0 = targets[0] || {};
 const mods = [];
 targets.forEach(t => (t.modifiedProperties || []).forEach(m => mods.push({
 name: str(m.displayName), old: str(m.oldValue), now: str(m.newValue),
 })));

 return {
 ts: toDate(o.activityDateTime), tsRaw: str(o.activityDateTime),
 src: 'audit',
 kind: str(o.category),
 actor: str(user.userPrincipalName || app.displayName || user.displayName),
 actorIp: str(user.ipAddress),
 action: str(o.activityDisplayName),
 target: str(t0.userPrincipalName || t0.displayName || t0.id),
 app: str(app.displayName || o.loggedByService),
 result: str(o.result),
 country: '',
 proto: '', ua: '', mfa: '', ca: '', risk: '', device: '',
 extra: {
 service: str(o.loggedByService),
 category: str(o.category),
 resultReason: str(o.resultReason),
 targetType: str(t0.type),
 targets: targets.map(t => str(t.userPrincipalName || t.displayName)).filter(Boolean),
 mods: mods,
 },
 raw: o,
 };
 }

 function normAuditCsv(o) {
 return {
 ts: toDate(pick(o, ['Date (UTC)', 'Date', 'ActivityDateTime'])),
 tsRaw: str(pick(o, ['Date (UTC)', 'Date'])),
 src: 'audit',
 kind: str(pick(o, ['Category'])),
 actor: str(pick(o, ['Actor', 'Initiated by (actor)', 'Actor UPN'])),
 actorIp: str(pick(o, ['Actor IP address', 'IP address'])),
 action: str(pick(o, ['Activity', 'Activity Display Name', 'Operation'])),
 target: str(pick(o, ['Target(s)', 'Target', 'Targets'])),
 app: str(pick(o, ['Service'])),
 result: str(pick(o, ['Result', 'Status'])),
 country: '', proto: '', ua: '', mfa: '', ca: '', risk: '', device: '',
 extra: {
 service: str(pick(o, ['Service'])),
 category: str(pick(o, ['Category'])),
 resultReason: str(pick(o, ['Result reason'])),
 actorType: str(pick(o, ['Actor type'])),
 mods: [],
 },
 raw: o,
 };
 }

 /**
 * Purview rows carry the useful content inside an AuditData JSON string.
 * Unpacking it is most of the value of this tool. A spreadsheet shows the
 * operation name and hides the client IP, the parameters and the folders.
 */
 function normUal(o) {
 const ad = tryJson(o.AuditData) || (typeof o.AuditData === 'object' ? o.AuditData : null) || o;
 const params = Array.isArray(ad.Parameters) ? ad.Parameters : [];
 const paramMap = {};
 params.forEach(p => { if (p && p.Name) paramMap[p.Name] = str(p.Value); });

 const folders = Array.isArray(ad.Folders) ? ad.Folders : [];
 const items = [];
 folders.forEach(f => (f.FolderItems || []).forEach(it => items.push(str(it.InternetMessageId))));

 const op = str(ad.Operation || pick(o, ['Operations', 'Operation']));

 return {
 ts: toDate(ad.CreationTime || pick(o, ['CreationDate', 'CreationTime'])),
 tsRaw: str(ad.CreationTime || pick(o, ['CreationDate'])),
 src: 'ual',
 kind: str(ad.Workload || ad.RecordType || pick(o, ['RecordType'])),
 actor: str(ad.UserId || pick(o, ['UserIds', 'UserId'])),
 actorIp: str(ad.ClientIP || ad.ClientIPAddress || ad.ActorIpAddress),
 action: op,
 target: str(ad.ObjectId || ad.MailboxOwnerUPN || ad.TargetUserOrGroupName),
 app: str(ad.Workload || ad.ClientInfoString),
 result: str(ad.ResultStatus),
 country: '',
 proto: '', ua: str(ad.ClientInfoString || ad.UserAgent), mfa: '', ca: '', risk: '',
 device: str(ad.DeviceDisplayName),
 extra: {
 workload: str(ad.Workload),
 recordType: str(ad.RecordType),
 params: paramMap,
 paramText: params.map(p => p.Name + '=' + str(p.Value)).join('; '),
 folders: folders.map(f => str(f.Path)).filter(Boolean),
 itemCount: items.length,
 mailAccessType: str(ad.MailAccessType),
 isThrottled: ad.IsThrottled,
 appId: str(ad.AppId || ad.ClientAppId),
 subject: str(ad.Subject),
 modified: (ad.ModifiedProperties || []).map(m => str(m.Name) + '=' + str(m.NewValue)).join('; '),
 },
 raw: o,
 };
 }

 function normTrace(o) {
 return {
 ts: toDate(pick(o, ['date_time', 'Date', 'Received', 'StartDate'])),
 tsRaw: str(pick(o, ['date_time', 'Date'])),
 src: 'trace',
 kind: 'message',
 actor: str(pick(o, ['sender_address', 'SenderAddress', 'From'])),
 actorIp: str(pick(o, ['from_ip', 'FromIP'])),
 action: 'Mail sent',
 target: str(pick(o, ['recipient_address', 'RecipientAddress', 'To'])),
 app: 'Exchange',
 result: str(pick(o, ['status', 'Status'])),
 country: '', proto: '', ua: '', mfa: '', ca: '', risk: '', device: '',
 extra: {
 subject: str(pick(o, ['subject', 'Subject'])),
 size: str(pick(o, ['size', 'Size'])),
 toIp: str(pick(o, ['to_ip', 'ToIP'])),
 messageId: str(pick(o, ['message_id', 'MessageId'])),
 },
 raw: o,
 };
 }

 /* ------------------------------------------------------------- the entry */

 /**
 * Parse one file's text. Returns { kind, events, count, note }, never
 * throws, because a half-readable export is still worth triaging.
 */
 function parseText(text, filename) {
 const trimmed = String(text || '').trim();
 if (!trimmed) return { kind: 'empty', events: [], count: 0, note: 'The file was empty.' };

 /* ---- JSON, including { "value": [...] } and NDJSON ---- */
 let records = null;
 const direct = tryJson(trimmed);
 if (direct) {
 if (Array.isArray(direct)) records = direct;
 else if (Array.isArray(direct.value)) records = direct.value;
 else if (Array.isArray(direct.records)) records = direct.records;
 else records = [direct];
 } else if (trimmed[0] === '{') {
 /* NDJSON: one object per line. */
 const lines = trimmed.split('\n').map(l => l.trim()).filter(Boolean);
 const parsed = lines.map(tryJson).filter(Boolean);
 if (parsed.length && parsed.length >= lines.length * 0.8) records = parsed;
 }

 if (records && records.length) {
 const probe = records.find(r => r && typeof r === 'object') || {};
 if (looksLikeUalJson(probe)) return done('ual', records.map(normUal), filename);
 if (looksLikeAuditJson(probe)) return done('audit', records.map(normAuditJson), filename);
 if (looksLikeSigninJson(probe)) return done('signin', records.map(normSigninJson), filename);
 /* Unknown JSON, still show it on the timeline rather than refusing. */
 return done('unknown', records.map(o => ({
 ts: toDate(o.time || o.timestamp || o.CreationTime || o.createdDateTime),
 tsRaw: str(o.time || o.timestamp || o.CreationTime || o.createdDateTime),
 src: 'unknown', kind: 'json', actor: str(o.user || o.userPrincipalName || o.UserId),
 actorIp: str(o.ip || o.ipAddress || o.ClientIP), action: str(o.operation || o.Operation || o.activityDisplayName || '(unrecognised)'),
 target: '', app: '', result: '', country: '', proto: '', ua: '', mfa: '', ca: '', risk: '', device: '',
 extra: {}, raw: o,
 })), filename);
 }

 /* ---- CSV ---- */
 const rows = parseCSV(trimmed);
 if (rows.length < 2) return { kind: 'unknown', events: [], count: 0, note: 'Could not read this as JSON or CSV.' };
 const objs = rowsToObjects(rows);
 const kind = detectFromHeaders(rows[0]);

 if (kind === 'ual') return done('ual', objs.map(normUal), filename);
 if (kind === 'audit') return done('audit', objs.map(normAuditCsv), filename);
 if (kind === 'signin') return done('signin', objs.map(normSigninCsv), filename);
 if (kind === 'trace') return done('trace', objs.map(normTrace), filename);

 return done('unknown', objs.map(o => ({
 ts: toDate(Object.values(o)[0]), tsRaw: str(Object.values(o)[0]),
 src: 'unknown', kind: 'csv', actor: '', actorIp: '',
 action: '(unrecognised format)', target: '', app: '', result: '',
 country: '', proto: '', ua: '', mfa: '', ca: '', risk: '', device: '',
 extra: {}, raw: o,
 })), filename);
 }

 function done(kind, events, filename) {
 events.forEach(e => { e.file = filename || ''; });
 return {
 kind: kind,
 events: events.filter(e => e),
 count: events.length,
 note: '',
 };
 }

 const KIND_LABEL = {
 signin: 'Entra sign-in logs',
 audit: 'Entra audit logs',
 ual: 'Purview / Unified Audit Log',
 trace: 'Exchange message trace',
 unknown: 'Unrecognised format',
 empty: 'Empty file',
 };

 window.LS_PARSE = { parseText, parseCSV, rowsToObjects, pick, toDate, KIND_LABEL };
})();
