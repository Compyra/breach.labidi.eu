/* ==========================================================================
 Breachlight: data-logs.js
   --------------------------------------------------------------------------
   The evidence layer. Two catalogues:

     BL_LOG_SOURCES  which log holds what, how long, and how to export it.
     BL_AUDIT_OPS    the operations worth reacting to, what each one means,
                     and what to do the moment you see it.

   BL_AUDIT_OPS is the single source of truth for BOTH:
     • the "an audit event fired" lookup page in the site, and
     • the detection rules in the Logscope tool (logscope/rules.js).
   Add an operation here and both places gain it.

   Matching contract used by the tool
     op      canonical operation string, matched case-insensitively
     aka[]   alternative strings that mean the same thing (Entra vs Purview vs
 Exchange cmdlet naming). Matched the same way. keys search keywords for the SITE only, never used for matching, so
               it is safe to put natural-language phrasing here.     match   'exact' (default) | 'starts' | 'contains'
 Use 'contains' sparingly. A loose match produces noise, and a
             noisy rule gets muted, which is worse than no rule.
   ========================================================================== */

/* ------------------------------------------------------------ log sources */

window.BL_LOG_SOURCES = [
    {
        id: 'entra-signin',
        name: 'Entra ID sign-in logs',
        aka: ['Azure AD sign-in logs'],
        glyph: '🚪',
        must: true,
        what: 'Who authenticated, from where, with what, and whether policy applied. The first place to look and the easiest to look at incompletely.',
        holds: [
            '**Interactive user sign-ins**: a human at a prompt. This is the only table most teams read.',
            '**Non-interactive user sign-ins**: token refreshes and background client activity. **This is where replayed session tokens show up**, and skipping it is the single most common blind spot in a phishing investigation.',
            '**Service principal sign-ins**: application identities. No user, no MFA, and invisible in the other tables.',
            '**Managed identity sign-ins**: Azure workload identities.',
        ],
        fields: 'Timestamp · UPN · IP · location · ASN · application · resource · client app · authentication protocol · MFA result and method · Conditional Access result and which policies · device ID, compliance and join type · risk level · correlation ID · user agent.',
        retention: 'Portal: 7 days without a licence, 30 days with Entra ID P1 or P2. Longer only if you exported it. Assume you have 30 days unless you know otherwise.',
        exportHow: [
            'Entra admin centre → Identity → Monitoring & health → Sign-in logs → set the time range and columns → **Download** → JSON or CSV.',
            'Switch tabs first: the download only contains the tab you are on. Export **all four** tabs.',
            'Or query `SigninLogs`, `AADNonInteractiveUserSignInLogs`, `AADServicePrincipalSignInLogs`, `AADManagedIdentitySignInLogs` in Log Analytics.',
            'Or Microsoft Graph: `/auditLogs/signIns`.',
        ],
        gotchas: [
            'The portal export is capped. If you filter to the user and the window rather than downloading everything, you will actually get everything.',
            '**Success with no MFA interaction is not the same as no MFA.** "Previously satisfied" means a token already carried the claim. Which is exactly what token theft looks like.',
            'Conditional Access showing `notApplied` on a successful sign-in means no policy covered it. That is a finding, not a blank.',
        ],
        tool: true,
    },
    {
        id: 'entra-audit',
        name: 'Entra ID audit logs',
        aka: ['directory audit'],
        glyph: '📜',
        must: true,
        what: 'Every change to the directory. Sign-in logs tell you they got in; **audit logs tell you what they left behind**. If you only have time for two logs, this is the second one.',
        holds: [
            'Role assignments and PIM eligibility changes.',
            'Application registrations, service principals, credentials added, consent granted, owners added.',
            'Conditional Access policy and named-location changes.',
            'Domain and federation settings.',
            'Authentication method registration: the attacker adding their own MFA.',
            'Group membership, device registration, partner relationships, cross-tenant settings.',
        ],
        fields: 'Timestamp · activity · category · initiated by (user or app) · actor IP · target resource · modified properties, old value and new value · result.',
        retention: 'Portal: 7 days without a licence, 30 days with Entra ID P1 or P2. Longer only if you exported it. Note that Purview Audit (Premium) also retains Entra audit records for a year, which is a second route to the same history.',
        exportHow: [
            'Entra admin centre → Identity → Monitoring & health → Audit logs → **Download** → JSON or CSV.',
            'Or query `AuditLogs` in Log Analytics.',
            'Or Microsoft Graph: `/auditLogs/directoryAudits`.',
        ],
        gotchas: [
            'The interesting content lives inside `targetResources[].modifiedProperties`, which the CSV flattens badly. **Export JSON if you can**. The tool reads both, but JSON keeps the old and new values.',
            'An operation with `result: failure` still tells you what they tried.',
        ],
        tool: true,
    },
    {
        id: 'ual',
        name: 'Purview / Unified Audit Log',
        aka: ['Microsoft 365 audit log', 'Office 365 audit', 'OfficeActivity'],
        glyph: '🗂',
        must: true,
        what: 'What actually happened to the data: mailboxes, files, Teams, admin actions across Microsoft 365. The Entra logs tell you about identity; **this tells you what they read, sent and took**.',
        holds: [
            '**Mailbox**: `MailItemsAccessed`, `Send`, `SendAs`, `SendOnBehalf`, `New-InboxRule`, `Set-Mailbox`, `Add-MailboxPermission`, `MoveToDeletedItems`, `HardDelete`.',
            '**SharePoint and OneDrive**: `FileDownloaded`, `FileSyncDownloadedFull`, `AnonymousLinkCreated`, `SharingSet`, `FileAccessed`.',
            '**Search**: `SearchQueryInitiatedExchange` and `…SharePoint`: what the attacker went looking for, which is often the clearest statement of intent you will get.',
            '**eDiscovery**: `SearchCreated`, `SearchExported`, `ViewedSearchExported`: bulk collection by an administrator.',
            '**Exchange admin**: transport rules, journaling, audit configuration changes.',
            '**Teams, Power Automate, Power Apps, Entra operations**: a copy of many directory events lands here too.',
        ],
        fields: 'CreationDate · UserIds · Operations · RecordType · and `AuditData`, a JSON blob that holds everything that matters: client IP, user agent, folders, item subjects, parameters, and the `SessionId`.',
        retention: 'Audit (Standard) retains **180 days**: raised from 90 for records generated on or after 17 October 2023. Audit (Premium) retains Entra, Exchange, OneDrive and SharePoint records for **one year** for E5-licensed users, everything else 180 days, and up to **10 years** with the add-on. Verify for your own tenant before relying on it.',
        exportHow: [
            'Purview portal → Audit → New search → set date range, users and activities → run → **Export** → CSV.',
            'Or PowerShell: `Search-UnifiedAuditLog -StartDate … -EndDate … -UserIds … -ResultSize 5000`, paged.',
            'Or the Office 365 Management Activity API for continuous collection.',
        ],
        gotchas: [
            '**`MailItemsAccessed` is the one that answers "did they actually read the mail?"** Since the 2023 expanded-logging rollout it is part of Audit **Standard**, and it is on by default for mailboxes licensed **E3 or E5**. A great many runbooks still say "E5 only" and send responders away from their single best piece of evidence. Go and look before you conclude you cannot.',
            'Only the *intelligent insight* properties on it (the sensitivity label of the mail that was read) still require Audit (Premium).',
            'Everything useful is inside the `AuditData` JSON column. A spreadsheet is close to useless for this; the tool on this site unpacks it.',
            'Auditing must have been switched on **before** the incident. Check `Get-AdminAuditLogConfig` and per-mailbox audit settings.',
            'Search results are capped and paged. A search that returns exactly 5,000 rows returned 5,000 rows, not all of them.',
        ],
        tool: true,
    },
    {
        id: 'graph-activity',
        name: 'Microsoft Graph activity logs',
        glyph: '🔬',
        what: 'Every Graph API call made with a token: the method, the URL, the identity and the app. The difference between "this application had permission to read all mail" and "this application read these mailboxes".',
        holds: [
            'Requests made by users, applications and managed identities.',
            'The resource path actually called, so you can see enumeration and bulk collection.',
        ],
        fields: 'Timestamp · request method and URI · response status · UPN or service principal · app ID · IP · user agent · token issued-at time.',
        retention: 'Only what you export, and the log category is **P1/P2 only**. There is no portal history. You must have configured a diagnostic setting to Log Analytics, storage or an event hub in advance.',
        exportHow: [
            'Entra admin centre → Diagnostic settings → add `MicrosoftGraphActivityLogs`. Do this **now**, before you need it.',
            'Then query `MicrosoftGraphActivityLogs` in Log Analytics.',
        ],
        gotchas: [
            'Nobody enables this until their first incident. If it is off, turn it on today. It is the only log that shows what a stolen application credential actually did.',
        ],
    },
    {
        id: 'id-protection',
        name: 'Entra ID Protection',
        glyph: '⚠️',
        what: 'Microsoft’s own risk detections: anonymous IP, unfamiliar sign-in properties, malware-linked IP, leaked credentials, token anomalies, suspicious inbox manipulation rules.',
        holds: [
            'Risky users, risky sign-ins, risky service principals, and the specific detection that fired.',
            '**Leaked credentials**: Microsoft found that password in a dump.',
            '**Anomalous token / token issuer anomaly**: genuinely useful for AiTM and token replay.',
        ],
        fields: 'Detection type · risk level · risk state · detection timing (real-time or offline) · linked sign-in.',
        retention: 'Risky sign-ins: 7 days on Free, 30 days on P1, **90 days on P2**. Risky users are kept until the risk is remediated. Export to keep the rest.',
        exportHow: [
            'Entra admin centre → Protection → Identity Protection → Risky users / Risky sign-ins → Download.',
            'Or query `AADUserRiskEvents` and `AADRiskyUsers`.',
        ],
        gotchas: [
            'Requires P2 for the full detection set. P1 shows a reduced view.',
            'Dismissing a risky user without investigating is a decision, not a clean-up. It is recorded, and it will be read back to you.',
        ],
    },
    {
        id: 'defender',
        name: 'Defender XDR advanced hunting',
        aka: ['Microsoft 365 Defender', 'MDE', 'MDO'],
        glyph: '🛰',
        what: 'The tables that connect the message to the click to the endpoint to the identity. Where you prove delivery and interaction rather than infer it.',
        holds: [
            '`EmailEvents`, `EmailUrlInfo`, `EmailAttachmentInfo`. What was delivered, to whom, and what happened to it.',
            '`UrlClickEvents`: **who actually clicked**, including whether they clicked through a warning page.',
            '`IdentityLogonEvents`, `IdentityDirectoryEvents`, on-prem AD activity via Defender for Identity.',
            '`CloudAppEvents`: Defender for Cloud Apps activity, including mailbox rule creation.',
            '`DeviceProcessEvents`, `DeviceNetworkEvents`, `DeviceFileEvents`: endpoint behaviour.',
        ],
        fields: 'Varies per table. All are joinable on `NetworkMessageId`, `AccountUpn`, `DeviceId` and `ReportId`.',
        retention: '30 days of advanced hunting data by default.',
        exportHow: ['Defender portal → Hunting → Advanced hunting → run the query → Export.'],
        gotchas: [
            '`UrlClickEvents` only covers links rewritten by Safe Links. A QR code, a link opened on a personal phone, or a message from a non-protected channel will not appear at all.',
            'So "no click recorded" is weak evidence. Ask the user.',
        ],
    },
    {
        id: 'message-trace',
        name: 'Exchange message trace',
        glyph: '✉️',
        what: 'Mail flow: what was sent from the mailbox while the attacker held it, and who received it.',
        holds: ['Sender, recipients, subject, status, connector and IP for each message.'],
        fields: 'date_time · sender_address · recipient_address · subject · status · from_ip · to_ip · size.',
        retention: 'Around 10 days of detailed trace, up to 90 days of summary reporting. **Shorter than everything else. Pull it first.**',
        exportHow: ['Exchange admin centre → Mail flow → Message trace, or `Get-MessageTrace` / `Start-HistoricalSearch`.'],
        gotchas: [
            'This is the log most often lost to retention while the team is still deciding who owns the incident. Export it on day one, every time.',
        ],
        tool: true,
    },
    {
        id: 'onprem',
        name: 'On-premises Active Directory',
        glyph: '🏛',
        what: 'If the tenant is hybrid, a cloud incident may have started on-premises or be heading there. Domain controller security logs are a separate evidence stream with separate retention.',
        holds: [
            'Domain controller security event logs: 4624/4625 logons, 4662 replication, 4768/4769 Kerberos, 4728/4732 group changes, 5136 directory changes.',
            'Sysmon on Tier 0 for LSASS access and process creation.',
        ],
        fields: 'Standard Windows event schema.',
        retention: 'Whatever the local log size allows, which is frequently days. Forwarded logs are the only reliable copy.',
        exportHow: ['Forward to a SIEM; export the local `Security.evtx` from each DC if not.'],
        gotchas: [
            'Logs that live only on a compromised domain controller are not evidence. Get them off-box early.',
        ],
    },
];

/* ------------------------------------------------------ audit operations */

window.BL_AUDIT_OPS = [

    /* ================================================ APPS AND CONSENT == */
    {
        op: 'Consent to application',
        aka: ['Add delegated permission grant', 'Add OAuth2PermissionGrant'],
        cat: 'apps',
        sev: 'critical',
        src: 'entra',
        means: 'Someone approved an application’s request for access to data. If the permissions include mail, files or the directory, this is durable access that **survives password resets, MFA re-registration and session revocation**.',
        check: [
            'Was it **admin** consent (tenant-wide) or **user** consent (that one user)? The `ConsentContext.IsAdminConsent` property tells you.',
            'What scopes? `Mail.Read`, `Mail.ReadWrite`, `Files.Read.All`, `Sites.Read.All`, `Directory.ReadWrite.All`, `offline_access` are the ones that matter.',
            'Is the application first-party Microsoft, a known SaaS vendor, or something registered three days ago?',
            'How many other tenants have consented to it? A near-zero count on a professional-looking app is a strong signal.',
        ],
        actions: [
            'Revoke the grant and disable the service principal. Do not simply reset the user’s password, which does nothing here.',
            'Revoke the service principal’s refresh tokens as well.',
            'Read the Graph activity logs for that principal to establish what it actually read.',
            'Restrict user consent tenant-wide and enable the admin consent workflow.',
        ],
        link: '#/play/pro-entra-app',
    },
    {
        op: 'Add service principal',
        aka: ['Add application'],
        keys: 'enterprise application created new app registration appeared service principal created someone created an app unknown application in tenant',
        cat: 'apps',
        sev: 'high',
        src: 'entra',
        means: 'An enterprise application or app registration was created. Legitimate several times a week in a large tenant, and the standard first step of cloud persistence in a compromised one.',
        check: [
            'Who created it, from which IP, and does that person normally create applications?',
            'Was it created **minutes after** a suspicious sign-in? That sequence is the finding, more than the event itself.',
            'What happened next: credentials added, consent granted, owner added? Those three usually follow within minutes.',
            'Innocuous names are deliberate. "Test App", "Microsoft Office 365", "Mail Backup" and "PDF Viewer" are all real examples from real intrusions.',
        ],
        actions: [
            'If unexplained: revoke consent, disable the service principal, then delete it (in that order) preserving the object details first.',
            'Search for sibling applications created in the same window or sharing a reply URL or certificate thumbprint.',
            'Restrict who may register applications; the default allows everyone.',
        ],
        link: '#/play/pro-entra-app',
    },
    {
        op: 'Add service principal credentials',
        aka: ['Update application – Certificates and secrets management', 'Update application - Certificates and secrets management', 'Update service principal'],
        keys: 'client secret added to app certificate added to application app credential backdoor secret expires 2099 application password added',
        cat: 'apps',
        sev: 'critical',
        src: 'entra',
        means: 'A secret or certificate was attached to an application. The attacker can now authenticate **as that application**: no user, no MFA, no Conditional Access by default, and nothing a password reset can touch. This is the quietest durable access in Microsoft 365.',
        check: [
            'Which application, and what permissions does it already hold? A credential on an app with `Mail.Read` is tenant-wide mailbox access.',
            'What is the credential’s expiry? A secret valid for years was not created by your change process.',
            'Was a **federated credential** added instead? Those store no secret at all and are correspondingly harder to notice.',
            'Check `AADServicePrincipalSignInLogs` for that app ID afterwards. That is where the use shows up, and it is a table most teams never open.',
        ],
        actions: [
            'Remove that specific credential rather than deleting a legitimate application, and preserve the object.',
            'Revoke the service principal’s refresh tokens. Removing a secret stops new tokens, not issued ones.',
            'Remove any owner added around the same time, or they will simply add another credential tomorrow.',
            'Review every application for long-lived secrets and absent owners while you are in there.',
        ],
        link: '#/play/pro-entra-app',
    },
    {
        op: 'Add owner to application',
        aka: ['Add owner to service principal'],
        cat: 'apps',
        sev: 'high',
        src: 'entra',
        means: 'Application ownership is a privilege: an owner can add credentials at any time. It is persistence that looks like administration and is never checked by a leaver process.',
        check: [
            'Is the new owner a person who should own it, a service account, or the compromised identity itself?',
            'Does the application hold permissions that would make ownership an escalation path?',
        ],
        actions: [
            'Remove the owner, then check whether credentials were already added.',
            'Audit ownership across all applications; remove owners who have left.',
        ],
        link: '#/play/pro-entra-app',
    },
    {
        op: 'Add app role assignment to service principal',
        aka: ['Add app role assignment grant to user', 'Add app role assignment'],
        cat: 'apps',
        sev: 'critical',
        src: 'entra',
        means: 'An **application permission** was granted. The kind that needs no signed-in user and applies tenant-wide. `Mail.Read` here means every mailbox, not one.',
        check: [
            'Which permission, and to which application?',
            '`RoleManagement.ReadWrite.Directory` and `AppRoleAssignment.ReadWrite.All` are escalation to Global Administrator. Treat either as a tenant compromise.',
        ],
        actions: [
            'Remove the assignment and revoke tokens for the principal.',
            'Assume everything within the permission scope was accessed unless Graph activity logs prove otherwise.',
        ],
        link: '#/play/pro-entra-app',
    },

    /* ======================================================== ROLES ===== */
    {
        op: 'Add member to role',
        aka: ['Add member to role in PIM requested (permanent)'],
        cat: 'roles',
        sev: 'critical',
        src: 'entra',
        means: 'A directory role was assigned. Global Administrator is the obvious one, but Privileged Role Administrator, Privileged Authentication Administrator, Application Administrator, Hybrid Identity Administrator and Intune Administrator all reach the same place in one or two steps.',
        check: [
            'Which role, to whom, by whom, and is there a change ticket?',
            'Was the target a **guest** or external identity? That is a genuine and regularly missed finding.',
            'Was it assigned to a **group** rather than a user? Role-assignable group membership is less visible.',
        ],
        actions: [
            'Remove the assignment if unexplained, and treat the actor as compromised.',
            'Revoke sessions and tokens for both the actor and the target.',
            'Work the full Entra persistence sweep. A role assignment is rarely the only thing they did.',
        ],
        link: '#/play/pro-entra-admin',
    },
    {
        op: 'Add eligible member to role',
        cat: 'roles',
        sev: 'critical',
        src: 'entra',
        means: 'A PIM **eligible** assignment. The account is not currently privileged, so a review of active administrators will not find it, but it can self-elevate whenever it likes. Attackers prefer this precisely because it is quieter.',
        check: [
            'Always check eligibility alongside active assignments. A tenant that "looks clean" often is not.',
            'Was the PIM activation requirement weakened at the same time (approval removed, MFA not required)?',
        ],
        actions: [
            'Remove the eligibility, then review every eligible assignment in the tenant.',
            'Require approval and phishing-resistant MFA for activation, with a short maximum duration.',
        ],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'Update role setting in PIM',
        aka: ['Update role setting'],
        cat: 'roles',
        sev: 'high',
        src: 'entra',
        means: 'The rules for activating a privileged role were changed: removing approval, removing the MFA requirement, or extending the maximum duration. It makes future escalation silent.',
        check: ['Compare against your documented PIM configuration. Any relaxation is suspicious.'],
        actions: ['Restore the settings, then check who has activated the role since the change.'],
        link: '#/play/pro-entra-persistence',
    },

    /* ==================================================== FEDERATION ==== */
    {
        op: 'Set domain authentication',
        aka: ['Set federation settings on domain', 'Set DirSyncEnabled flag'],
        cat: 'federation',
        sev: 'critical',
        src: 'entra',
        means: 'The tenant’s trust configuration changed. Whoever controls a trusted signing key can assert that they are **any user**, with the MFA claim already satisfied. This is Golden SAML, and it is the highest-severity finding in Entra ID.',
        check: [
            'Is the issuer URI and the token-signing thumbprint what you expect? Compare against records kept **outside** the tenant.',
            'Was a managed domain converted to federated? There is almost never a legitimate unplanned reason.',
            'Only Global Administrator, Hybrid Identity Administrator and External Identity Provider Administrator can do this. That account is compromised.',
        ],
        actions: [
            'Remove any federated domain you did not deliberately create: immediately.',
            'If ADFS is involved, rotate token-signing and token-decrypting certificates **twice**, plus the DKM master key.',
            'Revoke refresh tokens tenant-wide.',
            'For the rest of this incident, treat "MFA was satisfied" as meaningless. The assertion can claim it.',
        ],
        link: '#/play/pro-entra-federation',
    },
    {
        op: 'Add unverified domain',
        aka: ['Add domain to company', 'Verify domain', 'Update domain'],
        cat: 'federation',
        sev: 'critical',
        src: 'entra',
        means: 'A domain was added to the tenant. Combined with a federation change, this is how an attacker introduces their own signing key without touching ADFS at all.',
        check: ['Do you own that domain? Was it verified? Was federation configured on it afterwards?'],
        actions: ['Remove it, then check federation settings on every domain in the tenant.'],
        link: '#/play/pro-entra-federation',
    },

    /* =============================================== POLICY AND TRUST === */
    {
        op: 'Add conditional access policy',
        aka: ['Update conditional access policy', 'Delete conditional access policy'],
        cat: 'policy',
        sev: 'critical',
        src: 'entra',
        means: 'The cloud perimeter was edited. Attackers rarely delete a policy. Deletion is noticed. They add an exclusion, switch it to report-only, or scope it away from themselves.',
        check: [
            'Diff the old and new values in `modifiedProperties`. The change is usually one added exclusion.',
            'Was a policy moved to **report-only**? Report-only enforces nothing.',
            'Check membership of every exclusion group as carefully as the policies themselves.',
        ],
        actions: [
            'Restore from your exported baseline, and confirm break-glass exclusions still hold before you change anything.',
            'Keep Conditional Access policies in source control and alert on every change.',
        ],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'Add named location',
        aka: ['Update named location'],
        cat: 'policy',
        sev: 'high',
        src: 'entra',
        means: 'A location was defined as trusted. A named location pointing at attacker infrastructure defeats every location-based control you have, quietly, without editing a single policy.',
        check: ['Does the IP range belong to you? Is it marked trusted? Which policies rely on it?'],
        actions: ['Remove it and re-verify every policy that references locations.'],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'Update authorization policy',
        aka: ['Update company settings', 'Update authorization policy.'],
        cat: 'policy',
        sev: 'critical',
        src: 'entra',
        means: 'Tenant-wide defaults changed. Who may consent to applications, who may register applications, who may invite guests, whether users can create tenants. Relaxing consent settings re-opens the entire consent-phishing attack class.',
        check: ['Compare against your documented baseline. Look specifically at user consent settings and application registration permissions.'],
        actions: ['Restore the restrictive settings and find the actor.'],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'Create cross-tenant access setting',
        aka: ['Update cross-tenant access setting', 'Update a partner cross-tenant access setting', 'Add a partner to cross-tenant access setting'],
        cat: 'policy',
        sev: 'high',
        src: 'entra',
        means: 'Another tenant’s trust relationship with yours changed. "Trust MFA from other tenants" means you are relying on somebody else’s security team.',
        check: ['Which partner tenant, and what inbound access does it now have? Is cross-tenant synchronisation enabled?'],
        actions: ['Remove unexplained partner settings and review all inbound trust.'],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'Add partner to company',
        aka: ['Add partner', 'Approve delegated admin relationship'],
        cat: 'policy',
        sev: 'high',
        src: 'entra',
        means: 'A managed service provider or reseller gained administrative rights. Legacy DAP grants full Global Administrator; a partner compromise then reaches every customer they manage.',
        check: ['Which partner, which roles, and did anyone request it? Is it legacy DAP or time-bound GDAP?'],
        actions: ['Remove unexplained relationships, retire legacy DAP, and require the partner to use phishing-resistant MFA.'],
        link: '#/play/pro-entra-persistence',
    },

    /* ============================================== AUTHENTICATION ====== */
    {
        op: 'User registered security info',
        aka: ['User registered all required security info', 'User changed default security info'],
        cat: 'auth',
        sev: 'high',
        src: 'entra',
        means: 'A new authentication method was registered by the user. Immediately after an atypical sign-in, this means the account was **accessed**, not merely attempted, and the attacker has now made themselves permanent.',
        check: [
            'What was the sign-in that preceded it? Same IP as the user’s normal activity, or somewhere new?',
            'What method: an authenticator app, a phone number, a FIDO key? A new phone number is the classic.',
        ],
        actions: [
            'Remove the method, revoke sessions and tokens, reset the password, then re-enrol under supervision.',
            'Check whether the same pattern appears for other users in the same window.',
        ],
        link: '#/play/pro-mfa-anomaly',
    },
    {
        op: 'Admin registered security info',
        aka: ['Admin updated security info', 'Admin deleted security info', 'Reset password (by admin)', 'Reset user password'],
        cat: 'auth',
        sev: 'critical',
        src: 'entra',
        means: 'An administrator reset someone else’s credentials or authentication methods. This is the shape of **help desk social engineering**: a caller impersonates the user, the service desk resets MFA, and the attacker enrols their own.',
        check: [
            'Is there a ticket? Did the service desk verify identity, and how?',
            'Was a **Temporary Access Pass** issued? That is a time-limited passcode that bypasses existing methods entirely.',
            'Did the target user actually ask? Ring them, on a number from the directory, not one from the ticket.',
        ],
        actions: [
            'If unverified: revoke sessions, reset again, remove attacker-registered methods, and re-enrol in person or over video.',
            'Treat the administrator account as compromised until the ticket is confirmed.',
            'Harden the service desk identity-verification process. This is the control that actually fixes it.',
        ],
        link: '#/play/pro-helpdesk',
    },
    {
        op: 'Disable Strong Authentication',
        aka: ['Update user', 'Set Company Information', 'Disable account'],
        cat: 'auth',
        sev: 'high',
        src: 'entra',
        means: 'Per-user MFA or account state changed. Turning MFA off for one account is an old technique that still works in tenants using per-user MFA rather than Conditional Access.',
        check: ['Which property changed? `StrongAuthenticationRequirement`, `accountEnabled`, UPN, or on-premises immutable ID are the ones that matter.'],
        actions: ['Restore the setting, and move the tenant off per-user MFA to Conditional Access.'],
        link: '#/play/pro-entra-persistence',
    },

    /* ================================================== DEVICES ========= */
    {
        op: 'Add registered owner',
        aka: ['Add device', 'Register device', 'Add registered users to device'],
        cat: 'devices',
        sev: 'high',
        src: 'entra',
        means: 'A device object was created or claimed. Attackers register their own device to satisfy Conditional Access policies that require a compliant or joined device: turning your strongest control into their credential.',
        check: [
            'Does the device correspond to real hardware you issued? Check Intune enrolment and the join type.',
            'Was it registered from the same IP as a suspicious sign-in?',
            'Did the device then satisfy a compliance-based policy?',
        ],
        actions: [
            'Delete the device object, revoke its tokens, and block it at the identity provider.',
            'Restrict who may join or register devices, and require MFA to do so.',
        ],
        link: '#/play/pro-device-registered',
    },

    /* ================================================= MAILBOX (UAL) ==== */
    {
        op: 'New-InboxRule',
        aka: ['Set-InboxRule', 'UpdateInboxRules', 'Enable-InboxRule'],
        cat: 'mailbox',
        sev: 'critical',
        src: 'ual',
        means: 'A mailbox rule was created or changed. Rules exist to **hide the attacker’s own activity**: moving replies out of sight so the real user never notices a conversation happening in their name. Where you find one, look for a payment.',
        check: [
            'What does it do? `ForwardTo`, `RedirectTo`, `DeleteMessage`, or `MoveToFolder` targeting RSS Feeds, Archive, Conversation History or Deleted Items.',
            'What triggers it? Keywords like invoice, payment, bank, IBAN, remittance, wire, password, security.',
            'Rules named with a single character, a dot or a space are attacker convention.',
        ],
        actions: [
            '**Screenshot or export the rule before deleting it**. The name, conditions and actions are the evidence.',
            'Read the target folder: that is the conversation the user never saw.',
            'Warn counterparties by phone using numbers held before the incident, and halt any payment discussed in those threads.',
            'Disable external auto-forwarding tenant-wide if it is not a business requirement.',
        ],
        link: '#/play/pro-inbox-rules',
    },
    {
        op: 'Set-Mailbox',
        cat: 'mailbox',
        sev: 'high',
        src: 'ual',
        means: 'Mailbox configuration changed. The parameters that matter are `ForwardingSmtpAddress`, `ForwardingAddress` and `DeliverToMailboxAndForward`: silent, permanent copying of mail to an external address.',
        check: ['Inspect the `Parameters` array in `AuditData`. Forwarding to an external domain is the finding.'],
        actions: ['Remove the forwarding, then check every mailbox in the tenant for the same, not just this one.'],
        link: '#/play/pro-inbox-rules',
    },
    {
        op: 'Add-MailboxPermission',
        aka: ['Add-RecipientPermission', 'Add-MailboxFolderPermission', 'Set-MailboxFolderPermission'],
        cat: 'mailbox',
        sev: 'high',
        src: 'ual',
        means: 'Delegated access to a mailbox. `FullAccess`, `SendAs` and `SendOnBehalf` let another identity read and impersonate. Granting Default or Anonymous rights on a folder exposes it far more widely than it looks.',
        check: ['Who was granted what, on whose mailbox? Watch for permissions granted to a recently created or compromised account.'],
        actions: ['Remove the permission and audit delegation across all mailboxes, including shared ones.'],
        link: '#/play/pro-inbox-rules',
    },
    {
        op: 'MailItemsAccessed',
        cat: 'mailbox',
        sev: 'high',
        src: 'ual',
        means: 'Mail was actually read. **This is the event that answers the question everyone asks after a mailbox compromise**. Did they read it, or only have the ability to. Since the 2023 expanded-logging rollout it is part of Audit **Standard** and on by default for E3 and E5 mailboxes; only the sensitivity-label insight still needs Premium.',
        check: [
            '`MailAccessType` of `Bind` is individual messages, aggregated in two-minute windows with an `OperationCount`; `Sync` means a client synchronised whole folders.',
            '**If a sync happened in the attacker’s context, assume the entire folder is compromised**. They could then read it offline, where nothing is audited.',
            'Sync is only recorded for desktop Outlook on Windows or Mac. Other clients produce bind records only.',
            'Use **`SessionId`** to separate attacker activity from the real user’s in the same mailbox. It is the single most useful field here and almost nobody uses it.',
            'Correlate `ClientIPAddress` and `ClientInfoString` against the known-bad session.',
            'If `IsThrottled` is true, Microsoft stopped recording and you must assume broader access.',
        ],
        actions: [
            'Enumerate the folders and, for bind operations, the `InternetMessageId` values accessed. That list drives the data-breach assessment.',
            'Check the messages behind those IDs for personal or regulated data before deciding on notification.',
            'If mailbox auditing was off, or the mailbox is below E3, say so explicitly. You cannot prove non-access.',
        ],
        link: '#/play/pro-log-collection',
    },
    {
        op: 'Send',
        aka: ['SendAs', 'SendOnBehalf'],
        cat: 'mailbox',
        sev: 'high',
        src: 'ual',
        means: 'Mail was sent from the mailbox. During a compromise this is usually onward phishing to contacts and suppliers, or a fraudulent payment instruction.',
        check: ['Pull message trace for the same window: it expires in about 10 days, so do it first.'],
        actions: [
            'Identify every recipient and warn them, quickly, before the message lands.',
            'Purge the sent messages from recipient mailboxes where they are internal.',
        ],
        link: '#/play/pro-inbox-rules',
    },
    {
        op: 'SearchQueryInitiatedExchange',
        aka: ['SearchQueryInitiatedSharePoint'],
        cat: 'mailbox',
        sev: 'medium',
        src: 'ual',
        means: 'Someone searched the mailbox or SharePoint. In an intrusion these queries are often the clearest statement of intent you will ever get: "password", "invoice", "wire transfer", "bank details", "confidential", "MFA".',
        check: ['Read the actual query strings. They tell you what the adversary was after, which shapes the whole notification assessment.'],
        actions: ['Record the queries verbatim in the timeline and use them to prioritise what to check for exposure.'],
        link: '#/play/pro-log-collection',
    },

    /* ==================================================== FILES (UAL) === */
    {
        op: 'FileDownloaded',
        aka: ['FileSyncDownloadedFull', 'FileAccessed'],
        cat: 'files',
        sev: 'high',
        src: 'ual',
        means: 'Files were taken from SharePoint or OneDrive. `FileSyncDownloadedFull` means a client synchronised an entire library. That is bulk collection, not browsing.',
        check: ['Volume and rate. A hundred downloads in two minutes is exfiltration; five over an afternoon is work.'],
        actions: ['Enumerate what was taken, assess it for personal or regulated data, and start the notification clock.'],
        link: '#/play/pro-log-collection',
    },
    {
        op: 'AnonymousLinkCreated',
        aka: ['SharingSet', 'AddedToSecureLink', 'SharingInvitationCreated', 'CompanyLinkCreated'],
        cat: 'files',
        sev: 'high',
        src: 'ual',
        means: 'Content was shared outward. An anonymous link is a URL that works for anyone who has it, with no authentication. A very quiet exfiltration route that survives losing the account.',
        check: ['What was shared, with whom, and does the link still work?'],
        actions: ['Revoke the links, then review external sharing settings for the whole tenant.'],
        link: '#/play/pro-log-collection',
    },
    {
        op: 'SearchCreated',
        aka: ['SearchExported', 'ViewedSearchExported', 'SearchStarted', 'New-ComplianceSearch', 'New-ComplianceSearchAction'],
        cat: 'files',
        sev: 'critical',
        src: 'ual',
        means: 'eDiscovery was used. An administrator can search and export **every mailbox and every file in the tenant** in one operation. It is the most efficient exfiltration tool in Microsoft 365, and it is built in.',
        check: ['Who created the search, what was the query, was it exported, and was the export downloaded?'],
        actions: [
            'Treat any unexplained eDiscovery activity as a tenant-wide data breach until proven otherwise.',
            'Remove the eDiscovery role assignment and restrict it to a named, small group.',
        ],
        link: '#/play/pro-entra-persistence',
    },

    /* ================================================== ORG-WIDE (UAL) == */
    {
        op: 'New-TransportRule',
        aka: ['Set-TransportRule', 'Enable-TransportRule'],
        cat: 'org',
        sev: 'critical',
        src: 'ual',
        means: 'A mail-flow rule affecting the **entire organisation**. Attackers use these to copy all inbound mail to an external address, to suppress warnings, or to delete security notifications before anyone reads them.',
        check: ['What does it do, and to whom does it apply? `BlindCopyTo`, `RedirectMessageTo` and rules that delete are the dangerous shapes.'],
        actions: ['Disable the rule, preserve its definition, and review every transport rule in the tenant.'],
        link: '#/play/pro-inbox-rules',
    },
    {
        op: 'Set-AdminAuditLogConfig',
        aka: ['Set-MailboxAuditBypassAssociation', 'Set-OrganizationConfig'],
        cat: 'org',
        sev: 'critical',
        src: 'ual',
        means: 'Auditing itself was reconfigured. Disabling audit logging or adding a mailbox audit bypass is an attempt to blind the investigation. It is never routine and it means someone knows what they are doing.',
        check: ['What exactly changed, and does anything else in the timeline sit inside the resulting blind spot?'],
        actions: [
            'Restore auditing immediately and treat everything after the change as unlogged rather than clean.',
            'Escalate: this indicates a deliberate, capable adversary, not opportunistic fraud.',
        ],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'Add-MailboxPermission (service account)',
        aka: ['New-ManagementRoleAssignment', 'Add-RoleGroupMember'],
        cat: 'org',
        sev: 'critical',
        src: 'ual',
        means: 'Exchange administrative rights were granted. `ApplicationImpersonation` and Organization Management give access to every mailbox in the tenant.',
        check: ['Which role, to which principal? Impersonation rights on a service principal are a tenant-wide mailbox backdoor.'],
        actions: ['Remove the assignment and audit all Exchange role group membership.'],
        link: '#/play/pro-entra-persistence',
    },
    {
        op: 'CreateFlow',
        aka: ['EditFlow', 'Microsoft Flow', 'PutConnection'],
        cat: 'org',
        sev: 'medium',
        src: 'ual',
        means: 'A Power Automate flow was created. A flow can forward every incoming message, copy files to external storage, or auto-approve requests. Persistence that lives entirely outside the places people look.',
        check: ['What triggers it and what does it do? Where does the data go?'],
        actions: ['Disable the flow and review the connections it uses.'],
        link: '#/play/pro-entra-persistence',
    },
];
