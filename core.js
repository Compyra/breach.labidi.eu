/* ==========================================================================
   Breachlight — core.js
   --------------------------------------------------------------------------
   The primitives every other file uses: DOM building, the tiny markup parser,
   local storage, the audience switch and the shared components.

   Exposes window.BLC. Loads before pages.js and app.js.

   House rule, enforced everywhere downstream: the DOM is built with
   createElement and textContent only. There is no innerHTML in this project
   and there must not be one — authored copy goes through rich(), which
   understands **bold** and `code` and nothing else.
   ========================================================================== */

(function () {
    'use strict';

    /* ------------------------------------------------------------ tiny DOM */

    function el(tag, attrs, kids) {
        const n = document.createElement(tag);
        if (attrs) {
            for (const k in attrs) {
                const v = attrs[k];
                if (v === null || v === undefined || v === false) continue;
                if (k === 'text') n.textContent = v;
                else if (k === 'class') n.className = v;
                else if (k.slice(0, 2) === 'on') n[k.toLowerCase()] = v;
                else n.setAttribute(k, v === true ? '' : v);
            }
        }
        if (kids !== undefined && kids !== null) append(n, kids);
        return n;
    }

    function append(parent, kids) {
        if (Array.isArray(kids)) { kids.forEach(k => append(parent, k)); return; }
        if (kids === null || kids === undefined || kids === false) return;
        parent.appendChild(typeof kids === 'string' ? document.createTextNode(kids) : kids);
    }

    /** Minimal inline formatting for authored copy: **bold** and `code`. */
    function rich(text) {
        const frag = document.createDocumentFragment();
        const re = /\*\*([^*]+)\*\*|`([^`]+)`/g;
        let last = 0, m;
        while ((m = re.exec(text)) !== null) {
            if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
            frag.appendChild(m[1] ? el('b', { text: m[1] }) : el('code', { text: m[2] }));
            last = re.lastIndex;
        }
        if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
        return frag;
    }

    /** Plain text of an authored string, for the search index. */
    function plain(text) {
        return String(text).replace(/\*\*|`/g, '');
    }

    const $ = s => document.querySelector(s);

    /* -------------------------------------------------------------- storage */

    const store = {
        get(k, fb) {
            try {
                const v = localStorage.getItem('bl.' + k);
                if (v === null) return fb;
                const parsed = JSON.parse(v);
                if (parsed === null && fb !== null) return fb;
                if (Array.isArray(fb) !== Array.isArray(parsed)) return fb;
                if (typeof parsed !== typeof fb) return fb;
                return parsed;
            } catch (e) { return fb; }
        },
        set(k, v) {
            try { localStorage.setItem('bl.' + k, JSON.stringify(v)); } catch (e) { /* private mode */ }
        },
    };

    let toastTimer = null;
    function toast(msg) {
        const t = $('#toast');
        if (!t) return;
        t.textContent = msg;
        t.classList.add('on');
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
    }

    function copyToClipboard(text, okMsg) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).then(
                () => toast(okMsg || 'Copied'),
                () => toast('Could not copy — select it manually'));
        } else toast('Select it manually');
    }

    /* ------------------------------------------------------------- audience */

    let AUD = store.get('aud', 'user');
    if (AUD !== 'pro') AUD = 'user';

    function applyAud() {
        document.documentElement.dataset.aud = AUD;
        document.querySelectorAll('[data-aud-set]').forEach(b => {
            b.setAttribute('aria-pressed', String(b.dataset.audSet === AUD));
        });
    }

    function setAud(next) {
        if (next === AUD) return;
        AUD = next;
        store.set('aud', AUD);
        applyAud();
        if (typeof BLC.onAudChange === 'function') BLC.onAudChange();
        toast(AUD === 'pro' ? 'Responder mode' : 'Personal mode');
    }

    const getAud = () => AUD;

    /** Does this content item belong in the current mode? */
    const forAud = it => !it.aud || it.aud === 'both' || it.aud === AUD;

    /* ----------------------------------------------------------------- rail */

    const PAGES = [
        { id: '', label: 'Start', href: '#/' },
        { id: 'triage', label: 'Triage', href: '#/triage' },
        { id: 'signs', label: 'Symptoms', href: '#/signs' },
        { id: 'plays', label: 'Playbooks', href: '#/plays' },
        { id: 'terms', label: 'Glossary', href: '#/terms' },
        { id: 'defend', label: 'Defence bench', href: '#/defend' },
        { id: 'about', label: 'About', href: '#/about' },
    ];

    function buildRail() {
        const rail = $('#rail');
        if (!rail) return;
        rail.textContent = '';
        PAGES.forEach(p => rail.appendChild(el('a', { href: p.href, 'data-page': p.id, text: p.label })));
        /* The log reader is a responder tool; showing it in personal mode would
           only be noise for someone who is frightened and in a hurry. */
        if (AUD === 'pro') {
            rail.appendChild(el('a', {
                href: 'logscope/', class: 'rail-tool', 'data-page': 'logscope',
                title: 'Read exported Entra and Purview logs, offline, in this browser',
            }, '🔬 Logscope'));
        }
    }

    function markRail(id) {
        document.querySelectorAll('#rail a').forEach(a => {
            if (a.dataset.page === id) a.setAttribute('aria-current', 'page');
            else a.removeAttribute('aria-current');
        });
    }

    /* ----------------------------------------------------------- components */

    const URGENCY_TAG = {
        critical: 'critical', high: 'high', medium: 'medium',
        normal: 'ok', ok: 'ok', info: 'info',
    };
    const URGENCY_LABEL = {
        critical: 'act now', high: 'today', medium: 'worth checking',
        normal: 'no rush', ok: 'no rush', info: 'context',
    };

    function tag(text, cls) {
        return el('span', { class: 'tag ' + (cls || ''), text: text });
    }

    function sevTag(sev) {
        if (!sev) return null;
        return tag(URGENCY_LABEL[sev] || sev, URGENCY_TAG[sev] || '');
    }

    function sectionHead(title, sub) {
        const h = el('div', { class: 'sec-head' }, el('h2', { text: title }));
        if (sub) h.appendChild(el('p', { class: 'muted', text: sub }));
        return h;
    }

    function pageHead(eyebrow, title, glyph, lede) {
        const head = el('div', { class: 'page-head' });
        if (eyebrow) head.appendChild(el('p', { class: 'eyebrow', text: eyebrow }));
        const h1 = el('h1');
        if (glyph) h1.appendChild(el('span', { class: 'g', 'aria-hidden': 'true', text: glyph }));
        h1.appendChild(document.createTextNode(title));
        head.appendChild(h1);
        if (lede) head.appendChild(el('p', { class: 'lede' }, rich(lede)));
        return head;
    }

    function linkCard(href, glyph, title, blurb, tags, urgent) {
        const a = el('a', { class: 'card' + (urgent ? ' urgent' : ''), href: href });
        a.appendChild(el('h3', null, [
            el('span', { class: 'g', 'aria-hidden': 'true', text: glyph }),
            document.createTextNode(title),
        ]));
        if (blurb) a.appendChild(el('p', null, rich(blurb)));
        if (tags && tags.length) {
            const m = el('div', { class: 'meta' });
            tags.forEach(t => t && m.appendChild(t));
            a.appendChild(m);
        }
        return a;
    }

    /** A labelled, copyable code block. Used for queries and exported reports. */
    function codeBlock(label, lang, text) {
        const wrap = el('div', { class: 'query' });
        wrap.appendChild(el('div', { class: 'query-label' }, [
            el('span', { text: label + (lang ? ' · ' + lang : '') }),
            el('button', {
                type: 'button', class: 'copy-btn',
                onclick: () => copyToClipboard(text, 'Copied'),
            }, 'copy'),
        ]));
        wrap.appendChild(el('pre', null, el('code', { text: text })));
        return wrap;
    }

    const BLC = {
        el, append, rich, plain, $, store, toast, copyToClipboard,
        getAud, setAud, applyAud, forAud,
        PAGES, buildRail, markRail,
        URGENCY_TAG, URGENCY_LABEL, tag, sevTag, sectionHead, pageHead, linkCard, codeBlock,
        onAudChange: null,
    };

    window.BLC = BLC;
})();
