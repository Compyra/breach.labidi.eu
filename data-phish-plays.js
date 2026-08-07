/* ==========================================================================
   Breachlight — data-phish-plays.js
   --------------------------------------------------------------------------
   The paths a phishing incident can actually take, and the evidence layer
   underneath them.

   Extends BL_TERMS / BL_PLAYS / BL_TREES. Loads after the base data files
   and after data-logs.js (two playbooks here render BL_LOG_SOURCES and
   BL_AUDIT_OPS through the `render` field).

   Why these exist as separate playbooks rather than paragraphs elsewhere:
   each one changes the response materially. "The user was phished" is not a
   single incident type — a typed password, a relayed token, an approved
   device code, a granted consent and a manipulated service desk need
   different containment, in a different order, with different evidence.
   ========================================================================== */

/* -------------------------------------------------------------------- terms */

window.BL_TERMS.push(
    {
        id: 'device-code-phishing',
        term: 'Device code phishing',
        also: ['device code flow abuse', 'device authorisation grant abuse'],
        glyph: '🔢',
        cat: 'directory',
        aud: 'pro',
        what: 'The attacker starts a device-code login on their own machine, gets a short code, and persuades the victim to type it into the genuine Microsoft page. The victim authenticates normally — real page, real MFA — and the **attacker’s** machine receives the tokens.',
        spot: [
            'There is no fake website, so every "check the URL" instinct fails. The page really is `microsoft.com/devicelogin`.',
            'The lure is almost always a meeting or a document: "join the Teams meeting, enter this code", sent over Teams, WhatsApp or Signal.',
            'In the logs: a sign-in with `authenticationProtocol` of **`deviceCode`**. In a normal tenant this is rare and easy to baseline.',
            'The victim’s IP appears on the authentication; the **attacker’s** IP appears on everything afterwards, because their device holds the token.',
            'It yields a refresh token, so access outlives the code by weeks unless tokens are revoked.',
        ],
        eg: 'A message in Teams from a compromised partner: "Your meeting has moved, join here and enter code F7K3QW9D." The victim does, sees the meeting fail, thinks nothing of it — and the attacker now holds their session.',
        keys: 'device code phishing device code flow devicelogin enter this code teams lure storm-2372 authentication transfer qr code login token theft no fake website',
    },
    {
        id: 'tap',
        term: 'Temporary Access Pass',
        also: ['TAP'],
        glyph: '🎟',
        cat: 'directory',
        aud: 'pro',
        what: 'A time-limited passcode an administrator issues so someone can register credentials when they have none — a new starter, or a user who has lost their phone. It **bypasses existing authentication methods by design**, which is precisely why attackers ask the service desk for one.',
        spot: [
            'Appears in the audit log as `Admin registered security info` with a Temporary Access Pass method.',
            'A TAP issued minutes before a new authenticator is registered from an unfamiliar IP is the help-desk social engineering pattern, complete.',
            'Restrict who may issue one, make it single-use and short-lived, and require strong identity verification before issuing.',
        ],
        eg: 'A caller convinces the service desk they have lost their phone. A TAP is issued over the phone, the attacker registers their own authenticator, and the account is theirs with no password ever being stolen.',
        keys: 'temporary access pass tap bypass mfa helpdesk issued passcode lost phone reset security info onboarding credential',
    },
    {
        id: 'helpdesk-se',
        term: 'Service desk social engineering',
        also: ['help desk vishing', 'account recovery abuse'],
        glyph: '☎️',
        cat: 'social',
        aud: 'pro',
        what: 'Phoning the service desk pretending to be an employee and asking for a password or MFA reset. It defeats every technical control at once, because the control being attacked is a human following a process designed for helpfulness.',
        spot: [
            'The caller has real details — employee number, manager’s name, date of birth — taken from breaches, LinkedIn or a prior intrusion.',
            'Urgency and sympathy: travelling, in a meeting, phone broken, about to miss something important.',
            'Frequently paired with a **SIM swap** so that an SMS verification also reaches the attacker.',
            'The fix is procedural: verify on video against a photo ID or a known-good registered device, call back on the number in the directory, or require manager attestation. Never verify with facts that are guessable or purchasable.',
        ],
        eg: 'A confident caller, correct employee number, "my phone is in the hotel safe and I have a board meeting in ten minutes". Four minutes later the attacker holds an authenticator on the account.',
        keys: 'helpdesk social engineering service desk vishing mfa reset scattered spider octo tempest account recovery abuse identity verification call the helpdesk impersonation',
    },
);

/* ---------------------------------------------------------------- playbooks */

window.BL_PLAYS.push(

    /* ------------------------------------------------------ LOG COLLECTION */
    {
        id: 'pro-log-collection',
        aud: 'pro',
        cat: 'process',
        title: 'Which logs to pull after a phish, and how to read them',
        glyph: '🪵',
        urgency: 'critical',
        clock: 'Retention is the enemy. Message trace expires in about 10 days and sign-in logs in 30. Export before you investigate.',
        lede: 'The most common failure in a phishing investigation is not a wrong conclusion — it is looking at one log, seeing nothing, and closing the case. Interactive sign-ins alone will miss replayed tokens, application access and everything the attacker actually did. Export in this order, then read.',
        render: 'logsources',
        signs: ['Any confirmed or suspected credential, token, consent or session compromise.'],
        sections: [
            {
                h: 'Export first, in this order — retention is why',
                kind: 'first',
                steps: [
                    '**Message trace** first. It is the shortest-lived evidence you have — roughly 10 days of detail — and it tells you what was sent from the mailbox.',
                    '**Entra sign-in logs — all four tabs.** Interactive, **non-interactive**, service principal, managed identity. Non-interactive is where token replay lives and it is the one people skip.',
                    '**Entra audit logs.** This is where the persistence is. Export JSON rather than CSV so the old and new values survive.',
                    '**Purview Unified Audit Log** for the affected users and a generous window — mailbox access, sends, rules, file downloads, sharing, searches. `MailItemsAccessed` is in Audit **Standard** and on by default for E3/E5 mailboxes; do not skip it believing it needs E5.',
                    '**Defender advanced hunting**: `EmailEvents`, `UrlClickEvents`, `CloudAppEvents` for the delivery and click evidence.',
                    '**Graph activity logs** if you have them enabled. If you do not, that is a finding to write down and fix afterwards.',
                    'Widen the window beyond what seems necessary. Dwell time is routinely longer than the first alert suggests, and you cannot re-export data that has aged out.',
                ],
            },
            {
                h: 'Read them in this order',
                kind: 'do',
                steps: [
                    '**Establish the earliest credible access**, not the first alert. Everything downstream is scoped from that timestamp.',
                    '**Sign-ins**: find the anomalous session — IP, ASN, user agent, device, protocol. Note whether MFA was performed or satisfied by a prior claim, and whether Conditional Access applied at all.',
                    '**Audit logs**: for the whole window, look for what was created or changed — application credentials, consent, roles, PIM eligibility, authentication methods, Conditional Access, federation, devices. This is the eviction checklist.',
                    '**Unified Audit Log**: what was read, sent, forwarded, downloaded, shared and searched. `MailItemsAccessed` answers "did they read it"; search queries tell you what they wanted.',
                    '**Correlate on infrastructure**: the same IP, ASN or user agent across users is how you find the other victims you did not know about.',
                    'Write the timeline as you go, in one document, with timestamps in a single timezone stated at the top. UTC, always.',
                ],
            },
            {
                h: 'Read them without a SIEM',
                kind: 'note',
                steps: [
                    'Not everybody has Sentinel, and the portal UI is poor for correlation. This site includes **Logscope** — an offline log reader that runs entirely in your browser.',
                    'Drop the exported JSON or CSV in, and it detects the format, unpacks the Purview `AuditData` blob, applies the detection rules from this site, and produces a timeline and a findings list.',
                    '**Nothing is uploaded.** It has no server and makes no network calls — the whole page works offline, which is what makes it safe to use with real evidence.',
                    'It is a triage aid, not an authority. It will point you at things worth reading; it will not tell you the answer.',
                ],
            },
            {
                h: 'What "we found nothing" must mean',
                kind: 'dont',
                steps: [
                    'Do not write "no evidence of compromise" when you mean "the log that would show it is not enabled". Name the gap.',
                    '**Go and look for `MailItemsAccessed` before assuming you do not have it.** It moved to Audit Standard in the 2023 expanded-logging rollout and is on by default for E3 and E5 mailboxes. The "you need E5 for that" belief is now wrong and it costs people their best evidence.',
                    'What genuinely blinds you instead: mailbox auditing switched off before the incident, a mailbox below E3, records aged past retention, or an attacker who **synced** a folder and then read it offline where nothing is audited.',
                    '`UrlClickEvents` only covers Safe Links-rewritten URLs. A QR code or a link opened on a personal phone leaves no click record at all — so ask the user rather than trusting the absence.',
                    'Where retention ends, assumption begins, and the assumption must be the unfavourable one.',
                ],
            },
        ],
        queries: [
            { label: 'The four sign-in tables, together', lang: 'KQL · Sentinel', q: 'let win = 30d;\nlet upn = "user@contoso.com";\nunion isfuzzy=true\n  (SigninLogs | extend Kind = "interactive"),\n  (AADNonInteractiveUserSignInLogs | extend Kind = "non-interactive"),\n  (AADServicePrincipalSignInLogs | extend Kind = "service principal", UserPrincipalName = ServicePrincipalName),\n  (AADManagedIdentitySignInLogs | extend Kind = "managed identity", UserPrincipalName = ServicePrincipalName)\n| where TimeGenerated > ago(win)\n| where UserPrincipalName =~ upn or isempty(upn)\n| project TimeGenerated, Kind, UserPrincipalName, IPAddress,\n          Country = tostring(parse_json(tostring(LocationDetails)).countryOrRegion),\n          AppDisplayName, ResultType, UserAgent,\n          AuthDetail = tostring(AuthenticationDetails)\n| order by TimeGenerated asc' },
            { label: 'Unified Audit Log export for the affected users', lang: 'PowerShell · Exchange Online', q: 'Connect-ExchangeOnline\n$start = (Get-Date).AddDays(-90)\n$end   = Get-Date\n$users = @("user@contoso.com")\n$all   = @()\n$page  = 1\ndo {\n  $batch = Search-UnifiedAuditLog -StartDate $start -EndDate $end `\n             -UserIds $users -ResultSize 5000 -SessionId "bl$page" -SessionCommand ReturnLargeSet\n  $all += $batch\n  $page++\n} while ($batch.Count -eq 5000)\n$all | Export-Csv .\\ual-export.csv -NoTypeInformation -Encoding UTF8\n"exported $($all.Count) records"' },
        ],
        terms: ['ual', 'session-hijacking', 'entra-id', 'dwell-time', 'chain-of-custody'],
        defend: ['entra-hardening', 'ad-monitoring', 'org-readiness'],
        plays: ['pro-audit-triage', 'pro-user-clicked', 'pro-entra-persistence'],
        keys: 'which logs to check after phishing entra sign-in logs audit logs purview unified audit log export logs how to read logs mailitemsaccessed message trace graph activity retention log collection',
    },

    /* -------------------------------------------------------- AUDIT TRIAGE */
    {
        id: 'pro-audit-triage',
        aud: 'pro',
        cat: 'process',
        title: 'An audit event fired — what does it mean, and what now?',
        glyph: '🔔',
        urgency: 'high',
        clock: 'Several of these create access that outlives every password reset. Read the entry before you decide it is noise.',
        lede: 'A lookup table for the operations worth reacting to. Each one says what it actually means, what to check before you decide, and what to do if it turns out to be real. The same catalogue drives the detection rules in the Logscope tool, so a finding there lands on the same guidance.',
        render: 'auditops',
        signs: [
            'An alert on a directory or Microsoft 365 audit operation.',
            'Something you found while reading exported audit logs.',
            'A finding from Logscope you want to understand before acting.',
        ],
        sections: [
            {
                h: 'How to use this',
                kind: 'note',
                steps: [
                    'Find the operation below. The catalogue is grouped by what the change affects, not by how the portal names it.',
                    'Read **what it means** before deciding it is routine. Several of these are perfectly normal weekly activity in a healthy tenant and total compromise in an unhealthy one — the event alone does not distinguish them.',
                    '**Context is the whole judgement**: who did it, from where, at what hour, with a change ticket or without, and what happened in the ten minutes either side. An application created at 03:14 from a residential proxy, four minutes after an atypical sign-in, is not the same event as one created at 10:00 by a developer.',
                    'Where an entry links to a playbook, that playbook has the full containment sequence.',
                ],
            },
            {
                h: 'The sequence that matters more than any single event',
                kind: 'first',
                steps: [
                    'Atypical sign-in → **new authentication method registered** → the account is taken, not merely attempted.',
                    'Atypical sign-in → **application created** → **credential added** → **consent granted** → durable access that no password reset touches.',
                    'Atypical sign-in → **inbox rule created** → the attacker is hiding replies, and a payment is usually being discussed somewhere in that mailbox.',
                    'Atypical sign-in → **eDiscovery search created and exported** → treat as tenant-wide data collection immediately.',
                    'Help desk **credential reset** → new authentication method from a different IP → service desk social engineering, and the reset was the attack.',
                    'Any of these within minutes of each other is a chain, not a coincidence. Chains are what you alert on.',
                ],
            },
        ],
        terms: ['service-principal', 'oauth-consent', 'entra-roles', 'golden-saml', 'conditional-access', 'ual'],
        defend: ['ad-monitoring', 'entra-hardening'],
        plays: ['pro-log-collection', 'pro-entra-persistence', 'pro-entra-app', 'pro-inbox-rules'],
        keys: 'audit log events what do they mean enterprise application created consent to application add service principal credentials inbox rule created role assigned audit operation lookup what to do when i see',
    },

    /* ----------------------------------------------------- DEVICE CODE ---- */
    {
        id: 'pro-device-code',
        aud: 'pro',
        cat: 'identity',
        title: 'Device code phishing — the user authenticated for the attacker',
        glyph: '🔢',
        urgency: 'critical',
        clock: 'The attacker holds a refresh token, not a password. Revocation is the only thing that ends it, and every minute is live access.',
        lede: 'There was no fake website. The user went to the real Microsoft page, entered a real code and completed real MFA — and the tokens went to the attacker’s machine, because the attacker started the flow. Every "check the address bar" defence fails against this, and the resulting refresh token can outlive the incident by weeks.',
        signs: [
            'A sign-in with `authenticationProtocol` of **`deviceCode`** — visible in the sign-in log and rare enough in most tenants to baseline.',
            'Or `originalTransferMethod` of `deviceCodeFlow` / `authenticationTransfer` (the QR "continue on another device" flow, abused the same way).',
            'The victim’s IP appears on the authentication; the **attacker’s** IP appears on everything afterwards, because their device holds the token.',
            'A **sign-in error `50199` followed by a success** in the same session, minutes apart — that pause is the victim reading the code out of the lure and typing it in.',
            'A lure over Teams, WhatsApp or Signal containing a code and an instruction to enter it at `microsoft.com/devicelogin`.',
            'The application is often a first-party Microsoft client with broad scopes, which makes the sign-in look ordinary.',
            '**A device registration within minutes of the sign-in.** Since February 2025 this crew has used the Microsoft Authentication Broker client ID to obtain a refresh token, register a device of their own in Entra ID, and from that get a **Primary Refresh Token** — which is far more durable than the original code.',
        ],
        sections: [
            {
                h: 'Contain — revocation is the whole game',
                kind: 'first',
                steps: [
                    '**Revoke all refresh tokens and sign-in sessions for the user immediately.** The attacker holds a token, not a credential; resetting the password on its own changes nothing for them.',
                    'Reset the password afterwards anyway, and require re-registration of authentication methods if any were added.',
                    'Confirm the revocation took effect: re-check non-interactive sign-ins fifteen minutes later. Continued activity means it did not.',
                    'Audit the persistence set now — new authentication methods, application credentials, consent grants, inbox rules, device registrations. A device-code token is used to establish something more durable within minutes.',
                    'If the identity holds any privileged role, escalate to the privileged-role playbook.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Find the device-code sign-in and note the **application and resource** requested. That tells you what the token could reach.',
                    '**Check for a device registered around the same time**, and delete it if it is not yours. This is the current shape of the attack: the code buys a refresh token, the refresh token registers a device, the device yields a Primary Refresh Token that survives long after anyone stops thinking about the original code.',
                    'Pivot to the **non-interactive** sign-in log for the same user: that is where the attacker’s subsequent token use appears, from their infrastructure.',
                    'Search the whole tenant for other `deviceCode` sign-ins in the same window. These campaigns are never aimed at one person, and the lure often arrives from an already-compromised partner tenant.',
                    'Pull Graph activity logs for the user. Expect **keyword searching across the mailbox** — observed terms include password, admin, credentials, secret, teamviewer and anydesk — followed by targeted mail export. Those search terms tell you what to treat as exposed.',
                    'Identify the delivery channel. If it arrived over Teams from an external tenant, review your external access settings and warn the partner — their tenant is likely compromised.',
                ],
            },
            {
                h: 'Harden — this one is genuinely closable',
                kind: 'note',
                steps: [
                    'Create a **Conditional Access policy blocking device code flow** for all users, using the authentication flows condition. Microsoft’s own guidance is to block it wherever possible. Then allow-list the small set of genuine cases.',
                    'Block **authentication transfer** in the same policy unless you use it deliberately.',
                    '**Restrict who may register devices**, which breaks the refresh-token-to-PRT step even when a code is phished successfully.',
                    'Legitimate uses do exist and are narrow: shared devices without a browser, conference-room hardware, `az login --use-device-code`, `Connect-MgGraph -UseDeviceAuthentication`. Scope an exception to those users or locations, not to everyone.',
                    'Alert on every `deviceCode` authentication protocol sign-in. In most tenants the healthy baseline is close to zero, which makes this an excellent, quiet detection.',
                    'Tell users the specific rule: **no legitimate meeting, document or IT process will ever send you a code to type into a Microsoft login page.** Codes go the other way — you receive them, you never enter someone else’s.',
                    'Require phishing-resistant methods, sign-in risk policies and continuous access evaluation, so a token obtained this way is revoked quickly rather than at expiry.',
                ],
            },
        ],
        queries: [
            { label: 'Device code and authentication transfer sign-ins', lang: 'KQL · Sentinel', q: 'union isfuzzy=true SigninLogs, AADNonInteractiveUserSignInLogs\n| where TimeGenerated > ago(30d)\n| where AuthenticationProtocol =~ "deviceCode"\n     or OriginalTransferMethod in~ ("deviceCodeFlow", "authenticationTransfer")\n| project TimeGenerated, UserPrincipalName, IPAddress,\n          Country = tostring(parse_json(tostring(LocationDetails)).countryOrRegion),\n          AppDisplayName, ResourceDisplayName, ResultType, UserAgent,\n          AuthenticationProtocol, OriginalTransferMethod\n| order by TimeGenerated asc' },
            { label: 'What the token did afterwards', lang: 'KQL · Sentinel', q: 'let victim = "user@contoso.com";\nlet t0 = datetime(2026-07-30 09:00);   // the device code sign-in\nMicrosoftGraphActivityLogs\n| where TimeGenerated between (t0 .. t0 + 7d)\n| where UserId has victim or tostring(parse_json(tostring(SignInActivityId))) != ""\n| summarize Calls = count(), Paths = make_set(RequestUri, 40)\n          by AppId, IPAddress, bin(TimeGenerated, 1h)\n| order by TimeGenerated asc' },
        ],
        terms: ['device-code-phishing', 'session-hijacking', 'aitm', 'conditional-access', 'entra-id'],
        defend: ['entra-hardening', 'org-identity'],
        plays: ['pro-token-theft', 'pro-user-clicked', 'pro-log-collection', 'pro-entra-persistence'],
        keys: 'device code phishing device code flow devicelogin enter code teams lure storm-2372 block device code conditional access authentication flows refresh token revoke authentication transfer',
    },

    /* --------------------------------------------------------- HELP DESK -- */
    {
        id: 'pro-helpdesk',
        aud: 'pro',
        cat: 'identity',
        title: 'The service desk was social-engineered into a reset',
        glyph: '☎️',
        urgency: 'critical',
        clock: 'A reset plus a newly registered method is a completed takeover. Treat it as an active intrusion, not a process error.',
        lede: 'No malware, no phishing page, no stolen password. Someone rang the service desk, sounded like an employee in a hurry, and was helped. This defeats every technical control at once because the control under attack is a person following a process that was designed to be accommodating.',
        signs: [
            'An `Admin registered security info`, `Admin updated security info` or admin password reset without a matching ticket — or with a ticket raised by the caller themselves.',
            'A **Temporary Access Pass** issued, followed within minutes by a new authenticator registered from an unfamiliar IP.',
            'The user says they did not call.',
            'A SIM swap on the user’s number in the same window, so SMS verification also reached the attacker.',
            'Repeated calls to different agents until one agrees — check for earlier refused attempts, which are the best early warning you will get.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    '**Phone the real user on a number from the directory** — not one from the ticket, not one supplied by the caller. Confirm whether they made the request.',
                    'If they did not: revoke all sessions and refresh tokens, reset the password again, and remove every authentication method registered since the reset.',
                    'Revoke any Temporary Access Pass still outstanding.',
                    'Re-enrol the user in person or over video against a known photograph, using a phishing-resistant method.',
                    'Check what the attacker did in between: audit logs for role assignments, application credentials, consent, inbox rules, device registrations.',
                    'Treat the **service desk agent’s** account as potentially compromised too, until you have confirmed they were deceived rather than impersonated.',
                ],
            },
            {
                h: 'Investigate the pattern, not just the incident',
                kind: 'do',
                steps: [
                    'Pull all admin-initiated credential and MFA resets for the last 90 days and reconcile every one against a ticket. This exercise nearly always finds more than the one that alerted.',
                    'Check for refused or abandoned attempts against other users — the same caller usually tries several.',
                    'Establish what identity verification was actually performed, and write it down verbatim. That is the control failure, and it is what you will fix.',
                    'Check whether the target was chosen for their access. Executives, finance and IT administrators are picked deliberately.',
                    'Check the mobile carrier for a recent SIM change if SMS was involved.',
                    'Listen to the call recording if you have one. It is the single most persuasive artefact you will ever put in front of an executive to fund the fix.',
                ],
            },
            {
                h: 'Harden — this is a process problem with a process fix',
                kind: 'note',
                steps: [
                    '**Stop verifying identity with facts.** Employee number, date of birth, manager’s name and last four digits are all purchasable or guessable. They verify nothing.',
                    'Verify with something the attacker cannot hold: a **video call against the photo on file**, an approval pushed to an already-registered device, a **callback to the number in the directory**, or in-person attendance.',
                    'Require **manager or line-of-business attestation** for high-privilege users, out of band.',
                    'Restrict who holds Authentication Administrator and Privileged Authentication Administrator — the latter can reset a Global Administrator.',
                    'Protect executives, finance and IT staff with **restricted management administrative units**, so a compromised help desk role cannot touch them at all.',
                    'Make Temporary Access Passes single-use, short-lived, and issuable only by a named small group.',
                    'Deploy phishing-resistant methods broadly, so that a reset alone does not hand over the account.',
                    'Alert on every admin-initiated credential or MFA reset, and reconcile daily against tickets. Give the service desk explicit, written permission to refuse and escalate — and never measure them on call handling time alone, because that metric is what the attacker is exploiting.',
                ],
            },
        ],
        queries: [
            { label: 'Admin-initiated credential and MFA resets', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(90d)\n| where OperationName has_any ("Admin registered security info", "Admin updated security info",\n                              "Admin deleted security info", "Reset password (by admin)",\n                              "Reset user password", "Change user password")\n| extend Actor  = tostring(InitiatedBy.user.userPrincipalName)\n| extend ActorIp = tostring(InitiatedBy.user.ipAddress)\n| extend Target = tostring(TargetResources[0].userPrincipalName)\n| project TimeGenerated, OperationName, Actor, ActorIp, Target, Result\n| order by TimeGenerated desc' },
            { label: 'Reset followed by a new method from a different IP', lang: 'KQL · Sentinel', q: 'let resets = AuditLogs\n  | where TimeGenerated > ago(30d)\n  | where OperationName has_any ("Admin registered security info", "Reset password (by admin)")\n  | extend Target = tostring(TargetResources[0].userPrincipalName)\n  | project ResetTime = TimeGenerated, Target,\n            Actor = tostring(InitiatedBy.user.userPrincipalName);\nlet newMethods = AuditLogs\n  | where TimeGenerated > ago(30d)\n  | where OperationName has "User registered security info"\n  | extend Target = tostring(TargetResources[0].userPrincipalName)\n  | project MethodTime = TimeGenerated, Target,\n            MethodIp = tostring(InitiatedBy.user.ipAddress);\nresets\n| join kind=inner newMethods on Target\n| where MethodTime between (ResetTime .. ResetTime + 2h)\n| project ResetTime, MethodTime, Target, Actor, MethodIp\n| order by ResetTime desc' },
        ],
        terms: ['helpdesk-se', 'tap', 'sim-swap', 'vishing', 'mfa', 'admin-units'],
        defend: ['entra-hardening', 'org-identity', 'ad-monitoring'],
        plays: ['pro-mfa-anomaly', 'pro-entra-admin', 'pro-user-clicked', 'pro-entra-persistence'],
        keys: 'helpdesk social engineering service desk called mfa reset temporary access pass issued account recovery abuse scattered spider identity verification process caller impersonated user',
    },

    /* --------------------------------------------------- DEVICE REGISTERED */
    {
        id: 'pro-device-registered',
        aud: 'pro',
        cat: 'identity',
        title: 'A device was registered or joined that you did not expect',
        glyph: '💻',
        urgency: 'high',
        clock: 'A registered device can satisfy your strongest Conditional Access requirement. Remove it before you rely on that policy again.',
        lede: 'Device-based Conditional Access is one of the better controls available — until the attacker enrols a device of their own. Then "requires a compliant device" is something they satisfy rather than something that stops them, and the sign-ins that follow look impeccable.',
        signs: [
            'An `Add device`, `Add registered owner` or `Add registered users to device` audit event for hardware you did not issue.',
            'A device object registered from the same IP as a suspicious sign-in, minutes afterwards.',
            'A device that reports compliant but has no Intune enrolment record, or a display name that does not match your naming convention.',
            'A sudden drop in Conditional Access blocks for a user who was previously being challenged.',
            'On a genuinely compromised endpoint: **Primary Refresh Token theft**, which gives cloud-wide single sign-on without any password or MFA prompt.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Confirm with the user whether they enrolled a device. Do it by phone, not by email.',
                    'If unexplained: **delete the device object**, revoke its tokens, and block the device ID at the identity provider so a stored session cannot be replayed.',
                    'Revoke all sessions and refresh tokens for the user, then reset the password.',
                    'Remove any certificate or credential bound to the device, and any Intune enrolment.',
                    'Re-check which Conditional Access policies that device satisfied while it existed, and treat everything it accessed as reachable.',
                ],
            },
            {
                h: 'If a real, issued device was compromised instead',
                kind: 'do',
                steps: [
                    'Assume the **Primary Refresh Token was stolen**. It carries the MFA claim, so replaying it produces sign-ins that look entirely legitimate on a compliant device.',
                    'Isolate the endpoint through EDR — do not power it off; you lose memory and live session state.',
                    'Revoke sessions and tokens, and treat every credential entered on that machine as disclosed.',
                    'Rebuild the host. Credential theft that has already succeeded is not remediated by cleaning.',
                    'Check for a device certificate or WHfB key registered by the attacker rather than the user.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Restrict who may **join** and who may **register** devices, and require MFA to do either. The defaults are permissive.',
                    'Set a device registration quota, and review stale device objects — a device that has not checked in for a year should not be satisfying a compliance requirement.',
                    'Prefer **compliance** (an Intune assessment of real state) over mere **join state** (an assertion) in Conditional Access.',
                    'Enable **token protection** so a token is bound to the device it was issued to and cannot be replayed elsewhere.',
                    'Alert on device registration occurring within an hour of an atypical sign-in — the pair is far more meaningful than either alone.',
                    'Do not give users local administrator rights on endpoints; PRT theft generally requires them.',
                ],
            },
        ],
        queries: [
            { label: 'Device registrations, newest first', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(30d)\n| where OperationName has_any ("Add device", "Add registered owner",\n                              "Add registered users to device", "Update device")\n| extend Actor  = tostring(InitiatedBy.user.userPrincipalName)\n| extend ActorIp = tostring(InitiatedBy.user.ipAddress)\n| extend Device = tostring(TargetResources[0].displayName)\n| project TimeGenerated, OperationName, Actor, ActorIp, Device, Result\n| order by TimeGenerated desc' },
            { label: 'Registration within an hour of an atypical sign-in', lang: 'KQL · Sentinel', q: 'let risky = SigninLogs\n  | where TimeGenerated > ago(30d)\n  | where RiskLevelDuringSignIn in ("high","medium") or ResultType == 0 and isnotempty(RiskState)\n  | project SigninTime = TimeGenerated, UserPrincipalName, SigninIp = IPAddress;\nAuditLogs\n| where TimeGenerated > ago(30d)\n| where OperationName has "Add device"\n| extend UserPrincipalName = tostring(InitiatedBy.user.userPrincipalName)\n| join kind=inner risky on UserPrincipalName\n| where TimeGenerated between (SigninTime .. SigninTime + 1h)\n| project TimeGenerated, UserPrincipalName, SigninIp,\n          Device = tostring(TargetResources[0].displayName)' },
        ],
        terms: ['device-join', 'prt', 'conditional-access', 'session-hijacking', 'infostealer'],
        defend: ['entra-hardening', 'org-identity'],
        plays: ['pro-token-theft', 'pro-entra-persistence', 'pro-infostealer'],
        keys: 'unexpected device registered device joined entra device object attacker enrolled device compliant device bypass prt theft primary refresh token device registration alert',
    },
);

/* -------------------------------------------------------------------- tree */

window.BL_TREES.push({
    id: 'pro-phish',
    aud: 'pro',
    title: 'A user was phished — which kind, and what changes?',
    glyph: '🎣',
    lede: '"The user was phished" is not one incident. A typed password, a relayed token, an approved device code, a granted consent and a manipulated service desk each need different containment, in a different order. Three questions to find out which you have.',
    keys: 'user was phished what kind of phishing response credential theft token theft device code consent phishing helpdesk reset which containment phishing triage vector',
    start: 'q-what',
    nodes: {
        'q-what': {
            q: 'What did the user actually do? Ask them — do not infer it from logs alone.',
            hint: 'Click telemetry misses QR codes, personal phones and anything outside Safe Links. The user is the better source here.',
            options: [
                { a: 'Typed a username and password into a page', to: 'q-mfa' },
                { a: 'Entered a code shown on a website into a Microsoft login page', to: 'r-devicecode' },
                { a: 'Approved a sign-in prompt they did not start', to: 'r-push' },
                { a: 'Clicked "Accept" on a permissions or consent screen', to: 'r-consent' },
                { a: 'Opened an attachment, or ran or pasted something', to: 'r-endpoint' },
                { a: 'Scanned a QR code', to: 'q-qr' },
                { a: 'Spoke to someone who then changed something on the account', to: 'q-phone' },
                { a: 'Nothing — they reported it without interacting', to: 'r-report' },
                { a: 'They are not sure, or cannot be reached', to: 'r-assume' },
            ],
        },
        'q-mfa': {
            q: 'Was a second factor involved in the same session?',
            hint: 'This decides whether you are chasing a credential or a live session — a much bigger difference than it sounds.',
            options: [
                { a: 'They also typed a one-time code into the same page', to: 'r-aitm' },
                { a: 'They approved a push as part of that login', to: 'r-aitm' },
                { a: 'No second factor was requested at all', to: 'r-creds' },
                { a: 'The login failed, or appeared to fail', to: 'r-aitm' },
            ],
        },
        'q-qr': {
            q: 'What did the QR code lead to?',
            options: [
                { a: 'A login page where they entered credentials', to: 'q-mfa' },
                { a: 'A page showing a code to enter at a Microsoft sign-in', to: 'r-devicecode' },
                { a: 'A consent or permissions prompt', to: 'r-consent' },
                { a: 'They scanned it but entered nothing', to: 'r-qr-only' },
            ],
        },
        'q-phone': {
            q: 'Who changed what?',
            options: [
                { a: 'Our service desk reset a password or MFA for the "user"', to: 'r-helpdesk' },
                { a: 'The user installed remote-access software while on the call', to: 'r-remote' },
                { a: 'The user read out a one-time code to the caller', to: 'r-code' },
                { a: 'The user’s phone lost signal around the same time', to: 'r-sim' },
            ],
        },

        'r-creds': {
            result: 'Credential compromise — assume the password, verify the session',
            tag: 'critical',
            steps: [
                'Revoke sessions and refresh tokens, then reset the password. That order, always.',
                'A login with no second factor means either MFA is not enforced for that app, or legacy authentication is still permitted. **Both are findings in their own right.**',
                'Audit the persistence set: authentication methods, application credentials, consent, inbox rules, device registrations.',
                'Check whether the same credential is used outside SSO — VPN, legacy protocols, or reused personally.',
            ],
            link: '#/play/pro-user-clicked',
        },
        'r-aitm': {
            result: 'Adversary-in-the-middle — the session is gone, not just the password',
            tag: 'critical',
            steps: [
                'The second factor did not help: the proxy relayed it live and kept the session cookie.',
                '**Revoke refresh tokens first**, then reset. A password reset alone leaves them signed in.',
                'Look in the **non-interactive** sign-in log for the replayed token; the interactive log will look normal.',
                '"Login failed then worked" is the classic tell — it failed on their page because it had already succeeded on the real one.',
            ],
            link: '#/play/pro-token-theft',
        },
        'r-devicecode': {
            result: 'Device code phishing — the tokens went to the attacker’s machine',
            tag: 'critical',
            steps: [
                'There was no fake site to spot: the user used the real Microsoft page and completed real MFA.',
                'Revoke refresh tokens immediately — the attacker holds a token, so a password reset means nothing to them.',
                'Search the tenant for other `deviceCode` sign-ins; these campaigns are never aimed at one person.',
                'Then block device code flow in Conditional Access and allow-list the few genuine cases.',
            ],
            link: '#/play/pro-device-code',
        },
        'r-push': {
            result: 'The password is already known — the prompt proves it',
            tag: 'critical',
            steps: [
                'A prompt the user did not start means somebody typed the correct password. Reset it whether or not they approved.',
                'Revoke sessions, then audit authentication methods for anything registered since.',
                'Check whether "IT" phoned them asking them to approve — that indicates a more determined adversary, and a service-desk angle.',
                'Enable number matching, and move that user to a phishing-resistant method.',
            ],
            link: '#/play/pro-mfa-anomaly',
        },
        'r-consent': {
            result: 'Consent phishing — no credential was stolen at all',
            tag: 'critical',
            steps: [
                'The user approved a real OAuth prompt. The access is an application grant, and it **survives password resets, MFA re-registration and session revocation**.',
                'Revoke the grant and disable the service principal. That is the only thing that removes it.',
                'Check the scopes: mail, files and directory permissions are tenant-reaching, not user-scoped, when granted as application permissions.',
                'Then restrict user consent tenant-wide and enable the admin consent workflow.',
            ],
            link: '#/play/pro-oauth-grant',
        },
        'r-endpoint': {
            result: 'Treat the endpoint as compromised and the credentials as disclosed',
            tag: 'critical',
            steps: [
                'Isolate through EDR — do not power off; memory and live sessions are evidence.',
                'Assume every credential and session cookie stored in that browser profile is gone, including personal ones.',
                'Revoke sessions and reset from a **different** device, never the affected one.',
                'Rebuild the host. A clean scan proves little, because stealers routinely delete themselves.',
            ],
            link: '#/play/pro-infostealer',
        },
        'r-helpdesk': {
            result: 'Service desk social engineering — a completed takeover',
            tag: 'critical',
            steps: [
                'Phone the real user on a number from the directory, not from the ticket. Confirm whether they called.',
                'Revoke sessions, reset again, and remove every authentication method registered since the reset — including any Temporary Access Pass.',
                'Reconcile all admin-initiated resets for the last 90 days against tickets. There is usually more than one.',
                'Then fix the verification process: facts like employee number and date of birth are purchasable and verify nothing.',
            ],
            link: '#/play/pro-helpdesk',
        },
        'r-remote': {
            result: 'They had the screen, the keyboard and every open session',
            tag: 'critical',
            steps: [
                'Disconnect the device from the network — that ends the session immediately.',
                'Assume everything visible was seen and everything logged in was used.',
                'Revoke sessions and reset credentials from a clean device, then rebuild the host.',
                'Check for a persistent remote-access tool, new local accounts and new scheduled tasks.',
            ],
            link: '#/play/remote-access',
        },
        'r-code': {
            result: 'That code authorised something — find out what',
            tag: 'critical',
            steps: [
                'Read the message that carried the code; the text above the digits says what it approved.',
                'Revoke sessions, reset, and remove any method or device registered in that window.',
                'If it was a payment or a bank code, the money track runs in parallel and has the tighter deadline.',
                'Reinforce the rule with the user: a code is never read aloud, to anyone, ever.',
            ],
            link: '#/play/gave-code',
        },
        'r-sim': {
            result: 'Suspected SIM swap — SMS is now the attacker’s',
            tag: 'critical',
            steps: [
                'Any SMS-based factor or recovery route for that user is compromised. Disable it now.',
                'Have the user contact the carrier from another phone to reverse the port and lock the account.',
                'Revoke sessions, reset, and re-enrol on a phishing-resistant method rather than a new phone number.',
                'Check whether the service desk was also called — the two are frequently combined.',
            ],
            link: '#/play/sim-lost-signal',
        },
        'r-qr-only': {
            result: 'Probably nothing — but verify rather than assume',
            tag: 'high',
            steps: [
                'Scanning alone is just opening a link. If nothing was entered, exposure is low.',
                'Note that **click telemetry will not show this at all** — a QR scanned on a personal phone bypasses Safe Links entirely.',
                'Check sign-ins for that user anyway, including non-interactive, for the following 24 hours.',
                'Report and purge the message; a QR lure in email is aimed at everyone who received it.',
            ],
            link: '#/play/pro-reported-phish',
        },
        'r-report': {
            result: 'Nothing happened — now protect everyone else',
            tag: 'ok',
            steps: [
                'Thank the reporter explicitly and tell them what it turned out to be. Report rate is what shortens the next incident.',
                'Scope the campaign from the recipient list, not from the reports — the reports are a sample.',
                'Purge tenant-wide and block the infrastructure at mail, proxy and DNS.',
                'Cross-reference recipients against click telemetry and anomalous sign-ins before closing.',
            ],
            link: '#/play/pro-reported-phish',
        },
        'r-assume': {
            result: 'Unknown means assume the worst case that fits the evidence',
            tag: 'critical',
            steps: [
                'Contain as though credentials **and** session were taken: revoke tokens, reset, audit persistence.',
                'Pull the logs before deciding anything — sign-ins (all four tables), audit, and Unified Audit Log.',
                'Look for the discriminators: a `deviceCode` protocol, a consent grant, a new authentication method, an inbox rule. Each points at a specific vector.',
                'Write down that the vector was undetermined. An honest gap is worth more than a confident guess.',
            ],
            link: '#/play/pro-log-collection',
        },
    },
});
