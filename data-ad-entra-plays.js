/* ==========================================================================
   Breachlight — data-ad-entra-plays.js
   --------------------------------------------------------------------------
   Directory incident playbooks and decision trees for on-premises Active
   Directory and Microsoft Entra ID.

   Extends BL_PLAY_CATS / BL_PLAYS / BL_TREES. Loads after data-plays.js and
   data-trees.js, before app.js.

   Written so that an engineer who has never handled a directory incident can
   work top to bottom and be doing the right things in the right order. Every
   playbook ends with hardening, because a response that does not change the
   configuration is a response that will be repeated.

   The queries are STARTING POINTS. Table names, schemas and retention differ
   per environment; never paste one into a bridge call as though it were an
   answer.
   ========================================================================== */

window.BL_PLAY_CATS.push({
    id: 'directory',
    aud: 'pro',
    title: 'Active Directory & Entra ID',
    glyph: '🏛',
});

/* ========================================================================== */
/* ============================== PLAYBOOKS ================================= */
/* ========================================================================== */

window.BL_PLAYS.push(

    /* ------------------------------------------------------- ON-PREM: TIER 0 */
    {
        id: 'pro-ad-tier0',
        aud: 'pro',
        cat: 'directory',
        title: 'Domain admin or Tier 0 is compromised',
        glyph: '🔺',
        urgency: 'critical',
        clock: 'The adversary can already do anything you can. Assume every credential in the forest is disclosed and work from there — not from what you can prove.',
        lede: 'This is the worst directory outcome and the one everything else leads to. The instinct is to start resetting things; resist it for twenty minutes. Uncoordinated containment tips off the adversary, destroys the timeline, and leaves persistence behind. Contain deliberately, in the order below, and get help early — this is the situation external DFIR exists for.',
        signs: [
            'A new or unexpected member of Domain Admins, Enterprise Admins, Schema Admins, Administrators, Backup Operators or DnsAdmins.',
            'DCSync from something that is not a domain controller.',
            'Credential-dumping tooling, `ntdsutil`, shadow copy creation or LSASS access on a domain controller.',
            'A GPO linked to the domain root or the Domain Controllers OU modified by someone who should not.',
            'Interactive logon by a domain admin on a workstation or a Tier 1 server they have no reason to touch.',
            'Ransomware precursors: backup tampering, security tooling disabled, mass discovery across the estate.',
        ],
        sections: [
            {
                h: 'First thirty minutes — do not improvise',
                kind: 'first',
                steps: [
                    'Declare an incident formally and **move to an out-of-band channel** agreed in advance. Assume Teams, email and the wiki are readable by the adversary. Do not discuss the response in the compromised estate.',
                    'Assemble a named team with one incident lead. Everything routes through that person.',
                    'Start a **written timeline** now — every action, every timestamp, every decision and who made it. The whole investigation depends on it and nobody can reconstruct it afterwards.',
                    '**Protect the backups before anything else.** Disconnect them, make them immutable, verify they exist and restore. Backups are targeted deliberately and early.',
                    'Preserve evidence before you break anything: forward domain controller security logs off the DCs, snapshot the affected hosts, and take memory images where you can. **Isolate rather than power off** — shutting down a DC destroys memory and live session state.',
                    'Do **not** yet mass-reset passwords, disable accounts or rotate krbtgt. Doing that piecemeal warns the adversary and burns your visibility. Contain when the plan is complete, then do it all at once.',
                    'Engage external DFIR, legal counsel, your insurer and executive leadership now. Insurers commonly require notification within 24–72 hours as a condition of cover.',
                ],
            },
            {
                h: 'Establish the scope before you act',
                kind: 'do',
                steps: [
                    'Find the **earliest credible evidence**, not the first alert. Anchor the whole response to that timestamp.',
                    'Compare it against your **log retention**. If the intrusion predates your logs, say so explicitly and scope conservatively — where retention ends, assumption begins.',
                    'Enumerate current Tier 0 membership and compare it against a known-good baseline: Domain Admins, Enterprise Admins, Schema Admins, Administrators, Account Operators, Backup Operators, Print Operators, Server Operators, DnsAdmins, and the local Administrators group on every DC.',
                    'Enumerate **hidden** privilege: `sIDHistory` values containing privileged RIDs, `adminCount = 1` on unexpected objects, dangerous ACLs on the domain root / AdminSDHolder / Domain Controllers OU / GPOs / certificate templates.',
                    'Check whether **AD CS** was used to mint authentication certificates. Certificates survive every password reset and are the persistence people forget.',
                    'Check the **hybrid bridges** — the Entra Connect server, ADFS, PTA agents, the `AZUREADSSOACC$` account. If the domain is gone, assume the tenant is reachable.',
                    'Identify the initial access route. If you skip this, you will rebuild and be re-compromised through the same door.',
                ],
            },
            {
                h: 'Contain — all at once, in this order',
                kind: 'do',
                steps: [
                    'Cut the adversary’s access paths simultaneously: disable the compromised accounts, block the C2 infrastructure, isolate the known-compromised hosts, and revoke external remote access.',
                    'Reset **every Tier 0 account** password, from a trusted host, twice where the account may have been in a ticket.',
                    'Reset all **computer account** passwords for Tier 0 systems, and all **service account** passwords, including gMSA where implicated.',
                    'Reset **krbtgt twice**, with a full replication cycle and at least the maximum ticket lifetime between the two resets. See the Golden Ticket playbook — doing this wrong either fails to evict them or takes the domain down.',
                    'Rotate the **`AZUREADSSOACC$`** key, the **ADFS token-signing certificates** (twice), and the **Entra Connect** sync account credentials.',
                    'Revoke and reissue any certificates that could authenticate as a privileged user, and rotate the CA’s own keys if the CA was reachable.',
                    'Revoke cloud sessions and refresh tokens tenant-wide for privileged identities, and audit the Entra persistence set in parallel.',
                    'Do a coordinated **domain-wide password reset** afterwards if NTDS.dit was or may have been exfiltrated. Plan the communications for it before you press the button.',
                ],
            },
            {
                h: 'Then decide: clean in place, or rebuild',
                kind: 'note',
                steps: [
                    '**Clean in place** is defensible only when the intrusion is recent, entirely within your log retention, the initial access is known, and you have completed and verified the full persistence checklist.',
                    '**Rebuild the forest** when Tier 0 is confirmed compromised and you cannot credibly enumerate the persistence, or when dwell time exceeds retention. Restoring backups taken after the intrusion restores the adversary with them.',
                    '"We think we got it all" is not a third option — it is the first case, honestly stated.',
                    'Whichever you choose, write down *why*, with the evidence. That reasoning is what you will be asked to defend by the board, the insurer and the regulator.',
                ],
            },
            {
                h: 'Harden, or you will do this again',
                kind: 'evidence',
                steps: [
                    'Implement **tiering** with separate accounts per tier, privileged access workstations, and technical enforcement through authentication policy silos or deny-logon rights.',
                    'Deploy **Windows LAPS**, move service accounts to **gMSA**, and empty the privileged groups of everything that does not need to be there.',
                    'Fix the enabling defaults: `MachineAccountQuota = 0`, LDAP signing and channel binding, SMB signing, RC4 disabled, unconstrained delegation removed, spooler off on DCs.',
                    'Build the detections that would have caught this — the DCSync alert alone is nearly free and nearly noiseless.',
                    'Write the forest recovery plan and rehearse it, while the organisation still remembers why it matters.',
                ],
            },
        ],
        queries: [
            { label: 'Tier 0 group membership changes (last 30 days)', lang: 'KQL · Sentinel', q: 'SecurityEvent\n| where TimeGenerated > ago(30d)\n| where EventID in (4728, 4732, 4756, 4729, 4733, 4757)\n| where TargetUserName has_any ("Domain Admins","Enterprise Admins","Schema Admins",\n                               "Administrators","Backup Operators","Account Operators",\n                               "Server Operators","Print Operators","DnsAdmins")\n| project TimeGenerated, Computer, EventID, SubjectUserName, TargetUserName, MemberName\n| order by TimeGenerated asc' },
            { label: 'Accounts holding SIDHistory with a privileged RID', lang: 'PowerShell · AD', q: 'Get-ADObject -LDAPFilter "(sIDHistory=*)" -Properties sIDHistory, sAMAccountName |\n  ForEach-Object {\n    foreach ($s in $_.sIDHistory) {\n      if ("$s" -match \'-(512|518|519|516|498|520)$\') {\n        [pscustomobject]@{ Account = $_.sAMAccountName; SIDHistory = "$s" }\n      }\n    }\n  }' },
            { label: 'Credential-theft tooling on domain controllers', lang: 'KQL · Defender XDR', q: 'DeviceProcessEvents\n| where Timestamp > ago(30d)\n| where DeviceName in~ (dynamic(["DC01","DC02"]))   // scope to your DCs\n| where ProcessCommandLine has_any ("ntdsutil","ifm","vssadmin create shadow",\n                                    "diskshadow","esentutl","comsvcs.dll","MiniDump",\n                                    "reg save hklm\\\\sam","reg save hklm\\\\system")\n| project Timestamp, DeviceName, AccountName, FileName, ProcessCommandLine, InitiatingProcessFileName' },
        ],
        terms: ['tier0', 'krbtgt', 'ntds-dit', 'dcsync', 'acl-abuse', 'sidhistory', 'containment', 'eradication', 'dwell-time'],
        defend: ['ad-tiering', 'ad-hardening', 'ad-recovery-prep', 'ad-monitoring'],
        plays: ['pro-ad-dcsync', 'pro-ad-golden', 'pro-ad-persistence', 'pro-hybrid-pivot', 'pro-ransomware'],
        keys: 'domain admin compromised tier 0 compromise domain controller compromised active directory breach forest rebuild ad incident response full domain compromise enterprise admin',
    },

    /* -------------------------------------------------------------- DCSYNC -- */
    {
        id: 'pro-ad-dcsync',
        aud: 'pro',
        cat: 'directory',
        title: 'DCSync, or the AD database was copied',
        glyph: '🔁',
        urgency: 'critical',
        clock: 'If it succeeded, every password hash in the domain is already gone. You are managing consequences, not preventing them.',
        lede: 'DCSync asks a domain controller to replicate password data while pretending to be one. Nothing runs on the DC and nothing touches disk, which is why it is the standard way to take a domain. Treat a confirmed DCSync as equivalent to somebody walking out with NTDS.dit.',
        signs: [
            'Event **4662** on a domain controller whose properties contain `1131f6aa-9c07-11d1-f79f-00c04fc2dcd2` (DS-Replication-Get-Changes) or `1131f6ad-9c07-11d1-f79f-00c04fc2dcd2` (Get-Changes-All), where the caller is not a DC and not the Entra Connect sync account.',
            'Replication traffic (DRSUAPI) from a workstation or an unexpected server.',
            'Alternatively: `ntdsutil` IFM creation, `vssadmin create shadow`, `diskshadow`, or `esentutl` on a DC — the noisier route to the same result.',
            'A stolen DC backup, VM snapshot or replica disk. Identical impact, no events at all.',
        ],
        sections: [
            {
                h: 'Confirm it, quickly and precisely',
                kind: 'first',
                steps: [
                    'Establish **which account** performed the replication and **from which host**. That is the compromised identity and the compromised machine.',
                    'Establish **when it first happened**. There is usually more than one occurrence and the first is rarely the one that alerted.',
                    'Rule out the legitimate replicators: domain controllers themselves, the Entra Connect / AD Connect sync account, and any approved migration or password-audit tool. Have that allow-list written down; without it this alert is unusable.',
                    'If the caller is legitimate but the **source host** is wrong, the sync account has been stolen — treat the Entra Connect server as compromised.',
                ],
            },
            {
                h: 'Contain',
                kind: 'do',
                steps: [
                    'Isolate the source host. Preserve memory before anything else — the replicated hashes may still be resident.',
                    'Disable the account that performed the replication, and treat every credential used on that host as disclosed.',
                    'Escalate to the **Tier 0 compromise** playbook. Whoever could DCSync had, or has, domain-admin-equivalent rights.',
                    'Do not rotate krbtgt in isolation and call it done. A single reset leaves the previous key valid, and krbtgt is not the only secret they took.',
                ],
            },
            {
                h: 'Assume everything and plan the resets',
                kind: 'do',
                steps: [
                    'Every account in the domain now has a disclosed password hash. That includes service accounts, computer accounts, `AZUREADSSOACC$`, and krbtgt.',
                    'Plan a **domain-wide password reset**, staged: Tier 0 first, then service accounts, then computer accounts for Tier 0, then all users.',
                    'Reset **krbtgt twice** with the correct interval — see the Golden Ticket playbook.',
                    'Rotate `AZUREADSSOACC$` and any trust passwords. A DCSync in a hybrid environment is a cloud incident as well.',
                    'Where hashes are reused elsewhere (a second forest, a Linux estate via a bridge, an application with the same passwords), fix those too.',
                ],
            },
            {
                h: 'Investigate the path in',
                kind: 'evidence',
                steps: [
                    'How did they get replication rights? The usual answers: domain admin already, a stale ACL delegation, a compromised Entra Connect server, or an ACL path found with a graphing tool.',
                    'Audit **who actually holds** `DS-Replication-Get-Changes` and `Get-Changes-All` on the domain object today. There are almost always more principals than expected, granted years ago for a migration.',
                    'Preserve the DC security logs off-box before retention rolls, along with the 4662 events and the surrounding authentication activity.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Remove every unnecessary holder of replication rights, and document the ones that remain, with an owner.',
                    'Put a SACL on the domain object so 4662 fires cleanly, and build the alert with the legitimate replicators excluded by name. This is one of the highest-value, lowest-noise detections available in AD.',
                    'Treat the Entra Connect server as Tier 0 — it holds replication rights by design and is the most common non-DC source of a "legitimate" DCSync.',
                    'Restrict and monitor DC backups, VM snapshots and replica storage with the same care as the DCs themselves.',
                ],
            },
        ],
        queries: [
            { label: 'DCSync — replication by a non-DC principal', lang: 'KQL · Sentinel', q: 'let ReplGuids = dynamic(["1131f6aa-9c07-11d1-f79f-00c04fc2dcd2",   // Get-Changes\n                          "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2",   // Get-Changes-All\n                          "89e95b76-444d-4c62-991a-0facbeda640c"]); // In-Filtered-Set\nlet KnownRepl = dynamic(["DC01$","DC02$","MSOL_a1b2c3d4e5f6"]);      // your DCs + sync account\nSecurityEvent\n| where TimeGenerated > ago(30d)\n| where EventID == 4662\n| where Properties has_any (ReplGuids)\n| where SubjectUserName !in~ (KnownRepl)\n| project TimeGenerated, Computer, SubjectUserName, SubjectDomainName, ObjectName, Properties\n| order by TimeGenerated asc' },
            { label: 'Who currently holds replication rights', lang: 'PowerShell · AD', q: '$root = (Get-ADRootDSE).defaultNamingContext\n$acl  = Get-Acl -Path "AD:\\$root"\n$guids = @{\n  "1131f6aa-9c07-11d1-f79f-00c04fc2dcd2" = "Get-Changes"\n  "1131f6ad-9c07-11d1-f79f-00c04fc2dcd2" = "Get-Changes-All"\n}\n$acl.Access |\n  Where-Object { $guids.ContainsKey($_.ObjectType.ToString()) } |\n  Select-Object IdentityReference,\n                @{n="Right";e={$guids[$_.ObjectType.ToString()]}},\n                AccessControlType |\n  Sort-Object IdentityReference' },
        ],
        terms: ['dcsync', 'ntds-dit', 'krbtgt', 'entra-connect', 'seamless-sso', 'tier0'],
        defend: ['ad-monitoring', 'ad-tiering', 'hybrid-hardening'],
        plays: ['pro-ad-tier0', 'pro-ad-golden', 'pro-hybrid-pivot'],
        keys: 'dcsync detected replication rights abuse 4662 ntds.dit stolen ad database copied hashes dumped mimikatz dcsync ntdsutil ifm',
    },

    /* --------------------------------------------------------- GOLDEN TICKET */
    {
        id: 'pro-ad-golden',
        aud: 'pro',
        cat: 'directory',
        title: 'Forged Kerberos tickets, and how to reset krbtgt correctly',
        glyph: '🎫',
        urgency: 'critical',
        clock: 'A Golden Ticket is valid until krbtgt is reset twice. Not until the password changes, not until the account is disabled — twice.',
        lede: 'If the krbtgt hash left the building, the adversary can mint a ticket for any identity, with any group membership, for any lifetime, and the domain will honour it. This playbook exists mostly for one procedure: the double reset. Getting the interval wrong either fails to evict them or takes authentication down across the estate.',
        signs: [
            '**Golden Ticket:** a service ticket request (4769) with no preceding TGT request (4768) for that account; unusual ticket lifetimes; RC4 where AES is expected; a username that does not exist or does not match the SID.',
            '**Silver Ticket:** a logon on a member server (4624) with no corresponding 4769 on any domain controller. There is no DC-side evidence at all — you must detect at the service.',
            '**Diamond Ticket:** a legitimately issued TGT that was modified; harder still, and best caught by anomalous group claims rather than by ticket structure.',
            'Any confirmed DCSync, NTDS.dit theft or DC compromise implies the capability, whether or not you ever see a forged ticket.',
        ],
        sections: [
            {
                h: 'Before you touch krbtgt',
                kind: 'first',
                steps: [
                    'Confirm you have actually evicted the adversary from Tier 0. Resetting krbtgt while they still hold domain admin simply lets them take the new hash.',
                    'Complete the persistence sweep first — certificates, ACLs, `sIDHistory`, GPOs, scheduled tasks, service accounts. krbtgt is one door of many.',
                    'Announce a maintenance window. The reset itself is quick, but every existing ticket becomes invalid at the second reset and users will re-authenticate.',
                    'Verify **replication health across every domain controller** first. If replication is broken, the second reset will lock out the parts of the domain that never received the first.',
                    'Have a rollback position and a bridge call. This is not a change to make alone on a Friday evening.',
                ],
            },
            {
                h: 'The double reset, step by step',
                kind: 'do',
                steps: [
                    'Understand why twice: AD keeps the **current and the previous** key for krbtgt. One reset makes the stolen key the "previous" key — still valid. The second reset finally retires it.',
                    '**Reset one.** Use Microsoft’s `New-KrbtgtKeys.ps1` (the supported tool) or reset the password of the `krbtgt` account once. Do not use a scripted double-reset that ignores the interval.',
                    '**Wait.** For full replication to complete to every DC in every site, **and** for at least the maximum Kerberos ticket lifetime plus maximum clock skew. Defaults are 10 hours plus 5 minutes; a conservative and common choice is to wait a full **24 hours**.',
                    'Verify replication convergence explicitly (`repadmin /replsummary`, `repadmin /showrepl`) before continuing. Do not assume.',
                    '**Reset two.** Same method. Every previously issued ticket, forged or genuine, is now invalid.',
                    'Watch authentication closely afterwards: scheduled tasks with stored credentials, services, and anything with a long-lived ticket will need to re-authenticate.',
                    'If the domain has **read-only domain controllers**, remember each has its own krbtgt account — handle those too.',
                    'In a multi-domain forest, do this **per domain**, and also reset the **trust passwords** between domains.',
                ],
            },
            {
                h: 'The other secrets that forge tickets',
                kind: 'do',
                steps: [
                    'krbtgt covers Golden Tickets. It does **not** cover Silver Tickets — reset the service and computer accounts whose hashes were exposed, or those tickets keep working.',
                    'Rotate `AZUREADSSOACC$`. Its key forges Kerberos tickets accepted by **Entra ID**, so a domain compromise is a cloud compromise until this is done.',
                    'Rotate the **trust passwords** for every inbound and outbound trust.',
                    'Reset the computer accounts of Tier 0 servers, and any account whose ticket may have been captured from an unconstrained delegation host.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not do both resets back to back "to save time". You will invalidate tickets before replication has converged and cause a domain-wide authentication outage.',
                    'Do not reset krbtgt as a precaution and then declare the incident closed. Alone it evicts one persistence mechanism out of a dozen.',
                    'Do not skip it because "we did not see a Golden Ticket". If the hash was exposed, the capability exists; absence of the ticket in your logs is not absence of the ticket.',
                    'Do not disable or delete the krbtgt account. It is required, and the domain will stop authenticating.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Rotate krbtgt on a **schedule** — every 6 to 12 months — so that the procedure is routine and rehearsed rather than terrifying.',
                    'Disable RC4 and require AES for Kerberos; it narrows both forgery and roasting.',
                    'Alert on 4769 without a preceding 4768, on anomalous ticket lifetimes, and on encryption downgrades.',
                    'Reduce maximum ticket lifetime from the default so that the wait between resets is shorter next time, and so stolen tickets expire sooner.',
                ],
            },
        ],
        queries: [
            { label: 'Service tickets with no preceding TGT request', lang: 'KQL · Sentinel', q: 'let TGT = SecurityEvent\n  | where TimeGenerated > ago(7d) and EventID == 4768\n  | project Account = tolower(TargetUserName), TgtTime = TimeGenerated;\nSecurityEvent\n| where TimeGenerated > ago(7d) and EventID == 4769\n| extend Account = tolower(TargetUserName)\n| join kind=leftouter (TGT) on Account\n| where isempty(TgtTime) or TgtTime > TimeGenerated\n| summarize Requests = count(), Services = make_set(ServiceName, 20) by Account, IpAddress\n| order by Requests desc' },
            { label: 'Kerberos RC4 where AES is expected', lang: 'KQL · Sentinel', q: 'SecurityEvent\n| where TimeGenerated > ago(7d)\n| where EventID in (4768, 4769)\n| where TicketEncryptionType in ("0x17", "0x18")   // RC4-HMAC variants\n| summarize count(), make_set(ServiceName, 10) by TargetUserName, IpAddress, TicketEncryptionType\n| order by count_ desc' },
        ],
        terms: ['krbtgt', 'golden-ticket', 'silver-ticket', 'seamless-sso', 'ntds-dit', 'eradication'],
        defend: ['ad-recovery-prep', 'ad-hardening', 'ad-monitoring'],
        plays: ['pro-ad-tier0', 'pro-ad-dcsync', 'pro-ad-persistence'],
        keys: 'golden ticket silver ticket krbtgt reset twice double reset kerberos forgery new-krbtgtkeys forged tgt persistence how to reset krbtgt',
    },

    /* ------------------------------------------------------------- ROASTING */
    {
        id: 'pro-ad-roast',
        aud: 'pro',
        cat: 'directory',
        title: 'Kerberoasting or AS-REP roasting detected',
        glyph: '🍖',
        urgency: 'high',
        clock: 'The ticket is already offline and cracking is not something you can interrupt. Assume the weakest passwords in that set are gone.',
        lede: 'Both attacks are offline password cracking against material that Active Directory hands out on request. Kerberoasting needs one ordinary domain account; AS-REP roasting needs none at all. Neither is stoppable once the material is out, so the response is to work out what was requested and rotate it.',
        signs: [
            '**Kerberoasting:** a burst of Event 4769 from a single account, especially with ticket encryption type `0x17` (RC4-HMAC) where your estate is AES-capable.',
            '**AS-REP roasting:** Event 4768 with pre-authentication type `0`, for accounts flagged `DONT_REQUIRE_PREAUTH`.',
            'Requests for service tickets across many unrelated SPNs in seconds — humans do not do that.',
            'Requests for a **honeytoken** service account. If you planted one, this is a certainty rather than a suspicion.',
        ],
        sections: [
            {
                h: 'Work out exactly what was requested',
                kind: 'first',
                steps: [
                    'Extract the full list of SPNs or accounts requested, from the 4769 / 4768 events. That list is your rotation scope — do not guess it.',
                    'Identify the requesting account and host. That identity is compromised; treat it as such and start the credential playbook for it.',
                    'Rank the requested accounts by privilege. A kerberoasted account that is a member of Domain Admins is a Tier 0 incident, immediately.',
                    'Check whether any of the requested accounts have since authenticated from somewhere unusual — that tells you a crack already succeeded.',
                ],
            },
            {
                h: 'Rotate, in priority order',
                kind: 'do',
                steps: [
                    'Any requested account in a privileged group: reset now, and escalate to the Tier 0 playbook.',
                    'All other requested service accounts: reset with a **25+ character random password**, or better, migrate to a **group Managed Service Account** where the password is 240 characters and rotates automatically.',
                    'Clear the `DONT_REQUIRE_PREAUTH` flag from every account that has it. There is essentially no valid modern reason for it.',
                    'Reset any account whose ticket was requested even if you believe the password is strong. Offline cracking has no rate limit and you cannot observe progress.',
                    'Remember Silver Tickets: a cracked service account hash also forges service tickets for that service until the password changes.',
                ],
            },
            {
                h: 'Harden — this one is genuinely fixable',
                kind: 'note',
                steps: [
                    'Enumerate every **user** account with an SPN. That is your entire kerberoastable surface and it is usually a short list. Computer accounts are not at risk — their passwords are machine-generated.',
                    'Move all of them to **gMSA**. This removes the attack rather than mitigating it.',
                    'Where gMSA is impossible, enforce 25+ character passwords, remove the accounts from privileged groups, and add them to **Protected Users** if compatible.',
                    'Disable RC4 for Kerberos so that roasting yields only AES material, which is far more expensive to crack.',
                    'Clear `DONT_REQUIRE_PREAUTH` and add a monthly audit for it — the flag gets re-set by well-meaning integrations.',
                    'Plant a **honeytoken service account**: an SPN, a plausible name, a deliberately weak-looking password, no rights, and an alert on any 4769 for it. It is the cheapest high-confidence detection in Active Directory.',
                ],
            },
        ],
        queries: [
            { label: 'Kerberoasting burst', lang: 'KQL · Sentinel', q: 'SecurityEvent\n| where TimeGenerated > ago(7d)\n| where EventID == 4769 and TicketEncryptionType == "0x17"\n| where ServiceName !endswith "$" and ServiceName != "krbtgt"\n| summarize DistinctSpns = dcount(ServiceName),\n            Spns = make_set(ServiceName, 50),\n            Requests = count()\n          by TargetUserName, IpAddress, bin(TimeGenerated, 10m)\n| where DistinctSpns > 5\n| order by DistinctSpns desc' },
            { label: 'Roastable accounts you still have', lang: 'PowerShell · AD', q: '# Kerberoastable: user accounts with an SPN\nGet-ADUser -Filter { ServicePrincipalName -like "*" } `\n  -Properties ServicePrincipalName, PasswordLastSet, MemberOf |\n  Select-Object SamAccountName, PasswordLastSet,\n                @{n="SPNs";e={$_.ServicePrincipalName -join "; "}},\n                @{n="Groups";e={($_.MemberOf | ForEach-Object { ($_ -split ",")[0] -replace "CN=" }) -join "; "}}\n\n# AS-REP roastable: pre-authentication not required\nGet-ADUser -Filter { DoesNotRequirePreAuth -eq $true } -Properties DoesNotRequirePreAuth |\n  Select-Object SamAccountName, Enabled' },
        ],
        terms: ['kerberoast', 'asrep-roast', 'silver-ticket', 'protected-users', 'honeytoken'],
        defend: ['ad-hardening', 'ad-monitoring', 'ad-tiering'],
        plays: ['pro-ad-tier0', 'pro-ad-golden'],
        keys: 'kerberoasting detected as-rep roasting service account cracked spn accounts gmsa migration 4769 rc4 weak service password offline cracking',
    },

    /* --------------------------------------------------------- RELAY/COERCE */
    {
        id: 'pro-ad-relay',
        aud: 'pro',
        cat: 'directory',
        title: 'NTLM relay and authentication coercion',
        glyph: '🧲',
        urgency: 'critical',
        clock: 'Coercion to relay to AD CS takes under a minute end to end. If you have seen the coercion, assume the relay succeeded.',
        lede: 'The adversary forces a machine — usually a domain controller — to authenticate to them, then relays that authentication somewhere that grants privilege. It is fast, it uses only built-in Windows features, and the fix is to break the relay rather than the coercion, because there will always be another coercion method.',
        signs: [
            'Unexpected SMB or RPC connections from a domain controller to a workstation or an unknown host.',
            'Machine account authentication arriving at an unusual destination, or a DC computer account authenticating to a non-DC.',
            'A certificate issued to a domain controller or a privileged account shortly after (**ESC8**).',
            '`msDS-AllowedToActOnBehalfOfOtherIdentity` written on a computer object shortly after (LDAP relay to configure RBCD).',
            'A new computer account created by an ordinary user — the `MachineAccountQuota` default of 10 enabling an RBCD chain.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Identify and isolate the relay host — the machine the coerced authentication was sent to.',
                    'Establish where it was relayed **to**: the certificate authority (ESC8), LDAP or LDAPS (RBCD / ACL write), SMB (lateral movement), or the Exchange or ADFS endpoints.',
                    'If it went to AD CS: **revoke any certificate issued in that window** and treat the identity in the certificate as compromised. Certificates outlive password resets, so this step is not optional.',
                    'If it went to LDAP: check every computer object for a newly written `msDS-AllowedToActOnBehalfOfOtherIdentity`, and for any recently created computer account.',
                    'Reset the computer account password of any coerced machine, twice for domain controllers.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Determine which interface was abused — MS-RPRN (PrinterBug), MS-EFSR (PetitPotam), MS-DFSNM (DFSCoerce), MS-FSRVP (ShadowCoerce). It tells you what to disable and what to patch.',
                    'Check the CA issuance log for every certificate issued during the incident window, and specifically for certificates whose subject or SAN does not match the requester.',
                    'Look for follow-on activity: a Kerberos TGT obtained using a certificate (PKINIT), then DCSync.',
                    'Confirm whether NTLM is still permitted to the targets you care about; if it is, assume this will be attempted again.',
                ],
            },
            {
                h: 'Harden — break the relay, not the coercion',
                kind: 'note',
                steps: [
                    'Enable **LDAP signing** and **LDAP channel binding** on all domain controllers (`LDAPServerIntegrity = 2`, `LdapEnforceChannelBinding = 2`). Audit with events 2887 and 2889 first to find what breaks.',
                    'Require **SMB signing** on all systems, not just domain controllers.',
                    'Enable **Extended Protection for Authentication** on the AD CS web enrolment endpoint, or remove web enrolment entirely if unused. This closes ESC8.',
                    'Disable NTLM where you can; where you cannot, restrict it with audit-then-enforce using the NTLM restriction policies.',
                    'Set `ms-DS-MachineAccountQuota` to **0**, which removes the ordinary-user half of the RBCD chain.',
                    'Disable the **Print Spooler** on domain controllers, and apply the relevant patches — but treat these as noise reduction, not as the fix. The fix is signing and channel binding.',
                    'Alert on writes to `msDS-AllowedToActOnBehalfOfOtherIdentity` and on computer account creation by non-administrative users.',
                ],
            },
        ],
        queries: [
            { label: 'RBCD configured on a computer object', lang: 'PowerShell · AD', q: 'Get-ADComputer -Filter { msDS-AllowedToActOnBehalfOfOtherIdentity -like "*" } `\n  -Properties msDS-AllowedToActOnBehalfOfOtherIdentity, whenChanged |\n  Select-Object Name, whenChanged,\n    @{n="AllowedToAct";e={\n        (New-Object System.Security.AccessControl.RawSecurityDescriptor(\n          $_."msDS-AllowedToActOnBehalfOfOtherIdentity",0)\n        ).DiscretionaryAcl.SecurityIdentifier -join "; " }}' },
            { label: 'Computer accounts created by non-admin users', lang: 'KQL · Sentinel', q: 'SecurityEvent\n| where TimeGenerated > ago(30d)\n| where EventID == 4741            // computer account created\n| project TimeGenerated, Computer, SubjectUserName, TargetUserName\n| where SubjectUserName !endswith "$"\n| order by TimeGenerated desc' },
        ],
        terms: ['coercion', 'adcs-esc', 'delegation', 'pth', 'ad-ds'],
        defend: ['ad-hardening', 'ad-monitoring'],
        plays: ['pro-adcs-abuse', 'pro-ad-tier0', 'pro-ad-dcsync'],
        keys: 'ntlm relay coercion petitpotam printerbug dfscoerce esc8 ldap signing channel binding smb signing rbcd machineaccountquota relay attack response',
    },

    /* ----------------------------------------------------------------- ADCS */
    {
        id: 'pro-adcs-abuse',
        aud: 'pro',
        cat: 'directory',
        title: 'Certificate services abused (the ESC techniques)',
        glyph: '📜',
        urgency: 'critical',
        clock: 'A certificate is valid until it expires or is revoked. Password resets do nothing. Find and revoke, or they still have access next year.',
        lede: 'AD CS issues credentials that authenticate. A misconfigured template lets an ordinary user request a certificate naming somebody else — normally a domain administrator. Because certificates survive password changes, this is the persistence that outlives most incident responses, and it is the one most often missed entirely.',
        signs: [
            'A certificate issued where the subject or subject alternative name does not match the requesting account.',
            'Enrolment by an account that has never enrolled before, particularly for a template with a client-authentication EKU.',
            'Kerberos authentication using PKINIT (a certificate) by an account that normally uses a password.',
            'Changes to certificate templates, template ACLs, or CA configuration flags.',
            'A relayed authentication to the CA web enrolment endpoint (**ESC8**).',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Pull the CA issuance database for the whole suspected window. You are looking for every certificate that could authenticate — Client Authentication, Smart Card Logon, PKINIT Client Authentication, Any Purpose, or no EKU at all.',
                    '**Revoke** every suspect certificate, and confirm your CRL or OCSP distribution actually propagates. A revocation nobody checks is not a revocation.',
                    'Unpublish or fix the vulnerable template immediately, so no further certificates can be issued through it.',
                    'Reset the passwords of every identity named in a suspect certificate, and treat those identities as compromised — but understand that the reset alone does **not** invalidate the certificate.',
                    'If a domain controller or a Tier 0 account was impersonated, escalate to the Tier 0 playbook.',
                ],
            },
            {
                h: 'Find which weakness was used',
                kind: 'do',
                steps: [
                    '**ESC1** — template with `ENROLLEE_SUPPLIES_SUBJECT`, a client-auth EKU and broad enrolment rights. The most common by a distance.',
                    '**ESC2** — Any Purpose EKU. **ESC3** — Enrolment Agent template. **ESC4** — writable template ACL. **ESC5** — writable PKI object ACL in the Configuration partition.',
                    '**ESC6** — `EDITF_ATTRIBUTESUBJECTALTNAME2` set on the CA, which lets any requester specify a SAN regardless of the template.',
                    '**ESC7** — `ManageCA` or `ManageCertificates` rights, which allow enabling ESC6 or approving pending requests.',
                    '**ESC8** — NTLM relay to the web enrolment endpoint. **ESC11** — relay to the RPC enrolment interface.',
                    '**ESC9 / ESC10** — weak certificate-to-account mapping. Note that **KB5014754 full enforcement became the default in February 2025**, and the September 2025 update removed the fallback to Compatibility mode — so on a patched estate these are largely closed, and your task is finding the legitimate certificates that enforcement broke.',
                    '**ESC13** — a template with an issuance policy linked to a directory group, granting that group’s rights.',
                    '**Newer entries exist beyond ESC13** — covering `altSecurityIdentities` mapping abuse, application-policy abuse in V1 templates, and CAs with the security extension disabled. Treat any written list as out of date and enumerate with current tooling instead.',
                    'Enumerate all of them with a dedicated AD CS auditing tool rather than by eye. The misconfigurations are subtle and interact.',
                ],
            },
            {
                h: 'Consider the CA itself',
                kind: 'evidence',
                steps: [
                    'If the **CA server** was compromised rather than merely misconfigured, its private key must be considered stolen — and then every certificate it has ever issued is untrustworthy.',
                    'That means rebuilding the PKI hierarchy: new CA, new keys, reissue everything, and revoke the old. It is a large project and it is occasionally the only honest answer.',
                    'Preserve the CA database and logs before rebuilding. They are the record of what was issued to whom.',
                    'Check for a rogue CA certificate published into the NTAuth store — that would let an attacker issue their own authentication certificates from outside your PKI entirely.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Audit every published template for requester-supplied subjects combined with authentication EKUs, and remove enrolment rights from broad groups such as Domain Users and Authenticated Users.',
                    'Require **manager approval** or authorised signatures for any template that can issue authentication certificates.',
                    'Remove `EDITF_ATTRIBUTESUBJECTALTNAME2` from the CA. Restrict `ManageCA` and `ManageCertificates` to Tier 0.',
                    'Enable **EPA** on web enrolment or remove it. Enable LDAP signing and channel binding to close the relay routes.',
                    'Apply **KB5014754 strong certificate binding enforcement** in full enforcement mode, after auditing for certificates that would fail. On a patched estate this is already the default; verify rather than assume, and clear the audit events it raises.',
                    'Treat the CA as **Tier 0** — same OU, same administrators, same monitoring as a domain controller.',
                    'Alert on template changes, CA configuration changes, and certificates issued with a SAN that does not match the requester.',
                ],
            },
        ],
        queries: [
            { label: 'Certificate issued with a mismatched subject', lang: 'KQL · Sentinel', q: 'SecurityEvent\n| where TimeGenerated > ago(30d)\n| where EventID in (4886, 4887, 4888)   // cert requested / issued / denied\n| project TimeGenerated, Computer, EventID, Requester = SubjectUserName, Attributes\n| where Attributes has_any ("SAN:", "upn=", "dns=")\n| order by TimeGenerated desc' },
            { label: 'Templates that allow the requester to supply the subject', lang: 'PowerShell · AD', q: '$cfg = (Get-ADRootDSE).configurationNamingContext\nGet-ADObject -SearchBase "CN=Certificate Templates,CN=Public Key Services,CN=Services,$cfg" `\n  -LDAPFilter "(objectClass=pKICertificateTemplate)" `\n  -Properties msPKI-Certificate-Name-Flag, pKIExtendedKeyUsage, displayName |\n  Where-Object { $_."msPKI-Certificate-Name-Flag" -band 0x00000001 } |   # ENROLLEE_SUPPLIES_SUBJECT\n  Select-Object displayName,\n                @{n="EKUs";e={$_.pKIExtendedKeyUsage -join "; "}}\n# 1.3.6.1.5.5.7.3.2 client auth · 1.3.6.1.4.1.311.20.2.2 smart card logon\n# 1.3.6.1.5.2.3.4 PKINIT client auth · 2.5.29.37.0 any purpose' },
        ],
        terms: ['adcs-esc', 'coercion', 'tier0', 'acl-abuse', 'eradication'],
        defend: ['ad-hardening', 'ad-monitoring', 'ad-tiering'],
        plays: ['pro-ad-relay', 'pro-ad-tier0', 'pro-ad-persistence'],
        keys: 'adcs abuse esc1 esc8 certificate template misconfiguration certified pre-owned revoke certificates pki compromise ca compromised kb5014754 certificate persistence',
    },

    /* ------------------------------------------------------------------ GPO */
    {
        id: 'pro-ad-gpo',
        aud: 'pro',
        cat: 'directory',
        title: 'A Group Policy Object was tampered with',
        glyph: '📋',
        urgency: 'critical',
        clock: 'Policy refreshes every 90 minutes by default. If a malicious GPO is linked and you do nothing, it deploys itself across the estate.',
        lede: 'Group Policy runs code as SYSTEM on every machine in scope. A malicious GPO linked at the domain root is the fastest mass-deployment mechanism in a Windows estate, which is exactly why ransomware crews use it. Unlink first, investigate second.',
        signs: [
            'Event **5136** modifying a `groupPolicyContainer`, or changes to files under `SYSVOL` outside a change window.',
            'A new immediate scheduled task, startup script, logon script or Restricted Groups setting in a GPO.',
            'A GPO newly linked to the domain root or the Domain Controllers OU.',
            'A GPO edited by an account that has never edited one before, or `gPCFileSysPath` changed.',
            'A GPO with a benign-sounding name created minutes ago.',
        ],
        sections: [
            {
                h: 'Stop the deployment',
                kind: 'first',
                steps: [
                    '**Unlink the malicious GPO immediately** — unlinking is faster, safer and more reversible than deleting, and it stops further application at once.',
                    'Do not delete it yet. The GPO and its SYSVOL contents are evidence.',
                    'Identify the scope: which OUs was it linked to, and therefore which machines have already applied it? Compare against the link time and the 90-minute refresh interval.',
                    'Assume every machine in scope executed whatever it contained. Hunt for the payload on those machines before assuming otherwise.',
                    'If it was linked to the Domain Controllers OU, escalate to the Tier 0 playbook without waiting for confirmation.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Export the GPO and the corresponding SYSVOL folder for analysis, preserving timestamps.',
                    'Read the specific settings: scheduled tasks (`ScheduledTasks.xml`), scripts (`scripts.ini`, `psscripts.ini`), Restricted Groups, software installation, registry preferences, and any file deployment.',
                    'Identify who modified it, from where, and when. That account is compromised.',
                    'Check the **GPO ACL** — who else can edit it? Write access to a Tier 0-linked GPO is Tier 0 access, and is very often over-delegated.',
                    'Check the ACLs of every other GPO linked to sensitive OUs while you are here. If they found one weak delegation, there are usually others.',
                ],
            },
            {
                h: 'Recover',
                kind: 'do',
                steps: [
                    'Restore the GPO from a known-good backup once the malicious version has been preserved.',
                    'Remove the deployed artefacts from the affected machines — scheduled tasks, services, files, registry entries and local group memberships do **not** disappear when the GPO is unlinked.',
                    'Force a policy refresh once the estate is clean, and verify the settings are back where they should be.',
                    'Reset credentials used on machines that ran the payload.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Restrict GPO editing rights to Tier 0 for anything linked to the domain root or the Domain Controllers OU, and audit delegations on every other GPO.',
                    'Enable **Directory Service Changes** auditing and alert on Event 5136 for `groupPolicyContainer` objects, plus SYSVOL file changes.',
                    'Back up all GPOs on a schedule to somewhere outside the domain, so restoration is possible during an incident.',
                    'Consider a change-detection tool that diffs GPO contents, so "modified" becomes "modified *what*" without manual export.',
                    'Alert specifically on the addition of immediate scheduled tasks and startup scripts — legitimate use is rare and reviewable.',
                ],
            },
        ],
        queries: [
            { label: 'GPO modifications', lang: 'KQL · Sentinel', q: 'SecurityEvent\n| where TimeGenerated > ago(30d)\n| where EventID == 5136\n| where ObjectClass == "groupPolicyContainer"\n| project TimeGenerated, Computer, SubjectUserName, ObjectDN, AttributeLDAPDisplayName, AttributeValue, OperationType\n| order by TimeGenerated desc' },
            { label: 'Recently changed GPOs and their links', lang: 'PowerShell · AD', q: 'Get-GPO -All |\n  Where-Object { $_.ModificationTime -gt (Get-Date).AddDays(-30) } |\n  Sort-Object ModificationTime -Descending |\n  ForEach-Object {\n    [xml]$r = Get-GPOReport -Guid $_.Id -ReportType Xml\n    [pscustomobject]@{\n      Name     = $_.DisplayName\n      Modified = $_.ModificationTime\n      Links    = ($r.GPO.LinksTo.SOMPath -join "; ")\n    }\n  }' },
        ],
        terms: ['gpo-abuse', 'acl-abuse', 'tier0', 'ransomware', 'containment'],
        defend: ['ad-monitoring', 'ad-tiering', 'ad-hardening'],
        plays: ['pro-ad-tier0', 'pro-ransomware', 'pro-ad-persistence'],
        keys: 'gpo tampering group policy attack malicious gpo immediate scheduled task sysvol 5136 unlink gpo ransomware deployment gpo restore',
    },

    /* ------------------------------------------------- AD PERSISTENCE SWEEP */
    {
        id: 'pro-ad-persistence',
        aud: 'pro',
        cat: 'directory',
        title: 'The Active Directory persistence sweep',
        glyph: '🔍',
        urgency: 'critical',
        clock: 'Work this list before you declare eradication complete. Reinfection is almost always a missed foothold, not a new intrusion.',
        lede: 'Use this as a checklist, not as reading. Go through every item, record the result, and sign each one off by name. The item you skip because it seems unlikely is the one that brings them back in six weeks.',
        signs: ['Any confirmed compromise of a privileged on-premises account, a domain controller, or a Tier 0 system.'],
        sections: [
            {
                h: 'Identity and privilege',
                kind: 'do',
                steps: [
                    '**Privileged group membership** — Domain Admins, Enterprise Admins, Schema Admins, Administrators, Account Operators, Backup Operators, Server Operators, Print Operators, DnsAdmins, and the local Administrators group on every domain controller and Tier 0 server.',
                    '**New or re-enabled accounts**, especially with names resembling service accounts. Check `whenCreated` and `whenChanged` across the window.',
                    '**`sIDHistory`** on every object, looking for privileged RIDs (`-512`, `-518`, `-519`, `-516`, `-498`, `-520`).',
                    '**`adminCount = 1`** on objects that are not currently privileged — a marker of former privilege with stale, over-permissive ACLs.',
                    '**Password-never-expires and password-not-required** flags added during the window.',
                    '**Accounts with `DONT_REQUIRE_PREAUTH`** newly set.',
                ],
            },
            {
                h: 'Permissions and delegation',
                kind: 'do',
                steps: [
                    '**Replication rights** (`DS-Replication-Get-Changes`, `Get-Changes-All`) on the domain object — who holds them now versus your baseline.',
                    '**ACLs** on the domain root, AdminSDHolder, the Domain Controllers OU, Tier 0 OUs, and the certificate templates container. Look for `GenericAll`, `GenericWrite`, `WriteDACL`, `WriteOwner`, `AllExtendedRights`, `ForceChangePassword`.',
                    '**`msDS-KeyCredentialLink`** (shadow credentials) written on any user or computer object — this allows certificate-based authentication as that object.',
                    '**`msDS-AllowedToActOnBehalfOfOtherIdentity`** (RBCD) on any computer object.',
                    '**Delegation flags**: `TRUSTED_FOR_DELEGATION` on anything that is not a DC, and `msDS-AllowedToDelegateTo` additions.',
                    '**Trust configuration** — new trusts, SID filtering disabled, trust password age.',
                    '**Run a graphing tool** and compare the attack paths to Tier 0 against a clean baseline. Lists will not find these; graphs will.',
                ],
            },
            {
                h: 'Execution and code paths',
                kind: 'do',
                steps: [
                    '**GPOs** — created or modified in the window, their links, their ACLs, and their contents (scheduled tasks, scripts, Restricted Groups, software installation).',
                    '**SYSVOL** — unexpected files, scripts, or changed timestamps.',
                    '**Scheduled tasks and services** on domain controllers and Tier 0 systems.',
                    '**WMI event subscriptions**, run keys, startup folders and DLL search-order hijacks on Tier 0 hosts.',
                    '**Local administrators** on Tier 0 servers and on the DCs themselves.',
                    '**Skeleton key / LSASS tampering** indicators on domain controllers, and any unexpected security package or SSP registered.',
                ],
            },
            {
                h: 'Certificates and secrets',
                kind: 'evidence',
                steps: [
                    '**AD CS issuance log** for the entire window — every certificate capable of authentication, and whether its subject matches its requester.',
                    '**Certificate templates and CA configuration** — changes, ACLs, `EDITF_ATTRIBUTESUBJECTALTNAME2`, `ManageCA` holders.',
                    '**NTAuth store** — any CA certificate published there that you did not put there.',
                    '**krbtgt** — password age, and whether the double reset has actually been completed and replicated.',
                    '**`AZUREADSSOACC$`** — password age. This is the most-missed item on the entire list in hybrid environments.',
                    '**Service and computer account passwords** for Tier 0, and gMSA where implicated.',
                    '**DSRM password** on every DC, and whether `DsrmAdminLogonBehavior` has been set to allow network logon — a classic quiet backdoor.',
                ],
            },
            {
                h: 'How to sign it off',
                kind: 'note',
                steps: [
                    'Record, per item: who checked it, when, what tool, and what the result was. "Checked" without a name and a timestamp is not a control.',
                    'Re-run the whole sweep **24 hours** and **7 days** after eradication. Persistence that re-establishes itself is the clearest possible signal that you missed something.',
                    'If you cannot complete this list with confidence — because of retention gaps, tooling gaps or scale — that is the honest trigger for a forest rebuild.',
                ],
            },
        ],
        queries: [
            { label: 'Shadow credentials written to directory objects', lang: 'PowerShell · AD', q: 'Get-ADObject -LDAPFilter "(msDS-KeyCredentialLink=*)" `\n  -Properties msDS-KeyCredentialLink, whenChanged, objectClass |\n  Select-Object Name, objectClass, whenChanged,\n                @{n="KeyCount";e={ $_."msDS-KeyCredentialLink".Count }} |\n  Sort-Object whenChanged -Descending' },
            { label: 'Objects changed in the incident window', lang: 'PowerShell · AD', q: '$since = (Get-Date).AddDays(-45)\nGet-ADObject -Filter { whenChanged -gt $since } `\n  -Properties whenChanged, whenCreated, objectClass, adminCount |\n  Where-Object { $_.objectClass -in @("user","computer","group","groupPolicyContainer") } |\n  Sort-Object whenChanged -Descending |\n  Select-Object -First 200 Name, objectClass, whenCreated, whenChanged, adminCount' },
        ],
        terms: ['acl-abuse', 'sidhistory', 'krbtgt', 'adcs-esc', 'gpo-abuse', 'delegation', 'seamless-sso', 'persistence', 'eradication'],
        defend: ['ad-monitoring', 'ad-tiering', 'ad-recovery-prep'],
        plays: ['pro-ad-tier0', 'pro-entra-persistence', 'pro-ad-golden'],
        keys: 'ad persistence checklist eradication sweep sidhistory shadow credentials adminsdholder dsrm backdoor skeleton key rbcd certificate persistence verify clean',
    },

    /* ------------------------------------------------------- ENTRA: ADMIN -- */
    {
        id: 'pro-entra-admin',
        aud: 'pro',
        cat: 'directory',
        title: 'A privileged Entra ID role was compromised',
        glyph: '👑',
        urgency: 'critical',
        clock: 'Cloud persistence is created in seconds and survives password resets. Revoke, then hunt persistence, then reset — in that order.',
        lede: 'A Global Administrator, or any of the roles that reach it in one step, is now in hostile hands. The instinct is to reset the password; that alone achieves almost nothing, because the tokens are still valid and because the real persistence is in applications, federation and role assignments, none of which care about passwords.',
        signs: [
            'A role assignment you did not make, or a PIM eligibility added quietly.',
            'A privileged sign-in from an unfamiliar ASN, an unmanaged device, or with no MFA interaction.',
            'A credential added to a service principal, or consent granted to an unfamiliar application.',
            'Domain federation settings changed, or a new domain added to the tenant.',
            'A break-glass account used.',
            'Conditional Access policies modified, disabled, or an exclusion group suddenly gaining members.',
        ],
        sections: [
            {
                h: 'Contain — order matters more than speed',
                kind: 'first',
                steps: [
                    '**Revoke all sign-in sessions and refresh tokens** for the identity first. A password reset does not invalidate an issued token, and the token is what they are using.',
                    'Reset the password and **require re-registration of MFA**, from a trusted admin workstation.',
                    'Remove the role assignment if it was added by the attacker; if it is a legitimate assignment on a compromised admin, remove it temporarily.',
                    'Audit **every authentication method** on the account and remove anything registered outside a known-good window. A new MFA method is the attacker keeping the door open.',
                    'Check whether the account made themselves **PIM-eligible** rather than active. Eligibility is quieter and is routinely overlooked.',
                    'Verify your **break-glass accounts** are intact, uncompromised and still excluded from Conditional Access before you change any policy — you must not lock yourself out mid-incident.',
                    'Do **not** stop here. Everything above can be undone by persistence created in the first five minutes of the intrusion.',
                ],
            },
            {
                h: 'Hunt the persistence — this is the real work',
                kind: 'do',
                steps: [
                    '**Service principal and app registration credentials** — any client secret or certificate added during the window, on any application. This is the single most common cloud persistence.',
                    '**Consent grants** — delegated and application permissions, especially `Mail.*`, `Files.*`, `Directory.ReadWrite.All`, `RoleManagement.ReadWrite.Directory`, `AppRoleAssignment.ReadWrite.All`.',
                    '**Application owners** added — an owner can add credentials later, so ownership is a privilege.',
                    '**Federation and domains** — `Set domain authentication`, `Set federation settings`, any domain added or verified. This is Golden SAML and it bypasses everything.',
                    '**Role assignments and PIM eligibility** across all roles, including scoped assignments in administrative units.',
                    '**Conditional Access** — new, modified, disabled or report-only-ed policies, and membership changes in every exclusion group.',
                    '**Authentication methods policy** and **cross-tenant access settings** changes.',
                    '**Guest invitations** and new B2B accounts, especially any holding a role.',
                    '**Device registrations** added to satisfy compliance-based policies.',
                    '**Partner / GDAP relationships** newly established.',
                    '**Mailbox rules, forwarding and delegation** on the admin’s mailbox and on any mailbox they touched.',
                ],
            },
            {
                h: 'Scope the blast radius',
                kind: 'do',
                steps: [
                    'A Global Administrator can enable **"Access management for Azure resources"** and take ownership of every Azure subscription. Check that toggle and check for new role assignments at the root management group.',
                    'Enumerate what was actually accessed: Graph activity logs, Unified Audit Log for mailbox and file access, and any mass export or eDiscovery search created.',
                    'Check whether **Intune** or Configuration Manager was used to push scripts — that is cloud-to-endpoint code execution and turns this into an endpoint incident too.',
                    'If the tenant is hybrid, work the hybrid pivot playbook: the cloud compromise may have already reached on-prem, or come from it.',
                    'Record the awareness timestamp in writing. Regulatory clocks run from it.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Move every privileged role into **PIM** with no standing assignments, requiring approval, justification and phishing-resistant MFA to activate.',
                    'Require **FIDO2 or certificate-based authentication** for all administrative roles. This is the control that would most likely have prevented the original compromise.',
                    'Ensure cloud admin identities are **cloud-only and not synced** from on-premises.',
                    'Protect break-glass and executive accounts with a **restricted management administrative unit**.',
                    'Restrict user consent, restrict application registration, and enable the admin consent workflow.',
                    'Alert on every item in the persistence list above. Most of these events are rare in a healthy tenant and therefore make excellent, quiet alerts.',
                ],
            },
        ],
        queries: [
            { label: 'Privileged role assignments and PIM changes', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(30d)\n| where OperationName has_any ("Add member to role", "Add eligible member to role",\n                              "Add scoped member to role", "Update role setting",\n                              "Add member to role completed (PIM activation)")\n| extend Actor  = tostring(InitiatedBy.user.userPrincipalName)\n| extend Target = tostring(TargetResources[0].userPrincipalName)\n| extend Role   = tostring(TargetResources[0].displayName)\n| project TimeGenerated, OperationName, Actor, Target, Role, Result\n| order by TimeGenerated asc' },
            { label: 'Credentials added to applications or service principals', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(90d)\n| where OperationName in ("Update application – Certificates and secrets management",\n                         "Update service principal", "Add service principal credentials",\n                         "Update application")\n| extend App   = tostring(TargetResources[0].displayName)\n| extend Actor = tostring(InitiatedBy.user.userPrincipalName)\n| mv-expand Mod = TargetResources[0].modifiedProperties\n| where tostring(Mod.displayName) has_any ("KeyDescription", "PasswordCredentials", "KeyCredentials")\n| project TimeGenerated, App, Actor, NewValue = tostring(Mod.newValue)\n| order by TimeGenerated asc' },
            { label: 'Federation or domain changes — always investigate', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(180d)\n| where OperationName has_any ("Set domain authentication", "Set federation settings on domain",\n                              "Add unverified domain", "Verify domain", "Add domain to company",\n                              "Update domain")\n| extend Actor = tostring(InitiatedBy.user.userPrincipalName)\n| project TimeGenerated, OperationName, Actor, TargetResources, Result\n| order by TimeGenerated asc' },
        ],
        terms: ['entra-roles', 'entra-id', 'service-principal', 'golden-saml', 'pim', 'conditional-access', 'admin-units', 'session-hijacking'],
        defend: ['entra-hardening', 'hybrid-hardening', 'ad-monitoring'],
        plays: ['pro-entra-persistence', 'pro-entra-app', 'pro-entra-federation', 'pro-hybrid-pivot'],
        keys: 'global administrator compromised entra admin compromise privileged role azure ad admin hacked tenant compromise revoke tokens pim eligibility persistence cloud',
    },

    /* --------------------------------------------------------- ENTRA: APPS -- */
    {
        id: 'pro-entra-app',
        aud: 'pro',
        cat: 'directory',
        title: 'A malicious application or service principal credential',
        glyph: '🤖',
        urgency: 'critical',
        clock: 'App credentials do not expire when you reset a password, do not prompt for MFA, and are rarely reviewed. This can run for months.',
        lede: 'The quietest durable access in Microsoft 365. Rather than keeping a user account, the adversary attaches a certificate or secret to an application — often one that already exists and is already trusted — and reads mail or files through Graph with no user sign-in event anywhere.',
        signs: [
            'A client secret or certificate added to an existing application, especially an old one nobody owns.',
            'Consent granted to an application with mail, file or directory scopes, particularly one with a low global consent count.',
            'A new **workload identity federation** credential on an app registration — no secret is stored at all, which makes it very stealthy.',
            'Service principal sign-ins from unusual infrastructure (`AADServicePrincipalSignInLogs` — a separate table that many teams never look at).',
            'A new owner added to an application, or a new service principal created outside a change window.',
            'High-volume Graph activity from an application that has never behaved that way.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Remove the malicious credential — the specific secret, certificate or federated credential — rather than deleting the whole application if it is a legitimate app that was abused. Preserve the object for investigation.',
                    'If the application itself is attacker-created: **revoke its consent, disable the service principal, then delete it**, in that order.',
                    '**Revoke refresh tokens** for the service principal. Removing a secret stops new tokens; it does not always kill issued ones.',
                    'Remove any attacker-added **owners** — an owner can simply add a new credential tomorrow.',
                    'Revoke the app role assignments and delegated grants that gave it reach.',
                    'Check for sibling applications sharing the same reply URL, publisher, certificate thumbprint or creation timestamp. They rarely create just one.',
                ],
            },
            {
                h: 'Investigate what it reached',
                kind: 'do',
                steps: [
                    'Read the **Graph activity logs** for that service principal: what it called, how often, and against which objects. This is the difference between "it had permission" and "it read everything".',
                    'Cross-reference with the **Unified Audit Log** for mailbox and file access performed by the application identity.',
                    'Establish the exact permission set. Application permissions require no user and are tenant-wide — `Mail.Read` on an app registration means every mailbox.',
                    'Determine when the credential was added and by whom. That account is compromised, and its own compromise is now the incident.',
                    'Assume everything within the permission scope was accessed unless the logs prove otherwise, and say so in those words in the report.',
                ],
            },
            {
                h: 'Sweep every other application',
                kind: 'evidence',
                steps: [
                    'List **all** service principals with application permissions to mail, files or the directory. For each: owner, last used, credential expiry, and whether it could escalate.',
                    'Look for credentials with implausibly long lifetimes — a secret expiring in 2099 was not created by your change process.',
                    'Look for applications with **no owner**, or owners who have left the organisation.',
                    'Check for `RoleManagement.ReadWrite.Directory` and `AppRoleAssignment.ReadWrite.All` anywhere. Either of those means that application can make itself Global Admin.',
                    'Check **multi-tenant** applications from external publishers, and whether you would notice if the publisher were compromised.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Restrict who can **register applications** and who can **consent** to them; enable the admin consent workflow so requests go somewhere a human reviews.',
                    'Prefer **certificates or managed identities over client secrets**, and cap credential lifetimes with policy.',
                    'Run a scheduled review of application permissions, owners and credentials — quarterly, with named sign-off.',
                    'Export `AADServicePrincipalSignInLogs` and Graph activity logs to your SIEM. If you only monitor user sign-ins, this entire attack class is invisible to you.',
                    'Alert on: credential added to any service principal · consent to mail/file/directory scopes · new owner on an application · first-seen service principal sign-in location.',
                    'Apply Conditional Access for workload identities where licensing permits, so an application credential cannot be used from arbitrary infrastructure.',
                ],
            },
        ],
        queries: [
            { label: 'Consent grants with high-impact scopes', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(90d)\n| where OperationName has_any ("Consent to application", "Add delegated permission grant",\n                              "Add app role assignment to service principal")\n| extend App   = tostring(TargetResources[0].displayName)\n| extend Actor = tostring(InitiatedBy.user.userPrincipalName)\n| extend Perms = tostring(TargetResources[0].modifiedProperties)\n| where Perms has_any ("Mail.", "Files.", "Sites.", "Directory.ReadWrite",\n                      "RoleManagement.ReadWrite", "AppRoleAssignment.ReadWrite",\n                      "User.ReadWrite.All", "offline_access")\n| project TimeGenerated, App, Actor, Perms\n| order by TimeGenerated asc' },
            { label: 'Service principal sign-ins from new infrastructure', lang: 'KQL · Sentinel', q: 'AADServicePrincipalSignInLogs\n| where TimeGenerated > ago(30d)\n| where ResultType == 0\n| summarize FirstSeen = min(TimeGenerated), Count = count()\n          by ServicePrincipalName, IPAddress,\n             Country = tostring(parse_json(LocationDetails).countryOrRegion)\n| where FirstSeen > ago(7d)\n| order by FirstSeen desc' },
            { label: 'Applications with long-lived secrets', lang: 'PowerShell · Microsoft Graph', q: 'Connect-MgGraph -Scopes "Application.Read.All"\nGet-MgApplication -All |\n  ForEach-Object {\n    $app = $_\n    $app.PasswordCredentials + $app.KeyCredentials | ForEach-Object {\n      if ($_) {\n        [pscustomobject]@{\n          App     = $app.DisplayName\n          AppId   = $app.AppId\n          Type    = if ($_.Key) { "Certificate" } else { "Secret" }\n          Start   = $_.StartDateTime\n          Expires = $_.EndDateTime\n          Years   = [math]::Round((($_.EndDateTime - $_.StartDateTime).Days / 365), 1)\n        }\n      }\n    }\n  } | Where-Object { $_.Years -gt 2 } | Sort-Object Years -Descending' },
        ],
        terms: ['service-principal', 'oauth-consent', 'entra-roles', 'entra-id', 'ual', 'eradication'],
        defend: ['entra-hardening', 'ad-monitoring', 'org-identity'],
        plays: ['pro-entra-admin', 'pro-entra-persistence', 'pro-oauth-grant'],
        keys: 'malicious app registration service principal credential added client secret backdoor oauth application permissions mail.read tenant wide graph abuse workload identity federation',
    },

    /* ---------------------------------------------------- ENTRA: FEDERATION */
    {
        id: 'pro-entra-federation',
        aud: 'pro',
        cat: 'directory',
        title: 'Federation or domain settings were changed (Golden SAML)',
        glyph: '🏅',
        urgency: 'critical',
        clock: 'While a hostile signing key is trusted, every account in the tenant is impersonable and MFA is irrelevant. This outranks almost everything.',
        lede: 'If an attacker controls a signing key your tenant trusts, they can assert that they are anyone, that MFA was performed, and the cloud will believe it. No password is used, so no password reset helps, and the sign-in logs look ordinary. This is among the most severe findings possible in Entra ID.',
        signs: [
            'Audit events: `Set domain authentication`, `Set federation settings on domain`, `Add unverified domain`, `Verify domain`, `Update domain`.',
            'A federated domain you do not recognise, or a managed domain converted to federated.',
            'An ADFS compromise, or theft of the token-signing certificate or the DKM master key.',
            'Sign-ins with a federated authentication method for users who should be managed, or an MFA claim that does not match your configured methods.',
            'Successful authentication for accounts that have not been used in months, from unfamiliar infrastructure, with no password activity.',
        ],
        sections: [
            {
                h: 'Contain immediately',
                kind: 'first',
                steps: [
                    'Enumerate every domain in the tenant and its authentication type. Any federated domain that you did not deliberately create must be **removed now**.',
                    'Verify the token-signing certificate thumbprints and the `IssuerUri` for every legitimately federated domain against your own records. A changed issuer is the attack.',
                    'If ADFS is involved: **rotate the token-signing and token-decrypting certificates twice**, and rotate the DKM master key. One rotation leaves the previous certificate valid.',
                    'Revoke refresh tokens tenant-wide. Assertions already exchanged for tokens continue to work otherwise.',
                    'Consider converting affected domains to **managed authentication** if ADFS trustworthiness cannot be established quickly — it removes the entire attack surface.',
                    'Verify break-glass accounts are cloud-only, on the `.onmicrosoft.com` domain, and unaffected by any federation change.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Identify who made the change, from where, and when. Only a small set of roles can — Global Administrator, Hybrid Identity Administrator, External Identity Provider Administrator. That account is compromised.',
                    'Reconstruct what was done with the forged assertions. Sign-ins using a hostile key look legitimate, so pivot on **activity** rather than on authentication: mailbox access, file downloads, admin operations, Graph calls.',
                    'Check `ImmutableId` / `sourceAnchor` manipulation — an attacker may have set it on an account to impersonate a specific user.',
                    'If ADFS is on-premises, treat the ADFS server as fully compromised and work the on-prem Tier 0 playbook alongside this one.',
                    'Because MFA can be asserted rather than performed, **do not treat "MFA was satisfied" as evidence of anything** during this incident.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'Alert on **every** federation and domain change. These are rare, legitimate a handful of times per decade, and catastrophic when malicious — the perfect alert.',
                    'Move to **managed authentication** (password hash sync or cloud authentication) if you can, and decommission ADFS. It removes this attack class rather than monitoring it.',
                    'If ADFS must stay: it is Tier 0. Dedicated administrators, dedicated workstations, hardware protection for keys, aggressive patching, and certificate rotation on a schedule.',
                    'Restrict who holds Hybrid Identity Administrator and External Identity Provider Administrator, and put both in PIM.',
                    'Enable Conditional Access requiring compliant devices for administrative operations, so a forged assertion alone is not enough.',
                    'Record the expected federation configuration — domains, issuer URIs and certificate thumbprints — somewhere outside the tenant so you can compare during an incident.',
                ],
            },
        ],
        queries: [
            { label: 'Current domain and federation configuration', lang: 'PowerShell · Microsoft Graph', q: 'Connect-MgGraph -Scopes "Domain.Read.All"\nGet-MgDomain -All | Select-Object Id, AuthenticationType, IsVerified, IsDefault |\n  Sort-Object AuthenticationType\n\n# For each federated domain, check the signing configuration\nGet-MgDomain -All | Where-Object AuthenticationType -eq "Federated" | ForEach-Object {\n  Get-MgDomainFederationConfiguration -DomainId $_.Id |\n    Select-Object @{n="Domain";e={$_.Id}}, IssuerUri, PassiveSignInUri,\n                  SigningCertificateUpdateStatus, PreferredAuthenticationProtocol\n}' },
            { label: 'Sign-ins asserting an unexpected authentication method', lang: 'KQL · Sentinel', q: 'SigninLogs\n| where TimeGenerated > ago(30d)\n| where ResultType == 0\n| extend Methods = tostring(AuthenticationDetails)\n| where Methods has_any ("Federated", "Previously satisfied")\n| summarize Signins = count(),\n            Ips = make_set(IPAddress, 20),\n            Apps = make_set(AppDisplayName, 20)\n          by UserPrincipalName, bin(TimeGenerated, 1d)\n| order by Signins desc' },
        ],
        terms: ['golden-saml', 'entra-roles', 'entra-connect', 'entra-id', 'pim', 'containment'],
        defend: ['hybrid-hardening', 'entra-hardening', 'ad-monitoring'],
        plays: ['pro-entra-admin', 'pro-entra-persistence', 'pro-hybrid-pivot', 'pro-ad-tier0'],
        keys: 'golden saml federation changed domain added adfs compromise token signing certificate set domain authentication mfa bypass entra federation backdoor',
    },

    /* -------------------------------------------- ENTRA PERSISTENCE SWEEP -- */
    {
        id: 'pro-entra-persistence',
        aud: 'pro',
        cat: 'directory',
        title: 'The Entra ID persistence sweep',
        glyph: '🔎',
        urgency: 'critical',
        clock: 'None of these are removed by a password reset. Work the list, or the eviction is imaginary.',
        lede: 'A checklist to work item by item and sign off by name. Cloud persistence is cheap to create, invisible in a user-focused review, and indifferent to credential resets. Run this after any privileged tenant compromise, and again a week later.',
        signs: ['Any confirmed compromise of a privileged Entra role, an admin identity, or a service principal with directory permissions.'],
        sections: [
            {
                h: 'Identity and roles',
                kind: 'do',
                steps: [
                    '**Directory role assignments** — active and, crucially, **PIM eligible**. Eligibility is quieter and is routinely missed.',
                    '**Role-assignable groups** — membership and owners. Adding yourself to a group that carries a role is less visible than assigning the role.',
                    '**Administrative units** created, and role assignments scoped to them.',
                    '**Authentication methods** registered per privileged user — new phone numbers, authenticator apps, FIDO keys, Temporary Access Passes.',
                    '**Certificate-based authentication** configuration and any user certificate bindings added.',
                    '**Break-glass accounts** — used, modified, or newly excluded from something they should not be.',
                    '**New users**, especially ones resembling service accounts, and **guests** invited during the window.',
                ],
            },
            {
                h: 'Applications and delegated access',
                kind: 'do',
                steps: [
                    '**Credentials added** to any application or service principal — secrets, certificates, and federated credentials.',
                    '**Consent grants**, delegated and application, especially mail, file, directory and role-management scopes.',
                    '**Application owners** added.',
                    '**New service principals** and new app registrations.',
                    '**Cross-tenant access settings** and **cross-tenant synchronisation** configuration.',
                    '**Partner / GDAP relationships** established or extended.',
                ],
            },
            {
                h: 'Policy and trust',
                kind: 'do',
                steps: [
                    '**Conditional Access** — policies created, modified, disabled or moved to report-only, plus membership changes in every exclusion group. Attackers edit rather than delete, because deletion is noticed.',
                    '**Named locations** added — a trusted-location entry pointing at attacker infrastructure defeats location-based policy entirely.',
                    '**Domain and federation settings** — see the federation playbook; this is the highest-severity item on this page.',
                    '**Authentication methods policy** and legacy-authentication settings relaxed.',
                    '**Device registrations** added to satisfy compliance requirements, and device compliance policy changes.',
                    '**Self-service password reset** scope and **password writeback** configuration.',
                ],
            },
            {
                h: 'Data-plane leftovers',
                kind: 'evidence',
                steps: [
                    '**Mailbox rules, forwarding, delegation and "send as"** across affected mailboxes — and tenant-wide if a mail-scoped app permission was granted.',
                    '**eDiscovery searches and exports** created — a very efficient and very quiet exfiltration route for an admin.',
                    '**Sharing links and external sharing settings** in SharePoint and OneDrive.',
                    '**Teams external access** and federation settings.',
                    '**Intune configuration and scripts** deployed, plus any new device enrolment restrictions removed.',
                    '**Azure**: root management group role assignments, and whether the Global Admin elevation toggle was used.',
                ],
            },
            {
                h: 'How to sign it off',
                kind: 'note',
                steps: [
                    'Record who checked each item, when, with what query, and what the result was.',
                    'Re-run the whole sweep at **24 hours** and **7 days**. Re-appearing persistence means you missed the root.',
                    'Compare against a **known-good baseline** where you have one. If you do not have one, produce it now, at the end of this incident, while everything is fresh.',
                    'Where log retention does not cover the suspected window, write that limitation into the report explicitly rather than implying the tenant is clean.',
                ],
            },
        ],
        queries: [
            { label: 'Everything privileged that changed, in one view', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(90d)\n| where OperationName has_any (\n    "Add member to role", "Add eligible member to role", "Add scoped member to role",\n    "Consent to application", "Add app role assignment", "Add delegated permission grant",\n    "Update application", "Add service principal", "Add service principal credentials",\n    "Add owner to application", "Add owner to service principal",\n    "Set domain authentication", "Set federation settings on domain", "Add unverified domain",\n    "Add conditional access policy", "Update conditional access policy", "Delete conditional access policy",\n    "Add named location", "Update named location",\n    "User registered security info", "Admin registered security info",\n    "Add partner to company", "Create cross-tenant access setting")\n| extend Actor = coalesce(tostring(InitiatedBy.user.userPrincipalName),\n                          tostring(InitiatedBy.app.displayName))\n| project TimeGenerated, OperationName, Actor, Target = tostring(TargetResources[0].displayName), Result\n| order by TimeGenerated asc' },
            { label: 'Standing and eligible privileged assignments', lang: 'PowerShell · Microsoft Graph', q: 'Connect-MgGraph -Scopes "RoleManagement.Read.Directory","Directory.Read.All"\n\n# Active assignments\nGet-MgRoleManagementDirectoryRoleAssignment -All -ExpandProperty Principal,RoleDefinition |\n  Select-Object @{n="Role";e={$_.RoleDefinition.DisplayName}},\n                @{n="Principal";e={$_.Principal.AdditionalProperties.displayName}},\n                DirectoryScopeId\n\n# Eligible assignments — check these too, they are quieter\nGet-MgRoleManagementDirectoryRoleEligibilitySchedule -All -ExpandProperty Principal,RoleDefinition |\n  Select-Object @{n="Role";e={$_.RoleDefinition.DisplayName}},\n                @{n="Principal";e={$_.Principal.AdditionalProperties.displayName}},\n                @{n="Until";e={$_.ScheduleInfo.Expiration.EndDateTime}}' },
        ],
        terms: ['entra-roles', 'service-principal', 'golden-saml', 'conditional-access', 'pim', 'admin-units', 'cross-tenant', 'gdap', 'ual', 'persistence', 'eradication'],
        defend: ['entra-hardening', 'ad-monitoring', 'hybrid-hardening'],
        plays: ['pro-entra-admin', 'pro-entra-app', 'pro-entra-federation', 'pro-ad-persistence'],
        keys: 'entra persistence checklist cloud persistence sweep tenant eradication pim eligible app credentials consent conditional access exclusions named locations ediscovery verify tenant clean',
    },

    /* --------------------------------------------------------- HYBRID PIVOT */
    {
        id: 'pro-hybrid-pivot',
        aud: 'pro',
        cat: 'directory',
        title: 'Hybrid pivot — can they get from one directory to the other?',
        glyph: '🌉',
        urgency: 'critical',
        clock: 'Assume the pivot has already happened. Confirming it takes hours; the pivot takes minutes.',
        lede: 'The commonest failure in hybrid incidents is defending one directory and declaring victory. If the domain is compromised, the tenant is reachable; if the tenant is compromised, the domain often is too. This playbook enumerates every corridor and tells you how to close each.',
        signs: [
            'A confirmed compromise on either side of a hybrid environment.',
            'Suspicious activity on the Entra Connect server, or an unexpected Pass-through Authentication agent.',
            'Cloud sign-ins for accounts whose passwords were only ever changed on-premises, or vice versa.',
            'Intune or Configuration Manager scripts deployed outside a change window.',
            'A synced account holding a privileged cloud role.',
        ],
        sections: [
            {
                h: 'Close the on-prem → cloud routes',
                kind: 'first',
                steps: [
                    '**Entra Connect server** — treat it as a domain controller. If the domain is compromised, this server is compromised. Isolate it, then rotate the on-prem connector account and the cloud sync account credentials.',
                    '**`AZUREADSSOACC$`** — rotate its Kerberos key. Its hash forges tickets that Entra ID accepts, so until this is done the cloud is still reachable from the old domain secrets. This is the most missed step in hybrid recovery, by a wide margin.',
                    '**ADFS** — if federated, rotate the token-signing and token-decrypting certificates **twice** and rotate the DKM master key. Then verify every domain’s issuer and thumbprint.',
                    '**Pass-through Authentication agents** — enumerate every registered agent. An agent you do not recognise is silent, plaintext credential capture for every authentication.',
                    '**Synced privileged accounts** — verify no synchronised account holds a privileged cloud role. If one does, that is a live corridor; make cloud admin identities cloud-only.',
                    '**Password writeback** — a cloud-side reset writes an on-prem password. Review whether it should remain enabled during the incident.',
                ],
            },
            {
                h: 'Close the cloud → on-prem routes',
                kind: 'do',
                steps: [
                    '**Intune / Configuration Manager** — review every script, application and remediation deployed in the window. This is code execution as SYSTEM on domain-joined machines.',
                    '**Global Admin elevation to Azure** — check whether the "Access management for Azure resources" toggle was used, and audit role assignments at the root management group. From there, Run Command reaches any Azure VM, including a domain controller hosted in Azure.',
                    '**Azure Arc** — the same reach, extended to on-premises servers. Review connected machines and any run-command or extension activity.',
                    '**Hybrid-joined devices** — a compliance or configuration policy change from the cloud alters what on-prem devices do.',
                    '**Cloud Kerberos trust / Windows Hello for Business** configuration changes, which affect on-prem authentication.',
                ],
            },
            {
                h: 'Investigate both sides in parallel',
                kind: 'do',
                steps: [
                    'Build **one timeline** covering both directories. Two separate timelines is how the pivot gets missed.',
                    'Correlate on-prem account compromise with cloud sign-ins for the same identity, and vice versa.',
                    'Run **both** persistence sweeps — the AD one and the Entra one. Neither is a subset of the other.',
                    'Check whether the same infrastructure (ASN, IP, user agent, tooling) appears on both sides. It usually does, and it is the cleanest proof of a pivot.',
                    'Decide explicitly, in writing, whether each directory is trustworthy. "Probably fine" is not a decision.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'The rule that closes most of this: **cloud admin identities are never synced from on-premises, and on-prem Tier 0 identities are never administered from the cloud.**',
                    'Put the Entra Connect server in the Tier 0 OU with Tier 0 administrators, or move to **Entra Cloud Sync** and remove the server entirely.',
                    'Rotate `AZUREADSSOACC$` on a schedule and add it to the standard incident checklist.',
                    'Migrate off ADFS to managed authentication where possible. It deletes the Golden SAML risk rather than monitoring it.',
                    'Restrict who can deploy from Intune and Configuration Manager, and treat those consoles as Tier 0.',
                    'Alert on: federation changes · new PTA agents · new Connect installations · Directory Synchronization Accounts role assignment · Azure elevation toggle use.',
                ],
            },
        ],
        queries: [
            { label: 'Synced accounts holding privileged cloud roles', lang: 'PowerShell · Microsoft Graph', q: 'Connect-MgGraph -Scopes "RoleManagement.Read.Directory","Directory.Read.All"\nGet-MgRoleManagementDirectoryRoleAssignment -All -ExpandProperty Principal,RoleDefinition |\n  ForEach-Object {\n    $upn = $_.Principal.AdditionalProperties.userPrincipalName\n    if ($upn) {\n      $u = Get-MgUser -UserId $upn -Property OnPremisesSyncEnabled,UserPrincipalName -ErrorAction SilentlyContinue\n      if ($u.OnPremisesSyncEnabled) {\n        [pscustomobject]@{ Role = $_.RoleDefinition.DisplayName; User = $upn; Synced = $true }\n      }\n    }\n  }' },
            { label: 'Hybrid bridge configuration changes', lang: 'KQL · Sentinel', q: 'AuditLogs\n| where TimeGenerated > ago(180d)\n| where OperationName has_any ("Set domain authentication", "Set federation settings on domain",\n                              "Set Company Information", "Enable Seamless SSO",\n                              "Register connector", "Create application proxy",\n                              "Add member to role")\n     or tostring(TargetResources) has_any ("Directory Synchronization Accounts",\n                                           "Hybrid Identity Administrator",\n                                           "AZUREADSSOACC")\n| extend Actor = tostring(InitiatedBy.user.userPrincipalName)\n| project TimeGenerated, OperationName, Actor, TargetResources, Result\n| order by TimeGenerated asc' },
        ],
        terms: ['entra-connect', 'seamless-sso', 'golden-saml', 'entra-roles', 'device-join', 'tier0', 'containment'],
        defend: ['hybrid-hardening', 'entra-hardening', 'ad-tiering'],
        plays: ['pro-ad-tier0', 'pro-entra-admin', 'pro-entra-federation', 'pro-ad-persistence', 'pro-entra-persistence'],
        keys: 'hybrid pivot on prem to cloud cloud to on prem entra connect compromised azureadssoacc rotate adfs pta agent intune deployment azure elevation lateral movement between directories',
    },
);

/* ========================================================================== */
/* ================================ TREES =================================== */
/* ========================================================================== */

window.BL_TREES.push(

    /* ---------------------------------------------------- MASTER: DIRECTORY */
    {
        id: 'pro-dir',
        aud: 'pro',
        title: 'Directory incident — Active Directory and Entra ID',
        glyph: '🏛',
        lede: 'Start here for anything touching the corporate identity plane. Three or four questions gets you to the right containment order — which, in directory incidents, matters more than speed.',
        keys: 'active directory incident entra id incident directory triage domain controller alert tenant alert where do i start ad entra soc identity attack',
        start: 'q-where',
        nodes: {
            'q-where': {
                q: 'Which directory is the signal in?',
                hint: 'If you are hybrid and unsure, answer for where the alert fired — you will be routed to check the other side regardless.',
                options: [
                    { a: 'On-premises Active Directory', to: 'q-ad-signal' },
                    { a: 'Microsoft Entra ID (the cloud tenant)', to: 'q-entra-signal' },
                    { a: 'Both, or I cannot tell yet', to: 'r-hybrid' },
                    { a: 'I do not know what we run', to: 'r-identify' },
                ],
            },
            'q-ad-signal': {
                q: 'What did you actually see on-premises?',
                options: [
                    { a: 'Replication by something that is not a domain controller', to: 'r-dcsync' },
                    { a: 'A new or unexpected member of a privileged group', to: 'q-ad-priv' },
                    { a: 'Kerberos anomalies — roasting, odd tickets, encryption downgrade', to: 'q-ad-kerb' },
                    { a: 'A Group Policy Object was created or modified', to: 'r-gpo' },
                    { a: 'Certificate services activity — a template change or an odd certificate', to: 'r-adcs' },
                    { a: 'A domain controller was coerced into authenticating somewhere', to: 'r-relay' },
                    { a: 'Credential dumping — LSASS access, ntdsutil, shadow copies', to: 'r-dump' },
                    { a: 'A permissions or attribute change I do not understand', to: 'q-ad-attr' },
                    { a: 'Backups tampered with, or mass encryption starting', to: 'r-ransom' },
                ],
            },
            'q-ad-priv': {
                q: 'Was the change made by an account that legitimately holds that power?',
                hint: 'Check the change ticket first. Roughly half of these alerts are an administrator doing their job badly rather than an attacker.',
                options: [
                    { a: 'No — or the actor is itself suspicious', to: 'r-tier0' },
                    { a: 'Yes, but it was not authorised or ticketed', to: 'r-unauth' },
                    { a: 'Yes and it is documented — this is a false positive', to: 'r-tune' },
                ],
            },
            'q-ad-kerb': {
                q: 'Which Kerberos anomaly?',
                options: [
                    { a: 'Many service ticket requests from one account (4769 burst)', to: 'r-roast' },
                    { a: 'A ticket request with pre-authentication type 0 (4768)', to: 'r-roast' },
                    { a: 'A service ticket with no preceding TGT request', to: 'r-golden' },
                    { a: 'A logon on a server with no matching DC ticket event', to: 'r-silver' },
                    { a: 'RC4 where we require AES', to: 'r-roast' },
                ],
            },
            'q-ad-attr': {
                q: 'Which attribute or permission changed?',
                hint: 'Each of these is a known privilege-escalation or persistence primitive. None of them are routine.',
                options: [
                    { a: 'sIDHistory was written to an account', to: 'r-sidhistory' },
                    { a: 'msDS-KeyCredentialLink (shadow credentials)', to: 'r-shadowcred' },
                    { a: 'msDS-AllowedToActOnBehalfOfOtherIdentity (RBCD)', to: 'r-relay' },
                    { a: 'Replication rights were granted to a principal', to: 'r-dcsync' },
                    { a: 'An ACL on the domain root, AdminSDHolder or a Tier 0 OU', to: 'r-acl' },
                    { a: 'A delegation flag on a computer or user object', to: 'r-acl' },
                ],
            },
            'q-entra-signal': {
                q: 'What did you actually see in the tenant?',
                options: [
                    { a: 'A privileged role assigned, or PIM eligibility added', to: 'q-entra-role' },
                    { a: 'A credential added to an app registration or service principal', to: 'r-app' },
                    { a: 'Consent granted to an application', to: 'r-app' },
                    { a: 'Domain or federation settings changed', to: 'r-federation' },
                    { a: 'A Conditional Access policy created, changed or disabled', to: 'r-ca' },
                    { a: 'A break-glass account was used', to: 'r-breakglass' },
                    { a: 'A suspicious sign-in — impossible travel, no MFA, unfamiliar device', to: 'r-signin' },
                    { a: 'A new MFA or authentication method registered', to: 'r-authmethod' },
                    { a: 'Guest, cross-tenant or partner access changed', to: 'r-guest' },
                ],
            },
            'q-entra-role': {
                q: 'Which role, and was it authorised?',
                options: [
                    { a: 'Global Admin, Privileged Role Admin or Privileged Auth Admin — unauthorised', to: 'r-entra-admin' },
                    { a: 'Application Admin, Hybrid Identity Admin or Intune Admin — unauthorised', to: 'r-entra-admin' },
                    { a: 'Any role, assigned to a guest or an external identity', to: 'r-guest' },
                    { a: 'Authorised and ticketed, but permanently rather than through PIM', to: 'r-standing' },
                ],
            },

            /* ---- results ---- */
            'r-tier0': {
                result: 'Treat as Tier 0 compromise — do not improvise',
                tag: 'critical',
                steps: [
                    'Declare formally, move to an out-of-band channel, and start a written timeline now.',
                    '**Protect the backups first.** Disconnect, make immutable, verify they restore.',
                    'Preserve evidence and isolate — do **not** power off, and do **not** start piecemeal password resets. Uncoordinated containment warns the adversary and destroys the timeline.',
                    'Engage external DFIR, legal, insurer and leadership before technical decisions narrow your options.',
                ],
                link: '#/play/pro-ad-tier0',
            },
            'r-dcsync': {
                result: 'Every hash in the domain is disclosed',
                tag: 'critical',
                steps: [
                    'Confirm the caller and the source host, then rule out the legitimate replicators — DCs and the Entra Connect sync account.',
                    'If the caller is legitimate but the host is wrong, the sync account was stolen: treat the Entra Connect server as compromised.',
                    'Plan a staged domain-wide reset, and the krbtgt double reset. Do not rotate krbtgt in isolation.',
                    'Rotate `AZUREADSSOACC$` too — in a hybrid tenant this is a cloud incident as well.',
                ],
                link: '#/play/pro-ad-dcsync',
            },
            'r-dump': {
                result: 'Credential theft on a domain controller',
                tag: 'critical',
                steps: [
                    'Isolate the host, preserve memory first — do not shut it down.',
                    'Assume the whole directory database was taken, whether or not you can prove exfiltration.',
                    'Escalate to the Tier 0 playbook and begin the persistence sweep in parallel.',
                    'Every credential used on that host is disclosed, including the ones used to investigate it. Use a clean admin workstation.',
                ],
                link: '#/play/pro-ad-dcsync',
            },
            'r-golden': {
                result: 'Forged TGT suspected — plan the double reset',
                tag: 'critical',
                steps: [
                    'Confirm Tier 0 is evicted **before** touching krbtgt, or they simply take the new key.',
                    'Complete the persistence sweep first — krbtgt is one door of many.',
                    'Reset krbtgt twice, with full replication convergence plus maximum ticket lifetime between them. Back-to-back resets cause a domain-wide authentication outage.',
                    'Rotate trust passwords and `AZUREADSSOACC$` as part of the same operation.',
                ],
                link: '#/play/pro-ad-golden',
            },
            'r-silver': {
                result: 'Forged service ticket — krbtgt will not fix this',
                tag: 'critical',
                steps: [
                    'Silver Tickets are signed with a service or computer account hash, not krbtgt. Rotating krbtgt does nothing.',
                    'Identify the target service, then reset that service or computer account password.',
                    'There is no DC-side evidence — hunt at the service: logon events with no matching ticket request on any DC.',
                    'The hash came from somewhere. Find the credential theft that preceded it.',
                ],
                link: '#/play/pro-ad-golden',
            },
            'r-roast': {
                result: 'Offline cracking is already under way',
                tag: 'high',
                steps: [
                    'Extract the exact list of SPNs or accounts requested from the events — that list is your rotation scope, do not guess it.',
                    'Any requested account in a privileged group is a Tier 0 incident right now.',
                    'Rotate every requested account to a 25+ character password, or migrate to gMSA.',
                    'Clear `DONT_REQUIRE_PREAUTH` everywhere and disable RC4 for Kerberos.',
                ],
                link: '#/play/pro-ad-roast',
            },
            'r-gpo': {
                result: 'Unlink first, investigate second',
                tag: 'critical',
                steps: [
                    'Unlink the GPO immediately — faster, safer and more reversible than deleting. Do not delete it; it is evidence.',
                    'Work out which machines already applied it (default refresh is 90 minutes) and hunt the payload there.',
                    'Unlinking does **not** remove what was deployed. Scheduled tasks, services and local group changes persist.',
                    'If it was linked to the Domain Controllers OU or the domain root, escalate to Tier 0 immediately.',
                ],
                link: '#/play/pro-ad-gpo',
            },
            'r-adcs': {
                result: 'Certificates outlive every password reset',
                tag: 'critical',
                steps: [
                    'Pull the CA issuance database for the whole window and revoke every certificate capable of authentication that you cannot account for.',
                    'Unpublish or fix the vulnerable template so nothing further can be issued.',
                    'Resetting the impersonated account’s password does **not** invalidate the certificate. Revocation does.',
                    'Check the NTAuth store for a CA certificate you did not put there.',
                ],
                link: '#/play/pro-adcs-abuse',
            },
            'r-relay': {
                result: 'Coercion and relay — assume the relay succeeded',
                tag: 'critical',
                steps: [
                    'Establish where it was relayed to: AD CS (ESC8), LDAP (RBCD), or SMB.',
                    'If AD CS: revoke certificates issued in that window. If LDAP: check every computer object for a new `msDS-AllowedToActOnBehalfOfOtherIdentity`.',
                    'Reset the coerced machine’s computer account password — twice for a domain controller.',
                    'Fix the relay, not the coercion: LDAP signing and channel binding, SMB signing, EPA on web enrolment, `MachineAccountQuota = 0`.',
                ],
                link: '#/play/pro-ad-relay',
            },
            'r-sidhistory': {
                result: 'Invisible privilege — check the RID',
                tag: 'critical',
                steps: [
                    'Check whether the written SID ends in a privileged RID: `-512`, `-518`, `-519`, `-516`, `-498`, `-520`.',
                    'If it does, that account is effectively privileged and no group-membership review would ever find it.',
                    'Only something with directory write access can do this — treat it as a Tier 0 event and find the actor.',
                    'Clear the value, audit `sIDHistory` across every object, and enable SID filtering on trusts that do not need it.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-shadowcred': {
                result: 'Shadow credentials — certificate authentication as that object',
                tag: 'critical',
                steps: [
                    'A key written to `msDS-KeyCredentialLink` lets the holder authenticate as that user or computer, indefinitely.',
                    'Remove the key, then reset the object’s password — and if it is a computer, reset it twice.',
                    'Find who could write that attribute; that ACL is the actual vulnerability.',
                    'Sweep every object in the directory for this attribute, not just the one that alerted.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-acl': {
                result: 'Permissions are attack paths — graph them',
                tag: 'critical',
                steps: [
                    'Dangerous rights: `GenericAll`, `GenericWrite`, `WriteDACL`, `WriteOwner`, `AllExtendedRights`, `ForceChangePassword`.',
                    'Run a graphing tool and compare paths to Tier 0 against a known-good baseline. A list of group memberships will never find these.',
                    'Check the domain root, AdminSDHolder, the Domain Controllers OU, Tier 0 GPOs and the certificate templates container.',
                    'If the change was recent and unauthorised, treat the actor as compromised and escalate.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-unauth': {
                result: 'Authorised power, unauthorised use — treat as compromise until proven otherwise',
                tag: 'high',
                steps: [
                    'Contact the account holder **out of band** — phone, not email or Teams.',
                    'If they did not do it, their identity is compromised: revoke sessions, reset, audit authentication methods.',
                    'If they did do it, you have a change-control problem, which is worth fixing but is not an incident.',
                    'Either way, reverse the change unless there is a documented reason to keep it.',
                ],
                link: '#/play/pro-user-clicked',
            },
            'r-tune': {
                result: 'False positive — make it not happen again',
                tag: 'ok',
                steps: [
                    'Record the legitimate actor in the rule’s allow-list, by name, with an owner and a review date.',
                    'Do not simply lower the severity. A muted alert is a deleted alert with extra steps.',
                    'Check whether the legitimate process could be made narrower — most "expected" privileged activity should not be routine.',
                    'Track your false-positive rate per rule so you can tell tuning from blindness.',
                ],
                link: '#/defend/ad-monitoring',
            },
            'r-ransom': {
                result: 'Pre-ransomware staging — you still have hours',
                tag: 'critical',
                steps: [
                    'Backup tampering and security-tooling changes are the last stage before encryption. Act as though it starts in the next hour.',
                    'Protect the backups first, then isolate, then disable the identities and remote-access paths in use.',
                    'Assume domain admin. Work the Tier 0 playbook alongside the ransomware one.',
                    'Move to the out-of-band channel before you coordinate anything.',
                ],
                link: '#/play/pro-ransomware',
            },
            'r-entra-admin': {
                result: 'Revoke tokens first, then hunt persistence, then reset',
                tag: 'critical',
                steps: [
                    'Revoke all sessions and refresh tokens **before** the password reset — the token is what they are using.',
                    'Check PIM **eligibility**, not just active assignments. Eligibility is quieter and is routinely missed.',
                    'Then work the full Entra persistence sweep. Everything you just did is undone by an app credential added in minute five.',
                    'Verify your break-glass accounts are intact before you change any Conditional Access policy.',
                ],
                link: '#/play/pro-entra-admin',
            },
            'r-app': {
                result: 'Application persistence — survives every password reset',
                tag: 'critical',
                steps: [
                    'Remove the specific credential rather than deleting a legitimate application, and preserve the object.',
                    'Revoke the service principal’s refresh tokens as well — removing a secret stops new tokens, not issued ones.',
                    'Remove attacker-added **owners**, or they add a new credential tomorrow.',
                    'Read the Graph activity logs for that principal. Permission granted is not the same as data read, and you need to know which.',
                ],
                link: '#/play/pro-entra-app',
            },
            'r-federation': {
                result: 'Highest severity in the tenant — every identity is impersonable',
                tag: 'critical',
                steps: [
                    'List every domain and its authentication type. Remove any federated domain you did not deliberately create, now.',
                    'Verify issuer URIs and token-signing thumbprints against your own records.',
                    'If ADFS is involved, rotate token-signing and decrypting certificates **twice**, plus the DKM master key.',
                    'During this incident, "MFA was satisfied" proves nothing — the assertion can claim it.',
                ],
                link: '#/play/pro-entra-federation',
            },
            'r-ca': {
                result: 'Policy change is a control change — treat it as privileged',
                tag: 'critical',
                steps: [
                    'Attackers edit and exclude rather than delete, because deletion is noticed. Check exclusion-group membership as carefully as the policy.',
                    'Check for a new **named location** — a trusted-location entry pointing at attacker infrastructure defeats location policy entirely.',
                    'Check for policies quietly moved to report-only. Report-only enforces nothing.',
                    'Restore from your exported baseline, verify break-glass exclusions still hold, and find the actor.',
                ],
                link: '#/play/pro-entra-persistence',
            },
            'r-breakglass': {
                result: 'Either a disaster or an incident — never routine',
                tag: 'critical',
                steps: [
                    'Confirm out of band whether a human deliberately used it, and why.',
                    'If unexplained, treat the tenant as compromised at the highest level and work the privileged-role playbook.',
                    'Rotate the credential regardless of the outcome, and re-seal it.',
                    'Review why normal administrative access was insufficient — a break-glass used for convenience means your PIM configuration is wrong.',
                ],
                link: '#/play/pro-entra-admin',
            },
            'r-signin': {
                result: 'Corroborate before containing, then contain properly',
                tag: 'high',
                steps: [
                    'Decide on the combination, not the geography: unfamiliar ASN **plus** new device **plus** no MFA interaction.',
                    '"MFA satisfied by a claim in the token" alongside impossible travel is the token-theft signature.',
                    'Contact the user out of band before disabling, unless the evidence is already conclusive.',
                    'If real: revoke sessions and tokens first, then reset, then audit authentication methods and consent grants.',
                ],
                link: '#/play/pro-impossible-travel',
            },
            'r-authmethod': {
                result: 'A new factor is the attacker holding the door open',
                tag: 'critical',
                steps: [
                    'A method registered shortly after an atypical sign-in means the account was accessed, not merely attempted.',
                    'Remove the method, revoke sessions, reset the password, then re-enrol under supervision.',
                    'Check whether the helpdesk performed an assisted reset — social-engineering the service desk is a well-worn route in.',
                    'Also check for a Temporary Access Pass issued, which is the same technique with a different name.',
                ],
                link: '#/play/pro-mfa-anomaly',
            },
            'r-guest': {
                result: 'External identity with internal power',
                tag: 'high',
                steps: [
                    'A guest can hold a directory role. Enumerate role assignments **including** external identities — this is a genuine and regularly missed finding.',
                    'Review cross-tenant access settings, especially anything that trusts another tenant’s MFA.',
                    'Remove the assignment, then review every guest with any role or elevated group membership.',
                    'Turn on access reviews so stale guests expire without anyone having to remember.',
                ],
                link: '#/play/pro-entra-persistence',
            },
            'r-standing': {
                result: 'Not an incident, but fix it this week',
                tag: 'ok',
                steps: [
                    'A permanent privileged assignment is a standing target. Convert it to a PIM eligible assignment.',
                    'Require approval, justification and phishing-resistant MFA to activate, with a short maximum duration.',
                    'Audit for other standing assignments while you are here; there are usually several.',
                    'Keep exactly two break-glass accounts outside PIM, and alert on their use.',
                ],
                link: '#/defend/entra-hardening',
            },
            'r-hybrid': {
                result: 'Work both sides on one timeline',
                tag: 'critical',
                steps: [
                    'Assume the pivot has already happened. Confirming it takes hours; performing it takes minutes.',
                    'Close the on-prem → cloud corridors: Entra Connect, `AZUREADSSOACC$`, ADFS keys, PTA agents, synced admin accounts.',
                    'Close the cloud → on-prem corridors: Intune and Configuration Manager deployment, Azure elevation, Arc, password writeback.',
                    'Run **both** persistence sweeps. Neither is a subset of the other.',
                ],
                link: '#/play/pro-hybrid-pivot',
            },
            'r-identify': {
                result: 'Find out what you have before you touch anything',
                tag: 'ok',
                steps: [
                    'Check the tenant for synchronised users — if `OnPremisesSyncEnabled` is true for anyone, you are hybrid.',
                    'Check every domain’s authentication type: managed means cloud authentication or password hash sync; federated means ADFS or another identity provider.',
                    'Look for an Entra Connect or Cloud Sync installation, and for Pass-through Authentication agents.',
                    'Write the answer down and keep it current. Not knowing your own identity architecture is itself the finding.',
                ],
                link: '#/defend/hybrid-hardening',
            },
        },
    },

    /* ----------------------------------------------- REBUILD-OR-CLEAN TREE */
    {
        id: 'pro-rebuild',
        aud: 'pro',
        title: 'Can we clean in place, or must we rebuild?',
        glyph: '⚖️',
        lede: 'The most expensive decision in a directory incident, and the one people most want to avoid making explicitly. Six honest answers will give you a defensible position — and the reasoning is what you will be asked for by the board, the insurer and the regulator.',
        keys: 'rebuild forest or clean in place ad recovery decision domain compromise recovery reimage forest recovery should we rebuild ad trustworthy',
        start: 'q-tier0',
        nodes: {
            'q-tier0': {
                q: 'Was Tier 0 actually compromised?',
                hint: 'Tier 0 means domain controllers, the AD database, domain or enterprise admin credentials, ADFS, Entra Connect, the CA, backups, or the hypervisors hosting any of those.',
                options: [
                    { a: 'Yes — confirmed', to: 'q-retention' },
                    { a: 'Suspected but not confirmed', to: 'q-evidence' },
                    { a: 'No — the compromise stayed below Tier 0', to: 'q-below' },
                ],
            },
            'q-evidence': {
                q: 'Can you actually prove it did not reach Tier 0?',
                hint: 'Proof means logs you trust, covering the whole window, from systems the adversary did not control.',
                options: [
                    { a: 'Yes — full logging, complete timeline, nothing reached Tier 0', to: 'q-below' },
                    { a: 'No — there are gaps I cannot fill', to: 'r-assume-worst' },
                ],
            },
            'q-retention': {
                q: 'Does your log retention cover the entire suspected dwell time?',
                options: [
                    { a: 'Yes — I can see the whole intrusion from first access', to: 'q-access' },
                    { a: 'No — it started before my logs begin', to: 'r-rebuild' },
                    { a: 'The logs exist but sat on systems the adversary controlled', to: 'r-rebuild' },
                ],
            },
            'q-access': {
                q: 'Do you know the initial access route, and have you closed it?',
                options: [
                    { a: 'Yes — identified and remediated', to: 'q-persistence' },
                    { a: 'I have a theory but no evidence', to: 'r-rebuild' },
                    { a: 'No idea', to: 'r-rebuild' },
                ],
            },
            'q-persistence': {
                q: 'Have you completed the full persistence sweep — every item, signed off by name?',
                hint: 'Groups, ACLs, sIDHistory, shadow credentials, RBCD, delegation, GPOs, scheduled tasks, certificates, NTAuth, krbtgt, AZUREADSSOACC$, DSRM, and the whole Entra list if hybrid.',
                options: [
                    { a: 'Yes — completed and verified, and re-checked after 24 hours', to: 'q-certs' },
                    { a: 'Mostly — a few items we could not check', to: 'r-rebuild' },
                    { a: 'Not yet', to: 'r-finish-sweep' },
                ],
            },
            'q-certs': {
                q: 'Did the adversary have access to AD CS, or could they have obtained authentication certificates?',
                options: [
                    { a: 'No CA in the environment, or no plausible access to it', to: 'r-clean' },
                    { a: 'Possible access — but every issued certificate has been reviewed and suspect ones revoked', to: 'r-clean' },
                    { a: 'The CA server itself may have been compromised', to: 'r-pki' },
                    { a: 'We have a CA and have not reviewed the issuance log', to: 'r-finish-sweep' },
                ],
            },
            'q-below': {
                q: 'What was the highest level actually reached?',
                options: [
                    { a: 'A single user identity, contained quickly', to: 'r-narrow' },
                    { a: 'Local administrator on some workstations', to: 'r-tier2' },
                    { a: 'A server administrator or service account with broad reach', to: 'r-tier1' },
                ],
            },

            'r-rebuild': {
                result: 'Rebuild. You cannot establish trustworthiness',
                tag: 'critical',
                steps: [
                    'The test is not "did we find persistence?" but **"could we have found all of it?"** If the honest answer is no, the directory is untrustworthy.',
                    'Plan a clean forest build: new domain controllers from known-good media, migrate objects deliberately, do not restore the compromised state.',
                    'Restoring a backup taken after the intrusion restores the adversary with it. Backups recover **data and availability**, never **trustworthiness**.',
                    'Engage external DFIR and Microsoft before committing. This is expensive to get wrong in both directions.',
                    'Use the rebuild to fix what let it happen: tiering, LAPS, gMSA, signing, monitoring. A rebuild that recreates the old configuration buys you about a year.',
                ],
                link: '#/play/pro-ad-tier0',
            },
            'r-assume-worst': {
                result: 'Unproven means compromised — scope conservatively',
                tag: 'critical',
                steps: [
                    'Where evidence ends, assumption begins, and the assumption must be the unfavourable one. Write that into the report in those words.',
                    'Extend containment to everything the adversary could plausibly have reached, not only what you can prove they touched.',
                    'Record the visibility gap as a finding — it will be the most valuable output of the whole incident.',
                    'Then re-enter this tree at the retention question with your honest answer.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-finish-sweep': {
                result: 'Finish the sweep before you can decide anything',
                tag: 'critical',
                steps: [
                    'You cannot make this decision on incomplete information — and an incomplete sweep is the most common cause of re-compromise.',
                    'Work the AD persistence checklist item by item, recording who checked what, when, and with which tool.',
                    'If hybrid, run the Entra sweep as well. Neither is a subset of the other.',
                    'Then come back here. Items you genuinely cannot check are themselves an answer.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-pki': {
                result: 'A compromised CA invalidates everything it ever issued',
                tag: 'critical',
                steps: [
                    'If the CA private key may have been stolen, every certificate it issued is untrustworthy — past, present and future.',
                    'That means rebuilding the PKI hierarchy: new CA, new keys, reissue and revoke. Preserve the old CA database and logs first.',
                    'Check the NTAuth store for a rogue CA certificate, which would let them issue authentication certificates entirely outside your PKI.',
                    'A PKI rebuild alongside a forest rebuild is a large programme. Get external help and plan it properly rather than improvising.',
                ],
                link: '#/play/pro-adcs-abuse',
            },
            'r-clean': {
                result: 'Cleaning in place is defensible — document why',
                tag: 'ok',
                steps: [
                    'You have: full retention, a known initial access route, a completed and verified persistence sweep, and certificates accounted for. That is the bar, and you have met it.',
                    'Complete the credential rotation: Tier 0 accounts, service accounts, computer accounts, krbtgt twice, trusts, and `AZUREADSSOACC$`.',
                    'Re-run the persistence sweep at 24 hours and at 7 days. Anything that reappears means you missed the root, and you are back at rebuild.',
                    'Keep enhanced monitoring for at least 90 days, and write down the evidence for this decision while it is fresh.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-tier1': {
                result: 'Contain at Tier 1 and prove it did not climb',
                tag: 'high',
                steps: [
                    'Rebuild the affected servers rather than cleaning them — server remediation is cheap compared with being wrong.',
                    'Rotate every credential that was used on, or stored on, those systems, including service accounts.',
                    'Prove no Tier 0 credential ever logged on to them. If one did, that machine was Tier 0 and you are in the other branch.',
                    'Check for onward paths: delegated rights, ACLs, and any GPO those admins could edit.',
                ],
                link: '#/play/pro-ad-persistence',
            },
            'r-tier2': {
                result: 'Workstation-level — reimage and rotate',
                tag: 'high',
                steps: [
                    'Reimage the affected machines. Cleaning does not remediate credential theft that has already succeeded.',
                    'Rotate credentials for every account that authenticated on them, and revoke cloud sessions for those users.',
                    'Check whether local administrator passwords were shared across machines — without LAPS, one is all of them.',
                    'Confirm no privileged account logged on to any of them. That single question decides whether this stays a workstation incident.',
                ],
                link: '#/play/pro-infostealer',
            },
            'r-narrow': {
                result: 'Single identity — contain, verify, and close',
                tag: 'ok',
                steps: [
                    'Revoke sessions and tokens, reset, and audit the persistence set for that identity.',
                    'Enumerate the blast radius properly before closing: delegated mailbox access, group memberships, standing privileges, API keys.',
                    'Keep the identity under enhanced monitoring for a fortnight.',
                    'Move that user to phishing-resistant authentication — you now have the internal case for it.',
                ],
                link: '#/play/pro-user-clicked',
            },
        },
    },
);
