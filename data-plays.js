/* ==========================================================================
   Breachlight — data-plays.js
   --------------------------------------------------------------------------
   The playbooks. A tree routes you here; this is where the actual instructions
   live. Written to be read by someone whose hands are shaking, or by someone
   who has forty minutes and an incident channel.

   Schema
     id        stable, hash-linked, never rename
     aud       'user' | 'pro'
     cat       grouping id (see BL_PLAY_CATS)
     title     what happened, in the reader's words, not ours
     glyph     one character
     urgency   'critical' | 'high' | 'normal'  → drives the badge and ordering
     clock     one line about the time pressure, or ''
     lede      one paragraph of orientation and reassurance
     signs[]   "this is you if…" — so a mis-routed reader leaves early
     sections[] { h, kind, steps[] }
                 kind: first | do | dont | note | evidence
     queries[] { label, lang, q }   pro only — starting points, not answers
     terms[]   glossary ids ·  defend[] defence ids ·  plays[] related plays
     keys      search keywords, in the words people actually type
   ========================================================================== */

window.BL_PLAY_CATS = [
    /* user */
    { id: 'phish', aud: 'user', title: 'I interacted with something', glyph: '🎣' },
    { id: 'account', aud: 'user', title: 'My account is affected', glyph: '🔓' },
    { id: 'money', aud: 'user', title: 'Money is involved', glyph: '💸' },
    { id: 'device', aud: 'user', title: 'My device is affected', glyph: '💻' },
    { id: 'people', aud: 'user', title: 'Someone is targeting me', glyph: '🫥' },
    /* pro */
    { id: 'identity', aud: 'pro', title: 'Identity and access', glyph: '🪪' },
    { id: 'email', aud: 'pro', title: 'Email and messaging', glyph: '📨' },
    { id: 'endpoint', aud: 'pro', title: 'Endpoint and malware', glyph: '🖥' },
    { id: 'fraud', aud: 'pro', title: 'Fraud and finance', glyph: '🏦' },
    { id: 'process', aud: 'pro', title: 'Running the incident', glyph: '🧭' },
];

window.BL_PLAYS = [

    /* ====================================================================== */
    /* ============================ END USER ================================ */
    /* ====================================================================== */

    {
        id: 'clicked-link',
        aud: 'user',
        cat: 'phish',
        title: 'I clicked a link in a suspicious message',
        glyph: '👆',
        urgency: 'normal',
        clock: 'You have time. Clicking alone rarely does damage — what you did next is what matters.',
        lede: 'Take a breath. On an up-to-date phone or computer, simply loading a page is very unlikely to do anything at all. The dangerous parts come afterwards: typing a password, entering a code, downloading a file, or being told to paste something. If none of those happened, you are probably fine — but let us make sure.',
        signs: [
            'You tapped or clicked a link and a page opened.',
            'You did not type a password, a card number or a code.',
            'Nothing downloaded, or you did not open what downloaded.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Close the tab. Do not go back to "have another look" — curiosity is how the second half of these attacks lands.',
                    'Think back honestly: **did you type anything?** A password, a card number, a six-digit code, a date of birth. If yes, stop here and open the playbook for what you entered.',
                    'Check your Downloads folder for anything that arrived in the last few minutes. If something did, delete it without opening it.',
                    'Did the page tell you to press a key combination, open a terminal, or paste something? If yes, go to **I pasted a command** — that one is serious.',
                ],
            },
            {
                h: 'Then, within the hour',
                kind: 'do',
                steps: [
                    'Run a full scan with the security software already on the device. Do not install a new "cleaner" you found by searching — that is its own scam.',
                    'Restart the device. It costs nothing and completes any pending updates.',
                    'Look at recent sign-in activity for the account the message pretended to be from. Most services show this under Security.',
                    'If it was a work device or a work message, **report it to your IT or security team** even though nothing happened. They can pull the same message out of everyone else’s inbox.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not reply to the message, even to say "nice try". A reply confirms a live human reads that address and multiplies what you receive.',
                    'Do not unsubscribe from a phishing email. The unsubscribe link is theirs.',
                    'Do not download any antivirus tool advertised on the page you just left.',
                ],
            },
            {
                h: 'Worth knowing',
                kind: 'note',
                steps: [
                    'Attacks that work purely from viewing a page (**drive-by** attacks) exist, but need an unpatched browser and are rare against a device that updates itself.',
                    'The genuine risk of a click is that it confirms your address is live, and that the page then persuades you to do the second thing. You have already declined to do the second thing.',
                ],
            },
        ],
        terms: ['phishing', 'malvertising', 'clickfix', 'drive-by'],
        defend: ['never-click', 'update-everything', 'check-a-link'],
        plays: ['entered-password', 'pasted-command', 'opened-attachment', 'phone-malware'],
        keys: 'i clicked a link clicked a phishing link opened a link in an email tapped a link accidentally clicked what happens if i click a link',
    },

    {
        id: 'entered-password',
        aud: 'user',
        cat: 'phish',
        title: 'I typed my password into a fake site',
        glyph: '🔑',
        urgency: 'critical',
        clock: 'Minutes matter. Assume they are logging in right now, because automated kits often do it within seconds.',
        lede: 'This is a real compromise and speed genuinely helps. Everything below is doable in about ten minutes. Do it in order, because changing the password alone is not enough — the part people skip is the part that keeps attackers inside.',
        signs: [
            'You entered a username and password on a page you reached from a message.',
            'The page may have then said "error, try again" and sent you to the real site — that is the classic sign the credential was harvested.',
            'Or you approved an MFA prompt and everything seemed to work normally.',
        ],
        sections: [
            {
                h: 'Do this now, in this order',
                kind: 'first',
                steps: [
                    'Go to the real service **by typing the address or opening the app yourself** — not from any link. Change the password to something new and unique.',
                    '**Sign out of all other sessions.** Look for "sign out everywhere", "log out of all devices" or "active sessions". This is the step that actually evicts them: a stolen session cookie survives a password change.',
                    'Check the account’s security settings for: a new phone number, a new recovery email, a new authenticator or passkey, and new "trusted devices". Remove anything you do not recognise.',
                    'If it was an email account, check **forwarding and rules** now. A hidden forwarding rule is how one bad afternoon becomes six months of reading your mail.',
                    'Turn on the strongest second factor available — ideally a passkey.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Change the password anywhere else you used the same one, or anything close to it. Start with email, bank, phone account.',
                    'If the account holds payment details, check recent orders, saved addresses and any linked cards.',
                    'Look through the last few days of sign-in history. Note anything unfamiliar — you may need the dates later.',
                    'If it was a **work** account: tell IT or security immediately, and say plainly that you entered credentials. They need to revoke tokens centrally, and they are not going to be angry — a fast report is the best possible outcome for them.',
                    'If it was your **bank**: phone the number on the back of your card and tell them. Do not wait for something to happen.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not change the password from the same page you were phished on, or by clicking any link in the message.',
                    'Do not stop at the password change. Without revoking sessions, they may still be inside.',
                    'Do not assume you are safe because "the login failed". A failed login on their page usually means it succeeded on the real one.',
                ],
            },
            {
                h: 'Why the session step matters',
                kind: 'note',
                steps: [
                    'Modern phishing relays your login to the real site as you type, so your password **and** your second factor both work for the attacker. What they keep at the end is a session cookie, which is a separate thing from your password.',
                    'That is also why a passkey would have stopped this outright: it checks the real domain itself and simply refuses to work anywhere else.',
                ],
            },
        ],
        terms: ['aitm', 'session-hijacking', 'phishing', 'passkey', 'session'],
        defend: ['mfa-upgrade', 'email-first', 'password-hygiene'],
        plays: ['mailbox-compromise', 'account-takeover', 'gave-code'],
        keys: 'i entered my password on a fake site typed password phishing site logged into a suspicious website gave my password fake login page what do i do',
    },

    {
        id: 'gave-code',
        aud: 'user',
        cat: 'phish',
        title: 'I read out or typed in a one-time code',
        glyph: '🔢',
        urgency: 'critical',
        clock: 'That code was an authorisation, and it may already have been used. Act now.',
        lede: 'A one-time code is not a password check — it is a signature. It approves a payment, registers a new device or completes a password reset. Someone who now has yours has done one of those things, usually within seconds. This is fixable, but not by waiting.',
        signs: [
            'A caller asked you to read out a code "to verify" or "to cancel a payment".',
            'You typed a code into a page you reached from a message.',
            'A code arrived that you did not request, and you used it anyway.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Reread the message that carried the code. The text above the digits says what it was for — a payment, a new payee, a device registration, a reset. That tells you what to undo.',
                    'If the code was for a **bank**: phone the number on the back of your card immediately and say a code was disclosed. Ask them to stop pending payments and check for new payees and new devices.',
                    'If the code was for an **online account**: change the password, then sign out of all sessions, then remove any unrecognised device, phone number or authenticator.',
                    'If a new device or phone number was registered, remove it and re-register your own factor.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Check for a new payee or standing order you did not create.',
                    'Check whether your address, phone number or email on the account has been changed.',
                    'Report it to the police or the national fraud reporting service — you will need the reference for any dispute.',
                    'Write down the caller’s number, the time, and what was said, while it is fresh.',
                ],
            },
            {
                h: 'Never again, for free',
                kind: 'note',
                steps: [
                    '**Nobody legitimate ever needs your code.** Not the bank, not the police, not the helpdesk, not the delivery company, not your employer. Anyone asking is, without exception, an attacker.',
                    'Read the words above the digits before typing them anywhere. Providers write "use this code to approve a payment of €X" precisely because that is the moment the fraud is visible.',
                ],
            },
        ],
        terms: ['otp', 'vishing', 'mfa', 'aitm', '3ds'],
        defend: ['mfa-upgrade', 'verify-a-human', 'money-alarms'],
        plays: ['money-transfer', 'entered-password', 'account-takeover'],
        keys: 'gave out my code read the code to someone one time code otp code shared sms code given verification code scam bank asked for code',
    },

    {
        id: 'approved-mfa',
        aud: 'user',
        cat: 'phish',
        title: 'I approved a login prompt I did not start',
        glyph: '🔔',
        urgency: 'critical',
        clock: 'Someone already has your password. That is what the prompt proves.',
        lede: 'A prompt you did not trigger is not a glitch. It means somebody, somewhere, typed your correct password and the only thing between them and your account was your thumb. If you approved it, they are in. If you denied it, you are still in trouble — just less of it.',
        signs: [
            'Repeated approval requests, often at night or during a meeting.',
            'You tapped Approve to make them stop, or by accident.',
            'Someone claiming to be IT called and asked you to accept the next prompt.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Change the password immediately**, whether or not you approved anything. The prompts prove the password is known.',
                    'Sign out of all sessions on that account.',
                    'Check registered authentication methods and remove any device, phone number or app you do not recognise.',
                    'If it is a work account, phone IT or security now and tell them exactly what you tapped. Do not email — email may be the compromised thing.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Change the same password anywhere else it was used.',
                    'Switch to number matching or, better, a passkey so blind approval stops being possible.',
                    'Review sign-in history for successful logins from unfamiliar places.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not approve a prompt because a caller asked you to. That call is the attacker, without exception.',
                    'Do not simply mute the notifications and move on. Silence does not remove the password from their hands.',
                ],
            },
        ],
        terms: ['mfa-fatigue', 'mfa', 'authenticator-app', 'credential-stuffing'],
        defend: ['mfa-upgrade', 'password-hygiene'],
        plays: ['entered-password', 'account-takeover'],
        keys: 'approved mfa prompt accepted authenticator notification push notification i did not request approve login prompt spam prompts mfa fatigue',
    },

    {
        id: 'opened-attachment',
        aud: 'user',
        cat: 'device',
        title: 'I opened an attachment or ran a file',
        glyph: '📎',
        urgency: 'high',
        clock: 'Act within the hour. If it ran, the first minute did the damage — the rest is containment.',
        lede: 'The important question is what kind of file it was and whether anything asked for permission. A viewed PDF is usually harmless. An installer you approved, a macro you enabled, or a shortcut you double-clicked is a different matter and should be treated as a real infection.',
        signs: [
            'You opened an attachment from an unexpected message.',
            'You clicked "Enable content", "Enable editing" or "Allow" on a warning banner.',
            'The file did not show what it promised, or opened and closed instantly.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Disconnect the device from the network** — turn off Wi-Fi, unplug the cable. Do not power it off if you may need someone to investigate; isolation is enough.',
                    'If it is a work device, phone IT or security immediately. Do not carry on using it.',
                    'On a personal device, run a full scan with your existing security software.',
                    'Assume every password saved in that browser is now known. Change the important ones **from a different, clean device** — a phone, a tablet, another computer.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Change email, banking and password-manager credentials first, from the clean device.',
                    'Sign out of all sessions everywhere you can, because saved session cookies are stolen alongside passwords.',
                    'Check for new mail rules and forwarding on your email account.',
                    'If anything was genuinely installed, the honest answer is to **reinstall the operating system**. Cleaning tools remove what they recognise; they cannot prove nothing remains.',
                ],
            },
            {
                h: 'Which files actually matter',
                kind: 'note',
                steps: [
                    'Dangerous by design: `.exe`, `.msi`, `.scr`, `.lnk`, `.js`, `.vbs`, `.ps1`, `.bat`, `.cmd`, `.iso`, `.img`, `.hta`, and Office files where you enabled macros.',
                    'A password-protected ZIP with the password in the email body is not security — it exists to blind the scanner.',
                    'Watch for double extensions: `invoice.pdf.exe`, `photo.jpg.lnk`. Windows hides the last one by default, which is precisely why it is used.',
                    'Merely previewing a modern PDF or Office document without enabling anything is, in practice, low risk.',
                ],
            },
        ],
        terms: ['malware', 'infostealer', 'rat', 'ransomware'],
        defend: ['update-everything', 'backups', 'password-hygiene'],
        plays: ['infostealer-home', 'ransomware-home', 'computer-malware', 'pasted-command'],
        keys: 'opened an attachment ran a file enabled macros clicked enable content downloaded exe opened invoice zip virus attachment',
    },

    {
        id: 'pasted-command',
        aud: 'user',
        cat: 'device',
        title: 'A website told me to paste something and I did',
        glyph: '📋',
        urgency: 'critical',
        clock: 'Treat this as a confirmed infection. The theft takes about two seconds and is already finished.',
        lede: 'This is the ClickFix attack, and it is one of the most effective things going. A page tells you to press Windows+R, or open Terminal, and paste to "verify you are human" or "fix a codec error". Because you type the command yourself, nothing is downloaded and nothing is blocked. Assume everything saved in your browser is gone, and work from that assumption rather than hoping.',
        signs: [
            'A page told you to press Windows + R, or to open Terminal or PowerShell.',
            'A "CAPTCHA" or "error" gave you copy-and-paste instructions.',
            'A black window flashed open and closed after you pressed Enter.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Disconnect from the network.** Wi-Fi off, cable out.',
                    'If it is a work device, phone security now. Say the words "I pasted a command from a website" — they will understand immediately.',
                    'Get a **different, clean device** and use it for everything below. Do not change any password on the affected machine.',
                    'From the clean device: change your email password first, then banking, then the password manager, then everything else important.',
                    'From the clean device: **sign out of all sessions** on each account. The stolen cookies are the real prize and they ignore password changes.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Check email forwarding rules, recovery addresses and registered MFA methods on every important account.',
                    'If you hold cryptocurrency, move it to a new wallet with new keys generated on a clean device. Stealers target wallet files and seed phrases specifically.',
                    'Tell your bank that credentials may have been stolen and ask for enhanced monitoring.',
                    '**Reinstall the operating system.** This is the only honest remediation. The malware often deletes itself after running, so "the scan came back clean" tells you nothing.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not change passwords on the affected device. If anything is still resident, you are typing the new ones straight to them.',
                    'Do not trust a clean antivirus result. Self-deleting stealers are designed to produce exactly that result.',
                    'Do not keep using the machine "carefully" until the weekend.',
                ],
            },
            {
                h: 'The rule that ends this attack forever',
                kind: 'note',
                steps: [
                    '**No legitimate website has ever needed you to paste a command into your operating system.** Not one, ever, for any reason. A site that asks is hostile, and you can stop reading its instructions at that word.',
                ],
            },
        ],
        terms: ['clickfix', 'infostealer', 'session-hijacking'],
        defend: ['password-hygiene', 'update-everything', 'mfa-upgrade'],
        plays: ['infostealer-home', 'entered-password'],
        keys: 'clickfix pasted a command windows r powershell paste fake captcha verify you are human terminal command copy paste malware',
    },

    {
        id: 'qr-scanned',
        aud: 'user',
        cat: 'phish',
        title: 'I scanned a QR code and something felt wrong',
        glyph: '🔳',
        urgency: 'high',
        clock: 'Depends entirely on what you did after scanning. Scanning alone is just opening a link.',
        lede: 'A QR code is only a link you could not read in advance. Scanning it opened a page — that on its own is rarely harmful. What matters is whether that page then took a login, a card number or a payment. Work out which and act accordingly.',
        signs: [
            'You scanned a code on a parking meter, charger, poster, table or letter.',
            'You scanned a code inside an email, a PDF or a letter about "renewing" something.',
            'The page asked you to log in, pay, or install an app.',
        ],
        sections: [
            {
                h: 'Work out what actually happened',
                kind: 'first',
                steps: [
                    '**Nothing entered, page closed** → you are almost certainly fine. Run a scan on the phone and move on.',
                    '**You logged in** → treat it as a phished password. Change it, sign out of all sessions, check MFA methods.',
                    '**You paid** → treat it as card fraud. Phone your bank now, dispute the transaction, and freeze or cancel the card.',
                    '**You installed an app** or accepted a configuration profile → remove it, then check device management or profile settings for anything you did not add.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'If it was a **work** email containing a QR code, report it. That pattern is used specifically to sidestep company link scanning and to move you onto an unmanaged phone.',
                    'If it was a sticker in public — a parking meter, an EV charger, a restaurant table — photograph it and tell the operator. Others are scanning it right now.',
                    'Check your phone for apps you do not recognise, and for VPN or device-management profiles you did not create.',
                ],
            },
            {
                h: 'Next time',
                kind: 'note',
                steps: [
                    '**Read the address your camera previews before you tap it.** Your phone shows it every time; almost nobody looks. That one habit removes most of this risk.',
                    'Codes stuck over other codes lift at the edges. Parking, charging and menu codes are the ones criminals target most.',
                    'A QR code inside an email or a PDF has no honest purpose. You are already on a screen.',
                ],
            },
        ],
        terms: ['quishing', 'phishing', 'card-fraud'],
        defend: ['qr-discipline', 'virtual-cards', 'check-a-site'],
        plays: ['entered-password', 'card-fraud', 'phone-malware', 'fake-shop-purchase'],
        keys: 'scanned a qr code qr scam quishing squishing parking meter qr code sticker qr code in email scanned code and paid malicious qr',
    },

    {
        id: 'mailbox-compromise',
        aud: 'user',
        cat: 'account',
        title: 'My email is being read by someone else',
        glyph: '📬',
        urgency: 'critical',
        clock: 'Every hour they hold your inbox is another account they can reset. Move now.',
        lede: 'Messages marked as read that you never opened, replies to things you never sent, mail that has vanished, contacts saying they received something odd from you. Your mailbox is the master key to everything else you own, so this ranks above almost anything else on this site.',
        signs: [
            'Emails already read, or missing from the inbox but present in Sent or Deleted.',
            'People reply to messages you did not send.',
            'Password-reset emails for other services that you did not request.',
            'A sign-in alert from a country you have never visited.',
        ],
        sections: [
            {
                h: 'Do this now, in this order',
                kind: 'first',
                steps: [
                    'Change the password, from a device you trust, having reached the site yourself.',
                    '**Sign out of all sessions.** Without this, the password change is cosmetic — a live session keeps working.',
                    'Open **Rules and Forwarding** and delete anything you did not create. Look especially for rules with blank or one-character names, and rules that move messages to Archive, RSS Feeds or Deleted Items.',
                    'Check **auto-forwarding** to an external address. This is the single most common thing left behind.',
                    'Check the reply-to address, the signature, and any "send as" or delegate permissions.',
                    'Review registered MFA methods, recovery email and recovery phone. Remove anything unfamiliar and add a passkey.',
                    'Review connected apps and revoke everything you do not actively use — an app grant survives a password change.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'List the accounts that use this address for password resets: bank, government, cloud storage, social, shopping. Check each for changed details and reset the important ones.',
                    'Search Sent and Deleted for messages sent in your name, especially anything about invoices or payments.',
                    'Warn anyone who may have received a message from "you" — particularly if it discussed money.',
                    'Check whether the address or contact details on any of your financial accounts were changed.',
                ],
            },
            {
                h: 'Preserve what you can',
                kind: 'evidence',
                steps: [
                    'Before deleting the rogue rules, photograph or screenshot them with their exact names and conditions.',
                    'Export or screenshot the sign-in history — dates, times, countries, addresses. Do it early; retention windows are short.',
                    'Keep a dated written log. If money is involved, your bank and the police will ask for exactly this.',
                ],
            },
            {
                h: 'If it is a work mailbox',
                kind: 'note',
                steps: [
                    'Phone IT or security rather than emailing them — their view of your mailbox may be better than yours, and email is the compromised channel.',
                    'Do not delete anything until they say so. Rules, headers and audit logs are the investigation.',
                ],
            },
        ],
        terms: ['bec', 'session-hijacking', 'session', 'oauth-consent', 'aitm'],
        defend: ['email-first', 'mfa-upgrade', 'recovery-paths'],
        plays: ['entered-password', 'account-takeover', 'invoice-changed'],
        keys: 'my emails are being read someone in my email account emails marked as read forwarding rule i did not create hacked email account mail disappearing sent emails i did not send',
    },

    {
        id: 'account-takeover',
        aud: 'user',
        cat: 'account',
        title: 'I am locked out — someone has taken my account',
        glyph: '🚫',
        urgency: 'critical',
        clock: 'Recovery windows shrink as the attacker replaces recovery details. Start the official process immediately.',
        lede: 'Password rejected, phone number changed, recovery email swapped. It feels final; usually it is not. Every large provider has an account-recovery route designed for exactly this, and it works better the sooner you start and the more supporting detail you can give.',
        signs: [
            'Your password no longer works and you did not change it.',
            'You received a "your recovery email was changed" notice.',
            'Friends receive messages from your account.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Start the provider’s official account-recovery process — reached by typing their address yourself, never through a search advert.',
                    'Use a device and network you have used with that account before. Providers weigh familiar devices heavily.',
                    'Give as much verifiable detail as you can: the date you created the account, old passwords, contacts, folder names, purchase receipts.',
                    'Secure your **email account first** if it is still yours. Every other recovery route depends on it.',
                    'If your phone lost signal at the same time, treat it as a SIM swap and phone your mobile provider immediately.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Warn your contacts by another channel that the account is not yours — before it is used to scam them.',
                    'If the account holds payment details, tell your bank and watch for charges.',
                    'Change the same password anywhere else it was used.',
                    'Report to the police or national fraud service if money or identity documents are involved, and keep the reference.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not use "account recovery services" advertised on social media or in search results. Every single one is a recovery scam. Nobody has a back door into a major provider.',
                    'Do not pay anyone claiming to be able to restore your account.',
                    'Do not create a new account and abandon the old one until you have exhausted recovery — the old one is still being used as you.',
                ],
            },
            {
                h: 'When you get it back',
                kind: 'do',
                steps: [
                    'Sign out of all sessions before anything else.',
                    'Remove unknown MFA methods, recovery addresses and connected apps.',
                    'Add a passkey and print fresh recovery codes.',
                    'Check for forwarding rules and changed profile details.',
                ],
            },
        ],
        terms: ['credential-stuffing', 'session-hijacking', 'session', 'sim-swap', 'recovery-scam'],
        defend: ['recovery-paths', 'email-first', 'mfa-upgrade'],
        plays: ['mailbox-compromise', 'sim-lost-signal', 'social-hijack'],
        keys: 'account hacked locked out cannot log in password changed by someone else account stolen recover my account taken over',
    },

    {
        id: 'social-hijack',
        aud: 'user',
        cat: 'account',
        title: 'My social media account is posting things I didn’t write',
        glyph: '📣',
        urgency: 'high',
        clock: 'Your friends are being scammed in your name right now. Warn them early, even before you regain control.',
        lede: 'Hijacked social accounts are rarely the goal in themselves — they are a delivery mechanism for scamming the people who trust you. Investment "opportunities", crisis appeals and fake marketplace listings all land far better from a real friend’s account.',
        signs: [
            'Posts, stories or direct messages you did not send.',
            'Friends asking whether a message from you is genuine.',
            'A new admin or a changed page name on a page you manage.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Change the password and sign out of all sessions.',
                    'Remove unknown devices, connected apps and — for pages and business accounts — unknown administrators. Check admins twice; that is the persistence.',
                    'Check the linked email address and phone number. If either was changed, use the recovery flow to get them back first.',
                    'Post publicly, or message your closest contacts, that the account was compromised and to ignore anything it sent.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Delete the fraudulent posts and messages, but screenshot them first.',
                    'Report the compromise through the platform’s own reporting flow.',
                    'Warn anyone who actually sent money to check with their bank immediately — that is now their fraud, and speed matters for them too.',
                    'Turn on a passkey or authenticator app, and remove SMS as the only factor.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not use "account recovery" agents in your direct messages. They are queueing up specifically because you are visibly a victim.',
                    'Do not delete the account until you have regained control — an abandoned but live account keeps working for them.',
                ],
            },
        ],
        terms: ['credential-stuffing', 'session-hijacking', 'recovery-scam', 'angler-phishing'],
        defend: ['mfa-upgrade', 'password-hygiene'],
        plays: ['account-takeover', 'entered-password'],
        keys: 'instagram hacked facebook hacked social media account posting spam messages sent from my account page admin changed whatsapp hacked',
    },

    {
        id: 'sim-lost-signal',
        aud: 'user',
        cat: 'account',
        title: 'My phone lost all signal for no reason',
        glyph: '📵',
        urgency: 'critical',
        clock: 'A SIM swap is followed by account resets within minutes. This is one of the few things worth interrupting anything for.',
        lede: 'If your phone shows "No service" while other phones nearby work fine, and you have not travelled or changed anything, treat it as a SIM swap until proven otherwise. Your number has been moved to someone else’s SIM, and every SMS code now goes to them.',
        signs: [
            'Sudden and total loss of signal; others in the same room are fine.',
            'A "your number has been transferred" or porting message just before it.',
            'Password reset emails arriving for accounts you did not touch.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Phone your mobile provider from another phone.** Say the words "I think my number has been ported without my consent" and ask them to reverse it and lock the account.',
                    'Using another device on Wi-Fi, change the password on your **email** account and sign out of all sessions.',
                    'Then do the same for your bank, then your password manager, then anything else valuable.',
                    'Phone your bank and tell them your number may be compromised. Ask them to block SMS-based approvals and watch for new payees.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Replace SMS-based second factors with an authenticator app or a passkey wherever possible.',
                    'Add a port-out PIN or account passcode with your mobile provider so this cannot be repeated.',
                    'Check every account for changed recovery numbers.',
                    'Report it to the police — SIM swap is usually treated as identity fraud and you will want the reference.',
                ],
            },
            {
                h: 'Worth knowing',
                kind: 'note',
                steps: [
                    'SIM swaps are usually done by social-engineering a phone-shop employee with details taken from a data breach or your own social media. Nothing on your handset was hacked.',
                    'This is exactly why SMS is the weakest second factor: it depends on a shop assistant, not on you.',
                ],
            },
        ],
        terms: ['sim-swap', 'mfa', 'data-breach'],
        defend: ['recovery-paths', 'mfa-upgrade', 'phone-lock'],
        plays: ['account-takeover', 'card-fraud'],
        keys: 'lost signal no service sim swap phone number transferred cannot receive sms sim hijack ported my number bank codes not arriving',
    },

    {
        id: 'card-fraud',
        aud: 'user',
        cat: 'money',
        title: 'Money has left my account and I did not authorise it',
        glyph: '💳',
        urgency: 'critical',
        clock: 'Report within hours, not days. Reimbursement rules are strongly in your favour but they reward speed.',
        lede: 'Unauthorised card transactions are the one crime here with a well-built safety net. Banks reverse them routinely when told promptly. Your job is to stop the bleeding, report it properly, and not be talked out of it by anyone who calls you afterwards.',
        signs: [
            'Charges you do not recognise, often a tiny test payment before a large one.',
            'Payments in a country or currency you have no connection to.',
            'A declined payment you never attempted.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Freeze the card in your banking app** — most apps do this in two taps, instantly.',
                    'Phone the bank on the number **printed on the back of the card**, not one from a message or a search result.',
                    'Say clearly: "I did not authorise these transactions and I want to report fraud." Ask for the card to be cancelled and reissued.',
                    'Ask them to check for new payees, new devices, changed contact details and changed limits — fraud often arrives with company.',
                    'Change your online banking password from a device you trust.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'List every transaction you dispute with dates and amounts, and keep a copy.',
                    'Ask for the complaint reference and the expected timescale in writing.',
                    'Report to the police or national fraud reporting body and keep the reference number.',
                    'Check other accounts and cards, including ones stored in shops and app stores.',
                    'Work out the likely source: a fake shop, a phishing page, a breach, a lost card. It changes what else needs fixing.',
                ],
            },
            {
                h: 'Expect a follow-up scam',
                kind: 'dont',
                steps: [
                    'Being defrauded puts you on a list. Expect a call from "the bank’s fraud department" days later — that is a second attack.',
                    'A real bank will **never** ask you to move money to a "safe account", give a code, or install remote software. There are no exceptions to this.',
                    'If someone calls about the fraud, hang up and call back on the number on your card.',
                ],
            },
        ],
        terms: ['card-fraud', 'chargeback', 'skimming', 'apr-fraud', 'vishing'],
        defend: ['money-alarms', 'virtual-cards', 'identity-armour'],
        plays: ['money-transfer', 'fake-shop-purchase', 'mailbox-compromise'],
        keys: 'money gone from my bank unauthorised transaction stolen card details charges i did not make fraud on my card money disappeared bank',
    },

    {
        id: 'money-transfer',
        aud: 'user',
        cat: 'money',
        title: 'I was tricked into sending money myself',
        glyph: '➡️',
        urgency: 'critical',
        clock: 'The recall window is measured in minutes and hours. Phone the bank before you finish reading this.',
        lede: 'This is harder to reverse than card fraud because you pressed send — but it is not hopeless, and in several countries banks are now required to reimburse victims in many circumstances. What determines the outcome, more than anything else, is how fast the receiving bank is told to freeze the account.',
        signs: [
            'You transferred money after a phone call, message or online relationship.',
            'You were told to move funds to a "safe account".',
            'You paid an invoice to bank details that turned out to be false.',
        ],
        sections: [
            {
                h: 'Do this now — this minute',
                kind: 'first',
                steps: [
                    '**Phone your bank on the number on your card** and say: "I have been the victim of an authorised push payment scam. Please attempt a recall and freeze the receiving account."',
                    'Give them the exact amount, time, sort code or IBAN, and the payee name.',
                    'Ask them to raise it with the receiving bank immediately — that is the step that can freeze what is left.',
                    'Cancel any further scheduled or promised payments and remove the payee.',
                    'If you paid by card, ask for a chargeback as well; the two routes are not exclusive.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Write down everything while it is fresh: numbers used, names given, times, what was said, what you sent.',
                    'Keep every message, screenshot and receipt. Do not delete the conversation, however much you want to.',
                    'Report to the police or the national fraud service and keep the reference.',
                    'Ask your bank in writing whether you are covered by the reimbursement rules in your country, and ask for the decision in writing.',
                    'If your bank refuses, escalate to the financial ombudsman or equivalent. A meaningful share of refusals are overturned.',
                    'Assume your devices and email are also compromised if the scam involved remote access or a login page.',
                ],
            },
            {
                h: 'The second wave',
                kind: 'dont',
                steps: [
                    'Do not engage with anyone who contacts you offering to recover the money. Victim lists are sold; recovery scams are the most reliable follow-up in the business.',
                    'Real police, banks and regulators never charge a fee to recover your own money.',
                    'Do not send "one more payment" to release the funds. There is never only one fee.',
                ],
            },
            {
                h: 'And this part matters',
                kind: 'note',
                steps: [
                    'These scams work on intelligent, careful people. They are engineered by full-time professionals using scripts refined on thousands of victims, and they specifically exploit trust, fear and time pressure.',
                    'Shame is what stops people reporting quickly, and slow reporting is what makes the loss permanent. Make the call.',
                    'Free, confidential **victim-support services** exist in most countries and handle exactly this — the practical steps and the aftermath. Using one is not an admission of anything.',
                ],
            },
        ],
        terms: ['apr-fraud', 'safe-account', 'money-mule', 'vishing', 'recovery-scam'],
        defend: ['verify-a-human', 'money-alarms', 'protect-elders'],
        plays: ['romance-invest', 'invoice-changed', 'card-fraud'],
        keys: 'i sent money to a scammer transferred money scam safe account bank transfer scam can i get my money back app fraud paid a fraudster',
    },

    {
        id: 'fake-shop-purchase',
        aud: 'user',
        cat: 'money',
        title: 'I bought something from a website that now looks fake',
        glyph: '🛒',
        urgency: 'high',
        clock: 'Dispute deadlines are typically around 120 days, but the card can be abused today.',
        lede: 'Two separate problems: getting your money back, and the card details you handed over. Deal with the card first, because that is the one that can still get worse.',
        signs: [
            'No delivery, no tracking, and no reply to messages.',
            'The site is now offline, or was registered only weeks ago.',
            'You were asked to pay by bank transfer, crypto or "friends and family".',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'If you paid **by card**: contact your card issuer and open a dispute or chargeback for goods not received. Do this even if the shop still promises delivery.',
                    'Consider freezing or replacing the card — those details are now in the hands of people who sell them.',
                    'If you paid **by bank transfer**: phone your bank immediately and ask them to attempt a recall. Chances are lower, and they fall by the hour.',
                    'If you paid **by crypto or gift card**: the money is gone. Report it, but do not pay anyone who offers to retrieve it.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Keep everything: order confirmation, the site as it appeared (screenshot it), payment record, all correspondence.',
                    'Report the site to your national consumer protection or fraud reporting body, and to the domain registrar if you can find it.',
                    'Check for recurring charges — fake shops frequently enrol the card in a subscription.',
                    'Check whether you created an account there with a password you use elsewhere. If so, change it everywhere.',
                ],
            },
            {
                h: 'Before the next one',
                kind: 'note',
                steps: [
                    'Use a **virtual card number** for any shop you have not used before. If the shop is fraudulent, the number is worthless and your real card is untouched.',
                    'Check the domain age. A shop claiming twenty years of trading on a six-week-old domain has answered the question for you.',
                    'A seller who pushes you off card payment is telling you exactly what they are.',
                ],
            },
        ],
        terms: ['fake-shop', 'chargeback', 'vcc', 'subscription-trap', 'marketplace-scam'],
        defend: ['virtual-cards', 'check-a-site', 'money-alarms'],
        plays: ['card-fraud', 'money-transfer'],
        keys: 'fake webshop bought something never arrived scam website online shopping scam get my money back chargeback fake store ordered nothing came',
    },

    {
        id: 'gift-card-paid',
        aud: 'user',
        cat: 'money',
        title: 'I paid someone in gift cards and read out the codes',
        glyph: '🎁',
        urgency: 'critical',
        clock: 'Codes are usually drained within minutes, but not always. The call to the card issuer is worth making immediately.',
        lede: 'First, the fact that decides everything else: **no legitimate organisation accepts gift cards as payment.** Not the tax office, not Microsoft, not your bank, not the police, not your boss. Gift cards are the payment method of choice for scammers precisely because they move like cash — but "like cash" is not "always gone", so make the calls below before you write it off.',
        signs: [
            'You were told to buy gift cards — Apple, Google Play, Steam, Amazon — and read the codes over the phone or send a photo of the back.',
            'The reason was urgent and strange: a fine, a debt, "securing your account", your boss needing them "for clients".',
            'You may have been kept on the phone the whole time, including inside the shop.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Phone the gift card issuer’s fraud line right away** — Apple, Google, Steam and Amazon all have one. If the codes have not been fully spent, they can sometimes freeze the remaining balance. Minutes matter.',
                    'Have the cards and receipts in front of you: the card numbers, the activation receipts, the amounts and the time you bought them.',
                    'Do not throw away the physical cards or receipts — they are your proof of purchase and the issuer will ask for them.',
                    'If you bought the cards with your bank card at the till, your bank cannot recall this — but tell them anyway if the scammer also saw your screen or has your details.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Report it to the police or your national fraud reporting service and keep the reference number. Gift card fraud is under-reported, which keeps it profitable.',
                    'Write down the story while it is fresh: the number that called, the name and organisation they claimed, what they said, the shop, the amounts.',
                    'Tell the shop where you bought them, especially if a staff member tried to warn you — retailers train for this and their report helps.',
                    'If the scam started with "your computer is infected" or someone connected to your device, work the **remote access playbook** as well.',
                ],
            },
            {
                h: 'The second wave',
                kind: 'dont',
                steps: [
                    'Do not pay anyone who offers to recover the money — victims of gift card scams are re-targeted specifically because they have proven they will buy cards.',
                    'Do not buy "one more card to unlock the refund". There is no refund behind the next card. There never was.',
                    'Do not let embarrassment stop the report. This scam is engineered by professionals and works on sharp people every single day.',
                ],
            },
            {
                h: 'Worth knowing',
                kind: 'note',
                steps: [
                    'Recovery of already-spent codes is rare — the issuer call is about whatever balance is left, and about flagging the account that redeemed them.',
                    'The "boss needs gift cards" version arrives by email or text at work, usually from a lookalike address. One phone call to the real boss on their real number ends it.',
                    'If this targeted an older relative, they were not careless — they were selected. The **protecting elders** guide has the conversation worth having.',
                ],
            },
        ],
        terms: ['gift-card-scam', 'recovery-scam', 'social-engineering', 'vishing'],
        defend: ['verify-a-human', 'protect-elders', 'money-alarms'],
        plays: ['money-transfer', 'remote-access', 'card-fraud'],
        keys: 'gift card scam paid with gift cards read out the codes itunes apple google play steam cards bought gift cards for someone boss asked scammed can i get money back',
    },

    {
        id: 'invoice-changed',
        aud: 'user',
        cat: 'money',
        title: 'I paid an invoice and the bank details were fraudulent',
        glyph: '🧾',
        urgency: 'critical',
        clock: 'Recall attempts work best in the first hours. Both banks need to be told today.',
        lede: 'Invoice fraud is quiet and expensive. Either your supplier’s mailbox was compromised, or yours was, or someone in between intercepted the thread. The money went out through your legitimate process, which is why nothing flagged it — and why the response has to include finding out whose mailbox was open.',
        signs: [
            'A supplier says they never received payment.',
            'An invoice arrived with new bank details, often "due to an audit" or a "new finance system".',
            'The email came from a nearly-correct address, or a real one with a changed reply-to.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Phone your bank and request an immediate recall, giving the exact amount, time and beneficiary details.',
                    'Phone the real supplier on a number **you already had** — not one from any recent email — and tell them. Their mailbox may be the compromised one, and other customers are being defrauded right now.',
                    'Stop every other pending payment to that supplier until verified by voice.',
                    'If you are at work, tell your manager and your IT or security team immediately. This is now an incident, not just a payment error.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Preserve the emails **with full headers**. Do not delete, do not forward as a summary — headers are the evidence.',
                    'Check your own mailbox for forwarding rules and unfamiliar sign-ins. If the interception was on your side, it is still running.',
                    'Compare the fraudulent invoice with a genuine one. Note the differences in writing.',
                    'Report to the police or national fraud service; you will need the reference for insurance.',
                    'Notify your insurer if you hold cyber or crime cover — many policies have short notification windows.',
                ],
            },
            {
                h: 'The control that stops it recurring',
                kind: 'note',
                steps: [
                    '**A change of bank details is never actioned from an email. Ever.** It is verified by voice, on a number already on file from before the request arrived.',
                    'Write that down, give it to whoever pays invoices, and make it explicitly impossible for them to be blamed for using it.',
                ],
            },
        ],
        terms: ['invoice-fraud', 'bec', 'ceo-fraud'],
        defend: ['org-payments', 'verify-a-human', 'email-first'],
        plays: ['mailbox-compromise', 'money-transfer', 'pro-payment-fraud'],
        keys: 'paid the wrong bank account invoice fraud changed iban supplier bank details changed bec paid a fake invoice mandate fraud',
    },

    {
        id: 'romance-invest',
        aud: 'user',
        cat: 'money',
        title: 'The investment or the relationship was a scam',
        glyph: '💔',
        urgency: 'high',
        clock: 'Stop sending money now. Everything else is recoverable in some measure; more payments are not.',
        lede: 'This is the hardest page on this site to be reading. These operations run for months, are staffed by professionals working from scripts, and are designed by people who study exactly how trust is built. Being taken in by one says nothing about your intelligence. Two things matter now: stop, and preserve.',
        signs: [
            'Withdrawals require "tax", "fees", "liquidity" or "verification" payments first.',
            'Small early withdrawals worked; larger ones do not.',
            'The relationship began with a wrong number, a dating app, or a friendly stranger, and moved quickly to private messaging.',
            'The trading app was installed from a link rather than an official store.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Send nothing more.** No fee ever releases the funds. There is always another fee; that is the design.',
                    'Do not tell them you have realised. Screenshot everything first: profiles, chats, the platform balance, wallet addresses, transaction IDs, phone numbers.',
                    'Phone your bank, report it, and ask them to attempt recall on recent transfers and block further ones to those accounts.',
                    'If you sent cryptocurrency, record every transaction hash and receiving address. Report to the exchange you sent from — occasionally funds are frozen at an exchange.',
                    'Remove any app or remote-access tool they had you install, and change the passwords on anything they could see.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Report to the police and the national fraud service. Keep the reference.',
                    'Report the profile to the platform where you met, so the account can be taken down before the next person.',
                    'If you borrowed money or used credit, tell the lender you were defrauded — some have hardship processes.',
                    'Tell one person you trust. Isolation is part of how the scam sustains itself, and it does not end when the payments do.',
                    'Consider a victim support service. In many countries these are free, confidential and used to exactly this.',
                ],
            },
            {
                h: 'The second scam is coming',
                kind: 'dont',
                steps: [
                    'Within weeks, expect contact from a "recovery agency", a "blockchain investigator" or even a fake police unit. They will know details about your case, because victim lists are sold between criminals.',
                    'Every up-front-fee recovery offer is fraudulent. No exceptions.',
                    'Genuine authorities do not charge you to investigate a crime against you.',
                ],
            },
        ],
        terms: ['pig-butchering', 'romance-scam', 'wallet-drainer', 'advance-fee', 'recovery-scam'],
        defend: ['money-alarms', 'verify-a-human'],
        plays: ['money-transfer', 'deepfake-call'],
        keys: 'romance scam crypto investment scam pig butchering cannot withdraw my money fake trading platform love scam lost money investment was fake',
    },

    {
        id: 'sextortion-threat',
        aud: 'user',
        cat: 'people',
        title: 'Someone is threatening to publish intimate images',
        glyph: '🚫',
        urgency: 'high',
        clock: 'Do not let the countdown in the message set your pace. It is a pressure tactic, not a real deadline.',
        lede: 'First, plainly: this is a crime committed against you, and it is not your fault. Second, most of these messages are bluffs sent to thousands of people at once. Third, even when the images are real, paying has never ended it — it marks you as someone who pays. Here is how to tell the two apart and what to do about each.',
        signs: [
            '**Likely a bluff:** a mass email quoting an old password from a breach, claiming webcam footage, demanding cryptocurrency, with a 24 or 48 hour deadline and no actual image.',
            '**Likely real:** a conversation on a dating app, social platform or game that moved quickly to video or images, followed by immediate threats naming your actual contacts.',
        ],
        sections: [
            {
                h: 'If it is the mass-mailed bluff',
                kind: 'do',
                steps: [
                    'There is no footage. These are sent by the million using addresses and old passwords from public breaches.',
                    'Do not reply and do not pay. Delete it and mark it as spam.',
                    'If a real password of yours was quoted, change it wherever it is still used — that part is genuine information, from an old breach.',
                    'Cover your webcam if it makes you feel better. It is not why this email arrived.',
                ],
            },
            {
                h: 'If images really do exist',
                kind: 'first',
                steps: [
                    '**Stop replying.** Every reply gives them more leverage and more information.',
                    '**Do not pay.** Payment has never ended a case; it reliably produces a second demand.',
                    'Screenshot everything before blocking: profiles, usernames, messages, payment addresses, any image they sent.',
                    'Block the account, and report it to the platform — most have a specific sextortion route that acts fast.',
                    'Lock down your social accounts: set them private, restrict your follower and friend lists, and remove public contact details. The threat to send to your contacts depends on them being visible.',
                    'Tell someone. One person. It is unbearable alone and entirely survivable shared.',
                    'If the pressure ever feels like more than you can carry, contact a **crisis helpline** — nearly every country has one, by phone or chat, around the clock. People have been where you are and come out the other side. This will pass; make sure you are there for it.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Report to the police. This is a crime in essentially every jurisdiction, and it is treated seriously.',
                    'Use an image-takedown service — StopNCII for adults, and your country’s child-protection hotline if anyone involved is under 18.',
                    'If the person involved is a minor, contact a child-exploitation reporting line immediately. There are dedicated, fast routes for this and they work.',
                    'If images do get posted, request removal from the platform and from search engines; there are legal takedown routes in most countries.',
                ],
            },
            {
                h: 'For parents',
                kind: 'note',
                steps: [
                    'Teen sextortion escalates within hours and the criminals rely entirely on shame. The single most protective thing you can do is say, in advance, "if anything goes wrong online you can tell me and you will not be in trouble" — and mean it.',
                    'A young person who tells an adult in the first hour almost always comes out of it. One who does not, does not.',
                ],
            },
        ],
        terms: ['sextortion', 'data-breach', 'doxxing'],
        defend: ['protect-kids', 'password-hygiene'],
        plays: ['breach-notice', 'child-incident'],
        keys: 'sextortion blackmail nude photos threatening to send my photos webcam blackmail email bitcoin blackmail they have my password intimate images',
    },

    {
        id: 'remote-access',
        aud: 'user',
        cat: 'device',
        title: 'I let someone connect to my computer remotely',
        glyph: '🖥',
        urgency: 'critical',
        clock: 'Assume they saw everything on screen and everything you were logged into. Move now.',
        lede: 'Whoever was on the other end had your screen, your keyboard, your files, and every account you were already signed into. This is the tech-support scam and the fake bank fraud team, and it is the most complete kind of access there is. Treat everything on that machine as known.',
        signs: [
            'You installed AnyDesk, TeamViewer, UltraViewer, Quick Assist, ScreenConnect or similar at someone’s request.',
            'Your screen went black "for security" while they worked.',
            'They opened your banking, or asked you to log in while they watched.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Disconnect from the internet** — Wi-Fi off, cable out. This ends the session immediately.',
                    'Phone your bank on the number on your card. Tell them a fraudster had remote access. Ask them to check for new payees, pending payments, changed limits and new device registrations.',
                    'Get a **different, clean device** for everything below.',
                    'From the clean device: change your email password, then your bank, then everything important. Sign out of all sessions on each one.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Uninstall the remote-access tool, but do not assume that is the end of it — they had time to install other things.',
                    'Check for new user accounts on the computer, new scheduled tasks and new startup programs.',
                    'Check your email account for forwarding rules and new recovery details.',
                    'Check the browser for new extensions and a changed home page or search engine.',
                    '**Reinstall the operating system.** With this level of access it is the only response that can be relied on. Back up documents only, never programs.',
                    'Report to the police and to your national fraud service.',
                ],
            },
            {
                h: 'If they showed you "evidence"',
                kind: 'note',
                steps: [
                    'The Event Viewer full of red errors, the netstat output "showing hackers", the syskey lock screen, the fake refund that appears to overpay you — these are standard theatre in every tech-support scam script.',
                    'The "you have been refunded €10,000 by mistake, please send €9,500 back" routine is an edited web page or a transfer from another victim’s account. Nothing was refunded.',
                ],
            },
        ],
        terms: ['tech-support-scam', 'rat', 'vishing', 'scareware', 'infostealer'],
        defend: ['verify-a-human', 'money-alarms', 'backups'],
        plays: ['money-transfer', 'infostealer-home', 'computer-malware', 'card-fraud'],
        keys: 'let someone remote into my computer anydesk teamviewer scam tech support scam microsoft called me remote access fraud they took control of my pc',
    },

    {
        id: 'infostealer-home',
        aud: 'user',
        cat: 'device',
        title: 'I think something stole my saved passwords',
        glyph: '🧲',
        urgency: 'critical',
        clock: 'The theft itself is over in seconds. What you are racing now is their use of it.',
        lede: 'Infostealers take one sweep: every password saved in every browser, every session cookie, crypto wallets, VPN configurations, documents. Then many of them delete themselves, so the machine looks perfectly healthy afterwards. A clean scan does not mean it did not happen.',
        signs: [
            'You installed cracked software, a game cheat, a "codec", or a browser update from a pop-up.',
            'You pasted a command a website told you to paste.',
            'Login alerts across several unrelated services in a short period.',
            'Your credentials appeared in a breach-notification service with a recent date.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Disconnect the affected device from the network.',
                    'Get a **clean device**. Every password change below must be made from it — not from the infected machine.',
                    'Change email first. Then password manager. Then bank. Then everything else, in order of what hurts most.',
                    '**Sign out of all sessions** on each account as you go. The stolen cookies are the real damage and they ignore your new password entirely.',
                    'Move any cryptocurrency to a new wallet with keys generated on the clean device.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Check registered MFA methods, recovery addresses and connected apps on every important account.',
                    'Check email forwarding rules.',
                    'Tell your bank so they can monitor, and consider a new card.',
                    'If it was a work device, tell security immediately — corporate VPN and SSO credentials are exactly what these are harvested for.',
                    '**Reinstall the operating system.** Copy off documents only. Do not restore programs or browser profiles. A repair shop you choose yourself can do this part for you — the password changes above, though, cannot wait for the appointment.',
                    'Afterwards, stop letting the browser store passwords. Use a dedicated manager with its own lock.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not change passwords on the infected machine.',
                    'Do not conclude that a clean antivirus scan means nothing happened — self-deletion is a standard feature.',
                    'Do not reuse the machine for anything sensitive before it is rebuilt.',
                ],
            },
        ],
        terms: ['infostealer', 'clickfix', 'session-hijacking', 'malware'],
        defend: ['password-hygiene', 'update-everything', 'mfa-upgrade'],
        plays: ['pasted-command', 'opened-attachment', 'computer-malware', 'mailbox-compromise'],
        keys: 'infostealer stolen saved passwords browser passwords stolen cracked software virus game cheat malware passwords leaked stealer log',
    },

    {
        id: 'computer-malware',
        aud: 'user',
        cat: 'device',
        title: 'I think my computer has malware',
        glyph: '🦠',
        urgency: 'high',
        clock: 'Sort out which problem you actually have first. Two of the loudest "infections" are not infections at all.',
        lede: 'Slow, hot, full of ads, acting strangely — this playbook sorts the possibilities from loudest to quietest. Several of them are not malware, one of them is malware that does not matter much, and one means your passwords are already gone. Which one you have decides everything, so start with the sorting step, not the scanning step.',
        signs: [
            'Ads or pop-ups appear out of nowhere, or your search engine and homepage changed by themselves.',
            'The machine is suddenly slow, the fans roar at idle, or the disk is constantly busy.',
            'Programs or browser extensions you never installed have appeared.',
            'Something just feels wrong and you want to check properly.',
        ],
        sections: [
            {
                h: 'First — which problem is this?',
                kind: 'first',
                steps: [
                    'Files renamed, will not open, and a note demanding payment → stop here and open **My files are encrypted** instead. Disconnect from the network first.',
                    'The cursor moved by itself, or you let "support" connect recently → open **I let someone connect to my computer remotely**.',
                    'You ran a crack, a cheat, a "codec", or pasted a command a website gave you → open **I think something stole my saved passwords**. That one is about your accounts, not your machine, and it is time-critical.',
                    'A full-screen warning with a siren and a phone number → that is **scareware**, a web page. Close the browser (hold Esc if it fights you). Your computer is very probably fine — never call the number.',
                    'None of those → keep reading. What is left is usually adware, an unwanted extension, or nothing at all.',
                ],
            },
            {
                h: 'Rule out the loud impostors',
                kind: 'do',
                steps: [
                    '"Virus alerts" sliding in from the corner of the screen are usually **browser notifications** from a site that tricked you into clicking Allow. Browser settings → Notifications → remove anything you do not recognise. This alone resolves an enormous share of "my computer is infected".',
                    'Suddenly slow is often innocent: an update installing, a nearly-full disk, a backup running, or dust in the fans. Check the machine when it has been on for ten quiet minutes before concluding anything.',
                    'One misbehaving browser tab can eat a whole CPU. Close the browser entirely and see if the machine calms down.',
                ],
            },
            {
                h: 'Clean up what you find',
                kind: 'do',
                steps: [
                    'Browser extensions: remove everything you do not actively use, not just the obviously bad one. Extensions are the main way search engines get hijacked and ads get injected.',
                    'Put your search engine and homepage back in the browser settings — malware sets them, but so do "free" installers.',
                    'Uninstall unknown programs: Windows Settings → Apps, sorted by install date, is the honest list. On a Mac, check Applications and System Settings → General → Login Items.',
                    'Restart afterwards. It costs nothing and finishes pending updates.',
                ],
            },
            {
                h: 'Scan properly',
                kind: 'do',
                steps: [
                    'Run a **full** scan (not the quick one) with the security software already on the machine. Windows ships with Microsoft Defender; it is genuinely decent.',
                    'On Windows, follow with the offline scan (Windows Security → Virus & threat protection → Scan options → **Microsoft Defender Antivirus (offline scan)**). It reboots and scans before malware can hide, which is the point.',
                    '**Do not install a scanner you found through an ad or a pop-up.** Fake antivirus is itself a classic infection route — and one paid "cleaner" subscription is the usual souvenir.',
                    'If the scan finds a stealer, a trojan or a RAT — not just adware or "potentially unwanted programs" — treat it as **I think something stole my saved passwords** from this point on.',
                ],
            },
            {
                h: 'When to stop cleaning and start over',
                kind: 'note',
                steps: [
                    'Cleaning tools remove what they recognise; they cannot prove nothing remains. If anything genuinely hostile ran — or you cannot shake the doubt — the honest fix is a **reinstall**: copy documents off, reinstall the OS, restore files only, never programs.',
                    'Adware and a hijacked search engine, on the other hand, are annoying rather than catastrophic. Cleaned up is cleaned up; no reinstall required.',
                    '**Not confident doing a reinstall? That is what a local repair shop is for.** One you walk into yourself — never one whose number came from a pop-up or a cold call. Tell them what happened, ask for “wipe and reinstall, keep my files”, and change your important passwords afterwards regardless.',
                    'If this is a work machine, hand it to IT instead of cleaning it yourself — what looks like adware to you may be evidence to them.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not pay for a "tune-up" tool, "driver updater" or "PC cleaner". At best they are placebo; at worst they are the malware.',
                    'Do not run two antivirus products at once — they fight each other and slow the machine into the exact symptom you started with.',
                    'Do not phone any number a warning shows you. Real security software does not have a hotline in its alerts.',
                ],
            },
        ],
        terms: ['malware', 'scareware', 'infostealer', 'drive-by'],
        defend: ['update-everything', 'backups', 'password-hygiene'],
        plays: ['infostealer-home', 'ransomware-home', 'remote-access', 'phone-malware'],
        keys: 'my computer has a virus malware slow computer ads everywhere popups fans loud check my pc infected windows defender scan homepage changed search engine hijacked toolbar clean my computer',
    },

    {
        id: 'phone-malware',
        aud: 'user',
        cat: 'device',
        title: 'I think my phone or tablet is infected',
        glyph: '📵',
        urgency: 'high',
        clock: 'If your bank or codes run through this phone, sort it today. Everything else can be done calmly.',
        lede: 'Phones get compromised differently from computers, and most "your phone is infected!" alarms are spam designed to sell you a fake cleaner. This playbook separates the noise from the two real problems — a hostile app, and someone watching the device — for both Android and iPhone or iPad.',
        signs: [
            '"Virus detected" warnings or a flood of strange notifications.',
            'An app you do not remember installing, or one that refuses to uninstall.',
            'Battery draining fast, the phone running hot, or mobile data spiking.',
            'Charges on your phone bill or app store account you did not make.',
            'The banking app behaves oddly, or codes arrive that you did not request.',
        ],
        sections: [
            {
                h: 'First — which problem is this?',
                kind: 'first',
                steps: [
                    'Pop-ups saying the phone is infected, with a button to "clean" it → **the pop-up is the scam**, not a diagnosis. A web page cannot scan your phone. Follow the notification clean-up below and stop worrying.',
                    'An app you did not install, or one that will not go away → work the Android or iPhone section below. This is the real "malware on a phone" case.',
                    'Unexpected charges on the **phone bill** → phone your carrier, dispute them, and ask to block premium-rate SMS. On **app store** charges, check your subscriptions (steps below).',
                    'A partner or ex seems to know things only this phone knows → read **stalkerware** and be careful: removing it can be visible to whoever installed it. Plan your safety first.',
                    'If money, banking codes or crypto run through this phone and anything here feels active, do the banking step below **today**.',
                ],
            },
            {
                h: 'Kill the "virus warning" spam',
                kind: 'do',
                steps: [
                    'Android: Chrome → ⋮ → Settings → Notifications (or Site settings → Notifications) → remove every site you do not recognise. Those sites tricked you into tapping Allow once, and have shouted ever since.',
                    'iPhone or iPad: Settings → Notifications → look for Safari-delivered noise, and Settings → Safari → Clear History and Website Data if pop-ups persist.',
                    'iPhone "virus" events filling your agenda are **calendar spam**: Settings → Calendar → Accounts → delete the subscribed calendar you never added. Not an infection — a subscription.',
                    'After the clean-up, the "infection" is usually gone, because it was never in the phone — only in the browser’s permissions.',
                ],
            },
            {
                h: 'On Android',
                kind: 'do',
                steps: [
                    'Run the built-in scan: Play Store → your profile picture → **Play Protect** → Scan. If anything ever asked you to *disable* Play Protect, treat that app as hostile — no honest app asks.',
                    'Review what came from outside the store: Settings → Apps → look for anything you sideloaded from a link. "Update" APKs sent by chat or SMS are the main way banking trojans arrive.',
                    'Check **Accessibility** (Settings → Accessibility): any app you do not recognise with full control of the screen is exactly how banking malware reads and taps for itself. Remove its access, then the app.',
                    'Check **device admin apps** (Settings → Security → Device admin apps, wording varies): a rogue entry here is why an app refuses to uninstall. Deactivate it, then uninstall.',
                    'If an app still will not die, reboot into **safe mode** (press and hold the on-screen Power off option until “Reboot to safe mode” appears) — third-party apps stay disabled there, and uninstalling works.',
                    'Settings → Battery and Settings → Network → data usage, sorted by app, name the resource thief directly.',
                ],
            },
            {
                h: 'On iPhone or iPad',
                kind: 'do',
                steps: [
                    'Classic self-installing viruses are, in practice, not a thing on an un-jailbroken iPhone. What exists instead: hostile **configuration profiles**, subscription traps, and stalkerware via your Apple ID.',
                    'Settings → General → **VPN & Device Management**: any profile you did not knowingly install (and that is not your employer’s) gets deleted. "Install this profile to watch free TV" scams live here.',
                    'Settings → your name → **Subscriptions**: cancel anything you do not recognise — "fleeceware" apps charge weekly for a flashlight and count on you never looking.',
                    'Settings → your name → list of devices: remove any device you do not own. On an iPhone, **Safety Check** (Settings → Privacy & Security) reviews a specific person’s access — it does not exist on iPad, where you review sharing per app instead.',
                    'Update iOS (Settings → General → Software Update). The rare genuinely serious iPhone attacks are fixed by exactly these updates, which is why they matter the week they appear.',
                ],
            },
            {
                h: 'If banking or codes run through this phone',
                kind: 'do',
                steps: [
                    'Treat it like a suspected infostealer: from a **different, clean device**, change your email password first, then banking, then sign out all sessions on both.',
                    'Tell your bank what happened and watch the account. If a hostile app overlapped with banking app use, ask for new cards rather than waiting.',
                    'Move your one-time codes (authenticator app) to another device until this one is dealt with, and check no new MFA methods appeared on your accounts.',
                ],
            },
            {
                h: 'The reset, done right',
                kind: 'note',
                steps: [
                    'A **factory reset removes phone malware** in essentially all real-world cases — it is the clean answer when doubt remains.',
                    'Set up as new, or restore only photos, contacts and messages from the cloud. **Do not restore a full app backup** — restoring everything can restore the problem.',
                    'Sign in with your own accounts afterwards and change their passwords at that point, so the new passwords never touched the old install.',
                    'Rather not do this alone? Your **carrier’s shop or the manufacturer’s service desk** (Apple, Samsung and the rest all have one) will walk through backup, reset and restore with you for little or nothing — go to one you chose, never one a pop-up or caller recommended.',
                    'A work-managed phone or tablet is IT’s problem to rebuild, not yours — hand it over instead of resetting the evidence away.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not install an antivirus, "cleaner", "booster" or VPN that a pop-up or ad told you to install. On phones, fake security apps vastly outnumber real infections.',
                    'Do not jailbreak or root the device to "inspect" it — that removes the protections that were doing most of the work.',
                    'Do not enter your Apple ID or Google password into anything that is not the Settings app or the account’s own site, whatever the pop-up claims.',
                ],
            },
        ],
        terms: ['malware', 'scareware', 'stalkerware', 'subscription-trap'],
        defend: ['phone-lock', 'update-everything', 'mfa-upgrade'],
        plays: ['computer-malware', 'infostealer-home', 'clicked-link', 'lost-device'],
        keys: 'my phone has a virus iphone virus warning android malware infected tablet ipad samsung app i didnt install wont uninstall phone slow hot battery draining data usage popups on phone fake cleaner scan my phone',
    },

    {
        id: 'ransomware-home',
        aud: 'user',
        cat: 'device',
        title: 'My files are encrypted and there is a ransom note',
        glyph: '🔒',
        urgency: 'critical',
        clock: 'Stop the spread first. The encrypted files are not getting worse; the not-yet-encrypted ones are.',
        lede: 'Disconnect first and think second. Every minute the machine stays connected is more files, more shares and more backup copies encrypted. Then work out what you still have, because that decides everything that follows.',
        signs: [
            'Files renamed with a new extension and no longer opening.',
            'A ransom note text file or changed wallpaper in every folder.',
            'Backup drives and synced cloud folders affected too.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Disconnect from the network and unplug external drives.** Do this before anything else.',
                    'Do not power the machine off if you might want it investigated — isolation preserves more.',
                    'Check other devices in the house or office. Ransomware travels along shares.',
                    'Photograph the ransom note and one encrypted filename with your phone. You will need them to identify the family.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Check the No More Ransom project — a free decryptor exists for a meaningful number of families.',
                    'Check whether your backup is genuinely intact, and specifically whether it was connected when this started.',
                    'Check cloud storage version history. Sync services often let you roll back to before the encryption.',
                    'Report to the police. Free decryption keys are sometimes released after a takedown, months later.',
                    'Rebuild from clean media, then restore data. Do not restore programs or system state.',
                ],
            },
            {
                h: 'About paying',
                kind: 'note',
                steps: [
                    'Roughly a third of those who pay never get usable data back, decryptors are often slow and buggy, and paying funds the next attack.',
                    'Modern crews also steal data before encrypting and then demand a second payment not to publish it. Paying the first demand does not remove that.',
                    'If the files genuinely matter, a **data-recovery or incident-response firm you find yourself** can be worth it — but ask one question in writing first: *“do you decrypt, or do you negotiate with and pay the attackers?”* Firms “guaranteeing” decryption have been caught quietly paying the ransom and billing it back with a margin.',
                    'If this is a business, involve your insurer and legal counsel before any decision. There may be sanctions implications in paying at all.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not delete the encrypted files. Keep them — a decryptor may be released later.',
                    'Do not run random "ransomware removal" tools found by searching. Many are the second scam.',
                    'Do not reconnect the machine to test whether it worked.',
                ],
            },
        ],
        terms: ['ransomware', 'malware'],
        defend: ['backups', 'update-everything'],
        plays: ['opened-attachment', 'computer-malware', 'pro-ransomware'],
        keys: 'files encrypted ransomware ransom note cannot open my files extension changed pay ransom decrypt files locked photos gone',
    },

    {
        id: 'lost-device',
        aud: 'user',
        cat: 'device',
        title: 'My phone or laptop was lost or stolen',
        glyph: '📱',
        urgency: 'critical',
        clock: 'If a thief watched you type the passcode, you have roughly twenty minutes before accounts start falling.',
        lede: 'The device matters far less than what it can unlock. If the passcode was observed before the theft — the standard technique now — the thief can change your account password, disable Find My, and lock you out of your own life. Move on the accounts, not the hardware.',
        signs: [
            'The device is gone and you may have unlocked it in public shortly before.',
            'It was taken in a bar, on a train, or from a table.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'From another device, sign into your Apple, Google or Microsoft account and **change that password first** — before marking anything lost. If the thief has your passcode they are racing you for exactly this.',
                    'Then mark the device lost and, if it holds anything sensitive, wipe it remotely.',
                    'Phone your mobile provider and have the SIM blocked and the number protected against porting.',
                    'Sign out of all sessions on your email, bank and password manager.',
                    'Freeze your cards in your banking app if payment cards were stored on it.',
                ],
            },
            {
                h: 'Then, today',
                kind: 'do',
                steps: [
                    'Report the theft to the police and get a reference — insurers and banks will ask.',
                    'Remove the device from the trusted-device lists on your accounts.',
                    'Change the passwords of anything that was logged in on it, especially work accounts.',
                    'Tell your employer if it was a work device or held work mail — that is their incident too, and the clock matters for them.',
                    'Report the IMEI to your carrier so the handset can be blacklisted.',
                ],
            },
            {
                h: 'Before the next time',
                kind: 'note',
                steps: [
                    'Use a six-digit or alphanumeric passcode and cover your hand. Watching the passcode is the whole attack.',
                    'Turn on the setting that requires biometrics to change account settings — iOS Stolen Device Protection and its equivalents exist precisely for this.',
                    'Hide message previews on the lock screen so one-time codes are not readable through the glass.',
                ],
            },
        ],
        terms: ['shoulder-surfing', 'sim-swap', 'encryption'],
        defend: ['phone-lock', 'recovery-paths'],
        plays: ['account-takeover', 'sim-lost-signal'],
        keys: 'phone stolen laptop stolen lost my phone theft passcode seen remote wipe find my iphone stolen device what to do',
    },

    {
        id: 'deepfake-call',
        aud: 'user',
        cat: 'people',
        title: 'Someone I know called and asked for money — was it really them?',
        glyph: '🎭',
        urgency: 'high',
        clock: 'The urgency in the call is manufactured. There is always time to hang up and call back.',
        lede: 'A few seconds of audio from a voicemail greeting or a social post is now enough to clone a voice convincingly on a phone line. Video calls can be synthesised too. So the voice is no longer evidence — only a callback on a number you already had is.',
        signs: [
            'A relative in sudden trouble: an accident, an arrest, a hospital, a phone that broke.',
            'A new or withheld number, or a message that says "this is my new number".',
            'Urgency plus secrecy: "don’t tell Dad", "I’m too embarrassed", "there’s no time".',
            'The payment method is untraceable: transfer, crypto, gift cards, or cash to a courier.',
        ],
        sections: [
            {
                h: 'If the call is happening now',
                kind: 'first',
                steps: [
                    'Say you will call straight back, and hang up. This is always acceptable, and a real relative will not mind.',
                    'Call the number **you already have saved** for that person. Not the one that just called.',
                    'If they do not answer, call someone else in the family before doing anything financial.',
                    'Ask the agreed code word, or something only they would know that is not on social media. "What did we eat at your birthday?" beats "what is your mother’s name".',
                ],
            },
            {
                h: 'If you already sent money',
                kind: 'do',
                steps: [
                    'Phone your bank immediately and ask for a recall — the window is hours.',
                    'Report to the police and the national fraud service.',
                    'Preserve the number, the messages and the payment details.',
                    'Follow the full **tricked into sending money** playbook.',
                ],
            },
            {
                h: 'Set this up today',
                kind: 'note',
                steps: [
                    'Agree a **family code word** in person, with everyone including older relatives. It costs nothing and defeats a perfect voice clone in one second.',
                    'Make the rule explicit and say it out loud: nobody in this family will ever be annoyed at being called back to check.',
                    'Consider what is public: a voicemail greeting, a podcast appearance or a video post is enough source audio.',
                ],
            },
        ],
        terms: ['deepfake', 'emergency-scam', 'impersonation', 'vishing', 'code-word'],
        defend: ['verify-a-human', 'protect-elders'],
        plays: ['money-transfer', 'gave-code'],
        keys: 'ai voice scam deepfake call sounded like my son grandparent scam hi mum new number fake family emergency voice clone money',
    },

    {
        id: 'breach-notice',
        aud: 'user',
        cat: 'account',
        title: 'A company told me my data was breached',
        glyph: '🔦',
        urgency: 'normal',
        clock: 'No emergency unless passwords or financial details were included. Read what was taken first.',
        lede: 'Breach notifications are frightening and mostly vague. Your actual exposure depends entirely on what was taken, so start there rather than panicking uniformly. And be ready: the next few weeks will bring very convincing phishing that quotes real details from this breach.',
        signs: [
            'A notification from a company you have an account with.',
            'Your address appearing in a breach-notification service.',
        ],
        sections: [
            {
                h: 'Work out what was actually taken',
                kind: 'first',
                steps: [
                    '**Email address only** → low urgency. Expect more spam and better-targeted phishing.',
                    '**Password (even hashed)** → change it there and **everywhere you reused it**. This is the urgent case.',
                    '**Card details** → tell your bank, watch statements, consider replacing the card.',
                    '**Identity documents, national ID, passport scans** → most serious. Place a credit freeze or fraud notice and monitor your credit file.',
                    '**Security questions, date of birth, mother’s maiden name** → these are permanent. Change the answers to random strings wherever they are used.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Change the password on that service, and enable the strongest second factor it offers.',
                    'Run your password manager’s breach report and fix everything it flags.',
                    'Watch for the follow-up phishing — it will quote your real order, your real address or your real account number, because they have them.',
                    'Verify anything unexpected that follows by contacting the company through their own app or a number you already had.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not click links in the breach notification email itself. Fake breach notices are a standard follow-up. Go to the company’s site yourself.',
                    'Do not pay for a service promising to delete your data from criminal dumps. That is not a thing anyone can do.',
                ],
            },
        ],
        terms: ['data-breach', 'password-hash', 'dark-web', 'credential-stuffing', 'phishing'],
        defend: ['breach-check', 'password-hygiene', 'aliases'],
        plays: ['identity-theft', 'sextortion-threat'],
        keys: 'data breach notification my data was leaked company hacked my details what should i do breach letter password leaked',
    },

    {
        id: 'identity-theft',
        aud: 'user',
        cat: 'money',
        title: 'Someone is using my identity',
        glyph: '🪪',
        urgency: 'high',
        clock: 'Every week of delay is another application approved in your name. Freeze first, argue later.',
        lede: 'Accounts, loans or contracts opened in your name, letters about debts that are not yours, or a rejected application you never made. This is slower-moving than card fraud but much longer-lived, and the response is administrative: freeze, document, dispute, repeat.',
        signs: [
            'Letters or calls about credit you never applied for.',
            'A credit application refused for reasons you cannot explain.',
            'Post redirected, or bills stopping without explanation.',
            'A tax or benefits notice that does not match your situation.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Place a **credit freeze, protective registration or fraud notice** with the credit bureaus in your country. This is the single highest-value action.',
                    'Get your credit report from every bureau and read every line.',
                    'Report to the police and get a crime reference. Lenders will ask for it repeatedly.',
                    'Report to your national identity-theft or fraud service if one exists.',
                    'Tell your bank; ask them to flag the accounts and consider new numbers.',
                ],
            },
            {
                h: 'Then, methodically',
                kind: 'do',
                steps: [
                    'Dispute each fraudulent entry **in writing**, quoting the crime reference. Keep copies of everything.',
                    'Contact each lender’s fraud team directly — not customer service — and ask for their fraud claim process.',
                    'Check whether your post has been redirected without your consent; challenge it with the postal service.',
                    'Check your tax and benefits accounts for filings you did not make.',
                    'Keep a dated log: who, when, what was said, reference numbers. This log is what eventually wins the arguments.',
                ],
            },
            {
                h: 'Be patient with yourself',
                kind: 'note',
                steps: [
                    'Identity theft takes months to unwind and involves a lot of repetition to people who each know only their part. That is normal and not a sign it is going badly.',
                    'You are generally not liable for credit taken out fraudulently in your name, but you do have to prove it, and the paperwork is the proof.',
                    'If a lender keeps a fraudulent debt on your file despite the evidence, escalate: the financial ombudsman where one exists, a consumer-protection body, or a **consumer-rights lawyer or legal-aid clinic**. Free victim-support services in many countries will help with the letters.',
                ],
            },
        ],
        terms: ['identity-theft', 'data-breach', 'credit-freeze', 'doxxing'],
        defend: ['identity-armour', 'breach-check'],
        plays: ['breach-notice', 'card-fraud'],
        keys: 'identity theft accounts opened in my name loans i did not take credit fraud someone using my identity debt not mine',
    },

    {
        id: 'child-incident',
        aud: 'user',
        cat: 'people',
        title: 'Something has happened to my child online',
        glyph: '🧒',
        urgency: 'high',
        clock: 'Sextortion of a young person escalates within hours. Respond calmly and immediately.',
        lede: 'Whatever they did, the first thing out of your mouth decides how the next hours go. A child who believes they can tell you is a child you can protect. A child who fears losing their phone will go quiet, and the criminal is counting on exactly that.',
        signs: [
            'Sudden withdrawal, distress, or secrecy about a device.',
            'Requests for money, or money missing from an account.',
            'Contact from someone met in a game or on a social platform.',
            'Threats to share images.',
        ],
        sections: [
            {
                h: 'First minute',
                kind: 'first',
                steps: [
                    'Say it and mean it: *"You are not in trouble. I am glad you told me. We will sort this out."*',
                    'Do not take the phone away as a first response. It is evidence, it is their lifeline, and confiscating it teaches every other child in the house not to tell you.',
                    'Stop all replies to the person. Do not pay anything.',
                    'Screenshot everything before blocking: profiles, usernames, messages, payment details.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'If intimate images of a minor are involved, contact your country’s child-exploitation reporting line immediately. There are dedicated fast routes and takedown services and they work.',
                    'Report the account to the platform through its child-safety route, which is prioritised.',
                    'Report to the police.',
                    'Secure the accounts: change passwords, enable MFA, sign out of all sessions, set profiles private.',
                    'If money moved, follow the money playbooks and phone the bank.',
                    'If your child was asked to receive and forward money, that is **money muling** — say so to the bank early; it is a criminal offence they may not understand they committed.',
                ],
            },
            {
                h: 'Afterwards',
                kind: 'note',
                steps: [
                    'Get support for them, not just a lecture. Many countries have free confidential helplines for young people and for parents.',
                    'Agree what happens next time, in advance, calmly.',
                    'Their online life is not a privilege to be revoked as punishment for being victimised. Making that clear is the most effective long-term control you have.',
                ],
            },
        ],
        terms: ['sextortion', 'social-engineering', 'task-scam'],
        defend: ['protect-kids'],
        plays: ['sextortion-threat', 'money-transfer'],
        keys: 'my child was scammed teenager sextortion child online safety kid gave money game scam roblox scam my son was blackmailed',
    },

    {
        id: 'not-sure',
        aud: 'user',
        cat: 'phish',
        title: 'Nothing obvious happened but something feels wrong',
        glyph: '🌫',
        urgency: 'normal',
        clock: 'No rush. Use the time to check properly rather than worrying vaguely.',
        lede: 'Vague unease is worth acting on — people are usually reacting to something real they have not consciously named yet. Here is a fifteen-minute sweep that either finds it or lets you stop thinking about it.',
        signs: [
            'A message you half-remember interacting with.',
            'A device behaving slightly differently.',
            'A notification you dismissed and cannot now find.',
        ],
        sections: [
            {
                h: 'The fifteen-minute sweep',
                kind: 'do',
                steps: [
                    '**Email:** check forwarding rules, filters, recovery address, connected apps, and recent sign-in activity.',
                    '**Bank:** scan the last month for small unrecognised charges, and check the payee list.',
                    '**Phone:** look for apps you did not install, and for device-management or VPN profiles you did not add.',
                    '**Browser:** review extensions, home page and default search engine.',
                    '**Accounts:** open the security page of your main accounts and check registered devices and MFA methods.',
                    '**Breaches:** run your password manager’s breach report, or check your addresses on a breach-notification service.',
                ],
            },
            {
                h: 'If the sweep finds something',
                kind: 'note',
                steps: [
                    'Forwarding rule you did not create → **my email is being read**.',
                    'Unfamiliar charges → **money has left my account**.',
                    'Unknown devices on an account → change the password and sign out of all sessions.',
                    'Unknown apps or profiles on the phone → the **phone or tablet** playbook walks the removal, per platform.',
                    'Strange extensions, changed search engine, pop-ups → the **computer malware** playbook sorts it out in order.',
                ],
            },
            {
                h: 'If it finds nothing',
                kind: 'note',
                steps: [
                    'Spend the leftover worry on the defence bench instead: a passkey on your email, unique passwords, transaction alerts.',
                    'Those three take under an hour and remove most of the scenarios you are imagining.',
                ],
            },
        ],
        terms: ['phishing', 'data-breach'],
        defend: ['email-first', 'mfa-upgrade', 'money-alarms'],
        plays: ['mailbox-compromise', 'card-fraud', 'phone-malware', 'computer-malware'],
        keys: 'i think i was hacked something feels wrong am i hacked not sure what happened worried about my accounts check if i was hacked',
    },

    /* ====================================================================== */
    /* ============================ RESPONDER =============================== */
    /* ====================================================================== */

    {
        id: 'pro-reported-phish',
        aud: 'pro',
        cat: 'email',
        title: 'A user reported a suspicious message',
        glyph: '📨',
        urgency: 'normal',
        clock: 'Triage inside 30 minutes. If anyone interacted, the clock changes character entirely.',
        lede: 'Most reports are benign and a few are the first visible edge of an active campaign. Triage in a fixed order so the expensive question — did anyone interact — is answered before the interesting one, which is what the payload does.',
        signs: [
            'A report via the phishing button, the security mailbox, or the service desk.',
            'A user asking "is this real?" — treat identically.',
        ],
        sections: [
            {
                h: 'Triage order',
                kind: 'first',
                steps: [
                    'Acknowledge the reporter within minutes and **thank them explicitly**. Report rate is the metric that shortens real incidents; every unacknowledged report costs you future ones.',
                    'Ask the one question that changes everything: **did you click, enter anything, or open the attachment?** If yes, switch to the credential or endpoint playbook now.',
                    'Pull the full headers and the original message. Record sender, reply-to, envelope sender, authentication results, originating IP and any URLs or attachment hashes.',
                    'Scope the campaign: search the mail estate for the same sender, subject, URL domain, attachment hash and sending infrastructure. Assume the reporter is not the only recipient.',
                    'Determine delivery status per recipient: delivered, junked, or quarantined. Delivered-and-read is the population you care about.',
                ],
            },
            {
                h: 'Contain',
                kind: 'do',
                steps: [
                    'Purge or soft-delete the message from all mailboxes where it landed.',
                    'Block the sender domain, the URL domain and the file hash at mail gateway, proxy and DNS. Expect the infrastructure to rotate within hours.',
                    'Detonate URLs and attachments in a sandbox from a non-attributable network, not from a corporate address.',
                    'Check proxy and DNS logs for anyone who reached the URL, including from mobile — a QR-delivered lure will not appear in mail-click telemetry at all.',
                    'If any recipient interacted, treat their identity as compromised and move to the credential playbook without waiting for confirmation.',
                ],
            },
            {
                h: 'Close the loop',
                kind: 'note',
                steps: [
                    'Tell the reporter what it turned out to be. This single habit does more for reporting culture than any awareness campaign.',
                    'If it was a targeted or credential-harvesting campaign, brief the wider organisation with the specific lure, not a generic warning.',
                    'Record IOCs and, more usefully, the technique. Infrastructure rotates; the pattern does not.',
                ],
            },
        ],
        queries: [
            { label: 'Microsoft 365 — hunt delivered messages', lang: 'KQL', q: 'EmailEvents\n| where Timestamp > ago(7d)\n| where SenderFromDomain == "<domain>" or Subject has "<subject fragment>"\n| project Timestamp, SenderFromAddress, RecipientEmailAddress, Subject, DeliveryAction, DeliveryLocation, NetworkMessageId' },
            { label: 'Microsoft 365 — who actually clicked', lang: 'KQL', q: 'UrlClickEvents\n| where Timestamp > ago(7d)\n| where Url has "<domain>"\n| project Timestamp, AccountUpn, Url, ActionType, IsClickedThrough, NetworkMessageId' },
        ],
        terms: ['phishing', 'aitm', 'quishing', 'ioc'],
        defend: ['org-identity'],
        plays: ['pro-user-clicked', 'pro-mass-campaign'],
        keys: 'user reported phishing email triage phishing report soc analyst phishing investigation purge message hunt campaign',
    },

    {
        id: 'pro-user-clicked',
        aud: 'pro',
        cat: 'identity',
        title: 'A user entered credentials on a phishing page',
        glyph: '🎣',
        urgency: 'critical',
        clock: 'Automated kits authenticate within seconds. Session revocation is the only step with real urgency.',
        lede: 'Assume the credential and the session are both gone, and assume the second factor did not help — modern kits relay it live. A password reset without token revocation leaves the attacker signed in, and that is the single most common failure in this response.',
        signs: [
            'Self-reported credential entry, or click telemetry to a known harvesting domain.',
            'Sign-in from an unfamiliar ASN with no failed attempts and no MFA challenge.',
        ],
        sections: [
            {
                h: 'Contain — in this order',
                kind: 'first',
                steps: [
                    '**Revoke all sessions and refresh tokens** for the identity. Do this before the password reset; a password change alone does not invalidate an issued token.',
                    'Reset the password, and require re-registration of MFA if any method may have been added.',
                    'Review registered authentication methods and remove anything registered since the earliest suspicious activity. **A new MFA method is the attacker’s persistence.**',
                    'Review OAuth grants and app consents for that identity and revoke anything unexpected.',
                    'Check for new mailbox rules, forwarding, delegation and "send as" permissions.',
                    'If device compliance policies exist, confirm the attacker cannot re-enter from an unmanaged device.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Establish the earliest credible compromise time, not the first alert. Scope everything from there.',
                    'Pull sign-in logs: source IPs, ASNs, user agents, device IDs, conditional-access results, and whether MFA was satisfied or skipped.',
                    'Enumerate the blast radius: mailbox contents, shared and delegated mailboxes, files, SaaS reachable via SSO, admin roles, standing privileges, API keys.',
                    'Search sent items and audit logs for messages sent as the user — especially anything touching payments or credentials.',
                    'Check whether the same credential is used anywhere outside SSO: VPN, legacy protocols, service accounts, personal reuse on corporate systems.',
                ],
            },
            {
                h: 'Recover and follow through',
                kind: 'do',
                steps: [
                    'Have the user re-enrol with a phishing-resistant method. If you were ever going to prioritise FIDO2 rollout, this is the person to start with.',
                    'Notify recipients of any fraudulent mail sent from the account, quickly, before it lands.',
                    'If finance data was reachable, warn the finance team explicitly — a BEC attempt frequently follows within days.',
                    'Assess notification obligations if personal data was accessible. The clock started at discovery, not at conclusion.',
                ],
            },
            {
                h: 'Pull the evidence — before it ages out',
                kind: 'evidence',
                steps: [
                    '**Message trace first.** Roughly 10 days of retention, and it shows what was sent from the mailbox in the user’s name.',
                    '**Sign-in logs, all four tables**: interactive, **non-interactive**, service principal, managed identity. Non-interactive is where a replayed token appears — reading only the interactive table is the most common reason a real compromise gets closed as benign.',
                    '**Audit logs** for the full window. Export JSON rather than CSV; the CSV drops the old and new values that show what actually changed.',
                    '**Purview Unified Audit Log** — `MailItemsAccessed` answers "did they actually read it" and is in Audit **Standard**, on by default for E3/E5 mailboxes; plus sends, rules, forwarding, downloads, sharing, and the search queries, which are often the clearest statement of intent you will get.',
                    '**Defender**: `EmailEvents` and `UrlClickEvents` for delivery and click evidence, `CloudAppEvents` for mailbox rule creation.',
                    '**Graph activity logs** if enabled — the difference between "had permission" and "read everything".',
                    'Record which logs you did **not** have. A gap you name is a finding; a gap you omit is a false reassurance.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not reset the password and consider it done. Without token revocation the session survives.',
                    'Do not skip the MFA-method review. It is the most common re-entry route and it is invisible in a password audit.',
                    'Do not conclude "no evidence of access" when you mean "the log that would show access is not enabled". Name which.',
                    'Do not blame or discipline the reporter. It converts your next incident from a 30-minute one into a three-week one.',
                ],
            },
        ],
        queries: [
            { label: 'Entra ID — sign-ins for the identity', lang: 'KQL', q: 'SigninLogs\n| where TimeGenerated > ago(14d)\n| where UserPrincipalName =~ "<upn>"\n| project TimeGenerated, IPAddress, Location, AppDisplayName, UserAgent, AuthenticationRequirement, ResultType, ConditionalAccessStatus\n| order by TimeGenerated asc' },
            { label: 'Entra ID — auth method and consent changes', lang: 'KQL', q: 'AuditLogs\n| where TimeGenerated > ago(30d)\n| where OperationName has_any ("security info", "authentication method", "Consent to application", "Add app role assignment")\n| project TimeGenerated, OperationName, InitiatedBy, TargetResources' },
        ],
        terms: ['aitm', 'session-hijacking', 'containment', 'blast-radius'],
        defend: ['org-identity'],
        plays: ['pro-token-theft', 'pro-inbox-rules', 'pro-oauth-grant', 'pro-log-collection', 'pro-device-code', 'pro-helpdesk'],
        keys: 'user entered credentials phishing response revoke sessions reset password token revocation compromised account incident response identity which logs to check',
    },

    {
        id: 'pro-token-theft',
        aud: 'pro',
        cat: 'identity',
        title: 'Session token theft — logged in without a password',
        glyph: '🍪',
        urgency: 'critical',
        clock: 'Tokens live for hours by default. Revoke, then verify revocation actually took effect.',
        lede: 'Either an AiTM proxy relayed the login and kept the cookie, or an infostealer took it from the browser. Either way the attacker holds a valid authenticated session and never needs your password or your MFA again until it expires.',
        signs: [
            'Successful sign-in with **no** failed attempts and no MFA interaction.',
            'A familiar-looking user agent from an unfamiliar ASN, often a residential proxy or a hosting provider.',
            'Activity continuing after a password reset.',
            'Anomalous session with a device ID that matches nothing in your estate.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Revoke refresh tokens and sign the user out of all sessions across every identity provider and federated application.',
                    'Reset the password **after** revocation, so a stolen token cannot be used to reset it back.',
                    'Where available, enable token protection / token binding and continuous access evaluation so revocation propagates in minutes rather than at token expiry.',
                    'Block the attacker infrastructure by ASN or IP where you can do so without collateral damage, as a stopgap only.',
                    'If the source was an infostealer, the endpoint is compromised: isolate it and treat every credential entered on it as burned.',
                    '**Verify revocation worked.** Confirm the session is actually gone rather than assuming the button did it — recheck activity fifteen minutes later.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Distinguish the two sources: an AiTM login has a corresponding phishing click; an infostealer has an endpoint event and usually more than one service affected at once.',
                    'If infostealer: enumerate everything the browser profile held — saved passwords, cookies, autofill, wallet files, VPN configs — and treat all of it as disclosed.',
                    'Correlate the same source infrastructure across other identities. Token theft is rarely singular.',
                    'Check for persistence established during the session: MFA methods, app consents, mailbox rules, delegations, device registrations, PIM eligibility.',
                ],
            },
            {
                h: 'Harden',
                kind: 'note',
                steps: [
                    'FIDO2 or certificate-based authentication prevents the AiTM variant outright — the credential will not function on the proxy domain.',
                    'Device-bound sessions and compliant-device conditional access prevent the stolen-cookie variant from replaying off an unmanaged host.',
                    'Shorten session lifetimes for high-privilege roles and require reauthentication for sensitive operations.',
                ],
            },
        ],
        queries: [
            { label: 'Sign-ins satisfying MFA by prior claim', lang: 'KQL', q: 'SigninLogs\n| where TimeGenerated > ago(7d)\n| extend detail = tostring(AuthenticationDetails)\n| where detail has "previously satisfied"\n| summarize count(), make_set(IPAddress), make_set(UserAgent) by UserPrincipalName, AppDisplayName\n| order by count_ desc' },
        ],
        terms: ['session-hijacking', 'aitm', 'infostealer', 'containment'],
        defend: ['org-identity'],
        plays: ['pro-user-clicked', 'pro-infostealer'],
        keys: 'token theft session hijack pass the cookie aitm evilginx logged in without mfa revoke refresh tokens stolen session',
    },

    {
        id: 'pro-impossible-travel',
        aud: 'pro',
        cat: 'identity',
        title: 'Sign-ins from three continents in one hour',
        glyph: '🌍',
        urgency: 'high',
        clock: 'Triage within the hour. Most are benign; the ones that are not are already at the persistence stage.',
        lede: 'Impossible travel is a noisy signal with a poor base rate — VPNs, mobile roaming, corporate egress and cloud relays generate it constantly. So do not react to the geography. React to the supporting signals, and have a fixed set of them.',
        signs: [
            'Geographically incompatible successful sign-ins within a short window.',
            'Multiple ASNs, especially hosting providers, VPN exit nodes or residential proxy networks.',
        ],
        sections: [
            {
                h: 'Triage before containing',
                kind: 'first',
                steps: [
                    'Rule out the boring explanations first: corporate VPN egress, a personal VPN, roaming, an inspection proxy, a mobile carrier NAT, a legitimately travelling user, and automation running under a user identity.',
                    'Contact the user out of band — phone or chat, not email. Ask if they are travelling and whether they use a VPN.',
                    'Check the **corroborating** signals rather than the location: unfamiliar user agent, unmanaged device, absent MFA interaction, new device registration, first-seen ASN.',
                    'Check whether MFA was actually performed or satisfied by a prior claim. "Satisfied by claim in the token" alongside impossible travel is the token-theft signature.',
                ],
            },
            {
                h: 'If it is real, contain',
                kind: 'do',
                steps: [
                    'Revoke sessions and refresh tokens, then reset the password.',
                    'Review and clean authentication methods, app consents, mailbox rules and delegated access.',
                    'Enumerate what was accessed during the anomalous window: mail, files, SaaS, admin actions.',
                    'Check whether the identity holds privileged roles or standing access to anything sensitive, and whether any of it was used.',
                    'Pivot on the source infrastructure across all identities — the same ASN often shows several victims.',
                ],
            },
            {
                h: 'Reduce the noise permanently',
                kind: 'note',
                steps: [
                    'Baseline and exclude your own egress and known VPN ranges so the alert means something.',
                    'Alert on the combination — anomalous location **plus** new device **plus** no MFA interaction — rather than on location alone.',
                    'Track your false-positive rate. An alert nobody trusts is worse than no alert, because it trains the team to close it unread.',
                ],
            },
        ],
        queries: [
            { label: 'Distinct countries and ASNs per user', lang: 'KQL', q: 'SigninLogs\n| where TimeGenerated > ago(24h) and ResultType == 0\n| summarize countries = make_set(tostring(LocationDetails.countryOrRegion)),\n            asns = make_set(AutonomousSystemNumber),\n            ips = dcount(IPAddress)\n          by UserPrincipalName\n| where array_length(countries) > 2\n| order by ips desc' },
        ],
        terms: ['session-hijacking', 'aitm', 'blast-radius', 'ioc'],
        defend: ['org-identity'],
        plays: ['pro-token-theft', 'pro-user-clicked'],
        keys: 'impossible travel anomalous sign in logged in from different continents atypical travel alert triage geo anomaly soc',
    },

    {
        id: 'pro-mfa-anomaly',
        aud: 'pro',
        cat: 'identity',
        title: 'MFA push spam, or a second factor appeared from nowhere',
        glyph: '🔔',
        urgency: 'critical',
        clock: 'Push spam means the password is already known. A new MFA method means they are already in.',
        lede: 'Two related signals with the same root cause. Repeated push requests mean a valid password is in hostile hands. A newly registered authentication method means the account was accessed and the attacker has now made themselves permanent.',
        signs: [
            'A burst of MFA requests for one user, often out of hours.',
            'A new authenticator, phone number or FIDO key registered shortly after an unusual sign-in.',
            'A user reporting a call from "IT" asking them to approve the next prompt.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Treat the password as compromised regardless of whether any prompt was approved. Reset it.',
                    'Revoke sessions and refresh tokens.',
                    'Audit registered authentication methods and remove anything registered outside a known-good window. Force re-registration under supervision.',
                    'Check whether the user was contacted by phone — attacker-initiated helpdesk calls accompany this technique and mean a more determined adversary.',
                    'Check the actual helpdesk too: verify no assisted reset or MFA re-enrolment was performed for this user on a social-engineering call.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Where did the password come from? Check for a matching phishing click, an infostealer log, or a credential-stuffing pattern.',
                    'Look for the same technique across other identities in the same time window.',
                    'If a method was added, treat the account as accessed and enumerate the blast radius fully.',
                ],
            },
            {
                h: 'Fix the class',
                kind: 'note',
                steps: [
                    'Enable number matching and additional context on push, so blind approval stops being possible.',
                    'Alert on MFA-method registration as a first-class detection, not a report line.',
                    'Harden the helpdesk identity-verification process. Assisted MFA resets are a well-worn route into large organisations, and a scripted callback requirement closes it.',
                    'Rate-limit or lock out on repeated push denials rather than letting the attacker keep trying.',
                ],
            },
        ],
        queries: [
            { label: 'Repeated MFA denials or timeouts', lang: 'KQL', q: 'SigninLogs\n| where TimeGenerated > ago(24h)\n| where ResultType in ("500121", "50074", "50076")\n| summarize attempts = count(), ips = make_set(IPAddress) by UserPrincipalName, bin(TimeGenerated, 1h)\n| where attempts > 5\n| order by attempts desc' },
        ],
        terms: ['mfa-fatigue', 'mfa', 'credential-stuffing'],
        defend: ['org-identity'],
        plays: ['pro-user-clicked', 'pro-token-theft'],
        keys: 'mfa fatigue push bombing new mfa method registered authenticator added helpdesk social engineering mfa reset detection',
    },

    {
        id: 'pro-oauth-grant',
        aud: 'pro',
        cat: 'identity',
        title: 'A malicious app was granted access',
        glyph: '✅',
        urgency: 'high',
        clock: 'The grant survives password resets. Until it is revoked, nothing you have done has removed access.',
        lede: 'Consent phishing bypasses the credential entirely: the user approves a genuine OAuth prompt and the attacker receives durable, token-based access to mail or files. Password resets, MFA re-enrolment and session revocation all leave it untouched. It must be revoked as its own object.',
        signs: [
            'A consent grant to a low-reputation, recently-registered or low-user-count application.',
            'Mail or file scopes — `Mail.Read`, `Mail.ReadWrite`, `Files.Read.All`, `offline_access`.',
            'Multiple users consenting to the same application in a short window.',
            'Data access continuing after a full credential reset.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Revoke the service principal’s consent and delete the enterprise application or service principal.',
                    'Revoke refresh tokens for every affected user — the grant issues its own tokens.',
                    'Disable user consent for applications, or restrict it to verified publishers with low-risk permissions only, and enable an admin consent workflow.',
                    'Identify every user who consented, not only the reported one.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Review the application’s audit trail: when it was granted, by whom, from where, and what it accessed.',
                    'Establish what data the scopes actually reached, and treat all of it as accessed unless you can prove otherwise.',
                    'Check for additional persistence created via the app: mailbox rules, forwarding, added credentials on the app registration itself.',
                    'Look for other applications sharing the same reply URL, publisher or infrastructure.',
                ],
            },
            {
                h: 'Prevent',
                kind: 'note',
                steps: [
                    'Restrict end-user consent by default. This is a single setting and it removes an entire attack class.',
                    'Alert on new service principal creation, new credentials added to an existing app registration, and consent to apps with mail or file scopes.',
                    'Periodically review enterprise applications with high-privilege permissions and no owner.',
                ],
            },
        ],
        queries: [
            { label: 'Consent grants in the last 30 days', lang: 'KQL', q: 'AuditLogs\n| where TimeGenerated > ago(30d)\n| where OperationName in ("Consent to application", "Add delegated permission grant", "Add app role assignment to service principal")\n| extend app = tostring(TargetResources[0].displayName)\n| project TimeGenerated, OperationName, app, InitiatedBy, Result\n| order by TimeGenerated desc' },
        ],
        terms: ['oauth-consent', 'eradication', 'blast-radius'],
        defend: ['org-identity'],
        plays: ['pro-user-clicked', 'pro-inbox-rules'],
        keys: 'oauth consent phishing illicit consent grant malicious app enterprise application revoke service principal app consent attack',
    },

    {
        id: 'pro-inbox-rules',
        aud: 'pro',
        cat: 'email',
        title: 'Suspicious mailbox rules or forwarding appeared',
        glyph: '📋',
        urgency: 'critical',
        clock: 'A forwarding rule is exfiltration in progress. It is also usually the last visible step before a payment is diverted.',
        lede: 'This is one of the highest-fidelity signals in the whole discipline. Attackers create rules to hide their own activity — moving replies out of sight so the real user never notices the conversation happening in their name. Where you find one, look for a payment.',
        signs: [
            'A rule with a blank, single-character or punctuation name.',
            'Rules moving mail to RSS Feeds, Archive, Conversation History or Deleted Items.',
            'Rules keyed on `invoice`, `payment`, `bank`, `IBAN`, `remittance`, `wire`, `password`, `security`.',
            'External auto-forwarding, or a changed reply-to on the mailbox.',
            'New delegate or "send as" permissions.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Screenshot or export the rules before removing them.** Names, conditions and actions are evidence and they are trivially lost.',
                    'Remove the rules and forwarding; disable external auto-forwarding tenant-wide if it is not a business requirement.',
                    'Revoke sessions and reset credentials for the mailbox owner.',
                    'Audit authentication methods, app consents and delegate permissions on the mailbox.',
                    '**Assume BEC is in progress.** Search sent items and the rule’s target folder for financial conversations immediately.',
                ],
            },
            {
                h: 'Investigate',
                kind: 'do',
                steps: [
                    'Determine when the rule was created, from what IP, and by which session. That timestamp is your compromise anchor.',
                    'Reconstruct the hidden conversation from the target folder — that is the part the user never saw.',
                    'Identify external parties involved and whether any payment instruction was sent or altered.',
                    'Check whether the attacker registered a lookalike domain to continue the thread after eviction. They usually have.',
                    'Search the tenant for the same rule pattern across all mailboxes.',
                ],
            },
            {
                h: 'Notify',
                kind: 'do',
                steps: [
                    'Warn counterparties in any hijacked thread by phone, using numbers held before the incident.',
                    'Alert finance to halt and re-verify any payment discussed in the affected threads.',
                    'Assess personal-data notification obligations — mailbox contents are usually personal data, and the clock started at discovery.',
                ],
            },
        ],
        queries: [
            { label: 'New inbox rules from audit logs', lang: 'KQL', q: 'CloudAppEvents\n| where Timestamp > ago(30d)\n| where ActionType in ("New-InboxRule", "Set-InboxRule", "UpdateInboxRules")\n| extend params = tostring(RawEventData.Parameters)\n| where params has_any ("ForwardTo", "RedirectTo", "DeleteMessage", "MoveToFolder")\n| project Timestamp, AccountDisplayName, ActionType, IPAddress, params' },
        ],
        terms: ['bec', 'invoice-fraud', 'eradication', 'containment'],
        defend: ['org-identity', 'org-payments'],
        plays: ['pro-payment-fraud', 'pro-user-clicked'],
        keys: 'malicious inbox rule forwarding rule detection bec investigation mailbox rule hidden folder rss feeds rule exfiltration email',
    },

    {
        id: 'pro-payment-fraud',
        aud: 'pro',
        cat: 'fraud',
        title: 'A payment was diverted to a fraudulent account',
        glyph: '🏦',
        urgency: 'critical',
        clock: 'Recall attempts succeed in hours, rarely in days. The banking call outranks the forensics.',
        lede: 'Two workstreams start simultaneously and neither waits for the other: recover the money, and find whose mailbox was open. Assign different people. The bank call is the one with the hard deadline.',
        signs: [
            'A supplier reports non-payment for an invoice you have paid.',
            'A payment made to bank details changed by email.',
            'An urgent out-of-process transfer authorised by a "senior" request.',
        ],
        sections: [
            {
                h: 'Money track — start immediately',
                kind: 'first',
                steps: [
                    'Phone your bank and request an immediate recall, with exact amount, timestamp and beneficiary details.',
                    'Ask them to contact the beneficiary bank to freeze remaining funds. That request is what actually stops it.',
                    'Halt all other pending payments to that counterparty pending voice verification on a pre-held number.',
                    'Notify your insurer — crime and cyber policies often have short notification windows and will otherwise decline.',
                    'Report to police and the national fraud reporting service; get the reference for the insurer.',
                ],
            },
            {
                h: 'Investigation track — in parallel',
                kind: 'do',
                steps: [
                    'Preserve the full email thread **with headers**, both sides if the counterparty will cooperate.',
                    'Determine which mailbox was compromised: yours, theirs, or neither (a lookalike domain and no compromise at all).',
                    'Check your own tenant for the identity indicators: anomalous sign-ins, new rules, forwarding, consent grants.',
                    'If it was your side, run the identity compromise playbook in full and establish the earliest access date.',
                    'If it was their side, tell them plainly and in writing — their other customers are being defrauded right now.',
                    'Check for a registered lookalike domain and get it taken down.',
                ],
            },
            {
                h: 'Afterwards',
                kind: 'note',
                steps: [
                    'The control that prevents recurrence is procedural, not technical: **bank-detail changes are verified by voice, on a number held before the request.** No exception, no seniority override.',
                    'Add dual authorisation above a threshold, and write down that urgency and confidentiality are never grounds to bypass it.',
                    'Do not discipline the person who made the payment if the process permitted it. Fix the process, or you will simply lose the next person too.',
                ],
            },
        ],
        terms: ['bec', 'invoice-fraud', 'ceo-fraud', 'chain-of-custody'],
        defend: ['org-payments', 'org-identity'],
        plays: ['pro-inbox-rules', 'invoice-changed'],
        keys: 'payment diverted bec incident invoice fraud response recall payment wire fraud supplier compromise finance incident',
    },

    {
        id: 'pro-infostealer',
        aud: 'pro',
        cat: 'endpoint',
        title: 'Infostealer on an endpoint, or corporate credentials in a stealer log',
        glyph: '🧲',
        urgency: 'critical',
        clock: 'Exfiltration completed before you were alerted. You are working on consequences, not prevention.',
        lede: 'Scope by data rather than by device. The endpoint is one hour of work; the credentials it held are weeks of it. Treat every secret that touched that browser profile as disclosed, including ones the user forgot were there.',
        signs: [
            'EDR detection of a known stealer family, or a suspicious process touching browser credential stores.',
            'Corporate credentials appearing in a threat-intelligence feed or a stealer log dump.',
            'Multiple unrelated services showing anomalous access for one user at once.',
            'Cracked-software, game-cheat or ClickFix execution telemetry.',
        ],
        sections: [
            {
                h: 'Contain',
                kind: 'first',
                steps: [
                    'Network-isolate the endpoint via EDR. Do not power it off — you lose memory and live session state.',
                    'Revoke sessions and reset credentials for every account the user held, from a **different** device.',
                    'Revoke and reissue any certificates, API keys, SSH keys, VPN profiles and tokens present on the host.',
                    'Reset any shared or service account whose credentials were stored in that browser profile or in files on the host.',
                    'Check for and remove persistence: scheduled tasks, run keys, services, browser extensions, new local accounts.',
                ],
            },
            {
                h: 'Scope',
                kind: 'do',
                steps: [
                    'Enumerate the browser profiles present and what each stored — saved logins, cookies, autofill, payment methods.',
                    'If a stealer log is available through threat intelligence, use it: it lists exactly what was taken, which beats guessing.',
                    'Hunt the initial access: cracked software, fake update, malvertising download, ClickFix paste. Then hunt that same vector across the estate.',
                    'Check for lateral use of the stolen credentials, especially against VPN, remote access and SaaS.',
                    'Include personal accounts in the conversation with the user. Their personal email is a recovery route into work systems.',
                ],
            },
            {
                h: 'Recover',
                kind: 'do',
                steps: [
                    '**Rebuild the host from known-good media.** Cleaning is not remediation for credential theft that has already succeeded.',
                    'Restore data from backup only after validating it, and never restore browser profiles.',
                    'Confirm the user re-enrols MFA and does not restore saved passwords from a synced profile.',
                    'Consider blocking the initial-access vector at policy level — application control, download reputation, or removing local admin.',
                ],
            },
        ],
        queries: [
            { label: 'Processes touching browser credential stores', lang: 'KQL', q: 'DeviceFileEvents\n| where Timestamp > ago(7d)\n| where FileName in~ ("Login Data", "Cookies", "Web Data", "Local State", "key4.db", "logins.json")\n| where InitiatingProcessFileName !in~ ("chrome.exe", "msedge.exe", "firefox.exe", "brave.exe")\n| project Timestamp, DeviceName, InitiatingProcessFileName, InitiatingProcessCommandLine, FolderPath' },
        ],
        terms: ['infostealer', 'clickfix', 'session-hijacking', 'eradication'],
        defend: ['org-identity'],
        plays: ['pro-token-theft', 'pro-ransomware'],
        keys: 'infostealer incident stealer log corporate credentials leaked browser credential theft endpoint compromise rebuild host edr',
    },

    {
        id: 'pro-ransomware',
        aud: 'pro',
        cat: 'endpoint',
        title: 'Ransomware, or the precursors to it',
        glyph: '🔒',
        urgency: 'critical',
        clock: 'If you have caught precursors, you have hours. If encryption has started, you have minutes to limit spread.',
        lede: 'The encryption is the last act, typically days or weeks after initial access. If you are seeing precursors — credential dumping, backup deletion, defence tampering, mass discovery — you are inside the window where the outcome is still decidable. Act like it.',
        signs: [
            '**Precursors:** shadow copy deletion, backup agent tampering, security tooling disabled, mass file discovery, new domain admin, Cobalt Strike or similar beaconing, legitimate remote-access tools appearing on servers.',
            '**In progress:** mass file renames, ransom notes appearing across shares, sudden CPU and disk load on file servers.',
        ],
        sections: [
            {
                h: 'First thirty minutes',
                kind: 'first',
                steps: [
                    'Declare an incident formally. Move the team to the pre-agreed out-of-band channel; assume email and chat are visible to the adversary.',
                    'Isolate rather than shut down. Preserve memory and live state where you can.',
                    'Protect the backups before anything else: disconnect, make immutable, verify they exist and are restorable. Backups are targeted first, deliberately.',
                    'Disable the identities and remote-access paths being used, and reset the accounts used for lateral movement — including any service accounts and the break-glass ones if they were touched.',
                    'Segment: shut down inter-site links and flat-network paths that permit spread, accepting the operational cost.',
                    'Start the log now — a running timeline of actions and times. Everything downstream depends on it.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Engage insurer, legal counsel and external DFIR before technical decisions narrow your options. Involve legal early if privilege matters in your jurisdiction.',
                    'Identify initial access, dwell time and the accounts used. Scope from the earliest credible evidence, not from the first alert.',
                    'Establish whether data was exfiltrated — that determines the notification obligations regardless of whether you restore cleanly.',
                    'Preserve forensic images before rebuilding anything you might later need to explain.',
                    'Rebuild identity trust deliberately: assume the domain is compromised, plan a staged recovery, and reset `krbtgt` twice with the correct interval.',
                ],
            },
            {
                h: 'Decisions to have already made',
                kind: 'note',
                steps: [
                    'Who is authorised to disconnect what, at 3am, without further approval.',
                    'Whether payment is on the table at all — and who decides, with sanctions screening as a hard precondition.',
                    'Who speaks to staff, customers, press and the regulator, and who definitely does not.',
                    'Where the incident plan is stored such that it is readable when the domain is down.',
                    'None of these are answerable in the first hour. They are only answerable in advance.',
                ],
            },
        ],
        terms: ['ransomware', 'containment', 'eradication', 'dwell-time', 'chain-of-custody'],
        defend: ['org-readiness', 'backups'],
        plays: ['pro-infostealer', 'pro-comms'],
        keys: 'ransomware incident response encryption in progress shadow copies deleted backup deleted isolate contain krbtgt reset dfir',
    },

    {
        id: 'pro-mass-campaign',
        aud: 'pro',
        cat: 'email',
        title: 'The same lure hit fifty mailboxes',
        glyph: '🌊',
        urgency: 'high',
        clock: 'Purge and block first, investigate second. Interaction continues while you analyse.',
        lede: 'At scale the arithmetic changes: assume some percentage interacted before you were told, and work from the recipient list rather than from the reports. The reported messages are a sample, not the population.',
        signs: [
            'Multiple reports of the same lure within a short window.',
            'A shared sender infrastructure, URL pattern or attachment hash across many recipients.',
            'A spike in authentication failures or anomalous sign-ins shortly after delivery.',
        ],
        sections: [
            {
                h: 'Contain at scale',
                kind: 'first',
                steps: [
                    'Purge from all mailboxes, including already-read messages, and record what was removed.',
                    'Block sender infrastructure, URL domains and file hashes at mail, proxy and DNS.',
                    'Extract the full recipient list and delivery status. That list, not the reports, is your investigation scope.',
                    'Cross-reference the recipient list against click telemetry, proxy logs and DNS logs — including mobile, which mail telemetry misses entirely.',
                    'Cross-reference against anomalous sign-ins in the same window and pre-emptively revoke sessions for anyone who both clicked and shows a sign-in anomaly.',
                ],
            },
            {
                h: 'Communicate',
                kind: 'do',
                steps: [
                    'Send one clear message to all recipients with the **specific** lure — the actual subject line and sender — not a generic reminder to be vigilant.',
                    'Give a single explicit instruction: "if you entered credentials, phone us on this number now, and you are not in trouble."',
                    'Brief the service desk with a script before they are flooded, and give them the containment steps they can perform themselves.',
                    'If the campaign impersonates a real partner or supplier, notify them — they may be the compromised source.',
                ],
            },
            {
                h: 'Then',
                kind: 'note',
                steps: [
                    'Measure time-to-first-report and total report count. Those two numbers are your actual detection capability for this class.',
                    'Look for the second wave. Mass campaigns are frequently followed by a targeted one using what the first wave learned.',
                ],
            },
        ],
        terms: ['phishing', 'aitm', 'ioc', 'blast-radius'],
        defend: ['org-identity'],
        plays: ['pro-reported-phish', 'pro-user-clicked'],
        keys: 'mass phishing campaign many users targeted purge messages tenant wide bulk phishing response recipient list',
    },

    {
        id: 'pro-lost-device',
        aud: 'pro',
        cat: 'endpoint',
        title: 'A corporate device was lost or stolen',
        glyph: '💼',
        urgency: 'high',
        clock: 'Act before the device is powered on again. Disk encryption buys you time, not immunity.',
        lede: 'Encryption at rest covers most of the risk if it was actually enabled, actually enforced and the device was actually locked. Verify all three rather than assuming, then treat the identity as the real exposure.',
        signs: ['Reported loss or theft of a laptop, phone or removable media holding corporate data.'],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    'Confirm from records that disk encryption was enabled and the recovery key is escrowed. Do not take it on trust.',
                    'Issue a remote wipe or retire command, and record the time. Note whether it was received or is pending.',
                    'Revoke sessions and refresh tokens for the user, and reset their credentials.',
                    'Remove the device from conditional-access trust, MDM compliance and any certificate-based access.',
                    'Revoke device certificates and any VPN profile bound to it.',
                    'Block the device ID at the identity provider so a stored session cannot be replayed.',
                ],
            },
            {
                h: 'Assess and record',
                kind: 'evidence',
                steps: [
                    'Determine what data was stored locally, not merely synced — local caches, downloads, PST files, exports.',
                    'Assess whether personal data was included and whether that triggers a notification obligation.',
                    'Record the loss circumstances, encryption status, wipe status and timeline. This record is the defensible artefact.',
                    'Confirm the police report reference where one exists.',
                ],
            },
            {
                h: 'Note',
                kind: 'note',
                steps: [
                    'An unlocked, running device is a far worse case than a powered-off encrypted one. Establish which it was.',
                    'For phones, the passcode is the real risk: if it was observed before the theft, the account is the target, not the handset.',
                ],
            },
        ],
        terms: ['containment', 'blast-radius'],
        defend: ['phone-lock', 'org-readiness'],
        plays: ['lost-device', 'pro-user-clicked'],
        keys: 'lost laptop stolen device corporate remote wipe intune retire encryption bitlocker data breach assessment device stolen',
    },

    {
        id: 'pro-exposed-secret',
        aud: 'pro',
        cat: 'endpoint',
        title: 'A key or secret was published somewhere public',
        glyph: '🔓',
        urgency: 'critical',
        clock: 'Public cloud keys are found and used by automated scrapers within minutes. Rotate first, explain later.',
        lede: 'Rotation comes before investigation, always. Deleting the commit does nothing — it is cloned, cached and indexed within seconds of being pushed, and Git history keeps it anyway.',
        signs: [
            'Secret scanning alert on a repository, a paste site or a public bucket.',
            'A cloud provider notification of an exposed key.',
            'Unexpected billing spikes, especially compute in unfamiliar regions.',
        ],
        sections: [
            {
                h: 'Do this now',
                kind: 'first',
                steps: [
                    '**Revoke and rotate the secret immediately.** Do not wait to determine whether it was used.',
                    'Do not merely delete the commit or the file. Assume it was captured; the exposure window is what matters, not the current state.',
                    'Review usage logs for the credential across the whole exposure window.',
                    'Check for resources created with it — compute instances, users, roles, access keys, persistence.',
                    'Check for any additional identities or keys created by the exposed one.',
                ],
            },
            {
                h: 'Then',
                kind: 'do',
                steps: [
                    'Scan the rest of the repository, and the organisation, for other secrets.',
                    'Search Git history, not just the current tree.',
                    'Determine how it got there and whether the same pattern exists elsewhere — a hardcoded secret is rarely unique.',
                    'Move the secret into a managed secret store and replace it with a short-lived or workload identity if possible.',
                    'Add pre-commit and CI secret scanning so the next one is caught before push, not after.',
                ],
            },
        ],
        queries: [
            { label: 'AWS — activity for an exposed key', lang: 'Athena / CloudTrail', q: 'SELECT eventtime, eventname, sourceipaddress, useragent, errorcode\nFROM cloudtrail_logs\nWHERE useridentity.accesskeyid = \'<AKIA...>\'\n  AND eventtime > \'<exposure start>\'\nORDER BY eventtime;' },
        ],
        terms: ['eradication', 'ioc', 'blast-radius'],
        defend: ['org-readiness'],
        plays: ['pro-infostealer'],
        keys: 'secret leaked in git exposed api key aws key committed secret scanning alert rotate credentials hardcoded secret public repo',
    },

    {
        id: 'pro-comms',
        aud: 'pro',
        cat: 'process',
        title: 'Who has to be told, and when',
        glyph: '📢',
        urgency: 'high',
        clock: 'Regulatory clocks start at awareness, not at conclusion. Note the moment you became aware, in writing.',
        lede: 'Communication is where technically well-run incidents become organisational disasters. The rule is: say early what you know, say plainly what you do not, and never say "no data was affected" before you can prove it.',
        signs: ['Any incident with personal data, customer impact, regulatory scope, or public visibility.'],
        sections: [
            {
                h: 'Get these right first',
                kind: 'first',
                steps: [
                    '**Record the moment of awareness.** Regulatory deadlines run from it, and reconstructing it later looks evasive.',
                    'Move to the out-of-band channel. Assume the adversary reads email and chat until proven otherwise.',
                    'Name a single incident lead and a single spokesperson. Everyone else routes through them.',
                    'Engage legal counsel early where privilege applies to investigation material.',
                    'Notify insurers within their required window — often 24 to 72 hours, and often a condition of cover.',
                ],
            },
            {
                h: 'Who, typically',
                kind: 'do',
                steps: [
                    '**Executive leadership** — early, briefly, with what you know, what you do not, and what you need authority for.',
                    '**Data protection regulator** — within the statutory window (72 hours under GDPR for a notifiable personal-data breach). Late-and-complete is worse than on-time-and-partial.',
                    '**Affected individuals** — where there is high risk to their rights and freedoms, in plain language, with something specific they can actually do.',
                    '**Customers and partners** — especially where their credentials, data or payments are implicated.',
                    '**Sector regulators** — finance, health, critical infrastructure and telecoms typically have their own, shorter clocks.',
                    '**Law enforcement** — early engagement is usually helpful and rarely obstructive.',
                    '**Staff** — before they read it elsewhere. Tell them what to say if asked, and what not to.',
                ],
            },
            {
                h: 'Do not',
                kind: 'dont',
                steps: [
                    'Do not say "no evidence of data exfiltration" when you mean "we have not looked yet". That sentence is what gets quoted back at you.',
                    'Do not speculate on attribution, or use an adversary name you cannot substantiate.',
                    'Do not delay notification to make the message more complete. Update it instead.',
                    'Do not let the technical team write the customer communication unedited, or the communications team write the regulator notification unadvised.',
                ],
            },
        ],
        terms: ['chain-of-custody', 'dwell-time', 'containment'],
        defend: ['org-readiness'],
        plays: ['pro-ransomware', 'pro-payment-fraud'],
        keys: 'incident communications gdpr 72 hours notification regulator breach notification who to tell insurer legal privilege comms plan',
    },
];
